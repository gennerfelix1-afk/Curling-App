import { endUtility, evaluate, type Situation } from '../../src/ai/evaluate';
import { IceBook } from '../../src/ai/iceBook';
import { AI_LEVELS, Planner, simulateShot, type PlanContext } from '../../src/ai/planner';
import { generateShots } from '../../src/ai/shots';
import { distToTee, teeY } from '../../src/physics/sheet';
import { createStone, type Stone } from '../../src/physics/stone';
import { cleanIce } from '../helpers';

const T = teeY(1);
const ice = cleanIce();
const book = new IceBook(ice, 1);
const st = (id: number, team: number, x: number, y: number): Stone => createStone(id, team, x, y);

const ctx = (stones: Stone[], o: Partial<PlanContext> = {}): PlanContext => ({
  ice,
  book,
  stones,
  team: 0,
  shotIndex: 15,
  hammer: 0,
  scoreDiff: 0,
  endsLeft: 4,
  level: AI_LEVELS[3],
  seed: 5,
  ...o,
});
const sit = (o: Partial<Situation> = {}): Situation => ({ dir: 1, me: 0, hammer: 0, stonesLeft: 0, scoreDiff: 0, endsLeft: 4, ...o });

describe('ice book', () => {
  it('knows weight and curl of the ice: a draw aimed with the book stops on the button', () => {
    for (const [x, y] of [[0, T], [0.8, T - 0.5], [-1.0, T + 0.3]]) {
      for (const turn of ['cw', 'ccw'] as const) {
        const speed = book.speedForDistance(y - (-T + 6.401 - 1.5));
        const aim = book.broomFor(speed, turn === 'cw', x, y);
        const r = simulateShot(ctx([]), { kind: 'draw', label: '', turn, speed, aimX: aim, aimY: T, target: {} });
        expect(Math.hypot(r.thrown.x - x, r.thrown.y - y)).toBeLessThan(0.25); // the planner refines further
      }
    }
  });

  it('hits a stone on the nose with any weight and turn', () => {
    const target = st(8, 1, 0.6, T - 0.4);
    const shots = generateShots(book, [target], 0, 10).filter((s) => s.kind === 'hit-and-stay');
    expect(shots.length).toBe(4);
    for (const shot of shots) {
      const r = simulateShot(ctx([target], { shotIndex: 10 }), shot);
      expect(r.thrown.hit).toBe(true);
      expect(r.stones.some((s) => s.id === 8)).toBe(false); // taken out
      expect(r.stones.some((s) => s.id === 99)).toBe(true); // shooter stays
    }
  });

  it('works for the other direction of play', () => {
    const back = new IceBook(ice, -1);
    const speed = back.speedForDistance(back.toTee);
    const aim = back.broomFor(speed, true, 0.5, T); // thrower's frame
    const r = simulateShot({ ice, book: back, stones: [], team: 0, shotIndex: 8 }, { kind: 'draw', label: '', turn: 'cw', speed, aimX: -aim, aimY: -T, target: {} });
    expect(Math.hypot(r.thrown.x + 0.5, r.thrown.y + T)).toBeLessThan(0.25);
  });
});

describe('position evaluation', () => {
  it('end utility: with the hammer two beats a blank beats one; without it a steal is best', () => {
    expect(endUtility(2, true, 0, 4)).toBeGreaterThan(endUtility(0, true, 0, 4));
    expect(endUtility(0, true, 0, 4)).toBeGreaterThan(endUtility(1, true, 0, 4));
    expect(endUtility(1, true, 0, 4)).toBeGreaterThan(endUtility(-1, true, 0, 4));
    expect(endUtility(1, false, 0, 4)).toBeGreaterThan(endUtility(-1, false, 0, 4));
    expect(endUtility(-1, false, 0, 4)).toBeGreaterThan(endUtility(0, false, 0, 4)); // forcing one > blank
    expect(endUtility(-1, false, 0, 4)).toBeGreaterThan(endUtility(-2, false, 0, 4));
  });

  it('in the last end only winning counts', () => {
    expect(endUtility(1, true, 0, 0)).toBeGreaterThan(endUtility(0, true, 0, 0)); // take the one
    expect(endUtility(0, true, 1, 0)).toBeGreaterThan(3); // ahead: a blank wins
    expect(endUtility(-1, true, 1, 0)).toBeLessThan(endUtility(0, true, 1, 0));
  });

  it('prefers counting stones, cover, and the right kind of guards', () => {
    const open = [st(0, 0, 0, T)];
    const cover = [st(0, 0, 0, T), st(1, 0, 0.05, T - 3)];
    const s = sit({ stonesLeft: 6, hammer: 1 });
    expect(evaluate(open, s)).toBeGreaterThan(evaluate([st(8, 1, 0, T)], s));
    expect(evaluate(cover, s)).toBeGreaterThan(evaluate(open, s));
    // a centre guard is an asset without the hammer and a liability with it
    const centre = [st(1, 0, 0, T - 3)];
    const gain = (hammer: number): number =>
      evaluate(centre, sit({ stonesLeft: 12, hammer })) - evaluate([], sit({ stonesLeft: 12, hammer }));
    expect(gain(1)).toBeGreaterThan(0);
    expect(gain(0)).toBeLessThan(0);
  });
});

describe('shot selection', () => {
  it('last stone, opponent sits on the button: hit it', () => {
    const p = new Planner(ctx([st(8, 1, 0.1, T)]));
    const shot = p.finish();
    expect(['hit-and-stay', 'hit-and-roll', 'double', 'tap-back']).toContain(shot.kind);
    const r = simulateShot(ctx([st(8, 1, 0.1, T)]), shot);
    // the opponent does not score any more (we count one, or the end is blanked to keep the hammer)
    const theirs = r.stones.find((s) => s.id === 8);
    const mine = r.stones.find((s) => s.team === 0);
    const theirDist = theirs ? distToTee(theirs.x, theirs.y, 1) : Infinity;
    expect(theirDist > 1.98 || (mine !== undefined && distToTee(mine.x, mine.y, 1) < theirDist)).toBe(true);
    // in the last end, one down, the point is needed: the shooter has to stay
    const need = new Planner(ctx([st(8, 1, 0.1, T)], { endsLeft: 0, scoreDiff: 0 })).finish();
    const r2 = simulateShot(ctx([st(8, 1, 0.1, T)]), need);
    expect(r2.stones.filter((s) => s.team === 0)).toHaveLength(1);
    expect(r2.stones.some((s) => s.id === 8 && distToTee(s.x, s.y, 1) < 1.98)).toBe(false);
    expect(p.progress).toBe(1);
  });

  it('last stone with the hammer and an empty house: blank early in the game, draw for the win in the last end', () => {
    const early = new Planner(ctx([], { endsLeft: 5 })).finish();
    expect(early.kind).toBe('through');
    const last = new Planner(ctx([], { endsLeft: 0 })).finish();
    expect(last.kind).toBe('draw');
  });

  it('first stone without the hammer: guard or draw, never a throw-away', () => {
    const shot = new Planner(ctx([], { shotIndex: 0, hammer: 1 })).finish();
    expect(['guard', 'draw']).toContain(shot.kind);
  });

  it('respects the five-rock rule: no peel of a guard with the 2nd stone, but later', () => {
    const guard = [st(8, 1, 0, T - 3.2)];
    const early = new Planner(ctx(guard, { shotIndex: 1, hammer: 0 })).finish();
    expect(early.kind).not.toBe('peel');
    const r = simulateShot(ctx(guard, { shotIndex: 1 }), early);
    expect(r.stones.some((s) => s.id === 8)).toBe(true);
    // the peel itself is recognised as a wasted stone while the guard is protected
    const peel = generateShots(book, guard, 0, 1).find((s) => s.kind === 'peel')!;
    const wasted = simulateShot(ctx(guard, { shotIndex: 1 }), peel);
    expect(wasted.stones.map((s) => s.id)).toEqual([8]);
    const allowed = simulateShot(ctx(guard, { shotIndex: 7 }), peel);
    expect(allowed.stones.some((s) => s.id === 8)).toBe(false);
  });

  it('knows doubles, raises, runbacks, freezes and come-arounds', () => {
    const stones = [st(8, 1, 0.2, T - 0.6), st(9, 1, 0.55, T + 0.5), st(0, 0, -0.3, T - 3), st(10, 1, 1.2, T - 3.1)];
    const kinds = new Set(generateShots(book, stones, 0, 8).map((s) => s.kind));
    for (const k of ['draw', 'guard', 'come-around', 'freeze', 'tap-back', 'hit-and-stay', 'hit-and-roll', 'peel', 'double', 'raise', 'through']) {
      expect(kinds.has(k as never)).toBe(true);
    }
    const run = generateShots(book, [st(0, 0, 0, T - 3), st(8, 1, 0.1, T - 0.2)], 0, 8);
    expect(run.some((s) => s.kind === 'runback')).toBe(true);
    // a double really removes both stones from the house
    const pair = [st(8, 1, 0, T - 0.5), st(9, 1, 0.9, T + 0.2)];
    const best = generateShots(book, pair, 0, 9)
      .filter((s) => s.kind === 'double')
      .map((s) => simulateShot(ctx(pair, { shotIndex: 9 }), s).stones.filter((q) => q.team === 1 && distToTee(q.x, q.y, 1) < 1.98).length);
    expect(Math.min(...best)).toBe(0);
  });

  it('is deterministic for a seed and independent of how the work is sliced', () => {
    const stones = [st(8, 1, 0.3, T - 0.2), st(0, 0, -0.6, T + 0.4), st(9, 1, 0, T - 3)];
    const a = new Planner(ctx(stones, { shotIndex: 9, level: AI_LEVELS[1] })).finish();
    const p = new Planner(ctx(stones, { shotIndex: 9, level: AI_LEVELS[1] }));
    let steps = 0;
    while (!p.step(0)) steps++;
    expect(steps).toBeGreaterThan(10);
    expect(p.best).toEqual(a);
  });

  it('stronger levels throw more accurately', () => {
    expect(AI_LEVELS).toHaveLength(4);
    for (let i = 1; i < 4; i++) {
      expect(AI_LEVELS[i].weightSigma).toBeLessThan(AI_LEVELS[i - 1].weightSigma);
      expect(AI_LEVELS[i].lineSigma).toBeLessThan(AI_LEVELS[i - 1].lineSigma);
      expect(AI_LEVELS[i].keep * AI_LEVELS[i].sims).toBeGreaterThan(AI_LEVELS[i - 1].keep * AI_LEVELS[i - 1].sims);
    }
  });
});
