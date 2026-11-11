import { teeY } from '../../src/physics/sheet';
import { deliver, newGame, put, runUntil, setWeight } from '../gameHelpers';

const T = teeY(1);

describe('replay', () => {
  it('re-simulates the last delivery bit-identically, including sweeping and collisions', () => {
    const g = newGame({ seed: 9, ice: {} }); // real ice with variation, falls and wear
    put(g, 8, 1, 0.2, T - 0.3);
    put(g, 9, 1, -0.4, T + 0.6);
    g.shot = 6;
    setWeight(g, 'control');
    for (let i = 0, aim = 0.2; i < 6; i++) {
      g.setAim(aim, T);
      const p = g.preview();
      aim -= p[p.length - 2] - 0.2;
    }
    expect(g.startReplay()).toBe(false); // nothing to replay yet
    deliver(g);
    let n = 0;
    runUntil(g, () => g.phase === 'settled', 90, () => {
      // irregular sweeping, stopped before the hit
      n++;
      if (g.phase === 'running' && g.current!.y < T - 3 && n % 50 < 35) { g.sweepDown(0); g.sweepDown(1); }
      else { g.sweepUp(0); g.sweepUp(1); }
    });
    const actual = g.world.stones.map((s) => [s.id, s.x, s.y, s.angle, s.inPlay]);
    expect(g.world.events.some((e) => e.type === 'collision')).toBe(true);
    runUntil(g, () => g.phase === 'aim');
    expect(g.history).toHaveLength(1);

    expect(g.startReplay()).toBe(true);
    expect(g.phase).toBe('replay');
    const r = g.replay!;
    expect(r.collisions.length).toBeGreaterThan(0);
    expect(g.viewWorld).toBe(r.world);
    expect(g.viewWorld).not.toBe(g.world);
    let slowSeen = false;
    let fastSeen = false;
    runUntil(g, () => r.tick >= r.record.sweep.length, 400, () => {
      if (g.replaySpeed < 1) slowSeen = true;
      else fastSeen = true;
    });
    expect(slowSeen).toBe(true); // slow motion around the collision
    expect(fastSeen).toBe(true);
    expect(r.world.stones.map((s) => [s.id, s.x, s.y, s.angle, s.inPlay])).toEqual(actual);
    // the real game was not touched and continues afterwards
    runUntil(g, () => g.phase !== 'replay', 10);
    expect(g.phase).toBe('aim');
    expect(g.replay).toBeNull();
    expect(g.viewWorld).toBe(g.world);
    expect(g.shot).toBe(7);
  });

  it('keeps the last three deliveries; replay can be slowed down and stopped', () => {
    const g = newGame();
    for (let i = 0; i < 4; i++) {
      setWeight(g, 'guard');
      g.setAim(i * 0.4 - 0.6, T);
      deliver(g);
      runUntil(g, () => g.phase === 'aim', 120);
    }
    expect(g.history).toHaveLength(3);
    expect(g.history[2].label).toMatch(/Guard/);
    expect(g.startReplay(2)).toBe(true);
    expect(g.replay!.record).toBe(g.history[0]);
    g.replay!.slow = true;
    expect(g.replaySpeed).toBe(0.25);
    for (let i = 0; i < 4; i++) g.update(0.25); // one second at quarter speed
    expect(g.replay!.tick).toBeGreaterThan(50);
    expect(g.replay!.tick).toBeLessThan(70);
    g.stopReplay();
    expect(g.phase).toBe('aim');
    // not available in the middle of a delivery
    g.tap();
    expect(g.startReplay()).toBe(false);
  });
});
