# Physikmodell

Ziel: Ein erfahrener Curler soll sagen „so verhält sich ein Stein“. Der Curl-Mechanismus ist wissenschaftlich **nicht
abschließend geklärt**; deshalb verwenden wir ein **empirisch kalibriertes Laufring-Modell**, dessen Struktur sich an
den aktuell bestgestützten Befunden orientiert (Murata 2022: „Pivot“ um Reibungspunkte auf der langsamen Seite) und
dessen Parameter gegen Messwerte aus dem Spielbetrieb kalibriert werden (Abschnitt 8, automatisierte Tests).

Alle Konstanten: `src/physics/config.ts`. Werte unten sind **Startwerte**; die kalibrierten Werte stehen nach Phase 2 in
der Tabelle in Abschnitt 9.

---

## 1. Literatur und was wir daraus übernehmen

| Quelle | Kernaussage | Übernahme |
|---|---|---|
| J. Murata, *Study of curling mechanism by precision kinematic measurements of curling stone's motion*, Sci. Rep. 12, 15047 (2022), doi:10.1038/s41598-022-19303-4 | Curl entsteht v. a. durch „Swinging“ um **diskrete Reibungspunkte auf der langsamen Seite** des Laufrings (Pebble als Drehpunkt, „zahnradartiges“ Eingreifen); Wahrscheinlichkeit eines Drehpunkts links/rechts verschieden. Die klassische Vorne-hinten-Asymmetrie erklärt den Curl nicht (vorne sogar höhere Reibung). | Laufring als N diskrete Kontaktpunkte; Curl-Kraft zur langsamen Seite, gewichtet mit lokaler Reibung der Kontaktpunkte |
| M. R. A. Shegelski, E. Lozowski, *Pivot-slide model of the motion of a curling rock*, Can. J. Phys. (2016); Mancini & de Schoulepnikoff, *Improved pivot-slide model…*, Can. J. Phys. 97 (2019) | Pivot-Slide reproduziert Gleit- und Curl-Weiten; Curl nahezu **unabhängig von der Drehrate** im üblichen Bereich; verbesserte Version macht das Pivot-/Gleit-Verhältnis geschwindigkeitsabhängig (Curl hängt dann von v ab) | Spin-Sättigungsfunktion S(ω); Curl-Stärke wächst mit sinkender Geschwindigkeit F(v) |
| Lozowski et al., Modelle der Eis-Reibung (u. a. *Comprehensive Model of Curling Stone Dynamics*, 2015/16) | Reibung von Eis abhängig von Druck, Temperatur, Geschwindigkeit; im Curling-Bereich **μ ∝ v^-1/2** (Schmelzwasserfilm) | geschwindigkeitsabhängiger Reibungsanteil (Abschnitt 3) |
| Messungen Gleitzeit (Spielpraxis, Hog-to-Hog-Timing) | Draw Hog-to-Hog 13–15 s (keen: > 15 s, heavy: < 13 s); Takeout 8–10 s; μ ≈ 0,006–0,009 | Kalibrierziele |
| Marmo et al. (thermisches Wischmodell); Kim et al. (2021, Feldstudie Wischwinkel); World Curling Sweeping-Policy 2026 + Statement of Principles (Besenmaterial) | Wischen wirkt über **Erwärmung** der Eisoberfläche vor dem Stein, mehrere Meter Weg-Gewinn; Wischrichtung/-winkel hat messbaren, aber mit heutigen Fasern **kleinen** Einfluss | Wärmefeld im Eis mit Abklingen; kleiner Richtungsterm |

Hinweis: arxiv.org und worldcurling.org waren in der Entwicklungsumgebung nicht direkt abrufbar; Kennwerte stammen
aus Suchauszügen der genannten Arbeiten und aus der Curling-Praxis. Alle Werte sind Kalibrierziele mit Toleranzbereich,
nicht exakte Messwerte.

## 2. Koordinaten und Zustand

- Ursprung = Mitte des Sheets. **x** quer (positiv = rechts, vom werfenden Hack aus gesehen), **y** längs (positiv = Richtung Spielseite, wenn von Seite A geworfen wird), **z** nach oben. Rechtssystem.
- ω > 0: Drehung gegen den Uhrzeigersinn (von oben). **Uhrzeigersinn (ω < 0) → Curl nach rechts (+x)**.
- Ends wechseln die Richtung (A→B, B→A) – das Eisfeld ist ein gemeinsames Feld über das ganze Sheet, damit Abnutzung richtungsabhängig realistisch entsteht.
- Steinzustand: Position **p**, Geschwindigkeit **v**, Winkel θ, Drehrate ω, Masse m, Trägheitsmoment I = k_I·m·R² (k_I ≈ 0,5; Stein nicht homogen, konfigurierbar).

## 3. Gleitreibung

Laufring Radius r_b ≈ 0,0625 m, zerlegt in **N = 24** Kontaktpunkte (konfigurierbar) mit Last Nᵢ = m·g/N.
Gleitgeschwindigkeit des Punkts i: **uᵢ = v + ω ẑ × rᵢ**.

Reibungskoeffizient am Punkt:

```
μᵢ = μ₀ · ice(xᵢ) · g_v(|uᵢ|)
g_v(u) = (1 − w) + w · sqrt( u_ref / max(u, u_min) )        (w ≈ 0,3–0,5, u_ref = 1 m/s, u_min ≈ 0,03 m/s)
fᵢ = − μᵢ · Nᵢ · ûᵢ
```

- Der Term `w·sqrt(...)` ist der geschwindigkeitsabhängige Anteil (μ ∝ v^-1/2 nach Lozowski); der konstante Anteil
  bildet Pebble-Verformung/Pflügen ab. Reines v^-1/2 würde am Ende zu abruptem Stopp führen, der Mix ergibt die
  beobachtete fast gleichmäßige Verzögerung mit stärkerem Abbremsen am Ende.
- Summe der fᵢ → Verzögerung; Summe rᵢ × fᵢ → Reibungsmoment → **Abnahme der Drehung** (bei v ≫ ωr klein, bei kleinem v groß: der Stein „dreht am Ende aus“).
- Vorkalibrierung (1D, ohne Curl, 240 Hz): μ₀ = 0,0075, w = 0,3 → Tee-Draw Hog-to-Hog 14,4 s, Hog bis Stillstand 26,0 s;
  μ₀ = 0,0065 → 15,4 s („keen“), μ₀ = 0,0085 → 13,6 s („heavy“).
- Eisgeschwindigkeit pro Partie: `keen | normal | heavy` skaliert μ₀ (≈ 0,0065 / 0,0075 / 0,0085).

## 4. Curl (Laufring-Pivot-Modell, empirisch kalibriert)

Senkrechte Einheitsrichtung n̂ = ẑ × v̂ (links der Laufrichtung). Laterale Beschleunigung:

```
a_curl = C_curl · g · F(v) · S(ω) · μ̃_slow · c_ice(x) · sign(ω) · n̂
       + C_dir  · g · F(v) · (μ̄_L − μ̄_R) · n̂        (Richtungsterm, klein)
         ω < 0 (Uhrzeigersinn) → −n̂ = nach rechts;  ω > 0 → n̂ = nach links
         μ̄_L/μ̄_R: mittlere lokale Reibung linke/rechte Laufringhälfte (höhere Reibung zieht zu sich)
F(v)     = v/(v + v_lo) · 1 / (1 + (v / v_c)²)     (v_c = 1,6 m/s: schnell = fast gerade; v_lo = 0,05 m/s: kein Haken auf den letzten cm)
S(ω)     = grip(ω) / (1 + (ω / ω_hi)²)             (ω_hi = 3 rad/s)
grip(ω)  = min(1, 1,1 · x / sqrt(1 + x²)),  x = |ω| / ω_lo   (ω_lo = 0,1 rad/s; ab ≈ 0,22 rad/s exakt 1)
μ̃_slow   = mittlerer Reibungsfaktor der Kontaktpunkte auf der langsamen Seite (aus dem Eisfeld);
           geht als  max(0, 1 − κ·(1 − μ̃_slow))  ein (κ = 2): gewischtes/abgenutztes Eis curlt weniger
c_ice(x) = lokaler Curl-Faktor des Eises (Pebble-Zustand, „straight/normal/swingy“)
```

Eigenschaften (alle als Tests geprüft):
- **Richtung**: Curl zur langsamen Seite = in Drehrichtung (Uhrzeigersinn → rechts).
- **Später Curl**: F(v) ist bei Abgabegeschwindigkeit (≈ 2 m/s) klein und wächst, wenn der Stein langsam wird → Großteil im letzten Drittel.
- **Takeouts curlen weniger**: höheres v → kleineres F(v) und kürzere Zeit.
- **Spin-Unabhängigkeit**: S(ω) ≈ 1 im typischen Bereich (2–4 Umdrehungen ≈ 0,5–1,2 rad/s); sehr viel Drehung → S sinkt (kaum Curl); sehr wenig Drehung → S klein **und** zusätzliche Zufallskomponente:
  `a_noise = C_noise · g · F(v) · (1 − grip(ω)) · ξ(t)`, ξ = geseedeter Ornstein-Uhlenbeck-Prozess (τ = 2,5 s, Pebble-Zufall) → „unberechenbar“. Bei normaler Drehung ist grip = 1 und der Zufall verschwindet.
- **Wischen reduziert Curl**: μ̃_slow sinkt im gewischten Bereich → weniger Curl („hält die Linie“).
- **Richtungswischen**: Wischen auf einer Seite senkt die Reibung dort → Pivot eher auf der ungewischten Seite → kleine Ablenkung **weg von der gewischten Seite**. C_dir ≪ C_curl (Ziel: max. ≈ 5–10 cm Effekt über die letzten 10 m), entspricht heutigen Besenmaterialien.
- Begründung der Struktur: Murata zeigt, dass der Curl aus der Links-rechts-Asymmetrie der Drehpunktbildung stammt (langsame Seite), Shegelski/Mancini, dass das Ergebnis im üblichen ω-Bereich kaum von ω abhängt, wohl aber von v. Eine rein mikroskopische Herleitung aus den Punktgeschwindigkeiten liefert zwar die Richtung, skaliert aber linear mit ω – widerspricht der Praxis; deshalb die explizite Sättigung S(ω).
- Der Curl dreht den Geschwindigkeitsvektor (senkrechte Kraft, keine Energiezufuhr). Bei v < v_stop (≈ 2 mm/s) wird a_curl ausgeblendet; bei v = 0 und |ω| < ω_stop ruht der Stein (Sleep).

## 5. Eis als Zustandsfeld

Raster über das ganze Sheet, Zellgröße **4 cm** (≈ 119 × 1143 Zellen, Float32Arrays):

| Ebene | Bedeutung | Wirkung |
|---|---|---|
| `base` | lokale Grundreibung (Pebble-Qualität, kleine Störungen, geseedet, räumlich geglättet ±2–3 %) | Faktor auf μ |
| `curl` | lokaler Curl-Faktor | Faktor auf C_curl |
| `wear` | Pebble-Abnutzung 0…1, wächst entlang befahrener Laufwege (∝ gelaufene Strecke) | μ·(1 − α_w·wear), Curl·(1 − β_w·wear) → **schneller und gerader** |
| `heat` | Wischwärme (relative Temperaturerhöhung) | μ·(1 − α_s·h/(h + h_½)); Abklingen exp(−t/τ_h), τ_h ≈ 3 s |
| `fall` | grobes Gefälle (0,5 m Raster), seitliche Neigung | a_fall = g · Neigung (≈ 1–5·10⁻⁵ → wenige cm über einen Draw) |

- Schalter in config: `falls`, `wear`, `endDrift` (zwischen Ends ändern sich μ₀ und Curl leicht, ±2 %, geseedet, Abnutzung bleibt) – Spieler müssen das Eis lesen.
- Der Stein liest Reibung **an den Kontaktpunkten seines Laufrings** (bilineare Interpolation).
- Curl-Stärke pro Partie: `straight | normal | swingy` skaliert C_curl (≈ 0,7 / 1,0 / 1,35).
- Performance: Nur Zellen mit `heat > ε` werden pro Tick gekühlt (Liste aktiver Zellen).

## 6. Wischen

- Besenköpfe 0,10 × 0,30 m (quer), Position **vor dem Stein**: Abstand 0,05–0,40 m vor der Vorderkante, seitlicher Versatz wählbar (links / mittig / rechts der Laufbahn).
- Wärmeeintrag pro Tick in die überstrichenen Zellen: `Δh = k_heat · I_eff · dt`, `I_eff = I · (1 − fatigue)`, I ∈ [0,1] aus Druck × Tempo (Eingabe: Tipp-Rhythmus oder Haltedruck).
- Wirkung: weniger Reibung vor dem Stein → **mehr Weg**; weniger μ̃_slow → **weniger Curl**.
- **Ermüdung** pro Wischer: `fatigue' = k_f · I − k_r · (1 − I)`, begrenzt auf [0, fatigue_max ≈ 0,4]; Erholung zwischen den Würfen (vollständig bis fast vollständig).
- Nur vor dem Stein wirksam (Zellen hinter der Vorderkante werden nicht erwärmt).
- **Besenkontakt**: Überschneidet die Besenkopf-Hitbox den Steinumfang (z. B. Besen zu nah vor schnell ankommendem Stein beim Wechsel der Position), wird ein `touchedStone`-Event erzeugt → Regel R9.
- Wischregeln (R8) setzt das Regelmodul um: ab Tee Line nur ein Wischer je Team; Gegner-Skip ab Tee Line.
- Kalibrierziele: volles, hartes Wischen über den ganzen Weg **+2–3 m**; nur letzte ~5 m: **+0,3–1,0 m**; Curl mit vollem Wischen **≥ 20 % geringer**.

## 7. Kollisionen

- Stein-Stein: Kreis-Kreis mit Radius R = 0,1454 m (Schlagband). Impulsbasiert, sequentielle Impulse für mehrere gleichzeitige Kontakte (Ketten, Freeze, Runback).
- Normalimpuls mit Restitution **e = 0,85** (Startwert; Literatur/Praxis 0,8–0,9 für Granit-Granit). Volltreffer: Stoßstein behält (1 − e)/2 ≈ 7,5 % der Geschwindigkeit → „bleibt fast stehen“, getroffener Stein erhält (1 + e)/2 ≈ 92,5 %.
- Tangentialimpuls mit Coulomb-Begrenzung `|J_t| ≤ μ_ss · J_n`, μ_ss = 0,06 (kalibriert auf Throw ≈ 3° beim halben Treffer): Relative Tangentialgeschwindigkeit inkl. Drehung (ωR) → **Übertrag von Drehung** und kleiner **„Throw“** (Abweichung des getroffenen Steins von der Stoßlinie um wenige Grad).
- Zeitschritt: Basis **240 Hz**; sobald ein laufender Stein einem anderen näher als 2R + Sicherheitsabstand kommt, rechnet die Welt den Tick in **8 Substeps** (1920 Hz): Eindringtiefe ≤ ~2 mm auch bei Peel-Gewicht, wird positionskorrigiert → kein Durchtunneln. Mehrfachkontakte: sequentielle Impulse (4 Iterationen).
- Seitenbegrenzung: Kontakt Steinrand mit Side Line → Stein aus dem Spiel (bleibt liegen/wird entfernt, Regelmodul entscheidet).
- Back Line: vollständig dahinter → aus dem Spiel.

## 8. Determinismus

- Fester Zeitschritt dt = 1/240 s, unabhängig von der Framerate (Akkumulator im Renderer).
- PRNG: xoshiro128** (32-bit, `Math.imul`), getrennte Streams für Eis-Generierung, Pebble-Rauschen, Ausführungsfehler.
- **Transzendente Funktionen** (`exp`, `tanh`, `sin`, `pow` …) können zwischen JS-Engines im letzten Bit abweichen. Der Physik-Kern verwendet deshalb im Zeitschritt ausschließlich `+ − × ÷` und `Math.sqrt` (IEEE-exakt); wo Sinus/Kosinus/Exponential nötig sind (Laufring-Punkte, Abklingkonstanten), kommen eigene Reihen aus `dmath.ts` zum Einsatz. Gauß-Zufall = Summe von 4 Gleichverteilungen. So sind Replays auch zwischen Browsern bitgleich.
- Wisch-Eingaben werden pro Tick quantisiert (I in 1/64-Stufen) und mit dem Wurf gespeichert.
- Test: gleicher Seed + gleiche Eingaben → identische Endpositionen (Bit-Vergleich), auch nach Kollisionsketten.

## 9. Kalibrierziele (automatisierte Tests, Phase 2/3)

„Normales Eis“ = μ₀ normal, Curl normal, Abgabe 1,5 m vor der nahen Hog Line, 3 Umdrehungen bei Draw-Gewicht.

| # | Ziel | Wert / Toleranz | Quelle/Begründung |
|---|---|---|---|
| K1 | Draw auf Tee: Abgabe → Stillstand | 25–28 s | Praxis |
| K2 | Draw auf Tee: Hog-to-Hog | 13–15 s (keen > normal > heavy) | Praxis-Timing |
| K3 | Takeout (Normal): Hog-to-Hog | 8–10 s | Praxis |
| K4 | Curl Draw (normal) | 1,0–1,5 m seitlich | Praxis; Murata-Messungen ~1 m |
| K5 | Curl Takeout | < 40 % des Draw-Curls (bis zur Back Line) | Praxis |
| K6 | Später Curl | ≥ 60 % der seitlichen Abweichung im letzten Drittel des Weges | Praxis/Murata |
| K7 | In-Turn vs. Out-Turn | entgegengesetzt, betragsgleich ± 1 % (ohne Falls/Rauschen) | Symmetrie |
| K8 | Spin-Abhängigkeit | 1,5 vs. 5 Umdrehungen: Curl-Differenz < 20 %; 12+ Umdrehungen: deutlich weniger; 0,25 Umdrehungen: Streuung über Seeds groß | Shegelski / Praxis |
| K9 | Drehung | Draw mit typischem ω₀ macht 2–4 Umdrehungen | Praxis |
| K10 | Volles Wischen ganzer Weg | +2–3 m | Praxis |
| K11 | Wischen letzte 5 m | +0,3–1,0 m | Praxis |
| K12 | Wischen reduziert Curl | ≥ 20 % weniger Curl bei vollem Wischen | Praxis |
| K13 | Richtungswischen | messbar, aber ≤ 10 cm | heutige Besen |
| K14 | Ermüdung | 20 s Dauer-Hartwischen: Wirkung pro Sekunde am Ende ≤ 80 % vom Anfang | Modell |
| K15 | Volltreffer | Stoßstein < 10 % Restgeschwindigkeit, getroffener > 85 % | e = 0,85 |
| K16 | Schräger Treffer | Ablenkwinkel ≈ 90° Summe (minus Restitutions-/Reibungseffekte), Throw 0,5–4° | Impulsmodell |
| K17 | Determinismus | gleicher Seed + Eingabe → bitgleiches Ergebnis | — |

Kalibrierte Parameter (Stand Phase 2; Wisch-Parameter folgen in Phase 3):

| Parameter | Wert | Bemerkung |
|---|---|---|
| μ₀ keen / normal / heavy | 0,0066 / 0,0075 / 0,0085 | |
| w (v^-1/2-Anteil), u_ref, u_min | 0,3 · 1 m/s · 0,03 m/s | |
| C_curl | 0,00126 | × g = max. Querbeschleunigung |
| Curl-Skala straight / normal / swingy | 0,7 / 1,0 / 1,35 | |
| v_c, v_lo | 1,6 m/s, 0,05 m/s | |
| ω_lo, ω_hi | 0,1 rad/s, 3 rad/s | |
| κ (Reibungs-Sensitivität des Curls) | 2 | Feintuning in Phase 3 |
| C_dir, C_noise, τ_noise | 0,0012 · 0,002 · 2,5 s | |
| e, μ_ss | 0,85 · 0,06 | |
| Abgabe: Release 1,5 m vor Hog, ω₀ | 0,85 rad/s | ≈ 3,2 Umdrehungen beim Draw |

Gemessene Ergebnisse (ideales Eis, `npx vite-node scripts/tune.ts`):

| Eis | v Release (Tee-Draw) | Release → Stillstand | Hog-to-Hog | Curl |
|---|---|---|---|---|
| keen | 1,95 m/s | 28,8 s | 15,3 s | 1,43 m |
| normal | 2,07 m/s | 27,2 s | 14,4 s | 1,22 m |
| heavy | 2,19 m/s | 25,6 s | 13,6 s | 1,04 m |

- Takeout (Hog-to-Hog 9,5 s, 2,66 m/s): Curl bis zur Tee Line ≈ 0,28 m (23 % des Draws). 75 % des Draw-Curls entstehen im letzten Drittel des Weges.
- Drehung: 1,6 / 3,2 / 5,4 Umdrehungen → Curl 1,28 / 1,22 / 1,10 m; 13 Umdrehungen → 0,68 m; 23 → 0,45 m (Spinner laufen zudem etwas weiter).
- Halber Treffer: Zielstein-Throw ≈ 3°; Volltreffer: Stoßstein behält ≈ 7,5 % Geschwindigkeit.
- Rechenzeit: ≈ 11 ms pro Draw (6 500 Ticks) auf einem Desktop-Kern → Monte-Carlo-KI machbar.

Tests: `tests/physics/calibration.test.ts` (K1–K9), `collision.test.ts` (K15, K16, Ketten, Double, Tunneling, Linien), `determinism.test.ts` (K17), `ice.test.ts` (Feld, Falls, Abnutzung, End-Drift).

## 10. Parameter anpassen

Alle Werte stehen in `src/physics/config.ts` mit Einheit und Kommentar. Nach Änderungen `npm test` ausführen – die
Kalibrierungstests (`tests/physics/*.test.ts`) zeigen, ob K1–K17 noch eingehalten werden.
