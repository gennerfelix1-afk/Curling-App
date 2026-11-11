# Curling-App

Realistisches Curling-Spiel für den Browser (Desktop + Mobile). TypeScript, Vite, Three.js; deterministische
Physik mit festem Zeitschritt (240 Hz), headless getestet mit Vitest.

**Status:** Phase 4 (minimal spielbar in 2D-Draufsicht, noch ohne Regeln/Wertung) abgeschlossen – siehe [`docs/PLAN.md`](docs/PLAN.md).

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

## Steuerung (Stand Phase 4)

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

- Die beiden Anzeigen bei der Abgabe bestimmen den Ausführungsfehler: je näher an der Mitte gestoppt, desto genauer
  stimmen Gewicht und Linie.
- Halten = lockeres Wischen (60 %), schnelles Tippen steigert bis 100 %. Hartes Dauerwischen ermüdet (Balken im Feld).
- Die gestrichelte Linie zeigt den geschätzten Weg **ohne** Wischen (Anfänger-Hilfe).
- `?seed=123` in der URL legt Eis und Zufall fest (reproduzierbare Partie).

Regeln, Wertung und KI folgen in den nächsten Phasen.
