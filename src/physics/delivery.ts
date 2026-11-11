import { DELIVERY } from './config';
import { Ice } from './ice';
import { nearHogY, type Dir } from './sheet';
import { createStone, type Stone } from './stone';
import { World } from './world';

export type Turn = 'cw' | 'ccw';

export interface DeliveryParams {
  /** Direction of play. */
  dir: Dir;
  /** Lateral position of the stone at release [m]. */
  releaseX: number;
  /** Target point the stone is aimed at (the skip's broom). */
  aimX: number;
  aimY: number;
  /** Speed at release [m/s]. */
  speed: number;
  /** Handle: clockwise curls right (seen from the thrower), counter-clockwise curls left. */
  turn: Turn;
  /** Rotation rate at release [rad/s], magnitude. */
  omega?: number;
  /** Release point along the sheet (default: DELIVERY.releaseBeforeHog before the near hog line). */
  releaseYPos?: number;
}

/** y coordinate of the release point. */
export const releaseY = (dir: Dir): number => nearHogY(dir) - dir * DELIVERY.releaseBeforeHog;

/** Put a stone into its state at the moment of release. */
export function deliverStone(world: World, id: number, team: number, p: DeliveryParams): Stone {
  const y0 = p.releaseYPos ?? releaseY(p.dir);
  const dx = p.aimX - p.releaseX;
  const dy = p.aimY - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  const s = createStone(id, team, p.releaseX, y0);
  s.vx = (p.speed * dx) / d;
  s.vy = (p.speed * dy) / d;
  // Seen from above with play towards +y, clockwise = negative omega → curls to the thrower's right.
  s.omega = (p.turn === 'cw' ? -1 : 1) * (p.omega ?? DELIVERY.omega);
  s.moving = true;
  world.dir = p.dir;
  return world.addStone(s);
}

/**
 * Find the release speed for which an unswept stone thrown down the given line travels
 * `distance` metres along the sheet from the release point (bisection on a scratch world;
 * the ice is not modified).
 */
export function solveSpeedForDistance(ice: Ice, p: Omit<DeliveryParams, 'speed'>, distance: number): number {
  let lo = 0.5;
  let hi = 6;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const w = new World(ice, 1);
    w.mutateIce = false;
    w.boundaries = false;
    const s = deliverStone(w, 0, 0, { ...p, speed: mid });
    const y0 = s.y;
    w.runUntilRest();
    if ((s.y - y0) * p.dir < distance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Find the release speed that gives the requested hog-to-hog time [s] (for hit weights). */
export function solveSpeedForHogTime(ice: Ice, p: Omit<DeliveryParams, 'speed'>, seconds: number): number {
  let lo = 1;
  let hi = 7;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (hogToHogTime(ice, { ...p, speed: mid }) > seconds) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Hog-to-hog time [s] of an unobstructed throw (Infinity if the far hog line is not reached). */
export function hogToHogTime(ice: Ice, p: DeliveryParams): number {
  const w = new World(ice, 1);
  w.mutateIce = false;
  w.boundaries = false;
  const s = deliverStone(w, 0, 0, p);
  const near = nearHogY(p.dir) * p.dir;
  const far = -near;
  let t0 = -1;
  for (let k = 0; k < 240 * 60 && s.moving; k++) {
    w.step();
    const y = s.y * p.dir;
    if (t0 < 0 && y >= near) t0 = w.tick;
    if (y >= far) return (w.tick - t0) / 240;
  }
  return Infinity;
}
