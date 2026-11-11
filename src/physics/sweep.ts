import { DERIVED, STONE, SWEEP } from './config';
import type { Stone } from './stone';
import type { World } from './world';

/** Sweeping input of one sweeper for one tick. */
export interface SweepCommand {
  /** Stone to sweep in front of. */
  stoneId: number;
  /** Pressure × stroke rate, 0…1 (quantised to SWEEP.intensitySteps). */
  intensity: number;
  /** Side of the path: -1 = left, 0 = across the full path, 1 = right (seen in travel direction). */
  side: -1 | 0 | 1;
}

export interface SweeperState {
  /** Brush head position. */
  x: number;
  y: number;
  /** Stone the sweeper is currently with (-1 = none). */
  stoneId: number;
  /** Brush is on the ice and effective this tick. */
  down: boolean;
  /** Effective intensity of this tick after fatigue (for display / sound). */
  effective: number;
  /** Fatigue: loss of effectiveness, 0…SWEEP.fatigueMax. */
  fatigue: number;
}

const DT = DERIVED.dt;
const R = STONE.radius;

/** Round an input intensity to the recorded resolution. */
export function quantizeIntensity(i: number): number {
  const c = i < 0 ? 0 : i > 1 ? 1 : i;
  return Math.round(c * SWEEP.intensitySteps) / SWEEP.intensitySteps;
}

/**
 * The sweepers of the delivering team. Sweeping warms and polishes the ice directly in front of
 * the stone: the heat is written into the ice field (and decays there), which lowers the friction
 * the running band reads a moment later → more distance, less curl.
 */
export class Sweepers {
  readonly state: SweeperState[] = [];

  constructor(count: number = SWEEP.sweepers) {
    for (let i = 0; i < count; i++) {
      this.state.push({ x: 0, y: 0, stoneId: -1, down: false, effective: 0, fatigue: 0 });
    }
  }

  /** Apply one tick of sweeping input (index = sweeper). */
  apply(world: World, cmds?: readonly (SweepCommand | null)[]): void {
    for (let k = 0; k < this.state.length; k++) {
      const sw = this.state[k];
      const cmd = cmds ? cmds[k] : null;
      const intensity = cmd ? quantizeIntensity(cmd.intensity) : 0;
      const wasDown = sw.down;
      sw.down = false;
      sw.effective = 0;
      const stone = cmd && intensity > 0 ? world.getStone(cmd.stoneId) : undefined;
      const speed = stone ? Math.sqrt(stone.vx * stone.vx + stone.vy * stone.vy) : 0;
      if (!cmd || !stone || !stone.inPlay || speed < 0.01) {
        sw.fatigue -= SWEEP.recoveryRate * DT;
        if (sw.fatigue < 0) sw.fatigue = 0;
        continue;
      }
      // work and fatigue (hard sweeping tires disproportionately)
      sw.fatigue += (SWEEP.fatigueRate * intensity * intensity - SWEEP.recoveryRate * (1 - intensity)) * DT;
      if (sw.fatigue > SWEEP.fatigueMax) sw.fatigue = SWEEP.fatigueMax;
      else if (sw.fatigue < 0) sw.fatigue = 0;

      // brush patch directly in front of the stone
      const fx = stone.vx / speed;
      const fy = stone.vy / speed;
      const lx = -fy; // left of travel
      const ly = fx;
      const ahead = R + SWEEP.gap[k % SWEEP.gap.length] + SWEEP.brushDepth / 2;
      const off = -cmd.side * SWEEP.sideOffset; // side +1 = right = -left
      const tx = stone.x + fx * ahead + lx * off;
      const ty = stone.y + fy * ahead + ly * off;
      if (sw.stoneId !== stone.id) {
        // walk over to the other stone first; no effect until the brush is in position
        const first = sw.stoneId < 0;
        const dx = tx - sw.x;
        const dy = ty - sw.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const reach = (SWEEP.moveSpeed + speed) * DT;
        if (!first && d > reach) {
          sw.x += (dx / d) * reach;
          sw.y += (dy / d) * reach;
          continue;
        }
        sw.stoneId = stone.id;
      }
      sw.x = tx;
      sw.y = ty;

      // contact with other stones: lift before a resting stone; a moving stone running into a
      // brush that is on the ice is "touched"
      let blocked = false;
      for (let i = 0; i < world.stones.length; i++) {
        const o = world.stones[i];
        if (!o.inPlay || o === stone) continue;
        const dx = o.x - tx;
        const dy = o.y - ty;
        const reach = R + SWEEP.touchRadius;
        if (dx * dx + dy * dy < reach * reach) {
          blocked = true;
          // a brush that was already lifted (e.g. before a resting stone) touches nothing
          if (o.moving && wasDown) this.touch(world, o, k);
        }
      }
      if (blocked) continue;

      sw.down = true;
      sw.effective = intensity * (1 - sw.fatigue);
      this.heat(world, tx, ty, fx, fy, sw.effective * SWEEP.heatRate * DT);
    }
  }

  private touch(world: World, stone: Stone, sweeper: number): void {
    for (let i = world.events.length - 1; i >= 0; i--) {
      const e = world.events[i];
      if (e.type === 'touched' && e.id === stone.id) return; // report once per stone
    }
    world.events.push({ type: 'touched', tick: world.tick, id: stone.id, sweeper });
  }

  /** Add heat to all cells whose centre lies inside the oriented brush patch. */
  private heat(world: World, cx: number, cy: number, fx: number, fy: number, amount: number): void {
    const ice = world.ice;
    const hd = SWEEP.brushDepth / 2;
    const hw = SWEEP.brushWidth / 2;
    const ext = hd + hw;
    const cell = ice.cell;
    const i0 = Math.max(0, Math.floor((cx - ext - ice.x0) / cell));
    const i1 = Math.min(ice.nx - 1, Math.floor((cx + ext - ice.x0) / cell));
    const j0 = Math.max(0, Math.floor((cy - ext - ice.y0) / cell));
    const j1 = Math.min(ice.ny - 1, Math.floor((cy + ext - ice.y0) / cell));
    for (let j = j0; j <= j1; j++) {
      const py = ice.y0 + (j + 0.5) * cell - cy;
      for (let i = i0; i <= i1; i++) {
        const px = ice.x0 + (i + 0.5) * cell - cx;
        const along = px * fx + py * fy;
        const across = -px * fy + py * fx;
        if (along >= -hd && along <= hd && across >= -hw && across <= hw) {
          ice.addHeat(j * ice.nx + i, amount);
        }
      }
    }
  }

  /** Rest between throws. */
  recover(seconds: number): void {
    for (const sw of this.state) {
      sw.fatigue = Math.max(0, sw.fatigue - SWEEP.recoveryRate * seconds);
      sw.stoneId = -1;
      sw.down = false;
      sw.effective = 0;
    }
  }

  getState(): SweeperState[] {
    return this.state.map((s) => ({ ...s }));
  }

  setState(states: readonly SweeperState[]): void {
    for (let i = 0; i < this.state.length && i < states.length; i++) Object.assign(this.state[i], states[i]);
  }
}
