import { FRICTION } from '../../src/physics/config';
import { Ice } from '../../src/physics/ice';
import { deliverStone } from '../../src/physics/delivery';
import { Rng } from '../../src/physics/rng';
import { teeY } from '../../src/physics/sheet';
import { World } from '../../src/physics/world';
import { cleanIce, teeDrawSpeed, throwStone } from '../helpers';

describe('ice field', () => {
  it('has a resolution of 2–5 cm and factors near 1', () => {
    const ice = new Ice({ seed: 5 });
    expect(ice.cell).toBeGreaterThanOrEqual(0.02);
    expect(ice.cell).toBeLessThanOrEqual(0.05);
    let min = Infinity;
    let max = -Infinity;
    for (const m of ice.mu) {
      min = Math.min(min, m);
      max = Math.max(max, m);
    }
    expect(min).toBeGreaterThan(0.95);
    expect(max).toBeLessThan(1.05);
    expect(max - min).toBeGreaterThan(0.01);
  });

  it('local variation and falls move a draw by centimetres, not metres', () => {
    const clean = cleanIce();
    const v = teeDrawSpeed(clean);
    const ref = throwStone(clean, { speed: v }).stone;
    let maxDev = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = throwStone(new Ice({ seed, wear: false }), { speed: v }).stone;
      const dev = Math.hypot(s.x - ref.x, s.y - ref.y);
      maxDev = Math.max(maxDev, dev);
      expect(dev).toBeLessThan(0.8);
    }
    expect(maxDev).toBeGreaterThan(0.02);
  });

  it('falls alone push a stone sideways only slightly', () => {
    const v = teeDrawSpeed(cleanIce());
    const ref = throwStone(cleanIce(), { speed: v }).stone;
    for (let seed = 1; seed <= 4; seed++) {
      const s = throwStone(new Ice({ seed, variation: false, wear: false }), { speed: v }).stone;
      expect(Math.abs(s.x - ref.x)).toBeLessThan(0.25);
    }
  });

  it('pebble wear makes a travelled path faster and straighter', () => {
    const ice = new Ice({ seed: 2, variation: false, falls: false });
    const v = teeDrawSpeed(ice);
    const run = () => {
      const w = new World(ice, 1);
      const s = deliverStone(w, 1, 0, { dir: 1, releaseX: 0, aimX: 0, aimY: teeY(1), speed: v, turn: 'cw' });
      w.runUntilRest();
      return s;
    };
    const first = run();
    let last = first;
    for (let i = 0; i < 25; i++) last = run();
    expect(last.y).toBeGreaterThan(first.y + 0.05);
    expect(last.y).toBeLessThan(first.y + 1.5);
    expect(last.x).toBeLessThan(first.x);
    let worn = 0;
    for (const x of ice.wear) if (x > 0) worn++;
    expect(worn).toBeGreaterThan(1000);
  });

  it('what-if simulations do not modify the ice', () => {
    const ice = new Ice({ seed: 2 });
    const before = ice.mu.slice();
    throwStone(ice, { speed: 2.1 });
    expect(ice.mu).toEqual(before);
  });

  it('clone is independent', () => {
    const ice = new Ice({ seed: 2 });
    const copy = ice.clone();
    copy.addWear(0, 0, 0.5);
    expect(ice.sampleMu(0, 0)).toBeGreaterThan(copy.sampleMu(0, 0));
  });

  it('drifts slightly between ends within bounds', () => {
    const ice = new Ice({ seed: 9 });
    const rng = new Rng(9);
    const base = FRICTION.mu0.normal;
    let changed = false;
    for (let end = 0; end < 30; end++) {
      ice.nextEnd(rng);
      if (ice.mu0 !== base) changed = true;
      expect(Math.abs(ice.mu0 / base - 1)).toBeLessThanOrEqual(0.0601);
    }
    expect(changed).toBe(true);
  });
});
