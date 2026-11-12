import { teeY } from '../../src/physics/sheet';
import { newGame, put, runUntil, setWeight, shoot } from '../gameHelpers';

const T = teeY(1);

describe('rating of each delivery', () => {
  it('a draw to the button with an empty house is rated well', () => {
    const g = newGame();
    setWeight(g, 'tee');
    g.setAim(-0.9, T); // in-turn: curls back to the centre
    shoot(g);
    expect(g.lastRating).not.toBeNull();
    expect(g.lastRating!.team).toBe(0);
    expect(g.lastRating!.human).toBe(true);
    expect(g.lastRating!.stars).toBeGreaterThanOrEqual(2);
    expect(g.ratings).toEqual([g.lastRating!.stars]);
  });

  it('a stone that is thrown away while the opponent sits on the button is rated poorly', () => {
    const g = newGame();
    put(g, 8, 1, 0, T);
    g.shot = 10;
    setWeight(g, 'peel');
    g.setAim(1.9, T);
    shoot(g);
    expect(g.lastRating!.stars).toBeLessThanOrEqual(1);
  });

  it('taking out the opposition shot stone and staying is rated very well', () => {
    const g = newGame({ ice: { variation: false, falls: false, wear: false, endDrift: false, curl: 'straight' } });
    put(g, 8, 1, 0.3, T - 0.2);
    g.shot = 10;
    setWeight(g, 'control');
    let aim = 0.3;
    for (let i = 0; i < 6; i++) {
      g.setAim(aim, T);
      const p = g.preview();
      aim -= p[p.length - 2] - 0.3;
    }
    shoot(g);
    expect(g.world.stones.some((s) => s.id === 8 && s.inPlay)).toBe(false);
    expect(g.lastRating!.stars).toBeGreaterThanOrEqual(2);
  });

  it('every delivery gets a new rating; the AI is rated as well but not counted for the player', () => {
    const g = newGame({ players: ['human', 'ai'], aiLevel: 0 });
    shoot(g, { weight: 'top4' });
    const first = g.lastRating!.n;
    runUntil(g, () => g.team === 0 && g.phase === 'aim', 120);
    expect(g.lastRating!.n).toBe(first + 1);
    expect(g.lastRating!.human).toBe(false);
    expect(g.ratings).toHaveLength(1);
  }, 60000);
});
