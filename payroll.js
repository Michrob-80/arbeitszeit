// =====================================================================
// payroll.js – Brutto → Netto-Schätzung (Lohnsteuer 2026, Steuerklasse III, gesetzlich versichert)
// Reine Logik ohne DOM. Nachgebildet nach dem BMF-Programmablaufplan (PAP) für den Lohnsteuerabzug 2026
// für laufenden Arbeitslohn bei monatlicher Zahlung. Das ist eine SCHÄTZUNG – maßgeblich ist immer die
// Abrechnung des Arbeitgebers.
// =====================================================================

export const PAYROLL_2026 = {
  grundfreibetrag: 12348,
  anp: 1230,                // Arbeitnehmer-Pauschbetrag
  sap: 36,                  // Sonderausgaben-Pauschbetrag
  kinderfreibetragProZaehler: 9756, // je Zähler 1,0 (Steuerklassen I–III)
  soliFreigrenze: 20350,    // je Splitting-Faktor
  soliSatz: 0.055,
  soliMilderung: 0.119,
  bbgKvPv: 69750,           // jährlich
  bbgRvAv: 101400,          // jährlich
  rv: 0.093,                // Arbeitnehmeranteil
  av: 0.013,
  kvAllg: 0.073,            // Arbeitnehmeranteil allgemeiner Satz (14,6 % / 2)
  kvErm: 0.07,              // ermäßigter Satz /2 – für die Vorsorgepauschale im Lohnsteuerabzug
  pv: 0.018,                // Arbeitnehmeranteil
  pvKinderlos: 0.006,
  pvAbschlagJeKind: 0.0025, // ab dem 2. Kind bis zum 5. Kind
};

const floor = Math.floor;
const roundCent = (x) => Math.round(x * 100 + 1e-7) / 100;

/** Einkommensteuertarif 2026 (§ 32a EStG) für ein zu versteuerndes Einkommen x (ganze Euro), Grundtarif. */
export function tarif2026(xIn) {
  const x = floor(xIn);
  if (x <= 12348) return 0;
  let st;
  if (x <= 17799) { const y = (x - 12348) / 10000; st = (914.51 * y + 1400) * y; }
  else if (x <= 69878) { const z = (x - 17799) / 10000; st = (173.1 * z + 2397) * z + 1034.87; }
  else if (x <= 277825) st = 0.42 * x - 11135.63;
  else st = 0.45 * x - 19246.67;
  return floor(st);
}

/** Beitragssätze Arbeitnehmeranteil (als Anteile, z. B. 0.0155). */
export function pvSatzAN({ kinderUnter25 = 0, kinderlos = false } = {}) {
  let s = PAYROLL_2026.pv;
  if (kinderlos) s += PAYROLL_2026.pvKinderlos;
  else if (kinderUnter25 >= 2) s -= PAYROLL_2026.pvAbschlagJeKind * (Math.min(5, kinderUnter25) - 1);
  return s;
}

/**
 * Jahres-Lohnsteuer (Euro, ganze) für laufenden Arbeitslohn, Steuerklasse III (Splitting).
 * @param annualGross  Jahresarbeitslohn (steuerpflichtig, hochgerechnet = Monat × 12), Euro
 */
export function lohnsteuerJahrKl3(annualGross, o = {}) {
  const P = PAYROLL_2026;
  const kvz = o.kvZusatzPct ?? 2.9;
  const pvs = pvSatzAN({ kinderUnter25: o.pvKinder || 0, kinderlos: !!o.pvKinderlos });
  const zre4 = annualGross;
  // Vorsorgepauschale 2026 (Teilbeträge Rente, Kranken-/Pflegeversicherung; AV nur innerhalb des Höchstbetrags)
  const vspRv = roundCent(Math.min(zre4, P.bbgRvAv) * P.rv);
  const vspKv = roundCent(Math.min(zre4, P.bbgKvPv) * (P.kvErm + kvz / 200));
  const vspPv = roundCent(Math.min(zre4, P.bbgKvPv) * pvs);
  const vspAv = roundCent(Math.min(zre4, P.bbgRvAv) * P.av);
  let vsp = vspRv + vspKv + vspPv;
  if (vspKv + vspPv + vspAv <= 1900) vsp += vspAv;
  vsp = Math.ceil(vsp - 1e-9);
  const zve = Math.max(0, floor(zre4 - P.anp - P.sap - vsp));
  const st = tarif2026(zve / 2) * 2;
  // Bemessungsgrundlage für Solidaritätszuschlag und Kirchensteuer: nach Abzug der Kinderfreibeträge
  const kfb = (o.zkf || 0) * P.kinderfreibetragProZaehler;
  const zveK = Math.max(0, floor(zve - kfb));
  const jbmg = tarif2026(zveK / 2) * 2;
  return { zve, st, kfb, zveK, jbmg, vsp };
}

/** Soli (Jahr, Euro mit Cent) aus der Bemessungsgrundlage jbmg, Steuerklasse III. */
export function soliJahr(jbmg) {
  const P = PAYROLL_2026;
  const frei = P.soliFreigrenze * 2;
  if (jbmg <= frei) return 0;
  const voll = jbmg * P.soliSatz;
  const mild = (jbmg - frei) * P.soliMilderung;
  return Math.floor(Math.min(voll, mild) * 100) / 100;
}

const centsFloor = (annualEuro) => Math.floor((annualEuro * 100) / 12 + 1e-9);

/**
 * Monatliche Brutto→Netto-Schätzung.
 * @param p.taxableCents   steuer- und sozialversicherungspflichtiges Brutto des Monats (Cent)
 * @param p.freeCents      steuer- und SV-freie Zuschläge (Sonntag/Feiertag, §3b EStG) (Cent)
 * @param p.zkf            Zähler Kinderfreibeträge (z. B. 2)
 * @param p.pvKinder       Kinder unter 25 für den PV-Abschlag (ab 2. Kind)
 * @param p.kvZusatzPct    Zusatzbeitrag der Krankenkasse in % (z. B. 2.9)
 * @param p.church / p.churchRatePct  Kirchensteuer ja/nein, Satz (NRW: 9)
 */
export function computePayroll(p) {
  const P = PAYROLL_2026;
  const kvz = p.kvZusatzPct ?? 2.9;
  const taxable = (p.taxableCents || 0) / 100;
  const free = (p.freeCents || 0) / 100;
  const pvs = pvSatzAN({ kinderUnter25: p.pvKinder || 0, kinderlos: !!p.pvKinderlos });

  // Sozialversicherung (Arbeitnehmeranteile, monatliche Beitragsbemessungsgrenzen)
  const bbgKv = P.bbgKvPv / 12, bbgRv = P.bbgRvAv / 12;
  const kv = roundCent(Math.min(taxable, bbgKv) * (P.kvAllg + kvz / 200));
  const pv = roundCent(Math.min(taxable, bbgKv) * pvs);
  const rv = roundCent(Math.min(taxable, bbgRv) * P.rv);
  const av = roundCent(Math.min(taxable, bbgRv) * P.av);
  const sv = roundCent(kv + pv + rv + av);

  // Steuer
  const t = lohnsteuerJahrKl3(taxable * 12, { kvZusatzPct: kvz, pvKinder: p.pvKinder, pvKinderlos: p.pvKinderlos, zkf: p.zkf });
  const lst = centsFloor(t.st) / 100;
  const soli = centsFloor(soliJahr(t.jbmg)) / 100;
  const kist = p.church ? centsFloor(t.jbmg * ((p.churchRatePct ?? 9) / 100)) / 100 : 0;

  const brutto = roundCent(taxable + free);
  const netto = roundCent(brutto - lst - soli - kist - sv);
  const toC = (x) => Math.round(x * 100);
  return {
    bruttoCents: toC(brutto), taxableCents: toC(taxable), freeCents: toC(free),
    lstCents: toC(lst), soliCents: toC(soli), kistCents: toC(kist),
    kvCents: toC(kv), pvCents: toC(pv), rvCents: toC(rv), avCents: toC(av), svCents: toC(sv),
    abzuegeCents: toC(lst + soli + kist + sv),
    nettoCents: toC(netto),
    detail: { zveJahr: t.zve, stJahr: t.st, kfb: t.kfb, jbmg: t.jbmg, vsp: t.vsp, pvSatzPct: pvs * 100 },
  };
}

/**
 * Gesamtabrechnung eines Monats (Schätzung): Gehalt + Überstundengrundvergütung + Zuschläge → Abzüge → Netto.
 * @param totals  Summen aus computeMonth(...).totals
 * @param settings Einstellungen (monthlyGrossCents, overtimePayout, zkf, pvKinder, kvZusatzPct, churchTax, churchRatePct)
 */
export function computeMonthPay(totals, settings) {
  const b = totals.bonus;
  const gehalt = settings.monthlyGrossCents || 0;
  if (!gehalt) return null;
  const overtime = settings.overtimePayout ? b.overtimeCents : 0;
  const taxable = gehalt + overtime + b.taxableCents;
  const pay = computePayroll({
    taxableCents: taxable, freeCents: b.freeCents,
    zkf: settings.zkf, pvKinder: settings.pvKinder, kvZusatzPct: settings.kvZusatzPct,
    church: settings.churchTax, churchRatePct: settings.churchRatePct,
  });
  return { gehaltCents: gehalt, overtimeCents: overtime, surchargeTaxableCents: b.taxableCents, surchargeFreeCents: b.freeCents, ...pay };
}
