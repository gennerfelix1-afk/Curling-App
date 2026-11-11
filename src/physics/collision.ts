import { COLLISION, STONE } from './config';
import type { Stone } from './stone';

const R = STONE.radius;
const INV_M = 1 / STONE.mass;
const INV_I = 1 / (STONE.inertiaFactor * STONE.mass * R * R);

export interface CollisionHit {
  a: number;
  b: number;
  /** Normal impulse [N·s]. */
  impulse: number;
  x: number;
  y: number;
}

/**
 * Impulse-based stone–stone collisions (equal masses) with restitution and Coulomb friction
 * between the striking bands (spin transfer + slight throw). Sequential impulses handle
 * simultaneous contacts (chains, raises, frozen stones).
 */
export function resolveCollisions(stones: Stone[], hits: CollisionHit[]): void {
  const n = stones.length;
  for (let iter = 0; iter < COLLISION.iterations; iter++) {
    let any = false;
    for (let i = 0; i < n; i++) {
      const a = stones[i];
      if (!a.inPlay) continue;
      for (let j = i + 1; j < n; j++) {
        const b = stones[j];
        if (!b.inPlay || (!a.moving && !b.moving)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        // positional correction: separate the stones
        const half = (2 * R - d) / 2;
        a.x -= nx * half;
        a.y -= ny * half;
        b.x += nx * half;
        b.y += ny * half;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        any = true;
        const jn = (-(1 + COLLISION.restitution) * vn) / (2 * INV_M);
        // tangential relative velocity at the contact point incl. rotation
        const tx = -ny;
        const ty = nx;
        const vt = rvx * tx + rvy * ty - R * (a.omega + b.omega);
        let jt = -vt / (2 * INV_M + 2 * R * R * INV_I);
        const maxT = COLLISION.stoneFriction * jn;
        if (jt > maxT) jt = maxT;
        else if (jt < -maxT) jt = -maxT;
        const px = jn * nx + jt * tx;
        const py = jn * ny + jt * ty;
        a.vx -= px * INV_M;
        a.vy -= py * INV_M;
        b.vx += px * INV_M;
        b.vy += py * INV_M;
        a.omega -= R * jt * INV_I;
        b.omega -= R * jt * INV_I;
        a.moving = true;
        b.moving = true;
        a.hit = true;
        b.hit = true;
        let rec: CollisionHit | undefined;
        for (let k = 0; k < hits.length; k++) {
          if (hits[k].a === a.id && hits[k].b === b.id) rec = hits[k];
        }
        if (rec) rec.impulse += jn;
        else hits.push({ a: a.id, b: b.id, impulse: jn, x: a.x + nx * R, y: a.y + ny * R });
      }
    }
    if (!any) break;
  }
}
