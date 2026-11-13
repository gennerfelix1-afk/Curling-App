import { SHEET, STONE } from '../physics/config';
import { distToTee, inHouse, teeY, type Dir } from '../physics/sheet';
import type { Stone } from '../physics/stone';
import { isInFGZ, scoreEnd } from '../rules/rules';

export interface Situation {
  dir: Dir;
  /** Team whose point of view is evaluated. */
  me: number;
  /** Team with the last stone in this end. */
  hammer: number;
  /** Stones still to be played in this end after the position is reached. */
  stonesLeft: number;
  /** Score difference before this end (me − opponent). */
  scoreDiff: number;
  /** Scheduled ends remaining after this one (0 = last end or extra end). */
  endsLeft: number;
}

/**
 * How good is it to finish an end with `r` points (negative = opponent scores)?
 * With the hammer you want two or more, or a blank to keep it; a single point gives the hammer
 * away. Without it, a steal is great and forcing the opponent to one is fine.
 */
export function endUtility(r: number, haveHammer: boolean, scoreDiff: number, endsLeft: number): number {
  if (endsLeft === 0) {
    // last end: only the result of the match counts
    const diff = scoreDiff + r;
    if (diff > 0) return 4 + Math.min(diff, 3) * 0.05;
    if (diff < 0) return -4 + Math.max(diff, -3) * 0.05;
    // tie → extra end; who has the hammer there?
    const hammerNext = r > 0 ? false : r < 0 ? true : haveHammer;
    return hammerNext ? 1.2 : -1.2;
  }
  if (haveHammer) {
    if (r >= 2) return r;
    if (r === 1) return 0.4;
    if (r === 0) return 0.75;
    if (r === -1) return -1.6;
    return r - 0.8;
  }
  if (r >= 1) return r + 0.8;
  if (r === 0) return -0.75;
  if (r === -1) return -0.4;
  return r;
}

/** A stone lies in front of `s` and covers it from a straight hit. */
function covered(s: Stone, stones: readonly Stone[], dir: Dir): boolean {
  for (const g of stones) {
    if (g === s || !g.inPlay) continue;
    if ((s.y - g.y) * dir > 0.6 && Math.abs(g.x - s.x) < 0.24) return true;
  }
  return false;
}

/** Heuristic value of a position from the point of view of `sit.me` (higher = better). */
export function evaluate(stones: readonly Stone[], sit: Situation): number {
  const { dir, me } = sit;
  const haveHammer = sit.hammer === me;
  const sc = scoreEnd(stones, dir);
  const r = sc.team < 0 ? 0 : sc.team === me ? sc.points : -sc.points;
  // early in the end the current count means little – it is decided by the last stones
  const played = Math.max(0, Math.min(1, 1 - sit.stonesLeft / 15));
  const certainty = 0.15 + 0.85 * played * Math.sqrt(played);
  let v = endUtility(r, haveHammer, sit.scoreDiff, sit.endsLeft) * certainty;
  if (sit.stonesLeft === 0) return v;

  const edge = SHEET.houseRadii[0] + STONE.radius;
  const early = sit.stonesLeft > 8 ? 1 : sit.stonesLeft > 4 ? 0.5 : 0.2;
  let inPlay = 0;
  for (const s of stones) {
    if (!s.inPlay) continue;
    inPlay++;
    const mine = s.team === me ? 1 : -1;
    if (inHouse(s.x, s.y, dir)) {
      // an open stone is an easy target while the opponent still has stones to play
      const safe = covered(s, stones, dir) ? 1 : 0.4;
      v += mine * 0.18 * safe * (1 - distToTee(s.x, s.y, dir) / edge);
    } else if (isInFGZ(s, dir)) {
      // centre guards help the team without the hammer, corner guards the team with it
      if (Math.abs(s.x) < 0.45) v += (haveHammer ? -1 : 1) * 0.5 * early;
      else v += (haveHammer ? 1 : -1) * 0.2 * early;
    } else if ((s.y - teeY(dir)) * dir > 0) {
      v += mine * 0.02; // behind the house: a possible backing
    }
  }
  // the stone that currently counts is worth more when it is hard to hit
  if (sc.ranking.length > 0) {
    const shot = stones.find((q) => q.id === sc.ranking[0].id)!;
    if (covered(shot, stones, dir)) v += (shot.team === me ? 1 : -1) * 0.3;
  }
  // ahead: keep it simple; behind: keep stones in play
  if (sit.scoreDiff >= 2) v -= 0.04 * inPlay;
  else if (sit.scoreDiff <= -2) v += 0.03 * inPlay;
  return v;
}
