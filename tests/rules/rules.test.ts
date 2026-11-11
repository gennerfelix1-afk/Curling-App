import { Match } from '../../src/game/match';
import { teeY } from '../../src/physics/sheet';
import { createStone, type Stone } from '../../src/physics/stone';
import {
  applySweepRules,
  biterChecks,
  fgzRuling,
  hogLineShort,
  isInFGZ,
  lsdDistance,
  protectedStones,
  releaseViolation,
  scoreEnd,
  touchesCentreLine,
} from '../../src/rules/rules';

const T = teeY(1);
const R = 0.1454;
const st = (id: number, team: number, x: number, y: number): Stone => createStone(id, team, x, y);

describe('free guard zone (R6)', () => {
  it('is the area between hog line and tee line without the house', () => {
    expect(isInFGZ({ x: 0, y: T - 3 }, 1)).toBe(true);
    expect(isInFGZ({ x: 2, y: T - 0.5 }, 1)).toBe(true); // beside the house, in front of the tee line
    expect(isInFGZ({ x: 0, y: T - 1.5 }, 1)).toBe(false); // in the house
    expect(isInFGZ({ x: 0, y: T - 1.829 - R + 0.01 }, 1)).toBe(false); // biter = in the house
    expect(isInFGZ({ x: 0, y: T - 1.829 - R - 0.01 }, 1)).toBe(true);
    expect(isInFGZ({ x: 2.1, y: T + 0.5 }, 1)).toBe(false); // behind the tee line
    // mirrored for the other direction of play
    expect(isInFGZ({ x: 0, y: -T + 3 }, -1)).toBe(true);
    expect(isInFGZ({ x: 0, y: T - 3 }, -1)).toBe(false);
  });

  it('protects only opposition stones, and only before the 6th stone of the end', () => {
    const stones = [st(8, 1, 0, T - 3), st(0, 0, 0.5, T - 4), st(9, 1, 0.3, T - 0.5)];
    expect(protectedStones(stones, 0, 1, 1)).toEqual([{ id: 8, onCentre: true }]);
    expect(protectedStones(stones, 0, 1, 5)).toHaveLength(1);
    expect(protectedStones(stones, 0, 1, 6)).toHaveLength(0);
    expect(protectedStones(stones, 1, 1, 2)).toEqual([{ id: 0, onCentre: false }]);
  });

  it('detects FGZ and no-tick violations', () => {
    const prot = [{ id: 8, onCentre: true }, { id: 9, onCentre: false }];
    const still = [st(8, 1, 0.05, T - 2.5), st(9, 1, 1.5, T - 3)];
    expect(fgzRuling(prot, still)).toBe('none'); // moved but still on the centre line
    const ticked = [st(8, 1, 0.4, T - 2.5), st(9, 1, 1, T - 3)];
    expect(fgzRuling(prot, ticked)).toBe('noTick');
    const out = [st(8, 1, 0, T - 3), st(9, 1, 1, T - 3)];
    out[1].inPlay = false;
    expect(fgzRuling(prot, out)).toBe('fgz');
    expect(fgzRuling(prot, [st(9, 1, 1, T - 3)])).toBe('fgz'); // stone gone
    // off-centre guards may be moved (not removed)
    expect(fgzRuling([{ id: 9, onCentre: false }], [st(9, 1, 2, T - 1)])).toBe('none');
  });

  it('centre line contact includes the stone radius', () => {
    expect(touchesCentreLine({ x: 0.15 })).toBe(true);
    expect(touchesCentreLine({ x: -0.16 })).toBe(false);
  });
});

describe('hog line (R5)', () => {
  it('a stone must fully cross the far hog line unless it hit another stone', () => {
    const hog = T - 6.401;
    const s = st(0, 0, 0, hog + R - 0.01);
    expect(hogLineShort(s, 1)).toBe(true);
    s.hit = true;
    expect(hogLineShort(s, 1)).toBe(false);
    expect(hogLineShort(st(0, 0, 0, hog + R + 0.01), 1)).toBe(false);
  });

  it('release must happen before the near hog line', () => {
    expect(releaseViolation(-T + 6.401 - 1.5, 1)).toBe(false);
    expect(releaseViolation(-T + 6.401 + 0.1, 1)).toBe(true);
    expect(releaseViolation(T - 6.401 + 1.5, -1)).toBe(false);
  });
});

describe('scoring', () => {
  it('blank end when no stone is in the house', () => {
    const r = scoreEnd([st(0, 0, 0, T - 3), st(8, 1, 2.2, T)], 1);
    expect(r.team).toBe(-1);
    expect(r.points).toBe(0);
  });

  it('counts every stone closer than the best opposition stone', () => {
    const stones = [st(0, 0, 0.1, T), st(1, 0, -0.5, T + 0.3), st(8, 1, 0.9, T), st(2, 0, 0, T + 1.5), st(9, 1, 0, T - 1.7)];
    const r = scoreEnd(stones, 1);
    expect(r.team).toBe(0);
    expect(r.points).toBe(2);
    expect(r.ranking.map((q) => q.id)).toEqual([0, 1, 8, 2, 9]);
  });

  it('a biter counts, a stone just outside does not', () => {
    const edge = 1.829 + R;
    expect(scoreEnd([st(8, 1, edge - 0.002, T)], 1)).toMatchObject({ team: 1, points: 1 });
    expect(scoreEnd([st(8, 1, edge + 0.002, T)], 1)).toMatchObject({ team: -1, points: 0 });
    expect(biterChecks([st(8, 1, edge + 0.002, T), st(0, 0, 0, T)], 1).map((q) => q.id)).toEqual([8]);
  });

  it('stones out of play never count; only one team scores', () => {
    const a = st(0, 0, 0, T);
    a.inPlay = false;
    const r = scoreEnd([a, st(8, 1, 0.5, T), st(9, 1, 0.8, T), st(1, 0, 1.0, T)], 1);
    expect(r).toMatchObject({ team: 1, points: 2 });
  });

  it('close decisions are flagged for the measuring device; exact ties score nothing', () => {
    const close = scoreEnd([st(0, 0, 0.5, T), st(8, 1, -0.51, T)], 1);
    expect(close).toMatchObject({ team: 0, points: 1 });
    expect(close.measured.map((q) => q.id)).toEqual([0, 8]);
    expect(scoreEnd([st(0, 0, 0.5, T), st(8, 1, -0.9, T)], 1).measured).toHaveLength(0);
    const tie = scoreEnd([st(0, 0, 0.5, T), st(8, 1, -0.5, T)], 1);
    expect(tie).toMatchObject({ team: -1, points: 0 });
  });

  it('last stone draw distance: in the house measured, otherwise 199.6 cm', () => {
    expect(lsdDistance(st(0, 0, 0.3, T + 0.4), 1)).toBeCloseTo(0.5, 6);
    expect(lsdDistance(st(0, 0, 0, T - 3), 1)).toBe(1.996);
    const out = st(0, 0, 0, T);
    out.inPlay = false;
    expect(lsdDistance(out, 1)).toBe(1.996);
  });
});

describe('sweeping rules (R8)', () => {
  const cmd = (stoneId: number) => ({ stoneId, intensity: 1, side: 0 as const });
  const own = st(0, 0, 0, 5); // delivering team's stone, between the tee lines
  const ownBehind = st(1, 0, 0, T + 0.5);
  const opp = st(8, 1, 0, 6);
  const oppBehind = st(9, 1, 0.5, T + 0.2);
  const stones = [own, ownBehind, opp, oppBehind];

  it('between the tee lines both sweepers of the delivering team may sweep their own stone', () => {
    expect(applySweepRules([cmd(0), cmd(0), null], stones, 1, 0)).toEqual([cmd(0), cmd(0), null]);
  });

  it('nobody may sweep an opposition stone in front of the tee line', () => {
    expect(applySweepRules([cmd(8), cmd(8), cmd(0)], stones, 1, 0)).toEqual([null, null, null]);
  });

  it('behind the tee line only one player per team may sweep', () => {
    expect(applySweepRules([cmd(1), cmd(1), null], stones, 1, 0)).toEqual([cmd(1), null, null]);
    // the leading edge reaching the tee line is enough
    const atTee = st(2, 0, 0, T - R + 0.001);
    expect(applySweepRules([cmd(2), cmd(2), null], [atTee], 1, 0)).toEqual([cmd(2), null, null]);
  });

  it('behind the tee line the other skip may sweep, the owner of a stone has the first privilege', () => {
    // skip sweeps the delivering team's stone out – allowed while they do not sweep it themselves
    expect(applySweepRules([null, null, cmd(1)], stones, 1, 0)).toEqual([null, null, cmd(1)]);
    expect(applySweepRules([cmd(1), null, cmd(1)], stones, 1, 0)).toEqual([cmd(1), null, null]);
    // skip sweeps its own stone: the delivering team gives way
    expect(applySweepRules([cmd(9), null, cmd(9)], stones, 1, 0)).toEqual([null, null, cmd(9)]);
    // delivering team may sweep an opposition stone behind the tee line
    expect(applySweepRules([cmd(9), null, null], stones, 1, 0)).toEqual([cmd(9), null, null]);
  });
});

describe('match: hammer, ends, extra end, concede', () => {
  it('the team without the hammer throws first; stones alternate', () => {
    const m = new Match(8, 1);
    expect(m.firstTeam).toBe(0);
    expect([0, 1, 2, 15].map((i) => m.teamForShot(i))).toEqual([0, 1, 0, 1]);
  });

  it('the scoring team gives up the hammer, a blank end keeps it', () => {
    const m = new Match(8, 1);
    m.recordEnd(1, 2);
    expect(m.hammer).toBe(0);
    m.recordEnd(-1, 0);
    expect(m.hammer).toBe(0);
    m.recordEnd(1, 1); // steal
    expect(m.hammer).toBe(0);
    m.recordEnd(0, 3);
    expect(m.hammer).toBe(1);
    expect(m.end).toBe(5);
    expect(m.total(0)).toBe(3);
    expect(m.total(1)).toBe(3);
    expect(m.scores[1]).toEqual([2, 0, 1, 0]);
  });

  it('ends after the scheduled ends, or plays extra ends on a tie', () => {
    const m = new Match(8, 0);
    for (let e = 0; e < 7; e++) m.recordEnd(-1, 0);
    expect(m.over).toBe(false);
    m.recordEnd(-1, 0);
    expect(m.over).toBe(false);
    expect(m.isExtraEnd).toBe(true);
    expect(m.hammer).toBe(0);
    m.recordEnd(-1, 0); // blank extra end → another one
    expect(m.over).toBe(false);
    m.recordEnd(1, 1);
    expect(m.over).toBe(true);
    expect(m.winner).toBe(1);

    const ten = new Match(10, 0);
    ten.recordEnd(0, 2);
    for (let e = 0; e < 8; e++) ten.recordEnd(-1, 0);
    expect(ten.over).toBe(false);
    ten.recordEnd(-1, 0);
    expect(ten).toMatchObject({ over: true, winner: 0 });
  });

  it('a team can concede', () => {
    const m = new Match(8, 0);
    m.recordEnd(0, 5);
    m.concede(1);
    expect(m).toMatchObject({ over: true, winner: 0, conceded: 1 });
  });
});
