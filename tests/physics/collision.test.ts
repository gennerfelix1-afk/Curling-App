import { COLLISION } from '../../src/physics/config';
import { teeY } from '../../src/physics/sheet';
import { World } from '../../src/physics/world';
import { cleanIce, place, R, throwStone } from '../helpers';

const speedOf = (s: { vx: number; vy: number }): number => Math.sqrt(s.vx * s.vx + s.vy * s.vy);

/** Run a throw until the first collision event and return the velocities right after it. */
function firstImpact(offsetX: number, speed = 2.8, omega = 0.85) {
  const ice = cleanIce({ curl: 'straight' });
  const w = new World(ice, 1);
  w.mutateIce = false;
  const target = place(w, 1, offsetX, 0);
  const shooter = place(w, 2, 0, -1, 0);
  shooter.vy = speed;
  shooter.omega = -omega;
  shooter.moving = true;
  let before = { vx: 0, vy: 0 };
  while (w.events.length === 0 && w.tick < 2400) {
    before = { vx: shooter.vx, vy: shooter.vy };
    w.step();
  }
  return { w, target, shooter, before, event: w.events[0] };
}

describe('collisions', () => {
  it('K15: nose hit – shooter nearly stops, target takes the speed', () => {
    const { shooter, target, before } = firstImpact(0);
    const v0 = speedOf(before);
    expect(speedOf(shooter) / v0).toBeLessThan(0.1);
    expect(speedOf(target) / v0).toBeGreaterThan(0.85);
    expect(speedOf(target) / v0).toBeCloseTo((1 + COLLISION.restitution) / 2, 1);
    expect(Math.abs(target.vx)).toBeLessThan(0.05 * v0); // tiny throw from the shooter's spin only
  });

  it('conserves momentum and never gains energy', () => {
    for (const off of [0, 0.05, 0.12, 0.2, 0.27]) {
      const { shooter, target, before } = firstImpact(off);
      expect(shooter.vx + target.vx).toBeCloseTo(before.vx, 2);
      expect(shooter.vy + target.vy).toBeCloseTo(before.vy, 2);
      const e0 = speedOf(before) ** 2;
      const e1 = speedOf(shooter) ** 2 + speedOf(target) ** 2;
      expect(e1).toBeLessThan(e0);
      expect(e1).toBeGreaterThan(0.75 * e0);
    }
  });

  it('K16: half hit – target leaves along the line of centres (minus a small throw)', () => {
    const off = R; // centres offset by one radius → contact normal 30° off the line of travel
    const { shooter, target } = firstImpact(off);
    const targetAngle = (Math.atan2(target.vx, target.vy) * 180) / Math.PI;
    const shooterAngle = (Math.atan2(shooter.vx, shooter.vy) * 180) / Math.PI;
    expect(targetAngle).toBeGreaterThan(24);
    expect(targetAngle).toBeLessThan(30.5);
    const throwAngle = 30 - targetAngle;
    expect(throwAngle).toBeGreaterThan(0.3);
    expect(throwAngle).toBeLessThan(5);
    // shooter deflects to the other side; with e < 1 the angle between the paths is below 90°
    expect(shooterAngle).toBeLessThan(-35);
    expect(targetAngle - shooterAngle).toBeGreaterThan(70);
    expect(targetAngle - shooterAngle).toBeLessThan(90);
  });

  it('thin hit (wick): shooter keeps most of its speed and barely changes direction', () => {
    const { shooter, target, before } = firstImpact(2 * R - 0.01);
    expect(speedOf(shooter) / speedOf(before)).toBeGreaterThan(0.9);
    expect(speedOf(target) / speedOf(before)).toBeLessThan(0.35);
  });

  it('transfers rotation between the stones', () => {
    const { target, shooter } = firstImpact(R);
    expect(target.omega).not.toBe(0);
    expect(Math.abs(shooter.omega)).toBeGreaterThan(0);
  });

  it('chain: raise through a frozen pair moves the last stone', () => {
    const ice = cleanIce({ curl: 'straight' });
    const r = throwStone(ice, { speed: 2.6 }, (w) => {
      place(w, 1, 0, teeY(1) - 3);
      place(w, 2, 0, teeY(1) - 3 + 2 * R); // frozen behind stone 1
      place(w, 3, 0, teeY(1) - 1);
    });
    const [s1, s2, s3] = [1, 2, 3].map((id) => r.world.getStone(id)!);
    // momentum travels through the chain: stone 2 is driven into stone 3
    expect(s1.y).toBeLessThan(teeY(1) - 2);
    expect(s3.y).toBeGreaterThan(teeY(1) - 1 + 0.5);
    expect(s2.y).toBeGreaterThan(teeY(1) - 2.5);
    const collisions = r.world.events.filter((e) => e.type === 'collision');
    expect(collisions.length).toBeGreaterThanOrEqual(3);
    // no overlaps remain
    const all = r.world.stones.filter((s) => s.inPlay);
    for (const a of all) for (const b of all) {
      if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * R - 1e-3);
    }
  });

  it('double takeout: two stones side by side are both removed by a hit in the gap', () => {
    const ice = cleanIce({ curl: 'straight' });
    const gap = 0.2; // narrower than a stone → both are hit
    const r = throwStone(ice, { speed: 3.2 }, (w) => {
      place(w, 1, -(R + gap / 2), teeY(1));
      place(w, 2, R + gap / 2, teeY(1));
    });
    const s1 = r.world.getStone(1)!;
    const s2 = r.world.getStone(2)!;
    expect(s1.inPlay && Math.hypot(s1.x, s1.y - teeY(1)) < 1.83).toBe(false);
    expect(s2.inPlay && Math.hypot(s2.x, s2.y - teeY(1)) < 1.83).toBe(false);
    expect(s1.x).toBeLessThan(-0.5);
    expect(s2.x).toBeGreaterThan(0.5);
  });

  it('peel weight does not tunnel through a stone', () => {
    const ice = cleanIce({ curl: 'straight' });
    const r = throwStone(ice, { speed: 4.5 }, (w) => place(w, 1, 0, 5));
    expect(r.world.events.some((e) => e.type === 'collision')).toBe(true);
    expect(r.world.getStone(1)!.y).toBeGreaterThan(6);
  });

  it('stones touching the side line or fully behind the back line are out of play', () => {
    const ice = cleanIce();
    const through = throwStone(ice, { speed: 3 });
    expect(through.stone.inPlay).toBe(false);
    expect(through.world.events.some((e) => e.type === 'out' && e.reason === 'back')).toBe(true);
    const wide = throwStone(ice, { speed: 2.2, aimX: 4 });
    expect(wide.stone.inPlay).toBe(false);
    expect(wide.world.events.some((e) => e.type === 'out' && e.reason === 'side')).toBe(true);
  });
});
