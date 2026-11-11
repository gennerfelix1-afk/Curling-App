import { CURL, DERIVED, ICE, INTEGRATION, STONE } from './config';
import { resolveCollisions, type CollisionHit } from './collision';
import { erraticFactor, RING_X, RING_Y, stoneAccel, type Accel } from './contact';
import { Ice } from './ice';
import { Rng } from './rng';
import { beyondBackLine, touchesSide, type Dir } from './sheet';
import { cloneStone, type Stone } from './stone';
import { Sweepers, type SweepCommand, type SweeperState } from './sweep';

export type PhysEvent =
  | { type: 'collision'; tick: number; a: number; b: number; impulse: number; x: number; y: number }
  | { type: 'out'; tick: number; id: number; reason: 'side' | 'back' }
  | { type: 'stop'; tick: number; id: number }
  | { type: 'touched'; tick: number; id: number; sweeper: number };

export interface WorldSnapshot {
  tick: number;
  dir: Dir;
  stones: Stone[];
  rng: [number, number, number, number];
  sweepers: SweeperState[];
}

const R = STONE.radius;
const DT = DERIVED.dt;
const WEAR_STRIDE = 3;
const acc: Accel = { fx: 0, fy: 0, cx: 0, cy: 0, alpha: 0 };
const hits: CollisionHit[] = [];

/**
 * Deterministic physics world: fixed 240 Hz timestep, substeps while stones are near contact.
 * No rendering / DOM dependencies; the same seed and inputs always give identical results.
 */
export class World {
  readonly ice: Ice;
  readonly stones: Stone[] = [];
  readonly events: PhysEvent[] = [];
  tick = 0;
  /** Direction of play (+1 = towards +y). */
  dir: Dir = 1;
  /** Sweepers of the delivering team. */
  readonly sweepers = new Sweepers();
  /** Whether this world may modify the ice: wear, sweeping, cooling (disable on a shared ice). */
  mutateIce = true;
  /** Remove stones that touch the side lines or fully cross the back line. */
  boundaries = true;
  private rng: Rng;

  constructor(ice: Ice, seed = 1) {
    this.ice = ice;
    this.rng = new Rng(seed);
  }

  addStone(s: Stone): Stone {
    this.stones.push(s);
    return s;
  }

  getStone(id: number): Stone | undefined {
    for (const s of this.stones) if (s.id === id) return s;
    return undefined;
  }

  /** True when no stone is moving. */
  isAtRest(): boolean {
    for (const s of this.stones) if (s.inPlay && s.moving) return false;
    return true;
  }

  /** Advance the simulation by one fixed tick (1/240 s), optionally with sweeping input. */
  step(sweep?: readonly (SweepCommand | null)[]): void {
    const stones = this.stones;
    if (this.mutateIce) {
      this.sweepers.apply(this, sweep);
      if (this.tick % ICE.coolStride === 0 && this.ice.hotCount > 0) this.ice.cool();
    }
    const n = this.needsSubsteps() ? INTEGRATION.contactSubsteps : 1;
    const h = DT / n;
    hits.length = 0;
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < stones.length; i++) {
        const s = stones[i];
        if (s.inPlay && s.moving) this.integrate(s, h);
      }
      resolveCollisions(stones, hits);
    }
    this.tick++;
    for (let i = 0; i < hits.length; i++) {
      const c = hits[i];
      this.events.push({ type: 'collision', tick: this.tick, a: c.a, b: c.b, impulse: c.impulse, x: c.x, y: c.y });
    }
    for (let i = 0; i < stones.length; i++) {
      const s = stones[i];
      if (!s.inPlay || !s.moving) continue;
      if (this.mutateIce && this.ice.options.wear) this.applyWear(s, i);
      if (this.boundaries) {
        const side = touchesSide(s.x);
        if (side || beyondBackLine(s.y, this.dir)) {
          s.inPlay = false;
          s.moving = false;
          s.vx = s.vy = s.omega = 0;
          this.events.push({ type: 'out', tick: this.tick, id: s.id, reason: side ? 'side' : 'back' });
          continue;
        }
      }
      if (s.vx === 0 && s.vy === 0 && s.omega === 0) {
        s.moving = false;
        this.events.push({ type: 'stop', tick: this.tick, id: s.id });
      }
    }
  }

  /** Step until everything rests (or maxTicks elapsed). Returns the number of ticks run. */
  runUntilRest(
    maxTicks = 240 * 90,
    onTick?: (w: World) => void,
    sweep?: (w: World) => readonly (SweepCommand | null)[] | undefined,
  ): number {
    let k = 0;
    while (k < maxTicks && !this.isAtRest()) {
      this.step(sweep ? sweep(this) : undefined);
      k++;
      if (onTick) onTick(this);
    }
    return k;
  }

  private needsSubsteps(): boolean {
    const stones = this.stones;
    for (let i = 0; i < stones.length; i++) {
      const a = stones[i];
      if (!a.inPlay || !a.moving) continue;
      const va = Math.abs(a.vx) + Math.abs(a.vy);
      for (let j = 0; j < stones.length; j++) {
        if (j === i) continue;
        const b = stones[j];
        if (!b.inPlay) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const reach = 2 * R + INTEGRATION.contactMargin + (va + Math.abs(b.vx) + Math.abs(b.vy)) * DT * 1.5;
        if (dx * dx + dy * dy < reach * reach) return true;
      }
    }
    return false;
  }

  private integrate(s: Stone, h: number): void {
    const erratic = erraticFactor(s.omega);
    if (erratic > 0) {
      // Ornstein–Uhlenbeck noise: stones without rotation wander unpredictably
      const k = h / CURL.noiseTau;
      s.xi += -s.xi * k + Math.sqrt(2 * k) * this.rng.gauss();
    }
    stoneAccel(s, this.ice, acc);
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const dvx = acc.fx * h;
    const dvy = acc.fy * h;
    if (speed > 0) {
      // friction cannot reverse the motion: stop when it would consume the remaining speed
      if (dvx * dvx + dvy * dvy >= speed * speed) {
        s.vx = 0;
        s.vy = 0;
      } else {
        s.vx += dvx + acc.cx * h;
        s.vy += dvy + acc.cy * h;
      }
    }
    if (s.omega !== 0) {
      const w = s.omega + acc.alpha * h;
      s.omega = w * s.omega <= 0 ? 0 : w;
    }
    s.x += s.vx * h;
    s.y += s.vy * h;
    s.angle += s.omega * h;
  }

  /** Pebble wear under the running band, proportional to the distance travelled. */
  private applyWear(s: Stone, index: number): void {
    if ((this.tick + index) % WEAR_STRIDE !== 0) return;
    const ds = Math.sqrt(s.vx * s.vx + s.vy * s.vy) * DT * WEAR_STRIDE;
    if (ds <= 0) return;
    const amount = ICE.wearRate * ds * 0.25;
    for (let i = 0; i < RING_X.length; i += 3) {
      this.ice.addWear(s.x + RING_X[i], s.y + RING_Y[i], amount);
    }
  }

  snapshot(): WorldSnapshot {
    return { tick: this.tick, dir: this.dir, stones: this.stones.map(cloneStone), rng: this.rng.getState(), sweepers: this.sweepers.getState() };
  }

  restore(snap: WorldSnapshot): void {
    this.tick = snap.tick;
    this.dir = snap.dir;
    this.stones.length = 0;
    for (const s of snap.stones) this.stones.push(cloneStone(s));
    this.rng.setState(snap.rng);
    this.sweepers.setState(snap.sweepers);
    this.events.length = 0;
  }
}
