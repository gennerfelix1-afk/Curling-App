import { WEIGHTS } from '../physics/config';
import { deliverStone, releaseY } from '../physics/delivery';
import type { Ice } from '../physics/ice';
import { farHogY, nearHogY, teeY, type Dir } from '../physics/sheet';
import { World } from '../physics/world';

export interface Weight {
  id: string;
  label: string;
  kind: 'draw' | 'hit';
  /** Release speed [m/s] on the current ice. */
  speed: number;
}

interface Sample {
  speed: number;
  /** Unswept travel along the sheet from the release point [m]. */
  distance: number;
  /** Hog-to-hog time [s]. */
  h2h: number;
}

function sample(ice: Ice, dir: Dir, speed: number): Sample {
  const w = new World(ice, 1);
  w.mutateIce = false;
  w.boundaries = false;
  const s = deliverStone(w, 0, 0, { dir, releaseX: 0, aimX: 0, aimY: teeY(dir), speed, turn: 'cw' });
  const y0 = s.y * dir;
  const near = nearHogY(dir) * dir;
  const far = farHogY(dir) * dir;
  let t0 = -1;
  let t1 = -1;
  while (s.moving && w.tick < 240 * 90) {
    w.step();
    if (t0 < 0 && s.y * dir >= near) t0 = w.tick;
    if (t1 < 0 && s.y * dir >= far) t1 = w.tick;
  }
  return { speed, distance: s.y * dir - y0, h2h: t1 < 0 ? Infinity : (t1 - t0) / 240 };
}

/** Linear interpolation of the speed at which `f(sample)` crosses `target`. */
function invert(samples: Sample[], f: (s: Sample) => number, target: number): number {
  for (let i = 1; i < samples.length; i++) {
    const a = f(samples[i - 1]);
    const b = f(samples[i]);
    if (Number.isFinite(a) && (a - target) * (b - target) <= 0 && a !== b) {
      const t = (target - a) / (b - a);
      return samples[i - 1].speed + t * (samples[i].speed - samples[i - 1].speed);
    }
  }
  return f(samples[0]) > target === f(samples[0]) < f(samples[samples.length - 1])
    ? samples[0].speed
    : samples[samples.length - 1].speed;
}

/**
 * The skip's "weight book" for the current ice: release speeds for all named weights, measured
 * by throwing unswept test stones down the centre line (on a read-only view of the ice).
 */
export function buildWeightTable(ice: Ice, dir: Dir): Weight[] {
  const samples: Sample[] = [];
  for (let v = 1.5; v <= 4.2001; v += 0.1) samples.push(sample(ice, dir, v));
  const toTee = (teeY(dir) - releaseY(dir)) * dir;
  return WEIGHTS.map((w) => ({
    id: w.id,
    label: w.label,
    kind: w.kind,
    speed:
      w.kind === 'draw'
        ? invert(samples, (s) => s.distance, toTee + w.value)
        : invert(samples, (s) => s.h2h, w.value),
  }));
}
