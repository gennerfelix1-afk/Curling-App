import { Game } from './game/game';
import { Controls } from './input/controls';
import { View2D } from './render/view2d';
import './style.css';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);

const game = new Game({ seed });
const view = new View2D(canvas);
const controls = new Controls(game, view, canvas);

function resize(): void {
  view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  view.draw(game, dt);
  controls.refresh();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handle for debugging / automated checks
(window as unknown as { game: Game }).game = game;
