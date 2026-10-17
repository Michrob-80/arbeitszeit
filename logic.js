/*!
 * Arbeitszeit – Berechnungslogik
 *
 * Reines JavaScript ohne Abhängigkeiten. Läuft im Browser (window.AZ) und in Node (require).
 *
 * Grundsätze
 *  - Alle Uhrzeiten sind Ortszeit Deutschland (Europe/Berlin). Sommer-/Winterzeit wird nach den
 *    EU-Regeln berücksichtigt, damit Nachtschichten die tatsächlich verstrichenen Minuten zählen.
 *  - Alle Dauern sind ganze Minuten.
 *  - Jede Arbeitsminute gehört genau zu EINEM Kalendertag und damit zu genau EINER Hauptkategorie
 *    (Montag–Freitag, Samstag oder Sonntag). Feiertag ist ein zusätzliches Merkmal des Kalendertags
 *    und wird nie zur Gesamtzeit hinzuaddiert.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  var WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  var MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var ABSENCE_KINDS = { vacation: 'Urlaub', sick: 'Krank', comp: 'Zeitausgleich' };

  function pad(n, w) { return String(n).padStart(w || 2, '0'); }

  /* ------------------------------------------------------------------ */
  /* Datum                                                                */
  /* ------------------------------------------------------------------ */

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) throw new Error('Ungültiges Datum: ' + s);
    var y = +m[1], mo = +m[2], d = +m[3];
    var dn = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
    var dt = new Date(dn * 86400000);
    if (y < 1900 || y > 2200 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      throw new Error('Ungültiges Datum: ' + s);
    }
    return { y: y, m: mo, d: d, dn: dn };
  }
  function dayNumber(s) { return parseDate(s).dn; }
  function dateFromDayNumber(dn) {
    var dt = new Date(dn * 86400000);
    return pad(dt.getUTCFullYear(), 4) + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }
  function addDays(s, n) { return dateFromDayNumber(dayNumber(s) + n); }
  /** ISO-Wochentag: 1 = Montag … 7 = Sonntag (1.1.1970 war ein Donnerstag). */
  function isoWeekday(s) { return ((((dayNumber(s) + 3) % 7) + 7) % 7) + 1; }
  function isValidDate(s) { try { parseDate(s); return true; } catch (e) { return false; } }

  function isoWeek(s) {
    var dn = dayNumber(s);
    var thu = dn - isoWeekday(s) + 4;
    var y = new Date(thu * 86400000).getUTCFullYear();
    var jan1 = Math.floor(Date.UTC(y, 0, 1) / 86400000);
    return { year: y, week: Math.floor((thu - jan1) / 7) + 1 };
  }

  function parseYm(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(ym));
    if (!m || +m[2] < 1 || +m[2] > 12) throw new Error('Ungültiger Monat: ' + ym);
    return { y: +m[1], m: +m[2] };
  }
  function isValidYm(ym) { try { parseYm(ym); return true; } catch (e) { return false; } }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function monthDates(ym) {
    var p = parseYm(ym), n = daysInMonth(p.y, p.m), out = [];
    for (var i = 1; i <= n; i++) out.push(pad(p.y, 4) + '-' + pad(p.m) + '-' + pad(i));
    return out;
  }
  function addMonths(ym, n) {
    var p = parseYm(ym), t = p.y * 12 + (p.m - 1) + n;
    return pad(Math.floor(t / 12), 4) + '-' + pad((t % 12) + 1);
  }
  function monthRange(a, b) {
    var out = [], cur = a, guard = 0;
    while (cur <= b && guard++ < 2400) { out.push(cur); cur = addMonths(cur, 1); }
    return out;
  }
  function monthOf(dateStr) { return String(dateStr).slice(0, 7); }

  function todayStr(now) {
    var d = now || new Date();
    return pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function nowTimeStr(now) {
    var d = now || new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ------------------------------------------------------------------ */
  /* Gesetzliche Feiertage Nordrhein-Westfalen                            */
  /* ------------------------------------------------------------------ */

  /** Ostersonntag (Gregorianischer Kalender, Meeus/Jones/Butcher). */
  function easterSunday(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100;
    var d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return pad(y, 4) + '-' + pad(month) + '-' + pad(day);
  }

  var holidayCache = {};
  /**
   * Gesetzliche Feiertage in NRW (Feiertagsgesetz NW): Neujahr, Karfreitag, Ostermontag,
   * Tag der Arbeit, Christi Himmelfahrt, Pfingstmontag, Fronleichnam, Tag der Deutschen Einheit,
   * Allerheiligen, 1. und 2. Weihnachtstag. (Ostersonntag/Pfingstsonntag sind in NRW keine
   * gesetzlichen Feiertage im Sinne des Gesetzes; sie fallen ohnehin auf einen Sonntag.)
   * Rückgabe: { 'YYYY-MM-DD': 'Name' }
   */
  function holidaysNRW(y) {
    if (holidayCache[y]) return holidayCache[y];
    var e = easterSunday(y), y4 = pad(y, 4), map = {};
    map[y4 + '-01-01'] = 'Neujahr';
    map[addDays(e, -2)] = 'Karfreitag';
    map[addDays(e, 1)] = 'Ostermontag';
    map[y4 + '-05-01'] = 'Tag der Arbeit';
    map[addDays(e, 39)] = 'Christi Himmelfahrt';
    map[addDays(e, 50)] = 'Pfingstmontag';
    map[addDays(e, 60)] = 'Fronleichnam';
    map[y4 + '-10-03'] = 'Tag der Deutschen Einheit';
    map[y4 + '-11-01'] = 'Allerheiligen';
    map[y4 + '-12-25'] = '1. Weihnachtstag';
    map[y4 + '-12-26'] = '2. Weihnachtstag';
    holidayCache[y] = map;
    return map;
  }
  /** Name des gesetzlichen Feiertags oder null. */
  function getHoliday(dateStr) {
    var y = parseDate(dateStr).y;
    return holidaysNRW(y)[dateStr] || null;
  }

  /* ------------------------------------------------------------------ */
  /* Uhrzeit, Zeitzone Europe/Berlin                                      */
  /* ------------------------------------------------------------------ */

  function parseTime(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? '' : s).trim());
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Ungültige Uhrzeit: ' + s);
    return +m[1] * 60 + +m[2];
  }
  function formatTime(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function parseDateTime(s) {
    var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})$/.exec(String(s == null ? '' : s).trim());
    if (!m) throw new Error('Ungültiger Zeitpunkt: ' + s);
    parseDate(m[1]);
    return { date: m[1], minute: parseTime(m[2]) };
  }

  function lastSundayDayNumber(y, month) {
    var last = dayNumber(pad(y, 4) + '-' + pad(month) + '-' + pad(daysInMonth(y, month)));
    var wd = ((((last + 3) % 7) + 7) % 7) + 1;
    return last - (wd % 7);
  }
  /** Beginn/Ende der Sommerzeit als UTC-Minuten seit 1970 (EU: letzter Sonntag März/Oktober, 01:00 UTC). */
  function dstBounds(y) {
    return [lastSundayDayNumber(y, 3) * 1440 + 60, lastSundayDayNumber(y, 10) * 1440 + 60];
  }
  /** Ortszeit (Datum + Minute des Tages) -> absolute Minuten (UTC). Mehrdeutige Zeit: Sommerzeit. */
  function localToAbs(dateStr, minuteOfDay) {
    var L = dayNumber(dateStr) * 1440 + minuteOfDay;
    var b = dstBounds(parseDate(dateStr).y);
    var u2 = L - 120;
    if (u2 >= b[0] && u2 < b[1]) return u2;      // Sommerzeit (UTC+2)
    var u1 = L - 60;
    return u1;                                    // Winterzeit (UTC+1); Zeitlücke wird um 1 h nach vorn geschoben
  }
  function absToLocal(abs) {
    var y = new Date(abs * 60000).getUTCFullYear();
    var b = dstBounds(y);
    var off = abs >= b[0] && abs < b[1] ? 120 : 60;
    var L = abs + off, dn = Math.floor(L / 1440);
    return { date: dateFromDayNumber(dn), minute: L - dn * 1440 };
  }

  /* ------------------------------------------------------------------ */
  /* Formatierung und Eingabe (Deutsch)                                   */
  /* ------------------------------------------------------------------ */

  function formatDate(s) { var p = parseDate(s); return pad(p.d) + '.' + pad(p.m) + '.' + pad(p.y, 4); }
  function formatDateShort(s) { var p = parseDate(s); return pad(p.d) + '.' + pad(p.m) + '.'; }
  function formatDateLong(s) { return WEEKDAY_LONG[isoWeekday(s) - 1] + ', ' + formatDate(s); }
  function formatMonth(ym) { var p = parseYm(ym); return MONTH_NAMES[p.m - 1] + ' ' + p.y; }
  function weekdayShort(s) { return WEEKDAY_SHORT[isoWeekday(s) - 1]; }

  /** Dauer in Minuten -> "8:00" (hm) oder "8,00" (dec). */
  function formatDuration(min, mode) {
    min = Math.round(min || 0);
    var neg = min < 0, a = Math.abs(min);
    if (mode === 'dec') {
      var v = (Math.round((a / 60) * 100) / 100).toFixed(2).replace('.', ',');
      return (neg && v !== '0,00' ? '-' : '') + v;
    }
    return (neg ? '-' : '') + Math.floor(a / 60) + ':' + pad(a % 60);
  }
  /** Mit Vorzeichen: "+1:30", "-0:45", "0:00". */
  function formatSigned(min, mode) {
    min = Math.round(min || 0);
    if (min === 0) return formatDuration(0, mode);
    return (min > 0 ? '+' : '') + formatDuration(min, mode);
  }
  /** Eingabe wie "8:00", "8,5", "8.5", "-1:30", "+2" -> Minuten, sonst null. */
  function parseDuration(str) {
    if (str == null) return null;
    var t = String(str).trim().replace(/\s+/g, '').replace(/−/g, '-');
    if (!t) return null;
    var sign = 1;
    if (t[0] === '-') { sign = -1; t = t.slice(1); } else if (t[0] === '+') { t = t.slice(1); }
    var m = /^(\d+):(\d{1,2})$/.exec(t);
    if (m) { if (+m[2] > 59) return null; return sign * (+m[1] * 60 + +m[2]); }
    m = /^(\d+)(?:[.,](\d+))?$/.exec(t);
    if (m) return sign * Math.round(parseFloat(m[1] + '.' + (m[2] || '0')) * 60);
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Einstellungen und Daten                                              */
  /* ------------------------------------------------------------------ */

  function defaultSettings() {
    return {
      sollMinutesByWeekday: [480, 480, 480, 480, 480, 0, 0], // Mo … So: 40 h / 5 Tage
      holidayMode: 'reduce',   // 'reduce': Feiertag senkt die Sollzeit; 'credit': Sollzeit bleibt, Gutschrift separat
      creditVacation: true,    // Urlaub wird mit der Sollzeit des Tages angerechnet
      creditSick: true,        // Krankheit wird mit der Sollzeit des Tages angerechnet
      accountStartMonth: null, // erster Monat des Arbeitszeitkontos
      startBalanceMin: 0,      // Startsaldo des Kontos in Minuten
      displayFormat: 'hm',     // 'hm' = 8:30, 'dec' = 8,50
      updatedAt: 0
    };
  }
  function toInt(v, def) { var n = Math.round(Number(v)); return isFinite(n) ? n : def; }
  function normalizeSettings(s) {
    var d = defaultSettings(), o = s && typeof s === 'object' ? s : {};
    var soll = Array.isArray(o.sollMinutesByWeekday) && o.sollMinutesByWeekday.length === 7
      ? o.sollMinutesByWeekday.map(function (v, i) { return Math.min(1440, Math.max(0, toInt(v, d.sollMinutesByWeekday[i]))); })
      : d.sollMinutesByWeekday.slice();
    return {
      sollMinutesByWeekday: soll,
      holidayMode: o.holidayMode === 'credit' ? 'credit' : 'reduce',
      creditVacation: o.creditVacation === undefined ? d.creditVacation : !!o.creditVacation,
      creditSick: o.creditSick === undefined ? d.creditSick : !!o.creditSick,
      accountStartMonth: isValidYm(o.accountStartMonth) ? o.accountStartMonth : null,
      startBalanceMin: toInt(o.startBalanceMin, 0),
      displayFormat: o.displayFormat === 'dec' ? 'dec' : 'hm',
      updatedAt: toInt(o.updatedAt, 0)
    };
  }

  function emptyData() {
    return { schema: 1, settings: defaultSettings(), entries: [], absences: [], deleted: {} };
  }

  function normalizeEntry(e) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id) return null;
    if (typeof e.start !== 'string' || typeof e.end !== 'string') return null;
    return {
      id: e.id,
      start: e.start,
      end: e.end,
      breakMin: Math.max(0, toInt(e.breakMin, 0)),
      breakStart: typeof e.breakStart === 'string' && e.breakStart ? e.breakStart : null,
      note: typeof e.note === 'string' ? e.note : '',
      updatedAt: toInt(e.updatedAt, 0)
    };
  }
  function normalizeAbsence(a) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id) return null;
    if (!ABSENCE_KINDS[a.kind] || !isValidDate(a.from) || !isValidDate(a.to)) return null;
    var mpd = a.minutesPerDay === null || a.minutesPerDay === undefined || a.minutesPerDay === '' ? null : toInt(a.minutesPerDay, null);
    return {
      id: a.id,
      kind: a.kind,
      from: a.from,
      to: a.to < a.from ? a.from : a.to,
      minutesPerDay: mpd !== null && mpd > 0 ? mpd : null,
      note: typeof a.note === 'string' ? a.note : '',
      updatedAt: toInt(a.updatedAt, 0)
    };
  }
  /** Macht aus beliebigem (auch fremdem/defektem) JSON gültige App-Daten. */
  function normalizeData(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var deleted = {};
    if (r.deleted && typeof r.deleted === 'object') {
      Object.keys(r.deleted).forEach(function (id) {
        var t = toInt(r.deleted[id], 0);
        if (t > 0) deleted[id] = t;
      });
    }
    return {
      schema: 1,
      settings: normalizeSettings(r.settings),
      entries: (Array.isArray(r.entries) ? r.entries : []).map(normalizeEntry).filter(Boolean),
      absences: (Array.isArray(r.absences) ? r.absences : []).map(normalizeAbsence).filter(Boolean),
      deleted: deleted
    };
  }

  /* ------------------------------------------------------------------ */
  /* Arbeitszeit-Einträge: minutengenaue Aufteilung auf Kalendertage      */
  /* ------------------------------------------------------------------ */

  function entryTimes(entry) {
    var s = parseDateTime(entry.start), e = parseDateTime(entry.end);
    return { s: s, e: e, S: localToAbs(s.date, s.minute), E: localToAbs(e.date, e.minute) };
  }

  /** Zerlegt das absolute Intervall [a, b) an den Ortszeit-Mitternächten in Kalendertage. */
  function splitByDay(a, b) {
    var out = [];
    if (b <= a) return out;
    var d = absToLocal(a).date, guard = 0;
    while (guard++ < 400) {
      var mStart = localToAbs(d, 0), mEnd = localToAbs(addDays(d, 1), 0);
      var lo = Math.max(a, mStart), hi = Math.min(b, mEnd);
      if (hi > lo) out.push({ date: d, minutes: hi - lo });
      if (mEnd >= b) break;
      d = addDays(d, 1);
    }
    return out;
  }
  function mergeSegments(list) {
    var map = {};
    list.forEach(function (s) { map[s.date] = (map[s.date] || 0) + s.minutes; });
    return Object.keys(map).sort().map(function (d) { return { date: d, minutes: map[d] }; });
  }

  /**
   * Netto-Arbeitsminuten je Kalendertag.
   *  - Mit "breakStart" wird die Pause exakt an dieser Stelle abgezogen.
   *  - Ohne "breakStart" wird die Pause anteilig nach Minuten auf die Kalendertage verteilt
   *    (Rest nach dem Verfahren der größten Reste, bei Gleichstand der frühere Tag).
   * Wirft einen Fehler mit verständlicher Meldung bei ungültigen Angaben.
   */
  function entrySegments(entry) {
    var t = entryTimes(entry);
    if (!(t.E > t.S)) throw new Error('Das Ende muss nach dem Beginn liegen.');
    var total = t.E - t.S;
    if (total > 24 * 60) throw new Error('Ein Eintrag darf höchstens 24 Stunden lang sein.');
    var br = Math.max(0, Math.round(Number(entry.breakMin) || 0));
    if (br > 0 && br >= total) throw new Error('Die Pause muss kürzer als die Arbeitszeit sein.');

    if (br > 0 && entry.breakStart) {
      var bm = parseTime(entry.breakStart);
      var b0 = localToAbs(t.s.date, bm);
      if (b0 < t.S) b0 = localToAbs(addDays(t.s.date, 1), bm);
      var b1 = b0 + br;
      if (b1 > t.E) throw new Error('Die Pause liegt nicht vollständig im Arbeitszeitraum.');
      return mergeSegments(splitByDay(t.S, b0).concat(splitByDay(b1, t.E)));
    }

    var segs = mergeSegments(splitByDay(t.S, t.E));
    if (br === 0) return segs;
    var fl = [], rest = [], used = 0;
    segs.forEach(function (sg, i) {
      var num = br * sg.minutes;
      fl[i] = Math.floor(num / total);
      rest[i] = num % total;
      used += fl[i];
    });
    var order = segs.map(function (_, i) { return i; }).sort(function (x, y) { return rest[y] - rest[x] || x - y; });
    for (var k = 0; k < br - used; k++) fl[order[k]]++;
    return segs
      .map(function (sg, i) { return { date: sg.date, minutes: sg.minutes - fl[i] }; })
      .filter(function (sg) { return sg.minutes > 0; });
  }
  function entryNetMinutes(entry) {
    return entrySegments(entry).reduce(function (a, s) { return a + s.minutes; }, 0);
  }
  function entryGrossMinutes(entry) {
    var t = entryTimes(entry);
    return t.E - t.S;
  }

  /** Aufteilung mit Kalendertag-Eigenschaften, z. B. für die Vorschau im Eingabeformular. */
  function describeSplit(entry) {
    return entrySegments(entry).map(function (sg) {
      var wd = isoWeekday(sg.date);
      return {
        date: sg.date, minutes: sg.minutes, weekday: wd,
        category: wd <= 5 ? 'weekday' : wd === 6 ? 'saturday' : 'sunday',
        holiday: getHoliday(sg.date)
      };
    });
  }

  /** Prüft einen Eintrag; "others" = übrige Einträge für den Überschneidungs-Hinweis. */
  function validateEntry(entry, others) {
    var errors = [], warnings = [];
    try {
      var segs = entrySegments(entry);
      var gross = entryGrossMinutes(entry);
      if (gross > 12 * 60) warnings.push('Der Eintrag ist länger als 12 Stunden.');
      var t = entryTimes(entry);
      (others || []).forEach(function (o) {
        if (o.id === entry.id) return;
        try {
          var ot = entryTimes(o);
          if (t.S < ot.E && ot.S < t.E) warnings.push('Überschneidet sich mit einem Eintrag vom ' + formatDate(ot.s.date) + ' (' + formatTime(ot.s.minute) + '–' + formatTime(ot.e.minute) + ').');
        } catch (e) { /* defekte Fremdeinträge ignorieren */ }
      });
      return { ok: true, errors: errors, warnings: warnings, segments: segs };
    } catch (err) {
      errors.push(err.message);
      return { ok: false, errors: errors, warnings: warnings, segments: [] };
    }
  }

  /** Alle sich überschneidenden Eintragspaare (nur IDs). */
  function findOverlaps(entries) {
    var list = [];
    entries.forEach(function (e) {
      try { var t = entryTimes(e); list.push({ id: e.id, S: t.S, E: t.E }); } catch (err) { /* ignorieren */ }
    });
    list.sort(function (a, b) { return a.S - b.S; });
    var pairs = [];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length && list[j].S < list[i].E; j++) pairs.push([list[i].id, list[j].id]);
    }
    return pairs;
  }

  /* ------------------------------------------------------------------ */
  /* Kontext, Tageswerte, Monatswerte                                     */
  /* ------------------------------------------------------------------ */

  /** Bereitet alle Daten einmal auf (Arbeitsminuten je Kalendertag usw.). */
  function buildContext(data) {
    var d = normalizeData(data);
    var work = {}, parts = {}, errors = [];
    d.entries.forEach(function (e) {
      try {
        entrySegments(e).forEach(function (sg, i, arr) {
          work[sg.date] = (work[sg.date] || 0) + sg.minutes;
          (parts[sg.date] = parts[sg.date] || []).push({
            entryId: e.id, minutes: sg.minutes, continued: sg.date !== parseDateTime(e.start).date, spansDays: arr.length > 1
          });
        });
      } catch (err) {
        errors.push({ id: e.id, message: err.message });
      }
    });
    return { settings: d.settings, entries: d.entries, absences: d.absences, workByDate: work, parts: parts, errors: errors, overlaps: findOverlaps(d.entries) };
  }

  /** Eigenschaften eines Kalendertags und seine Sollzeit nach den eingestellten Regeln. */
  function dayInfo(date, settings) {
    var st = settings || defaultSettings();
    var wd = isoWeekday(date), holiday = getHoliday(date);
    var regular = st.sollMinutesByWeekday[wd - 1];
    var soll = regular, reduction = 0, holidayCredit = 0;
    if (holiday && regular > 0) {
      if (st.holidayMode === 'credit') holidayCredit = regular; // Sollzeit bleibt, Gutschrift separat
      else { soll = 0; reduction = regular; }                   // Sollzeit entfällt
    }
    return {
      date: date, weekday: wd, isWeekend: wd >= 6, isSaturday: wd === 6, isSunday: wd === 7,
      holiday: holiday, regularSollMin: regular, sollMin: soll,
      holidayReductionMin: reduction, creditHolidayMin: holidayCredit
    };
  }

  /** Alle Werte eines Kalendertags. */
  function dayResult(date, ctx) {
    var info = dayInfo(date, ctx.settings);
    var work = ctx.workByDate[date] || 0;
    var matching = ctx.absences.filter(function (a) { return a.from <= date && date <= a.to; });
    var vac = 0, sick = 0;
    // Urlaub/Krank werden nur an Tagen mit Sollzeit angerechnet (nicht am Wochenende/Feiertag).
    if (!info.holiday && info.sollMin > 0) {
      matching.forEach(function (a) {
        var m = a.minutesPerDay ? Math.min(a.minutesPerDay, info.sollMin) : info.sollMin;
        if (a.kind === 'vacation' && ctx.settings.creditVacation) vac = Math.max(vac, m);
        if (a.kind === 'sick' && ctx.settings.creditSick) sick = Math.max(sick, m);
      });
      vac = Math.min(vac, info.sollMin);
      sick = Math.min(sick, info.sollMin - vac);
    }
    var credit = vac + sick + info.creditHolidayMin;
    var wd = info.weekday, hol = info.holiday ? work : 0;
    return {
      date: date, weekday: wd, isWeekend: info.isWeekend, isSaturday: info.isSaturday, isSunday: info.isSunday,
      holiday: info.holiday, regularSollMin: info.regularSollMin, sollMin: info.sollMin,
      holidayReductionMin: info.holidayReductionMin,
      workMin: work,
      weekdayWorkMin: wd <= 5 ? work : 0,
      saturdayWorkMin: wd === 6 ? work : 0,
      sundayWorkMin: wd === 7 ? work : 0,
      holidayWorkMin: hol,
      creditVacationMin: vac, creditSickMin: sick, creditHolidayMin: info.creditHolidayMin,
      creditMin: credit,
      anrechenbarMin: work + credit,
      saldoMin: work + credit - info.sollMin,
      absenceKinds: matching.map(function (a) { return a.kind; })
    };
  }

  /** Summiert Tageswerte (Monat, Woche, Zeitraum). Jede Minute wird nur einmal gezählt. */
  function summarize(days) {
    var s = {
      days: days.length, sollMin: 0, regularSollMin: 0, holidayReductionMin: 0,
      workMin: 0, weekdayWorkMin: 0, saturdayWorkMin: 0, sundayWorkMin: 0, weekendWorkMin: 0,
      holidayWorkMin: 0, holidayWorkWeekdayMin: 0, holidayWorkSaturdayMin: 0, holidayWorkSundayMin: 0,
      weekdayWorkExclHolidayMin: 0,
      creditVacationMin: 0, creditSickMin: 0, creditHolidayMin: 0, creditMin: 0, anrechenbarMin: 0, saldoMin: 0
    };
    days.forEach(function (d) {
      s.sollMin += d.sollMin; s.regularSollMin += d.regularSollMin; s.holidayReductionMin += d.holidayReductionMin;
      s.workMin += d.workMin;
      s.weekdayWorkMin += d.weekdayWorkMin; s.saturdayWorkMin += d.saturdayWorkMin; s.sundayWorkMin += d.sundayWorkMin;
      s.holidayWorkMin += d.holidayWorkMin;
      if (d.holiday) {
        if (d.weekday <= 5) s.holidayWorkWeekdayMin += d.workMin;
        else if (d.weekday === 6) s.holidayWorkSaturdayMin += d.workMin;
        else s.holidayWorkSundayMin += d.workMin;
      } else if (d.weekday <= 5) {
        s.weekdayWorkExclHolidayMin += d.workMin;
      }
      s.creditVacationMin += d.creditVacationMin; s.creditSickMin += d.creditSickMin;
      s.creditHolidayMin += d.creditHolidayMin; s.creditMin += d.creditMin;
      s.anrechenbarMin += d.anrechenbarMin; s.saldoMin += d.saldoMin;
    });
    s.weekendWorkMin = s.saturdayWorkMin + s.sundayWorkMin;
    return s;
  }

  /** Transparente Herleitung der Sollzeit eines Tagesbereichs. */
  function sollBreakdown(days, settings) {
    var perWeekday = [1, 2, 3, 4, 5, 6, 7].map(function (wd) {
      var ds = days.filter(function (d) { return d.weekday === wd; });
      var regular = settings.sollMinutesByWeekday[wd - 1];
      return { weekday: wd, count: ds.length, regularSollMin: regular, totalMin: ds.length * regular };
    });
    var holidays = days.filter(function (d) { return d.holiday; }).map(function (d) {
      return {
        date: d.date, name: d.holiday, weekday: d.weekday, onWeekend: d.isWeekend,
        regularSollMin: d.regularSollMin, reductionMin: d.holidayReductionMin, creditMin: d.creditHolidayMin
      };
    });
    var sum = summarize(days);
    return {
      calendarDays: days.length, perWeekday: perWeekday,
      regularSollMin: sum.regularSollMin, holidayReductionMin: sum.holidayReductionMin, sollMin: sum.sollMin,
      holidays: holidays, holidayMode: settings.holidayMode
    };
  }

  function groupWeeks(days) {
    var weeks = [], cur = null;
    days.forEach(function (d) {
      var w = isoWeek(d.date), key = w.year + '-W' + pad(w.week);
      if (!cur || cur.key !== key) { cur = { key: key, year: w.year, week: w.week, from: d.date, to: d.date, days: [] }; weeks.push(cur); }
      cur.days.push(d); cur.to = d.date;
    });
    weeks.forEach(function (w) {
      w.sum = summarize(w.days);
      w.partial = isoWeekday(w.from) !== 1 || isoWeekday(w.to) !== 7;
    });
    return weeks;
  }

  /** Auswertung eines Kalendermonats. "today" bestimmt den laufenden Stand ("bis heute"). */
  function computeMonth(ym, ctx, today) {
    var days = monthDates(ym).map(function (d) { return dayResult(d, ctx); });
    var upTo = days.filter(function (d) { return d.date <= today; });
    return {
      ym: ym, days: days, total: summarize(days), toDate: summarize(upTo),
      weeks: groupWeeks(days), soll: sollBreakdown(days, ctx.settings)
    };
  }

  /** Auswertung der vollständigen ISO-Woche (Mo–So), in der "date" liegt – auch über Monatsgrenzen. */
  function computeWeek(date, ctx) {
    var mon = addDays(date, -(isoWeekday(date) - 1)), days = [];
    for (var i = 0; i < 7; i++) days.push(dayResult(addDays(mon, i), ctx));
    var w = isoWeek(mon);
    return { year: w.year, week: w.week, from: mon, to: addDays(mon, 6), days: days, sum: summarize(days) };
  }

  /* ------------------------------------------------------------------ */
  /* Arbeitszeitkonto                                                      */
  /* ------------------------------------------------------------------ */

  function earliestDataMonth(ctx) {
    var dates = Object.keys(ctx.workByDate);
    ctx.absences.forEach(function (a) { dates.push(a.from); });
    if (!dates.length) return null;
    dates.sort();
    return monthOf(dates[0]);
  }

  /**
   * Monatliche Konten-Zeilen vom Kontostart bis zum laufenden Monat.
   *  Saldo (Monat)  = anrechenbare Ist-Zeit − Sollzeit des Monats
   *  Kontostand     = Übertrag + Saldo
   * Abgeschlossene Monate gehen vollständig ein. Im laufenden Monat zählt die Sollzeit nur bis
   * einschließlich heute, damit künftige Tage keine Minusstunden erzeugen.
   */
  function computeAccount(ctx, today) {
    var st = ctx.settings, todayYm = monthOf(today);
    var startYm = st.accountStartMonth || earliestDataMonth(ctx) || todayYm;
    var rows = [], balance = st.startBalanceMin;
    if (startYm <= todayYm) {
      monthRange(startYm, todayYm).forEach(function (ym) {
        var m = computeMonth(ym, ctx, today), isCurrent = ym === todayYm;
        var counted = isCurrent ? m.toDate : m.total;
        var row = {
          ym: ym, isCurrent: isCurrent, carryInMin: balance,
          month: m.total,            // Gesamter Kalendermonat
          counted: counted,          // Das, was in den Kontostand eingeht
          balanceEndMin: balance + counted.saldoMin
        };
        balance = row.balanceEndMin;
        rows.push(row);
      });
    }
    var byMonth = {};
    rows.forEach(function (r) { byMonth[r.ym] = r; });
    return { startYm: startYm, startBalanceMin: st.startBalanceMin, rows: rows, byMonth: byMonth, balanceTodayMin: balance };
  }

  /** Einordnung eines Monats gegenüber dem Konto: 'before' | 'closed' | 'current' | 'future'. */
  function accountStatus(account, ym, today) {
    var todayYm = monthOf(today);
    if (ym < account.startYm) return 'before';
    if (ym > todayYm) return 'future';
    return ym === todayYm ? 'current' : 'closed';
  }

  /* ------------------------------------------------------------------ */
  /* Sicherung / Zusammenführung (Geräteabgleich ohne Server)             */
  /* ------------------------------------------------------------------ */

  /**
   * Führt zwei Datenstände zusammen: Vereinigung nach ID, bei Konflikten gewinnt der neuere
   * Änderungszeitpunkt. Löschungen werden als "Grabsteine" mitgeführt und setzen sich durch,
   * wenn sie neuer sind als die letzte Änderung des Eintrags.
   */
  function mergeData(localRaw, remoteRaw) {
    var L = normalizeData(localRaw), R = normalizeData(remoteRaw);
    var deleted = Object.assign({}, L.deleted);
    Object.keys(R.deleted).forEach(function (id) { deleted[id] = Math.max(deleted[id] || 0, R.deleted[id]); });

    function mergeList(a, b) {
      var map = {};
      a.forEach(function (x) { map[x.id] = x; });
      b.forEach(function (x) { if (!map[x.id] || x.updatedAt > map[x.id].updatedAt) map[x.id] = x; });
      return Object.keys(map).map(function (id) { return map[id]; })
        .filter(function (x) { return !(deleted[x.id] !== undefined && deleted[x.id] >= x.updatedAt); });
    }
    var entries = mergeList(L.entries, R.entries).sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    var absences = mergeList(L.absences, R.absences).sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
    var settings = R.settings.updatedAt > L.settings.updatedAt ? R.settings : L.settings;
    var out = { schema: 1, settings: settings, entries: entries, absences: absences, deleted: deleted };

    function diff(before, after) {
      var bm = {}; before.forEach(function (x) { bm[x.id] = x; });
      var am = {}; after.forEach(function (x) { am[x.id] = x; });
      var added = 0, updated = 0, removed = 0;
      after.forEach(function (x) { if (!bm[x.id]) added++; else if (JSON.stringify(bm[x.id]) !== JSON.stringify(x)) updated++; });
      before.forEach(function (x) { if (!am[x.id]) removed++; });
      return { added: added, updated: updated, removed: removed };
    }
    var e = diff(L.entries, entries), a = diff(L.absences, absences);
    return {
      data: out,
      report: {
        added: e.added + a.added, updated: e.updated + a.updated, removed: e.removed + a.removed,
        settingsReplaced: settings === R.settings && R.settings.updatedAt > L.settings.updatedAt
      }
    };
  }

  /** Liest eine Sicherungsdatei (Text) und liefert normalisierte Daten oder wirft eine Fehlermeldung. */
  function parseBackup(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('Die Datei ist keine gültige Sicherung (kein lesbares JSON).'); }
    var payload = obj && obj.app === 'arbeitszeit' && obj.data ? obj.data : obj;
    if (!payload || typeof payload !== 'object' || (!Array.isArray(payload.entries) && !Array.isArray(payload.absences) && !payload.settings)) {
      throw new Error('Die Datei enthält keine Arbeitszeit-Daten.');
    }
    return normalizeData(payload);
  }
  function makeBackup(data, now) {
    return { app: 'arbeitszeit', version: 1, exportedAt: (now || new Date()).toISOString(), data: normalizeData(data) };
  }

  /* ------------------------------------------------------------------ */

  return {
    VERSION: VERSION, WEEKDAY_SHORT: WEEKDAY_SHORT, WEEKDAY_LONG: WEEKDAY_LONG, MONTH_NAMES: MONTH_NAMES, ABSENCE_KINDS: ABSENCE_KINDS,
    // Datum/Zeit
    parseDate: parseDate, isValidDate: isValidDate, dayNumber: dayNumber, dateFromDayNumber: dateFromDayNumber, addDays: addDays,
    isoWeekday: isoWeekday, isoWeek: isoWeek, parseYm: parseYm, isValidYm: isValidYm, daysInMonth: daysInMonth,
    monthDates: monthDates, addMonths: addMonths, monthRange: monthRange, monthOf: monthOf, todayStr: todayStr, nowTimeStr: nowTimeStr,
    parseTime: parseTime, formatTime: formatTime, parseDateTime: parseDateTime,
    localToAbs: localToAbs, absToLocal: absToLocal,
    // Feiertage
    easterSunday: easterSunday, holidaysNRW: holidaysNRW, getHoliday: getHoliday,
    // Formatierung
    formatDate: formatDate, formatDateShort: formatDateShort, formatDateLong: formatDateLong, formatMonth: formatMonth,
    weekdayShort: weekdayShort, formatDuration: formatDuration, formatSigned: formatSigned, parseDuration: parseDuration,
    // Daten
    defaultSettings: defaultSettings, normalizeSettings: normalizeSettings, emptyData: emptyData, normalizeData: normalizeData,
    // Einträge
    entrySegments: entrySegments, entryNetMinutes: entryNetMinutes, entryGrossMinutes: entryGrossMinutes,
    describeSplit: describeSplit, validateEntry: validateEntry, findOverlaps: findOverlaps,
    // Auswertung
    buildContext: buildContext, dayInfo: dayInfo, dayResult: dayResult, summarize: summarize, sollBreakdown: sollBreakdown,
    groupWeeks: groupWeeks, computeMonth: computeMonth, computeWeek: computeWeek, computeAccount: computeAccount, accountStatus: accountStatus,
    // Sicherung
    mergeData: mergeData, parseBackup: parseBackup, makeBackup: makeBackup
  };
});
