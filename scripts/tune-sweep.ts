// Sweeping calibration probe: npx vite-node scripts/tune-sweep.ts
import { Ice } from '../src/physics/ice';
import { World } from '../src/physics/world';
import { deliverStone, releaseY, solveSpeedForDistance } from '../src/physics/delivery';
import { teeY } from '../src/physics/sheet';
import type { SweepCommand } from '../src/physics/sweep';

const base = new Ice({ variation: false, falls: false, wear: false });
const line = { dir: 1 as const, releaseX: 0, aimX: 0, aimY: teeY(1), turn: 'cw' as const };
const f = (n: number) => n.toFixed(3);

function run(speed: number, sweep: (y: number, distLeft: number) => (SweepCommand | null)[] | undefined) {
  const w = new World(base.clone(), 1);
  w.boundaries = false;
  const s = deliverStone(w, 0, 0, { ...line, speed });
  // distance left is estimated from the unswept stop position
  w.runUntilRest(undefined, undefined, () => sweep(s.y, stopY - s.y));
  return { x: s.x, y: s.y, t: w.tick / 240, fat: w.sweepers.state.map((q) => f(q.fatigue)).join('/') };
}
let stopY = 0;
const both = (i: number, side: -1 | 0 | 1 = 0) => [{ stoneId: 0, intensity: i, side }, { stoneId: 0, intensity: i, side }];

for (const dist of [teeY(1) - releaseY(1) - 2.5, teeY(1) - releaseY(1)]) {
  const v = solveSpeedForDistance(base, line, dist);
  const none = run(v, () => undefined);
  stopY = none.y;
  console.log(`--- v=${f(v)} unswept: y=${f(none.y)} x=${f(none.x)} t=${f(none.t)}`);
  const show = (name: string, r: ReturnType<typeof run>) =>
    console.log(name.padEnd(22), 'dy', f(r.y - none.y), 'x', f(r.x), 'curl%', f(r.x / none.x), 't', f(r.t), 'fat', r.fat);
  show('full hard', run(v, () => both(1)));
  show('full half', run(v, () => both(0.5)));
  show('one sweeper hard', run(v, () => [{ stoneId: 0, intensity: 1, side: 0 }, null]));
  show('last 10 m hard', run(v, (_y, left) => (left < 10 ? both(1) : undefined)));
  show('last 5 m hard', run(v, (_y, left) => (left < 5 ? both(1) : undefined)));
  show('first half hard', run(v, (_y, left) => (left > 14 ? both(1) : undefined)));
  show('left side hard', run(v, () => both(1, -1)));
  show('right side hard', run(v, () => both(1, 1)));
}
// same end point: heavier unswept vs lighter swept
const vT = solveSpeedForDistance(base, line, teeY(1) - releaseY(1));
stopY = 0;
const a = run(vT, () => undefined);
let lo = 1.5, hi = vT;
for (let i = 0; i < 25; i++) { const m = (lo + hi) / 2; run(m, () => both(1)).y < a.y ? (lo = m) : (hi = m); }
const b = run(lo, () => both(1));
console.log('same end point: unswept x', f(a.x), 'swept x', f(b.x), 'ratio', f(b.x / a.x), 'v', f(vT), f(lo));
