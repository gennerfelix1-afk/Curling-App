# Curling-App

Realistisches Curling-Spiel für den Browser (Desktop + Mobile). TypeScript, Vite, Three.js; deterministische
Physik mit festem Zeitschritt (240 Hz), headless getestet mit Vitest.

**Status:** Alle 8 Phasen umgesetzt – siehe [`docs/PLAN.md`](docs/PLAN.md) (mit Abnahme-Checkliste und offenen Punkten).

## Dokumentation
- [`docs/PLAN.md`](docs/PLAN.md) – Architektur und Phasenplan
- [`docs/RULES.md`](docs/RULES.md) – umgesetzte Regeln (World Curling, Ausgabe 1.9.2026) mit Regelnummern
- [`docs/PHYSICS.md`](docs/PHYSICS.md) – Physikmodell, Formeln, Parameter, Kalibrierziele
- [`docs/RELEASE.md`](docs/RELEASE.md) – Veröffentlichung: Checkliste, Store-Texte, offene Entscheidungen
- [`docs/AI.md`](docs/AI.md) – KI-Gegner, Wisch-Berater (Skip-Rufe), Spiel- und Trainingsmodi

## Entwicklung
```bash
npm install
npm run dev        # Dev-Server
npm test           # Physik-/Regeltests (inkl. Kalibrierung)
npm run build      # Typecheck + Produktions-Build nach dist/
```

## Physik-Parameter anpassen
Alle Konstanten stehen zentral in [`src/physics/config.ts`](src/physics/config.ts), jeweils mit Einheit und Kommentar:

| Block | Inhalt |
|---|---|
| `SHEET`, `STONE` | Maße des Spielfelds und des Steins |
| `FRICTION` | Reibung für keen / normal / heavy, Geschwindigkeitsabhängigkeit |
| `CURL` | Curl-Stärke, später Curl, Abhängigkeit von der Drehung |
| `ICE` | Raster, Zufallsvariation, Gefälle, Abnutzung, Wischwärme |
| `SWEEP` | Besenfläche, Wärmeeintrag, Ermüdung |
| `COLLISION` | Restitution und Reibung zwischen den Steinen |
| `WEIGHTS`, `EXECUTION` | Gewichte in Curling-Sprache, Ausführungsfehler, Gesten-Tempo |
| `RULES` | Regel-Parameter (FGZ, Mess-Schwelle, LSD) |

Vorgehen: Wert ändern → `npm test` (die Kalibrierungstests in `tests/physics/` zeigen, ob Draw-Zeit, Curl,
Wisch-Effekt usw. noch in den Zielbereichen liegen) → mit `npx vite-node scripts/tune.ts` bzw.
`scripts/tune-sweep.ts` die Messwerte ansehen. Im Spiel zeigt `B` das Debug-Overlay. Die Stärke der KI steht in
`AI_LEVELS` (`src/ai/planner.ts`).

## Deployment und Installation
- GitHub Actions (`.github/workflows/ci.yml`) prüft jeden Push: Typecheck, Tests, Build.
- `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und veröffentlicht auf GitHub Pages. Dafür einmalig
  in den Repository-Einstellungen *Pages → Source: GitHub Actions* wählen.
- Das Spiel ist eine **PWA**: Im Browser „Zum Startbildschirm hinzufügen“ bzw. „Installieren“ wählen. Nach dem ersten
  Laden läuft es auch offline.

## Steuerung

Ablauf pro Stein: **Besen setzen → Drehung → Gewicht → Abgabe → Wischen**.

| Aktion | Maus / Tastatur | Touch |
|---|---|---|
| Besen (Zielpunkt) setzen | aufs Eis klicken / ziehen | aufs Eis tippen / ziehen |
| Drehung: Out-Turn ↺ / In-Turn ↻ | `Q` / `E` oder `←` / `→` | Buttons |
| Gewicht leichter / schwerer | `S` / `W` oder `↓` / `↑` | `−` / `+` |
| **Abgabe** (Standard): Gewicht aufbauen | `Leertaste` gedrückt halten | „Abgabe“ tippen, dann Finger aufs Eis legen und halten |
| Abstoßen | `Leertaste` loslassen | Finger nach oben wischen (nicht abheben) |
| Linie halten beim Gleiten | `←` / `→` | Finger seitlich ziehen |
| Stein loslassen (vor der roten Hog Line) | `Leertaste` | Finger abheben |
| Alternative Abgabe „Timing-Anzeigen“ (im Menü) | `Leertaste` / `Enter` (3×) | „Abgabe“, dann 2× auf die Anzeige tippen |
| Abgabe per Wisch-Geste (im Menü wählbar, Standard auf Touch-Geräten) | „Abgabe“, dann mit der Maus nach oben ziehen und loslassen | „Abgabe“, dann nach oben wischen und loslassen |
| Abbrechen (vor dem Abstoß) | `Esc` | „Abbrechen“ |
| Wischen | `A` / `D` halten (Wischer 1 / 2), schnell wiederholt drücken = härter; oder mit der Maus reiben | mit dem Finger auf dem Eis hin und her reiben – schneller = härter |
| Wischseite links / mittig / rechts | `1` / `2` / `3` | im linken / mittleren / rechten Drittel des Bildschirms reiben |
| Skip des anderen Teams wischt (ab Tee Line) | `L` halten | Button „Skip … wischt“ |
| Ansage an die Mitspieler (Wisch-Modus „auf Ansage“): HARD / Clean / Off | `H` / `J` / `K` | Buttons |
| Kamera: Auto → Draufsicht → Übersicht | `C` | Button „Kamera“ |
| Replay des letzten Wurfs (Zeitlupe bei Kollisionen) | `R` | Button „⟲ Replay“ |
| Ton an / aus | `M` | Lautsprecher-Button |
| Debug-Overlay (Reibungsfeld, Geschwindigkeit, Drehung, vorhergesagte Bahn) | `B` oder `F3` | – |

- **Abstoßen, gleiten, loslassen** (Standard): Je länger du hältst, desto mehr Gewicht – die Skala zeigt live den
  Namen des Gewichts (Guard … Peel), der weiße Strich markiert das angesagte Gewicht. Nach dem Abstoßen driftet der
  Stein leicht von der Linie zum Besen ab; die Anzeige zeigt „zu weit links / rechts“, du ziehst dagegen. Loslassen
  gibt den Stein frei. Wer früh loslässt, verliert nur die Kontrolle über die Linie (der Stein gleitet allein weiter);
  wer an der Hog Line noch festhält, verliert den Stein.
- **Wisch-Geste** (Alternative): Der Stein folgt dem Finger aus dem Hack. Das Tempo der Geste bestimmt das Gewicht (die Anzeige
  zeigt live „zu langsam / zu schnell“; ideal sind ca. 1,3 s bis zum Loslassen), ein schräger Zug verfehlt den Besen.
  Wer an der roten Hog Line noch nicht losgelassen hat, verliert den Stein (Hog-Line-Verletzung).
- **Timing-Anzeigen:** Die beiden Anzeigen bei der Abgabe bestimmen den Ausführungsfehler: je näher an der Mitte gestoppt, desto genauer
  stimmen Gewicht und Linie.
- **Wischen durch Reiben:** Ein Finger steuert beide Wischer. Etwa eine Bildschirmbreite pro Sekunde ist volle
  Intensität; hartes Dauerwischen ermüdet (Balken „Kraft der Wischer“). Jeder Strich ist als kurze Vibration spürbar
  (Android; iPhones erlauben im Browser keine Vibration).
- **Spielgefühl:** Zeitlupe, Eis-Spritzer und Kamera-Wackeln bei harten Treffern, Vibration bei Abstoßen, Loslassen
  und Treffern, Punkte-Einblendung mit Ton am Ende jedes Ends.
- Die gestrichelte Linie zeigt den geschätzten Weg **ohne** Wischen (Anfänger-Hilfe).
- **Spielerfiguren:** Werfer (Hocke im Hack, Abgabe-Ausfallschritt), zwei Wischer mit Lauf- und Wischbewegung, der
  Skip am Besen und der Skip des Gegners – einfache Gelenkfiguren, im Code erzeugt und animiert. In der Draufsicht
  aufs House werden sie ausgeblendet, damit sie keine Steine verdecken.
- **Halle:** Eis, Granit, Tribüne mit Zuschauern, Banner und Hallenlicht werden komplett im Code erzeugt (keine
  Grafikdateien). Kommt das Gerät nicht mit, senkt die Ansicht erst die Auflösung und schaltet dann Schatten und
  Zuschauer ab; `?quality=high` erzwingt alle Details.
- `?seed=123` in der URL legt Eis und Zufall fest (reproduzierbare Partie); `?view=2d` schaltet auf die einfache
  2D-Draufsicht (auch automatisch, wenn WebGL fehlt).

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

## Spielmodi

- **Gegen die KI** (du spielst Rot) in vier Stärken: Anfänger, Club, Profi, Weltklasse.
- **2 Spieler** am selben Gerät.
- **Training:** Draw-Challenge, Takeout-Challenge, Eis lesen (je 8 Versuche).
- **Wischen:** selbst wischen, Mitspieler auf Ansage (HARD / Clean / Off) oder Mitspieler automatisch. Der Skip ruft
  bei jedem Stein „HARD!“, „Line!“, „Clean“ oder „Off!“ – als Anzeige und gesprochen.

## Replay

Nach jedem Wurf (wenn du am Zug bist oder das End gewertet wird) zeigt „⟲ Replay“ den letzten Wurf noch einmal. Das
Replay ist keine Aufzeichnung, sondern eine exakte Neuberechnung aus Seed, Eiszustand und den Wisch-Eingaben pro Tick –
möglich, weil die Physik deterministisch ist. Rund um Kollisionen läuft es automatisch in Zeitlupe.
