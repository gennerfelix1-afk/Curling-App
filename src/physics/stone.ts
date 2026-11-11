export interface Stone {
  id: number;
  /** Team index (0 or 1). */
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Handle angle [rad], for rendering. */
  angle: number;
  /** Angular velocity [rad/s]; > 0 = counter-clockwise seen from above (curls left). */
  omega: number;
  inPlay: boolean;
  moving: boolean;
  /** State of the erratic-curl noise process. */
  xi: number;
  /** Has collided with another stone since the flag was last cleared (hog line rule). */
  hit: boolean;
}

export function createStone(id: number, team: number, x: number, y: number): Stone {
  return { id, team, x, y, vx: 0, vy: 0, angle: 0, omega: 0, inPlay: true, moving: false, xi: 0, hit: false };
}

export function cloneStone(s: Stone): Stone {
  return { ...s };
}
