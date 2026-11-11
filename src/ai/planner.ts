import { deliverStone, releaseY } from '../physics/delivery';
import type { Ice } from '../physics/ice';
import { Rng } from '../physics/rng';
import { hackY, type Dir } from '../physics/sheet';
import { cloneStone, type Stone } from '../physics/stone';
import { World } from '../physics/world';
import { fgzRuling, hogLineShort, protectedStones } from '../rules/rules';
import { evaluate, type Situation } from './evaluate';
import type { IceBook } from './iceBook';
import { generateShots, type Shot } from './shots';

/** Playing strength: search effort and execution accuracy. */
export interface AiLevel {
  name: string;
  /** Candidates that survive the first look and are examined with execution errors. */
  keep: number;
  /** Monte-Carlo simulations per surviving candidate. */
  sims: number;
  /** Standard deviation of the release speed (relative). */
  weightSigma: number;
  /** Standard deviation of the line at the broom [m]. */
  lineSigma: number;
  /** Chooses at random among the best n candidates (1 = always the best). */
  pickFrom: number;
}

export const AI_LEVELS: readonly AiLevel[] = [
  { name: 'Anfänger', keep: 3, sims: 1, weightSigma: 0.03, lineSigma: 0.28, pickFrom: 3 },
  { name: 'Club', keep: 5, sims: 3, weightSigma: 0.018, lineSigma: 0.16, pickFrom: 2 },
  { name: 'Profi', keep: 7, sims: 5, weightSigma: 0.01, lineSigma: 0.09, pickFrom: 1 },
  { name: 'Weltklasse', keep: 10, sims: 8, weightSigma: 0.006, lineSigma: 0.05, pickFrom: 1 },
];

/** Draws are thrown a touch light and swept to the target. */
export const LIGHT_BIAS = 0.012;
/** Relative speed deficit that hard sweeping can make up for. */
const SWEEP_REACH = 0.04;

export interface PlanContext {
  ice: Ice;
  book: IceBook;
  stones: readonly Stone[];
  team: number;
  /** Index of the stone in the end (0…15). */
  shotIndex: number;
  hammer: number;
  /** Score difference before this end (team − opponent). */
  scoreDiff: number;
  endsLeft: number;
  level: AiLevel;
  seed: number;
}

interface Candidate {
  shot: Shot;
  first: number;
  value: number;
}

/** Simulate one delivery on the real physics (unswept, read-only ice) and apply the rules. */
export function simulateShot(
  ctx: Pick<PlanContext, 'ice' | 'book' | 'stones' | 'team' | 'shotIndex'>,
  shot: Shot,
  speedFactor = 1,
  aimOffset = 0,
): { stones: Stone[]; thrown: Stone } {
  const dir: Dir = ctx.book.dir;
  const w = new World(ctx.ice, 1);
  w.mutateIce = false;
  w.dir = dir;
  for (const s of ctx.stones) if (s.inPlay) w.addStone(cloneStone(s));
  const aimX = shot.aimX + aimOffset * dir;
  const hy = hackY(dir);
  const ry = releaseY(dir);
  const thrown = deliverStone(w, 99, ctx.team, {
    dir,
    releaseX: (aimX * (ry - hy)) / (shot.aimY - hy),
    aimX,
    aimY: shot.aimY,
    speed: shot.speed * speedFactor,
    turn: shot.turn,
  });
  w.runUntilRest(240 * 50);
  if (thrown.inPlay && hogLineShort(thrown, dir)) thrown.inPlay = false;
  const prot = protectedStones(ctx.stones, ctx.team, dir, ctx.shotIndex + 1);
  if (fgzRuling(prot, w.stones) !== 'none') {
    // violation: the stone is lost and everything is put back
    thrown.inPlay = false;
    return { stones: ctx.stones.filter((s) => s.inPlay).map(cloneStone), thrown };
  }
  return { stones: w.stones.filter((s) => s.inPlay), thrown };
}

/**
 * Shot selection by Monte-Carlo simulation over the real physics. Works in small steps so the
 * game stays responsive: call step() until it returns true, then read `best`.
 * The result only depends on the context (seed), not on how the work is sliced.
 */
export class Planner {
  best: Shot | null = null;
  /** Share of the work done, 0…1. */
  progress = 0;
  private gen: Generator<void, void>;
  private sit: Situation;

  constructor(private ctx: PlanContext) {
    this.sit = {
      dir: ctx.book.dir,
      me: ctx.team,
      hammer: ctx.hammer,
      stonesLeft: 15 - ctx.shotIndex,
      scoreDiff: ctx.scoreDiff,
      endsLeft: ctx.endsLeft,
    };
    this.gen = this.run();
  }

  /** Work for about `budgetMs` milliseconds; returns true when the decision is made. */
  step(budgetMs: number): boolean {
    const t0 = performance.now();
    do {
      if (this.gen.next().done) return true;
    } while (performance.now() - t0 < budgetMs);
    return false;
  }

  /** Run to completion (tests, headless use). */
  finish(): Shot {
    while (!this.gen.next().done);
    return this.best!;
  }

  private *run(): Generator<void, void> {
    const { ctx, sit } = this;
    const rng = new Rng(ctx.seed);
    const shots = generateShots(ctx.book, ctx.stones, ctx.team, ctx.shotIndex);
    const total = shots.length + ctx.level.keep * ctx.level.sims;
    let done = 0;

    // first look: every candidate once, executed perfectly; draws are corrected by their miss
    const cands: Candidate[] = [];
    for (const shot of shots) {
      let r = simulateShot(ctx, shot);
      if (shot.target.stopY !== undefined && r.thrown.inPlay && !r.thrown.hit) {
        const ex = r.thrown.x - shot.target.stopX!;
        const ea = (r.thrown.y - shot.target.stopY) * sit.dir;
        if (Math.abs(ex) > 0.03 || Math.abs(ea) > 0.05) {
          shot.aimX -= ex;
          shot.speed = ctx.book.speedForDistance(Math.max(18, ctx.book.speedToDistance(shot.speed) - ea));
          r = simulateShot(ctx, shot);
        }
      }
      cands.push({ shot, first: evaluate(r.stones, sit), value: 0 });
      this.progress = ++done / total;
      yield;
    }
    cands.sort((a, b) => b.first - a.first);
    const top = cands.slice(0, ctx.level.keep);

    // second look: how robust is each candidate against execution errors?
    for (const c of top) {
      let sum = 0;
      for (let i = 0; i < ctx.level.sims; i++) {
        let e = rng.gauss() * ctx.level.weightSigma;
        if (c.shot.target.stopY !== undefined) {
          // thrown slightly light; the sweepers make up for a light stone
          e -= LIGHT_BIAS;
          e = e < 0 ? Math.min(0, e + SWEEP_REACH) : e;
        }
        const r = simulateShot(ctx, c.shot, 1 + e, rng.gauss() * ctx.level.lineSigma);
        sum += evaluate(r.stones, sit);
        this.progress = ++done / total;
        yield;
      }
      c.value = (sum + c.first * 0.5) / (ctx.level.sims + 0.5);
    }
    top.sort((a, b) => b.value - a.value);
    const n = Math.min(ctx.level.pickFrom, top.length);
    this.best = top[n > 1 ? Math.floor(rng.float() * n) : 0].shot;
    this.progress = 1;
  }
}
