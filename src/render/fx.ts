import type { Game } from '../game/game';
import { haptics } from '../input/haptics';
import type { GameView } from './view';

/** Impulse of a firm nose hit [N·s] – scales impact effects. */
const FULL_IMPACT = 45;

/**
 * "Juice": slow motion and camera shake on big hits, impact particles, vibration. Reads the
 * physics events of the world being shown; never changes the game state.
 */
export class Fx {
  /** Factor for the game clock this frame (1 = real time). */
  timeScale = 1;
  private cursor = 0;
  private slowT = 0;
  private slowUsed = false;
  private lastShot = -1;
  private lastPhase = '';

  update(game: Game, view: GameView, dt: number): void {
    // one dramatic slow motion per delivery
    if (game.shot !== this.lastShot) {
      this.lastShot = game.shot;
      this.slowUsed = false;
    }
    const ev = game.viewWorld.events;
    if (ev.length < this.cursor) this.cursor = 0;
    for (; this.cursor < ev.length; this.cursor++) {
      const e = ev[this.cursor];
      if (e.type !== 'collision') continue;
      const strength = Math.min(1, e.impulse / FULL_IMPACT);
      view.impact?.(e.x, e.y, strength);
      haptics.impact(strength);
      if (strength > 0.45 && !this.slowUsed && game.phase === 'running') {
        this.slowUsed = true;
        this.slowT = 0.85;
      }
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      // hold at 30 % speed, then ease back to real time
      this.timeScale = this.slowT > 0.3 ? 0.3 : 0.3 + 0.7 * (1 - Math.max(0, this.slowT) / 0.3);
    } else {
      this.timeScale = 1;
    }
    if (game.phase !== 'running') {
      this.slowT = 0;
      this.timeScale = 1;
    }

    // phase changes you should feel
    const ph = game.phase;
    if (ph !== this.lastPhase) {
      if (ph === 'glide') haptics.pulse(30); // push-off
      else if (ph === 'running' && (this.lastPhase === 'glide' || this.lastPhase === 'slide')) {
        if (game.current && !game.current.inPlay) haptics.error();
        else haptics.pulse(15); // release
      } else if (ph === 'endScore' || ph === 'gameOver') haptics.success();
      else if (ph === 'decision') haptics.error();
      this.lastPhase = ph;
    }
  }
}
