import { DERIVED, EXECUTION, SHEET, STONE, type Difficulty } from '../physics/config';
import { deliverStone, releaseY, type Turn } from '../physics/delivery';
import { Ice, type IceOptions } from '../physics/ice';
import { Rng } from '../physics/rng';
import { hackY, HALF_WIDTH, nearHogY, teeY, type Dir } from '../physics/sheet';
import { createStone, type Stone } from '../physics/stone';
import type { SweepCommand } from '../physics/sweep';
import { World } from '../physics/world';
import { buildWeightTable, type Weight } from './weights';

export type Phase = 'aim' | 'meterWeight' | 'meterLine' | 'slide' | 'running' | 'settled' | 'endOver';

export interface GameOptions {
  seed: number;
  ice: Partial<IceOptions>;
  difficulty: Difficulty;
  /** Show the estimated unswept path while aiming. */
  preview: boolean;
  stonesPerEnd: number;
}

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  seed: 1,
  ice: {},
  difficulty: 'beginner',
  preview: true,
  stonesPerEnd: 16,
};

/** Live sweeping input of one sweeper. */
interface SweepInput {
  hold: boolean;
  /** Extra intensity from tapping rhythm, decays over time. */
  boost: number;
}

const DT = DERIVED.dt;
const HOLD_INTENSITY = 0.6;
const TAP_BOOST = 0.2;
const BOOST_DECAY = 0.8; // per second
const SETTLE_PAUSE = 1.2; // seconds before the next stone

/**
 * Game flow for single throws (phase 4: no rules yet). Pure logic – no DOM. Time advances only
 * through update(); physics always runs in fixed 1/240 s ticks, so results do not depend on the
 * frame rate, and the per-tick sweeping input is recorded for replays.
 */
export class Game {
  readonly options: GameOptions;
  readonly ice: Ice;
  readonly world: World;
  dir: Dir = 1;
  phase: Phase = 'aim';
  weights: Weight[];
  end = 1;
  /** Index of the next / current stone in this end (0…stonesPerEnd-1). */
  shot = 0;

  /** The skip's broom. */
  aimX = 0;
  aimY: number;
  turn: Turn = 'cw';
  weightIndex: number;

  /** Timing meter position -1…1 and the locked deviations. */
  meter = 0;
  weightDev = 0;
  lineDev = 0;
  private meterTime = 0;

  /** Stone being delivered (during slide and running). */
  current: Stone | null = null;
  private slideT = 0;
  private settleT = 0;
  private acc = 0;

  readonly sweepInput: SweepInput[] = [
    { hold: false, boost: 0 },
    { hold: false, boost: 0 },
  ];
  sweepSide: -1 | 0 | 1 = 0;
  /** Recorded sweeping input of the current shot, one entry per tick. */
  readonly sweepLog: (readonly (SweepCommand | null)[])[] = [];

  private previewDirty = true;
  private previewPath: number[] = [];
  private rng: Rng;

  constructor(options: Partial<GameOptions> = {}) {
    this.options = { ...DEFAULT_GAME_OPTIONS, ...options };
    this.rng = new Rng(this.options.seed);
    this.ice = new Ice({ seed: this.options.seed, ...this.options.ice });
    this.world = new World(this.ice, this.rng.nextU32());
    this.world.dir = this.dir;
    this.weights = buildWeightTable(this.ice, this.dir);
    this.weightIndex = this.weights.findIndex((w) => w.id === 'tee');
    this.aimY = teeY(this.dir);
  }

  /** Team that throws the current stone. */
  get team(): number {
    return this.shot % 2;
  }

  get weight(): Weight {
    return this.weights[this.weightIndex];
  }

  // ───────────── actions ─────────────

  /** Move the skip's broom (clamped to the playing end). */
  setAim(x: number, y: number): void {
    if (this.phase !== 'aim') return;
    const lim = HALF_WIDTH - STONE.radius;
    this.aimX = Math.max(-lim, Math.min(lim, x));
    const t = teeY(this.dir) * this.dir;
    const along = Math.max(t - SHEET.teeToHog, Math.min(t + SHEET.teeToBackLine, y * this.dir));
    this.aimY = along * this.dir;
    this.previewDirty = true;
  }

  setTurn(turn: Turn): void {
    if (this.phase !== 'aim') return;
    this.turn = turn;
    this.previewDirty = true;
  }

  changeWeight(delta: number): void {
    if (this.phase !== 'aim') return;
    this.weightIndex = Math.max(0, Math.min(this.weights.length - 1, this.weightIndex + delta));
    this.previewDirty = true;
  }

  /**
   * Main action button: start the delivery, then lock the weight meter, then the line meter.
   * Returns true if the tap was used.
   */
  tap(): boolean {
    switch (this.phase) {
      case 'aim':
        this.phase = 'meterWeight';
        this.meterTime = 0;
        this.meter = -1;
        return true;
      case 'meterWeight':
        this.weightDev = this.meter;
        this.phase = 'meterLine';
        this.meterTime = 0;
        this.meter = -1;
        return true;
      case 'meterLine':
        this.lineDev = this.meter;
        this.beginSlide();
        return true;
      case 'endOver':
        this.nextEnd();
        return true;
      default:
        return false;
    }
  }

  /** Back to aiming before the stone leaves the hack. */
  cancel(): void {
    if (this.phase === 'meterWeight' || this.phase === 'meterLine') this.phase = 'aim';
  }

  /** Sweeper starts pressing (each press also counts as a stroke for the tapping rhythm). */
  sweepDown(sweeper: number): void {
    const s = this.sweepInput[sweeper];
    if (!s) return;
    s.hold = true;
    s.boost = Math.min(1 - HOLD_INTENSITY, s.boost + TAP_BOOST);
  }

  sweepUp(sweeper: number): void {
    const s = this.sweepInput[sweeper];
    if (s) s.hold = false;
  }

  setSweepSide(side: -1 | 0 | 1): void {
    this.sweepSide = side;
  }

  /** Current intensity of a sweeper's input, 0…1. */
  sweepIntensity(sweeper: number): number {
    const s = this.sweepInput[sweeper];
    return s.hold ? Math.min(1, HOLD_INTENSITY + s.boost) : 0;
  }

  // ───────────── simulation ─────────────

  /** Advance the game by real time; physics runs in fixed ticks. */
  update(seconds: number): void {
    this.acc += Math.min(seconds, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick();
    }
  }

  private tick(): void {
    switch (this.phase) {
      case 'meterWeight':
      case 'meterLine': {
        this.meterTime += DT;
        // triangle wave -1 → 1 → -1
        const u = (this.meterTime / EXECUTION.meterPeriod) % 1;
        this.meter = u < 0.5 ? -1 + 4 * u : 3 - 4 * u;
        break;
      }
      case 'slide':
        this.tickSlide();
        break;
      case 'running':
        this.tickRunning();
        break;
      case 'settled':
        this.settleT += DT;
        if (this.settleT >= SETTLE_PAUSE) this.nextStone();
        break;
      default:
        break;
    }
  }

  /** Planned release point on the line hack → broom. */
  private releasePoint(aimX: number): { x: number; y: number } {
    const hy = hackY(this.dir);
    const ry = releaseY(this.dir);
    const t = (ry - hy) / (this.aimY - hy);
    return { x: aimX * t, y: ry };
  }

  private beginSlide(): void {
    this.phase = 'slide';
    this.slideT = 0;
    const s = createStone(this.shot, this.team, 0, hackY(this.dir) + this.dir * 0.4);
    this.world.addStone(s);
    this.current = s;
    this.sweepLog.length = 0;
  }

  private tickSlide(): void {
    const s = this.current!;
    this.slideT += DT;
    const u = Math.min(1, this.slideT / EXECUTION.slideTime);
    // ease-in: push out of the hack, then glide
    const k = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
    const diff = this.options.difficulty;
    const aimX = this.aimX + this.lineDev * EXECUTION.lineError[diff];
    const rp = this.releasePoint(aimX);
    const y0 = hackY(this.dir) + this.dir * 0.4;
    s.x = rp.x * k;
    s.y = y0 + (rp.y - y0) * k;
    s.angle += (this.turn === 'cw' ? -1 : 1) * 0.85 * DT;
    if (u >= 1) {
      const speed = this.weight.speed * (1 + this.weightDev * EXECUTION.weightError[diff]);
      const angle = s.angle;
      // replace the sliding dummy by the released stone
      this.world.stones.pop();
      const released = deliverStone(this.world, this.shot, this.team, {
        dir: this.dir,
        releaseX: rp.x,
        aimX,
        aimY: this.aimY,
        speed,
        turn: this.turn,
      });
      released.angle = angle;
      this.current = released;
      this.phase = 'running';
    }
  }

  private tickRunning(): void {
    const s = this.current!;
    for (const inp of this.sweepInput) inp.boost = Math.max(0, inp.boost - BOOST_DECAY * DT);
    let cmds: (SweepCommand | null)[] | undefined;
    const i0 = this.sweepIntensity(0);
    const i1 = this.sweepIntensity(1);
    if ((i0 > 0 || i1 > 0) && s.inPlay && s.moving) {
      cmds = [
        i0 > 0 ? { stoneId: s.id, intensity: i0, side: this.sweepSide } : null,
        i1 > 0 ? { stoneId: s.id, intensity: i1, side: this.sweepSide } : null,
      ];
    }
    this.sweepLog.push(cmds ?? []);
    this.world.step(cmds);
    if (this.world.isAtRest()) {
      this.phase = 'settled';
      this.settleT = 0;
      for (const inp of this.sweepInput) inp.boost = 0;
    }
  }

  private nextStone(): void {
    // stones that left play are taken off the sheet
    for (let i = this.world.stones.length - 1; i >= 0; i--) {
      if (!this.world.stones[i].inPlay) this.world.stones.splice(i, 1);
    }
    this.world.events.length = 0;
    this.world.sweepers.recover(30);
    this.current = null;
    this.shot++;
    this.previewDirty = true;
    this.phase = this.shot >= this.options.stonesPerEnd ? 'endOver' : 'aim';
  }

  /** Clear the sheet and play the next end in the other direction. */
  nextEnd(): void {
    this.world.stones.length = 0;
    this.world.events.length = 0;
    this.end++;
    this.shot = 0;
    this.dir = (this.dir === 1 ? -1 : 1) as Dir;
    this.world.dir = this.dir;
    this.ice.nextEnd(this.rng);
    this.world.sweepers.recover(600);
    this.weights = buildWeightTable(this.ice, this.dir);
    this.aimX = 0;
    this.aimY = teeY(this.dir);
    this.phase = 'aim';
    this.previewDirty = true;
  }

  // ───────────── info for rendering ─────────────

  /** Speed of the running stone [m/s]. */
  get speed(): number {
    const s = this.current;
    return s && this.phase === 'running' ? Math.sqrt(s.vx * s.vx + s.vy * s.vy) : 0;
  }

  /** Skip call matching the current sweeping. */
  get call(): string {
    if (this.phase !== 'running' || !this.current?.moving) return '';
    const i = Math.max(this.sweepIntensity(0), this.sweepIntensity(1));
    const both = this.sweepIntensity(0) > 0 && this.sweepIntensity(1) > 0;
    if (i >= 0.85 && both) return 'HARD!';
    if (i >= 0.85) return 'Hard!';
    if (i > 0) return both ? 'Sweep!' : 'Clean';
    return 'Off!';
  }

  /**
   * Estimated unswept path of the planned throw as [x0, y0, x1, y1, …] (beginner aid). Stops at
   * the first contact with another stone. Empty when the preview is switched off.
   */
  preview(): readonly number[] {
    if (!this.options.preview || this.phase !== 'aim') return [];
    if (!this.previewDirty) return this.previewPath;
    this.previewDirty = false;
    const w = new World(this.ice, 1);
    w.mutateIce = false;
    w.dir = this.dir;
    for (const s of this.world.stones) if (s.inPlay) w.addStone({ ...s });
    const rp = this.releasePoint(this.aimX);
    const s = deliverStone(w, -1, this.team, {
      dir: this.dir,
      releaseX: rp.x,
      aimX: this.aimX,
      aimY: this.aimY,
      speed: this.weight.speed,
      turn: this.turn,
    });
    const path = [0, hackY(this.dir), s.x, s.y];
    while (s.moving && s.inPlay && !s.hit && w.tick < 240 * 60) {
      w.step();
      if (w.tick % 24 === 0) path.push(s.x, s.y);
    }
    path.push(s.x, s.y);
    this.previewPath = path;
    return path;
  }

  /** y of the near hog line (release must happen before it). */
  get nearHog(): number {
    return nearHogY(this.dir);
  }
}
