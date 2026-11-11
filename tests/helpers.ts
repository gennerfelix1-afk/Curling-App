import { DELIVERY, STONE } from '../src/physics/config';
import { deliverStone, releaseY, solveSpeedForDistance, type Turn } from '../src/physics/delivery';
import { Ice, type IceOptions } from '../src/physics/ice';
import { farHogY, nearHogY, teeY } from '../src/physics/sheet';
import { createStone, type Stone } from '../src/physics/stone';
import type { SweepCommand } from '../src/physics/sweep';
import { World } from '../src/physics/world';

/** Ideal ice without random variation, falls or wear – for symmetric calibration tests. */
export const cleanIce = (o: Partial<IceOptions> = {}): Ice =>
  new Ice({ variation: false, falls: false, wear: false, endDrift: false, ...o });

export interface Throw {
  speed: number;
  turn?: Turn;
  omega?: number;
  aimX?: number;
  releaseX?: number;
  seed?: number;
  /** Keep stones that leave the sheet (to measure free travel). */
  noBoundaries?: boolean;
  /** Sweeping input per tick (the throw then runs on a private copy of the ice). */
  sweep?: (stone: Stone, world: World) => readonly (SweepCommand | null)[] | undefined;
}

/** Both sweepers at the given intensity in front of the thrown stone (id 100). */
export const bothSweep = (intensity: number, side: -1 | 0 | 1 = 0): SweepCommand[] => [
  { stoneId: 100, intensity, side },
  { stoneId: 100, intensity, side },
];

export interface ThrowResult {
  stone: Stone;
  world: World;
  /** Release → rest [s]. */
  total: number;
  /** Hog-to-hog time [s]. */
  h2h: number;
  /** Lateral position when crossing the far tee line (NaN if not reached). */
  xAtTee: number;
  /** Share of the final lateral deviation gained in the last third of the travelled distance. */
  lateShare: number;
  rotations: number;
  /** Distance travelled along the sheet from the release point. */
  distance: number;
}

/** Throw a single stone down the centre line on the given ice and record key figures. */
export function throwStone(ice: Ice, t: Throw, setup?: (w: World) => void): ThrowResult {
  const world = new World(t.sweep ? ice.clone() : ice, t.seed ?? 1);
  world.mutateIce = !!t.sweep;
  if (t.noBoundaries) world.boundaries = false;
  if (setup) setup(world);
  const stone = deliverStone(world, 100, 0, {
    dir: 1,
    releaseX: t.releaseX ?? 0,
    aimX: t.aimX ?? 0,
    aimY: teeY(1),
    speed: t.speed,
    turn: t.turn ?? 'cw',
    omega: t.omega,
  });
  const y0 = stone.y;
  let tNear = -1;
  let tFar = -1;
  let xAtTee = NaN;
  const xs: number[] = [];
  const ys: number[] = [];
  while (!world.isAtRest() && world.tick < 240 * 120) {
    world.step(t.sweep ? t.sweep(stone, world) : undefined);
    if (tNear < 0 && stone.y >= nearHogY(1)) tNear = world.tick / 240;
    if (tFar < 0 && stone.y >= farHogY(1)) tFar = world.tick / 240;
    if (Number.isNaN(xAtTee) && stone.y >= teeY(1)) xAtTee = stone.x;
    xs.push(stone.x);
    ys.push(stone.y);
  }
  const distance = stone.y - y0;
  let lateShare = NaN;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] - y0 >= (2 / 3) * distance) {
      lateShare = 1 - (xs[i] - (t.releaseX ?? 0)) / (stone.x - (t.releaseX ?? 0));
      break;
    }
  }
  return {
    stone,
    world,
    total: world.tick / 240,
    h2h: tFar - tNear,
    xAtTee,
    lateShare,
    rotations: Math.abs(stone.angle) / (2 * Math.PI),
    distance,
  };
}

/** Release speed of an unswept centre-line draw that stops on the tee line. */
export function teeDrawSpeed(ice: Ice, turn: Turn = 'cw', omega: number = DELIVERY.omega): number {
  return solveSpeedForDistance(ice, { dir: 1, releaseX: 0, aimX: 0, aimY: teeY(1), turn, omega }, teeY(1) - releaseY(1));
}

/** Place a stationary stone. */
export function place(world: World, id: number, x: number, y: number, team = 1): Stone {
  return world.addStone(createStone(id, team, x, y));
}

export const R = STONE.radius;
