import { teeY } from '../../src/physics/sheet';
import { deliver, newGame, runUntil, setWeight } from '../gameHelpers';

const T = teeY(1);

/** Throw a top-8 draw and rub the ice with the given intensity while the stone runs. */
function play(intensity: number, side: -1 | 0 | 1 = 0, o = {}): { x: number; y: number; g: ReturnType<typeof newGame> } {
  const g = newGame(o);
  setWeight(g, 'top8');
  deliver(g);
  runUntil(g, () => g.phase === 'settled', 90, () => {
    if (g.phase === 'running') g.setScrub(intensity, side);
  });
  return { x: g.current!.x, y: g.current!.y, g };
}

describe('sweeping by rubbing the ice', () => {
  it('rubbing carries the stone further and straighter; faster rubbing does more', () => {
    const none = play(0);
    const light = play(0.4);
    const hard = play(1);
    expect(light.y).toBeGreaterThan(none.y + 0.4);
    expect(hard.y).toBeGreaterThan(light.y + 0.4);
    expect(hard.x).toBeLessThan(none.x * 0.9);
    expect(Math.abs(none.y - (T - 1))).toBeLessThan(0.3);
  });

  it('one finger drives both sweepers; the intensity is clamped to 0…1', () => {
    const g = newGame();
    g.setScrub(0.5);
    expect(g.sweepIntensity(0)).toBe(0.5);
    expect(g.sweepIntensity(1)).toBe(0.5);
    expect(g.sweepIntensity(2)).toBe(0); // the other team's skip is separate
    g.setScrub(7);
    expect(g.sweepIntensity(0)).toBe(1);
    g.setScrub(-1);
    expect(g.sweepIntensity(0)).toBe(0);
    // keys still work and combine with rubbing
    g.sweepDown(0);
    expect(g.sweepIntensity(0)).toBeCloseTo(0.8, 5);
    expect(g.sweepIntensity(1)).toBe(0);
  });

  it('rubbing on one side of the path sweeps that side', () => {
    const left = play(1, -1);
    const right = play(1, 1);
    expect(left.x - right.x).toBeGreaterThan(0.005);
    expect(left.x - right.x).toBeLessThan(0.15);
  });

  it('stops when the stone has come to rest and does nothing for AI team-mates modes', () => {
    const { g } = play(1);
    expect(g.scrub.intensity).toBe(0);
    const auto = play(1, 0, { sweepMode: 'calls' });
    const silent = play(0, 0, { sweepMode: 'calls' });
    expect(auto.y).toBeCloseTo(silent.y, 6); // in "calls" mode only the call counts
  });

  it('hard rubbing tires the sweepers', () => {
    const { g } = play(1);
    expect(g.world.sweepers.state[0].fatigue).toBeGreaterThan(0.15);
    const easy = play(0.5).g;
    expect(easy.world.sweepers.state[0].fatigue).toBe(0);
  });
});
