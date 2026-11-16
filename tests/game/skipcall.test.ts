import { GRADES } from '../../src/physics/config';
import { distToTee, teeY } from '../../src/physics/sheet';
import { newGame, put, runUntil } from '../gameHelpers';

type G = ReturnType<typeof newGame>;
const T = teeY(1);

/** Wait for the skip's call, then deliver with the push delivery: hold to `power`, steer or not. */
function throwCalled(g: G, o: { powerOffset?: number; steer?: boolean; sweep?: boolean } = {}): void {
  runUntil(g, () => g.phase === 'aim' && g.skipCall !== null, 30);
  g.tap();
  g.pushStart();
  const target = g.targetPower + (o.powerOffset ?? 0);
  for (let i = 0; i < 2400 && g.power < target; i++) g.update(1 / 240);
  g.holdPower();
  g.pushOff();
  let steer = 0;
  for (let i = 0; i < 2400 && g.phase === 'glide'; i++) {
    if (o.steer !== false) {
      steer -= g.lineOffset * 0.2;
      g.steer(steer);
    }
    if (g.glide.u >= g.glide.releaseAt) g.letGo();
    g.update(1 / 240);
  }
  runUntil(g, () => g.phase !== 'running' && g.phase !== 'settled', 90, () => {
    if (o.sweep && g.advice !== 'off') {
      g.sweepDown(0);
      g.sweepDown(1);
    } else {
      g.sweepUp(0);
      g.sweepUp(1);
    }
  });
}

describe('the skip calls the shot', () => {
  it('the player cannot throw before the call, and cannot change target, turn or weight', () => {
    const g = newGame({ skipCalls: true, delivery: 'push' });
    expect(g.tap()).toBe(false);
    runUntil(g, () => g.skipCall !== null, 30);
    expect(g.phase).toBe('aim');
    const call = g.skipCall!;
    expect(call.label.length).toBeGreaterThan(2);
    expect(g.aimX).toBe(call.aimX);
    expect(g.turn).toBe(call.turn);
    g.setAim(1.5, T);
    g.setTurn(call.turn === 'cw' ? 'ccw' : 'cw');
    g.changeWeight(3);
    expect(g.aimX).toBe(call.aimX);
    expect(g.turn).toBe(call.turn);
    expect(g.callSpeed).toBe(call.speed);
    // the mark on the power scale is exactly the called weight
    expect(g.powerSpeed(g.targetPower)).toBeCloseTo(call.speed, 3);
  });

  it('executing the call well does what the skip wanted', () => {
    const g = newGame({ skipCalls: true, delivery: 'push', drill: 'draw' });
    throwCalled(g, { sweep: true });
    expect(g.drill!.results[0]).toBeLessThan(0.6); // close to the button
    expect(g.lastDelivery!.weightGrade).toBeGreaterThanOrEqual(2);
    expect(g.lastDelivery!.lineGrade).toBeGreaterThanOrEqual(2);
  });

  it('takeout drill: the skip calls the hit on the stone in the house', () => {
    const g = newGame({ skipCalls: true, delivery: 'push', drill: 'takeout', ice: { variation: false, falls: false, wear: false, endDrift: false, curl: 'straight' } });
    runUntil(g, () => g.skipCall !== null, 30);
    expect(g.skipCall!.kind).toBe('hit-and-stay');
    expect(g.skipCall!.target.hitId).toBe(8);
    throwCalled(g);
    expect(g.drill!.results[0]).toBeGreaterThanOrEqual(1);
  });

  it('a new call for every stone; in a match the call fits the position', () => {
    const g = newGame({ skipCalls: true, delivery: 'push' });
    put(g, 8, 1, 0.1, T); // opponent sits on the button
    g.shot = 14; // red's last stone
    runUntil(g, () => g.skipCall !== null, 30);
    const kind = g.skipCall!.kind;
    expect(['hit-and-stay', 'hit-and-roll', 'tap-back', 'freeze', 'double', 'draw', 'guard', 'come-around']).toContain(kind);
    expect(kind).not.toBe('through');
    throwCalled(g);
    runUntil(g, () => g.phase === 'aim' || g.phase === 'skipThink', 30);
    expect(g.skipCall === null || g.team === 1).toBe(true);
  }, 60000);
});

describe('feedback on the delivery', () => {
  const deliver = (o: Parameters<typeof throwCalled>[1]): G => {
    const g = newGame({ skipCalls: true, delivery: 'push', drill: 'draw', difficulty: 'pro' });
    throwCalled(g, o);
    return g;
  };

  it('hitting weight and line is graded perfect / great', () => {
    const d = deliver({}).lastDelivery!;
    expect(Math.abs(d.weightErr)).toBeLessThan(GRADES.weight[1]);
    expect(Math.abs(d.lineErr)).toBeLessThan(GRADES.line[1]);
    expect(d.weightGrade).toBeGreaterThanOrEqual(2);
    expect(d.lineGrade).toBeGreaterThanOrEqual(2);
  });

  it('holding too long is "too heavy", too short "too light" – and the stone shows it', () => {
    const heavy = deliver({ powerOffset: 0.2 });
    const light = deliver({ powerOffset: -0.2 });
    expect(heavy.lastDelivery!.weightErr).toBeGreaterThan(0.015);
    expect(light.lastDelivery!.weightErr).toBeLessThan(-0.015);
    expect(heavy.lastDelivery!.weightGrade).toBeLessThanOrEqual(1);
    expect(light.lastDelivery!.weightGrade).toBeLessThanOrEqual(1);
    expect(light.drill!.results[0]).toBeGreaterThan(0.5);
  });

  it('not steering the slide costs the line grade (averaged over several slides)', () => {
    let sum = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const g = newGame({ skipCalls: true, delivery: 'push', drill: 'draw', difficulty: 'pro', seed });
      throwCalled(g, { steer: false });
      sum += g.lastDelivery!.lineGrade;
    }
    expect(sum / 5).toBeLessThan(2);
  }, 60000);

  it('counts a streak of good deliveries and resets it after a poor one', () => {
    const g = newGame({ skipCalls: true, delivery: 'push', drill: 'draw' });
    throwCalled(g);
    expect(g.lastDelivery!.streak).toBe(1);
    throwCalled(g);
    expect(g.lastDelivery!.streak).toBe(2);
    throwCalled(g, { powerOffset: 0.25 });
    expect(g.lastDelivery!.streak).toBe(0);
    expect(g.lastDelivery!.n).toBe(3);
  }, 60000);

  it('the AI gets no delivery feedback', () => {
    const g = newGame({ skipCalls: true, players: ['ai', 'ai'], aiLevel: 0 });
    runUntil(g, () => g.shot >= 1, 120);
    expect(g.lastDelivery).toBeNull();
    expect(distToTee(0, T, 1)).toBe(0);
  }, 60000);
});
