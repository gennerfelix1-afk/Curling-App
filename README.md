# Curling-App

Realistisches Curling-Spiel für den Browser (Desktop + Mobile). TypeScript, Vite, Three.js; deterministische
Physik mit festem Zeitschritt (240 Hz), headless getestet mit Vitest.

**Status:** Phase 1 (Recherche, Doku, Setup, CI) abgeschlossen – siehe [`docs/PLAN.md`](docs/PLAN.md).

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

Steuerung und Kurzregeln folgen mit den spielbaren Phasen.
