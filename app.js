/* Arbeitszeit – Oberfläche, Speicherung, Sicherung. Berechnungen stehen in logic.js (window.AZ). */
(function () {
  'use strict';
  var A = window.AZ;

  /* ------------------------------------------------------------------ */
  /* Speicherung                                                          */
  /* ------------------------------------------------------------------ */

  var KEY_DATA = 'az.data.v1', KEY_META = 'az.meta.v1', KEY_RUN = 'az.running.v1', KEY_PREV = 'az.prev.v1';
  var storageOk = true;

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { storageOk = false; return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { storageOk = false; return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignorieren */ } }

  var data, meta, running;
  function loadAll() {
    var raw = lsGet(KEY_DATA), parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; if (lsGet(KEY_DATA)) lsSet(KEY_DATA + '.corrupt', raw); } }
    data = A.normalizeData(parsed || A.emptyData());
    try { meta = JSON.parse(lsGet(KEY_META) || '{}') || {}; } catch (e) { meta = {}; }
    running = lsGet(KEY_RUN) || null;
    if (running && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(running)) running = null;
  }
  function saveData() {
    var ok = lsSet(KEY_DATA, JSON.stringify(data));
    if (!ok) toast('Speichern nicht möglich. Bitte sofort eine Sicherung erstellen (Einstellungen).', { error: true, ms: 9000 });
    return ok;
  }
  function saveMeta() { lsSet(KEY_META, JSON.stringify(meta)); }
  function setRunning(v) { running = v; if (v) lsSet(KEY_RUN, v); else lsDel(KEY_RUN); }
  function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignorieren */ }
  }

  function uid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* weiter */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  var lastStamp = 0;
  function nowStamp() { lastStamp = Math.max(Date.now(), lastStamp + 1); return lastStamp; }

  /* ------------------------------------------------------------------ */
  /* Hilfen                                                               */
  /* ------------------------------------------------------------------ */

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmt(min) { return A.formatDuration(min, data.settings.displayFormat); }
  function fmtS(min) { return A.formatSigned(min, data.settings.displayFormat); }
  function cls(min) { return min > 0 ? 'pos' : min < 0 ? 'neg' : ''; }
  function ctx() { return A.buildContext(data); }
  function today() { return A.todayStr(); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  var toastTimer = null;
  function toast(msg, opt) {
    opt = opt || {};
    var el = $('#toast');
    el.className = 'toast' + (opt.error ? ' error' : '');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (opt.action ? '<button type="button" id="toastAction">' + esc(opt.action) + '</button>' : '');
    el.hidden = false;
    var b = $('#toastAction');
    if (b) b.addEventListener('click', function () { el.hidden = true; opt.onAction && opt.onAction(); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, opt.ms || 5000);
  }

  function downloadFile(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var file;
    try { file = new File([blob], name, { type: mime }); } catch (e) { file = null; }
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(function () { return true; }, function (e) {
        if (e && e.name === 'AbortError') return false;
        return triggerDownload(blob, name);
      });
    }
    return Promise.resolve(triggerDownload(blob, name));
  }
  function triggerDownload(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Dialog                                                               */
  /* ------------------------------------------------------------------ */

  var sheet = null;
  function openSheet(html, onReady) {
    sheet = $('#sheet');
    sheet.innerHTML = '<div class="sheet-inner">' + html + '</div>';
    if (!sheet.open) { try { sheet.showModal(); } catch (e) { sheet.setAttribute('open', ''); } }
    sheet.scrollTop = 0;
    onReady && onReady(sheet);
  }
  function closeSheet() { if (sheet && sheet.open) { try { sheet.close(); } catch (e) { sheet.removeAttribute('open'); } } }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                           */
  /* ------------------------------------------------------------------ */

  var ui = { month: A.monthOf(today()), settingsYear: new Date().getFullYear() };
  var TITLES = { heute: 'Heute', monat: 'Monat', konto: 'Arbeitszeitkonto', einstellungen: 'Einstellungen' };

  function route() {
    var r = (location.hash || '').replace(/^#\//, '').split('?')[0];
    return TITLES[r] ? r : 'heute';
  }
  function render() {
    var r = route(), view = $('#view');
    $$('.nav a').forEach(function (a) { if (a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#pageTitle').textContent = TITLES[r];
    $('#appbarExtra').innerHTML = '';
    var c = ctx();
    var html = r === 'heute' ? viewToday(c) : r === 'monat' ? viewMonth(c) : r === 'konto' ? viewAccount(c) : viewSettings(c);
    view.innerHTML = html;
    document.title = TITLES[r] + ' – Arbeitszeit';
    if (r === 'heute') tickElapsed();
    if (r === 'einstellungen') bindSettings();
  }
  function refresh() { var y = window.scrollY; render(); window.scrollTo(0, y); }

  /* ------------------------------------------------------------------ */
  /* Ansicht: Heute                                                       */
  /* ------------------------------------------------------------------ */

  function tagsFor(d) {
    var t = '';
    if (d.holiday) t += '<span class="tag tag-holiday">' + esc(d.holiday) + '</span>';
    if (d.absenceKinds.indexOf('vacation') >= 0) t += '<span class="tag tag-vac">Urlaub</span>';
    if (d.absenceKinds.indexOf('sick') >= 0) t += '<span class="tag tag-sick">Krank</span>';
    if (d.absenceKinds.indexOf('comp') >= 0) t += '<span class="tag">Zeitausgleich</span>';
    return t;
  }

  function entryLine(c, entryId, date) {
    var e = null;
    for (var i = 0; i < c.entries.length; i++) if (c.entries[i].id === entryId) { e = c.entries[i]; break; }
    if (!e) return '';
    var s = A.parseDateTime(e.start), en = A.parseDateTime(e.end);
    var text;
    if (s.date === en.date) text = A.formatTime(s.minute) + '–' + A.formatTime(en.minute);
    else if (s.date === date) text = A.formatTime(s.minute) + ' Uhr bis ' + A.formatDateShort(en.date) + ' ' + A.formatTime(en.minute);
    else text = 'Nachtschicht vom ' + A.formatDateShort(s.date) + ', bis ' + A.formatTime(en.minute);
    if (e.breakMin) text += ' · Pause ' + fmt(e.breakMin);
    return '<div>' + esc(text) + (e.note ? ' · ' + esc(e.note) : '') + '</div>';
  }

  function weekBars(w, todayStr) {
    var st = data.settings, max = 480;
    w.days.forEach(function (d) { max = Math.max(max, d.anrechenbarMin, d.sollMin); });
    max = Math.ceil(max / 120) * 120 + 60;
    var html = '<div class="weekbars" role="img" aria-label="Wochenübersicht Montag bis Sonntag">';
    w.days.forEach(function (d) {
      var hWork = d.workMin / max * 100, hCred = d.creditMin / max * 100, hSoll = d.sollMin / max * 100;
      html += '<div class="wb' + (d.date === todayStr ? ' today' : '') + '">' +
        '<span class="wb-val num">' + (d.workMin + d.creditMin ? esc(shortH(d.workMin + d.creditMin)) : '·') + '</span>' +
        '<div class="wb-track">' +
        (d.sollMin ? '<span class="wb-soll" style="bottom:' + hSoll + '%"></span>' : '') +
        '<div class="wb-credit" style="height:' + hCred + '%"></div><div class="wb-bar" style="height:' + hWork + '%"></div></div>' +
        '<span class="wb-day">' + A.weekdayShort(d.date) + '</span></div>';
    });
    return html + '</div><div class="legend"><span>▮ Arbeit</span><span>▨ angerechnet (Urlaub, Krank, Feiertag)</span><span>┄ Sollzeit</span></div>';
  }
  function shortH(min) { return data.settings.displayFormat === 'dec' ? (Math.round(min / 6) / 10).toString().replace('.', ',') : Math.floor(min / 60) + ':' + pad2(min % 60); }

  function viewToday(c) {
    var t = today(), d = A.dayResult(t, c), w = A.computeWeek(t, c), acc = A.computeAccount(c, t);
    var h = '<div class="today-head"><h2>' + esc(A.formatDateLong(t)) + '</h2><span>' + tagsFor(d) + '</span></div>';

    var backupDue = c.entries.length > 0 && (!meta.lastBackupAt || Date.now() - meta.lastBackupAt > 14 * 86400000);
    if (!storageOk) h += '<div class="errorbox" style="margin-bottom:12px">Der Browser erlaubt kein dauerhaftes Speichern (z. B. privates Fenster). Daten gehen beim Schließen verloren.</div>';
    if (backupDue) h += '<div class="notice" style="margin-bottom:12px"><div class="row between"><span>' + (meta.lastBackupAt ? 'Die letzte Sicherung ist älter als 14 Tage.' : 'Es gibt noch keine Sicherung deiner Daten.') + '</span><a class="btn" href="#/einstellungen" style="min-height:40px">Sichern</a></div></div>';

    if (running) {
      h += '<div class="stamp-card"><div class="small" style="opacity:.8">Eingestempelt seit ' + esc(A.formatDateShort(running.slice(0, 10)) + ' ' + running.slice(11)) + ' Uhr</div>' +
        '<div class="elapsed num" id="elapsed">–</div>' +
        '<div class="stack"><button class="btn btn-stamp" data-action="stamp-out" type="button">Ausstempeln</button>' +
        '<button class="btn btn-ghost btn-block" data-action="stamp-cancel" type="button">Einstempeln verwerfen</button></div></div>';
    } else {
      h += '<div class="stack"><button class="btn btn-stamp" data-action="stamp-in" type="button">Einstempeln</button>' +
        '<button class="btn btn-block" data-action="new-entry" type="button">Zeit nachtragen</button></div>' +
        '<p class="stamp-hint">Beim Ausstempeln kannst du Pause und Uhrzeiten noch ändern.</p>';
    }

    h += '<h2 class="section-title">Heute</h2><div class="ledger">' +
      lrow('Geleistete Arbeit', fmt(d.workMin)) +
      lrow('Sollzeit', fmt(d.sollMin), d.holiday && d.holidayReductionMin ? d.holiday + ': Sollzeit entfällt' : (d.holiday ? d.holiday + ' (Wochenende, keine Sollzeit)' : '')) +
      (d.creditMin ? lrow('Angerechnet', fmt(d.creditMin), [d.creditVacationMin ? 'Urlaub' : '', d.creditSickMin ? 'Krank' : '', d.creditHolidayMin ? 'Feiertag' : ''].filter(Boolean).join(', ')) : '') +
      '</div>';

    var todayParts = c.parts[t] || [];
    if (todayParts.length) {
      h += '<ul class="entry-list">';
      todayParts.forEach(function (p) {
        h += '<li><button type="button" class="entry-btn" data-action="edit-entry" data-id="' + esc(p.entryId) + '"><span>' + entryLine(c, p.entryId, t) + '</span><span class="num"><b>' + fmt(p.minutes) + '</b></span></button></li>';
      });
      h += '</ul>';
    }

    h += '<h2 class="section-title">Woche ' + w.week + '</h2>' + weekBars(w, t) +
      '<div class="ledger" style="margin-top:12px">' +
      lrow('Sollzeit der Woche', fmt(w.sum.sollMin), w.sum.holidayReductionMin ? 'ohne ' + fmt(w.sum.holidayReductionMin) + ' Feiertag' : '') +
      lrow('Geleistete Arbeit', fmt(w.sum.workMin)) +
      (w.sum.creditMin ? lrow('Angerechnet', fmt(w.sum.creditMin), 'Urlaub, Krank, Feiertag') : '') +
      '</div>';

    h += '<div class="kontostand"><span class="k-label">Arbeitszeitkonto heute</span><span class="k-val ' + cls(acc.balanceTodayMin) + '">' + esc(fmtS(acc.balanceTodayMin)) + '</span></div>' +
      '<p class="section-note" style="margin-top:6px"><a href="#/konto">Wie setzt sich das zusammen?</a></p>';
    return h;
  }

  function lrow(label, value, sub, valueClass, rowClass) {
    return '<div class="lrow ' + (rowClass || '') + '"><span class="llabel">' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="lval ' + (valueClass || '') + '">' + esc(value) + '</span></div>';
  }

  function tickElapsed() {
    var el = $('#elapsed');
    if (!el || !running) return;
    var S = A.parseDateTime(running), nowD = new Date();
    var cur = A.parseDateTime(A.todayStr(nowD) + 'T' + A.nowTimeStr(nowD));
    var mins = A.localToAbs(cur.date, cur.minute) - A.localToAbs(S.date, S.minute);
    el.textContent = mins < 0 ? '0:00' : A.formatDuration(mins, 'hm');
  }

  /* ------------------------------------------------------------------ */
  /* Ansicht: Monat                                                       */
  /* ------------------------------------------------------------------ */

  function viewMonth(c) {
    var t = today(), ym = ui.month, m = A.computeMonth(ym, c, t), acc = A.computeAccount(c, t);
    var status = A.accountStatus(acc, ym, t), isCur = ym === A.monthOf(t), isFuture = ym > A.monthOf(t);
    var tot = m.total, counted = isCur ? m.toDate : tot;

    var h = '<div class="monthnav"><button class="btn iconbtn" data-action="month-prev" type="button" aria-label="Vormonat">‹</button>' +
      '<div><h2>' + esc(A.formatMonth(ym)) + '</h2><div class="sub">' + (isCur ? 'laufender Monat' : isFuture ? 'noch nicht begonnen' : 'abgeschlossen') + '</div></div>' +
      '<button class="btn iconbtn" data-action="month-next" type="button" aria-label="Folgemonat">›</button></div>';
    if (ym !== A.monthOf(t)) h += '<div class="row end" style="margin:-6px 0 10px"><button class="btn btn-ghost" style="min-height:40px" data-action="month-today" type="button">Zum aktuellen Monat</button></div>';

    h += '<div class="row" style="margin-bottom:14px"><button class="btn btn-primary grow" data-action="new-entry" type="button">+ Arbeitszeit</button>' +
      '<button class="btn grow" data-action="new-absence" type="button">+ Urlaub / Krank</button></div>';

    if (c.errors.length) h += '<div class="errorbox" style="margin-bottom:12px">' + c.errors.length + ' Eintrag/Einträge sind ungültig und werden nicht gezählt.</div>';
    if (c.overlaps.length) h += '<div class="notice" style="margin-bottom:12px">Einige Zeiträume überschneiden sich (' + c.overlaps.length + '×). Überschneidende Zeit würde doppelt zählen – bitte prüfen.</div>';

    // Kennzahlen
    h += '<h2 class="section-title">Kennzahlen ' + esc(A.formatMonth(ym)) + '</h2><div class="ledger">' +
      lrow('Gesamt geleistete Arbeitsstunden', fmt(tot.workMin), 'jede Minute nur einmal gezählt', '', 'total') +
      lrow('Montag bis Freitag', fmt(tot.weekdayWorkMin), '', '', 'sub') +
      lrow('Samstag', fmt(tot.saturdayWorkMin), '', '', 'sub') +
      lrow('Sonntag', fmt(tot.sundayWorkMin), '', '', 'sub') +
      lrow('Davon an gesetzlichen Feiertagen', fmt(tot.holidayWorkMin),
        'Merkmal, nicht zusätzlich: Mo–Fr ' + fmt(tot.holidayWorkWeekdayMin) + ' · Sa ' + fmt(tot.holidayWorkSaturdayMin) + ' · So ' + fmt(tot.holidayWorkSundayMin), '', 'info') +
      '</div>';

    h += '<h2 class="section-title">Sollzeit und Anrechnung</h2><div class="ledger">' +
      lrow('Monatliche Sollstunden', fmt(tot.sollMin), 'Herleitung siehe unten', '', 'total') +
      lrow('Angerechnet: Urlaub', fmt(tot.creditVacationMin), 'nicht als Arbeit gezählt', '', 'sub') +
      lrow('Angerechnet: Krankheit', fmt(tot.creditSickMin), 'nicht als Arbeit gezählt', '', 'sub') +
      (tot.creditHolidayMin ? lrow('Angerechnet: Feiertag', fmt(tot.creditHolidayMin), 'Regel „Gutschrift“ aktiv', '', 'sub') : '') +
      lrow('Anrechenbare Ist-Zeit', fmt(tot.anrechenbarMin), 'Arbeit + Anrechnung', '', 'total') +
      '</div>';

    h += '<h2 class="section-title">Saldo</h2><div class="ledger">';
    if (isCur) {
      h += lrow('Sollzeit bis heute', fmt(counted.sollMin), 'künftige Tage zählen noch nicht') +
        lrow('Anrechenbare Ist-Zeit bis heute', fmt(counted.anrechenbarMin));
    }
    h += lrow(isCur ? 'Saldo bis heute (Über-/Minusstunden)' : 'Monatssaldo (Über-/Minusstunden)', fmtS(counted.saldoMin), 'anrechenbare Ist-Zeit − Sollzeit', cls(counted.saldoMin), 'final');
    h += '</div>';

    var row = acc.byMonth[ym];
    if (row) {
      h += '<div class="ledger" style="margin-top:10px">' + lrow('Übertrag aus Vormonat', fmtS(row.carryInMin), '', cls(row.carryInMin)) +
        lrow(isCur ? 'Stand Arbeitszeitkonto heute' : 'Stand Arbeitszeitkonto Monatsende', fmtS(row.balanceEndMin), 'Übertrag + Saldo', cls(row.balanceEndMin), 'final') + '</div>';
    } else {
      h += '<p class="section-note" style="margin-top:8px">' + (status === 'before' ? 'Dieser Monat liegt vor dem Beginn des Arbeitszeitkontos (Einstellungen).' : 'Dieser Monat geht erst nach seinem Beginn in das Konto ein.') + '</p>';
    }

    // Herleitung
    var s = m.soll;
    h += '<h2 class="section-title">So entsteht die Sollzeit</h2><details class="expl card" open><summary>Berechnung anzeigen</summary><div class="stack">' +
      '<p class="small muted">' + s.calendarDays + ' Kalendertage im ' + esc(A.formatMonth(ym)) + '. Regelmäßige Sollzeit je Wochentag laut Einstellungen.</p>' +
      '<div class="table-wrap"><table class="plain"><thead><tr><th>Wochentag</th><th>Tage</th><th>Soll/Tag</th><th>Summe</th></tr></thead><tbody>';
    s.perWeekday.forEach(function (p) {
      h += '<tr><td>' + A.WEEKDAY_LONG[p.weekday - 1] + '</td><td>' + p.count + '</td><td>' + fmt(p.regularSollMin) + '</td><td>' + fmt(p.totalMin) + '</td></tr>';
    });
    h += '<tr class="sum"><td colspan="3">Regelmäßige Sollzeit des Monats</td><td>' + fmt(s.regularSollMin) + '</td></tr></tbody></table></div>';
    if (s.holidays.length) {
      h += '<div class="table-wrap"><table class="plain"><thead><tr><th>Feiertag NRW</th><th>Wirkung auf die Sollzeit</th></tr></thead><tbody>';
      s.holidays.forEach(function (x) {
        var eff = x.onWeekend ? 'kein Einfluss (' + A.WEEKDAY_LONG[x.weekday - 1] + ')' : x.reductionMin ? '− ' + fmt(x.reductionMin) : x.creditMin ? 'Sollzeit bleibt, Gutschrift ' + fmt(x.creditMin) : 'kein Einfluss';
        h += '<tr><td>' + esc(A.formatDateShort(x.date) + ' ' + A.weekdayShort(x.date) + ' · ' + x.name) + '</td><td>' + esc(eff) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    } else h += '<p class="small">Keine gesetzlichen Feiertage in diesem Monat.</p>';
    h += '<div class="ledger"><div class="lrow final"><span class="llabel">Sollzeit des Monats</span><span class="lval">' + fmt(s.sollMin) + '</span></div></div></div></details>';

    // Wochen
    h += '<h2 class="section-title">Wochen</h2><div class="table-wrap"><table class="plain"><thead><tr><th>KW</th><th>Soll</th><th>Arbeit</th><th>Angerechnet</th><th>Saldo</th></tr></thead><tbody>';
    m.weeks.forEach(function (w) {
      h += '<tr><td>' + w.week + (w.partial ? '<span class="muted small"> (' + A.formatDateShort(w.from) + '–' + A.formatDateShort(w.to) + ')</span>' : '') + '</td><td>' + fmt(w.sum.sollMin) + '</td><td>' + fmt(w.sum.workMin) + '</td><td>' + fmt(w.sum.creditMin) + '</td><td class="' + cls(w.sum.saldoMin) + '">' + fmtS(w.sum.saldoMin) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (m.weeks.some(function (w) { return w.partial; })) h += '<p class="section-note" style="margin-top:6px">Wochen an Monatsgrenzen sind nur mit ihren Tagen in diesem Monat gerechnet.</p>';

    // Tage
    h += '<h2 class="section-title">Tage</h2><div class="days">';
    m.days.forEach(function (d) {
      var parts = c.parts[d.date] || [];
      var cc = d.creditMin ? ' <div>Angerechnet: ' + fmt(d.creditMin) + (d.creditVacationMin ? ' Urlaub' : d.creditSickMin ? ' Krank' : ' Feiertag') + '</div>' : '';
      h += '<button type="button" class="day ' + (d.weekday === 6 ? 'sat ' : d.weekday === 7 ? 'sun ' : '') + (d.date === t ? 'today ' : '') + (d.date > t ? 'future' : '') + '" data-action="open-day" data-date="' + d.date + '">' +
        '<span class="dnum">' + d.date.slice(8) + '.<span class="dwk">' + A.weekdayShort(d.date) + '</span></span>' +
        '<span class="dtext">' + tagsFor(d) + parts.map(function (p) { return entryLine(c, p.entryId, d.date); }).join('') + cc + '</span>' +
        '<span class="dval">' + (d.workMin ? fmt(d.workMin) : (d.sollMin || d.creditMin ? '–' : '')) + '<span class="dsoll">' + (d.sollMin ? 'Soll ' + fmt(d.sollMin) : '') + '</span></span></button>';
    });
    h += '</div><div class="row" style="margin-top:14px"><button class="btn" data-action="export-csv" type="button">Monat als CSV exportieren</button></div>';
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Ansicht: Konto                                                       */
  /* ------------------------------------------------------------------ */

  function viewAccount(c) {
    var t = today(), acc = A.computeAccount(c, t), st = data.settings;
    var h = '<div class="card"><div class="small muted">Stand heute, ' + esc(A.formatDate(t)) + '</div>' +
      '<div class="kontostand" style="border-top:0"><span class="k-label">Arbeitszeitkonto</span><span class="k-val ' + cls(acc.balanceTodayMin) + '">' + esc(fmtS(acc.balanceTodayMin)) + '</span></div>' +
      '<p class="small muted" style="margin-top:8px">Monatssaldo = anrechenbare Ist-Zeit − monatliche Sollzeit. Der Saldo wird in den Folgemonat übertragen. Im laufenden Monat zählt die Sollzeit nur bis einschließlich heute.</p></div>';

    h += '<h2 class="section-title">Monate</h2>';
    if (!acc.rows.length) h += '<div class="notice">Noch keine Monate im Konto. Trage Arbeitszeiten ein oder lege in den Einstellungen den Beginn fest.</div>';
    acc.rows.slice().reverse().forEach(function (r, i) {
      var x = r.counted;
      h += '<details class="account-item"' + (i === 0 ? ' open' : '') + '><summary><span class="m">' + esc(A.formatMonth(r.ym)) + (r.isCurrent ? '<span class="muted small" style="font-family:var(--font-ui);font-weight:400"> · bis heute</span>' : '') + '</span>' +
        '<span class="val ' + cls(x.saldoMin) + '"><span class="col-label">Saldo</span>' + fmtS(x.saldoMin) + '</span>' +
        '<span class="val ' + cls(r.balanceEndMin) + '"><span class="col-label">Konto</span>' + fmtS(r.balanceEndMin) + '</span></summary><div class="body"><div class="ledger" style="border:0;padding:0">' +
        lrow('Übertrag aus Vormonat', fmtS(r.carryInMin), '', cls(r.carryInMin)) +
        lrow('Sollzeit' + (r.isCurrent ? ' bis heute' : ''), fmt(x.sollMin), x.holidayReductionMin ? 'nach Abzug von ' + fmt(x.holidayReductionMin) + ' Feiertag' : '') +
        lrow('Geleistete Arbeit', fmt(x.workMin)) +
        lrow('Angerechnet', fmt(x.creditMin), 'Urlaub ' + fmt(x.creditVacationMin) + ' · Krank ' + fmt(x.creditSickMin) + (x.creditHolidayMin ? ' · Feiertag ' + fmt(x.creditHolidayMin) : '')) +
        lrow('Saldo', fmtS(x.saldoMin), '', cls(x.saldoMin), 'total') +
        lrow('Kontostand', fmtS(r.balanceEndMin), '', cls(r.balanceEndMin), 'final') +
        '</div><div class="row end" style="margin:8px 0"><button class="btn" data-action="goto-month" data-ym="' + r.ym + '" type="button">Monat öffnen</button></div></div></details>';
    });
    if (acc.startBalanceMin) h += '<p class="section-note">Startsaldo bei Kontobeginn (' + esc(A.formatMonth(acc.startYm)) + '): ' + esc(fmtS(acc.startBalanceMin)) + '</p>';
    h += '<h2 class="section-title">Verwendete Regeln</h2>' + rulesCard(st);
    return h;
  }

  function rulesCard(st) {
    var wd = A.WEEKDAY_LONG.map(function (n, i) { return n.slice(0, 2) + ' ' + fmt(st.sollMinutesByWeekday[i]); }).join(' · ');
    var week = st.sollMinutesByWeekday.reduce(function (a, b) { return a + b; }, 0);
    return '<div class="card"><ul style="margin:0;padding-left:18px" class="stack small">' +
      '<li>Sollzeit je Wochentag: ' + esc(wd) + ' (Woche: ' + fmt(week) + ').</li>' +
      '<li>Gesetzliche Feiertage in Nordrhein-Westfalen ' + (st.holidayMode === 'credit' ? 'lassen die Sollzeit bestehen, die Zeit wird separat gutgeschrieben (Regel „Gutschrift“).' : 'reduzieren die Sollzeit, wenn sie auf einen Tag mit Sollzeit fallen (Mo–Fr). Fällt ein Feiertag auf Samstag oder Sonntag, ändert sich nichts.') + '</li>' +
      '<li>Urlaub ' + (st.creditVacation ? 'wird' : 'wird nicht') + ' und Krankheit ' + (st.creditSick ? 'wird' : 'wird nicht') + ' mit der Tagessollzeit angerechnet – getrennt von geleisteter Arbeit.</li>' +
      '<li>Zeitausgleich (Überstundenabbau) wird nicht angerechnet und senkt dadurch das Konto.</li>' +
      '<li>Jede Arbeitsminute zählt genau einmal. Samstag, Sonntag und Feiertag sind Merkmale des Kalendertags; Nachtschichten werden um Mitternacht minutengenau aufgeteilt.</li>' +
      '<li>Zeiten gelten in deutscher Ortszeit inklusive Sommer-/Winterzeit.</li></ul></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Ansicht: Einstellungen                                               */
  /* ------------------------------------------------------------------ */

  function viewSettings(c) {
    var st = data.settings;
    var h = '<h2 class="section-title">Sollzeit pro Woche</h2><div class="card"><form id="formSoll" autocomplete="off">' +
      '<p class="section-note">Regelmäßige Arbeitszeit je Wochentag (Stunden:Minuten). Standard: Mo–Fr je 8:00 = 40:00 pro Woche.</p><div class="weekfields">';
    A.WEEKDAY_LONG.forEach(function (n, i) {
      h += '<label>' + n + '<input type="text" inputmode="text" name="soll' + i + '" value="' + esc(A.formatDuration(st.sollMinutesByWeekday[i], 'hm')) + '" aria-label="Sollzeit ' + n + '"></label>';
    });
    h += '</div><div class="num small muted" id="weekSum"></div>' +
      '<fieldset style="margin-top:14px"><legend>Gesetzliche Feiertage (Nordrhein-Westfalen) an Tagen mit Sollzeit</legend><div class="segment">' +
      '<label><input type="radio" name="holidayMode" value="reduce"' + (st.holidayMode === 'reduce' ? ' checked' : '') + '><span>Sollzeit entfällt</span></label>' +
      '<label><input type="radio" name="holidayMode" value="credit"' + (st.holidayMode === 'credit' ? ' checked' : '') + '><span>Gutschrift</span></label></div>' +
      '<p class="section-note" style="margin-top:6px">„Sollzeit entfällt“ ist die Standardregel. Bei „Gutschrift“ bleibt die Sollzeit stehen und der Feiertag wird getrennt angerechnet – das Ergebnis ist gleich, nur die Anzeige ist anders.</p></fieldset>' +
      '<label class="check"><input type="checkbox" name="creditVacation"' + (st.creditVacation ? ' checked' : '') + '><span>Urlaub mit der Tagessollzeit anrechnen</span></label>' +
      '<label class="check"><input type="checkbox" name="creditSick"' + (st.creditSick ? ' checked' : '') + '><span>Krankheit mit der Tagessollzeit anrechnen</span></label>' +
      '<fieldset><legend>Anzeige der Dauer</legend><div class="segment">' +
      '<label><input type="radio" name="displayFormat" value="hm"' + (st.displayFormat === 'hm' ? ' checked' : '') + '><span>8:30</span></label>' +
      '<label><input type="radio" name="displayFormat" value="dec"' + (st.displayFormat === 'dec' ? ' checked' : '') + '><span>8,50</span></label></div></fieldset>' +
      '<div class="errorbox" id="sollErr" hidden></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Einstellungen speichern</button></form></div>';

    h += '<h2 class="section-title">Arbeitszeitkonto</h2><div class="card"><form id="formAccount" autocomplete="off">' +
      '<label>Beginn des Kontos<input type="month" name="startMonth" value="' + esc(st.accountStartMonth || '') + '"><small>Leer lassen: Das Konto beginnt mit dem ersten Monat, in dem Daten vorhanden sind.</small></label>' +
      '<label>Startsaldo bei Kontobeginn<input type="text" name="startBalance" inputmode="text" value="' + esc(A.formatDuration(st.startBalanceMin, 'hm')) + '"><small>Zum Beispiel 12:30 oder -3:00 – Stand aus deiner bisherigen Aufzeichnung.</small></label>' +
      '<div class="errorbox" id="accErr" hidden></div><button class="btn btn-primary btn-block" type="submit">Konto speichern</button></form></div>';

    var last = meta.lastBackupAt ? new Date(meta.lastBackupAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie';
    h += '<h2 class="section-title">Sicherung und Gerätewechsel</h2><div class="card stack">' +
      '<p class="small">Die Daten liegen nur in diesem Browser auf diesem Gerät. Mit einer Sicherungsdatei kannst du sie sichern, auf ein anderes Gerät übertragen oder dort mit vorhandenen Daten zusammenführen.</p>' +
      '<p class="small muted">Letzte Sicherung: ' + esc(last) + ' · ' + c.entries.length + ' Arbeitszeiten, ' + c.absences.length + ' Abwesenheiten</p>' +
      '<div class="row"><button class="btn btn-primary grow" data-action="export-backup" type="button">Sicherung erstellen</button>' +
      '<button class="btn grow" data-action="import-backup" type="button">Sicherung laden</button></div>' +
      '<input type="file" id="fileImport" accept=".json,application/json" hidden>' +
      (lsGet(KEY_PREV) ? '<button class="btn btn-ghost btn-block" data-action="restore-prev" type="button">Stand vor dem letzten Import wiederherstellen</button>' : '') +
      '</div>';

    h += '<h2 class="section-title">Feiertage Nordrhein-Westfalen</h2><div class="card"><div class="chips" role="group" aria-label="Jahr">';
    var y0 = new Date().getFullYear();
    [y0 - 1, y0, y0 + 1, y0 + 2].forEach(function (y) { h += '<button type="button" class="chip" data-action="holiday-year" data-year="' + y + '" aria-pressed="' + (ui.settingsYear === y) + '">' + y + '</button>'; });
    h += '</div><div class="table-wrap"><table class="plain"><tbody>';
    var hol = A.holidaysNRW(ui.settingsYear);
    Object.keys(hol).sort().forEach(function (d) {
      var wd = A.isoWeekday(d);
      h += '<tr><td>' + esc(hol[d]) + '</td><td>' + esc(A.weekdayShort(d) + ', ' + A.formatDate(d)) + '</td><td class="muted">' + (wd >= 6 ? 'Wochenende – ohne Wirkung auf Soll' : 'reduziert Soll') + '</td></tr>';
    });
    h += '</tbody></table></div></div>';

    h += '<h2 class="section-title">Verwendete Regeln</h2>' + rulesCard(st);

    h += '<h2 class="section-title">App</h2><div class="card stack small">' +
      '<p>Version ' + A.VERSION + ' · ' + (isStandalone() ? 'läuft als installierte App' : 'läuft im Browser') + '</p>' +
      '<p class="muted">iPhone: In Safari auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Windows: In Edge oder Chrome in der Adressleiste auf „App installieren“ klicken.</p>' +
      '<button class="btn btn-danger btn-block" data-action="delete-all" type="button">Alle Daten auf diesem Gerät löschen</button></div>';
    return h;
  }
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }

  function bindSettings() {
    var f = $('#formSoll');
    function updSum() {
      var tot = 0, bad = false;
      for (var i = 0; i < 7; i++) { var v = A.parseDuration(f['soll' + i].value); if (v === null || v < 0) bad = true; else tot += v; }
      $('#weekSum').textContent = bad ? '' : 'Wochensumme: ' + A.formatDuration(tot, 'hm') + ' Stunden';
    }
    f.addEventListener('input', updSum); updSum();
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var soll = [], err = $('#sollErr');
      for (var i = 0; i < 7; i++) {
        var v = A.parseDuration(f['soll' + i].value);
        if (v === null || v < 0 || v > 1440) { err.textContent = 'Ungültige Sollzeit bei ' + A.WEEKDAY_LONG[i] + '. Beispiel: 8:00 oder 7,5.'; err.hidden = false; f['soll' + i].focus(); return; }
        soll.push(v);
      }
      err.hidden = true;
      var s = Object.assign({}, data.settings, {
        sollMinutesByWeekday: soll, holidayMode: f.holidayMode.value, displayFormat: f.displayFormat.value,
        creditVacation: f.creditVacation.checked, creditSick: f.creditSick.checked, updatedAt: nowStamp()
      });
      data.settings = A.normalizeSettings(s); saveData(); toast('Einstellungen gespeichert'); refresh();
    });
    var g = $('#formAccount');
    g.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = $('#accErr'), bal = A.parseDuration(g.startBalance.value.trim() === '' ? '0' : g.startBalance.value);
      if (bal === null) { err.textContent = 'Ungültiger Startsaldo. Beispiel: 12:30 oder -3:00.'; err.hidden = false; return; }
      err.hidden = true;
      data.settings = A.normalizeSettings(Object.assign({}, data.settings, { accountStartMonth: g.startMonth.value || null, startBalanceMin: bal, updatedAt: nowStamp() }));
      saveData(); toast('Konto gespeichert'); refresh();
    });
    var fi = $('#fileImport');
    fi.addEventListener('change', function () {
      var file = fi.files && fi.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () { handleImportText(String(rd.result)); fi.value = ''; };
      rd.onerror = function () { toast('Die Datei konnte nicht gelesen werden.', { error: true }); };
      rd.readAsText(file);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formular: Arbeitszeit                                                */
  /* ------------------------------------------------------------------ */

  function openEntrySheet(opts) {
    var e = opts.entry, isNew = !e;
    var now = new Date(), t = today();
    var sDate, sTime, eDate, eTime, br, bs, note;
    if (e) {
      var ps = A.parseDateTime(e.start), pe = A.parseDateTime(e.end);
      sDate = ps.date; sTime = A.formatTime(ps.minute); eDate = pe.date; eTime = A.formatTime(pe.minute); br = e.breakMin; bs = e.breakStart || ''; note = e.note || '';
    } else if (opts.fromRunning) {
      var rs = A.parseDateTime(opts.fromRunning);
      sDate = rs.date; sTime = A.formatTime(rs.minute); eDate = A.todayStr(now); eTime = A.nowTimeStr(now); br = 0; bs = ''; note = '';
    } else {
      sDate = opts.date || t; sTime = '08:00'; eDate = sDate; eTime = '16:30'; br = 30; bs = ''; note = '';
    }
    var h = '<h2>' + (isNew ? 'Arbeitszeit eintragen' : 'Arbeitszeit bearbeiten') + '</h2><form id="formEntry" autocomplete="off" novalidate>' +
      '<div class="field-row"><label>Beginn Datum<input type="date" name="sDate" value="' + sDate + '" required></label><label>Beginn Uhrzeit<input type="time" name="sTime" value="' + sTime + '" required></label></div>' +
      '<div class="field-row"><label>Ende Datum<input type="date" name="eDate" value="' + eDate + '" required></label><label>Ende Uhrzeit<input type="time" name="eTime" value="' + eTime + '" required></label></div>' +
      '<div class="field-row"><label>Pause (Minuten)<input type="text" name="br" inputmode="numeric" pattern="[0-9]*" value="' + br + '"></label>' +
      '<label>Pause ab (optional)<input type="time" name="bs" value="' + bs + '"></label></div>' +
      '<p class="section-note" style="margin-top:-6px">Bei Nachtschichten: „Pause ab“ legt fest, wann die Pause genommen wurde. Ohne Angabe wird sie anteilig auf beide Tage verteilt.</p>' +
      '<label>Notiz (optional)<input type="text" name="note" maxlength="120" value="' + esc(note) + '"></label>' +
      '<div class="preview" id="preview" aria-live="polite"></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" type="submit">Speichern</button><button class="btn" type="button" data-action="close-sheet">Abbrechen</button>' +
      (isNew ? '' : '<button class="btn btn-danger" type="button" id="delEntry">Löschen</button>') + '</div></form>';

    openSheet(h, function (root) {
      var f = $('#formEntry', root), endTouched = !isNew && !opts.fromRunning ? true : false;
      if (opts.fromRunning) endTouched = true;
      function read() {
        var brv = f.br.value.trim() === '' ? 0 : Number(f.br.value.trim());
        return { id: e ? e.id : 'tmp', start: f.sDate.value + 'T' + f.sTime.value, end: f.eDate.value + 'T' + f.eTime.value,
          breakMin: isFinite(brv) && brv >= 0 && Math.floor(brv) === brv ? brv : NaN, breakStart: f.bs.value || null, note: f.note.value.trim() };
      }
      function autoEndDate() {
        if (endTouched || !f.sDate.value || !f.sTime.value || !f.eTime.value) return;
        f.eDate.value = f.eTime.value <= f.sTime.value ? A.addDays(f.sDate.value, 1) : f.sDate.value;
      }
      function update() {
        autoEndDate();
        var v = read(), box = $('#preview', root), out;
        if (isNaN(v.breakMin)) { box.innerHTML = '<div class="bad">Die Pause muss eine ganze Zahl in Minuten sein.</div>'; return null; }
        if (!A.isValidDate(f.sDate.value) || !A.isValidDate(f.eDate.value) || !f.sTime.value || !f.eTime.value) { box.innerHTML = '<div class="muted">Bitte Datum und Uhrzeit angeben.</div>'; return null; }
        var res = A.validateEntry(v, data.entries);
        if (!res.ok) { box.innerHTML = '<div class="bad">' + esc(res.errors[0]) + '</div>'; return null; }
        var total = res.segments.reduce(function (a, s) { return a + s.minutes; }, 0);
        out = '<div><b>Arbeitszeit netto: ' + fmt(total) + '</b>' + (v.breakMin ? ' <span class="muted">(Pause ' + fmt(v.breakMin) + ' abgezogen)</span>' : '') + '</div><ul>';
        A.describeSplit(v).forEach(function (s) {
          out += '<li><span>' + esc(A.weekdayShort(s.date) + ' ' + A.formatDate(s.date)) + (s.holiday ? ' · ' + esc(s.holiday) : '') + (s.category === 'saturday' ? ' · Samstag' : s.category === 'sunday' ? ' · Sonntag' : '') + '</span><b class="num">' + fmt(s.minutes) + '</b></li>';
        });
        out += '</ul>';
        res.warnings.forEach(function (w) { out += '<div class="warnline">' + esc(w) + '</div>'; });
        box.innerHTML = out;
        return v;
      }
      f.eDate.addEventListener('change', function () { endTouched = true; update(); });
      f.addEventListener('input', update); f.addEventListener('change', update); update();
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = update(); if (!v) { toast('Bitte die markierten Angaben prüfen.', { error: true }); return; }
        var rec = { id: e ? e.id : uid(), start: v.start, end: v.end, breakMin: v.breakMin, breakStart: v.breakMin > 0 ? v.breakStart : null, note: v.note, updatedAt: nowStamp() };
        data.entries = data.entries.filter(function (x) { return x.id !== rec.id; }); data.entries.push(rec);
        delete data.deleted[rec.id];
        if (opts.fromRunning) setRunning(null);
        saveData(); closeSheet(); toast(isNew ? 'Gespeichert' : 'Änderung gespeichert'); refresh();
      });
      var del = $('#delEntry', root);
      if (del) del.addEventListener('click', function () {
        var removed = e;
        data.entries = data.entries.filter(function (x) { return x.id !== removed.id; }); data.deleted[removed.id] = nowStamp(); saveData(); closeSheet(); refresh();
        toast('Eintrag gelöscht', { action: 'Rückgängig', ms: 8000, onAction: function () {
          delete data.deleted[removed.id]; data.entries.push(Object.assign({}, removed, { updatedAt: nowStamp() })); saveData(); refresh();
        } });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formular: Abwesenheit                                                */
  /* ------------------------------------------------------------------ */

  function openAbsenceSheet(opts) {
    var a = opts.absence, isNew = !a, d0 = (a && a.from) || opts.date || today();
    var h = '<h2>' + (isNew ? 'Urlaub, Krankheit oder Zeitausgleich' : 'Abwesenheit bearbeiten') + '</h2><form id="formAbs" autocomplete="off" novalidate>' +
      '<fieldset><legend>Art</legend><div class="segment">' +
      ['vacation', 'sick', 'comp'].map(function (k) { return '<label><input type="radio" name="kind" value="' + k + '"' + ((a ? a.kind : 'vacation') === k ? ' checked' : '') + '><span>' + A.ABSENCE_KINDS[k] + '</span></label>'; }).join('') +
      '</div></fieldset>' +
      '<div class="field-row"><label>Von<input type="date" name="from" value="' + d0 + '" required></label><label>Bis<input type="date" name="to" value="' + ((a && a.to) || d0) + '" required></label></div>' +
      '<label>Anrechnung pro Tag (optional)<input type="text" name="mpd" inputmode="text" placeholder="leer = volle Tagessollzeit" value="' + (a && a.minutesPerDay ? esc(A.formatDuration(a.minutesPerDay, 'hm')) : '') + '"><small>Zum Beispiel 4:00 für einen halben Tag.</small></label>' +
      '<label>Notiz (optional)<input type="text" name="note" maxlength="120" value="' + esc(a ? a.note : '') + '"></label>' +
      '<div class="preview" id="absPreview" aria-live="polite"></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" type="submit">Speichern</button><button class="btn" type="button" data-action="close-sheet">Abbrechen</button>' +
      (isNew ? '' : '<button class="btn btn-danger" type="button" id="delAbs">Löschen</button>') + '</div></form>';
    openSheet(h, function (root) {
      var f = $('#formAbs', root), toTouched = !isNew;
      function build() {
        var mpdTxt = f.mpd.value.trim(), mpd = mpdTxt === '' ? null : A.parseDuration(mpdTxt);
        return { id: a ? a.id : 'tmp', kind: f.kind.value, from: f.from.value, to: f.to.value, minutesPerDay: mpd, note: f.note.value.trim(), mpdBad: mpdTxt !== '' && (mpd === null || mpd <= 0) };
      }
      function update() {
        if (!toTouched && f.from.value && (!f.to.value || f.to.value < f.from.value)) f.to.value = f.from.value;
        var v = build(), box = $('#absPreview', root);
        if (!A.isValidDate(v.from) || !A.isValidDate(v.to)) { box.innerHTML = '<div class="muted">Bitte Datum angeben.</div>'; return null; }
        if (v.to < v.from) { box.innerHTML = '<div class="bad">„Bis“ liegt vor „Von“.</div>'; return null; }
        if (v.mpdBad) { box.innerHTML = '<div class="bad">Ungültige Zeit pro Tag. Beispiel: 4:00 oder 7,5.</div>'; return null; }
        var tmp = A.buildContext({ settings: data.settings, entries: [], absences: [Object.assign({}, v, { updatedAt: 1 })] });
        var n = 0, credit = 0, nr = 0, span = A.dayNumber(v.to) - A.dayNumber(v.from) + 1;
        if (span > 400) { box.innerHTML = '<div class="bad">Der Zeitraum ist zu lang (höchstens 400 Tage).</div>'; return null; }
        for (var i = 0; i < span; i++) { var dd = A.dayResult(A.addDays(v.from, i), tmp); if (dd.creditMin) { n++; credit += dd.creditMin; } else if (dd.sollMin) nr++; }
        box.innerHTML = '<div><b>' + span + ' Kalendertag' + (span === 1 ? '' : 'e') + '</b></div><div class="small muted">Angerechnet an ' + n + ' Tag' + (n === 1 ? '' : 'en') + ' mit Sollzeit: ' + fmt(credit) + (v.kind === 'comp' ? ' – Zeitausgleich wird nicht angerechnet, die Sollzeit bleibt bestehen.' : ' (Wochenenden und Feiertage zählen nicht).') + '</div>';
        return v;
      }
      f.to.addEventListener('change', function () { toTouched = true; });
      f.addEventListener('input', update); f.addEventListener('change', update); update();
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = update(); if (!v) { toast('Bitte die Angaben prüfen.', { error: true }); return; }
        var rec = { id: a ? a.id : uid(), kind: v.kind, from: v.from, to: v.to, minutesPerDay: v.minutesPerDay, note: v.note, updatedAt: nowStamp() };
        data.absences = data.absences.filter(function (x) { return x.id !== rec.id; }); data.absences.push(rec); delete data.deleted[rec.id];
        saveData(); closeSheet(); toast('Gespeichert'); refresh();
      });
      var del = $('#delAbs', root);
      if (del) del.addEventListener('click', function () {
        var removed = a;
        data.absences = data.absences.filter(function (x) { return x.id !== removed.id; }); data.deleted[removed.id] = nowStamp(); saveData(); closeSheet(); refresh();
        toast('Abwesenheit gelöscht', { action: 'Rückgängig', ms: 8000, onAction: function () {
          delete data.deleted[removed.id]; data.absences.push(Object.assign({}, removed, { updatedAt: nowStamp() })); saveData(); refresh();
        } });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tagesdetail                                                          */
  /* ------------------------------------------------------------------ */

  function openDaySheet(date) {
    var c = ctx(), d = A.dayResult(date, c);
    var h = '<h2>' + esc(A.formatDateLong(date)) + '</h2><div style="margin-bottom:8px">' + tagsFor(d) + (d.isSaturday ? '<span class="tag">Samstag</span>' : '') + (d.isSunday ? '<span class="tag">Sonntag</span>' : '') + '</div>' +
      '<div class="ledger">' + lrow('Geleistete Arbeit', fmt(d.workMin)) + lrow('Sollzeit', fmt(d.sollMin), d.holiday && d.holidayReductionMin ? d.holiday + ': Sollzeit entfällt' : '') +
      (d.creditMin ? lrow('Angerechnet', fmt(d.creditMin)) : '') + lrow('Saldo des Tages', fmtS(d.saldoMin), '', cls(d.saldoMin), 'total') + '</div>';
    var parts = c.parts[date] || [];
    if (parts.length) {
      h += '<ul class="entry-list">';
      parts.forEach(function (p) { h += '<li><button type="button" class="entry-btn" data-action="edit-entry" data-id="' + esc(p.entryId) + '"><span>' + entryLine(c, p.entryId, date) + '</span><span class="num"><b>' + fmt(p.minutes) + '</b></span></button></li>'; });
      h += '</ul>';
    }
    var abs = c.absences.filter(function (x) { return x.from <= date && date <= x.to; });
    if (abs.length) {
      h += '<ul class="entry-list">';
      abs.forEach(function (x) { h += '<li><button type="button" class="entry-btn" data-action="edit-absence" data-id="' + esc(x.id) + '"><span>' + A.ABSENCE_KINDS[x.kind] + '<small>' + esc(A.formatDateShort(x.from) + ' – ' + A.formatDateShort(x.to) + (x.note ? ' · ' + x.note : '')) + '</small></span><span>›</span></button></li>'; });
      h += '</ul>';
    }
    h += '<div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="new-entry" data-date="' + date + '">+ Arbeitszeit</button>' +
      '<button class="btn" type="button" data-action="new-absence" data-date="' + date + '">+ Urlaub / Krank</button><button class="btn" type="button" data-action="close-sheet">Schließen</button></div>';
    openSheet(h);
  }

  /* ------------------------------------------------------------------ */
  /* Sicherung, Import, Export                                            */
  /* ------------------------------------------------------------------ */

  function exportBackup() {
    var now = new Date(), name = 'arbeitszeit-sicherung-' + A.todayStr(now) + '.json';
    downloadFile(name, JSON.stringify(A.makeBackup(data, now), null, 1), 'application/json').then(function (ok) {
      if (ok === false) return;
      meta.lastBackupAt = Date.now(); saveMeta(); toast('Sicherung erstellt: ' + name, { ms: 7000 }); if (route() === 'einstellungen') refresh();
    });
  }

  function handleImportText(text) {
    var incoming;
    try { incoming = A.parseBackup(text); } catch (e) { toast(e.message, { error: true, ms: 8000 }); return; }
    var merged = A.mergeData(data, incoming);
    var h = '<h2>Sicherung laden</h2><div class="ledger">' +
      lrow('In der Datei', incoming.entries.length + ' Arbeitszeiten, ' + incoming.absences.length + ' Abwesenheiten') +
      lrow('Auf diesem Gerät', data.entries.length + ' Arbeitszeiten, ' + data.absences.length + ' Abwesenheiten') + '</div>' +
      '<div class="card" style="margin-top:12px"><b>Zusammenführen (empfohlen)</b><p class="small muted" style="margin-top:4px">Beide Stände werden vereint. Bei Einträgen mit gleicher Kennung gewinnt die neuere Änderung; Löschungen werden übernommen. Ergebnis: ' + merged.report.added + ' neu, ' + merged.report.updated + ' aktualisiert, ' + merged.report.removed + ' entfernt' + (merged.report.settingsReplaced ? ', Einstellungen aus der Datei' : '') + '.</p>' +
      '<button class="btn btn-primary btn-block" style="margin-top:10px" type="button" id="doMerge">Zusammenführen</button></div>' +
      '<div class="card" style="margin-top:10px"><b>Alles ersetzen</b><p class="small muted" style="margin-top:4px">Der Stand auf diesem Gerät wird durch die Datei ersetzt. Der bisherige Stand bleibt einmalig zur Wiederherstellung erhalten.</p>' +
      '<button class="btn btn-danger btn-block" style="margin-top:10px" type="button" id="doReplace">Ersetzen</button></div>' +
      '<div class="sheet-actions"><button class="btn" type="button" data-action="close-sheet">Abbrechen</button></div>';
    openSheet(h, function (root) {
      $('#doMerge', root).addEventListener('click', function () {
        lsSet(KEY_PREV, JSON.stringify(data)); data = merged.data; saveData(); closeSheet(); toast('Zusammengeführt', { ms: 6000 }); refresh();
      });
      $('#doReplace', root).addEventListener('click', function () {
        lsSet(KEY_PREV, JSON.stringify(data)); data = incoming; saveData(); closeSheet(); toast('Daten ersetzt', { ms: 6000 }); refresh();
      });
    });
  }

  function exportCsv() {
    var c = ctx(), m = A.computeMonth(ui.month, c, today());
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var dec = function (min) { return (Math.round(min / 60 * 100) / 100).toFixed(2).replace('.', ','); };
    var rows = [['Datum', 'Wochentag', 'Feiertag', 'Soll (h)', 'Arbeit gesamt (h)', 'Mo-Fr (h)', 'Samstag (h)', 'Sonntag (h)', 'davon Feiertag (h)', 'Angerechnet Urlaub (h)', 'Angerechnet Krank (h)', 'Angerechnet Feiertag (h)', 'Saldo (h)']];
    m.days.forEach(function (d) {
      rows.push([A.formatDate(d.date), A.weekdayShort(d.date), d.holiday || '', dec(d.sollMin), dec(d.workMin), dec(d.weekdayWorkMin), dec(d.saturdayWorkMin), dec(d.sundayWorkMin), dec(d.holidayWorkMin), dec(d.creditVacationMin), dec(d.creditSickMin), dec(d.creditHolidayMin), dec(d.saldoMin)]);
    });
    var t = m.total;
    rows.push(['Summe', '', '', dec(t.sollMin), dec(t.workMin), dec(t.weekdayWorkMin), dec(t.saturdayWorkMin), dec(t.sundayWorkMin), dec(t.holidayWorkMin), dec(t.creditVacationMin), dec(t.creditSickMin), dec(t.creditHolidayMin), dec(t.saldoMin)]);
    var csv = '﻿' + rows.map(function (r) { return r.map(q).join(';'); }).join('\r\n');
    downloadFile('arbeitszeit-' + ui.month + '.csv', csv, 'text/csv');
  }

  /* ------------------------------------------------------------------ */
  /* Ereignisse                                                           */
  /* ------------------------------------------------------------------ */

  function findEntry(id) { return data.entries.filter(function (e) { return e.id === id; })[0]; }
  function findAbsence(id) { return data.absences.filter(function (e) { return e.id === id; })[0]; }

  var actions = {
    'stamp-in': function () { var n = new Date(); setRunning(A.todayStr(n) + 'T' + A.nowTimeStr(n)); refresh(); toast('Eingestempelt'); },
    'stamp-out': function () { openEntrySheet({ fromRunning: running }); },
    'stamp-cancel': function () { setRunning(null); refresh(); toast('Verworfen'); },
    'new-entry': function (el) { closeSheet(); openEntrySheet({ date: el.dataset.date || (route() === 'monat' && ui.month !== A.monthOf(today()) ? ui.month + '-01' : today()) }); },
    'edit-entry': function (el) { var e = findEntry(el.dataset.id); if (e) { closeSheet(); openEntrySheet({ entry: e }); } },
    'new-absence': function (el) { closeSheet(); openAbsenceSheet({ date: el.dataset.date || (ui.month === A.monthOf(today()) ? today() : ui.month + '-01') }); },
    'edit-absence': function (el) { var a = findAbsence(el.dataset.id); if (a) { closeSheet(); openAbsenceSheet({ absence: a }); } },
    'open-day': function (el) { openDaySheet(el.dataset.date); },
    'close-sheet': closeSheet,
    'month-prev': function () { ui.month = A.addMonths(ui.month, -1); refresh(); },
    'month-next': function () { ui.month = A.addMonths(ui.month, 1); refresh(); },
    'month-today': function () { ui.month = A.monthOf(today()); refresh(); },
    'goto-month': function (el) { ui.month = el.dataset.ym; location.hash = '#/monat'; },
    'export-csv': exportCsv,
    'export-backup': exportBackup,
    'import-backup': function () { var f = $('#fileImport'); if (f) f.click(); },
    'holiday-year': function (el) { ui.settingsYear = +el.dataset.year; refresh(); },
    'restore-prev': function () {
      try { var p = A.normalizeData(JSON.parse(lsGet(KEY_PREV))); data = p; saveData(); lsDel(KEY_PREV); toast('Vorheriger Stand wiederhergestellt'); refresh(); } catch (e) { toast('Wiederherstellung nicht möglich.', { error: true }); }
    },
    'delete-all': function () {
      openSheet('<h2>Alle Daten löschen?</h2><p class="small">Alle Arbeitszeiten, Abwesenheiten und Einstellungen auf diesem Gerät werden entfernt. Erstelle vorher eine Sicherung, wenn du die Daten noch brauchst.</p>' +
        '<div class="sheet-actions"><button class="btn btn-danger" type="button" id="reallyDelete">Endgültig löschen</button><button class="btn" type="button" data-action="close-sheet">Abbrechen</button></div>', function (root) {
        $('#reallyDelete', root).addEventListener('click', function () {
          lsSet(KEY_PREV, JSON.stringify(data)); data = A.normalizeData(A.emptyData()); setRunning(null); saveData(); closeSheet(); toast('Alle Daten gelöscht'); refresh();
        });
      });
    }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) { ev.preventDefault(); actions[el.dataset.action](el); return; }
    if (ev.target === $('#sheet')) closeSheet();
  });

  window.addEventListener('hashchange', function () { window.scrollTo(0, 0); render(); var v = $('#view'); v && v.focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { loadMetaOnly(); if (!$('#sheet').open) refresh(); } });
  function loadMetaOnly() { try { meta = JSON.parse(lsGet(KEY_META) || '{}') || {}; } catch (e) { /* ignorieren */ } }
  setInterval(function () { tickElapsed(); if (!document.hidden && route() === 'heute' && !$('#sheet').open && lastRenderDay !== today()) refresh(); }, 20000);
  var lastRenderDay = today();
  var origRender = render;
  render = function () { lastRenderDay = today(); origRender(); };

  /* ------------------------------------------------------------------ */
  /* Start                                                                */
  /* ------------------------------------------------------------------ */

  loadAll();
  requestPersistence();
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* Offline-Betrieb optional */ }); });
  }

  // Für Tests und Fehlersuche
  window.__az = { getData: function () { return data; }, render: refresh };
})();
