import type { Game } from '../game/game';
import type { View2D } from '../render/view2d';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * Mouse / keyboard / touch input and the HTML overlay (phase 4).
 *
 * Desktop: click or drag on the ice = broom · Q/E or ←/→ = turn · W/S or ↑/↓ = weight ·
 * Space/Enter = deliver & lock meters · A / D = sweeper 1 / 2 (hold = sweep, tap fast = harder) ·
 * 1/2/3 = sweep left / full path / right · Esc = cancel.
 * Touch: the same via the on-screen buttons; the two big sweep pads work with two thumbs.
 */
export class Controls {
  private aimPointer = -1;

  constructor(private game: Game, view: View2D, canvas: HTMLCanvasElement) {
    // aiming on the ice
    const aim = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect();
      const p = view.toSheet(e.clientX - r.left, e.clientY - r.top);
      game.setAim(p.x, p.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (game.phase !== 'aim') return;
      this.aimPointer = e.pointerId;
      aim(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.aimPointer) aim(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.aimPointer) this.aimPointer = -1;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // buttons
    this.press('btn-turn-cw', () => game.setTurn('cw'));
    this.press('btn-turn-ccw', () => game.setTurn('ccw'));
    this.press('btn-weight-down', () => game.changeWeight(-1));
    this.press('btn-weight-up', () => game.changeWeight(1));
    this.press('btn-go', () => game.tap());
    this.press('btn-cancel', () => game.cancel());
    this.press('meter', () => game.tap());
    this.press('btn-side-l', () => game.setSweepSide(-1));
    this.press('btn-side-c', () => game.setSweepSide(0));
    this.press('btn-side-r', () => game.setSweepSide(1));
    this.hold('pad-sweep-0', 0);
    this.hold('pad-sweep-1', 1);

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyQ':
        case 'ArrowLeft':
          game.setTurn('ccw');
          break;
        case 'KeyE':
        case 'ArrowRight':
          game.setTurn('cw');
          break;
        case 'KeyW':
        case 'ArrowUp':
          game.changeWeight(1);
          break;
        case 'KeyS':
        case 'ArrowDown':
          game.changeWeight(-1);
          break;
        case 'Space':
        case 'Enter':
          game.tap();
          break;
        case 'Escape':
          game.cancel();
          break;
        case 'KeyA':
          game.sweepDown(0);
          break;
        case 'KeyD':
          game.sweepDown(1);
          break;
        case 'Digit1':
          game.setSweepSide(-1);
          break;
        case 'Digit2':
          game.setSweepSide(0);
          break;
        case 'Digit3':
          game.setSweepSide(1);
          break;
        default:
          return;
      }
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyA') game.sweepUp(0);
      if (e.code === 'KeyD') game.sweepUp(1);
    });
    window.addEventListener('blur', () => {
      game.sweepUp(0);
      game.sweepUp(1);
    });
  }

  private press(id: string, fn: () => void): void {
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
  }

  private hold(id: string, sweeper: number): void {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.game.sweepDown(sweeper);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    const up = (): void => this.game.sweepUp(sweeper);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** Sync the overlay with the game state (called every frame). */
  refresh(): void {
    const g = this.game;
    const phase = g.phase;
    document.body.dataset.phase = phase;
    $('hud-end').textContent = `End ${g.end} · Stein ${Math.min(g.shot + 1, g.options.stonesPerEnd)}/${g.options.stonesPerEnd}`;
    const team = $('hud-team');
    team.textContent = g.team === 0 ? 'Rot' : 'Gelb';
    team.dataset.team = String(g.team);
    $('weight-label').textContent = g.weight.label;
    $('btn-turn-cw').classList.toggle('on', g.turn === 'cw');
    $('btn-turn-ccw').classList.toggle('on', g.turn === 'ccw');
    $('btn-side-l').classList.toggle('on', g.sweepSide === -1);
    $('btn-side-c').classList.toggle('on', g.sweepSide === 0);
    $('btn-side-r').classList.toggle('on', g.sweepSide === 1);
    $('btn-go').textContent = phase === 'endOver' ? 'Nächstes End' : 'Abgabe';

    // meter
    const meter = phase === 'meterWeight' || phase === 'meterLine';
    if (meter) {
      $('meter-title').textContent = phase === 'meterWeight' ? 'Gewicht – tippen in der Mitte!' : 'Linie – tippen in der Mitte!';
      $('meter-marker').style.left = `${50 + g.meter * 50}%`;
    }

    // running
    if (phase === 'running') {
      $('hud-speed').textContent = `${g.speed.toFixed(2)} m/s`;
      $('hud-call').textContent = g.call;
      for (let k = 0; k < 2; k++) {
        const pad = $(`pad-sweep-${k}`);
        const i = g.sweepIntensity(k);
        pad.style.setProperty('--level', String(i));
        pad.classList.toggle('on', i > 0);
        const fatigue = g.world.sweepers.state[k].fatigue;
        $(`fatigue-${k}`).style.width = `${Math.round((1 - fatigue / 0.4) * 100)}%`;
      }
    } else {
      $('hud-speed').textContent = '';
      $('hud-call').textContent = phase === 'settled' ? '' : '';
    }
  }
}
