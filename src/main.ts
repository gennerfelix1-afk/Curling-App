import { Game, type DrillKind, type GameOptions } from './game/game';
import { Controls } from './input/controls';
import type { CurlAmount, Difficulty, IceSpeed } from './physics/config';
import { Sound } from './audio/sound';
import { Fx } from './render/fx';
import type { GameView } from './render/view';
import { View2D } from './render/view2d';
import './style.css';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const value = (id: string): string => (document.getElementById(id) as HTMLSelectElement).value;

function optionsFromMenu(): Partial<GameOptions> {
  const difficulty = value('opt-difficulty') as Difficulty;
  const hammer = value('opt-hammer') as 'coin' | 'lsd';
  const mode = value('opt-mode');
  const drill = mode === 'draw' || mode === 'takeout' || mode === 'ice' ? (mode as DrillKind) : null;
  return {
    players: mode === 'ai' ? ['human', 'ai'] : ['human', 'human'],
    aiLevel: Number(value('opt-ai')),
    sweepMode: value('opt-sweep') as 'manual' | 'calls' | 'auto',
    drill,
    seed: Number(params.get('seed')) || (Date.now() & 0x7fffffff),
    ends: Number(value('opt-ends')),
    hammer,
    difficulty,
    preview: difficulty === 'beginner',
    delivery: value('opt-delivery') as 'meter' | 'gesture',
    ice: { speed: value('opt-ice') as IceSpeed, curl: value('opt-curl') as CurlAmount },
  };
}

let game = new Game({ seed: 1, hammer: 0 }); // placeholder behind the menu
/** 3D by default (loaded as a separate chunk); `?view=2d` or missing WebGL → simple 2D canvas. */
async function createView(): Promise<GameView> {
  if (params.get('view') !== '2d') {
    try {
      const { View3D } = await import('./render/view3d');
      return new View3D(canvas, document.getElementById('overlay')!);
    } catch (err) {
      console.warn('WebGL nicht verfügbar – 2D-Ansicht', err);
    }
  }
  return new View2D(canvas);
}
const view = await createView();
const sound = new Sound();
const fx = new Fx();
const controls = new Controls(game, view, canvas, sound);
function start(): void {
  sound.start();
  game = new Game(optionsFromMenu());
  controls.game = game;
  document.body.dataset.menu = 'closed';
  (window as unknown as { game: Game }).game = game;
}
document.getElementById('btn-start')!.addEventListener('click', start);
document.getElementById('btn-continue')!.addEventListener('click', () => {
  if (game.phase === 'gameOver') document.body.dataset.menu = 'open';
});
const modeSelect = document.getElementById('opt-mode') as HTMLSelectElement;
const syncMode = (): void => {
  const m = modeSelect.value;
  document.body.dataset.mode = m === 'ai' ? 'ai' : m === 'hotseat' ? 'hotseat' : 'drill';
};
modeSelect.addEventListener('change', syncMode);
syncMode();
if (params.has('autostart')) start();

function resize(): void {
  view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (document.body.dataset.menu !== 'open') {
    fx.update(game, view, dt);
    game.update(dt * fx.timeScale); // brief slow motion on big hits
  }
  view.draw(game, dt);
  sound.update(game, dt);
  controls.refresh();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// installable / offline (PWA): only in the production build
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
