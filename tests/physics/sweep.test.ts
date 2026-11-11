import { SWEEP } from '../../src/physics/config';
import { teeY } from '../../src/physics/sheet';
import { quantizeIntensity } from '../../src/physics/sweep';
import { World } from '../../src/physics/world';
import { bothSweep, cleanIce, place, R, teeDrawSpeed, throwStone } from '../helpers';

/** Calibration targets K10–K14 from docs/PHYSICS.md §9. */
describe('sweeping', () => {
  const ice = cleanIce();
  const v = teeDrawSpeed(ice);
  const free = { speed: v, noBoundaries: true };
  const unswept = throwStone(ice, free);
  const full = throwStone(ice, { ...free, sweep: () => bothSweep(1) });

  it('K10: hard sweeping all the way carries the stone 2–3 m further', () => {
    const gain = full.stone.y - unswept.stone.y;
    expect(gain).toBeGreaterThan(2);
    expect(gain).toBeLessThan(3);
  });

  it('K11: sweeping only the last 5 m gains much less (0.3–1.0 m)', () => {
    const late = throwStone(ice, { ...free, sweep: (s) => (unswept.stone.y - s.y < 5 ? bothSweep(1) : undefined) });
    const gain = late.stone.y - unswept.stone.y;
    expect(gain).toBeGreaterThan(0.3);
    expect(gain).toBeLessThan(1.0);
  });

  it('K12: the same draw curls clearly less when swept ("holds the line")', () => {
    expect(full.stone.x).toBeLessThan(0.8 * unswept.stone.x);
    expect(full.stone.x).toBeGreaterThan(0.4 * unswept.stone.x);
    expect(full.stone.x).toBeGreaterThan(0); // still curls the same way
  });

  it('K12: at every point of the path the swept stone is straighter', () => {
    const xAt = (sweep: boolean): number => {
      let x = NaN;
      throwStone(ice, {
        ...free,
        sweep: (s) => {
          if (Number.isNaN(x) && s.y >= teeY(1) - 3) x = s.x;
          return sweep ? bothSweep(1) : undefined;
        },
      });
      return x;
    };
    expect(xAt(true)).toBeLessThan(0.85 * xAt(false));
  });

  it('effect scales continuously with intensity and number of sweepers', () => {
    const gain = (cmds: ReturnType<typeof bothSweep> | [ReturnType<typeof bothSweep>[0], null]): number =>
      throwStone(ice, { ...free, sweep: () => cmds }).stone.y - unswept.stone.y;
    const g25 = gain(bothSweep(0.25));
    const g50 = gain(bothSweep(0.5));
    const g75 = gain(bothSweep(0.75));
    const g100 = full.stone.y - unswept.stone.y;
    const one = gain([{ stoneId: 100, intensity: 1, side: 0 }, null]);
    expect(g25).toBeGreaterThan(0.3);
    expect(g50).toBeGreaterThan(g25 + 0.2);
    expect(g75).toBeGreaterThan(g50 + 0.2);
    expect(g100).toBeGreaterThan(g75 + 0.2);
    expect(one).toBeLessThan(g100 - 0.3);
    expect(one).toBeGreaterThan(0.4 * g100);
  });

  it('K13: sweeping on one side has a measurable but small directional effect', () => {
    const left = throwStone(ice, { ...free, sweep: () => bothSweep(1, -1) }).stone;
    const right = throwStone(ice, { ...free, sweep: () => bothSweep(1, 1) }).stone;
    // clockwise stone curls right: sweeping the right (slow) side holds it straighter
    expect(left.x - right.x).toBeGreaterThan(0.01);
    expect(left.x - right.x).toBeLessThan(0.1);
    // one-sided sweeping still gains distance, but less than sweeping the full path
    expect(left.y - unswept.stone.y).toBeGreaterThan(1);
    expect(left.y).toBeLessThan(full.stone.y);
  });

  it('K14: sweepers tire – long hard sweeping loses effect, rest recovers', () => {
    const w = full.world;
    const f = w.sweepers.state[0].fatigue;
    expect(f).toBeGreaterThan(0.2);
    expect(f).toBeLessThanOrEqual(SWEEP.fatigueMax);
    // effectiveness after 20 s of hard sweeping ≤ 80 % of fresh
    let minEff = 1;
    throwStone(ice, {
      ...free,
      sweep: (_s, world) => {
        if (world.tick === 240 * 20) minEff = world.sweepers.state[0].effective;
        return bothSweep(1);
      },
    });
    expect(minEff).toBeLessThanOrEqual(0.8);
    expect(minEff).toBeGreaterThan(0.6);
    w.sweepers.recover(60);
    expect(w.sweepers.state[0].fatigue).toBe(0);
    // light sweeping does not tire
    const light = throwStone(ice, { ...free, sweep: () => bothSweep(0.4) });
    expect(light.world.sweepers.state[0].fatigue).toBe(0);
  });

  it('tired sweepers carry the next stone less far', () => {
    const tired = throwStone(ice, { ...free, sweep: () => bothSweep(1) }, (w) => {
      for (const s of w.sweepers.state) s.fatigue = SWEEP.fatigueMax;
    });
    expect(tired.stone.y).toBeLessThan(full.stone.y - 0.15);
  });

  it('heat is only written in front of the stone and the ice cools down again', () => {
    const w = new World(cleanIce(), 1);
    const s = place(w, 100, 0, 0, 0);
    s.vy = 1.5;
    s.moving = true;
    w.step(bothSweep(1));
    const iceField = w.ice;
    let hot = 0;
    for (let k = 0; k < iceField.heat.length; k++) {
      if (iceField.heat[k] > 0) {
        hot++;
        const cy = iceField.y0 + (Math.floor(k / iceField.nx) + 0.5) * iceField.cell;
        expect(cy).toBeGreaterThan(s.y + R); // strictly ahead of the leading edge
      }
    }
    expect(hot).toBeGreaterThan(8);
    expect(w.sweepers.state[0].down).toBe(true);
    for (let i = 0; i < 240 * 12; i++) w.step();
    expect(w.ice.hotCount).toBe(0);
    expect(w.ice.heat.every((h) => h === 0)).toBe(true);
    expect(w.ice.sampleMu(0, 0.3)).toBeCloseTo(1, 6);
  });

  it('sweeping in front of a resting stone or without a moving stone does nothing', () => {
    const w = new World(cleanIce(), 1);
    place(w, 100, 0, 0, 0);
    w.step(bothSweep(1));
    expect(w.ice.hotCount).toBe(0);
  });

  it('the brush lifts before a resting stone; a moving stone running into it is "touched"', () => {
    // resting stone right in the path: no touch, sweeping pauses near it
    const ice2 = cleanIce({ curl: 'straight' });
    const r = throwStone(ice2, { speed: 2.6, sweep: (s) => (s.hit ? undefined : bothSweep(1)) }, (w) =>
      place(w, 1, 0, 5),
    );
    expect(r.world.events.some((e) => e.type === 'collision')).toBe(true);
    expect(r.world.events.some((e) => e.type === 'touched')).toBe(false);

    // a second moving stone crosses just in front of the swept stone → touched
    const w = new World(cleanIce(), 1);
    const a = place(w, 100, 0, 0, 0);
    a.vy = 1.5;
    a.moving = true;
    const b = place(w, 2, -0.3, 0.55, 1);
    b.vx = 1.5;
    b.moving = true;
    for (let i = 0; i < 240 && !w.events.some((e) => e.type === 'touched'); i++) w.step(bothSweep(1));
    const touched = w.events.filter((e) => e.type === 'touched');
    expect(touched.length).toBe(1);
    expect(touched[0]).toMatchObject({ id: 2 });
  });

  it('a sweeper needs time to move over to another stone', () => {
    const w = new World(cleanIce(), 1);
    const a = place(w, 100, 0, 0, 0);
    a.vy = 1;
    a.moving = true;
    const b = place(w, 2, 1.2, 3, 0);
    b.vy = 1;
    b.moving = true;
    w.step(bothSweep(1));
    expect(w.sweepers.state[0].down).toBe(true);
    const other = [{ stoneId: 2, intensity: 1, side: 0 as const }, null];
    w.step(other);
    expect(w.sweepers.state[0].down).toBe(false);
    let ticks = 1;
    while (!w.sweepers.state[0].down && ticks < 2000) {
      w.step(other);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(60); // > 0.25 s for ~3 m
    expect(ticks).toBeLessThan(480);
  });

  it('sweeping input is quantised and the result is deterministic', () => {
    expect(quantizeIntensity(0.5004)).toBe(0.5);
    expect(quantizeIntensity(7)).toBe(1);
    expect(quantizeIntensity(-1)).toBe(0);
    const pattern = (s: { y: number }) => bothSweep(Math.abs(((s.y * 7) % 2) - 1), s.y > 5 ? 1 : -1);
    const a = throwStone(ice, { speed: v, sweep: pattern }).stone;
    const b = throwStone(ice, { speed: v, sweep: pattern }).stone;
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.angle).toBe(b.angle);
  });

  it('a swept throw does not change the shared ice of what-if simulations', () => {
    expect(ice.hotCount).toBe(0);
  });
});
