# Projektplan – Realistisches Curling

Stand: 11.11.2026. Jede Phase endet mit einem eigenen Commit (bei großen Phasen mehrere), grüner CI und einem kurzen Abschnitt „Erreicht / Offen“ unten in dieser Datei.

## Architektur

```
src/
  physics/        reines TypeScript, deterministisch, KEIN DOM/Three-Import
    config.ts     ALLE physikalischen Konstanten (einzige Stelle)
    rng.ts        geseedeter PRNG (xoshiro128**), splitbar pro Subsystem
    vec.ts        2D-Vektor-Helfer (allokationsarm)
    sheet.ts      Geometrie des Sheets (Linien, Kreise, Zonen) aus config
    ice.ts        Eis-Zustandsfeld (Raster): Grundreibung, Falls, Pebble-Abnutzung, Wischwärme
    stone.ts      Steinzustand (Position, Geschwindigkeit, Winkel, Drehrate)
    contact.ts    Laufring-Modell: N Kontaktpunkte → Reibung, Moment, Curl
    collision.ts  Impulsbasierte Stein-Stein-Kollisionen (Restitution + Reibung)
    sweep.ts      Wisch-Eintrag ins Eisfeld, Intensität, Ermüdung, Richtung
    world.ts      fester Zeitschritt (240 Hz, Substeps bei Kontakt), Events
    delivery.ts   Abgabeparameter (Zielbesen, Turn, Weight) → Anfangszustand
  rules/          Spielregeln (FGZ, No-Tick, Hog/Back/Side, Wertung, Hammer, Wischregeln)
  game/           Spielablauf (Match, End, Wurf), Zustandsautomat, Replays
  ai/             Schussauswahl, Monte-Carlo über die echte Physik (Web Worker)
  render/         Three.js-Szene, Kamera, Wischspuren, Debug-Overlay
  input/          Maus/Tastatur/Touch → Abgabe- und Wischkommandos
  audio/          WebAudio: Steingleiten, Klack, Wischen, Skip-Rufe
  ui/             Scoreboard, Menüs, Messwerkzeug (HTML/CSS-Overlay)
tests/            Vitest: Physik-Kalibrierung, Regeln, Determinismus, KI-Smoke
docs/             RULES.md, PHYSICS.md, PLAN.md
```

Grundsätze
- Physik und Regeln laufen headless (Node/Vitest, Web Worker); Rendering liest nur Zustand.
- Determinismus: fester Zeitschritt, keine `Math.random`, keine Abhängigkeit von Framerate, feste Iterationsreihenfolge. Ein Wurf ist vollständig beschrieben durch `(Seed, Eis-Snapshot, Steinpositionen, Abgabeparameter, Wisch-Eingabestrom pro Tick)`.
- Eingaben (Wischen) werden pro Physik-Tick quantisiert aufgezeichnet → Replays sind bitgenau.

## Phasen

| # | Phase | Inhalt | Abnahme |
|---|-------|--------|---------|
| 1 | Recherche + Doku + Setup | `docs/RULES.md`, `docs/PHYSICS.md`, dieser Plan; Vite + TS + Vitest + Three.js; CI (Typecheck, Tests, Build) + Pages-Deploy | CI grün, Doku vorhanden |
| 2 | Physik-Kern headless | config, rng, sheet, ice, stone, contact (Laufring), collision, world; Kalibrierungstests | Tests 3.4 (ohne Wischen) grün: Draw-Zeiten, Takeout-Zeiten, Curl-Weite, späte Curl-Kurve, In/Out entgegengesetzt, Spin-Abhängigkeit, Kollisionen (Volltreffer, Schnitt, Ketten), Determinismus |
| 3 | Wischen in der Physik | Wärmeeintrag vor dem Stein, Abklingen, Intensität, Ermüdung/Erholung, Seitenwahl (kleine Asymmetrie), Besenkontakt-Erkennung | Tests: +2–3 m bei vollem Wischen, weniger bei spätem Wischen, Curl-Reduktion, Ermüdung, Richtungseffekt klein |
| 4 | Minimal spielbar | 2D-Draufsicht (Canvas), Zielbesen/Turn/Weight, Abgabe, Wischen per Tasten/Touch, Steine kommen zur Ruhe | Ein Wurf von Hack bis Stillstand spielbar, Desktop + Touch |
| 5 | Regeln + Spielablauf | Ends, 16 Steine, Wertung + Messung, Hammer/LSD/Münzwurf, Hog/Back/Side, FGZ (Five-Rock), No-Tick, Wischregeln, berührte Steine, Concede, Extra End, Scoreboard | Regeltests grün inkl. FGZ/No-Tick-Rücksetzung |
| 6 | 3D, Kamera, Touch, Sound | Three.js-Szene, Kamerafahrt (Abgabe → Folgen → Draufsicht), Griffmarkierung, Wischspuren, Gesten-Abgabe, WebAudio, Debug-Overlay | 60 fps Desktop, flüssig auf Mittelklasse-Handy |
| 7 | KI + Modi | Schusskatalog, Taktik (Spielstand/End/Hammer/Steinzahl), Monte-Carlo mit Ausführungsfehlern im Worker, 4 Stärken, KI-Wischer, Hot-Seat, Training | 8-End-Partie gegen KI fehlerfrei |
| 8 | Feinschliff | Balancing, Performance, Replays + Zeitlupe, PWA, README, Pages | Alle Abnahmekriterien |

Optional danach: Mixed Doubles (vorgesetzte Steine, Power Play), Thinking Time.

## Risiken & Gegenmaßnahmen
- **Curl-Mechanismus ungeklärt** → empirisch kalibriertes Laufring-Modell, Parameter zentral, Kalibrierung als Tests (siehe PHYSICS.md).
- **Rechenaufwand KI** (Monte-Carlo × 7 000+ Ticks) → Web Worker, vorab berechnete Weight-Tabellen, frühzeitiger Abbruch wenn alle Steine ruhen, Batch-Simulation ohne Allokation.
- **Mobile-Performance** → Instancing, wenige Draw Calls, Eisfeld-Textur nur bei Änderung aktualisieren, Physik ggf. im Worker.
- **Primärquellen in dieser Cloud-Session nicht direkt abrufbar** (worldcurling.org, arxiv.org gesperrt) → Regeln aus Suchauszügen + bekanntem Regelwerk; offene Punkte in RULES.md markiert (⚠), vor Phase 5 gegen das PDF prüfen.

## Fortschritt
- [x] Phase 1 – Recherche, Doku, Setup, CI
- [x] Phase 2 – Physik-Kern headless (41 Tests grün; K1–K9, K15–K17)
- [x] Phase 3 – Wischen in der Physik (55 Tests grün; K10–K14)
- [x] Phase 4 – Minimal spielbar: 2D-Draufsicht, Abgabe mit Timing-Anzeigen, Wischen per Tasten/Touch (67 Tests grün)
- [ ] Phase 5
- [ ] Phase 6
- [ ] Phase 7
- [ ] Phase 8
