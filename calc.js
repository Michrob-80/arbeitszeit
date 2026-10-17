// =====================================================================
// calc.js – reine Berechnungslogik der Arbeitszeit-App
// Keine Abhängigkeit von Browser/DOM. Läuft im Browser und in Node (Tests).
//
// Grundregeln (siehe README, Abschnitt "Rechenregeln"):
//  * Alle Zeiten sind lokale Zeiten des Geräts (Deutschland, Europa/Berlin).
//  * Alle Dauern werden intern in ganzen MINUTEN gerechnet.
//  * Eine Schicht wird an jeder Mitternacht in Tagesabschnitte zerlegt.
//    Jeder Tagesabschnitt gehört genau zu EINEM Kalendertag -> nichts wird doppelt gezählt.
//  * Hauptkategorie der Gesamtstunden = Wochentag (Mo–Fr | Sa | So).
//    "Feiertag" ist nur ein zusätzliches Merkmal (Teilmenge), es addiert nichts zur Gesamtzeit.
// =====================================================================

export const DEFAULT_SETTINGS = {
  sollHours: [8, 8, 8, 8, 8, 0, 0], // Mo..So (Stunden pro Tag)
  holidayMode: 'reduce',            // 'reduce' = Feiertag senkt das Soll | 'credit' = Soll bleibt, Gutschrift wird getrennt ausgewiesen
  creditVacation: true,             // Urlaub an Regelarbeitstagen anrechnen
  creditSick: true,                 // Krankheit an Regelarbeitstagen anrechnen
  extraFreeDays: [],                // [{id, date:'YYYY-MM-DD', name}] zusätzliche freie Tage (Soll 0), z.B. Rosenmontag
  accountStart: null,               // 'YYYY-MM' ab diesem Monat läuft das Arbeitszeitkonto
  startBalanceMin: 0,               // Startsaldo des Kontos in Minuten
  hourlyWageCents: 0,               // Stundenlohn (brutto) in Cent, z. B. 2068 = 20,68 €; 0 = Vergütungsrechnung aus
  surchargeSaPct: 25,               // Zuschlag Samstag in %
  surchargeSoPct: 50,               // Zuschlag Sonntag in %
  surchargeHolPct: 50,              // Zuschlag gesetzlicher Feiertag in %
  monthlyGrossCents: 0,             // Monatsgehalt brutto in Cent (0 = Brutto/Netto-Rechnung aus)
  overtimePayout: true,             // positiver Monatssaldo wird mit dem Stundenlohn ausgezahlt (Überstundengrundvergütung)
  taxClass: 3,                      // derzeit nur Steuerklasse III unterstützt
  zkf: 2,                           // Zähler Kinderfreibeträge
  pvKinder: 2,                      // Kinder unter 25 für den Pflegeversicherungs-Abschlag
  kvZusatzPct: 2.9,                 // Zusatzbeitrag der Krankenkasse in % (Durchschnitt 2026: 2,9)
  churchTax: false,                 // Kirchensteuer
  churchRatePct: 9,                 // Kirchensteuersatz (NRW 9 %)
};

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// ---------------------------------------------------------------- Datum
const pad = (n) => String(n).padStart(2, '0');

export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) throw new Error('Ungültiges Datum: ' + s);
  return { y: +m[1], m: +m[2], d: +m[3] };
}
function fromUTC(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export function addDays(s, n) {
  const { y, m, d } = parseYmd(s);
  return fromUTC(new Date(Date.UTC(y, m - 1, d + n)));
}
/** 0 = Montag … 6 = Sonntag */
export function weekdayIdx(s) {
  const { y, m, d } = parseYmd(s);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function ymOf(dateStr) { return dateStr.slice(0, 7); }
export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` };
}
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export function compareDates(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function weekStart(dateStr) { return addDays(dateStr, -weekdayIdx(dateStr)); }

/** ISO-Kalenderwoche {year, week} */
export function isoWeek(dateStr) {
  const { y, m, d } = parseYmd(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3); // Donnerstag der Woche
  const isoYear = dt.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return { year: isoYear, week };
}

export function fmtDateDE(s, withWeekday = false) {
  const { y, m, d } = parseYmd(s);
  const base = `${pad(d)}.${pad(m)}.${y}`;
  return withWeekday ? `${WEEKDAYS_SHORT[weekdayIdx(s)]}, ${base}` : base;
}
export function fmtDateShortDE(s) {
  const { m, d } = parseYmd(s);
  return `${pad(d)}.${pad(m)}.`;
}
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_DE[m - 1]} ${y}`;
}

// ------------------------------------------------------------ Formatierung
/** Minuten -> "h:mm" (optional mit Vorzeichen) */
export function fmtHM(min, { sign = false } = {}) {
  const neg = min < 0;
  const a = Math.abs(Math.round(min));
  const s = `${Math.floor(a / 60)}:${pad(a % 60)}`;
  if (neg) return '−' + s;
  return sign && a > 0 ? '+' + s : s;
}
/** Minuten -> Dezimalstunden mit deutschem Komma, z.B. 8,5 */
export function fmtDecimal(min, digits = 2) {
  return (min / 60).toFixed(digits).replace('.', ',');
}
/** "8:30" | "8,5" | "8.5" | "-1:15" -> Minuten (oder null) */
export function parseHoursToMin(text) {
  if (text == null) return null;
  let t = String(text).trim().replace('−', '-').replace(/\s/g, '');
  if (t === '') return null;
  let neg = false;
  if (t.startsWith('-')) { neg = true; t = t.slice(1); } else if (t.startsWith('+')) { t = t.slice(1); }
  let min;
  if (t.includes(':')) {
    const m = /^(\d+):(\d{1,2})$/.exec(t);
    if (!m || +m[2] > 59) return null;
    min = +m[1] * 60 + +m[2];
  } else {
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    min = Math.round(n * 60);
  }
  return neg ? -min : min;
}

// ------------------------------------------------------------ Geld
/** Zuschlag in Cent: Minuten/60 × Stundenlohn × Prozent/100, kaufmännisch auf ganze Cent gerundet. */
export function calcCents(minutes, wageCents, pct) {
  return Math.round((minutes * wageCents * pct) / 6000 + 1e-9);
}
export function fmtEUR(cents) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
export function fmtPct(p) { return String(p).replace('.', ',') + ' %'; }

// -------------------------------------------------------- Feiertage (NRW)
/** Ostersonntag (Gregorianischer Kalender, Meeus/Jones/Butcher) */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const holidayCache = new Map();
/** Gesetzliche Feiertage Nordrhein-Westfalen: { 'YYYY-MM-DD': 'Name' } */
export function holidaysNRW(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const e = easterSunday(year);
  const h = {
    [`${year}-01-01`]: 'Neujahr',
    [addDays(e, -2)]: 'Karfreitag',
    [addDays(e, 1)]: 'Ostermontag',
    [`${year}-05-01`]: 'Tag der Arbeit',
    [addDays(e, 39)]: 'Christi Himmelfahrt',
    [addDays(e, 50)]: 'Pfingstmontag',
    [addDays(e, 60)]: 'Fronleichnam',
    [`${year}-10-03`]: 'Tag der Deutschen Einheit',
    [`${year}-11-01`]: 'Allerheiligen',
    [`${year}-12-25`]: '1. Weihnachtstag',
    [`${year}-12-26`]: '2. Weihnachtstag',
  };
  holidayCache.set(year, h);
  return h;
}
export function holidayName(dateStr) {
  return holidaysNRW(parseYmd(dateStr).y)[dateStr] || null;
}

// ------------------------------------------------- Zeitstempel & Zerlegung
/** 'YYYY-MM-DDTHH:MM' (lokal) -> Date */
export function parseLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str || '');
  if (!m) throw new Error('Ungültiger Zeitpunkt: ' + str);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
}
export function localYmd(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function localHM(dt) { return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; }
export function toLocalInput(dt) { return `${localYmd(dt)}T${localHM(dt)}`; }

/**
 * Zerlegt [start, end) an jeder lokalen Mitternacht.
 * Die Minuten sind tatsächlich vergangene Zeit (Zeitumstellung wird dadurch korrekt berücksichtigt).
 * @returns {{date:string, minutes:number}[]}
 */
export function splitByDay(startDt, endDt) {
  const segs = [];
  if (!(endDt > startDt)) return segs;
  let cur = startDt;
  while (cur < endDt) {
    const nextMidnight = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0, 0, 0);
    const to = nextMidnight < endDt ? nextMidnight : endDt;
    const minutes = Math.round((to - cur) / 60000);
    if (minutes > 0) segs.push({ date: localYmd(cur), minutes });
    cur = to;
  }
  return segs;
}

/**
 * Wendet die unbezahlte Pause auf die Tagesabschnitte an.
 * Regel: Die Pause wird dem Tag des Schichtbeginns zugerechnet (reicht der erste Abschnitt nicht aus, läuft der Rest in den nächsten).
 */
export function applyPause(segs, pauseMin) {
  let rest = Math.max(0, Math.round(pauseMin || 0));
  const out = segs.map((s) => ({ ...s }));
  for (const s of out) {
    const d = Math.min(s.minutes, rest);
    s.minutes -= d;
    rest -= d;
  }
  return { segs: out.filter((s) => s.minutes > 0), pauseTooLong: rest > 0 };
}

/**
 * Bereinigt Einträge: gelöschte entfernen, ungültige verwerfen, Überschneidungen kürzen,
 * damit KEINE Stunde doppelt gezählt werden kann.
 */
export function normalizeEntries(entries) {
  const warnings = [];
  const items = [];
  for (const e of entries || []) {
    if (!e || e.deleted) continue;
    let s, en;
    try { s = parseLocal(e.start); en = parseLocal(e.end); } catch { warnings.push({ type: 'invalid', entryId: e.id, text: 'Eintrag mit ungültiger Zeit wurde ignoriert.' }); continue; }
    if (!(en > s)) { warnings.push({ type: 'invalid', entryId: e.id, text: `Ende liegt nicht nach dem Beginn (${e.start}).` }); continue; }
    items.push({ entry: e, s, e: en });
  }
  items.sort((a, b) => a.s - b.s || a.e - b.e);
  const out = [];
  let lastEnd = null;
  for (const it of items) {
    let s = it.s;
    if (lastEnd && s < lastEnd) {
      if (it.e <= lastEnd) {
        warnings.push({ type: 'overlap', entryId: it.entry.id, text: `Eintrag ${it.entry.start} überschneidet sich vollständig mit einem anderen Eintrag und wird nicht doppelt gezählt.` });
        continue;
      }
      warnings.push({ type: 'overlap', entryId: it.entry.id, text: `Eintrag ${it.entry.start} überschneidet sich mit einem anderen Eintrag; der überlappende Teil wird nur einmal gezählt.` });
      s = lastEnd;
    }
    out.push({ entry: it.entry, s, e: it.e });
    lastEnd = lastEnd && lastEnd > it.e ? lastEnd : it.e;
  }
  return { items: out, warnings };
}

/** Tagesabschnitte aller Einträge: Map date -> [{entryId, minutes}] */
export function allocateEntries(entries) {
  const { items, warnings } = normalizeEntries(entries);
  const byDay = new Map();
  for (const it of items) {
    const raw = splitByDay(it.s, it.e);
    const { segs, pauseTooLong } = applyPause(raw, it.entry.pauseMin);
    if (pauseTooLong) warnings.push({ type: 'pause', entryId: it.entry.id, text: `Pause ist länger als die Schicht (${it.entry.start}).` });
    for (const sg of segs) {
      if (!byDay.has(sg.date)) byDay.set(sg.date, []);
      byDay.get(sg.date).push({ entryId: it.entry.id, minutes: sg.minutes });
    }
  }
  return { byDay, warnings };
}

// --------------------------------------------------------------- Auswertung
function mergeSettings(s) {
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

function absenceForDay(absences, date) {
  const hits = (absences || []).filter((a) => !a.deleted && a.from <= date && date <= a.to);
  return hits;
}

/**
 * Berechnet alle Tageswerte und Summen für den Zeitraum from..to (inklusive).
 * Das ist die einzige Stelle, an der Soll/Ist/Saldo entstehen.
 */
export function computeRange(data, from, to) {
  const settings = mergeSettings(data && data.settings);
  const { byDay, warnings } = allocateEntries(data && data.entries);
  const extraFree = new Map((settings.extraFreeDays || []).map((d) => [d.date, d.name || 'Freier Tag']));
  const days = [];

  for (let date = from; compareDates(date, to) <= 0; date = addDays(date, 1)) {
    const wd = weekdayIdx(date);
    const holName = holidayName(date);
    const extraName = extraFree.get(date) || null;
    const isFree = !!holName || !!extraName;
    const sollBaseMin = Math.round((settings.sollHours[wd] || 0) * 60);

    let sollMin = sollBaseMin;
    let reductionMin = 0;      // Soll-Reduktion durch Feiertag (Modell "reduce")
    let holidayCreditMin = 0;  // Feiertags-Gutschrift (Modell "credit")
    if (isFree && sollBaseMin > 0) {
      if (settings.holidayMode === 'credit') holidayCreditMin = sollBaseMin;
      else { sollMin = 0; reductionMin = sollBaseMin; }
    }

    const parts = byDay.get(date) || [];
    const workMin = parts.reduce((a, p) => a + p.minutes, 0);

    // Abwesenheit
    const abs = absenceForDay(data && data.absences, date);
    const absence = abs[0] || null;
    let absenceCreditMin = 0;
    let absenceNote = null;
    if (absence) {
      const credited = (absence.type === 'urlaub' && settings.creditVacation) || (absence.type === 'krank' && settings.creditSick);
      if (!credited) absenceNote = absence.type === 'frei' ? 'ohne Anrechnung' : 'laut Einstellung nicht angerechnet';
      else if (isFree) absenceNote = 'Feiertag/freier Tag: keine zusätzliche Anrechnung';
      else if (sollBaseMin === 0) absenceNote = 'kein Arbeitstag: keine Anrechnung';
      else {
        absenceCreditMin = absence.hours != null && absence.hours !== '' ? Math.round(Number(absence.hours) * 60) : sollBaseMin;
      }
    }
    const anrechenbarMin = workMin + absenceCreditMin + holidayCreditMin;

    // Zuschläge: pro Stunde gilt nur EIN Zuschlag. Fällt eine Stunde auf Sa/So UND einen gesetzlichen
    // Feiertag, gilt der höhere Prozentsatz (kein Aufaddieren). Gilt für alle Stunden des Kalendertags.
    let surchargeBucket = null;
    let surchargePct = 0;
    let surchargeFreeLimitPct = 0; // bis zu diesem Satz steuer- und SV-frei (§ 3b EStG): Sonntag 50 %, Feiertag 125 % (150 % am 1.5., 25.12., 26.12.)
    if (workMin > 0) {
      const base = wd === 5 ? settings.surchargeSaPct : wd === 6 ? settings.surchargeSoPct : 0;
      if (holName) { surchargeBucket = 'holiday'; surchargePct = Math.max(base || 0, settings.surchargeHolPct || 0); surchargeFreeLimitPct = ['05-01', '12-25', '12-26'].includes(date.slice(5)) ? 150 : 125; }
      else if (wd === 5) { surchargeBucket = 'sa'; surchargePct = base || 0; surchargeFreeLimitPct = 0; }
      else if (wd === 6) { surchargeBucket = 'so'; surchargePct = base || 0; surchargeFreeLimitPct = 50; }
    }

    days.push({
      date, weekday: wd,
      isHoliday: !!holName, holidayName: holName,
      isExtraFree: !!extraName, extraFreeName: extraName,
      isWeekend: wd >= 5,
      sollBaseMin, sollMin, reductionMin,
      parts, workMin,
      absence, absenceCreditMin, absenceNote, absenceCount: abs.length,
      holidayCreditMin,
      anrechenbarMin,
      surchargeBucket, surchargePct, surchargeFreeLimitPct,
      saldoMin: anrechenbarMin - sollMin,
    });
  }

  const sum = (f) => days.reduce((a, d) => a + f(d), 0);
  const totals = {
    workTotalMin: sum((d) => d.workMin),
    workMoFrMin: sum((d) => (d.weekday < 5 ? d.workMin : 0)),
    workSaMin: sum((d) => (d.weekday === 5 ? d.workMin : 0)),
    workSoMin: sum((d) => (d.weekday === 6 ? d.workMin : 0)),
    // Merkmal "gesetzlicher Feiertag" – Teilmenge der Gesamtstunden, NICHT addieren
    workHolidayMin: sum((d) => (d.isHoliday ? d.workMin : 0)),
    workHolidayMoFrMin: sum((d) => (d.isHoliday && d.weekday < 5 ? d.workMin : 0)),
    workHolidaySaMin: sum((d) => (d.isHoliday && d.weekday === 5 ? d.workMin : 0)),
    workHolidaySoMin: sum((d) => (d.isHoliday && d.weekday === 6 ? d.workMin : 0)),
    workExtraFreeMin: sum((d) => (d.isExtraFree && !d.isHoliday ? d.workMin : 0)),
    sollBaseMin: sum((d) => d.sollBaseMin),
    reductionMin: sum((d) => d.reductionMin),
    sollMin: sum((d) => d.sollMin),
    creditVacationMin: sum((d) => (d.absence && d.absence.type === 'urlaub' ? d.absenceCreditMin : 0)),
    creditSickMin: sum((d) => (d.absence && d.absence.type === 'krank' ? d.absenceCreditMin : 0)),
    creditHolidayMin: sum((d) => d.holidayCreditMin),
    anrechenbarMin: sum((d) => d.anrechenbarMin),
    saldoMin: 0,
  };
  totals.saldoMin = totals.anrechenbarMin - totals.sollMin;

  // Vergütung (nur Schätzung): Zuschläge je Kategorie + Grundvergütung positiver Überstunden
  const wage = settings.hourlyWageCents || 0;
  const bucketOf = (b, pctLabel) => {
    // Minuten je (Satz, steuerfreie Obergrenze) bündeln, dann je Gruppe auf ganze Cent runden (wie auf der Lohnabrechnung je Zeile)
    const groups = new Map();
    for (const d of days) {
      if (d.surchargeBucket !== b) continue;
      const key = `${d.surchargePct}|${d.surchargeFreeLimitPct}`;
      groups.set(key, (groups.get(key) || 0) + d.workMin);
    }
    let min = 0, cents = 0, freeCents = 0;
    for (const [key, m] of groups) {
      const [pct, limit] = key.split('|').map(Number);
      min += m;
      if (wage > 0) {
        cents += calcCents(m, wage, pct);
        freeCents += calcCents(m, wage, Math.min(pct, limit));
      }
    }
    return { min, cents, freeCents, taxableCents: cents - freeCents, pct: pctLabel };
  };
  totals.bonus = {
    enabled: wage > 0,
    wageCents: wage,
    sa: bucketOf('sa', settings.surchargeSaPct),
    so: bucketOf('so', settings.surchargeSoPct),
    holiday: bucketOf('holiday', settings.surchargeHolPct),
    surchargeTotalCents: 0, freeCents: 0, taxableCents: 0,
    overtimeCents: wage > 0 && totals.saldoMin > 0 ? calcCents(totals.saldoMin, wage, 100) : 0,
  };
  const bo = totals.bonus;
  bo.surchargeTotalCents = bo.sa.cents + bo.so.cents + bo.holiday.cents;
  bo.freeCents = bo.sa.freeCents + bo.so.freeCents + bo.holiday.freeCents;
  bo.taxableCents = bo.surchargeTotalCents - bo.freeCents;

  // Selbstprüfung: Hauptkategorien müssen die Gesamtzeit exakt ergeben (keine Doppelzählung)
  if (totals.workMoFrMin + totals.workSaMin + totals.workSoMin !== totals.workTotalMin) {
    throw new Error('Interner Fehler: Stundensummen stimmen nicht überein.');
  }

  const dayWarnings = [];
  for (const d of days) {
    if (d.absence && d.workMin > 0) dayWarnings.push({ type: 'absence-work', date: d.date, text: `${fmtDateShortDE(d.date)}: Abwesenheit und Arbeitszeit am selben Tag – bitte prüfen (ggf. Anrechnung in Stunden anpassen).` });
    if (d.absenceCount > 1) dayWarnings.push({ type: 'absence-multi', date: d.date, text: `${fmtDateShortDE(d.date)}: mehrere Abwesenheiten am selben Tag – nur die erste wird verwendet.` });
  }
  return { from, to, days, totals, warnings: [...warnings, ...dayWarnings], settings };
}

export function computeMonth(data, ym) {
  const { from, to } = monthBounds(ym);
  const r = computeRange(data, from, to);
  r.ym = ym;
  return r;
}

export function computeWeek(data, anyDateInWeek) {
  const from = weekStart(anyDateInWeek);
  return computeRange(data, from, addDays(from, 6));
}

/** Gruppiert die Tage eines Zeitraums nach ISO-Wochen (nur Tage innerhalb des Zeitraums). */
export function groupByWeek(days) {
  const map = new Map();
  for (const d of days) {
    const w = isoWeek(d.date);
    const key = `${w.year}-W${w.week}`;
    if (!map.has(key)) map.set(key, { key, year: w.year, week: w.week, from: d.date, to: d.date, sollMin: 0, workMin: 0, anrechenbarMin: 0, saldoMin: 0, reductionMin: 0, sollBaseMin: 0 });
    const g = map.get(key);
    g.to = d.date;
    g.sollMin += d.sollMin; g.workMin += d.workMin; g.anrechenbarMin += d.anrechenbarMin;
    g.saldoMin += d.saldoMin; g.reductionMin += d.reductionMin; g.sollBaseMin += d.sollBaseMin;
  }
  return [...map.values()];
}

/** Textliche Herleitung der Sollzeit (transparent anzeigen, wie das Soll zustande kommt). */
export function explainSoll(range) {
  const s = range.settings;
  const lines = [];
  const counts = new Array(7).fill(0);
  for (const d of range.days) counts[d.weekday]++;
  for (let wd = 0; wd < 7; wd++) {
    const h = s.sollHours[wd] || 0;
    if (h > 0 && counts[wd] > 0) {
      lines.push({ kind: 'base', text: `${counts[wd]} × ${WEEKDAYS_LONG[wd]} à ${fmtHM(h * 60)} h`, min: counts[wd] * Math.round(h * 60) });
    }
  }
  const baseTotal = range.totals.sollBaseMin;
  const holidaysWeekday = range.days.filter((d) => (d.isHoliday || d.isExtraFree) && d.sollBaseMin > 0);
  const holidaysWeekend = range.days.filter((d) => d.isHoliday && d.sollBaseMin === 0);
  const workdayCount = range.days.filter((d) => d.sollBaseMin > 0).length;
  const out = {
    workdayCount,
    baseMin: baseTotal,
    lines,
    holidaysOnWorkdays: holidaysWeekday.map((d) => ({ date: d.date, name: d.holidayName || d.extraFreeName, weekday: d.weekday, min: d.sollBaseMin, statutory: d.isHoliday })),
    holidaysOnWeekend: holidaysWeekend.map((d) => ({ date: d.date, name: d.holidayName, weekday: d.weekday })),
    reductionMin: range.totals.reductionMin,
    creditMin: range.totals.creditHolidayMin,
    sollMin: range.totals.sollMin,
    mode: s.holidayMode,
  };
  return out;
}

// ------------------------------------------------------- Arbeitszeitkonto
export function firstEntryMonth(data) {
  const starts = [
    ...((data && data.entries) || []).filter((e) => !e.deleted).map((e) => e.start.slice(0, 7)),
    ...((data && data.absences) || []).filter((a) => !a.deleted).map((a) => a.from.slice(0, 7)),
  ].sort();
  return starts[0] || null;
}

/** Konto-Beginn: eingestellter Monat, sonst Monat des ersten Eintrags, sonst aktueller Monat */
export function accountStartMonth(data, fallbackYm) {
  const s = mergeSettings(data && data.settings);
  return s.accountStart || firstEntryMonth(data) || fallbackYm;
}

/**
 * Monatsweise Kontoentwicklung bis einschließlich uptoYm.
 * Saldo(Monat) = anrechenbare Ist-Zeit − Soll(Monat); Übertrag in den Folgemonat.
 */
export function computeAccount(data, uptoYm) {
  const s = mergeSettings(data && data.settings);
  const start = accountStartMonth(data, uptoYm);
  const rows = [];
  let balance = s.startBalanceMin || 0;
  let ym = start;
  let guard = 0;
  while (ym <= uptoYm && guard++ < 1200) {
    const m = computeMonth(data, ym);
    const carryIn = balance;
    balance += m.totals.saldoMin;
    rows.push({ ym, sollMin: m.totals.sollMin, anrechenbarMin: m.totals.anrechenbarMin, workMin: m.totals.workTotalMin, saldoMin: m.totals.saldoMin, carryInMin: carryIn, carryOutMin: balance });
    ym = addMonths(ym, 1);
  }
  return { startYm: start, startBalanceMin: s.startBalanceMin || 0, rows, balanceMin: balance };
}

/**
 * "Aktueller Stand": Kontostand bis einschließlich heute
 * (abgeschlossene Monate vollständig, laufender Monat nur bis heute – Soll nur bis heute).
 */
export function computeAccountToDate(data, todayYmd) {
  const ym = ymOf(todayYmd);
  const prev = addMonths(ym, -1);
  const s = mergeSettings(data && data.settings);
  const start = accountStartMonth(data, ym);
  let carryIn = s.startBalanceMin || 0;
  if (start < ym) carryIn = computeAccount(data, prev).balanceMin;
  if (start > ym) return { carryInMin: carryIn, partialSaldoMin: 0, balanceMin: carryIn, partial: null };
  const partial = computeRange(data, `${ym}-01`, todayYmd);
  return { carryInMin: carryIn, partialSaldoMin: partial.totals.saldoMin, balanceMin: carryIn + partial.totals.saldoMin, partial };
}

/** Beschreibung der aktuell eingestellten Regeln als Text (zur Dokumentation in der App). */
export function describeRules(settingsIn) {
  const s = mergeSettings(settingsIn);
  const perDay = s.sollHours.map((h, i) => `${WEEKDAYS_SHORT[i]} ${fmtHM(h * 60)} h`).join(', ');
  const weekly = s.sollHours.reduce((a, h) => a + h, 0);
  const rules = [
    `Sollzeit pro Wochentag: ${perDay} (Wochen-Soll ${fmtHM(weekly * 60)} h).`,
    'Das Monats-Soll wird aus den tatsächlichen Kalendertagen des Monats berechnet – nicht pauschal mit 160 Stunden.',
    'Gesetzliche Feiertage Nordrhein-Westfalen: Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Fronleichnam, 3. Oktober, Allerheiligen, 1. und 2. Weihnachtstag.',
    s.holidayMode === 'credit'
      ? 'Feiertage auf Tagen mit Sollzeit: Das Soll bleibt bestehen, der Feiertag wird als eigene Gutschrift (Feiertagsgutschrift) angerechnet. Das Ergebnis ist identisch zum Modell „Soll senken“.'
      : 'Feiertage auf Tagen mit Sollzeit senken das Soll des Tages auf 0 (keine Minusstunden). Feiertage am Wochenende ändern das Soll nicht.',
    `Urlaub wird an Regelarbeitstagen ${s.creditVacation ? 'mit dem Tages-Soll angerechnet' : 'nicht angerechnet'}, Krankheit ${s.creditSick ? 'mit dem Tages-Soll angerechnet' : 'nicht angerechnet'}. Anrechnungen werden getrennt von geleisteter Arbeit ausgewiesen.`,
    'Hauptkategorie der Arbeitsstunden ist der Wochentag (Mo–Fr, Samstag, Sonntag). „Feiertag“ ist ein zusätzliches Merkmal; Feiertagsstunden sind eine Teilmenge und werden nicht doppelt gezählt.',
    'Schichten über Mitternacht werden minutengenau an der Tagesgrenze geteilt. Die Pause wird dem Tag des Schichtbeginns zugerechnet.',
    ...(s.hourlyWageCents > 0 ? [`Zuschläge (Schätzung): Stundenlohn ${fmtEUR(s.hourlyWageCents)}; Samstag ${fmtPct(s.surchargeSaPct)}, Sonntag ${fmtPct(s.surchargeSoPct)}, gesetzl. Feiertag ${fmtPct(s.surchargeHolPct)} auf alle Stunden des jeweiligen Kalendertags. Pro Stunde gilt nur ein Zuschlag – fällt eine Stunde auf Wochenende und Feiertag, zählt der höhere Satz. Beträge werden je Kategorie auf ganze Cent gerundet.`] : []),
    ...(s.monthlyGrossCents > 0 ? ['Brutto → Netto (Schätzung): Monatsgehalt + ggf. Überstunden-Grundvergütung (positiver Monatssaldo × Stundenlohn) + Zuschläge. Sonntags- und Feiertagszuschläge sind bis 50 % bzw. 125 % (150 % am 1. Mai und 25./26. Dezember) steuer- und sozialversicherungsfrei (§ 3b EStG), Samstagszuschläge nicht. Abzüge: Lohnsteuer (Steuerklasse III, Programmablaufplan 2026), Solidaritätszuschlag und Kirchensteuer auf Basis nach Kinderfreibeträgen, Kranken-, Pflege-, Renten- und Arbeitslosenversicherung (Arbeitnehmeranteile, Beitragsbemessungsgrenzen 2026).'] : []),
    'Monats-Saldo = anrechenbare Ist-Zeit − Monats-Soll. Der Saldo wird in den Folgemonat übertragen; Änderungen in der Vergangenheit aktualisieren alle späteren Monate.',
  ];
  return rules;
}
