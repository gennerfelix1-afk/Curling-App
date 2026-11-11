// Calibration probe: npx vite-node scripts/tune.ts
import { Ice } from '../src/physics/ice';
import { World } from '../src/physics/world';
import { deliverStone, releaseY, solveSpeedForDistance, solveSpeedForHogTime } from '../src/physics/delivery';
import { farHogY, nearHogY, teeY } from '../src/physics/sheet';
import { DELIVERY } from '../src/physics/config';

export function probe(ice: Ice, speed: number, omega = DELIVERY.omega, seed = 1, stopAtBack = false) {
  const w = new World(ice, seed);
  w.mutateIce = false;
  w.boundaries = false;
  const s = deliverStone(w, 0, 0, { dir: 1, releaseX: 0, aimX: 0, aimY: teeY(1), speed, turn: 'cw', omega });
  const y0 = s.y;
  let tNear = 0, tFar = 0, xAtTwoThirds = NaN, xBack = NaN;
  const path: [number, number][] = [];
  while (s.moving && w.tick < 240 * 90) {
    w.step();
    if (!tNear && s.y >= nearHogY(1)) tNear = w.tick / 240;
    if (!tFar && s.y >= farHogY(1)) tFar = w.tick / 240;
    if (isNaN(xBack) && s.y >= teeY(1)) xBack = s.x;
    path.push([s.x, s.y]);
  }
  const dist = s.y - y0;
  for (const [x, y] of path) if (y - y0 >= (2 / 3) * dist) { xAtTwoThirds = x; break; }
  return { T: w.tick / 240, h2h: tFar - tNear, x: s.x, y: s.y, rot: Math.abs(s.angle) / (2 * Math.PI), lateShare: 1 - xAtTwoThirds / s.x, xTee: xBack };
}

const f = (n: number) => n.toFixed(3);
for (const speed of ['keen', 'normal', 'heavy'] as const) {
  const ice = new Ice({ speed, variation: false, falls: false, wear: false });
  const base = { dir: 1 as const, releaseX: 0, aimX: 0, aimY: teeY(1), turn: 'cw' as const };
  const v = solveSpeedForDistance(ice, base, teeY(1) - releaseY(1));
  const r = probe(ice, v);
  console.log(speed, 'draw v', f(v), 'T', f(r.T), 'h2h', f(r.h2h), 'curl', f(r.x), 'rot', f(r.rot), 'late', f(r.lateShare));
  if (speed === 'normal') {
    for (const t of [12.5, 11, 9.5, 8.3]) {
      const vt = solveSpeedForHogTime(ice, base, t);
      const q = probe(ice, vt);
      console.log('  hit h2h', t, 'v', f(vt), 'curl@tee', f(q.xTee), 'rot', f(q.rot));
    }
    for (const rots of [0.5, 1.5, 3, 5, 8, 12, 20]) {
      const om = DELIVERY.omega * rots / 3;
      const q = probe(ice, v, om);
      console.log('  omega', f(om), 'curl', f(q.x), 'y', f(q.y - teeY(1)), 'rot', f(q.rot));
    }
    const xs: number[] = [];
    for (let seed = 1; seed <= 10; seed++) xs.push(probe(ice, v, 0.06, seed).x);
    console.log('  low spin xs', xs.map(f).join(' '));
  }
}
