import type { Ice } from '../physics/ice';
import type { Dir } from '../physics/sheet';
import type { Stone } from '../physics/stone';
import { World } from '../physics/world';
import type { ShotTarget } from './shots';

export type SweepCall = 'hard' | 'line' | 'clean' | 'off';

const INTERVAL = 96; // ticks between two looks (0.4 s)

/**
 * The skip watching a running stone: predicts where it ends up if nobody sweeps from now on and
 * calls the sweeping accordingly. Used by AI sweepers and shown / spoken as the skip's call.
 */
export class SweepAdvisor {
  call: SweepCall = 'off';
  private next = 0;

  constructor(private target: ShotTarget) {}

  /** Look again every few ticks; returns the current call. */
  update(stones: readonly Stone[], stone: Stone, ice: Ice, dir: Dir, tick: number): SweepCall {
    if (!stone.inPlay || !stone.moving || stone.hit) {
      this.call = 'off';
      return this.call;
    }
    if (tick < this.next) return this.call;
    this.next = tick + INTERVAL;
    const t = this.target;
    if (t.stopY === undefined && t.hitId === undefined) {
      this.call = 'off';
      return this.call;
    }

    // prediction without any further sweeping
    const w = new World(ice, 1);
    w.mutateIce = false;
    w.dir = dir;
    for (const q of stones) if (q.inPlay) w.addStone({ ...q });
    const me = w.getStone(stone.id)!;
    const curl = stone.omega < 0 ? dir : -dir; // sheet-x direction in which the stone curls
    const targetStone = t.hitId !== undefined ? w.getStone(t.hitId) : undefined;
    let xAtTarget = NaN;
    while (me.moving && me.inPlay && !me.hit && w.tick < 240 * 60) {
      w.step();
      if (targetStone && Number.isNaN(xAtTarget) && (me.y - targetStone.y) * dir >= 0) xAtTarget = me.x;
    }

    if (t.stopY !== undefined) {
      if (me.hit) {
        // something is in the way: nothing to gain by carrying the stone further
        this.call = 'off';
        return this.call;
      }
      const short = me.inPlay ? (t.stopY - me.y) * dir : -9;
      const overCurl = t.stopX !== undefined ? (me.x - t.stopX) * curl : 0;
      if (short > 0.6) this.call = 'hard';
      else if (short > 0.12) this.call = overCurl > 0.25 ? 'hard' : 'clean';
      else if (overCurl > 0.12 && short > -0.35) this.call = 'line';
      else this.call = 'off';
      return this.call;
    }

    // hit: sweep only if the stone would curl past its target
    if (me.hit && w.events.some((e) => e.type === 'collision' && (e.a === t.hitId || e.b === t.hitId))) {
      this.call = 'off';
    } else if (!Number.isNaN(xAtTarget) && targetStone && (xAtTarget - targetStone.x) * curl > 0) {
      this.call = 'line';
    } else if (Number.isNaN(xAtTarget)) {
      this.call = 'hard'; // would not even get there
    } else {
      this.call = 'off';
    }
    return this.call;
  }
}

/** Sweeping intensity the sweepers put in for a call (both sweepers). */
export const CALL_INTENSITY: Record<SweepCall, number> = { hard: 1, line: 0.85, clean: 0.45, off: 0 };
/** The call as the skip shouts it. */
export const CALL_TEXT: Record<SweepCall, string> = { hard: 'HARD!', line: 'Line!', clean: 'Clean', off: 'Off!' };
