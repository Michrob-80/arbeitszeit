// =====================================================================
// data.js – Datenmodell, Validierung, Backup-Format und Zusammenführen
// Reine Logik ohne DOM (testbar mit Node).
//
// Datenmodell:
//  {
//    settings: { …Einstellungen…, updatedAt },
//    entries:  [{ id, start:'YYYY-MM-DDTHH:MM', end:'YYYY-MM-DDTHH:MM', pauseMin, note, updatedAt, deleted? }],
//    absences: [{ id, type:'urlaub'|'krank'|'frei', from:'YYYY-MM-DD', to:'YYYY-MM-DD', hours?, note, updatedAt, deleted? }]
//  }
// Gelöschte Datensätze bleiben als "deleted: true" (Tombstone) erhalten,
// damit das Zusammenführen zweier Geräte Löschungen korrekt übernimmt.
// =====================================================================
import { DEFAULT_SETTINGS, parseLocal, parseYmd } from './calc.js';

export const BACKUP_FORMAT = 'arbeitszeit-app';
export const BACKUP_VERSION = 1;
export const ABSENCE_TYPES = { urlaub: 'Urlaub', krank: 'Krank', frei: 'Frei / Überstundenabbau' };

export function emptyData() {
  return { settings: { ...DEFAULT_SETTINGS, updatedAt: 0 }, entries: [], absences: [] };
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const live = (list) => (list || []).filter((x) => !x.deleted);

// ------------------------------------------------------------ Validierung
const MAX_SHIFT_MIN = 24 * 60;

/** Prüft einen Arbeitszeit-Eintrag. Gibt eine Liste von Fehlertexten zurück (leer = ok). */
export function validateEntry(e, allEntries = []) {
  const errors = [];
  let s, en;
  try { s = parseLocal(e.start); } catch { errors.push('Beginn ist ungültig.'); }
  try { en = parseLocal(e.end); } catch { errors.push('Ende ist ungültig.'); }
  if (errors.length) return errors;
  if (!(en > s)) errors.push('Das Ende muss nach dem Beginn liegen.');
  else {
    const dur = Math.round((en - s) / 60000);
    if (dur > MAX_SHIFT_MIN) errors.push('Ein Eintrag darf höchstens 24 Stunden lang sein.');
    const pause = Number(e.pauseMin || 0);
    if (!Number.isFinite(pause) || pause < 0) errors.push('Die Pause muss 0 oder größer sein.');
    else if (pause >= dur) errors.push('Die Pause muss kürzer als die Arbeitszeit sein.');
    for (const o of live(allEntries)) {
      if (o.id === e.id) continue;
      const os = parseLocal(o.start), oe = parseLocal(o.end);
      if (s < oe && os < en) {
        errors.push(`Überschneidet sich mit einem vorhandenen Eintrag (${o.start.replace('T', ' ')} – ${o.end.replace('T', ' ')}).`);
        break;
      }
    }
  }
  return errors;
}

export function validateAbsence(a) {
  const errors = [];
  if (!ABSENCE_TYPES[a.type]) errors.push('Unbekannte Art der Abwesenheit.');
  try { parseYmd(a.from); parseYmd(a.to); } catch { errors.push('Datum ist ungültig.'); return errors; }
  if (a.to < a.from) errors.push('„Bis“ darf nicht vor „Von“ liegen.');
  if (a.hours != null && a.hours !== '') {
    const h = Number(a.hours);
    if (!Number.isFinite(h) || h < 0 || h > 24) errors.push('Anrechnung in Stunden muss zwischen 0 und 24 liegen.');
  }
  return errors;
}

// ----------------------------------------------------------------- Backup
export function toBackup(data, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings: data.settings,
    entries: data.entries,
    absences: data.absences,
  };
}

/** Liest und prüft eine Sicherungsdatei. Gibt {ok:true,data} oder {ok:false,error} zurück. */
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'Die Datei ist keine gültige Sicherung (kein JSON).' }; }
  if (!obj || obj.format !== BACKUP_FORMAT) return { ok: false, error: 'Die Datei stammt nicht aus dieser App.' };
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) return { ok: false, error: 'Die Sicherung stammt aus einer neueren App-Version.' };
  const entries = Array.isArray(obj.entries) ? obj.entries : [];
  const absences = Array.isArray(obj.absences) ? obj.absences : [];
  const bad = [];
  for (const e of entries) {
    if (!e || typeof e.id !== 'string') { bad.push('Eintrag ohne ID'); continue; }
    if (!e.deleted) { try { parseLocal(e.start); parseLocal(e.end); } catch { bad.push(`Eintrag ${e.id} hat ungültige Zeiten`); } }
  }
  for (const a of absences) {
    if (!a || typeof a.id !== 'string') bad.push('Abwesenheit ohne ID');
    else if (!a.deleted) { try { parseYmd(a.from); parseYmd(a.to); } catch { bad.push(`Abwesenheit ${a.id} hat ungültige Daten`); } }
  }
  if (bad.length) return { ok: false, error: 'Die Sicherung enthält fehlerhafte Datensätze: ' + bad.slice(0, 3).join('; ') };
  const settings = { ...DEFAULT_SETTINGS, ...(obj.settings || {}) };
  return { ok: true, data: { settings: { ...settings, updatedAt: settings.updatedAt || 0 }, entries, absences } };
}

// ---------------------------------------------------- Zusammenführen (Sync)
function mergeList(a, b, stats) {
  const map = new Map();
  for (const x of a || []) map.set(x.id, x);
  for (const y of b || []) {
    const x = map.get(y.id);
    if (!x) { map.set(y.id, y); stats.added++; }
    else if ((y.updatedAt || 0) > (x.updatedAt || 0)) { map.set(y.id, y); stats.updated++; }
    else stats.kept++;
  }
  return [...map.values()];
}

/**
 * Führt zwei Datenstände zusammen (z. B. PC + iPhone).
 * Pro Datensatz gewinnt die neuere Änderung (updatedAt); Löschungen werden übernommen.
 * Einstellungen: der Stand mit dem neueren updatedAt gewinnt als Ganzes.
 */
export function mergeData(local, remote) {
  const stats = { added: 0, updated: 0, kept: 0 };
  const entries = mergeList(local.entries, remote.entries, stats);
  const absences = mergeList(local.absences, remote.absences, stats);
  const settings = (remote.settings.updatedAt || 0) > (local.settings.updatedAt || 0) ? remote.settings : local.settings;
  return { data: { settings, entries, absences }, stats };
}
