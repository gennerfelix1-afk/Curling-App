import { DELIVERY, SHEET, STONE } from '../physics/config';
import { deliverStone, releaseY } from '../physics/delivery';
import type { Ice } from '../physics/ice';
import { farHogY, hackY, nearHogY, teeY, type Dir } from '../physics/sheet';
import { World } from '../physics/world';

interface Sample {
  speed: number;
  /** Unswept travel along the sheet from the release point [m]. */
  distance: number;
  /** Hog-to-hog time [s]. */
  h2h: number;
  /** Sideways drift of a clockwise stone (towards the thrower's right), sampled every STEP metres. */
  drift: Float32Array;
}

const STEP = 0.25;

/**
 * The "book" on the current ice for one direction of play: test stones thrown down the centre
 * line (on a read-only view of the ice) tell how far each release speed travels and how much it
 * curls on the way. Used for the weight table and by the AI to place the broom.
 */
export class IceBook {
  readonly samples: Sample[] = [];
  /** Distance from the release point to the tee line [m]. */
  readonly toTee: number;
  /** Distance from the hack to the release point [m]. */
  readonly hackToRelease: number;

  constructor(ice: Ice, readonly dir: Dir) {
    this.toTee = (teeY(dir) - releaseY(dir)) * dir;
    this.hackToRelease = (releaseY(dir) - hackY(dir)) * dir;
    for (let v = 1.5; v <= 4.2001; v += 0.15) this.samples.push(this.sample(ice, v));
  }

  private sample(ice: Ice, speed: number): Sample {
    const dir = this.dir;
    const w = new World(ice, 1);
    w.mutateIce = false;
    w.boundaries = false;
    const s = deliverStone(w, 0, 0, { dir, releaseX: 0, aimX: 0, aimY: teeY(dir), speed, turn: 'cw' });
    const y0 = s.y * dir;
    const near = nearHogY(dir) * dir;
    const far = farHogY(dir) * dir;
    const drift: number[] = [0];
    let t0 = -1;
    let t1 = -1;
    while (s.moving && w.tick < 240 * 90) {
      w.step();
      const along = s.y * dir;
      if (t0 < 0 && along >= near) t0 = w.tick;
      if (t1 < 0 && along >= far) t1 = w.tick;
      while (along - y0 >= drift.length * STEP) drift.push(s.x * dir);
    }
    drift.push(s.x * dir);
    return { speed, distance: s.y * dir - y0, h2h: t1 < 0 ? Infinity : (t1 - t0) / 240, drift: Float32Array.from(drift) };
  }

  /** Linear interpolation of the speed at which `f(sample)` crosses `target`. */
  private invert(f: (s: Sample) => number, target: number): number {
    const sm = this.samples;
    for (let i = 1; i < sm.length; i++) {
      const a = f(sm[i - 1]);
      const b = f(sm[i]);
      if (Number.isFinite(a) && (a - target) * (b - target) <= 0 && a !== b) {
        return sm[i - 1].speed + ((target - a) / (b - a)) * (sm[i].speed - sm[i - 1].speed);
      }
    }
    const rising = f(sm[sm.length - 1]) > f(sm[sm.length - 2]);
    return (f(sm[0]) > target) === rising ? sm[0].speed : sm[sm.length - 1].speed;
  }

  /** Release speed for an unswept stone to stop `distance` metres from the release point. */
  speedForDistance(distance: number): number {
    return this.invert((s) => s.distance, distance);
  }

  /** Unswept travel from the release point for a release speed [m]. */
  speedToDistance(speed: number): number {
    const sm = this.samples;
    let i = 1;
    while (i < sm.length - 1 && sm[i].speed < speed) i++;
    const a = sm[i - 1];
    const b = sm[i];
    return a.distance + ((speed - a.speed) / (b.speed - a.speed)) * (b.distance - a.distance);
  }

  /** Release speed for a given hog-to-hog time [s]. */
  speedForHogTime(seconds: number): number {
    return this.invert((s) => s.h2h, seconds);
  }

  private driftOf(s: Sample, distance: number): number {
    const f = distance / STEP;
    const last = s.drift.length - 1;
    if (f >= last - 1) return s.drift[last];
    if (f <= 0) return 0;
    const i = Math.floor(f);
    return s.drift[i] + (s.drift[i + 1] - s.drift[i]) * (f - i);
  }

  /** Sideways drift of a clockwise stone after `distance` metres (counter-clockwise: negative). */
  driftAt(speed: number, distance: number): number {
    const sm = this.samples;
    let i = 1;
    while (i < sm.length - 1 && sm[i].speed < speed) i++;
    const a = sm[i - 1];
    const b = sm[i];
    const t = Math.max(0, Math.min(1, (speed - a.speed) / (b.speed - a.speed)));
    return this.driftOf(a, distance) * (1 - t) + this.driftOf(b, distance) * t;
  }

  /**
   * Where to hold the broom (on the tee line, in the thrower's frame: + = right) so that a stone
   * of the given speed and turn passes through the point (x, along) – `along` measured from the
   * centre of the sheet in the direction of play.
   */
  broomFor(speed: number, cw: boolean, x: number, along: number): number {
    const tee = SHEET.teeToTee / 2;
    const hack = -(tee + SHEET.teeToHack);
    const release = hack + this.hackToRelease;
    const drift = this.driftAt(speed, along - release) * (cw ? 1 : -1);
    return ((x - drift) * (tee - hack)) / (along - hack);
  }
}

export const STONE_R = STONE.radius;
export const DEFAULT_OMEGA = DELIVERY.omega;
