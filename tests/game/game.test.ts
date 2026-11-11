import { Game } from '../../src/game/game';
import { buildWeightTable } from '../../src/game/weights';
import { hogToHogTime } from '../../src/physics/delivery';
import { Ice } from '../../src/physics/ice';
import { distToTee, hackY, nearHogY, teeY } from '../../src/physics/sheet';
import { deliver, runUntil, CLEAN } from '../gameHelpers';
import { cleanIce, throwStone } from '../helpers';

const clean = CLEAN;

describe('weight table', () => {
  const ice = cleanIce();
  const table = buildWeightTable(ice, 1);
  const by = (id: string) => table.find((w) => w.id === id)!;

  it('contains the weights in curling language, ordered from light to heavy', () => {
    expect(table.map((w) => w.id)).toEqual([
      'guard', 'top12', 'top8', 'top4', 'tee', 'back4', 'back8', 'back12', 'hack', 'board', 'control', 'normal', 'peel',
    ]);
    for (let i = 1; i < table.length; i++) expect(table[i].speed).toBeGreaterThan(table[i - 1].speed);
  });

  it('draw weights stop where they say (within 10 cm, unswept, centre line)', () => {
    for (const [id, offset] of [['guard', -3.2], ['top8', -1.0], ['tee', 0], ['back4', 0.45]] as const) {
      const r = throwStone(ice, { speed: by(id).speed, noBoundaries: true });
      expect(Math.abs(r.stone.y - (teeY(1) + offset))).toBeLessThan(0.1);
    }
  });

  it('hit weights have the defined hog-to-hog times', () => {
    const line = { dir: 1 as const, releaseX: 0, aimX: 0, aimY: teeY(1), turn: 'cw' as const };
    expect(hogToHogTime(ice, { ...line, speed: by('normal').speed })).toBeCloseTo(9.6, 1);
    expect(hogToHogTime(ice, { ...line, speed: by('peel').speed })).toBeCloseTo(8.4, 1);
  });

  it('works in both directions of play', () => {
    const other = buildWeightTable(ice, -1);
    expect(other[4].speed).toBeCloseTo(by('tee').speed, 3);
  });

  it('adapts to the ice', () => {
    const keen = buildWeightTable(new Ice({ ...clean, speed: 'keen' }), 1);
    expect(keen[4].speed).toBeLessThan(by('tee').speed - 0.05);
  });
});

describe('game flow (single throws)', () => {
  it('a perfectly executed tee draw goes through all phases and stops near the tee line', () => {
    const g = new Game({ seed: 3, ice: clean, hammer: 1 });
    expect(g.phase).toBe('aim');
    expect(g.weight.id).toBe('tee');
    deliver(g);
    expect(g.phase).toBe('slide');
    const stone = g.current!;
    expect(stone.y).toBeCloseTo(hackY(1) + 0.4, 1);
    runUntil(g, () => g.phase === 'running');
    const s = g.current!;
    expect(s.y).toBeLessThan(nearHogY(1)); // released before the near hog line
    expect(s.omega).toBeLessThan(0); // in-turn = clockwise
    runUntil(g, () => g.phase === 'settled');
    expect(Math.abs(s.y - teeY(1))).toBeLessThan(0.25);
    expect(s.x).toBeGreaterThan(0.8); // curled to the right
    runUntil(g, () => g.phase === 'aim');
    expect(g.shot).toBe(1);
    expect(g.team).toBe(1);
    expect(g.world.stones.length).toBe(1);
  });

  it('sweeping carries the stone further and straighter; taps raise the intensity', () => {
    const play = (sweep: boolean): { x: number; y: number } => {
      const g = new Game({ seed: 3, ice: clean, hammer: 1 });
      g.changeWeight(-2); // top 8
      deliver(g);
      runUntil(g, () => g.phase === 'running');
      let n = 0;
      runUntil(g, () => g.phase === 'settled', 90, () => {
        if (!sweep) return;
        // tap both pads in a fast rhythm
        n++;
        const k = n % 12 < 9;
        if (k) {
          if (!g.sweepInput[0].hold) { g.sweepDown(0); g.sweepDown(1); }
        } else { g.sweepUp(0); g.sweepUp(1); }
      });
      return { x: g.current!.x, y: g.current!.y };
    };
    const off = play(false);
    const on = play(true);
    expect(on.y - off.y).toBeGreaterThan(1.2);
    expect(on.x).toBeLessThan(off.x * 0.9);

    const g = new Game({ seed: 3, ice: clean, hammer: 1 });
    g.sweepDown(0);
    expect(g.sweepIntensity(0)).toBeCloseTo(0.8, 5);
    g.sweepUp(0);
    expect(g.sweepIntensity(0)).toBe(0);
    g.sweepDown(0);
    expect(g.sweepIntensity(0)).toBe(1);
  });

  it('meter errors change weight and line', () => {
    const play = (wd: number, ld: number): { x: number; y: number } => {
      const g = new Game({ seed: 3, ice: clean, difficulty: 'pro', hammer: 1 });
      deliver(g, wd, ld);
      runUntil(g, () => g.phase === 'settled');
      return { x: g.current!.x, y: g.current!.y };
    };
    const good = play(0, 0);
    const light = play(-0.8, 0);
    const wide = play(0, 0.8);
    expect(light.y).toBeLessThan(good.y - 0.8);
    expect(wide.x).toBeGreaterThan(good.x + 0.25);
  });

  it('the preview shows the unswept path and matches the real throw', () => {
    const g = new Game({ seed: 5, ice: clean, hammer: 1 });
    g.setAim(-0.6, teeY(1));
    g.setTurn('ccw');
    const p = g.preview();
    expect(p.length).toBeGreaterThan(40);
    const px = p[p.length - 2];
    const py = p[p.length - 1];
    deliver(g);
    runUntil(g, () => g.phase === 'settled');
    expect(Math.hypot(g.current!.x - px, g.current!.y - py)).toBeLessThan(0.15);
    // pro difficulty hides the preview
    expect(new Game({ seed: 5, preview: false }).preview()).toEqual([]);
  });

  it('is deterministic and independent of the frame rate', () => {
    const play = (fps: number): string => {
      const g = new Game({ seed: 11, hammer: 1 });
      g.setAim(0.4, teeY(1) - 1);
      g.changeWeight(1);
      g.tap();
      for (let i = 0; i < 100; i++) g.update(1 / 240); // exact meter timing
      g.tap();
      for (let i = 0; i < 70; i++) g.update(1 / 240);
      g.tap();
      let frames = 0;
      while (g.phase !== 'settled' && frames < 90 * fps) {
        g.update(1 / fps);
        frames++;
      }
      return `${g.current!.x},${g.current!.y},${g.current!.angle}`;
    };
    // 60 and 120 fps frame times are multiples of the 240 Hz tick in binary floating point
    expect(play(60)).toBe(play(120));
    expect(play(60)).toBe(play(60));
  });

  it('plays a whole end: 16 stones alternate, takeouts remove stones, next end flips direction', () => {
    const g = new Game({ seed: 7, hammer: 1 });
    for (let i = 0; i < 16; i++) {
      expect(g.phase).toBe('aim');
      expect(g.team).toBe(i % 2);
      expect(g.stonesLeft(0) + g.stonesLeft(1)).toBe(16 - i);
      if (i % 4 === 3) g.changeWeight(8); // a hit now and then
      g.setAim(((i * 37) % 11) / 10 - 0.5, teeY(1));
      g.setTurn(i % 3 === 0 ? 'ccw' : 'cw');
      deliver(g);
      runUntil(g, () => g.phase === 'settled');
      runUntil(g, () => g.phase === 'aim' || g.phase === 'endScore' || g.phase === 'decision');
      if (g.phase === 'decision') { g.decide('leave'); runUntil(g, () => g.phase === 'aim' || g.phase === 'endScore'); }
    }
    expect(g.phase).toBe('endScore');
    expect(g.world.stones.every((s) => s.inPlay)).toBe(true);
    expect(g.world.stones.length).toBeLessThanOrEqual(16);
    void distToTee;
    g.tap();
    expect(g.phase).toBe('aim');
    expect(g.dir).toBe(-1);
    expect(g.end).toBe(2);
    expect(g.world.stones.length).toBe(0);
    expect(g.aimY).toBe(teeY(-1));
    // throw towards the other end works as well
    g.changeWeight(-99);
    g.changeWeight(3); // top 4: clears the hog line for sure
    g.setTurn('cw');
    const thrower = g.team;
    deliver(g);
    runUntil(g, () => g.phase === 'settled');
    expect(thrower).toBe(g.match.firstTeam);
    expect(Math.abs(g.current!.y - teeY(-1))).toBeLessThan(1.2);
    expect(g.current!.x).toBeLessThan(0); // in-turn curls to the thrower's right = -x when playing towards -y
  });

  it('aim is clamped to the playing end and locked during the delivery', () => {
    const g = new Game({ seed: 1, ice: clean, hammer: 1 });
    g.setAim(99, -99);
    expect(g.aimX).toBeLessThan(2.3);
    expect(g.aimY).toBeCloseTo(teeY(1) - 6.401, 3);
    g.tap();
    g.setAim(0, teeY(1));
    expect(g.aimX).toBeGreaterThan(2);
    g.cancel();
    expect(g.phase).toBe('aim');
  });
});
