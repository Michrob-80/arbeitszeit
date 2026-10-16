# Arbeitszeit-App (PWA)

Responsive Web-App für Windows-PC (Edge/Chrome) und iPhone (Safari, Home-Bildschirm).
Deutsche Oberfläche, Feiertage Nordrhein-Westfalen, Überstundenkonto, Sicherung/Wiederherstellung.
Kein Server, keine Anmeldung, keine Kosten – alle Daten liegen auf dem jeweiligen Gerät.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html`, `styles.css`, `app.js` | Oberfläche |
| `calc.js` | **Gesamte Berechnungslogik** (Feiertage, Soll, Aufteilung, Konto) – ohne Browserabhängigkeit |
| `payroll.js` | Lohnsteuer/Sozialabgaben 2026, Brutto→Netto-Schätzung |
| `data.js` | Datenmodell, Prüfung, Sicherungsformat, Zusammenführen |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline-Fähigkeit und Installierbarkeit |
| `server.mjs`, `start-windows.bat` | kleiner lokaler Webserver für Windows |
| `tests/` | Unit-Tests (`calc.test.js`, `data.test.js`) und Browser-Test (`e2e.mjs`) |

## 1. Installation

### Wichtig vorab: Warum Hosting nötig ist
Ein iPhone kann eine PWA nur über **HTTPS** installieren und offline betreiben. Ein Programm, das nur auf dem
Windows-PC läuft (`http://localhost`), ist vom iPhone aus nicht erreichbar. Die App besteht nur aus statischen
Dateien, die **keine persönlichen Daten** enthalten – sie lassen sich kostenlos bei einem Static-Hosting-Dienst ablegen.
Ihre Arbeitszeiten werden dabei **nie hochgeladen**; sie bleiben im Browser-Speicher des Geräts.

Empfehlung: App einmal hosten und **auf beiden Geräten dieselbe Adresse** verwenden. Browser-Daten gehören
zur Adresse (Origin): `localhost:8080` auf dem PC und `https://…github.io/…` auf dem iPhone sind getrennte Speicher.

### Kostenloses Hosting mit GitHub Pages (Beispiel)
Stand der Recherche: GitHub Pages ist für **öffentliche** Repositories kostenlos; private Repositories brauchen einen
bezahlten Tarif. Da die App keine Daten enthält, ist ein öffentliches Repository unproblematisch. Die Oberfläche der
Dienste ändert sich gelegentlich – die Menünamen können abweichen.

1. Kostenloses Konto auf github.com anlegen (nur falls noch keines vorhanden).
2. „New repository“ → Name z. B. `arbeitszeit` → **Public** → anlegen.
3. „uploading an existing file“ → den **Inhalt** dieses Ordners hineinziehen (`index.html`, `app.js`, `calc.js`, `data.js`,
   `sw.js`, `styles.css`, `manifest.webmanifest` und den Ordner `icons`). `tests/` und `node_modules` werden nicht benötigt.
   → „Commit changes“.
4. Repository → *Settings* → *Pages* → Quelle: *Deploy from a branch*, Branch `main`, Ordner `/ (root)` → *Save*.
5. Nach ca. 1–2 Minuten erscheint die Adresse `https://<IhrName>.github.io/arbeitszeit/`.

(Gleichwertige kostenlose Alternativen: Cloudflare Pages oder Netlify. Bitte vorher deren aktuelle Bedingungen prüfen.)

### Windows-PC
**Variante A (empfohlen): dieselbe gehostete Adresse** im Edge oder Chrome öffnen → in der Adressleiste auf das
Symbol „App installieren“ klicken (oder Menü ⋯ → *Apps* → *Diese Website als App installieren*).
Danach startet die App wie ein normales Programm, auch offline.

**Variante B: nur lokal** (ohne Hosting):
1. Node.js LTS von https://nodejs.org installieren (oder Python vorhanden haben).
2. Ordner entpacken, Doppelklick auf `start-windows.bat` (öffnet `http://localhost:8080`).
3. Im Browser wie oben „App installieren“. Der Server muss nur beim ersten Start/Update laufen.
Achtung: Diese Daten sind vom iPhone getrennt – Austausch dann über die Sicherung (Abschnitt 2).

### iPhone 16 Pro
1. In **Safari** (nicht in Chrome/Firefox) die gehostete Adresse öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil) → **„Zum Home-Bildschirm“** → *Hinzufügen*.
3. Die App **vom Home-Bildschirm aus** starten und **erst dort** Daten erfassen.
   Hinweis: Safari-Tab und Home-Bildschirm-App haben unter iOS **getrennte Speicher**. Daten, die vorher im
   Safari-Tab erfasst wurden, erscheinen in der Home-Bildschirm-App nicht automatisch (→ Sicherung laden).
4. Unter *Einstellungen → Dauerhaften Speicher anfordern* tippen und regelmäßig sichern.

## 2. Mehrere Geräte, Sicherung, Gerätewechsel

**Eingebaut und kostenlos (ohne Server):** *Einstellungen → Sicherung erstellen* speichert eine `.json`-Datei
(am iPhone über das Teilen-Menü, z. B. in „Dateien“/iCloud Drive; am PC als Download).
*Sicherung laden …* bietet zwei Wege:
- **Ersetzen** – neues Gerät: übernimmt genau den Stand der Datei.
- **Zusammenführen** – zwei Geräte abgleichen: neue Einträge werden ergänzt, bei gleichen Einträgen gewinnt die
  neuere Änderung, Löschungen werden übernommen. Der Vorgang ist wiederholbar und verdoppelt nichts.
Vor jedem Import legt die App eine Sicherheitskopie des alten Stands im Browser an.

**Automatische Synchronisierung in Echtzeit** ist mit reiner Gerätespeicherung technisch nicht möglich. Dafür wird
**zwingend ein Server oder Cloud-Dienst** benötigt, der die Daten zentral hält, z. B.
(a) ein eigener kleiner Server mit Datenbank, (b) ein Backend-Dienst (z. B. Firebase/Supabase mit Anmeldung), oder
(c) WebDAV/Nextcloud. Das wäre eine zusätzliche Erweiterung mit Konto, Verschlüsselungs- und Datenschutzfragen und
möglichen Kosten. **Ich habe nichts davon eingebaut und keinen kostenpflichtigen Dienst verwendet.**
Sagen Sie Bescheid, wenn Sie eine dieser Varianten wünschen.

## 3. Rechenregeln (Kurzfassung – in der App unter *Einstellungen → Verwendete Rechenregeln*)

- Soll: Mo–Fr je 8 h, Sa/So 0 h (einstellbar). Das Monats-Soll wird aus den echten Kalendertagen berechnet.
- Gesetzliche Feiertage NRW (Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag,
  Fronleichnam, 3. Oktober, Allerheiligen, 25./26. Dezember) auf Mo–Fr senken das Soll des Tages auf 0.
  Feiertage am Samstag/Sonntag ändern das Soll nicht. Alternativ einstellbar: Soll bleibt, Feiertag wird als
  getrennte Gutschrift gezeigt (gleicher Saldo).
- Urlaub/Krank werden an Regelarbeitstagen mit dem Tages-Soll angerechnet (abschaltbar), nie an Wochenenden/Feiertagen,
  und getrennt von geleisteter Arbeit ausgewiesen.
- Hauptkategorie der Arbeitsstunden = Wochentag (Mo–Fr | Sa | So); „Feiertag“ ist ein Zusatzmerkmal (Teilmenge).
  Mo–Fr + Sa + So = Gesamt – immer. Überschneidende Einträge werden nie doppelt gezählt.
- Schichten über Mitternacht werden minutengenau an der Tagesgrenze geteilt (inkl. Monats-/Jahreswechsel und
  Zeitumstellung: es zählt die tatsächlich vergangene Zeit). Die Pause wird dem Tag des Schichtbeginns zugerechnet.
- **Stundenlohn und Zuschläge** (Einstellungen): Stundenlohn brutto sowie Samstag-, Sonntag- und Feiertagszuschlag in %
  (Standard 25 % / 50 % / 50 %). Pro Stunde gilt **nur ein** Zuschlag: Fällt sie auf Wochenende und Feiertag, zählt der
  höhere Satz (Sonntag + Feiertag = einmal 50 %, nicht 100 %). Die Beträge werden je Kategorie kaufmännisch auf Cent
  gerundet und sind eine **Schätzung** (keine Steuer-/SV-Berechnung). Der Stundenlohn ist absichtlich nicht vorbelegt,
  damit er nicht im (öffentlichen) Hosting-Repository steht – er wird nur im Gerät gespeichert.
- **Brutto → Netto (Schätzung)**: Monatsgehalt + Überstunden-Grundvergütung (positiver Monatssaldo × Stundenlohn, abschaltbar)
  + Zuschläge. Sonntags-/Feiertagszuschläge sind bis 50 % bzw. 125 % (150 % am 1.5., 25./26.12.) steuer- und SV-frei
  (§ 3b EStG), Samstagszuschläge nicht. Abzüge: Lohnsteuer 2026 (Steuerklasse III, nachgebildet nach dem BMF-Programmablaufplan),
  Solidaritätszuschlag und Kirchensteuer (Bemessung nach Kinderfreibeträgen), Kranken-/Pflege-/Renten-/Arbeitslosenversicherung
  mit den Beitragsbemessungsgrenzen 2026. Voreinstellung: Steuerklasse III, 2 Kinderfreibetrag-Zähler, 2 Kinder (PV-Abschlag 0,25 %),
  KV-Zusatzbeitrag 2,9 %, keine Kirchensteuer. **Nur Steuerklasse III ist umgesetzt.** Das Gehalt ist nicht vorbelegt und liegt nur im Gerät.
- Monats-Saldo = anrechenbare Ist-Zeit − Monats-Soll; Übertrag in den Folgemonat; spätere Änderungen in der
  Vergangenheit aktualisieren alle folgenden Monate (es wird nichts „eingefroren“).
- Das Konto beginnt im Monat des ersten Eintrags oder in dem Monat, den Sie in den Einstellungen festlegen
  (mit optionalem Startsaldo). Monate ohne Einträge nach dem Kontostart zählen mit ihrem vollen Soll als Minus –
  legen Sie den Kontostart daher passend fest.

## 4. Tests

```
node --test tests/calc.test.js tests/data.test.js tests/payroll.test.js     # 71 Unit-Tests (Node.js 20+), Zeitzone fest Europe/Berlin
npm install --no-save playwright && npx playwright install chromium
node tests/e2e.mjs                                    # Browser-Test: PC- und iPhone-Profil (Emulation)
```
Abgedeckt sind u. a.: 40-h-Woche, Monat mit 20 Arbeitstagen, Feiertag Dienstag/Samstag/Sonntag, Arbeit am Feiertag,
Sonntagsarbeit am Feiertag, Nachtschicht über Mitternacht und Monatswechsel (Sa 31.10. → So 1.11.2026),
Zeitumstellung, Minus-/Überstundenmonate mit Übertrag und nachträglicher Änderung, Urlaub/Krank, Überschneidungen,
Backup und Zusammenführen, plus ein Zufallstest, dass Mo–Fr + Sa + So stets exakt die Gesamtzeit ergibt.

**Grenzen:** Der „iPhone“-Test ist eine Emulation (Chromium mit iPhone-Größe/Touch), kein echtes iOS-Safari.
Bitte einmal auf dem echten Gerät prüfen (Installation, Eingabe, Sicherung über das Teilen-Menü, Flugmodus).
Die einzige nicht eindeutige Uhrzeit des Jahres (02:30 beim Zurückstellen der Uhr) wird als erste Auftretung gewertet.
