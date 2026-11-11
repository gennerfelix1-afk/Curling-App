import { Game, type GameOptions } from './game/game';
import { Controls } from './input/controls';
import type { CurlAmount, Difficulty, IceSpeed } from './physics/config';
import { View2D } from './render/view2d';
import './style.css';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const value = (id: string): string => (document.getElementById(id) as HTMLSelectElement).value;

function optionsFromMenu(): Partial<GameOptions> {
  const difficulty = value('opt-difficulty') as Difficulty;
  const hammer = value('opt-hammer') as 'coin' | 'lsd';
  return {
    seed: Number(params.get('seed')) || (Date.now() & 0x7fffffff),
    ends: Number(value('opt-ends')),
    hammer,
    difficulty,
    preview: difficulty === 'beginner',
    ice: { speed: value('opt-ice') as IceSpeed, curl: value('opt-curl') as CurlAmount },
  };
}

let game = new Game({ seed: 1, hammer: 0 }); // placeholder behind the menu
const view = new View2D(canvas);
const controls = new Controls(game, view, canvas);

function start(): void {
  game = new Game(optionsFromMenu());
  controls.game = game;
  document.body.dataset.menu = 'closed';
  (window as unknown as { game: Game }).game = game;
}
document.getElementById('btn-start')!.addEventListener('click', start);
document.getElementById('btn-continue')!.addEventListener('click', () => {
  if (game.phase === 'gameOver') document.body.dataset.menu = 'open';
});
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
  if (document.body.dataset.menu !== 'open') game.update(dt);
  view.draw(game, dt);
  controls.refresh();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
