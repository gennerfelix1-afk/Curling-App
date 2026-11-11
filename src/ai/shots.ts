import { SHEET, STONE } from '../physics/config';
import type { Turn } from '../physics/delivery';
import type { Dir } from '../physics/sheet';
import type { Stone } from '../physics/stone';
import { isInFGZ } from '../rules/rules';
import type { IceBook } from './iceBook';

export type ShotKind =
  | 'draw'
  | 'guard'
  | 'come-around'
  | 'freeze'
  | 'tap-back'
  | 'hit-and-stay'
  | 'hit-and-roll'
  | 'peel'
  | 'double'
  | 'raise'
  | 'runback'
  | 'through';

/** What the shot is supposed to do – used by the sweepers. */
export interface ShotTarget {
  /** Draws: where the stone should stop (sheet coordinates). */
  stopX?: number;
  stopY?: number;
  /** Hits: the stone to be struck first. */
  hitId?: number;
}

export interface Shot {
  kind: ShotKind;
  label: string;
  turn: Turn;
  /** Release speed [m/s]. */
  speed: number;
  /** The skip's broom (sheet coordinates). */
  aimX: number;
  aimY: number;
  target: ShotTarget;
}

const R = STONE.radius;
const T = SHEET.teeToTee / 2;

/**
 * All sensible shots in the given position. Geometry is done in the thrower's frame
 * (x to the right, "along" in the direction of play) and converted back to sheet coordinates.
 */
export function generateShots(book: IceBook, stones: readonly Stone[], team: number, shotIndex: number): Shot[] {
  const dir: Dir = book.dir;
  const out: Shot[] = [];
  const release = -(T + SHEET.teeToHack) + book.hackToRelease;
  const loc = stones.filter((s) => s.inPlay).map((s) => ({ s, x: s.x * dir, a: s.y * dir, mine: s.team === team }));
  const turns: Turn[] = ['cw', 'ccw'];

  const draw = (kind: ShotKind, label: string, x: number, a: number): void => {
    const speed = book.speedForDistance(a - release);
    for (const turn of turns) {
      const aim = book.broomFor(speed, turn === 'cw', x, a);
      if (Math.abs(aim) > 2.1) continue;
      out.push({ kind, label, turn, speed, aimX: aim * dir, aimY: T * dir, target: { stopX: x * dir, stopY: a * dir } });
    }
  };
  /** Strike `st` so that the shooter's centre is `offset` to the side of its centre at contact. */
  const hit = (kind: ShotKind, label: string, st: (typeof loc)[number], offset: number, speed: number): void => {
    const contact = st.a - Math.sqrt(Math.max(0, 4 * R * R - offset * offset));
    for (const turn of turns) {
      const aim = book.broomFor(speed, turn === 'cw', st.x + offset, contact);
      if (Math.abs(aim) > 2.2) continue;
      out.push({ kind, label, turn, speed, aimX: aim * dir, aimY: T * dir, target: { hitId: st.s.id } });
    }
  };

  const hack = book.speedForDistance(book.toTee + SHEET.teeToHack);
  const control = book.speedForHogTime(10.8);
  const normal = book.speedForHogTime(9.6);
  const peel = book.speedForHogTime(8.4);

  // draws into the house
  draw('draw', 'Draw auf den Button', 0, T);
  draw('draw', 'Draw Top 4', 0.45, T - 0.35);
  draw('draw', 'Draw Top 4', -0.45, T - 0.35);
  draw('draw', 'Draw 8-Fuß', 1.0, T);
  draw('draw', 'Draw 8-Fuß', -1.0, T);
  draw('draw', 'Draw Top 12', 0, T - 1.45);

  // guards (useful while there are stones left to play behind them)
  if (shotIndex < 12) {
    draw('guard', 'Centre Guard', 0, T - 3.2);
    draw('guard', 'Tight Centre Guard', 0, T - 2.5);
    draw('guard', 'Corner Guard', 1.15, T - 3.0);
    draw('guard', 'Corner Guard', -1.15, T - 3.0);
  }

  const house = SHEET.houseRadii[0] + R;
  for (const st of loc) {
    const dist = Math.sqrt(st.x * st.x + (st.a - T) * (st.a - T));
    const inHouse = dist <= house;
    const guard = isInFGZ(st.s, dir);
    if (!st.mine) {
      if (inHouse) {
        draw('freeze', 'Freeze', st.x, st.a - 2 * R - 0.03);
        hit('hit-and-stay', 'Hit and Stay', st, 0, normal);
        hit('hit-and-stay', 'Hit (Control)', st, 0, control);
        hit('hit-and-roll', 'Hit and Roll', st, 0.15, normal);
        hit('hit-and-roll', 'Hit and Roll', st, -0.15, normal);
        if (st.a < T + 0.3) hit('tap-back', 'Tap-back', st, 0, hack);
      } else if (guard) {
        hit('peel', 'Peel', st, 0.11, peel);
        hit('peel', 'Peel', st, -0.11, peel);
        draw('come-around', 'Come-around', st.x, T - 0.25);
      } else {
        hit('hit-and-stay', 'Hit', st, 0, normal);
      }
    } else if (guard) {
      draw('come-around', 'Come-around', st.x, T - 0.25);
      if (Math.abs(st.x) < 1.2) {
        // promote the own guard into the house: nose hit with a bit more than draw weight
        hit('raise', 'Raise', st, 0, book.speedForDistance(T + 0.7 - release));
      }
    } else if (inHouse && st.a < T + 0.6 && shotIndex < 13) {
      // protect the own stone in the house
      draw('guard', 'Guard vor eigenem Stein', st.x, Math.min(T - 2.3, st.a - 1.6));
    }
    // drive this stone into an opposition stone behind it: double / runback
    for (const b of loc) {
      if (b === st || b.mine) continue;
      const dx = b.x - st.x;
      const da = b.a - st.a;
      const d = Math.sqrt(dx * dx + da * da);
      if (da < 0.35 || d > 4 || da / d < 0.55) continue;
      const offset = (-dx / d) * 2 * R;
      if (st.mine) hit('runback', 'Runback', st, offset, normal);
      else {
        hit('double', 'Double Takeout', st, offset, normal);
        hit('double', 'Double Takeout', st, offset, peel);
      }
    }
    // classic double: hit this stone on the side so that the shooter carries on into a second one.
    // The shooter leaves the contact at right angles to the line of centres n, so n must satisfy
    // (B − A)·n = −2R.
    if (!st.mine) {
      for (const b of loc) {
        if (b === st || b.mine) continue;
        const dx = b.x - st.x;
        const da = b.a - st.a;
        const d = Math.sqrt(dx * dx + da * da);
        if (d < 2 * R + 0.02 || d > 3 || da < -0.2) continue;
        const c = (-2 * R) / d;
        const sn = Math.sqrt(1 - c * c);
        for (const sign of [-1, 1]) {
          // n = cos φ · u + sin φ · u⊥ with u = (B − A)/d
          const nx = (c * dx - sign * sn * da) / d;
          const na = (c * da + sign * sn * dx) / d;
          if (na < 0.2) continue; // the first stone has to be pushed forward
          hit('double', 'Double Takeout', st, -nx * 2 * R, peel);
          hit('double', 'Double Takeout', st, -nx * 2 * R, normal);
        }
      }
    }
  }

  // throw the stone away (e.g. to blank the end): through the emptier side
  let right = 0;
  for (const st of loc) if (st.x > 0) right++;
  const side = right * 2 > loc.length ? -1 : 1;
  out.push({ kind: 'through', label: 'Durchspielen', turn: side > 0 ? 'ccw' : 'cw', speed: peel, aimX: side * 1.75 * dir, aimY: T * dir, target: {} });
  return out;
}
