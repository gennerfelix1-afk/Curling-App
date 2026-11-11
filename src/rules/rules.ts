import { RULES, SHEET, STONE } from '../physics/config';
import { clearedFarHog, distToTee, inHouse, teeY, type Dir } from '../physics/sheet';
import type { Stone } from '../physics/stone';
import type { SweepCommand } from '../physics/sweep';

const R = STONE.radius;

// ───────────── Free guard zone (R6) ─────────────

/**
 * R6: a stone at rest between the hog line and the tee line of the playing end, excluding the
 * house, is in the free guard zone.
 */
export function isInFGZ(s: { x: number; y: number }, dir: Dir): boolean {
  const along = s.y * dir;
  const tee = teeY(dir) * dir;
  return along - R < tee && !inHouse(s.x, s.y, dir) && clearedFarHog(s.y, dir);
}

/** The stone touches the centre line (no-tick rule). */
export function touchesCentreLine(s: { x: number }): boolean {
  return Math.abs(s.x) <= R + RULES.centreLineHalfWidth;
}

export interface ProtectedStone {
  id: number;
  /** Was touching the centre line before the delivery (no-tick protection). */
  onCentre: boolean;
}

/**
 * Opposition stones that are protected for this delivery: stones in the FGZ before the
 * `stoneNumber`-th stone of the end (1-based) while stoneNumber < 6 (five-rock rule).
 */
export function protectedStones(stones: readonly Stone[], throwingTeam: number, dir: Dir, stoneNumber: number): ProtectedStone[] {
  if (stoneNumber >= RULES.fgzUntilStone) return [];
  const out: ProtectedStone[] = [];
  for (const s of stones) {
    if (s.inPlay && s.team !== throwingTeam && isInFGZ(s, dir)) {
      out.push({ id: s.id, onCentre: touchesCentreLine(s) });
    }
  }
  return out;
}

export type FgzRuling = 'none' | 'fgz' | 'noTick';

/**
 * Check the result of a delivery against the FGZ rules.
 * - 'fgz': a protected stone was moved out of play → delivered stone removed, stones replaced.
 * - 'noTick': a protected stone on the centre line was moved off it → non-offending team decides.
 */
export function fgzRuling(protectedList: readonly ProtectedStone[], after: readonly Stone[]): FgzRuling {
  let noTick = false;
  for (const p of protectedList) {
    const s = after.find((q) => q.id === p.id);
    if (!s || !s.inPlay) return 'fgz';
    if (p.onCentre && !touchesCentreLine(s)) noTick = true;
  }
  return noTick ? 'noTick' : 'none';
}

// ───────────── Hog line (R5) ─────────────

/**
 * R5: a delivered stone that does not completely cross the inner edge of the hog line at the
 * playing end is removed – unless it has struck another stone in play.
 */
export function hogLineShort(s: Stone, dir: Dir): boolean {
  return !s.hit && !clearedFarHog(s.y, dir);
}

/** R5: the stone must be released before it reaches the hog line at the delivery end. */
export function releaseViolation(releaseYPos: number, dir: Dir): boolean {
  return releaseYPos * dir > -(SHEET.teeToTee / 2 - SHEET.teeToHog);
}

// ───────────── Scoring ─────────────

export interface RankedStone {
  id: number;
  team: number;
  /** Distance of the stone centre from the tee [m]. */
  dist: number;
}

export interface EndScore {
  /** Scoring team, -1 = blank end. */
  team: number;
  points: number;
  /** All stones in the house, closest first. */
  ranking: RankedStone[];
  /** Stones whose distances decided the score so narrowly that the measuring device is used. */
  measured: RankedStone[];
}

/**
 * Score an end: only stones in the house count (a stone touching the 12-foot circle is in);
 * a team scores one point for each stone closer to the tee than the best opposition stone.
 */
export function scoreEnd(stones: readonly Stone[], dir: Dir): EndScore {
  const ranking: RankedStone[] = [];
  for (const s of stones) {
    if (s.inPlay && inHouse(s.x, s.y, dir)) ranking.push({ id: s.id, team: s.team, dist: distToTee(s.x, s.y, dir) });
  }
  ranking.sort((a, b) => a.dist - b.dist || a.id - b.id);
  const result: EndScore = { team: -1, points: 0, ranking, measured: [] };
  if (ranking.length === 0) return result;
  const best = ranking[0];
  const firstOpp = ranking.find((r) => r.team !== best.team);
  // two stones of different teams exactly equally close: neither can be told closer → blank
  if (firstOpp && firstOpp.dist === best.dist) {
    result.measured = [best, firstOpp];
    return result;
  }
  result.team = best.team;
  for (const r of ranking) {
    if (r.team !== best.team) break;
    result.points++;
  }
  if (firstOpp) {
    const last = ranking[result.points - 1];
    if (firstOpp.dist - last.dist < RULES.measureThreshold) result.measured = [last, firstOpp];
  }
  return result;
}

/** Stones so close to the edge of the house that "biter or not" needs a measurement. */
export function biterChecks(stones: readonly Stone[], dir: Dir): RankedStone[] {
  const edge = SHEET.houseRadii[0] + R;
  const out: RankedStone[] = [];
  for (const s of stones) {
    if (!s.inPlay) continue;
    const dist = distToTee(s.x, s.y, dir);
    if (Math.abs(dist - edge) < RULES.measureThreshold) out.push({ id: s.id, team: s.team, dist });
  }
  return out;
}

/** Last stone draw: recorded distance of a single draw stone [m]. */
export function lsdDistance(s: Stone, dir: Dir): number {
  return s.inPlay && inHouse(s.x, s.y, dir) ? distToTee(s.x, s.y, dir) : RULES.lsdMiss;
}

// ───────────── Sweeping (R8) ─────────────

/** The stone's leading edge has reached the tee line of the playing end. */
export function reachedTeeLine(s: { y: number }, dir: Dir): boolean {
  return s.y * dir + R >= teeY(dir) * dir;
}

/**
 * Enforce the sweeping rules on raw sweeping input (sweepers 0, 1 = delivering team, 2 = skip of
 * the non-delivering team):
 * - between the tee lines any player of the delivering team may sweep, but only their own stones;
 * - behind the tee line only one player per team may sweep, and any stone may be swept;
 * - the non-delivering team may only sweep behind the tee line (its skip);
 * - behind the tee line a team has the first privilege to sweep its own stone.
 */
export function applySweepRules(
  cmds: readonly (SweepCommand | null)[],
  stones: readonly Stone[],
  dir: Dir,
  deliveringTeam: number,
): (SweepCommand | null)[] {
  const out: (SweepCommand | null)[] = [null, null, null];
  const stoneOf = (c: SweepCommand | null): Stone | undefined =>
    c && c.intensity > 0 ? stones.find((s) => s.id === c.stoneId && s.inPlay) : undefined;
  let behindUsed = false;
  for (let k = 0; k < 2; k++) {
    const c = cmds[k] ?? null;
    const s = stoneOf(c);
    if (!s) continue;
    if (reachedTeeLine(s, dir)) {
      if (behindUsed) continue; // only one sweeper per team behind the tee line
      behindUsed = true;
      out[k] = c;
    } else if (s.team === deliveringTeam) {
      out[k] = c;
    }
  }
  const c2 = cmds[2] ?? null;
  const s2 = stoneOf(c2);
  if (s2 && reachedTeeLine(s2, dir)) {
    // first privilege: the owner of the stone sweeps it if it wants to
    const ownerSweeps = s2.team === deliveringTeam && (out[0]?.stoneId === s2.id || out[1]?.stoneId === s2.id);
    if (!ownerSweeps) {
      out[2] = c2;
      if (s2.team !== deliveringTeam) {
        // the skip sweeps its own stone → the delivering team has to give way
        for (let k = 0; k < 2; k++) if (out[k]?.stoneId === s2.id) out[k] = null;
      }
    }
  }
  return out;
}
