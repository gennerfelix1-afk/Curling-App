/**
 * Second language. The game is written in German; for English the texts are translated at
 * display time – exact matches from the dictionary, otherwise phrase by phrase (messages contain
 * team names and numbers). The game logic and its tests stay untouched.
 */
export type Lang = 'de' | 'en';

let lang: Lang = 'de';

/** Exact texts (static interface). */
const EXACT: Record<string, string> = {
  'Echte Stein-Physik. Wischen. Taktik.': 'Real stone physics. Sweeping. Strategy.',
  Spielen: 'Play',
  '2 Spieler': '2 players',
  'abwechselnd an einem Gerät': 'taking turns on one device',
  Training: 'Practice',
  'Draw, Takeout, Eis lesen': 'Draw, takeout, reading the ice',
  Anleitung: 'How to play',
  Einstellungen: 'Settings',
  '8 Draws auf den Button – wie nah kommst du?': '8 draws to the button – how close can you get?',
  'Stein aus dem House schlagen, eigenen Stein halten': 'Remove the stone from the house and keep yours in',
  'Eis lesen': 'Reading the ice',
  'Unbekanntes Eis ohne Hilfslinie': 'Unknown ice, no guide line',
  Zurück: 'Back',
  Partie: 'Match',
  Gegner: 'Opponent',
  Anfänger: 'Beginner',
  Profi: 'Pro',
  Weltklasse: 'World class',
  '4 (kurz)': '4 (short)',
  'Hammer im 1. End': 'Hammer in end 1',
  Münzwurf: 'Coin toss',
  Eis: 'Ice',
  'schnell (keen)': 'fast (keen)',
  'langsam (heavy)': 'slow (heavy)',
  'wenig (straight)': 'little (straight)',
  'viel (swingy)': 'a lot (swingy)',
  Steuerung: 'Controls',
  Schwierigkeit: 'Difficulty',
  'Anfänger (mit Hilfslinie)': 'Beginner (with guide line)',
  Abgabe: 'Delivery',
  'Abstoßen, gleiten, loslassen': 'Push off, glide, let go',
  'Timing-Anzeigen': 'Timing meters',
  'Wisch-Geste': 'Swipe gesture',
  Wischen: 'Sweeping',
  'selbst wischen': 'sweep yourself',
  'Mitspieler auf Ansage': 'team-mates on your call',
  'Mitspieler automatisch': 'team-mates automatic',
  Gerät: 'Device',
  Ton: 'Sound',
  an: 'on',
  aus: 'off',
  'Skip-Rufe sprechen': 'Spoken skip calls',
  Sprache: 'Language',
  Weiter: 'Continue',
  'Neu starten': 'Restart',
  Hauptmenü: 'Main menu',
  Verstanden: 'Got it',
  'Tipps ausschalten': 'Turn tips off',
  Nochmal: 'Play again',
  Abbrechen: 'Cancel',
  Aufgeben: 'Concede',
  Zeitlupe: 'Slow motion',
  Beenden: 'Stop',
  'Kraft der Wischer': 'Sweepers’ energy',
  'Deine Mitspieler wischen auf deine Ansage': 'Your team-mates sweep on your call',
  'Besen setzen: aufs Eis tippen/ziehen · gestrichelt = geschätzter Weg ohne Wischen': 'Place the broom: tap or drag on the ice · dashed = estimated path without sweeping',
  'Stein nach oben ziehen und vor der roten Hog Line loslassen – gleichmäßig im Tempo, gerade zum Besen': 'Drag the stone up and let go before the red hog line – steady pace, straight at the broom',
  'zu langsam': 'too slow',
  'zu schnell': 'too fast',
  '◀ zu weit links': '◀ too far left',
  'zu weit rechts ▶': 'too far right ▶',
  Steine: 'Stones',
  Datenschutz: 'Privacy',
  Rot: 'Red',
  Gelb: 'Yellow',
};

/** Phrases inside dynamic messages, longest first. */
const PHRASES: [RegExp, string][] = [
  [/Last Stone Draw: je zwei Steine auf den Button – die kleinere Summe bekommt den Hammer\./, 'Last stone draw: two stones each to the button – the smaller total gets the hammer.'],
  [/Hog-Line-Verletzung bei der Abgabe – Stein aus dem Spiel\./, 'Hog line violation at delivery – stone removed from play.'],
  [/Hog Line nicht überquert – Stein aus dem Spiel\./, 'Did not cross the hog line – stone removed from play.'],
  [/Free-Guard-Zone-Verstoß: abgegebener Stein entfernt, Steine zurückgesetzt\./, 'Free guard zone violation: delivered stone removed, stones replaced.'],
  [/No-Tick-Verstoß: abgegebener Stein entfernt, Steine zurückgesetzt\./, 'No-tick violation: delivered stone removed, stones replaced.'],
  [/No-Tick-Verstoß: (\S+) hat einen Guard von der Centre Line geschoben\./, 'No-tick violation: $1 moved a guard off the centre line.'],
  [/(\S+) hat einen laufenden Stein mit dem Besen berührt\./, '$1 touched a moving stone with the brush.'],
  [/(\S+) berührt einen laufenden Stein – Steine bleiben, wie sie ohne Berührung liegen\./, '$1 touches a moving stone – stones stay where they would have come to rest.'],
  [/Berührter Stein vor der Hog Line – aus dem Spiel\./, 'Touched stone before the hog line – removed from play.'],
  [/Berührter Stein entfernt, verschobene Steine zurückgesetzt\./, 'Touched stone removed, displaced stones replaced.'],
  [/Berührten Stein entfernen, verschobene Steine zurücksetzen/, 'Remove the touched stone, replace displaced stones'],
  [/Abgegebenen Stein entfernen, Steine zurücksetzen/, 'Remove the delivered stone, replace the stones'],
  [/Alle Steine liegen lassen/, 'Leave all stones as they are'],
  [/Blank End – der Hammer bleibt\./, 'Blank end – the hammer stays.'],
  [/Gleichstand – Extra End\./, 'Tied – extra end.'],
  [/Münzwurf: (\S+) hat den Hammer\./, 'Coin toss: $1 has the hammer.'],
  [/– (\S+) hat den Hammer\./, '– $1 has the hammer.'],
  [/(\S+) gibt auf – (\S+) gewinnt\./, '$1 concedes – $2 wins.'],
  [/(\S+) gewinnt (\d+:\d+)\./, '$1 wins $2.'],
  [/(\S+) schreibt (\d+)\./, '$1 scores $2.'],
  [/(\S+) spielt: /, '$1 plays: '],
  [/Hit and Stay – 2 Punkte/, 'Hit and stay – 2 points'],
  [/Takeout – 1 Punkt/, 'Takeout – 1 point'],
  [/Verfehlt – 0 Punkte/, 'Missed – 0 points'],
  [/Takeout-Challenge: (\d+) von (\d+) Punkten\./, 'Takeout challenge: $1 of $2 points.'],
  [/cm vom Tee/, 'cm from the tee'],
  [/Nicht im House \(199,6 cm\)/, 'Not in the house (199.6 cm)'],
  [/Schnitt: /, 'Average: '],
  [/Das Eis war: /, 'The ice was: '],
  [/, Curl /, ', curl '],
  [/Draw auf den Button/, 'Draw to the button'],
  [/Draw 8-Fuß/, 'Draw to the 8-foot'],
  [/Guard vor eigenem Stein/, 'Guard on own stone'],
  [/Durchspielen/, 'Throw through'],
  [/Partie beendet/, 'Match over'],
  [/Draw-Challenge/, 'Draw challenge'],
  [/Takeout-Challenge/, 'Takeout challenge'],
  [/Stein (\d+\/\d+)/, 'Stone $1'],
  [/FGZ aktiv/, 'FGZ active'],
  [/Ansage: /, 'Call: '],
  [/Gedrückt halten = Gewicht aufbauen · nach oben wischen = abstoßen/, 'Hold = build up weight · swipe up = push off'],
  [/Jetzt loslassen – vor der roten Linie!/, 'Let go now – before the red line!'],
  [/Seitlich ziehen: Stein auf der Linie halten/, 'Drag sideways: keep the stone on the line'],
  [/Vor dem Stein hin und her reiben = wischen · schneller = härter/, 'Rub back and forth in front of the stone = sweep · faster = harder'],
  [/Hart wischen/, 'Sweeping hard'],
  [/Locker wischen/, 'Sweeping lightly'],
  [/ · linke Seite/, ' · left side'],
  [/ · rechte Seite/, ' · right side'],
  [/Gewicht – tippen in der Mitte!/, 'Weight – tap in the middle!'],
  [/Linie – tippen in der Mitte!/, 'Line – tap in the middle!'],
  [/\(KI\) überlegt …/, '(AI) is thinking …'],
  [/\(KI\) wischt selbst/, '(AI) sweeps itself'],
  [/Deine Mitspieler wischen nach Ansage des Skips/, 'Your team-mates sweep on the skip’s call'],
  [/Skip (\S+) wischt \(L\)/, 'Skip $1 sweeps (L)'],
  [/ entscheidet:/, ' decides:'],
  [/Kamera: Draufsicht/, 'Camera: top view'],
  [/Kamera: Übersicht/, 'Camera: overview'],
  [/Kamera: Auto/, 'Camera: auto'],
  [/Nächstes End/, 'Next end'],
  [/Neue Partie/, 'New match'],
  [/Extra End/, 'Extra end'],
  [/\bRot\b/g, 'Red'],
  [/\bGelb\b/g, 'Yellow'],
];

export function setLang(l: Lang): void {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

/** Translate a text for display. */
export function t(text: string): string {
  if (lang === 'de' || !text) return text;
  const exact = EXACT[text.trim()];
  if (exact !== undefined) return text.replace(text.trim(), exact);
  let out = text;
  for (const [re, to] of PHRASES) out = out.replace(re, to);
  return out;
}

const ORIGINAL = new WeakMap<Node, string>();

/** Translate the static texts of the page (text nodes and titles); can be called again after a language change. */
export function translateDom(root: ParentNode = document.body): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const original = ORIGINAL.get(n) ?? n.nodeValue ?? '';
    if (!original.trim()) continue;
    // remember the German text only for nodes that are static (in the dictionary)
    if (EXACT[original.trim()] === undefined) continue;
    ORIGINAL.set(n, original);
    n.nodeValue = t(original);
  }
}
