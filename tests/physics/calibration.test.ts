import { DELIVERY } from '../../src/physics/config';
import { solveSpeedForHogTime } from '../../src/physics/delivery';
import { teeY } from '../../src/physics/sheet';
import { cleanIce, teeDrawSpeed, throwStone } from '../helpers';

/** Calibration targets K1–K9 from docs/PHYSICS.md §9 (without sweeping). */
describe('calibration: draw and takeout on normal ice', () => {
  const ice = cleanIce();
  const v = teeDrawSpeed(ice);
  const draw = throwStone(ice, { speed: v });
  const line = { dir: 1 as const, releaseX: 0, aimX: 0, aimY: teeY(1), turn: 'cw' as const };

  it('the solver puts the draw on the tee line', () => {
    expect(draw.stone.y).toBeCloseTo(teeY(1), 2);
  });

  it('K1: draw takes 25–28 s from release to rest', () => {
    expect(draw.total).toBeGreaterThan(25);
    expect(draw.total).toBeLessThan(28);
  });

  it('K2: draw hog-to-hog time is 13–15 s', () => {
    expect(draw.h2h).toBeGreaterThan(13);
    expect(draw.h2h).toBeLessThan(15);
  });

  it('K2: keen ice is slower on the clock than normal, heavy ice faster', () => {
    const keen = cleanIce({ speed: 'keen' });
    const heavy = cleanIce({ speed: 'heavy' });
    const k = throwStone(keen, { speed: teeDrawSpeed(keen) });
    const h = throwStone(heavy, { speed: teeDrawSpeed(heavy) });
    expect(k.h2h).toBeGreaterThan(draw.h2h + 0.5);
    expect(h.h2h).toBeLessThan(draw.h2h - 0.5);
    expect(k.h2h).toBeGreaterThan(15);
    expect(h.h2h).toBeGreaterThan(12.5);
  });

  it('K3: normal takeout weight (hog-to-hog 8–10 s) needs about 2.4–3.1 m/s', () => {
    for (const t of [8, 9, 10]) {
      const speed = solveSpeedForHogTime(ice, line, t);
      expect(speed).toBeGreaterThan(2.4);
      expect(speed).toBeLessThan(3.1);
      expect(throwStone(ice, { speed, noBoundaries: true }).h2h).toBeCloseTo(t, 1);
    }
  });

  it('K4: a draw curls 1.0–1.5 m', () => {
    expect(draw.stone.x).toBeGreaterThan(1.0);
    expect(draw.stone.x).toBeLessThan(1.5);
  });

  it('K4: straight ice curls less, swingy ice more', () => {
    const straight = cleanIce({ curl: 'straight' });
    const swingy = cleanIce({ curl: 'swingy' });
    const s = throwStone(straight, { speed: v }).stone.x;
    const w = throwStone(swingy, { speed: v }).stone.x;
    expect(s).toBeLessThan(draw.stone.x * 0.8);
    expect(w).toBeGreaterThan(draw.stone.x * 1.2);
  });

  it('K5: a takeout curls much less than a draw', () => {
    const speed = solveSpeedForHogTime(ice, line, 9.5);
    const hit = throwStone(ice, { speed, noBoundaries: true });
    expect(hit.xAtTee).toBeGreaterThan(0.05);
    expect(hit.xAtTee).toBeLessThan(0.4 * draw.stone.x);
  });

  it('K6: most of the curl happens in the last third of the path', () => {
    expect(draw.lateShare).toBeGreaterThan(0.6);
  });

  it('K7: clockwise curls right, counter-clockwise curls left, mirror-symmetric', () => {
    const ccw = throwStone(ice, { speed: v, turn: 'ccw' });
    expect(draw.stone.x).toBeGreaterThan(0);
    expect(ccw.stone.x).toBeLessThan(0);
    expect(Math.abs(ccw.stone.x + draw.stone.x)).toBeLessThan(0.01 * draw.stone.x);
    expect(ccw.stone.y).toBeCloseTo(draw.stone.y, 3);
  });

  it('K8: curl hardly depends on rotation in the normal range', () => {
    const few = throwStone(ice, { speed: v, omega: DELIVERY.omega * 0.5 }).stone.x; // ~1.5 rotations
    const many = throwStone(ice, { speed: v, omega: DELIVERY.omega * (5 / 3) }).stone.x; // ~5 rotations
    expect(Math.abs(few - many) / draw.stone.x).toBeLessThan(0.2);
  });

  it('K8: a spinner (12+ rotations) curls clearly less', () => {
    const spinner = throwStone(ice, { speed: v, omega: DELIVERY.omega * 4.5 });
    expect(spinner.rotations).toBeGreaterThan(12);
    expect(spinner.stone.x).toBeLessThan(0.65 * draw.stone.x);
    expect(spinner.stone.x).toBeGreaterThan(0);
  });

  it('K8: a stone with almost no rotation is unpredictable', () => {
    const xs: number[] = [];
    for (let seed = 1; seed <= 12; seed++) xs.push(throwStone(ice, { speed: v, omega: 0.05, seed }).stone.x);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(sd).toBeGreaterThan(0.15);
    // with normal rotation the seed has practically no influence on ideal ice
    const a = throwStone(ice, { speed: v, seed: 1 }).stone.x;
    const b = throwStone(ice, { speed: v, seed: 2 }).stone.x;
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
  });

  it('K9: a draw makes 2–4 rotations and keeps rotating until it stops', () => {
    expect(draw.rotations).toBeGreaterThan(2);
    expect(draw.rotations).toBeLessThan(4);
  });

  it('decelerates harder towards the end (velocity-dependent friction)', () => {
    const speeds: number[] = [];
    throwStone(ice, { speed: v }, (w) => {
      const orig = w.step.bind(w);
      w.step = () => {
        orig();
        const s = w.stones[w.stones.length - 1];
        speeds.push(Math.sqrt(s.vx * s.vx + s.vy * s.vy));
      };
    });
    const early = (speeds[0] - speeds[240]) / 1;
    const n = speeds.length;
    const late = (speeds[n - 481] - speeds[n - 241]) / 1;
    expect(late).toBeGreaterThan(early * 1.15);
  });
});
