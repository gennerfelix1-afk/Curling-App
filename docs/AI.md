# KI-Gegner, Wisch-Berater und Trainingsmodi

Code: `src/ai/` (Eisbuch, Schusskatalog, Bewertung, Planer, Wisch-Berater), Einbindung in `src/game/game.ts`.
Tests: `tests/ai/`.

## 1. Eisbuch (`iceBook.ts`)

Vor jedem End wirft das Spiel 19 ungewischte Teststeine (1,5–4,2 m/s) auf einer schreibgeschützten Sicht des
aktuellen Eises die Centre Line hinunter und merkt sich für jede Geschwindigkeit: Laufweite, Hog-to-Hog-Zeit und
den seitlichen Versatz alle 25 cm. Daraus entstehen

- die **Gewichtstabelle** (Guard … Peel) für den Spieler und
- für die KI: „Welche Geschwindigkeit stoppt bei Distanz d?“ und „Wohin muss der Besen, damit ein Stein mit
  Geschwindigkeit v und Drehung t durch den Punkt (x, y) läuft?“ (`broomFor`).

Im Training „Eis lesen“ wird das Buch absichtlich auf Standard-Eis gemessen – der Spieler muss die Abweichung selbst
herausfinden.

## 2. Schusskatalog (`shots.ts`)

Aus der Stellung werden alle sinnvollen Schüsse erzeugt, jeweils mit beiden Drehungen:

| Typ | Erzeugung |
|---|---|
| Draw | Button, Top 4 links/rechts, 8-Fuß links/rechts, Top 12 |
| Guard | Centre, Tight Centre, Corner links/rechts; Guard vor eigenem Stein im House |
| Come-around | hinter jeden Guard (eigen oder gegnerisch) |
| Freeze | direkt vor einen gegnerischen Stein im House |
| Tap-back | gegnerischen Stein vor der Tee Line mit Hack-Gewicht zurückschieben |
| Hit-and-Stay | Volltreffer mit Normal- oder Control-Gewicht |
| Hit-and-Roll | Treffer mit seitlichem Versatz (rollt nach links/rechts) |
| Peel | Guard mit Peel-Gewicht und Versatz (beide Steine verlassen das Spiel) |
| Double | (a) Stein seitlich treffen, sodass der Spielstein in den zweiten weiterläuft; (b) Stein A in Stein B treiben |
| Raise | eigenen Guard mit etwas mehr als Draw-Gewicht ins House befördern |
| Runback | eigenen Stein in einen gegnerischen dahinter treiben |
| Durchspielen | Stein wegwerfen (z. B. für ein Blank End) |

## 3. Stellungsbewertung (`evaluate.ts`)

- **End-Nutzen** nach Curling-Strategie: Mit Hammer sind 2+ Punkte gut, ein Blank End (Hammer behalten) besser als
  ein einzelner Punkt, ein Steal des Gegners schlecht. Ohne Hammer ist ein Steal am besten, den Gegner zu einem Punkt
  zu zwingen besser als ein Blank End.
- **Letztes End:** Es zählt nur noch Sieg/Niederlage (bzw. wer im Extra End den Hammer hätte).
- **Stellungsmerkmale**, solange noch Steine kommen: Steine im House nach Nähe zum Tee, Centre Guards (gut ohne
  Hammer, schlecht mit), Corner Guards (umgekehrt), gedeckter Shot-Stein, bei Führung „Spiel sauber halten“, bei
  Rückstand „Steine im Spiel halten“.
- Je weniger Steine noch kommen, desto stärker zählt der aktuelle Zählstand.

## 4. Planer (`planner.ts`) – Monte-Carlo über die echte Physik

1. **Erster Blick:** Jeder Kandidat wird einmal perfekt ausgeführt simuliert (echte Physik, echtes Eis, mit Regeln:
   Hog Line, Five-Rock-Rule, No-Tick → der Stein ist verloren, Steine zurück). Draws werden dabei um ihren Fehler
   korrigiert (Besen und Gewicht).
2. **Zweiter Blick:** Die besten *k* Kandidaten werden je *n*-mal mit zufälligen Ausführungsfehlern (Gewicht, Linie)
   simuliert; der Mittelwert der Bewertungen entscheidet. So bevorzugt die KI Schüsse, die auch bei kleinen Fehlern
   noch gut ausgehen.
3. Draws wirft die KI bewusst 1,2 % zu leicht und lässt sie hinwischen; in den Simulationen wird ein zu leichter
   Stein bis ca. 4 % Geschwindigkeit als „von den Wischern gerettet“ gewertet.

Die Suche läuft in kleinen Zeitscheiben im Spiel-Loop (kein Ruckeln) und ist für einen Seed deterministisch,
unabhängig von der Aufteilung.

| Stufe | Kandidaten k | Simulationen n | σ Gewicht | σ Linie am Besen | Auswahl |
|---|---|---|---|---|---|
| Anfänger | 3 | 1 | 3,0 % | 28 cm | zufällig unter den besten 3 |
| Club | 5 | 3 | 1,8 % | 16 cm | zufällig unter den besten 2 |
| Profi | 7 | 5 | 1,0 % | 9 cm | bester |
| Weltklasse | 10 | 8 | 0,6 % | 5 cm | bester |

Werte in `AI_LEVELS` (`src/ai/planner.ts`).

## 5. Wisch-Berater = Skip (`sweepAdvisor.ts`)

Alle 0,4 s sagt der Skip voraus, wo der laufende Stein **ohne weiteres Wischen** endet, und ruft:

| Ruf | Bedeutung | Intensität der Wischer |
|---|---|---|
| HARD! | Draw deutlich zu kurz (oder zu kurz und curlt zu stark); Hit käme gar nicht an | 100 % |
| Line! | Stein curlt zu stark (am Ziel vorbei) | 85 % |
| Clean | etwas zu kurz | 45 % |
| Off! | passt oder ist zu lang | 0 |

- Die **KI wischt ihre eigenen Steine** nach diesen Rufen; ein KI-Skip wischt gegnerische Steine hinter der Tee Line
  aus dem House.
- Für den Spieler gibt es drei Wisch-Modi (Menü): **selbst wischen** (der Ruf erscheint als Hinweis und wird
  gesprochen), **Mitspieler auf Ansage** (Spieler ruft HARD / Clean / Off, die KI-Mitspieler wischen),
  **Mitspieler automatisch** (KI-Mitspieler wischen nach dem Skip).
- Regelentscheidungen (No-Tick, berührter Stein) trifft eine KI als nicht verantwortliches Team selbst
  (zurücksetzen bzw. Stein entfernen).

## 6. Spielmodi

- **Gegen die KI** (Spieler = Rot), 4 Stärkestufen.
- **2 Spieler** am selben Gerät (Hot-Seat).
- **Training** (je 8 Versuche, Steine werden nach jedem Versuch entfernt):
  - *Draw-Challenge:* Draw auf den Button, abwechselnd beide Drehungen; Ergebnis = mittlerer Abstand zum Tee.
  - *Takeout-Challenge:* Ein Stein liegt an zufälliger Stelle im House. Entfernt = 1 Punkt, Spielstein bleibt im
    House = 2 Punkte.
  - *Eis lesen:* Unbekanntes Eis (Tempo und Curl zufällig), keine Vorschau-Linie, Gewichte vom Standard-Eis. Am Ende
    wird das Eis aufgedeckt.
