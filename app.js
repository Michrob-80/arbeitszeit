// =====================================================================
// app.js – Oberfläche der Arbeitszeit-App (ohne Framework, ohne Build-Schritt)
// Berechnungen stehen ausschließlich in calc.js, Datenmodell/Backup in data.js.
// =====================================================================
import {
  computeMonth, computeAccount, computeAccountToDate, explainSoll, groupByWeek, describeRules, holidaysNRW,
  fmtHM, fmtEUR, fmtPct, fmtDateDE, fmtDateShortDE, monthLabel, addMonths, localYmd, localHM, toLocalInput, parseLocal, splitByDay, applyPause,
  weekdayIdx, holidayName, parseHoursToMin, addDays, WEEKDAYS_SHORT, WEEKDAYS_LONG, DEFAULT_SETTINGS, accountStartMonth, ymOf,
} from './calc.js';
import { computeMonthPay } from './payroll.js';
import { emptyData, newId, live, validateEntry, validateAbsence, toBackup, parseBackup, mergeData, ABSENCE_TYPES } from './data.js';

const KEY = 'arbeitszeit-app:v1';
const KEY_RUNNING = 'arbeitszeit-app:v1:running';
const KEY_META = 'arbeitszeit-app:v1:meta';
const KEY_PRE_IMPORT = 'arbeitszeit-app:v1:before-import';

// ------------------------------------------------------------ Speicher
let memoryOnly = false;
const mem = {};
function lsGet(k) { try { return localStorage.getItem(k); } catch { memoryOnly = true; return mem[k] ?? null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { memoryOnly = true; mem[k] = v; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } }

function loadData() {
  const raw = lsGet(KEY);
  if (!raw) return emptyData();
  try {
    const o = JSON.parse(raw);
    return { settings: { ...DEFAULT_SETTINGS, ...(o.settings || {}), updatedAt: (o.settings && o.settings.updatedAt) || 0 }, entries: o.entries || [], absences: o.absences || [] };
  } catch { return emptyData(); }
}
let data = loadData();
const save = () => lsSet(KEY, JSON.stringify(data));
const meta = (() => { try { return JSON.parse(lsGet(KEY_META) || '{}'); } catch { return {}; } })();
const saveMeta = () => lsSet(KEY_META, JSON.stringify(meta));

// ------------------------------------------------------------ Zustand
const todayStr = () => localYmd(new Date());
const state = { tab: 'monat', ym: ymOf(todayStr()) };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = (min) => (min > 0 ? 'pos' : min < 0 ? 'neg' : '');
const now = () => Date.now();

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ------------------------------------------------------------ Rendering
function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#status').textContent = memoryOnly ? 'Speicher blockiert!' : '';
  $('#banner').innerHTML = bannerHtml();
  const v = $('#view');
  v.innerHTML = state.tab === 'monat' ? viewMonat() : state.tab === 'konto' ? viewKonto() : viewEinstellungen();
  const im = $('#iconCheck');
  if (im) { // Diagnose: ist die Symboldatei auf dem Server vorhanden?
    const ok = () => { const s = $('#iconStatus'); if (s) s.textContent = 'App-Symbol-Datei gefunden ✓'; };
    const bad = () => { const s = $('#iconStatus'); if (s) s.textContent = 'App-Symbol-Datei NICHT gefunden ✗ – Datei apple-touch-icon.png fehlt auf dem Server'; im.style.display = 'none'; };
    if (im.complete) { im.naturalWidth ? ok() : bad(); } else { im.onload = ok; im.onerror = bad; }
  }
}

function bannerHtml() {
  const out = [];
  if (memoryOnly) out.push('<div class="banner"><b>Achtung:</b> Der Browser erlaubt kein dauerhaftes Speichern (z. B. privater Modus). Eingaben gehen beim Schließen verloren. Bitte normal öffnen.</div>');
  const hasData = live(data.entries).length + live(data.absences).length > 0;
  if (hasData) {
    const last = meta.lastBackup ? new Date(meta.lastBackup) : null;
    const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
    if (days === null || days > 30) {
      out.push(`<div class="banner">${days === null ? 'Noch keine Sicherung erstellt.' : `Letzte Sicherung vor ${days} Tagen.`} <button data-act="backup">Jetzt sichern</button></div>`);
    }
  }
  return out.join('');
}

function kpi(label, value, sub = '', extra = '', c = '') {
  return `<div class="kpi ${extra}"><div class="l">${label}</div><div class="v ${c}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
}

function viewMonat() {
  const m = computeMonth(data, state.ym);
  const t = m.totals;
  const acc = computeAccount(data, state.ym);
  const accRow = acc.rows.find((r) => r.ym === state.ym);
  const inAccount = !!accRow;
  const running = lsGet(KEY_RUNNING);
  const x = explainSoll(m);
  const today = todayStr();
  const toDate = state.ym === ymOf(today) ? computeAccountToDate(data, today) : null;

  const stamp = running
    ? `<div class="card running"><div class="row spread"><div><b>Läuft seit ${esc(running.slice(11))}</b><div class="muted small">${esc(fmtDateDE(running.slice(0, 10), true))}</div></div><button data-act="stampOut">Ausstempeln</button></div></div>`
    : `<div class="row" style="margin-bottom:12px"><button class="primary" style="flex:1" data-act="stampIn">Einstempeln</button><button style="flex:1" data-act="addEntry" data-date="${todayStr()}">Eintrag</button><button data-act="addAbsence" data-date="${todayStr()}">Abwesend</button></div>`;

  const explainRows = [];
  x.lines.forEach((l) => explainRows.push(`<li><span>${esc(l.text)}</span><span>${fmtHM(l.min)} h</span></li>`));
  explainRows.push(`<li><span><b>Regel-Soll des Monats</b> (${x.workdayCount} Arbeitstage)</span><span>${fmtHM(x.baseMin)} h</span></li>`);
  x.holidaysOnWorkdays.forEach((h) => explainRows.push(`<li><span>${x.mode === 'credit' ? 'Feiertags-Gutschrift' : '− Feiertag'} ${WEEKDAYS_SHORT[h.weekday]} ${fmtDateShortDE(h.date)} ${esc(h.name)}${h.statutory ? '' : ' (zusätzlich frei)'}</span><span>${x.mode === 'credit' ? '+' : '−'}${fmtHM(h.min)} h</span></li>`));
  if (x.holidaysOnWeekend.length) explainRows.push(`<li class="muted"><span>Feiertag am Wochenende (ohne Wirkung auf das Soll): ${x.holidaysOnWeekend.map((h) => `${WEEKDAYS_SHORT[h.weekday]} ${fmtDateShortDE(h.date)} ${esc(h.name)}`).join(', ')}</span><span>±0:00 h</span></li>`);
  explainRows.push(`<li class="total"><span>Monats-Soll${x.mode === 'credit' ? ' (Feiertage als Gutschrift)' : ''}</span><span>${fmtHM(t.sollMin)} h</span></li>`);

  const weeks = groupByWeek(m.days).map((w) => `<tr><td>KW ${w.week} <span class="muted small">${fmtDateShortDE(w.from)}–${fmtDateShortDE(w.to)}</span></td><td>${fmtHM(w.sollMin)}</td><td>${fmtHM(w.anrechenbarMin)}</td><td class="${cls(w.saldoMin)}">${fmtHM(w.saldoMin, { sign: true })}</td></tr>`).join('');

  const entriesById = new Map(data.entries.map((e) => [e.id, e]));
  const dayRows = m.days.map((d) => {
    const parts = d.parts.map((p) => {
      const e = entriesById.get(p.entryId);
      if (!e) return '';
      const sd = e.start.slice(0, 10), ed = e.end.slice(0, 10);
      const span = `${e.start.slice(11)}–${e.end.slice(11)}`;
      const note = sd !== d.date ? ' (ab Vortag)' : ed !== d.date ? ' (weiter am Folgetag)' : '';
      const full = (sd !== ed) ? ` · Anteil ${fmtHM(p.minutes)} h` : '';
      const pause = e.pauseMin ? ` · Pause ${e.pauseMin} Min` : '';
      return `<div>${esc(span)}${note}${full}${sd === ed ? pause : ''}${e.note ? ' · ' + esc(e.note) : ''}</div>`;
    }).join('');
    const badges = [];
    if (d.isHoliday) badges.push(`<span class="badge hol">${esc(d.holidayName)}</span>`);
    if (d.isExtraFree) badges.push(`<span class="badge hol">${esc(d.extraFreeName)}</span>`);
    if (d.absence) badges.push(`<span class="badge abs">${esc(ABSENCE_TYPES[d.absence.type])}${d.absenceCreditMin ? ' · +' + fmtHM(d.absenceCreditMin) + ' h angerechnet' : d.absenceNote ? ' · ' + esc(d.absenceNote) : ''}</span>`);
    if (d.holidayCreditMin) badges.push(`<span class="badge">Gutschrift ${fmtHM(d.holidayCreditMin)} h</span>`);
    const clsx = ['day', d.isWeekend ? 'we' : '', d.isHoliday || d.isExtraFree ? 'hol' : '', d.date === today ? 'today' : ''].join(' ');
    const showSaldo = d.workMin || d.sollMin || d.anrechenbarMin;
    return `<li class="${clsx}" data-act="openDay" data-date="${d.date}"><div class="d">${WEEKDAYS_SHORT[d.weekday]}<small>${fmtDateShortDE(d.date)}</small></div><div><div class="parts">${parts}</div>${badges.join('')}</div><div class="nums"><b>${d.workMin ? fmtHM(d.workMin) : '–'}</b><div class="muted small">Soll ${fmtHM(d.sollMin)}${showSaldo ? ` · <span class="${cls(d.saldoMin)}">${fmtHM(d.saldoMin, { sign: true })}</span>` : ''}</div></div></li>`;
  }).join('');

  const warn = m.warnings.length ? `<div class="banner">${m.warnings.slice(0, 4).map((w) => esc(w.text)).join('<br>')}</div>` : '';

  const heroR = inAccount
    ? `<div><div class="muted small">Kontostand Monatsende</div><div class="big ${cls(accRow.carryOutMin)}">${fmtHM(accRow.carryOutMin, { sign: true })}</div><div class="muted small">Übertrag Vormonat ${fmtHM(accRow.carryInMin, { sign: true })}</div></div>`
    : `<div><div class="muted small">Kontostand</div><div class="big">–</div><div class="muted small">Konto beginnt ${esc(monthLabel(acc.startYm))}</div></div>`;

  return `
  <div class="monthnav"><button class="icon" data-act="prevMonth" aria-label="Vormonat">‹</button><h2>${esc(monthLabel(state.ym))}</h2><button class="icon" data-act="nextMonth" aria-label="Folgemonat">›</button></div>
  ${state.ym !== ymOf(today) ? '<div class="row" style="margin-bottom:10px;justify-content:center"><button class="ghost" data-act="thisMonth">Zum aktuellen Monat</button></div>' : ''}
  ${stamp}
  ${warn}
  <div class="card hero">
    <div><div class="muted small">Saldo ${esc(monthLabel(state.ym))}</div><div class="big ${cls(t.saldoMin)}">${fmtHM(t.saldoMin, { sign: true })}</div><div class="muted small">anrechenbar ${fmtHM(t.anrechenbarMin)} − Soll ${fmtHM(t.sollMin)}</div></div>
    ${heroR}
  </div>
  ${toDate ? `<div class="card"><div class="row spread"><span>Aktueller Stand bis heute (${fmtDateShortDE(today)})</span><b class="${cls(toDate.balanceMin)}">${fmtHM(toDate.balanceMin, { sign: true })} h</b></div><div class="muted small">Übertrag ${fmtHM(toDate.carryInMin, { sign: true })} + laufender Monat bis heute ${fmtHM(toDate.partialSaldoMin, { sign: true })} (Soll nur bis heute)</div></div>` : ''}
  <div class="kpis" style="margin-bottom:12px">
    ${kpi('Gesamt geleistet', fmtHM(t.workTotalMin) + ' h', 'tatsächlich gearbeitet')}
    ${kpi('Montag–Freitag', fmtHM(t.workMoFrMin) + ' h')}
    ${kpi('Samstag', fmtHM(t.workSaMin) + ' h')}
    ${kpi('Sonntag', fmtHM(t.workSoMin) + ' h')}
    ${kpi('Gesamt = Mo–Fr + Sa + So', fmtHM(t.workMoFrMin + t.workSaMin + t.workSoMin) + ' h', 'jede Stunde nur einmal', 'sub')}
    ${kpi('Davon an gesetzl. Feiertagen', fmtHM(t.workHolidayMin) + ' h', `Mo–Fr ${fmtHM(t.workHolidayMoFrMin)} · Sa ${fmtHM(t.workHolidaySaMin)} · So ${fmtHM(t.workHolidaySoMin)} (Teilmenge, nicht addieren)`, 'sub')}
    ${kpi('Monatliche Sollstunden', fmtHM(t.sollMin) + ' h', `${x.workdayCount} Arbeitstage`)}
    ${kpi('Über-/Minusstunden', fmtHM(t.saldoMin, { sign: true }) + ' h', 'in diesem Monat', '', cls(t.saldoMin))}
    ${kpi('Arbeitszeitkonto', inAccount ? fmtHM(accRow.carryOutMin, { sign: true }) + ' h' : '–', 'Stand Monatsende', '', inAccount ? cls(accRow.carryOutMin) : '')}
  </div>
  <div class="card"><h2>Angerechnete Zeiten (keine Arbeitsstunden)</h2>
    <ul class="explain">
      <li><span>Urlaub</span><span>${fmtHM(t.creditVacationMin)} h</span></li>
      <li><span>Krankheit</span><span>${fmtHM(t.creditSickMin)} h</span></li>
      <li><span>Feiertags-Gutschrift${x.mode === 'reduce' ? ' (Modell: Soll wird gesenkt)' : ''}</span><span>${fmtHM(t.creditHolidayMin)} h</span></li>
      <li class="total"><span>Anrechenbare Ist-Zeit (Arbeit + Anrechnungen)</span><span>${fmtHM(t.anrechenbarMin)} h</span></li>
    </ul></div>
  ${t.bonus.enabled ? `<div class="card"><h2>Zuschläge (Schätzung, brutto)</h2>
    <ul class="explain">
      <li><span>Samstag: ${fmtHM(t.bonus.sa.min)} h × ${fmtEUR(t.bonus.wageCents)} × ${fmtPct(t.bonus.sa.pct)}</span><span>${fmtEUR(t.bonus.sa.cents)}</span></li>
      <li><span>Sonntag: ${fmtHM(t.bonus.so.min)} h × ${fmtEUR(t.bonus.wageCents)} × ${fmtPct(t.bonus.so.pct)}</span><span>${fmtEUR(t.bonus.so.cents)}</span></li>
      <li><span>Gesetzl. Feiertag: ${fmtHM(t.bonus.holiday.min)} h × ${fmtEUR(t.bonus.wageCents)} × ${fmtPct(t.bonus.holiday.pct)}</span><span>${fmtEUR(t.bonus.holiday.cents)}</span></li>
      <li class="total"><span>Summe Zuschläge</span><span>${fmtEUR(t.bonus.surchargeTotalCents)}</span></li>
      ${t.bonus.overtimeCents ? `<li class="muted"><span>Zum Vergleich: Überstunden-Grundvergütung ${fmtHM(t.saldoMin)} h × ${fmtEUR(t.bonus.wageCents)} (nur falls ausgezahlt)</span><span>${fmtEUR(t.bonus.overtimeCents)}</span></li>` : ''}
    </ul>
    <p class="muted small">Pro Stunde gilt nur ein Zuschlag: Fällt sie auf Wochenende und Feiertag, zählt der höhere Satz (z. B. Sonntag + Feiertag = einmal 50 %). Feiertagsstunden stehen nur in der Feiertagszeile, nicht zusätzlich bei Samstag/Sonntag. Reine Schätzung – ersetzt keine Lohnabrechnung (Steuer/SV-Freiheit nicht berücksichtigt).</p></div>` : ''}
  ${(() => { const pay = computeMonthPay(t, m.settings); if (!pay) return ''; const e = (c) => fmtEUR(c); const neg = (c) => (c ? '−' + e(c) : e(0)); return `<div class="card"><h2>Brutto → Netto (Schätzung)</h2>
    <ul class="explain">
      <li><span>Monatsgehalt</span><span>${e(pay.gehaltCents)}</span></li>
      ${pay.overtimeCents ? `<li><span>Überstunden-Grundvergütung (${fmtHM(t.saldoMin)} h)</span><span>${e(pay.overtimeCents)}</span></li>` : ''}
      ${pay.surchargeTaxableCents ? `<li><span>Zuschläge steuer-/SV-pflichtig (Samstag)</span><span>${e(pay.surchargeTaxableCents)}</span></li>` : ''}
      ${pay.freeCents ? `<li><span>Zuschläge steuer-/SV-frei (Sonntag/Feiertag)</span><span>${e(pay.freeCents)}</span></li>` : ''}
      <li class="total"><span>Gesamt-Brutto</span><span>${e(pay.bruttoCents)}</span></li>
      <li><span>Lohnsteuer (Klasse III)</span><span>${neg(pay.lstCents)}</span></li>
      <li><span>Solidaritätszuschlag</span><span>${neg(pay.soliCents)}</span></li>
      ${m.settings.churchTax ? `<li><span>Kirchensteuer (${String(m.settings.churchRatePct).replace('.', ',')} %)</span><span>${neg(pay.kistCents)}</span></li>` : ''}
      <li><span>Krankenversicherung</span><span>${neg(pay.kvCents)}</span></li>
      <li><span>Pflegeversicherung (${String(+pay.detail.pvSatzPct.toFixed(2)).replace('.', ',')} %)</span><span>${neg(pay.pvCents)}</span></li>
      <li><span>Rentenversicherung</span><span>${neg(pay.rvCents)}</span></li>
      <li><span>Arbeitslosenversicherung</span><span>${neg(pay.avCents)}</span></li>
      <li class="total"><span>Netto-Auszahlung (geschätzt)</span><span class="pos">${e(pay.nettoCents)}</span></li>
    </ul>
    <p class="muted small">Schätzung nach dem Lohnsteuer-Programmablaufplan 2026 für laufenden Arbeitslohn (Steuerklasse III, ${String(m.settings.zkf).replace('.', ',')} Kinderfreibetrag-Zähler, gesetzlich versichert, Zusatzbeitrag ${String(m.settings.kvZusatzPct).replace('.', ',')} %). Nicht enthalten: vermögenswirksame Leistungen, Sachbezüge, Nachberechnungen früherer Monate, Sonderzahlungen, Freibeträge auf der Lohnsteuerkarte. Maßgeblich ist immer Ihre Abrechnung.</p></div>`; })()}
  <div class="card"><details open><summary>So entsteht das Soll</summary><ul class="explain">${explainRows.join('')}</ul></details></div>
  <div class="card"><details><summary>Wochen im Monat</summary><div class="tablewrap"><table><thead><tr><th>Woche (nur Tage dieses Monats)</th><th>Soll</th><th>Anrechenbar</th><th>Saldo</th></tr></thead><tbody>${weeks}</tbody></table></div></details></div>
  <div class="card" style="padding:0"><ul class="days">${dayRows}</ul></div>`;
}

function viewKonto() {
  const today = todayStr();
  const toDate = computeAccountToDate(data, today);
  const upto = addMonths(ymOf(today), 0);
  const acc = computeAccount(data, upto);
  const rows = acc.rows.slice().reverse().map((r) => `<tr><td>${esc(monthLabel(r.ym))}</td><td>${fmtHM(r.sollMin)}</td><td>${fmtHM(r.anrechenbarMin)}</td><td class="${cls(r.saldoMin)}">${fmtHM(r.saldoMin, { sign: true })}</td><td><b class="${cls(r.carryOutMin)}">${fmtHM(r.carryOutMin, { sign: true })}</b></td></tr>`).join('');
  return `
  <div class="card hero">
    <div><div class="muted small">Stand bis heute</div><div class="big ${cls(toDate.balanceMin)}">${fmtHM(toDate.balanceMin, { sign: true })}</div><div class="muted small">Soll des laufenden Monats nur bis heute</div></div>
    <div><div class="muted small">Konto seit</div><div class="big" style="font-size:1.3rem">${esc(monthLabel(acc.startYm))}</div><div class="muted small">Startsaldo ${fmtHM(acc.startBalanceMin, { sign: true })}</div></div>
  </div>
  <div class="card"><h2>Monatsübersicht</h2>
    <div class="tablewrap"><table><thead><tr><th>Monat</th><th>Soll</th><th>Anrechenbar</th><th>Saldo</th><th>Konto Monatsende</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Noch keine Monate.</td></tr>'}</tbody></table></div>
    <p class="muted small">Saldo = anrechenbare Ist-Zeit − Monats-Soll. Der Stand am Monatsende wird in den Folgemonat übertragen. Das Konto beginnt im Monat des ersten Eintrags – oder ab dem Monat, den Sie unter „Einstellungen“ festlegen (dort auch ein Startsaldo).</p>
  </div>`;
}

function viewEinstellungen() {
  const s = { ...DEFAULT_SETTINGS, ...data.settings };
  const accStart = accountStartMonth(data, ymOf(todayStr()));
  const y = Number(state.ym.slice(0, 4));
  const hol = Object.entries(holidaysNRW(y)).sort().map(([d, n]) => `<li><span>${esc(n)}</span><span>${WEEKDAYS_SHORT[weekdayIdx(d)]} ${fmtDateDE(d)}</span></li>`).join('');
  const extra = (s.extraFreeDays || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((d) => `<div class="list-del"><span>${fmtDateDE(d.date, true)} · ${esc(d.name)}</span><button class="danger" data-act="delExtra" data-id="${esc(d.id)}">Löschen</button></div>`).join('');
  const last = meta.lastBackup ? new Date(meta.lastBackup).toLocaleString('de-DE') : 'noch nie';
  return `
  <div class="card"><h2>Sollzeit pro Wochentag (Stunden)</h2>
    <div class="grid7">${WEEKDAYS_SHORT.map((w, i) => `<div><label for="soll${i}">${w}</label><input id="soll${i}" inputmode="decimal" data-set="soll" data-i="${i}" value="${String(s.sollHours[i]).replace('.', ',')}"></div>`).join('')}</div>
    <p class="muted small">Standard: Mo–Fr je 8 h = 40 h pro Woche, Sa/So 0 h.</p></div>
  <div class="card"><h2>Feiertage und Anrechnung</h2>
    <label class="check"><input type="radio" name="hm" data-set="holidayMode" value="reduce" ${s.holidayMode === 'reduce' ? 'checked' : ''}> Feiertag senkt das Soll (Standard)</label>
    <label class="check"><input type="radio" name="hm" data-set="holidayMode" value="credit" ${s.holidayMode === 'credit' ? 'checked' : ''}> Soll bleibt, Feiertag als getrennte Gutschrift</label>
    <label class="check"><input type="checkbox" data-set="creditVacation" ${s.creditVacation ? 'checked' : ''}> Urlaub an Arbeitstagen anrechnen</label>
    <label class="check"><input type="checkbox" data-set="creditSick" ${s.creditSick ? 'checked' : ''}> Krankheit an Arbeitstagen anrechnen</label>
    <p class="muted small">Beide Feiertagsmodelle ergeben denselben Saldo. Feiertage am Samstag/Sonntag verändern das Soll nie.</p></div>
  <div class="card"><h2>Stundenlohn und Zuschläge</h2>
    <div class="field"><label for="wage">Stundenlohn brutto in € (0 = Beträge ausblenden)</label><input id="wage" inputmode="decimal" data-set="wage" value="${s.hourlyWageCents ? (s.hourlyWageCents / 100).toFixed(2).replace('.', ',') : ''}" placeholder="z. B. 20,68"></div>
    <div class="grid7" style="grid-template-columns:repeat(3,1fr)">
      <div><label for="pSa">Samstag %</label><input id="pSa" inputmode="decimal" data-set="pSa" value="${String(s.surchargeSaPct).replace('.', ',')}"></div>
      <div><label for="pSo">Sonntag %</label><input id="pSo" inputmode="decimal" data-set="pSo" value="${String(s.surchargeSoPct).replace('.', ',')}"></div>
      <div><label for="pHol">Feiertag %</label><input id="pHol" inputmode="decimal" data-set="pHol" value="${String(s.surchargeHolPct).replace('.', ',')}"></div>
    </div>
    <p class="muted small">Standard: Samstag 25 %, Sonntag 50 %, Feiertag 50 %. Der Zuschlag gilt für alle Stunden des Kalendertags; pro Stunde nur der höchste Satz.</p></div>
  <div class="card"><h2>Gehalt und Abzüge (Brutto → Netto)</h2>
    <div class="field"><label for="gross">Monatsgehalt brutto in € (leer = Netto-Rechnung ausblenden)</label><input id="gross" inputmode="decimal" data-set="gross" value="${s.monthlyGrossCents ? (s.monthlyGrossCents / 100).toFixed(2).replace('.', ',') : ''}" placeholder="z. B. 3600,00"></div>
    <div class="field"><label for="taxClass">Steuerklasse</label><select id="taxClass" disabled><option>III (derzeit als einzige unterstützt)</option></select></div>
    <div class="grid7" style="grid-template-columns:repeat(2,1fr)">
      <div><label for="zkf">Kinderfreibetrag-Zähler</label><input id="zkf" inputmode="decimal" data-set="zkf" value="${String(s.zkf).replace('.', ',')}"></div>
      <div><label for="pvk">Kinder unter 25 (PV-Abschlag)</label><input id="pvk" inputmode="numeric" data-set="pvKinder" value="${s.pvKinder}"></div>
      <div><label for="kvz">KV-Zusatzbeitrag %</label><input id="kvz" inputmode="decimal" data-set="kvZusatzPct" value="${String(s.kvZusatzPct).replace('.', ',')}"></div>
      <div><label for="kist">Kirchensteuersatz %</label><input id="kist" inputmode="decimal" data-set="churchRatePct" value="${String(s.churchRatePct).replace('.', ',')}"></div>
    </div>
    <label class="check"><input type="checkbox" data-set="churchTax" ${s.churchTax ? 'checked' : ''}> Kirchensteuer zahlen</label>
    <label class="check"><input type="checkbox" data-set="overtimePayout" ${s.overtimePayout ? 'checked' : ''}> Positiver Monatssaldo wird als Überstunden-Grundvergütung ausgezahlt</label>
    <p class="muted small">Gesetzlich versichert. Der Zusatzbeitrag steht auf Ihrer Gehaltsabrechnung bzw. bei Ihrer Krankenkasse (Durchschnitt 2026: 2,9 %). Zwei Kinder unter 25 senken den Pflegeversicherungs-Beitrag (Abschlag ab dem 2. Kind).</p></div>
  <div class="card"><h2>Arbeitszeitkonto</h2>
    <div class="field"><label for="accStart">Konto beginnt im Monat</label><input id="accStart" type="month" data-set="accountStart" value="${esc(s.accountStart || accStart)}"></div>
    <div class="field"><label for="startBal">Startsaldo (z. B. 12:30 oder −3,5 Stunden)</label><input id="startBal" inputmode="text" data-set="startBalance" value="${esc(fmtHM(s.startBalanceMin || 0))}"></div></div>
  <div class="card"><h2>Zusätzliche freie Tage (Soll 0)</h2>
    ${extra || '<p class="muted small">Keine. Beispiel: Rosenmontag, Betriebsferien.</p>'}
    <div class="row" style="margin-top:8px"><input type="date" id="exDate" style="flex:1;min-width:140px"><input id="exName" placeholder="Bezeichnung" style="flex:1;min-width:140px"><button data-act="addExtra">Hinzufügen</button></div></div>
  <div class="card"><details><summary>Gesetzliche Feiertage NRW ${y}</summary><ul class="explain">${hol}</ul></details></div>
  <div class="card"><details><summary>Verwendete Rechenregeln</summary><ul class="explain" style="list-style:disc;padding-left:18px">${describeRules(s).map((r) => `<li style="display:list-item;border:0">${esc(r)}</li>`).join('')}</ul></details></div>
  <div class="card"><h2>Sicherung & Gerätewechsel</h2>
    <p class="small muted">Letzte Sicherung: ${esc(last)}. Die Daten liegen nur auf diesem Gerät. Sichern Sie regelmäßig – und nutzen Sie die Sicherung, um Daten auf ein anderes Gerät zu bringen.</p>
    <div class="row"><button class="primary" data-act="backup">Sicherung erstellen</button><button data-act="importFile">Sicherung laden …</button></div>
    <input type="file" id="importInput" accept=".json,application/json" hidden>
    <p class="small muted" style="margin-top:10px">„Zusammenführen“ gleicht zwei Geräte ab: pro Eintrag gewinnt die neuere Änderung, Löschungen werden übernommen.</p>
    <div class="row"><button data-act="persist">Dauerhaften Speicher anfordern</button><button class="danger" data-act="wipe">Alle Daten löschen</button></div></div>
  <p class="muted small" style="text-align:center">Arbeitszeit-App · Version 1.4 (Stand 17.10.2026) · alle Daten bleiben auf Ihrem Gerät</p>
  <p class="muted small" style="text-align:center"><img id="iconCheck" src="apple-touch-icon.png?v=4" width="28" height="28" alt="" style="vertical-align:middle;border-radius:7px"> <span id="iconStatus">Symbol wird geprüft …</span></p>`;
}

// ------------------------------------------------------------ Dialoge
const dlg = () => $('#dlg');
function openDlg(html) { const d = dlg(); d.innerHTML = html; if (!d.open) d.showModal(); }
function closeDlg() { const d = dlg(); if (d.open) d.close(); }

function dayDialog(date) {
  const m = computeMonth(data, ymOf(date));
  const d = m.days.find((x) => x.date === date);
  const ids = new Set(d.parts.map((p) => p.entryId));
  const entries = live(data.entries).filter((e) => ids.has(e.id) || e.start.slice(0, 10) === date).sort((a, b) => a.start.localeCompare(b.start));
  const abs = live(data.absences).filter((a) => a.from <= date && date <= a.to);
  openDlg(`<h3>${esc(WEEKDAYS_LONG[d.weekday])}, ${fmtDateDE(date)}</h3>
    <p class="muted small">${d.isHoliday ? esc(d.holidayName) + ' (gesetzl. Feiertag NRW) · ' : ''}Soll ${fmtHM(d.sollMin)} h · Ist ${fmtHM(d.workMin)} h</p>
    ${entries.map((e) => `<div class="list-del"><span>${esc(e.start.replace('T', ' '))} – ${esc(e.end.replace('T', ' '))}${e.pauseMin ? ` · Pause ${e.pauseMin} Min` : ''}</span><button data-act="editEntry" data-id="${esc(e.id)}">Bearbeiten</button></div>`).join('')}
    ${abs.map((a) => `<div class="list-del"><span>${esc(ABSENCE_TYPES[a.type])} ${fmtDateDE(a.from)}${a.to !== a.from ? ' – ' + fmtDateDE(a.to) : ''}</span><button data-act="editAbsence" data-id="${esc(a.id)}">Bearbeiten</button></div>`).join('')}
    ${!entries.length && !abs.length ? '<p class="muted">Keine Einträge.</p>' : ''}
    <div class="row" style="margin-top:12px"><button class="primary" data-act="addEntry" data-date="${date}">＋ Arbeitszeit</button><button data-act="addAbsence" data-date="${date}">＋ Abwesenheit</button><button class="ghost" data-act="closeDlg">Schließen</button></div>`);
}

function lastEntryDefaults() {
  const l = live(data.entries).sort((a, b) => b.start.localeCompare(a.start))[0];
  return l ? { st: l.start.slice(11), en: l.end.slice(11), pause: l.pauseMin || 0, sameDay: l.start.slice(0, 10) === l.end.slice(0, 10) } : { st: '08:00', en: '16:30', pause: 30, sameDay: true };
}

function entryDialog(entry, date, prefill) {
  const def = lastEntryDefaults();
  const e = entry || {
    id: newId(),
    start: prefill?.start || `${date}T${def.st}`,
    end: prefill?.end || `${def.sameDay ? date : addDays(date, 1)}T${def.en}`,
    pauseMin: prefill?.pauseMin ?? def.pause, note: '',
  };
  const isNew = !entry;
  openDlg(`<h3>${isNew ? 'Arbeitszeit erfassen' : 'Arbeitszeit bearbeiten'}</h3>
    <div class="seg"><button class="on" disabled>Arbeit</button><button data-act="addAbsence" data-date="${date}">Urlaub / Krank / Frei</button></div>
    <form id="entryForm" data-id="${esc(e.id)}" data-new="${isNew ? 1 : 0}" novalidate>
      <div class="field"><label for="fStart">Beginn</label><input id="fStart" type="datetime-local" value="${esc(e.start)}" required></div>
      <div class="field"><label for="fEnd">Ende (bei Nachtschicht: Datum des Folgetags)</label><input id="fEnd" type="datetime-local" value="${esc(e.end)}" required></div>
      <div class="field"><label for="fPause">Unbezahlte Pause (Minuten)</label><input id="fPause" type="number" inputmode="numeric" min="0" step="5" value="${e.pauseMin || 0}">
        <div class="chips">${[0, 15, 30, 45, 60].map((p) => `<button type="button" data-act="setPause" data-v="${p}">${p}</button>`).join('')}</div></div>
      <div class="field"><label for="fNote">Notiz (optional)</label><input id="fNote" value="${esc(e.note || '')}" maxlength="120"></div>
      <div class="preview" id="fPreview"></div>
      <p class="err" id="fErr"></p>
      <div class="row"><button class="primary" type="submit">Speichern</button><button type="button" class="ghost" data-act="closeDlg">Abbrechen</button>${isNew ? '' : '<button type="button" class="danger" data-act="delEntry">Löschen</button>'}</div>
    </form>`);
  updatePreview();
}

function updatePreview() {
  const f = $('#entryForm'); if (!f) return;
  const box = $('#fPreview');
  try {
    const s = parseLocal($('#fStart').value), e = parseLocal($('#fEnd').value);
    if (!(e > s)) { box.textContent = 'Das Ende muss nach dem Beginn liegen.'; return; }
    const raw = splitByDay(s, e);
    const { segs } = applyPause(raw, Number($('#fPause').value || 0));
    const total = segs.reduce((a, x) => a + x.minutes, 0);
    const lines = segs.map((x) => {
      const wd = weekdayIdx(x.date); const hn = holidayName(x.date);
      return `${WEEKDAYS_SHORT[wd]} ${fmtDateShortDE(x.date)}: <b>${fmtHM(x.minutes)} h</b>${wd >= 5 ? ' (' + WEEKDAYS_LONG[wd] + ')' : ''}${hn ? ' · Feiertag ' + esc(hn) : ''}`;
    });
    box.innerHTML = `Arbeitszeit netto: <b>${fmtHM(total)} h</b><br>${lines.join('<br>')}`;
  } catch { box.textContent = 'Bitte Beginn und Ende eingeben.'; }
}

function absenceDialog(abs, date) {
  const a = abs || { id: newId(), type: 'urlaub', from: date, to: date, hours: '', note: '' };
  const isNew = !abs;
  openDlg(`<h3>${isNew ? 'Abwesenheit erfassen' : 'Abwesenheit bearbeiten'}</h3>
    <div class="seg"><button data-act="addEntry" data-date="${date}">Arbeit</button><button class="on" disabled>Urlaub / Krank / Frei</button></div>
    <form id="absForm" data-id="${esc(a.id)}" data-new="${isNew ? 1 : 0}" novalidate>
      <div class="field"><label for="aType">Art</label><select id="aType">${Object.entries(ABSENCE_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="aFrom">Von</label><input id="aFrom" type="date" value="${esc(a.from)}"></div>
      <div class="field"><label for="aTo">Bis</label><input id="aTo" type="date" value="${esc(a.to)}"></div>
      <div class="field"><label for="aHours">Anrechnung pro Tag in Stunden (leer = volles Tages-Soll)</label><input id="aHours" inputmode="decimal" value="${a.hours === '' || a.hours == null ? '' : String(a.hours).replace('.', ',')}" placeholder="z. B. 4 für einen halben Tag"></div>
      <div class="field"><label for="aNote">Notiz (optional)</label><input id="aNote" value="${esc(a.note || '')}" maxlength="120"></div>
      <p class="muted small">Angerechnet wird nur an Regelarbeitstagen – nicht an Wochenenden und nicht an Feiertagen. Die Anrechnung zählt nicht als geleistete Arbeitszeit.</p>
      <p class="err" id="aErr"></p>
      <div class="row"><button class="primary" type="submit">Speichern</button><button type="button" class="ghost" data-act="closeDlg">Abbrechen</button>${isNew ? '' : '<button type="button" class="danger" data-act="delAbs">Löschen</button>'}</div>
    </form>`);
}

// ------------------------------------------------------------ Aktionen
function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
}
function touchSettings() { data.settings.updatedAt = now(); save(); render(); }

function saveEntryForm() {
  const f = $('#entryForm');
  const e = { id: f.dataset.id, start: $('#fStart').value, end: $('#fEnd').value, pauseMin: Math.round(Number($('#fPause').value || 0)), note: $('#fNote').value.trim(), updatedAt: now() };
  const errs = validateEntry(e, data.entries);
  if (errs.length) { $('#fErr').textContent = errs.join(' '); return; }
  upsert(data.entries, e); save();
  if (lsGet(KEY_RUNNING)) lsDel(KEY_RUNNING);
  closeDlg(); state.ym = e.start.slice(0, 7); render(); toast('Gespeichert');
}
function saveAbsForm() {
  const f = $('#absForm');
  const hoursTxt = $('#aHours').value.trim().replace(',', '.');
  const a = { id: f.dataset.id, type: $('#aType').value, from: $('#aFrom').value, to: $('#aTo').value, hours: hoursTxt === '' ? '' : Number(hoursTxt), note: $('#aNote').value.trim(), updatedAt: now() };
  if (!a.from || !a.to) { $('#aErr').textContent = 'Bitte Von und Bis angeben.'; return; }
  const errs = validateAbsence(a);
  if (errs.length) { $('#aErr').textContent = errs.join(' '); return; }
  upsert(data.absences, a); save(); closeDlg(); state.ym = a.from.slice(0, 7); render(); toast('Gespeichert');
}
function softDelete(list, id) {
  const x = list.find((z) => z.id === id); if (!x) return;
  x.deleted = true; x.updatedAt = now(); save();
}

async function doBackup() {
  const json = JSON.stringify(toBackup(data), null, 1);
  const name = `arbeitszeit-sicherung-${todayStr()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Arbeitszeit-Sicherung' });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    meta.lastBackup = new Date().toISOString(); saveMeta(); render(); toast('Sicherung erstellt');
  } catch (err) { if (err && err.name !== 'AbortError') toast('Sicherung fehlgeschlagen'); }
}

function handleImport(text) {
  const res = parseBackup(text);
  if (!res.ok) { toast(res.error); openDlg(`<h3>Import nicht möglich</h3><p>${esc(res.error)}</p><button data-act="closeDlg">OK</button>`); return; }
  window.__pendingImport = res.data;
  const n = live(res.data.entries).length, a = live(res.data.absences).length;
  openDlg(`<h3>Sicherung laden</h3>
    <p>Die Datei enthält <b>${n}</b> Arbeitszeit-Einträge und <b>${a}</b> Abwesenheiten.</p>
    <p class="small muted"><b>Zusammenführen:</b> behält vorhandene Daten, ergänzt neue und übernimmt pro Eintrag die neuere Änderung (empfohlen bei Nutzung auf zwei Geräten).<br><b>Ersetzen:</b> löscht alle Daten auf diesem Gerät und übernimmt nur die Datei (z. B. neues Gerät).</p>
    <div class="row"><button class="primary" data-act="importMerge">Zusammenführen</button><button class="danger" data-act="importReplace">Ersetzen</button><button class="ghost" data-act="closeDlg">Abbrechen</button></div>`);
}
function applyImport(mode) {
  const incoming = window.__pendingImport; if (!incoming) return;
  lsSet(KEY_PRE_IMPORT, JSON.stringify(data)); // Sicherheitskopie des alten Stands
  if (mode === 'merge') { const r = mergeData(data, incoming); data = r.data; toast(`${r.stats.added} neu, ${r.stats.updated} aktualisiert`); }
  else { data = incoming; toast('Daten ersetzt'); }
  save(); window.__pendingImport = null; closeDlg(); render();
}

// ------------------------------------------------------------ Ereignisse
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act],[data-tab]');
  if (!t) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const act = t.dataset.act;
  const id = t.dataset.id;
  switch (act) {
    case 'prevMonth': state.ym = addMonths(state.ym, -1); render(); break;
    case 'nextMonth': state.ym = addMonths(state.ym, 1); render(); break;
    case 'thisMonth': state.ym = ymOf(todayStr()); render(); break;
    case 'openDay': dayDialog(t.dataset.date); break;
    case 'addEntry': entryDialog(null, t.dataset.date); break;
    case 'addAbsence': absenceDialog(null, t.dataset.date); break;
    case 'editEntry': entryDialog(data.entries.find((e) => e.id === id), todayStr()); break;
    case 'editAbsence': absenceDialog(data.absences.find((e) => e.id === id), todayStr()); break;
    case 'closeDlg': closeDlg(); break;
    case 'setPause': $('#fPause').value = t.dataset.v; updatePreview(); break;
    case 'delEntry': if (confirm('Diesen Eintrag löschen?')) { softDelete(data.entries, $('#entryForm').dataset.id); closeDlg(); render(); toast('Gelöscht'); } break;
    case 'delAbs': if (confirm('Diese Abwesenheit löschen?')) { softDelete(data.absences, $('#absForm').dataset.id); closeDlg(); render(); toast('Gelöscht'); } break;
    case 'stampIn': lsSet(KEY_RUNNING, toLocalInput(new Date())); render(); toast('Eingestempelt'); break;
    case 'stampOut': { const st = lsGet(KEY_RUNNING); if (st) { entryDialog(null, st.slice(0, 10), { start: st, end: toLocalInput(new Date()) }); } break; }
    case 'backup': doBackup(); break;
    case 'importFile': $('#importInput').click(); break;
    case 'importMerge': applyImport('merge'); break;
    case 'importReplace': if (confirm('Wirklich alle vorhandenen Daten auf diesem Gerät ersetzen?')) applyImport('replace'); break;
    case 'persist': (navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false)).then((ok) => toast(ok ? 'Dauerhafter Speicher aktiv' : 'Vom Browser nicht gewährt – bitte regelmäßig sichern')); break;
    case 'wipe': if (confirm('ALLE Daten auf diesem Gerät unwiderruflich löschen? Erstellen Sie vorher eine Sicherung!') && confirm('Wirklich alles löschen?')) { lsSet(KEY_PRE_IMPORT, JSON.stringify(data)); data = emptyData(); save(); lsDel(KEY_RUNNING); render(); toast('Alle Daten gelöscht'); } break;
    case 'addExtra': { const d = $('#exDate').value, n = $('#exName').value.trim(); if (!d) { toast('Bitte Datum wählen'); break; } data.settings.extraFreeDays = [...(data.settings.extraFreeDays || []), { id: newId(), date: d, name: n || 'Freier Tag' }]; touchSettings(); break; }
    case 'delExtra': data.settings.extraFreeDays = (data.settings.extraFreeDays || []).filter((x) => x.id !== id); touchSettings(); break;
  }
});

document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (ev.target.id === 'entryForm') saveEntryForm();
  if (ev.target.id === 'absForm') saveAbsForm();
});
document.addEventListener('input', (ev) => { if (['fStart', 'fEnd', 'fPause'].includes(ev.target.id)) updatePreview(); });
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'importInput') {
    const f = t.files[0]; if (!f) return;
    f.text().then(handleImport); t.value = ''; return;
  }
  if (t.id === 'fStart') { // Ende automatisch am selben Tag vorschlagen, wenn es vor dem Beginn liegt
    const en = $('#fEnd'); if (en.value && en.value <= t.value) { en.value = t.value.slice(0, 10) + en.value.slice(10); updatePreview(); }
  }
  const k = t.dataset.set; if (!k) return;
  const s = data.settings;
  if (k === 'soll') {
    const h = Number(String(t.value).replace(',', '.'));
    if (!Number.isFinite(h) || h < 0 || h > 24) { toast('Bitte Stunden zwischen 0 und 24 eingeben'); render(); return; }
    s.sollHours = [...(s.sollHours || DEFAULT_SETTINGS.sollHours)]; s.sollHours[Number(t.dataset.i)] = h;
  } else if (k === 'holidayMode') s.holidayMode = t.value;
  else if (k === 'creditVacation' || k === 'creditSick') s[k] = t.checked;
  else if (k === 'wage') {
    const txt = String(t.value).trim().replace(',', '.').replace('€', '').trim();
    const n = txt === '' ? 0 : Number(txt);
    if (!Number.isFinite(n) || n < 0 || n > 1000) { toast('Bitte einen Stundenlohn wie 20,68 eingeben'); render(); return; }
    s.hourlyWageCents = Math.round(n * 100);
  } else if (k === 'pSa' || k === 'pSo' || k === 'pHol') {
    const n = Number(String(t.value).trim().replace(',', '.').replace('%', ''));
    if (!Number.isFinite(n) || n < 0 || n > 500) { toast('Bitte einen Prozentsatz zwischen 0 und 500 eingeben'); render(); return; }
    s[k === 'pSa' ? 'surchargeSaPct' : k === 'pSo' ? 'surchargeSoPct' : 'surchargeHolPct'] = n;
  }
  else if (k === 'gross') {
    const txt = String(t.value).trim().replace(/\./g, '').replace(',', '.').replace('€', '').trim();
    const n = txt === '' ? 0 : Number(txt);
    if (!Number.isFinite(n) || n < 0 || n > 100000) { toast('Bitte ein Monatsgehalt wie 3600,00 eingeben'); render(); return; }
    s.monthlyGrossCents = Math.round(n * 100);
  } else if (k === 'zkf' || k === 'kvZusatzPct' || k === 'churchRatePct') {
    const n = Number(String(t.value).trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > (k === 'zkf' ? 20 : 30)) { toast('Ungültiger Wert'); render(); return; }
    s[k] = n;
  } else if (k === 'pvKinder') {
    const n = Math.round(Number(String(t.value).trim()));
    if (!Number.isFinite(n) || n < 0 || n > 20) { toast('Bitte eine ganze Zahl eingeben'); render(); return; }
    s.pvKinder = n;
  } else if (k === 'churchTax' || k === 'overtimePayout') s[k] = t.checked;
  else if (k === 'accountStart') s.accountStart = t.value || null;
  else if (k === 'startBalance') {
    const m = parseHoursToMin(t.value);
    if (m === null) { toast('Ungültig – Beispiel: 12:30 oder −3,5'); render(); return; }
    s.startBalanceMin = m;
  }
  touchSettings();
});
dlg().addEventListener('click', (ev) => { if (ev.target === dlg()) closeDlg(); });
dlg().addEventListener('close', () => { dlg().innerHTML = ''; }); // auch bei Esc/Zurück-Geste

// ------------------------------------------------------------ Start
render();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__app = { get data() { return data; } }; // nur zum Testen/Debuggen
