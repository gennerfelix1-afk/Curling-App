import { Ice } from '../../src/physics/ice';
import { deliverStone } from '../../src/physics/delivery';
import { dcos, dexp, dsin } from '../../src/physics/dmath';
import { Rng } from '../../src/physics/rng';
import { teeY } from '../../src/physics/sheet';
import { World } from '../../src/physics/world';
import { place } from '../helpers';

function scenario(seed: number): string {
  const ice = new Ice({ seed });
  const w = new World(ice, seed);
  place(w, 1, 0.1, teeY(1) - 0.4);
  place(w, 2, -0.35, teeY(1) + 0.3);
  place(w, 3, 0.5, teeY(1) - 2.5);
  place(w, 4, 0.05, teeY(1) - 4);
  deliverStone(w, 10, 0, { dir: 1, releaseX: 0.2, aimX: -0.25, aimY: teeY(1), speed: 2.75, turn: 'cw' });
  w.runUntilRest();
  deliverStone(w, 11, 1, { dir: 1, releaseX: -0.1, aimX: 0.9, aimY: teeY(1), speed: 2.07, turn: 'ccw', omega: 0.04 });
  w.runUntilRest();
  return JSON.stringify(w.stones.map((s) => [s.id, s.x, s.y, s.angle, s.inPlay])) + w.tick;
}

describe('determinism', () => {
  it('K17: same seed and input give bit-identical results', () => {
    expect(scenario(7)).toBe(scenario(7));
  });

  it('different seeds give different ice and results', () => {
    expect(scenario(7)).not.toBe(scenario(8));
  });

  it('snapshot / restore reproduces the continuation exactly', () => {
    const ice = new Ice({ seed: 3, wear: false });
    const w = new World(ice, 3);
    place(w, 1, 0, teeY(1));
    deliverStone(w, 10, 0, { dir: 1, releaseX: 0, aimX: 0.1, aimY: teeY(1), speed: 2.6, turn: 'cw', omega: 0.05 });
    for (let i = 0; i < 500; i++) w.step();
    const snap = w.snapshot();
    w.runUntilRest();
    const first = JSON.stringify(w.stones);
    w.restore(snap);
    w.runUntilRest();
    expect(JSON.stringify(w.stones)).toBe(first);
  });

  it('rng is reproducible and well distributed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < 20000; i++) {
      const x = a.gauss();
      expect(x).toBe(b.gauss());
      sum += x;
      sq += x * x;
    }
    expect(Math.abs(sum / 20000)).toBeLessThan(0.03);
    expect(sq / 20000).toBeCloseTo(1, 1);
  });

  it('deterministic math matches the built-ins closely', () => {
    for (const x of [-7, -3.2, -1, -0.1, 0, 0.3, 1.5, 3.1, 6.2, 12]) {
      expect(dsin(x)).toBeCloseTo(Math.sin(x), 12);
      expect(dcos(x)).toBeCloseTo(Math.cos(x), 12);
    }
    for (const x of [-5, -1, -0.01, 0, 0.2, 1, 3]) expect(dexp(x) / Math.exp(x)).toBeCloseTo(1, 12);
  });
});
