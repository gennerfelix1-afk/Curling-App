# Curling-App

Realistisches Curling-Spiel für den Browser (Desktop + Mobile). TypeScript, Vite, Three.js; deterministische
Physik mit festem Zeitschritt (240 Hz), headless getestet mit Vitest.

**Status:** Phase 5 (komplette Partie nach Regeln für 2 Spieler am selben Gerät, 2D-Draufsicht) abgeschlossen – siehe [`docs/PLAN.md`](docs/PLAN.md).

## Dokumentation
- [`docs/PLAN.md`](docs/PLAN.md) – Architektur und Phasenplan
- [`docs/RULES.md`](docs/RULES.md) – umgesetzte Regeln (World Curling, Ausgabe 1.9.2026) mit Regelnummern
- [`docs/PHYSICS.md`](docs/PHYSICS.md) – Physikmodell, Formeln, Parameter, Kalibrierziele

## Entwicklung
```bash
npm install
npm run dev        # Dev-Server
npm test           # Physik-/Regeltests (inkl. Kalibrierung)
npm run build      # Typecheck + Produktions-Build nach dist/
```

## Physik-Parameter anpassen
Alle Konstanten stehen zentral in [`src/physics/config.ts`](src/physics/config.ts). Nach Änderungen `npm test`
ausführen – die Kalibrierungstests zeigen, ob die Zielwerte (Draw-Zeit, Curl, Wisch-Effekt …) noch passen.

## Deployment
GitHub Actions baut bei jedem Push auf `main` und veröffentlicht auf GitHub Pages
(Repository-Einstellung *Pages → Source: GitHub Actions* aktivieren).

## Steuerung

Ablauf pro Stein: **Besen setzen → Drehung → Gewicht → Abgabe → Wischen**.

| Aktion | Maus / Tastatur | Touch |
|---|---|---|
| Besen (Zielpunkt) setzen | aufs Eis klicken / ziehen | aufs Eis tippen / ziehen |
| Drehung: Out-Turn ↺ / In-Turn ↻ | `Q` / `E` oder `←` / `→` | Buttons |
| Gewicht leichter / schwerer | `S` / `W` oder `↓` / `↑` | `−` / `+` |
| Abgabe starten, Gewicht- und Linien-Anzeige stoppen | `Leertaste` / `Enter` (3×) | „Abgabe“, dann 2× auf die Anzeige tippen |
| Abbrechen (vor dem Abstoß) | `Esc` | „Abbrechen“ |
| Wischer 1 / Wischer 2 | `A` / `D` halten | linkes / rechtes Feld halten |
| härter wischen | Taste schnell wiederholt drücken | Feld schnell tippen |
| Wischseite links / mittig / rechts | `1` / `2` / `3` | Buttons zwischen den Feldern |
| Skip des anderen Teams wischt (ab Tee Line) | `L` halten | Button „Skip … wischt“ |

- Die beiden Anzeigen bei der Abgabe bestimmen den Ausführungsfehler: je näher an der Mitte gestoppt, desto genauer
  stimmen Gewicht und Linie.
- Halten = lockeres Wischen (60 %), schnelles Tippen steigert bis 100 %. Hartes Dauerwischen ermüdet (Balken im Feld).
- Die gestrichelte Linie zeigt den geschätzten Weg **ohne** Wischen (Anfänger-Hilfe).
- `?seed=123` in der URL legt Eis und Zufall fest (reproduzierbare Partie).

## Regeln in Kürze

Details mit Regelnummern: [`docs/RULES.md`](docs/RULES.md).

- Zwei Teams (Rot, Gelb) mit je 8 Steinen pro End, abwechselnd; Lead, Second, Third und Skip spielen je 2 Steine.
- Partie über 8 oder 10 Ends; bei Gleichstand Extra End. Aufgeben ist jederzeit möglich.
- **Wertung:** Nur Steine im House zählen (auch wenn sie den 12-Fuß-Kreis nur berühren). Das Team mit dem Stein
  am nächsten zum Tee bekommt einen Punkt für jeden Stein, der näher liegt als der beste Stein des Gegners.
  Knappe Entscheidungen werden mit Messung angezeigt.
- **Hammer** (letzter Stein): im 1. End per Münzwurf oder Last Stone Draw. Wer punktet, gibt den Hammer ab; nach
  einem Blank End (0:0) bleibt er.
- **Hog Line:** Ein Stein muss die ferne Hog Line ganz überqueren, außer er hat vorher einen Stein getroffen.
  Steine an der Seitenbande oder ganz hinter der Back Line sind aus dem Spiel.
- **Free Guard Zone (Five-Rock-Rule):** Vor dem 6. Stein eines Ends dürfen gegnerische Steine zwischen Hog Line und
  Tee Line (außerhalb des House) nicht aus dem Spiel geschlagen werden. Bei Verstoß wird der abgegebene Stein
  entfernt und alles zurückgesetzt.
- **No-Tick:** Vor dem 6. Stein dürfen gegnerische Guards auf der Centre Line nicht von ihr weggeschoben werden;
  das andere Team entscheidet über Zurücksetzen oder Liegenlassen.
- **Wischen:** Bis zur Tee Line wischen beide Wischer den eigenen Stein, dahinter nur noch einer pro Team; ab der
  Tee Line darf auch der Skip des Gegners wischen.
- **Berührter Stein:** Läuft ein anderer bewegter Stein in einen aufgesetzten Besen, entscheidet das andere Team.
  Also nach einem Treffer rechtzeitig aufhören zu wischen.

KI-Gegner, 3D-Ansicht und Sound folgen in den nächsten Phasen.
