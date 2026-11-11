import { EXECUTION } from '../../src/physics/config';
import { nearHogY, teeY } from '../../src/physics/sheet';
import { deliver, newGame, runUntil } from '../gameHelpers';

/** Swipe from the hack up to `to` (share of the way to the hog line) in `seconds`, then let go. */
function swipe(g: ReturnType<typeof newGame>, to: number, seconds: number, slope = 0, release = true): void {
  g.tap();
  expect(g.phase).toBe('gesture');
  const ticks = Math.round(seconds * 240);
  for (let i = 1; i <= ticks && g.phase === 'gesture'; i++) {
    g.gestureMove((to * i) / ticks, slope);
    g.update(1 / 240);
  }
  if (release) g.gestureRelease();
}

/** Ideal swipe: reach the usual release point (≈ 84.5 % of the way) in the ideal time. */
const REL = 0.845;

describe('swipe gesture delivery', () => {
  it('an ideal swipe throws the selected weight on the line of the broom', () => {
    const g = newGame({ delivery: 'gesture' });
    swipe(g, REL, EXECUTION.gestureTime);
    expect(Math.abs(g.weightDev)).toBeLessThan(0.05);
    expect(g.lineDev).toBe(0);
    runUntil(g, () => g.phase === 'settled');
    const viaGesture = { x: g.current!.x, y: g.current!.y };

    const m = newGame();
    deliver(m);
    runUntil(m, () => m.phase === 'settled');
    expect(Math.hypot(viaGesture.x - m.current!.x, viaGesture.y - m.current!.y)).toBeLessThan(0.35);
    expect(Math.abs(viaGesture.y - teeY(1))).toBeLessThan(0.4);
  });

  it('a fast swipe is heavy, a slow swipe is light, a crooked swipe misses the broom', () => {
    const run = (seconds: number, slope: number): { x: number; y: number; w: number; l: number } => {
      const g = newGame({ delivery: 'gesture', difficulty: 'pro' });
      g.changeWeight(-2); // top 8, stays in play either way
      swipe(g, REL, seconds, slope);
      const w = g.weightDev;
      const l = g.lineDev;
      runUntil(g, () => g.phase === 'settled');
      return { x: g.current!.x, y: g.current!.y, w, l };
    };
    const ideal = run(EXECUTION.gestureTime, 0);
    const fast = run(EXECUTION.gestureTime * 0.7, 0);
    const slow = run(EXECUTION.gestureTime * 1.6, 0);
    const crooked = run(EXECUTION.gestureTime, 0.2);
    expect(fast.w).toBeGreaterThan(0.5);
    expect(slow.w).toBeLessThan(-0.5);
    expect(fast.y).toBeGreaterThan(ideal.y + 0.5);
    expect(slow.y).toBeLessThan(ideal.y - 0.5);
    expect(crooked.l).toBeCloseTo(0.8, 5);
    expect(crooked.x).toBeGreaterThan(ideal.x + 0.25);
  });

  it('the live pace indicator follows the swipe', () => {
    const g = newGame({ delivery: 'gesture' });
    g.tap();
    expect(g.gesturePace).toBe(0);
    for (let i = 1; i <= 60; i++) {
      g.gestureMove(i / 100, 0); // 60 % of the way in 0.25 s: far too fast
      g.update(1 / 240);
    }
    expect(g.gesturePace).toBe(1);
  });

  it('letting go early lets the stone glide on to the release point', () => {
    const g = newGame({ delivery: 'gesture' });
    swipe(g, 0.5, EXECUTION.gestureTime * (0.5 / REL));
    expect(g.phase).toBe('slide');
    runUntil(g, () => g.phase === 'running');
    expect(g.current!.y).toBeCloseTo(nearHogY(1) - 1.5, 2);
    expect(g.current!.inPlay).toBe(true);
  });

  it('letting go late releases the stone right there – still before the hog line', () => {
    const g = newGame({ delivery: 'gesture' });
    swipe(g, 0.95, EXECUTION.gestureTime * (0.95 / REL));
    expect(g.phase).toBe('running');
    expect(g.current!.inPlay).toBe(true);
    expect(g.current!.y).toBeGreaterThan(nearHogY(1) - 1.0);
    expect(g.current!.y).toBeLessThan(nearHogY(1));
  });

  it('holding on to the stone at the hog line is a hog line violation', () => {
    const g = newGame({ delivery: 'gesture' });
    swipe(g, 1.1, 1.6, 0, false);
    expect(g.phase).not.toBe('gesture');
    expect(g.message).toMatch(/Hog-Line-Verletzung/);
    runUntil(g, () => g.phase === 'aim');
    expect(g.world.stones).toHaveLength(0);
    expect(g.shot).toBe(1); // the stone is lost
  });

  it('a very short swipe or "cancel" goes back to aiming without losing the stone', () => {
    const g = newGame({ delivery: 'gesture' });
    swipe(g, 0.1, 0.3);
    expect(g.phase).toBe('aim');
    expect(g.world.stones).toHaveLength(0);
    expect(g.shot).toBe(0);
    g.tap();
    g.cancel();
    expect(g.phase).toBe('aim');
    expect(g.world.stones).toHaveLength(0);
  });

  it('the stone only moves forward with the finger', () => {
    const g = newGame({ delivery: 'gesture' });
    g.tap();
    g.gestureMove(0.4, 0);
    g.update(0.1);
    const y = g.current!.y;
    g.gestureMove(0.2, 0); // finger moves back
    g.update(0.1);
    expect(g.current!.y).toBe(y);
  });
});
