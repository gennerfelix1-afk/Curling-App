import { SweepAdvisor } from '../../src/ai/sweepAdvisor';
import { Game } from '../../src/game/game';
import { deliverStone } from '../../src/physics/delivery';
import { distToTee, teeY } from '../../src/physics/sheet';
import { World } from '../../src/physics/world';
import { CLEAN, deliver, newGame, runUntil, setWeight, shoot } from '../gameHelpers';
import { cleanIce, teeDrawSpeed } from '../helpers';

const T = teeY(1);

/** Let the game run by itself (AI turns, automatic decisions) until a condition holds. */
function autoplay(g: Game, done: () => boolean, maxSeconds: number): void {
  for (let t = 0; t < maxSeconds * 5 && !done(); t++) {
    if (g.phase === 'endScore') g.tap();
    g.update(0.2);
  }
}

describe('AI opponent in the game', () => {
  it('answers a human stone: thinks, announces the shot, throws, sweeps, hands back', () => {
    const g = newGame({ players: ['human', 'ai'], aiLevel: 1 });
    expect(g.isAI(1)).toBe(true);
    shoot(g, { weight: 'top4' });
    runUntil(g, () => g.phase === 'aiThink', 5);
    expect(g.team).toBe(1);
    expect(g.tap()).toBe(false); // the human cannot throw the AI's stone
    autoplay(g, () => g.phase === 'slide', 30);
    expect(g.aiShot).not.toBeNull();
    expect(g.message).toMatch(/Gelb spielt: /);
    expect(g.preview()).toEqual([]);
    autoplay(g, () => g.phase === 'aim', 120);
    expect(g.team).toBe(0);
    expect(g.shot).toBe(2);
    expect(g.world.stones.length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('AI sweeps its own draws to the target', () => {
    // all four levels draw to the button in the LSD; better levels end up closer on average
    const g = new Game({ seed: 21, ice: CLEAN, hammer: 'lsd', players: ['ai', 'ai'], aiLevel: 3 });
    let swept = false;
    for (let t = 0; t < 4000 && g.lsd; t++) {
      g.update(0.2);
      if (g.phase === 'running' && g.world.sweepers.state[0].down) swept = true;
    }
    expect(g.lsd).toBeNull();
    expect(swept).toBe(true);
    expect(g.message).toMatch(/LSD: Rot ([\d.]+) cm · Gelb ([\d.]+) cm/);
    const [, a, b] = g.message.match(/Rot ([\d.]+) cm · Gelb ([\d.]+) cm/)!;
    // two world-class draws each: both totals well inside the four-foot
    expect(Number(a)).toBeLessThan(120);
    expect(Number(b)).toBeLessThan(120);
  }, 60000);

  it('decides rule options itself when it is the non-offending team', () => {
    const g = newGame({ players: ['human', 'ai'], ice: { ...CLEAN, curl: 'straight' } });
    g.world.addStone({ id: 8, team: 1, x: 0.05, y: T - 3.5, vx: 0, vy: 0, angle: 0, omega: 0, inPlay: true, moving: false, xi: 0, hit: false });
    setWeight(g, 'top8');
    for (let i = 0, aim = 0.27; i < 6; i++) {
      g.setAim(aim, T);
      const p = g.preview();
      aim -= p[p.length - 2] - 0.27;
    }
    deliver(g);
    runUntil(g, () => g.phase === 'decision', 60);
    expect(g.decision).toMatchObject({ kind: 'noTick', team: 1 });
    autoplay(g, () => g.phase !== 'decision', 10);
    expect(g.message).toMatch(/No-Tick-Verstoß: abgegebener Stein entfernt/);
    expect(g.world.getStone(8)!.x).toBe(0.05);
  }, 60000);

  it('a complete 8-end match AI vs AI runs without errors', async () => {
    const g = new Game({ seed: 77, players: ['ai', 'ai'], aiLevel: 0, ends: 8, hammer: 'coin' });
    let shots = 0;
    let lastShot = -1;
    let lastEnd = 0;
    const kinds = new Set<string>();
    for (let t = 0; t < 400000 && g.phase !== 'gameOver'; t++) {
      // hand control back to the test runner regularly – the match takes about two minutes
      if (t % 200 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      if (g.phase === 'endScore') g.tap();
      g.update(0.2);
      if (g.aiShot) kinds.add(g.aiShot.kind);
      if (g.shot !== lastShot || g.match.end !== lastEnd) {
        if (g.shot > 0 || lastShot >= 0) shots++;
        lastShot = g.shot;
        lastEnd = g.match.end;
        // sanity of the position after every stone
        const st = g.world.stones.filter((s) => s.inPlay && !s.moving);
        for (const a of st) {
          expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
          expect(Math.abs(a.x)).toBeLessThan(2.4);
        }
        expect(st.length).toBeLessThanOrEqual(16);
      }
    }
    expect(g.phase).toBe('gameOver');
    const m = g.match;
    expect(m.over).toBe(true);
    expect(m.scores[0].length).toBeGreaterThanOrEqual(8);
    expect(m.scores[0].length).toBe(m.scores[1].length);
    expect(m.total(m.winner)).toBeGreaterThan(m.total(1 - m.winner));
    for (let e = 0; e < m.scores[0].length; e++) {
      expect(m.scores[0][e] === 0 || m.scores[1][e] === 0).toBe(true); // only one team scores per end
      expect(m.scores[0][e] + m.scores[1][e]).toBeLessThanOrEqual(8);
    }
    expect(m.total(0) + m.total(1)).toBeGreaterThan(0);
    expect(kinds.size).toBeGreaterThanOrEqual(4); // a variety of shots was played
    expect(shots).toBeGreaterThanOrEqual(8 * 16);
  }, 600000);
});

describe('sweeping by AI team-mates', () => {
  it('the skip calls for sweeping when a draw is light and stops calling when it is heavy', () => {
    const ice = cleanIce();
    const v = teeDrawSpeed(ice);
    const call = (factor: number): string => {
      const w = new World(ice, 1);
      w.mutateIce = false;
      const s = deliverStone(w, 1, 0, { dir: 1, releaseX: 0, aimX: 0, aimY: T, speed: v * factor, turn: 'cw' });
      for (let i = 0; i < 480; i++) w.step();
      return new SweepAdvisor({ stopY: T }).update(w.stones, s, ice, 1, w.tick);
    };
    expect(call(0.97)).toBe('hard');
    expect(call(1.0)).toBe('off');
    expect(call(1.04)).toBe('off');
    expect(['clean', 'hard']).toContain(call(0.992));
  });

  it('"auto": team-mates rescue a light draw; "calls": they sweep on the player\'s call', () => {
    const play = (o: Partial<ConstructorParameters<typeof Game>[0]>, callHard = false): number => {
      const g = newGame({ difficulty: 'pro', ...o });
      deliver(g, -0.7); // clearly light: 3.5 % less speed
      if (callHard) g.setSweepCall('hard');
      runUntil(g, () => g.phase === 'settled');
      return g.current!.inPlay ? g.current!.y : NaN;
    };
    const manual = play({ sweepMode: 'manual' }); // nobody sweeps
    const auto = play({ sweepMode: 'auto' });
    const calls = play({ sweepMode: 'calls' }, true);
    const silent = play({ sweepMode: 'calls' });
    expect(T - manual).toBeGreaterThan(1.2);
    expect(Math.abs(auto - T)).toBeLessThan(0.6);
    expect(auto).toBeGreaterThan(manual + 0.8);
    expect(calls).toBeGreaterThan(manual + 1.5);
    expect(silent).toBeCloseTo(manual, 6);
  }, 60000);

  it('the skip\'s call is available as text for display and sound', () => {
    const g = newGame({ difficulty: 'pro' });
    deliver(g, -1);
    runUntil(g, () => g.phase === 'running');
    g.update(1.5);
    expect(g.call).toBe('HARD!');
    expect(g.advice).toBe('hard');
  });
});

describe('training drills', () => {
  it('draw challenge: eight draws to the button, average distance at the end', () => {
    const g = newGame({ drill: 'draw' });
    expect(g.drill).toMatchObject({ kind: 'draw', attempts: 8 });
    const turns: string[] = [];
    for (let i = 0; i < 8; i++) {
      expect(g.phase).toBe('aim');
      expect(g.team).toBe(0);
      turns.push(g.turn);
      shoot(g, { aimX: g.turn === 'cw' ? -1.2 : 1.2 });
      expect(g.world.stones).toHaveLength(0);
    }
    expect(new Set(turns).size).toBe(2); // both turns are practised
    expect(g.phase).toBe('gameOver');
    expect(g.drill!.results).toHaveLength(8);
    for (const d of g.drill!.results) expect(d).toBeLessThan(0.5);
    expect(g.message).toMatch(/Schnitt: [\d.]+ cm/);
  }, 60000);

  it('takeout challenge: a stone in the house has to go; staying scores extra', () => {
    const g = newGame({ drill: 'takeout', ice: { ...CLEAN, curl: 'straight' } });
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const target = g.world.getStone(8)!;
      expect(distToTee(target.x, target.y, 1)).toBeLessThan(1.83);
      seen.add(`${target.x.toFixed(2)},${target.y.toFixed(2)}`);
      if (i < 6) {
        // aim at the target with normal weight using the preview
        setWeight(g, 'normal');
        let aim = target.x;
        for (let k = 0; k < 6; k++) {
          g.setAim(aim, T);
          const p = g.preview();
          aim -= p[p.length - 2] - target.x;
        }
        g.setAim(aim, T);
      } else {
        setWeight(g, 'guard'); // deliberately short
        g.setAim(target.x > 0 ? -1.5 : 1.5, T);
      }
      shoot(g);
    }
    expect(seen.size).toBe(8);
    expect(g.phase).toBe('gameOver');
    const r = g.drill!.results;
    expect(r.slice(0, 6).every((p) => p >= 1)).toBe(true);
    expect(r.slice(0, 6).some((p) => p === 2)).toBe(true);
    expect(r.slice(6)).toEqual([0, 0]);
    expect(g.message).toMatch(/Takeout-Challenge: \d+ von 16 Punkten/);
  }, 60000);

  it('reading the ice: unknown ice, weights from standard ice, no preview, ice revealed at the end', () => {
    const speeds = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) speeds.add(new Game({ seed, drill: 'ice' }).ice.options.speed);
    expect(speeds.size).toBeGreaterThan(1);
    const g = new Game({ seed: 2, drill: 'ice', preview: true });
    expect(g.preview()).toEqual([]);
    const standard = newGame().weights.find((w) => w.id === 'tee')!.speed;
    expect(g.weights.find((w) => w.id === 'tee')!.speed).toBeCloseTo(standard, 3);
    for (let i = 0; i < 8; i++) shoot(g);
    expect(g.phase).toBe('gameOver');
    expect(g.message).toMatch(/Das Eis war: (keen|normal|heavy), Curl (straight|normal|swingy)/);
  }, 120000);
});
