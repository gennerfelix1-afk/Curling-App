import type { Sound } from '../audio/sound';
import { TEAM_NAMES, type DrillKind, type Game } from '../game/game';
import { haptics } from '../input/haptics';
import { getLang, setLang, t, translateDom, type Lang } from './i18n';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export type Mode = 'ai' | 'hotseat' | DrillKind;

/** Settings that are remembered on the device. */
const SELECTS = ['opt-ai', 'opt-ends', 'opt-hammer', 'opt-ice', 'opt-curl', 'opt-difficulty', 'opt-delivery', 'opt-sweep', 'opt-sound', 'opt-voice', 'opt-haptics', 'opt-lang'];

interface Stats {
  /** Wins / losses against the AI per strength level. */
  won: number[];
  lost: number[];
  /** Best results of the drills: average distance [m] or points. */
  bestDraw: number | null;
  bestIce: number | null;
  bestTakeout: number | null;
}

interface Tip {
  id: string;
  title: string;
  text: string;
  /** When to show the tip during play. */
  when: (g: Game) => boolean;
}

const TIPS: Tip[] = [
  {
    id: 'aim',
    title: 'Zielen',
    text: 'Ziehe seitlich über das Eis, um den Zielpunkt (grüner Ring) zu verschieben, oder tippe, um ihn zu setzen – dorthin zielt der Stein. Wähle die Drehung (In-Turn oder Out-Turn bestimmt, in welche Richtung der Stein am Ende curlt) und sage ein Gewicht an. Die gestrichelte Linie zeigt den Weg ohne Wischen.',
    when: (g) => g.phase === 'aim' && !g.isAI(g.team),
  },
  {
    id: 'push',
    title: 'Abgabe',
    text: 'Lege den Finger aufs Eis und halte: Die Skala füllt sich und zeigt das Gewicht. Beim gewünschten Gewicht nach oben wischen – der Stein stößt sich ab. Ziehe dann seitlich, um ihn auf der Linie zu halten, und lass vor der roten Linie los.',
    when: (g) => g.phase === 'charge',
  },
  {
    id: 'sweep',
    title: 'Wischen',
    text: 'Halte einen Finger auf den Bildschirm, um zu wischen. Wischen trägt den Stein weiter und hält ihn gerader. Der Skip ruft dir zu: HARD! = wischen, Off! = loslassen.',
    when: (g) => g.phase === 'running' && !g.isAI(g.team) && g.options.sweepMode === 'manual' && g.speed > 0.5,
  },
  {
    id: 'score',
    title: 'Wertung',
    text: 'Es zählen nur Steine im House. Das Team mit dem Stein am nächsten zur Mitte bekommt einen Punkt für jeden Stein, der näher liegt als der beste Stein des Gegners. Wer punktet, gibt den letzten Stein (Hammer) im nächsten End ab.',
    when: (g) => g.phase === 'endScore',
  },
];

const EN_TIPS: Record<string, { title: string; text: string }> = {
  aim: { title: 'Aiming', text: 'Drag sideways across the ice to move the target (green ring), or tap to place it – that is where the stone is aimed. Choose the turn (in-turn or out-turn decides which way the stone curls at the end) and call a weight. The dashed line shows the path without sweeping.' },
  push: { title: 'Delivery', text: 'Put a finger on the ice and hold: the scale fills up and shows the weight. At the weight you want, swipe up – the stone pushes off. Then drag sideways to keep it on the line and let go before the red line.' },
  sweep: { title: 'Sweeping', text: 'Hold a finger on the screen to sweep. Sweeping carries the stone further and keeps it straighter. The skip calls: HARD! = sweep, Off! = let go.' },
  score: { title: 'Scoring', text: 'Only stones in the house count. The team with the stone closest to the centre gets one point for each stone closer than the opponent’s best. The scoring team gives up the last stone (hammer) in the next end.' },
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage full: settings simply are not remembered */
  }
}

/**
 * Everything around the match: home screen, settings (remembered on the device), pause,
 * first-time tips, the summary after a match and simple statistics.
 */
export class Shell {
  private stats: Stats = load<Stats>('curling.stats', { won: [0, 0, 0, 0], lost: [0, 0, 0, 0], bestDraw: null, bestIce: null, bestTakeout: null });
  private seen: Record<string, boolean> = load('curling.tips', {});
  private tipsOff = false;
  private mode: Mode = 'ai';
  private recorded: Game | null = null;
  private overTime = 0;

  constructor(private sound: Sound, private start: (mode: Mode) => void) {
    // remembered settings
    const stored = load<Record<string, string>>('curling.settings', {});
    for (const id of SELECTS) {
      const el = $<HTMLSelectElement>(id);
      if (stored[id] !== undefined && [...el.options].some((o) => o.value === stored[id])) el.value = stored[id];
      el.addEventListener('change', () => this.settingsChanged());
    }
    if (stored['opt-lang'] === undefined) {
      $<HTMLSelectElement>('opt-lang').value = (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
    }
    this.tipsOff = !!this.seen.__off;

    const go = (screen: string): void => {
      $('menu').dataset.screen = screen;
      $('menu').scrollTop = 0;
      if (screen === 'home') this.renderHome();
      if (screen === 'howto') this.renderHowTo();
    };
    $('btn-play-ai').addEventListener('click', () => this.play('ai'));
    $('btn-play-2p').addEventListener('click', () => this.play('hotseat'));
    $('btn-training').addEventListener('click', () => go('training'));
    $('btn-settings').addEventListener('click', () => go('settings'));
    $('btn-howto').addEventListener('click', () => go('howto'));
    for (const b of document.querySelectorAll<HTMLElement>('#menu .back')) b.addEventListener('click', () => go('home'));
    for (const b of document.querySelectorAll<HTMLElement>('[data-drill]')) {
      b.addEventListener('click', () => this.play(b.dataset.drill as DrillKind));
    }

    $('btn-pause').addEventListener('click', () => this.setPaused(true));
    $('btn-resume').addEventListener('click', () => this.setPaused(false));
    $('btn-restart').addEventListener('click', () => {
      this.setPaused(false);
      this.play(this.mode);
    });
    const home = (): void => {
      this.setPaused(false);
      $('summary').classList.remove('open');
      document.body.dataset.menu = 'open';
      go('home');
    };
    $('btn-quit').addEventListener('click', home);
    $('btn-home').addEventListener('click', home);
    $('btn-again').addEventListener('click', () => {
      $('summary').classList.remove('open');
      this.play(this.mode);
    });
    $('btn-pause-sound').addEventListener('click', () => this.toggle('opt-sound'));
    $('btn-pause-haptics').addEventListener('click', () => this.toggle('opt-haptics'));
    $('btn-tip-ok').addEventListener('click', () => $('tip').classList.remove('open'));
    $('btn-tip-skip').addEventListener('click', () => {
      this.tipsOff = true;
      this.seen.__off = true;
      save('curling.tips', this.seen);
      $('tip').classList.remove('open');
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && document.body.dataset.menu !== 'open') this.setPaused(!$('pause').classList.contains('open'));
    });
    // going to the background pauses the match
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && document.body.dataset.menu !== 'open' && !$('summary').classList.contains('open')) this.setPaused(true);
    });

    this.settingsChanged();
    go('home');
  }

  /** The match must not advance while a menu, the pause sheet or a tip is open. */
  get blocking(): boolean {
    return document.body.dataset.menu === 'open' || $('pause').classList.contains('open') || $('tip').classList.contains('open');
  }

  private play(mode: Mode): void {
    this.mode = mode;
    $<HTMLSelectElement>('opt-mode').value = mode;
    this.recorded = null;
    this.overTime = 0;
    this.start(mode);
  }

  private toggle(id: string): void {
    const el = $<HTMLSelectElement>(id);
    el.value = el.value === 'on' ? 'off' : 'on';
    this.settingsChanged();
  }

  private setPaused(on: boolean): void {
    $('pause').classList.toggle('open', on);
  }

  /** Apply and remember the settings. */
  private settingsChanged(): void {
    const values: Record<string, string> = {};
    for (const id of SELECTS) values[id] = $<HTMLSelectElement>(id).value;
    save('curling.settings', values);
    this.sound.muted = values['opt-sound'] === 'off';
    this.sound.voice = values['opt-voice'] === 'on';
    haptics.enabled = values['opt-haptics'] === 'on';
    if (getLang() !== values['opt-lang']) setLang(values['opt-lang'] as Lang);
    translateDom();
    this.renderHome();
    $('btn-pause-sound').textContent = `${t('Ton')}: ${t(this.sound.muted ? 'aus' : 'an')}`;
    $('btn-pause-haptics').textContent = `Vibration: ${t(haptics.enabled ? 'an' : 'aus')}`;
  }

  /** The speaker button in the game changed the sound: keep the setting in sync. */
  syncSound(): void {
    const el = $<HTMLSelectElement>('opt-sound');
    const v = this.sound.muted ? 'off' : 'on';
    if (el.value !== v) {
      el.value = v;
      this.settingsChanged();
    }
  }

  private renderHome(): void {
    const level = $<HTMLSelectElement>('opt-ai');
    const ends = $<HTMLSelectElement>('opt-ends').value;
    const en = getLang() === 'en';
    $('play-ai-sub').textContent = en
      ? `vs. AI “${t(level.options[level.selectedIndex].text)}” · ${ends} ends`
      : `gegen die KI „${level.options[level.selectedIndex].text}“ · ${ends} Ends`;
    const s = this.stats;
    const won = s.won.reduce((a, b) => a + b, 0);
    const lost = s.lost.reduce((a, b) => a + b, 0);
    const parts: string[] = [];
    if (won + lost > 0) parts.push(en ? `Record vs. AI: ${won} won · ${lost} lost` : `Bilanz gegen die KI: ${won} Siege · ${lost} Niederlagen`);
    if (s.bestDraw !== null) parts.push(`${en ? 'Best draw challenge' : 'Beste Draw-Challenge'}: ⌀ ${(s.bestDraw * 100).toFixed(0)} cm`);
    if (s.bestTakeout !== null) parts.push(`${en ? 'Best takeout challenge' : 'Beste Takeout-Challenge'}: ${s.bestTakeout}/16`);
    if (s.bestIce !== null) parts.push(`${en ? 'Best ice reading' : 'Bestes Eis-Lesen'}: ⌀ ${(s.bestIce * 100).toFixed(0)} cm`);
    $('stats').innerHTML = parts.join('<br>');
  }

  private tipText(tip: Tip): { title: string; text: string } {
    return getLang() === 'en' ? EN_TIPS[tip.id] : tip;
  }

  private renderHowTo(): void {
    $('howto-list').innerHTML = TIPS.map((tip) => {
      const x = this.tipText(tip);
      return `<h4>${x.title}</h4><p>${x.text}</p>`;
    }).join('');
  }

  /** Call once per frame: first-time tips and the summary after the match. */
  update(game: Game, dt: number): void {
    if (document.body.dataset.menu === 'open') return;
    if (!this.tipsOff && !this.blocking) {
      for (const tip of TIPS) {
        if (this.seen[tip.id] || !tip.when(game)) continue;
        // the delivery tip belongs to the push delivery only
        if (tip.id === 'push' && game.options.delivery !== 'push') continue;
        this.seen[tip.id] = true;
        save('curling.tips', this.seen);
        const x = this.tipText(tip);
        $('tip-title').textContent = x.title;
        $('tip-text').textContent = x.text;
        $('tip').classList.add('open');
        // the finger may still be down: release held inputs so nothing keeps charging
        game.cancel();
        break;
      }
    }
    if (game.phase === 'gameOver') {
      this.overTime += dt;
      if (this.recorded !== game && this.overTime > 1.4) {
        this.recorded = game;
        this.finish(game);
      }
    } else {
      this.overTime = 0;
    }
  }

  /** Record the result and show the summary. */
  private finish(game: Game): void {
    const en = getLang() === 'en';
    const s = this.stats;
    let title: string;
    let body = '';
    const d = game.drill;
    if (d) {
      const sum = d.results.reduce((a, b) => a + b, 0);
      if (d.kind === 'takeout') {
        title = en ? 'Takeout challenge' : 'Takeout-Challenge';
        body = `<div class="big-num">${sum} / ${d.attempts * 2}</div><div>${en ? 'points' : 'Punkte'}</div>`;
        if (s.bestTakeout === null || sum > s.bestTakeout) {
          s.bestTakeout = sum;
          body += `<div>★ ${en ? 'New best!' : 'Neue Bestleistung!'}</div>`;
        }
      } else {
        const avg = sum / d.results.length;
        title = d.kind === 'ice' ? (en ? 'Reading the ice' : 'Eis lesen') : en ? 'Draw challenge' : 'Draw-Challenge';
        body = `<div class="big-num">⌀ ${(avg * 100).toFixed(0)} cm</div><div>${en ? 'average distance to the tee' : 'mittlerer Abstand zum Tee'}</div>`;
        const key = d.kind === 'ice' ? 'bestIce' : 'bestDraw';
        if (s[key] === null || avg < s[key]!) {
          s[key] = avg;
          body += `<div>★ ${en ? 'New best!' : 'Neue Bestleistung!'}</div>`;
        }
        if (d.kind === 'ice') body += `<div>${t(`Das Eis war: ${game.ice.options.speed}, Curl ${game.ice.options.curl}`)}</div>`;
      }
    } else {
      const m = game.match;
      const w = m.winner;
      const vsAi = game.isAI(1) && !game.isAI(0);
      if (vsAi) {
        title = w === 0 ? (en ? 'You win!' : 'Sieg!') : en ? 'You lose' : 'Niederlage';
        const lvl = game.options.aiLevel;
        if (w === 0) s.won[lvl]++;
        else s.lost[lvl]++;
      } else {
        title = en ? `${t(TEAM_NAMES[w])} wins` : `${TEAM_NAMES[w]} gewinnt`;
      }
      body = `<div class="big-num">${m.total(0)} : ${m.total(1)}</div>`;
      if (game.ratings.length) {
        const avg = game.ratings.reduce((a, b) => a + b, 0) / game.ratings.length;
        const great = game.ratings.filter((x) => x === 3).length;
        body += `<div>${en ? 'Your shots' : 'Deine Würfe'}: ⌀ ${avg.toFixed(1)} ★ · ${great}× ${en ? 'great' : 'super'}</div>`;
      }
      if (m.conceded >= 0) body += `<div>${en ? `${t(TEAM_NAMES[m.conceded])} conceded` : `${TEAM_NAMES[m.conceded]} hat aufgegeben`}</div>`;
      body += `<table>${$('scoreboard').innerHTML}</table>`;
      if (vsAi) {
        const lvl = game.options.aiLevel;
        body += `<div>${en ? `Record at this level: ${s.won[lvl]} won · ${s.lost[lvl]} lost` : `Bilanz auf dieser Stufe: ${s.won[lvl]} Siege · ${s.lost[lvl]} Niederlagen`}</div>`;
      }
    }
    save('curling.stats', s);
    $('summary-title').textContent = title;
    $('summary-body').innerHTML = body;
    $('summary').classList.add('open');
    if (title === 'Sieg!' || title === 'You win!') this.sound.applause();
  }
}
