# Umgesetzte Regeln

Grundlage: **World Curling – The Rules of Curling and Rules of Competition, Ausgabe 1. September 2026**
(worldcurling.org → Competitions → Rules, PDF `Rules2026.pdf`).

> **Quellenhinweis.** In der Entwicklungsumgebung war worldcurling.org nicht direkt abrufbar. Gesichert aus dem
> Inhaltsverzeichnis der Ausgabe 2026 sind die Nummern **R1 Sheet, R6 Free Guard Zone, R8 Sweeping, R9 Touched
> Moving Stones** sowie die neue Bestimmung **R5(d)**. Alle anderen Regelnummern folgen der Gliederung der
> Ausgaben 2022/2024 und sind mit ⚠ markiert – vor Phase 5 gegen das 2026-PDF prüfen. Inhaltlich sind die
> Regeln seit Jahren stabil; Änderungen 2026 betreffen v. a. Wischtechnik und berührte Steine.

Legende: ✅ umgesetzt · ⚙ konfigurierbar · ⚠ Nummer/Wortlaut gegen das 2026-PDF zu verifizieren

**Stand Phase 5:** Alle unten mit ✅ markierten Regeln sind umgesetzt und getestet
(`src/rules/rules.ts`, `src/game/match.ts`, `src/game/game.ts`; Tests in `tests/rules/` und `tests/game/rules-flow.test.ts`).

---

## R1 – Sheet (Spielfeld) — Phase 2/5

Alle Maße in Metern, gemessen gemäß R1; im Code in `src/physics/config.ts` (`SHEET`).

| Element | Wert | Bemerkung |
|---|---|---|
| Länge (Innenkante Back Boards) | 44,50–45,720 | Spiel: 45,720 |
| Breite (Innenkante Side Boards/Linien) | 4,420–4,750 | Spiel: 4,750 |
| Tee zu Tee | 34,747 | Mitte zu Mitte |
| Tee → Back Line (Außenkante) | 1,829 | tangential am 12-Fuß-Kreis |
| Tee → Hog Line (Innenkante) | 6,401 | Hog Line 0,102 breit |
| Hog to Hog (Innenkanten) | 21,945 | = 34,747 − 2·6,401 |
| Tee → Hack Line | 3,658 | Hack-Linie 0,457 lang |
| Courtesy Lines | 1,219 außerhalb der Hog Line | nur Optik |
| Centre Line | von Hack-Linie zu Hack-Linie | |
| Kreise (Radius, Außenkante) | 1,829 (12′) · 1,219 (8′) · 0,610 (4′) · Button 0,152 (1′) | |
| Linienbreiten | Tee/Back/Centre ≤ 0,013, Hog 0,102 | |

**Free Guard Zone (FGZ):** Fläche zwischen Tee Line und Hog Line der Spielseite, **ohne House** (R6).
Ein Stein *in* der FGZ: ruht vollständig oder teilweise vor der Tee Line, berührt den 12-Fuß-Kreis nicht, und hat
die Hog Line komplett überquert. (Steine, die die Hog Line berühren, sind nicht im Spiel.)

## R2 – Steine ⚠ — Phase 2

- Umfang ≤ 0,914 m (Durchmesser ≤ 0,291 m), Höhe ≥ 0,1143 m, Masse inkl. Griff **17,24–19,96 kg**.
- Spiel-Default: 19,0 kg, Radius 0,1454 m; Laufring-Radius ≈ 0,0625 m (Laufring-Durchmesser ≈ 12,5 cm), Ringbreite ≈ 6 mm.
- Ein Team spielt einen Satz von 8 Steinen gleicher Farbe; im Spiel nummeriert (Griffmarkierung).

## R3 – Teams ⚠ — Phase 5

- 4 Spieler: Lead, Second, Third (Vice), Skip; jeder spielt 2 Steine pro End in fester Reihenfolge, abwechselnd mit dem Gegner.
- Skip (bzw. Vice während der Skip wirft) hat das Kommando im House.
- Ersatzspieler/Alternates: nicht umgesetzt (keine spielerische Relevanz).

## R4 – Position der Spieler ⚠ — Phase 5 (vereinfachte Darstellung)

- Nicht abgebendes Team: Positionen außerhalb der Laufbahn, nicht störend. Im Spiel automatisch.

## R5 – Abgabe (Delivery) — Phase 4/5

- Rechtshänder aus dem rechten Hack, Linkshänder aus dem linken (Darstellung).
- **Hog-Line-Verletzung:** Der Stein muss vor Erreichen der Hog Line an der Abgabeseite losgelassen sein; sonst wird er sofort aus dem Spiel genommen. ✅ Geprüft bei der Freigabe (`releaseViolation`). Bei der Abgabe per Wisch-Geste folgt der Stein dem Finger: Wer ihn an der Hog Line noch festhält, verliert den Stein. Bei der Abgabe über Timing-Anzeigen liegt der Freigabepunkt fest 1,5 m vor der Hog Line.
- **R5(d) (2026, neu):** Berührt ein Spieler des abgebenden Teams den laufenden Stein (Granit) nach dem Loslassen jenseits der Tee Line der Abgabeseite, gilt dies als *berührter laufender Stein* (→ R9): Stein aus dem Spiel. Im Spiel: kein Ziehen/Nachdrücken nach dem Loslassen möglich, daher nur über Besenkontakt relevant.
- **Hog Line Spielseite:** ✅ Ein Stein, der die Innenkante der Hog Line an der Spielseite **nicht vollständig** überquert, wird entfernt – **außer** er hat einen anderen im Spiel befindlichen Stein getroffen. Geprüft, sobald alle Steine ruhen.
- **Back Line:** Ein Stein, der **vollständig** hinter der Back Line ruht/liegt, ist aus dem Spiel (ein Stein, der die Back Line berührt, bleibt). Wir entfernen ihn, sobald er sich vollständig hinter der Back Line befindet (er kann dort nicht mehr zurückkehren, außer durch Kollision – praktisch irrelevant; dokumentierte Vereinfachung: Entfernung sofort).
- **Side Line / Boards:** Berührt ein Stein die Seitenbegrenzung, ist er sofort aus dem Spiel.
- Ein Stein, der nicht richtig abgegeben wurde, darf erneut abgegeben werden, solange er die Tee Line der Abgabeseite nicht erreicht hat – im Spiel: „Abbrechen“ vor der Freigabe.

## R6 – Free Guard Zone (Five-Rock-Rule) + No-Tick — Phase 5 ✅

- **Five-Rock-Rule:** Ein gegnerischer Stein, der in der FGZ liegt, darf **vor dem 6. Stein** eines Ends (also mit den Steinen 1–5) nicht aus dem Spiel geschlagen werden – weder direkt noch indirekt. Steine, die durch einen Treffer aus dem House in die FGZ geschoben werden, gelten danach als FGZ-Steine. Eigene Guards dürfen jederzeit entfernt werden.
- Maßgeblich ist die Lage des gegnerischen Steins **vor dem Wurf** (FGZ-Status bei Wurfbeginn).
- **Verstoß:** Der abgegebene Stein wird entfernt, alle verschobenen Steine werden auf ihre Positionen vor dem Wurf zurückgesetzt. Im Spiel: vollständiger Snapshot vor jedem Wurf → exakte Rücksetzung.
- **No-Tick-Rule:** Ein gegnerischer FGZ-Stein, der die **Centre Line berührt**, darf vor dem 6. Stein nicht so bewegt werden, dass er die Centre Line nicht mehr berührt (auch wenn er in der FGZ bleibt).
  - ⚠ **Folge:** Nach meinem Kenntnisstand hat das **nicht verantwortliche Team die Wahl**: (i) abgegebenen Stein entfernen und alle Steine zurücksetzen oder (ii) alles liegen lassen. So ist es umgesetzt (Dialog „… entscheidet“). Sollte das 2026-PDF die Rücksetzung zwingend vorschreiben (wie beim FGZ-Verstoß), genügt es, die Option „liegen lassen“ zu streichen.
  - „Berührt die Centre Line“: |x| ≤ Steinradius + halbe Linienbreite (6,5 mm).
- **FGZ-Verstoß (Stein aus dem Spiel):** Rücksetzung ist **zwingend** und erfolgt automatisch.
- Mixed Doubles: dort eigene Variante (Schutz bis zum 4. Stein, vorgesetzte Steine, Power Play) – optional, spätere Phase.

## R7 – (2026 neu nummeriert) ⚠

Im Inhaltsverzeichnis 2026 liegt Sweeping auf R8; R7 ist neu belegt. Inhalt prüfen; falls spielrelevant, hier ergänzen.

## R8 – Wischen (Sweeping) — Phase 3/5 ✅

- (a) Wischen in beliebiger Richtung, muss nicht die ganze Steinbreite abdecken, muss **seitlich des Steins enden** (keine Rückstände vor dem Stein). Wischen nur **vor** dem Stein.
- (b) **Zwischen den Tee Lines** dürfen **beliebig viele** Spieler des abgebenden Teams den eigenen laufenden Stein wischen.
- (c) **Hinter der Tee Line** der Spielseite darf pro Team **nur ein Spieler** gleichzeitig wischen: beim abgebenden Team ein beliebiger Spieler, beim nicht abgebenden Team **nur der Skip bzw. der das House führende Spieler**.
- (d) Gegnerische Steine dürfen erst gewischt werden, **wenn sie die Tee Line erreicht haben** (ab der Tee Line).
- (e) Ein ruhender Stein darf nicht gewischt werden, bevor er in Bewegung gesetzt wurde.
- (f) Das abgebende Team hat beim eigenen Stein hinter der Tee Line Vorrang; es darf das Wischen des Gegners nicht behindern.
- **Policy Sweeping Technique (World Curling, 6.1.2026):** Wischtechniken, die den Stein verlangsamen sollen, sind verboten → im Spiel ist Wischen immer reibungsmindernd; es gibt kein „Bremsen“. Besenmaterial nach World-Curling-Statement of Principles (Folie/Stoff vorgeschrieben) → **Richtungswischen nur kleiner Effekt** (siehe PHYSICS.md).
- Umsetzung (`applySweepRules`): Die Regeln filtern die Wisch-Eingaben jedes Ticks.
  - Zwei Wischer des abgebenden Teams bis zur Tee Line; sobald die **Vorderkante** des Steins die Tee Line erreicht, wirkt nur noch ein Wischer (das zweite Feld wird ausgegraut).
  - Ab Tee Line darf der Skip des anderen Teams wischen (Taste `L` / Button „Skip … wischt“), z. B. um einen gegnerischen Stein aus dem House zu wischen. Wischt das abgebende Team seinen eigenen Stein hinter der Tee Line, hat es Vorrang.
  - Vereinfachung: Die Wischer des abgebenden Teams wischen nur den abgegebenen Stein, nicht andere eigene Steine, die er in Bewegung setzt.

## R9 – Berührte laufende Steine — Phase 3/5 ✅

- **Bis zur Hog Line der Spielseite** (bzw. 2026: ab Tee Line der Abgabeseite, R5(d)): Berührt das abgebende Team (Körper/Besen) den eigenen laufenden Stein → Stein sofort aus dem Spiel; bereits verschobene Steine werden zurückgesetzt.
- **In der Spielseite (ab Hog Line):** Berührt das abgebende Team seinen eigenen oder einen durch ihn bewegten Stein, wählt das **nicht verantwortliche Team**:
  1. alle Steine so belassen, wie sie zur Ruhe kamen, oder
  2. den berührten Stein entfernen und alle verschobenen Steine zurücksetzen, oder
  3. alle Steine dort platzieren, wo sie ohne die Berührung **vernünftigerweise** zur Ruhe gekommen wären.
- Berührt das **nicht abgebende** Team einen laufenden Stein, platziert das abgebende Team die Steine, wo sie ohne Berührung gelandet wären.
- Umsetzung: Ein Besenkontakt verändert die Bahn des Steins in der Simulation **nicht**. Die Steine laufen also genau dorthin, „wo sie ohne die Berührung gelandet wären“ – Option 1 und 3 sind damit identisch („liegen lassen“). Zur Wahl stehen: **berührten Stein entfernen + nach der Berührung verschobene Steine zurücksetzen** oder **liegen lassen**. Im Hot-Seat wählt das nicht verantwortliche Team per Dialog.
- Berührung **vor der Hog Line der Spielseite** durch das abgebende Team: Stein sofort aus dem Spiel. Berührung durch das **nicht abgebende** Team: Spiel läuft weiter, Steine bleiben, wie sie (unbeeinflusst) zur Ruhe kommen.
- Wann entsteht eine Berührung? Der Besen hebt vor ruhenden Steinen automatisch ab; läuft ein **anderer bewegter Stein** in einen aufgesetzten Besen, zählt das als Berührung (siehe PHYSICS.md §6).
- Besenkontakt: Kollision der Besenkopf-Hitbox mit dem Steinumfang (siehe PHYSICS.md, Wischen). Auf Anfänger-Stufe optional abschaltbar (⚙).

## R10 – Verschobene ruhende Steine ⚠ — Phase 5

- Wird ein ruhender Stein, der das Ergebnis beeinflusst hätte, durch einen Spieler verschoben, setzt das nicht verantwortliche Team ihn zurück. Im Spiel praktisch nur durch Besenkontakt möglich; Rücksetzung über Snapshot.
- Ruhende Steine, die von einem laufenden Stein getroffen werden, sind normales Spielgeschehen.

## Wertung (Scoring) ⚠ (Ausgabe 2024: R11) — Phase 5 ✅

- Ein End ist beendet, wenn alle 16 Steine gespielt sind und ruhen (oder durch Concede).
- Nur Steine **im House** zählen: Steinmittelpunkt-Abstand zum Tee ≤ 1,829 m + Steinradius (Stein berührt den 12-Fuß-Kreis, „Biter“ zählt).
- Das Team mit dem Stein, der dem Tee am nächsten ist, erhält einen Punkt für jeden eigenen Stein, der näher am Tee ist als der beste gegnerische Stein. Liegt kein Stein im House → **Blank End** (0:0).
- Messung: Abstand Mittelpunkt–Tee. Liegen der letzte zählende Stein und der beste gegnerische Stein weniger als 3 cm auseinander (⚙ `RULES.measureThreshold`) → Messwerkzeug-Ansicht mit Abständen in cm. Sind die beiden nächsten gegnerischen Steine nicht unterscheidbar → **Blank End**; geht es um einen zusätzlichen Punkt, zählen nur die eindeutig näheren Steine.
- Messwerkzeug-Ansicht: Zoom auf den/die Steine, „Measure“ mit Abstandsanzeige.

## Spielablauf / Wettkampfregeln (Rules of Competition) ⚠ — Phase 5 ✅

- Partie über **8 oder 10 Ends** (⚙). Bei Gleichstand nach dem letzten End: **Extra End(s)** bis zur Entscheidung.
- **Hammer (letzter Stein):** Im ersten End per **Münzwurf** (⚙) oder **Last Stone Draw (LSD)**:
  - Jedes Team spielt 2 Steine (je einer im Uhrzeigersinn und gegen den Uhrzeigersinn) auf den Tee, wischen erlaubt; Abstand Mittelpunkt–Tee gemessen. Nicht im House: 199,6 cm. Kleinere Summe → Wahl / Hammer im 1. End.
  - Im Spiel: LSD als Mini-Phase vor End 1 (im Menü wählbar): Rot und Gelb abwechselnd, erst je ein Stein im Uhrzeigersinn, dann je einer gegen den Uhrzeigersinn; die Steine werden nach der Messung entfernt. Bei gleicher Summe entscheidet das Los.
- Das **punktende Team gibt den Hammer ab**; bei **Blank End behält** das Team den Hammer. Im Extra End gilt dieselbe Regel.
- **Concede:** Ein Team darf aufgeben (Button „Aufgeben“, wenn es am Zug ist); Partie endet, Gegner gewinnt.
- **Thinking Time** (optional, spätere Phase): 38 min pro Team bei 10 Ends, 30 min bei 8 Ends; Extra End +4:30 min (⚠ verifizieren).
- **Mixed Doubles** (optional, spätere Phase): 2 Spieler, 5 Steine pro Team und End (+1 vorgesetzt), Power Play, Anpassungen 2026-27 zu den vorgesetzten Positionen beachten.

## Spielspezifische Entscheidungen (dokumentiert)

| Thema | Entscheidung | Grund |
|---|---|---|
| Back-Line-Entfernung | sobald Stein vollständig jenseits der Back Line | Regeltext; Rückkehr nur durch Kollision, praktisch ausgeschlossen |
| Side Line | Kontakt = sofort aus dem Spiel, Stein stoppt dort | realistisch (Board) |
| „Wo wäre er gelandet“ (R9) | deterministische Re-Simulation | objektiver als Schätzung |
| FGZ-Status | wird vor jedem Wurf für alle Steine bestimmt | Regel bezieht sich auf Lage vor dem Wurf |
| Wischer-Anzahl hinter Tee Line | automatische Reduktion auf 1 | R8(c) |
| Gegnerischer Skip-Wischen | KI-gesteuert (Einzelspieler) oder 2. Spieler (Hot-Seat) | R8(c),(d) |
