import { EXECUTION } from '../../src/physics/config';
import { nearHogY, teeY } from '../../src/physics/sheet';
import { deliver, newGame, runUntil, setWeight } from '../gameHelpers';

type G = ReturnType<typeof newGame>;
const T = teeY(1);

/** Hold until the power reaches `power`, then push off. */
function charge(g: G, power: number): void {
  g.tap();
  expect(g.phase).toBe('charge');
  g.pushStart();
  for (let i = 0; i < 2400 && g.power < power; i++) g.update(1 / 240);
  g.pushOff();
}

/** Glide while steering against the offset like a careful player, let go in the release zone. */
function glide(g: G, steering: boolean, letGoAt = 0.86): void {
  let steer = 0;
  for (let i = 0; i < 2400 && g.phase === 'glide'; i++) {
    if (steering) {
      steer -= g.lineOffset * 0.2; // feedback: move against the deviation
      g.steer(steer);
    }
    if (g.glide.u >= letGoAt) g.letGo();
    g.update(1 / 240);
  }
}

describe('push delivery: hold, push off, steer, let go', () => {
  it('the weight is dosed by holding: holding to the called weight throws exactly that weight', () => {
    const g = newGame({ delivery: 'push' });
    setWeight(g, 'tee');
    charge(g, g.targetPower);
    expect(g.phase).toBe('glide');
    expect(g.powerLabel).toBe('Tee / Button');
    expect(Math.abs(g.powerSpeed(g.power) - g.weight.speed)).toBeLessThan(0.01);
    glide(g, true);
    runUntil(g, () => g.phase === 'settled');
    const viaPush = { x: g.current!.x, y: g.current!.y };

    const m = newGame();
    deliver(m);
    runUntil(m, () => m.phase === 'settled');
    expect(Math.hypot(viaPush.x - m.current!.x, viaPush.y - m.current!.y)).toBeLessThan(0.35);
  });

  it('longer hold = more weight, continuously over the whole scale from guard to peel', () => {
    const g = newGame({ delivery: 'push' });
    const speeds = [0, 0.08, 0.3, 0.5, 0.7, 0.92, 1].map((p) => g.powerSpeed(p));
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    expect(g.powerSpeed(0.08)).toBeCloseTo(g.weights[0].speed, 6); // guard
    expect(g.powerSpeed(0.92)).toBeCloseTo(g.weights[g.weights.length - 1].speed, 6); // peel
    expect(g.powerScale).toHaveLength(13);

    const stop = (power: number): number => {
      const q = newGame({ delivery: 'push' });
      charge(q, power);
      glide(q, true);
      runUntil(q, () => q.phase === 'settled');
      return q.current!.inPlay ? q.current!.y : Infinity;
    };
    const guard = stop(newGame({ delivery: 'push' }).powerScale[0].pos);
    const tee = stop(newGame({ delivery: 'push' }).powerScale[4].pos);
    expect(tee - guard).toBeGreaterThan(2.5);
    expect(Math.abs(tee - T)).toBeLessThan(0.4);
    // full scale takes the configured time
    const q = newGame({ delivery: 'push' });
    q.tap();
    q.pushStart();
    q.update(0.25);
    expect(q.power).toBeCloseTo(0.25 / EXECUTION.chargeTime.beginner, 2);
  });

  it('nothing happens to the weight unless the finger is down; cancel returns to aiming', () => {
    const g = newGame({ delivery: 'push' });
    g.tap();
    g.update(0.5);
    expect(g.power).toBe(0);
    g.pushOff(); // no power yet: ignored
    expect(g.phase).toBe('charge');
    g.cancel();
    expect(g.phase).toBe('aim');
    expect(g.world.stones).toHaveLength(0);
    expect(g.shot).toBe(0);
  });

  it('the slide wanders off the line; steering keeps the stone on the broom', () => {
    const end = (steering: boolean, seed: number): number => {
      const g = newGame({ delivery: 'push', difficulty: 'pro', seed });
      setWeight(g, 'top8');
      charge(g, g.targetPower);
      glide(g, steering);
      return Math.abs(g.lineDev);
    };
    let unsteered = 0;
    let steered = 0;
    for (let seed = 1; seed <= 6; seed++) {
      unsteered += end(false, seed);
      steered += end(true, seed);
    }
    expect(unsteered / 6).toBeGreaterThan(0.15);
    expect(steered / 6).toBeLessThan(0.08);
  }, 30000);

  it('steering to one side throws the stone to that side of the broom', () => {
    const run = (steer: number): number => {
      const g = newGame({ delivery: 'push', difficulty: 'pro' });
      setWeight(g, 'top8');
      charge(g, g.targetPower);
      for (let i = 0; i < 2400 && g.phase === 'glide'; i++) {
        g.steer(steer);
        if (g.glide.u >= 0.86) g.letGo();
        g.update(1 / 240);
      }
      runUntil(g, () => g.phase === 'settled');
      return g.current!.x;
    };
    expect(run(1.5)).toBeGreaterThan(run(-1.5) + 0.5);
  });

  it('letting go early: the stone glides on unsteered to the release point', () => {
    const g = newGame({ delivery: 'push' });
    charge(g, g.targetPower);
    g.update(0.3);
    g.letGo();
    expect(g.phase).toBe('glide');
    g.steer(1); // ignored after letting go
    runUntil(g, () => g.phase === 'running', 10);
    expect(g.current!.y).toBeCloseTo(nearHogY(1) - 1.5, 1);
    expect(g.current!.inPlay).toBe(true);
  });

  it('beginners who hold on too long get the stone released automatically just before the hog line', () => {
    const g = newGame({ delivery: 'push' });
    charge(g, g.targetPower);
    runUntil(g, () => g.phase !== 'glide', 10);
    expect(g.phase).toBe('running');
    expect(g.current!.inPlay).toBe(true);
    expect(g.current!.y).toBeLessThan(nearHogY(1));
    expect(g.message).not.toMatch(/Hog-Line-Verletzung/);
  });

  it('the weight stops building up as soon as the finger starts the push-off', () => {
    const g = newGame({ delivery: 'push' });
    g.tap();
    g.pushStart();
    g.update(0.5);
    g.holdPower();
    const p = g.power;
    g.update(0.5);
    expect(g.power).toBe(p);
  });

  it('a pro who holds on until the hog line loses the stone (hog line violation)', () => {
    const g = newGame({ delivery: 'push', difficulty: 'pro' });
    charge(g, g.targetPower);
    runUntil(g, () => g.phase !== 'glide', 10);
    expect(g.message).toMatch(/Hog-Line-Verletzung/);
    runUntil(g, () => g.phase === 'aim');
    expect(g.world.stones).toHaveLength(0);
    expect(g.shot).toBe(1);
  });

  it('is deterministic', () => {
    const play = (): string => {
      const g = newGame({ delivery: 'push', seed: 5 });
      charge(g, 0.4);
      glide(g, false);
      runUntil(g, () => g.phase === 'settled');
      return `${g.current!.x},${g.current!.y}`;
    };
    expect(play()).toBe(play());
  });
});
