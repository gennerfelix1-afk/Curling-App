import { farHogY, teeY } from '../../src/physics/sheet';
import { deliver, newGame, put, runUntil, setWeight, shoot } from '../gameHelpers';

const T = teeY(1);
const straight = { variation: false, falls: false, wear: false, endDrift: false, curl: 'straight' as const };

/** Aim so that an unswept throw of the given weight hits the point (x, y): uses the preview. */
function aimAt(g: ReturnType<typeof newGame>, x: number, weight: string): void {
  setWeight(g, weight);
  let aim = x;
  for (let i = 0; i < 6; i++) {
    g.setAim(aim, T);
    const p = g.preview();
    aim -= p[p.length - 2] - x; // correct by the lateral miss at the end of the predicted path
  }
  g.setAim(aim, T);
}

describe('hog line at the playing end', () => {
  it('a stone that stops short of the far hog line is removed', () => {
    const g = newGame();
    g.weights[g.weightIndex].speed = 1.55; // far too light
    shoot(g);
    expect(g.phase).toBe('aim');
    expect(g.world.stones).toHaveLength(0);
    expect(g.message).toMatch(/Hog Line/);
    expect(g.shot).toBe(1);
  });

  it('a short stone stays in play if it has hit another stone', () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0, farHogY(1) - 0.3); // stone lying short of the hog line (as after a collision)
    g.weights[g.weightIndex].speed = 1.9; // just enough to reach that stone
    g.shot = 6; // no FGZ protection any more
    aimAt(g, 0, g.weight.id);
    shoot(g);
    const s = g.world.stones.find((q) => q.team === g.match.teamForShot(6));
    expect(s).toBeDefined();
    expect(s!.hit).toBe(true);
    expect(s!.y).toBeLessThan(farHogY(1) + 0.1454);
  });
});

describe('free guard zone: five-rock rule', () => {
  it('removing an opposition guard before the 6th stone: delivered stone removed, guard replaced', () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0.3, T - 3);
    put(g, 9, 1, -0.8, T + 0.2);
    aimAt(g, 0.3, 'peel');
    shoot(g);
    expect(g.message).toMatch(/Free-Guard-Zone-Verstoß/);
    expect(g.phase).toBe('aim');
    const stones = g.world.stones;
    expect(stones.map((s) => s.id).sort()).toEqual([8, 9]);
    const back = stones.find((s) => s.id === 8)!;
    expect(back.x).toBe(0.3);
    expect(back.y).toBe(T - 3);
    expect(back.inPlay).toBe(true);
    expect(stones.find((s) => s.id === 9)!.x).toBe(-0.8);
    expect(g.shot).toBe(1); // the stone counts as played
    expect(g.stonesLeft(0)).toBe(7);
  });

  it('is also a violation when the guard is removed indirectly', () => {
    const g = newGame({ ice: straight });
    put(g, 0, 0, 0.3, T - 4); // own stone in front …
    put(g, 8, 1, 0.3, T - 4 + 0.6); // … is driven into the opposition guard behind it
    g.shot = 2;
    aimAt(g, 0.3, 'peel');
    shoot(g);
    expect(g.message).toMatch(/Free-Guard-Zone-Verstoß/);
    const guard = g.world.stones.find((s) => s.id === 8)!;
    expect(guard.y).toBe(T - 4 + 0.6);
    expect(g.world.stones.find((s) => s.id === 0)!.y).toBe(T - 4);
    expect(g.world.stones).toHaveLength(2);
  });

  it('from the 6th stone on guards may be removed', () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0.3, T - 3);
    g.shot = 6; // team 0 throws the 7th stone
    aimAt(g, 0.3, 'peel');
    shoot(g);
    expect(g.message).not.toMatch(/Verstoß/);
    expect(g.world.stones.some((s) => s.id === 8)).toBe(false);
  });

  it('the 5th stone is still protected, own guards and stones in the house are not', () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0.3, T - 3);
    g.shot = 4;
    aimAt(g, 0.3, 'peel');
    shoot(g);
    expect(g.message).toMatch(/Free-Guard-Zone-Verstoß/);

    const own = newGame({ ice: straight });
    put(own, 1, 0, 0.3, T - 3);
    aimAt(own, 0.3, 'peel');
    shoot(own);
    expect(own.message).not.toMatch(/Verstoß/);
    expect(own.world.stones.some((s) => s.id === 1)).toBe(false);

    const house = newGame({ ice: straight });
    put(house, 8, 1, 0.3, T - 0.5);
    aimAt(house, 0.3, 'peel');
    shoot(house);
    expect(house.message).not.toMatch(/Verstoß/);
    expect(house.world.stones.some((s) => s.id === 8)).toBe(false);
  });

  it('moving a guard without removing it is allowed (off the centre line)', () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0.8, T - 3);
    aimAt(g, 0.8, 'top4');
    shoot(g);
    expect(g.phase).toBe('aim');
    expect(g.message).not.toMatch(/Verstoß/);
    const guard = g.world.stones.find((s) => s.id === 8)!;
    expect(guard.y).toBeGreaterThan(T - 3 + 0.3);
  });
});

describe('no-tick rule', () => {
  const tick = () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0.05, T - 3.5); // centre guard
    put(g, 9, 1, 1.2, T + 0.3);
    aimAt(g, 0.27, 'top8'); // thin hit that pushes the guard sideways
    shoot(g);
    return g;
  };

  it('ticking a centre guard before the 6th stone lets the non-offending team decide', () => {
    const g = tick();
    expect(g.phase).toBe('decision');
    expect(g.decision).toMatchObject({ kind: 'noTick', team: 1 });
    const moved = g.world.stones.find((s) => s.id === 8)!;
    expect(moved.inPlay).toBe(true);
    expect(Math.abs(moved.x)).toBeGreaterThan(0.16);
    g.decide('nonsense');
    expect(g.phase).toBe('decision');
    g.decide('replace');
    runUntil(g, () => g.phase === 'aim');
    const guard = g.world.stones.find((s) => s.id === 8)!;
    expect(guard.x).toBe(0.05);
    expect(guard.y).toBe(T - 3.5);
    expect(g.world.stones.map((s) => s.id).sort()).toEqual([8, 9]);
    expect(g.message).toMatch(/No-Tick/);
    expect(g.shot).toBe(1);
  });

  it('the non-offending team may also leave the stones', () => {
    const g = tick();
    g.decide('leave');
    runUntil(g, () => g.phase === 'aim');
    expect(g.world.stones).toHaveLength(3);
    expect(Math.abs(g.world.stones.find((s) => s.id === 8)!.x)).toBeGreaterThan(0.16);
  });

  it('does not apply from the 6th stone on', () => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0.05, T - 3.5);
    g.shot = 6;
    aimAt(g, 0.27, 'top8');
    shoot(g);
    expect(g.phase).toBe('aim');
    expect(g.decision).toBeNull();
  });
});

describe('touched moving stone (R9)', () => {
  /** Hit a stone and inject a brush contact with the struck stone while it is moving. */
  const touchScenario = (sweeper: number) => {
    const g = newGame({ ice: straight });
    put(g, 8, 1, 0, T - 0.5);
    const bystander = put(g, 9, 1, 0.5, T + 0.8);
    g.shot = 6;
    aimAt(g, 0.06, 'control');
    deliver(g);
    runUntil(g, () => g.world.getStone(8)!.moving, 60);
    g.world.events.push({ type: 'touched', tick: g.world.tick, id: 8, sweeper });
    runUntil(g, () => g.phase !== 'running' && g.phase !== 'slide', 60);
    return { g, bystander };
  };

  it('touched by the delivering team in the playing end: the other team decides', () => {
    const { g } = touchScenario(0);
    expect(g.phase).toBe('decision');
    expect(g.decision).toMatchObject({ kind: 'touched', team: 1 });
    g.decide('remove');
    runUntil(g, () => g.phase === 'aim');
    expect(g.world.stones.some((s) => s.id === 8)).toBe(false);
    expect(g.message).toMatch(/Berührter Stein entfernt/);
  });

  it('"leave" keeps everything as it came to rest', () => {
    const { g } = touchScenario(1);
    const before = g.world.stones.map((s) => [s.id, s.x, s.y, s.inPlay]);
    g.decide('leave');
    expect(g.world.stones.map((s) => [s.id, s.x, s.y, s.inPlay])).toEqual(before);
  });

  it('touched by the non-delivering team: play goes on, stones stay where they end up', () => {
    const { g } = touchScenario(2);
    expect(g.phase).not.toBe('decision');
    expect(g.message).toMatch(/berührt einen laufenden Stein/);
  });

  it('touched before the far hog line: removed immediately', () => {
    const g = newGame({ ice: straight });
    g.shot = 6;
    deliver(g);
    runUntil(g, () => g.phase === 'running');
    g.update(1);
    const id = g.current!.id;
    g.world.events.push({ type: 'touched', tick: g.world.tick, id, sweeper: 0 });
    runUntil(g, () => g.phase === 'aim');
    expect(g.world.stones).toHaveLength(0);
    expect(g.message).toMatch(/Berührter Stein vor der Hog Line/);
  });
});

describe('sweeping rules in play', () => {
  it('behind the tee line only one sweeper of the team is effective; the other skip may sweep', () => {
    const g = newGame({ ice: straight });
    setWeight(g, 'back12');
    deliver(g);
    runUntil(g, () => g.phase === 'running');
    g.sweepDown(0);
    g.sweepDown(1);
    let bothBefore = false;
    let bothBehind = false;
    let skipEarly = false;
    let skipBehind = false;
    runUntil(g, () => g.phase !== 'running', 90, () => {
      const s = g.current!;
      if (!s.moving) return;
      g.sweepDown(2);
      const st = g.world.sweepers.state;
      const behind = s.y + 0.1454 >= T;
      if (!behind && s.y > 0 && st[0].down && st[1].down) bothBefore = true;
      if (behind && st[0].down && st[1].down) bothBehind = true;
      if (!behind && st[2].down) skipEarly = true;
      if (behind && (st[2].down || g.skipMaySweep)) skipBehind = true;
    });
    expect(bothBefore).toBe(true);
    expect(bothBehind).toBe(false);
    expect(skipEarly).toBe(false);
    expect(skipBehind).toBe(true);
  });

  it('the other skip can sweep a stone out of the house behind the tee line', () => {
    const run = (skip: boolean): number => {
      const g = newGame({ ice: straight });
      setWeight(g, 'back12');
      deliver(g);
      runUntil(g, () => g.phase !== 'running' && g.phase !== 'slide', 90, () => {
        if (skip) g.sweepDown(2);
      });
      const s = g.world.stones[0];
      return s ? s.y : Infinity;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 0.05);
  });
});

describe('ends, scoring, hammer', () => {
  /** Fast-forward to the last stone of the end with the given stones in the house. */
  const lastStone = (setup: (g: ReturnType<typeof newGame>) => void, o = {}) => {
    const g = newGame({ ice: straight, ...o });
    setup(g);
    g.shot = 15;
    return g;
  };

  it('scores the end, shows the measurement, passes the hammer to the other team', () => {
    const g = lastStone((q) => {
      put(q, 0, 0, 0.4, T);
      put(q, 1, 0, -0.6, T + 0.2);
      put(q, 8, 1, 0.65, T + 0.1);
    });
    expect(g.team).toBe(1); // hammer team throws the last stone
    g.weights[g.weightIndex].speed = 1.5; // throws it away (hog line)
    shoot(g);
    expect(g.phase).toBe('endScore');
    expect(g.endResult).toMatchObject({ team: 0, points: 2 });
    expect(g.endResult!.measured.map((m) => m.id)).toEqual([1, 8]); // 63.2 cm vs 65.8 cm
    expect(g.message).toBe('Rot schreibt 2.');
    g.tap();
    expect(g.phase).toBe('aim');
    expect(g.match.scores).toEqual([[2], [0]]);
    expect(g.match.hammer).toBe(1); // red scored → yellow keeps/gets the hammer
    expect(g.match.end).toBe(2);
    expect(g.team).toBe(0);
    expect(g.dir).toBe(-1);
    expect(g.world.stones).toHaveLength(0);
  });

  it('the hammer changes when the hammer team scores, and stays after a blank end', () => {
    const g = lastStone((q) => put(q, 8, 1, 0.2, T));
    g.weights[g.weightIndex].speed = 1.5;
    shoot(g);
    expect(g.endResult).toMatchObject({ team: 1, points: 1 });
    g.tap();
    expect(g.match.hammer).toBe(0);
    expect(g.team).toBe(1); // yellow now throws first

    const blank = lastStone(() => undefined);
    blank.weights[blank.weightIndex].speed = 1.5;
    shoot(blank);
    expect(blank.endResult).toMatchObject({ team: -1, points: 0 });
    expect(blank.message).toMatch(/Blank End/);
    blank.tap();
    expect(blank.match.hammer).toBe(1);
  });

  it('plays an extra end on a tie and ends the match when it is decided', () => {
    const g = lastStone((q) => put(q, 8, 1, 0.2, T), { ends: 8 });
    g.match.end = 8;
    for (let e = 0; e < 7; e++) {
      g.match.scores[0].push(e === 0 ? 1 : 0);
      g.match.scores[1].push(0);
    }
    g.weights[g.weightIndex].speed = 1.5;
    shoot(g);
    g.tap(); // 1:1 after 8 ends
    expect(g.phase).toBe('aim');
    expect(g.match.isExtraEnd).toBe(true);
    expect(g.message).toMatch(/Extra End/);
    put(g, 0, 0, 0, teeY(g.dir));
    g.shot = 15;
    g.weights[g.weightIndex].speed = 1.5;
    shoot(g);
    g.tap();
    expect(g.phase).toBe('gameOver');
    expect(g.match.winner).toBe(0);
    expect(g.message).toBe('Rot gewinnt 2:1.');
  });

  it('a team can concede at any time', () => {
    const g = newGame();
    g.concede(0);
    expect(g.phase).toBe('gameOver');
    expect(g.match.winner).toBe(1);
    expect(g.tap()).toBe(false);
  });

  it('positions: lead, second, third and skip throw two stones each', () => {
    const g = newGame();
    const seen: string[] = [];
    for (let i = 0; i < 16; i++) {
      g.shot = i;
      seen.push(g.thrower);
    }
    expect(seen.filter((p) => p === 'Lead')).toHaveLength(4);
    expect(seen.slice(12)).toEqual(['Skip', 'Skip', 'Skip', 'Skip']);
  });
});

describe('first-end hammer', () => {
  it('coin toss is decided by the seed', () => {
    const hammers = new Set<number>();
    for (let seed = 1; seed <= 8; seed++) hammers.add(newGame({ seed, hammer: 'coin' }).match.hammer);
    expect(hammers.size).toBe(2);
    expect(newGame({ seed: 4, hammer: 'coin' }).match.hammer).toBe(newGame({ seed: 4, hammer: 'coin' }).match.hammer);
  }, 20000);

  it('last stone draw: two draws per team, the smaller total gets the hammer', () => {
    const g = newGame({ hammer: 'lsd' });
    expect(g.lsd).not.toBeNull();
    const turns: string[] = [];
    const teams: number[] = [];
    for (let i = 0; i < 4; i++) {
      expect(g.phase).toBe('aim');
      teams.push(g.team);
      turns.push(g.turn);
      g.setTurn('ccw'); // ignored during the LSD
      // red draws to the button, yellow throws through the house
      setWeight(g, g.team === 0 ? 'tee' : 'board');
      g.setAim(g.turn === 'cw' ? -1.2 : 1.2, T);
      shoot(g);
      expect(g.world.stones).toHaveLength(0); // LSD stones are removed again
    }
    expect(teams).toEqual([0, 1, 0, 1]);
    expect(turns).toEqual(['cw', 'cw', 'ccw', 'ccw']);
    expect(g.lsd).toBeNull();
    expect(g.match.hammer).toBe(0);
    expect(g.message).toMatch(/Rot hat den Hammer/);
    expect(g.team).toBe(1); // yellow throws the first stone of end 1
    expect(g.shot).toBe(0);
    expect(g.match.end).toBe(1);
  });
});
