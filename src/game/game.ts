import { DERIVED, EXECUTION, RULES, SHEET, STONE, type Difficulty } from '../physics/config';
import { deliverStone, releaseY, type DeliveryParams, type Turn } from '../physics/delivery';
import { Ice, type IceOptions } from '../physics/ice';
import { Rng } from '../physics/rng';
import { clearedFarHog, hackY, HALF_WIDTH, nearHogY, teeY, type Dir } from '../physics/sheet';
import { cloneStone, createStone, type Stone } from '../physics/stone';
import type { SweepCommand } from '../physics/sweep';
import { World, type WorldSnapshot } from '../physics/world';
import {
  applySweepRules,
  fgzRuling,
  hogLineShort,
  lsdDistance,
  protectedStones,
  reachedTeeLine,
  releaseViolation,
  scoreEnd,
  type EndScore,
  type ProtectedStone,
} from '../rules/rules';
import { IceBook } from '../ai/iceBook';
import { AI_LEVELS, LIGHT_BIAS, Planner } from '../ai/planner';
import type { Shot, ShotTarget } from '../ai/shots';
import { CALL_INTENSITY, CALL_TEXT, SweepAdvisor, type SweepCall } from '../ai/sweepAdvisor';
import { Match, POSITIONS } from './match';
import { weightsFromBook, type Weight } from './weights';

export type Phase =
  | 'aim'
  | 'aiThink'
  | 'meterWeight'
  | 'meterLine'
  | 'gesture'
  | 'slide'
  | 'running'
  | 'decision'
  | 'settled'
  | 'endScore'
  | 'gameOver'
  | 'replay';

/** Everything needed to re-simulate a delivery exactly (deterministic replay). */
export interface ShotRecord {
  ice: Ice;
  snapshot: WorldSnapshot;
  params: DeliveryParams;
  id: number;
  team: number;
  angle: number;
  /** Sweeping input per tick, after the sweeping rules. */
  sweep: (readonly (SweepCommand | null)[])[];
  label: string;
}

export interface ReplayState {
  record: ShotRecord;
  world: World;
  stone: Stone;
  tick: number;
  /** Ticks at which stones collide (slow motion around them). */
  collisions: number[];
  /** Slow motion forced by the viewer. */
  slow: boolean;
  /** Seconds since everything came to rest. */
  restT: number;
  returnPhase: Phase;
}

export const TEAM_NAMES = ['Rot', 'Gelb'] as const;

/** A choice the non-offending team has to make after a rule violation. */
export interface Decision {
  kind: 'noTick' | 'touched';
  /** Team that decides. */
  team: number;
  text: string;
  options: { id: string; label: string }[];
}

interface TouchInfo {
  stoneId: number;
  offender: number;
  /** All stones at the moment of the touch. */
  stones: Stone[];
}

interface LsdState {
  /** Recorded distances per team [m]. */
  dist: [number[], number[]];
  index: number;
}

export interface GameOptions {
  seed: number;
  ice: Partial<IceOptions>;
  difficulty: Difficulty;
  /** Show the estimated unswept path while aiming. */
  preview: boolean;
  /** Scheduled ends (8 or 10); extra ends follow on a tie. */
  ends: number;
  /** First-end hammer: coin toss, last stone draw, or a fixed team. */
  hammer: 'coin' | 'lsd' | 0 | 1;
  /** Treat brush contact with a moving stone as a touched stone (R9). */
  touchRule: boolean;
  /** Delivery mechanic: timing meters or a swipe gesture. */
  delivery: 'meter' | 'gesture';
  /** Who controls each team. */
  players: ['human' | 'ai', 'human' | 'ai'];
  /** Strength of the AI, index into AI_LEVELS (0…3). */
  aiLevel: number;
  /**
   * Sweeping of human teams: 'manual' = the player sweeps, 'calls' = AI team-mates sweep on the
   * player's calls (hard / clean / off), 'auto' = AI team-mates sweep on the skip's judgement.
   */
  sweepMode: 'manual' | 'calls' | 'auto';
  /** Training drill instead of a match. */
  drill: DrillKind | null;
}

export type DrillKind = 'draw' | 'takeout' | 'ice';

export interface DrillState {
  kind: DrillKind;
  /** Result of each attempt: distance to the tee [m] (draw, ice) or points (takeout). */
  results: number[];
  attempts: number;
}

export const DRILL_ATTEMPTS = 8;

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  seed: 1,
  ice: {},
  difficulty: 'beginner',
  preview: true,
  ends: 8,
  hammer: 'coin',
  touchRule: true,
  delivery: 'meter',
  players: ['human', 'human'],
  aiLevel: 1,
  sweepMode: 'manual',
  drill: null,
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
  /** Progress of the stone along the slide path: 0 = hack, 1 = near hog line. */
  private slideU = 0;
  private slideFrom = 0;
  /** Swipe gesture state (phase 'gesture'). */
  private gesture = { progress: 0, slope: 0, ticks: 0, started: false };
  private settleT = 0;
  private acc = 0;

  /** Sweeping input: 0, 1 = sweepers of the delivering team, 2 = skip of the other team. */
  readonly sweepInput: SweepInput[] = [
    { hold: false, boost: 0 },
    { hold: false, boost: 0 },
    { hold: false, boost: 0 },
  ];
  sweepSide: -1 | 0 | 1 = 0;
  /** Recorded sweeping input of the current shot, one entry per tick. */
  readonly sweepLog: (readonly (SweepCommand | null)[])[] = [];

  readonly match: Match;
  readonly stonesPerEnd = RULES.stonesPerTeam * 2;
  /** Last stone draw in progress (before the first end). */
  lsd: LsdState | null = null;
  /** Result of the end that was just completed (phase 'endScore'). */
  endResult: EndScore | null = null;
  /** Pending choice of the non-offending team (phase 'decision'). */
  decision: Decision | null = null;
  /** Latest ruling / info text for the players, with its age in seconds. */
  message = '';
  messageAge = 0;

  /** Book on the current ice (weights, curl) for the current direction of play. */
  book: IceBook;
  /** Training drill in progress. */
  drill: DrillState | null = null;
  /** Call for AI team-mates in sweep mode 'calls'. */
  sweepCall: SweepCall = 'off';
  /** The skip's current call for the running stone. */
  advice: SweepCall = 'off';
  /** Shot the AI is going to play (for the display). */
  aiShot: Shot | null = null;
  private planner: Planner | null = null;
  /** Shot fixed without a search (last stone draw). */
  private planned_: Shot | null = null;
  private thinkT = 0;
  /** Exact execution of an AI delivery: speed and line error at the broom. */
  private aiExec: { speed: number; aimOffset: number } | null = null;
  private advisor: SweepAdvisor | null = null;
  private decisionT = 0;

  /** The last deliveries, newest last (for replays). */
  readonly history: ShotRecord[] = [];
  /** Replay in progress (phase 'replay'). */
  replay: ReplayState | null = null;
  private recording: ShotRecord | null = null;
  private replayAcc = 0;

  private beforeShot: Stone[] = [];
  private protectedNow: ProtectedStone[] = [];
  private touch: TouchInfo | null = null;
  private eventCursor = 0;
  private afterDecision: ((choice: string) => void) | null = null;

  private previewDirty = true;
  private plan: { path: number[]; hitId: number } = { path: [], hitId: -1 };
  private rng: Rng;

  constructor(options: Partial<GameOptions> = {}) {
    this.options = { ...DEFAULT_GAME_OPTIONS, ...options };
    this.rng = new Rng(this.options.seed);
    let iceOptions = { seed: this.options.seed, ...this.options.ice };
    if (this.options.drill === 'ice') {
      // unknown ice: speed and curl are drawn at random and have to be found out
      const pick = new Rng(this.options.seed ^ 0x51f15e);
      const speeds = ['keen', 'normal', 'heavy'] as const;
      const curls = ['straight', 'normal', 'swingy'] as const;
      iceOptions = { ...iceOptions, speed: speeds[pick.nextU32() % 3], curl: curls[pick.nextU32() % 3] };
      this.options.preview = false;
    }
    this.ice = new Ice(iceOptions);
    this.world = new World(this.ice, this.rng.nextU32());
    this.world.dir = this.dir;
    this.book = new IceBook(this.bookIce(), this.dir);
    this.weights = weightsFromBook(this.book);
    this.weightIndex = this.weights.findIndex((w) => w.id === 'tee');
    this.aimY = teeY(this.dir);
    const h = this.options.drill ? 1 : this.options.hammer;
    let hammer: number;
    if (this.options.drill) {
      this.drill = { kind: this.options.drill, results: [], attempts: DRILL_ATTEMPTS };
      this.options.players = ['human', 'human'];
      this.setupDrill();
    }
    if (h === 'lsd') {
      hammer = 0;
      this.lsd = { dist: [[], []], index: 0 };
      this.turn = 'cw';
      this.say('Last Stone Draw: je zwei Steine auf den Button – die kleinere Summe bekommt den Hammer.');
    } else if (h === 'coin') {
      hammer = this.rng.nextU32() & 1;
      this.say(`Münzwurf: ${TEAM_NAMES[hammer]} hat den Hammer.`);
    } else {
      hammer = h;
    }
    this.match = new Match(this.options.ends, hammer);
  }

  /**
   * Ice the weight book is measured on. In the "read the ice" drill the book is from standard
   * ice – the player has to find out how the real ice differs.
   */
  private bookIce(): Ice {
    if (this.options.drill !== 'ice') return this.ice;
    return new Ice({ seed: 1, variation: false, falls: false, wear: false, endDrift: false });
  }

  isAI(team: number): boolean {
    return this.options.players[team] === 'ai';
  }

  private say(text: string): void {
    this.message = text;
    this.messageAge = 0;
  }

  /** Team that throws the current stone. */
  get team(): number {
    if (this.drill) return 0;
    if (this.lsd) return this.lsd.index % 2;
    return this.match.teamForShot(Math.min(this.shot, this.stonesPerEnd - 1));
  }

  /** Position of the player who throws the current stone. */
  get thrower(): string {
    if (this.drill) return 'Training';
    return this.lsd ? 'LSD' : POSITIONS[Math.min(3, this.shot >> 2)];
  }

  /** Stones each team still has to play in this end. */
  stonesLeft(team: number): number {
    if (this.lsd || this.drill) return 0;
    const thrown = this.match.firstTeam === team ? (this.shot + 1) >> 1 : this.shot >> 1;
    return RULES.stonesPerTeam - thrown;
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
    if (this.phase !== 'aim' || this.lsd) return; // LSD: one clockwise, one counter-clockwise
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
    if (this.phase === 'aim' && this.isAI(this.team)) return false;
    switch (this.phase) {
      case 'aim':
        if (this.options.delivery === 'gesture') {
          this.beginGesture();
          return true;
        }
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
      case 'endScore':
        this.finishEnd();
        return true;
      default:
        return false;
    }
  }

  /** Back to aiming before the stone leaves the hack. */
  cancel(): void {
    if (this.phase === 'meterWeight' || this.phase === 'meterLine') this.phase = 'aim';
    if (this.phase === 'gesture') {
      this.world.stones.pop();
      this.current = null;
      this.phase = 'aim';
    }
  }

  // ───────────── swipe gesture delivery ─────────────

  private beginGesture(): void {
    this.beginSlide();
    this.phase = 'gesture';
    this.gesture = { progress: 0, slope: 0, ticks: 0, started: false };
  }

  /**
   * Swipe input while the finger is down. `progress`: 0 = hack … 1 = near hog line (the stone
   * follows the finger); `slope`: sideways drift of the swipe relative to its length.
   */
  gestureMove(progress: number, slope: number): void {
    if (this.phase !== 'gesture') return;
    const g = this.gesture;
    g.progress = Math.max(g.progress, Math.max(0, progress)); // the stone only slides forward
    g.slope = slope;
    if (g.progress > 0.02) g.started = true;
  }

  /** Finger lifted: the stone is released (or the delivery is cancelled after a very short swipe). */
  gestureRelease(): void {
    if (this.phase !== 'gesture') return;
    const g = this.gesture;
    if (g.progress < EXECUTION.gestureMin) {
      this.cancel();
      return;
    }
    this.weightDev = this.gesturePace;
    this.lineDev = Math.max(-1, Math.min(1, g.slope / EXECUTION.gestureLineRange));
    this.slideU = g.progress;
    if (g.progress >= this.releaseU) {
      this.release(); // let go late: right where the stone is
    } else {
      // let go early: the stone glides on to the usual release point
      this.slideFrom = g.progress;
      this.slideT = 0;
      this.phase = 'slide';
    }
  }

  /**
   * Pace of the running swipe relative to the ideal: -1 = far too slow, 0 = ideal, 1 = far too
   * fast. This becomes the weight deviation at release.
   */
  get gesturePace(): number {
    const g = this.gesture;
    if (!g.started || g.ticks === 0) return 0;
    const pace = g.progress / (g.ticks * DT);
    const ideal = this.releaseU / EXECUTION.gestureTime;
    return Math.max(-1, Math.min(1, (pace / ideal - 1) / EXECUTION.gesturePaceRange));
  }

  private tickGesture(): void {
    const g = this.gesture;
    if (g.started) g.ticks++;
    this.slideU = g.progress;
    this.placeSlidingStone();
    if (g.progress >= 1) {
      // R5: still holding the stone at the hog line
      this.weightDev = 0;
      this.lineDev = 0;
      this.slideU = 1;
      this.release();
    }
  }

  /** Slide progress at the usual release point. */
  private get releaseU(): number {
    const y0 = hackY(this.dir) + this.dir * 0.4;
    return (releaseY(this.dir) - y0) / (nearHogY(this.dir) - y0);
  }

  /** Aim point including the line error of the delivery. */
  private get actualAimX(): number {
    if (this.aiExec) return this.aimX + this.aiExec.aimOffset;
    return this.aimX + this.lineDev * EXECUTION.lineError[this.options.difficulty];
  }

  /** Position the stone on the slide path (hack → aim line) according to slideU. */
  private placeSlidingStone(): { x: number; y: number } {
    const s = this.current!;
    const y0 = hackY(this.dir) + this.dir * 0.4;
    const y = y0 + (nearHogY(this.dir) - y0) * this.slideU;
    const hy = hackY(this.dir);
    const x = (this.actualAimX * (y - hy)) / (this.aimY - hy);
    s.x = x;
    s.y = y;
    s.angle += (this.turn === 'cw' ? -1 : 1) * 0.85 * DT;
    return { x, y };
  }

  /** The stone leaves the hand: from here on the physics takes over. */
  private release(): void {
    const s = this.current!;
    const p = this.placeSlidingStone();
    const diff = this.options.difficulty;
    const speed = this.aiExec
      ? this.aiExec.speed
      : this.weight.speed * (1 + this.weightDev * EXECUTION.weightError[diff]);
    const angle = s.angle;
    this.advisor = new SweepAdvisor(this.shotTarget());
    this.advice = 'off';
    this.world.stones.pop(); // replace the sliding dummy by the released stone
    const params: DeliveryParams = {
      dir: this.dir,
      releaseX: p.x,
      releaseYPos: p.y,
      aimX: this.actualAimX,
      aimY: this.aimY,
      speed,
      turn: this.turn,
    };
    this.recording = {
      ice: this.ice.clone(),
      snapshot: this.world.snapshot(),
      params,
      id: this.stoneId(),
      team: this.team,
      angle,
      sweep: [],
      label: `${TEAM_NAMES[this.team]} · ${this.aiShot ? this.aiShot.label : this.weight.label}`,
    };
    const released = deliverStone(this.world, this.stoneId(), this.team, params);
    released.angle = angle;
    this.current = released;
    this.phase = 'running';
    if (releaseViolation(p.y, this.dir)) {
      // R5: not released before the hog line at the delivery end
      released.inPlay = false;
      released.moving = false;
      this.say('Hog-Line-Verletzung bei der Abgabe – Stein aus dem Spiel.');
    }
  }

  /** Resolve a pending decision of the non-offending team. */
  decide(choice: string): void {
    if (this.phase !== 'decision' || !this.decision) return;
    if (!this.decision.options.some((o) => o.id === choice)) return;
    const next = this.afterDecision;
    this.decision = null;
    this.afterDecision = null;
    if (next) next(choice);
  }

  /** The given team concedes the match. */
  concede(team: number): void {
    if (this.phase === 'gameOver' || this.lsd || this.drill) return;
    this.match.concede(team);
    this.phase = 'gameOver';
    this.say(`${TEAM_NAMES[team]} gibt auf – ${TEAM_NAMES[1 - team]} gewinnt.`);
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

  /** Call for the AI team-mates (sweep mode 'calls'). */
  setSweepCall(call: SweepCall): void {
    this.sweepCall = call;
  }

  /** Current intensity of a sweeper's input, 0…1. */
  sweepIntensity(sweeper: number): number {
    const s = this.sweepInput[sweeper];
    return s.hold ? Math.min(1, HOLD_INTENSITY + s.boost) : 0;
  }

  // ───────────── simulation ─────────────

  /** Advance the game by real time; physics runs in fixed ticks. */
  update(seconds: number): void {
    this.messageAge += seconds;
    if (this.phase === 'replay') {
      this.updateReplay(seconds);
      return;
    }
    if (this.phase === 'aim' && this.isAI(this.team)) this.startThinking();
    if (this.phase === 'aiThink') {
      this.thinkT += seconds;
      // time-sliced search: the result does not depend on the slicing
      if ((!this.planner || this.planner.step(9)) && this.thinkT >= 0.9) this.playAiShot();
      return;
    }
    if (this.phase === 'decision' && this.decision && this.isAI(this.decision.team)) {
      this.decisionT += seconds;
      if (this.decisionT > 1.2) this.decide(this.decision.kind === 'noTick' ? 'replace' : 'remove');
    }
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
      case 'gesture':
        this.tickGesture();
        break;
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

  // ───────────── AI ─────────────

  private startThinking(): void {
    const team = this.team;
    const m = this.match;
    this.thinkT = 0;
    this.aiShot = null;
    this.phase = 'aiThink';
    if (this.lsd) {
      // last stone draw: simply a draw to the button with the prescribed turn
      const T = teeY(this.dir) * this.dir;
      const speed = this.book.speedForDistance(this.book.toTee);
      const aim = this.book.broomFor(speed, this.turn === 'cw', 0, T);
      this.planned_ = {
        kind: 'draw',
        label: 'Draw auf den Button',
        turn: this.turn,
        speed,
        aimX: aim * this.dir,
        aimY: teeY(this.dir),
        target: { stopX: 0, stopY: teeY(this.dir) },
      };
      this.planner = null;
      return;
    }
    this.planned_ = null;
    this.planner = new Planner({
      ice: this.ice,
      book: this.book,
      stones: this.world.stones,
      team,
      shotIndex: this.shot,
      hammer: m.hammer,
      scoreDiff: m.total(team) - m.total(1 - team),
      endsLeft: Math.max(0, m.ends - m.end),
      level: AI_LEVELS[this.options.aiLevel],
      seed: this.rng.nextU32(),
    });
  }

  /** Progress of the AI's deliberation, 0…1. */
  get thinking(): number {
    return this.phase === 'aiThink' && this.planner ? this.planner.progress : 0;
  }

  private playAiShot(): void {
    const shot = this.planned_ ?? this.planner!.best!;
    const level = AI_LEVELS[this.options.aiLevel];
    this.planner = null;
    this.planned_ = null;
    this.aiShot = shot;
    this.aimX = shot.aimX;
    this.aimY = shot.aimY;
    this.turn = shot.turn;
    // execution error of the thrower; draws are thrown a touch light and swept to the target
    const light = shot.target.stopY !== undefined ? LIGHT_BIAS : 0;
    this.aiExec = {
      speed: shot.speed * (1 + this.rng.gauss() * level.weightSigma - light),
      aimOffset: this.rng.gauss() * level.lineSigma * this.dir,
    };
    this.say(`${TEAM_NAMES[this.team]} spielt: ${shot.label}`);
    this.beginSlide();
  }

  /** What the stone is supposed to do, for the skip's sweeping calls. */
  private shotTarget(): ShotTarget {
    if (this.aiShot && this.aiExec) return this.aiShot.target;
    const w = this.weight;
    if (w.kind === 'draw' && w.value < 2) {
      return { stopY: teeY(this.dir) + this.dir * w.value };
    }
    // hit: the stone the planned path meets first
    const p = this.planned;
    return p.hitId >= 0 ? { hitId: p.hitId } : {};
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
    this.slideU = 0;
    this.slideFrom = 0;
    // state before the delivery: needed to replace stones after a violation
    this.beforeShot = this.world.stones.filter((q) => q.inPlay).map(cloneStone);
    this.protectedNow = this.lsd ? [] : protectedStones(this.world.stones, this.team, this.dir, this.shot + 1);
    this.touch = null;
    this.eventCursor = this.world.events.length;
    const s = createStone(this.stoneId(), this.team, 0, hackY(this.dir) + this.dir * 0.4);
    this.world.addStone(s);
    this.current = s;
    this.sweepLog.length = 0;
  }

  /** Id of the stone being delivered: team × 8 + number of the team's stone. */
  private stoneId(): number {
    const n = this.lsd ? this.lsd.index >> 1 : this.shot >> 1;
    return this.team * RULES.stonesPerTeam + n;
  }

  private tickSlide(): void {
    this.slideT += DT;
    const rel = this.releaseU;
    const total = EXECUTION.slideTime * (1 - this.slideFrom / rel);
    const u = Math.min(1, this.slideT / total);
    // ease-in: push out of the hack, then glide
    const k = this.slideFrom > 0 ? u : u * u * (3 - 2 * u) * 0.35 + u * 0.65;
    this.slideU = this.slideFrom + (rel - this.slideFrom) * k;
    this.placeSlidingStone();
    if (u >= 1) this.release();
  }

  private tickRunning(): void {
    const s = this.current!;
    for (const inp of this.sweepInput) inp.boost = Math.max(0, inp.boost - BOOST_DECAY * DT);
    const raw: (SweepCommand | null)[] = [null, null, null];
    let any = false;
    const running = s.inPlay && s.moving;
    // the skip's call for the running stone
    this.advice = running && this.advisor ? this.advisor.update(this.world.stones, s, this.ice, this.dir, this.world.tick) : 'off';
    if (running) {
      const mode = this.isAI(this.team) ? 'auto' : this.options.sweepMode;
      for (let k = 0; k < 2; k++) {
        let i: number;
        if (mode === 'manual') i = this.sweepIntensity(k);
        else i = CALL_INTENSITY[mode === 'auto' ? this.advice : this.sweepCall];
        if (i > 0) {
          raw[k] = { stoneId: s.id, intensity: i, side: mode === 'manual' ? this.sweepSide : 0 };
          any = true;
        }
      }
    }
    // the other team's skip may sweep any stone that has reached the tee line
    if (!this.lsd && !this.drill) {
      const target = this.skipTarget();
      // an AI skip sweeps opposition stones out of the house
      const i2 = this.isAI(1 - this.team) ? (target && target.team === this.team ? 1 : 0) : this.sweepIntensity(2);
      if (i2 > 0 && target) {
        raw[2] = { stoneId: target.id, intensity: i2, side: 0 };
        any = true;
      }
    }
    const cmds = any ? applySweepRules(raw, this.world.stones, this.dir, this.team) : undefined;
    this.sweepLog.push(cmds ?? []);
    this.world.step(cmds);
    this.scanEvents();
    if (this.world.isAtRest()) {
      for (const inp of this.sweepInput) inp.boost = 0;
      this.onRest();
    }
  }

  /** Stone the non-delivering skip would sweep: a moving stone behind the tee line (theirs first). */
  private skipTarget(): Stone | null {
    let best: Stone | null = null;
    for (const q of this.world.stones) {
      if (!q.inPlay || !q.moving || !reachedTeeLine(q, this.dir)) continue;
      if (!best || (q.team === this.team && best.team !== this.team)) best = q;
    }
    return best;
  }

  /** Effective sweepers after applying the sweeping rules (for the display). */
  sweeperActive(k: number): boolean {
    return this.world.sweepers.state[k].down;
  }

  /** The other team's skip may sweep right now. */
  get skipMaySweep(): boolean {
    return this.phase === 'running' && !this.lsd && !this.drill && !this.isAI(1 - this.team) && this.skipTarget() !== null;
  }

  /** React to physics events of this tick (brush contact with a moving stone, R9). */
  private scanEvents(): void {
    const ev = this.world.events;
    for (; this.eventCursor < ev.length; this.eventCursor++) {
      const e = ev[this.eventCursor];
      if (e.type !== 'touched' || !this.options.touchRule || this.touch || this.lsd || this.drill) continue;
      const stone = this.world.getStone(e.id);
      if (!stone) continue;
      const offender = e.sweeper < 2 ? this.team : 1 - this.team;
      if (offender !== this.team) {
        // touched by the non-delivering team: stones are placed where they would have come to
        // rest – the simulation simply continues unaffected
        this.say(`${TEAM_NAMES[offender]} berührt einen laufenden Stein – Steine bleiben, wie sie ohne Berührung liegen.`);
        continue;
      }
      if (!clearedFarHog(stone.y, this.dir)) {
        // before the hog line at the playing end: removed immediately
        stone.inPlay = false;
        stone.moving = false;
        stone.vx = stone.vy = stone.omega = 0;
        this.say('Berührter Stein vor der Hog Line – aus dem Spiel.');
        continue;
      }
      this.touch = { stoneId: stone.id, offender, stones: this.world.stones.map(cloneStone) };
    }
  }

  /** All stones have come to rest: apply the rules for this delivery. */
  private onRest(): void {
    if (this.lsd || this.drill) {
      this.settle();
      return;
    }
    const t = this.touch;
    if (t) {
      this.ask(
        {
          kind: 'touched',
          team: 1 - t.offender,
          text: `${TEAM_NAMES[t.offender]} hat einen laufenden Stein mit dem Besen berührt.`,
          options: [
            { id: 'remove', label: 'Berührten Stein entfernen, verschobene Steine zurücksetzen' },
            { id: 'leave', label: 'Alle Steine liegen lassen' },
          ],
        },
        (choice) => {
          if (choice === 'remove') this.removeTouched(t);
          this.applyDeliveryRules();
        },
      );
      return;
    }
    this.applyDeliveryRules();
  }

  private ask(decision: Decision, then: (choice: string) => void): void {
    this.decision = decision;
    this.decisionT = 0;
    this.afterDecision = then;
    this.phase = 'decision';
  }

  /** R9 option: remove the touched stone and replace stones displaced after the infraction. */
  private removeTouched(t: TouchInfo): void {
    for (const before of t.stones) {
      const s = this.world.getStone(before.id);
      if (!s) continue;
      if (before.id === t.stoneId) {
        s.inPlay = false;
      } else if (!before.moving && before.inPlay) {
        s.x = before.x;
        s.y = before.y;
        s.angle = before.angle;
        s.inPlay = true;
      }
      s.moving = false;
      s.vx = s.vy = s.omega = 0;
    }
    this.say('Berührter Stein entfernt, verschobene Steine zurückgesetzt.');
  }

  /** Hog line, free guard zone and no-tick rule for the delivery that just ended. */
  private applyDeliveryRules(): void {
    const s = this.current!;
    if (s.inPlay && hogLineShort(s, this.dir)) {
      s.inPlay = false;
      this.say('Hog Line nicht überquert – Stein aus dem Spiel.');
    }
    const ruling = fgzRuling(this.protectedNow, this.world.stones);
    if (ruling === 'fgz') {
      this.replaceStones();
      this.say('Free-Guard-Zone-Verstoß: abgegebener Stein entfernt, Steine zurückgesetzt.');
    } else if (ruling === 'noTick') {
      this.ask(
        {
          kind: 'noTick',
          team: 1 - this.team,
          text: `No-Tick-Verstoß: ${TEAM_NAMES[this.team]} hat einen Guard von der Centre Line geschoben.`,
          options: [
            { id: 'replace', label: 'Abgegebenen Stein entfernen, Steine zurücksetzen' },
            { id: 'leave', label: 'Alle Steine liegen lassen' },
          ],
        },
        (choice) => {
          if (choice === 'replace') {
            this.replaceStones();
            this.say('No-Tick-Verstoß: abgegebener Stein entfernt, Steine zurückgesetzt.');
          }
          this.settle();
        },
      );
      return;
    }
    this.settle();
  }

  /** Put all stones back to where they were before the delivery; the delivered stone is removed. */
  private replaceStones(): void {
    this.world.stones.length = 0;
    for (const q of this.beforeShot) this.world.stones.push(cloneStone(q));
    this.current = null;
  }

  private settle(): void {
    this.phase = 'settled';
    this.settleT = 0;
    if (this.recording) {
      this.recording.sweep = this.sweepLog.slice();
      this.history.push(this.recording);
      if (this.history.length > 3) this.history.shift();
      this.recording = null;
    }
  }

  // ───────────── replay ─────────────

  private buildReplayWorld(rec: ShotRecord): { world: World; stone: Stone } {
    const world = new World(rec.ice.clone(), 0);
    world.restore(rec.snapshot);
    const stone = deliverStone(world, rec.id, rec.team, rec.params);
    stone.angle = rec.angle;
    return { world, stone };
  }

  /** Replay one of the last deliveries (0 = the latest) by re-simulating it exactly. */
  startReplay(back = 0): boolean {
    const rec = this.history[this.history.length - 1 - back];
    const ok = this.phase === 'aim' || this.phase === 'endScore' || this.phase === 'gameOver';
    if (!rec || !ok) return false;
    // a first silent run tells where the collisions are
    const probe = this.buildReplayWorld(rec);
    const collisions: number[] = [];
    for (let i = 0; i < rec.sweep.length; i++) {
      probe.world.step(rec.sweep[i]);
      for (const e of probe.world.events) if (e.type === 'collision') collisions.push(e.tick);
      probe.world.events.length = 0;
    }
    const { world, stone } = this.buildReplayWorld(rec);
    this.replay = {
      record: rec,
      world,
      stone,
      tick: 0,
      collisions,
      slow: false,
      restT: 0,
      returnPhase: this.phase,
    };
    this.replayAcc = 0;
    this.phase = 'replay';
    return true;
  }

  stopReplay(): void {
    if (!this.replay) return;
    this.phase = this.replay.returnPhase;
    this.replay = null;
  }

  /** Playback speed of the replay: slow motion around collisions or on request. */
  get replaySpeed(): number {
    const r = this.replay;
    if (!r) return 1;
    if (r.slow) return 0.25;
    const t = r.world.tick;
    for (const c of r.collisions) if (t > c - 70 && t < c + 170) return 0.2;
    return 1;
  }

  private updateReplay(seconds: number): void {
    const r = this.replay!;
    if (r.tick >= r.record.sweep.length) {
      r.restT += seconds;
      if (r.restT > 1.5) this.stopReplay();
      return;
    }
    this.replayAcc += Math.min(seconds, 0.25) * this.replaySpeed;
    while (this.replayAcc >= DT && r.tick < r.record.sweep.length) {
      this.replayAcc -= DT;
      r.world.step(r.record.sweep[r.tick]);
      r.tick++;
    }
  }

  /** World, ice and stone to be shown: the replay while one is running, otherwise the game. */
  get viewWorld(): World {
    return this.replay ? this.replay.world : this.world;
  }
  get viewIce(): Ice {
    return this.replay ? this.replay.world.ice : this.ice;
  }
  get viewStone(): Stone | null {
    return this.replay ? this.replay.stone : this.current;
  }

  private nextStone(): void {
    // stones that left play are taken off the sheet
    for (let i = this.world.stones.length - 1; i >= 0; i--) {
      if (!this.world.stones[i].inPlay) this.world.stones.splice(i, 1);
    }
    this.world.events.length = 0;
    this.eventCursor = 0;
    this.world.sweepers.recover(30);
    this.previewDirty = true;
    this.aiExec = null;
    this.aiShot = null;
    this.advisor = null;
    this.advice = 'off';
    if (this.drill) {
      this.nextDrill();
      return;
    }
    if (this.lsd) {
      this.nextLsd();
      return;
    }
    this.current = null;
    this.shot++;
    if (this.shot >= this.stonesPerEnd) {
      this.endResult = scoreEnd(this.world.stones, this.dir);
      this.phase = 'endScore';
      const r = this.endResult;
      this.say(r.team < 0 ? 'Blank End – der Hammer bleibt.' : `${TEAM_NAMES[r.team]} schreibt ${r.points}.`);
    } else {
      this.phase = 'aim';
    }
  }

  // ───────────── training drills ─────────────

  /** Prepare the sheet for the next attempt of the drill. */
  private setupDrill(): void {
    this.world?.stones.splice(0);
    const d = this.drill!;
    if (d.kind === 'takeout' && this.world) {
      // a stone somewhere in the house has to be removed
      const x = this.rng.range(-1.1, 1.1);
      const along = this.rng.range(-1.0, 0.8);
      this.world.addStone(createStone(8, 1, x, teeY(this.dir) + this.dir * along));
    }
  }

  private nextDrill(): void {
    const d = this.drill!;
    const s = this.current;
    let text: string;
    if (d.kind === 'takeout') {
      const target = this.world.getStone(8);
      const removed = !target || !target.inPlay || lsdDistance(target, this.dir) === RULES.lsdMiss;
      const stays = !!s && s.inPlay && lsdDistance(s, this.dir) < RULES.lsdMiss;
      const points = removed ? (stays ? 2 : 1) : 0;
      d.results.push(points);
      text = removed ? (stays ? 'Hit and Stay – 2 Punkte' : 'Takeout – 1 Punkt') : 'Verfehlt – 0 Punkte';
    } else {
      const dist = s ? lsdDistance(s, this.dir) : RULES.lsdMiss;
      d.results.push(dist);
      text = dist < RULES.lsdMiss ? `${(dist * 100).toFixed(1)} cm vom Tee` : 'Nicht im House (199,6 cm)';
    }
    this.current = null;
    const n = d.results.length;
    const sum = d.results.reduce((a, b) => a + b, 0);
    if (n >= d.attempts) {
      this.world.stones.length = 0;
      this.phase = 'gameOver';
      if (d.kind === 'takeout') this.say(`${text}. Takeout-Challenge: ${sum} von ${d.attempts * 2} Punkten.`);
      else {
        const ice = d.kind === 'ice' ? ` Das Eis war: ${this.ice.options.speed}, Curl ${this.ice.options.curl}.` : '';
        this.say(`${text}. Schnitt: ${((sum / n) * 100).toFixed(1)} cm.${ice}`);
      }
      return;
    }
    this.say(`${text} (${n}/${d.attempts})`);
    this.turn = n % 2 === 0 ? 'cw' : 'ccw';
    this.setupDrill();
    this.phase = 'aim';
  }

  /** Last stone draw: measure the stone, take it off, next draw or decide the hammer. */
  private nextLsd(): void {
    const lsd = this.lsd!;
    const s = this.current;
    const team = lsd.index % 2;
    const d = s ? lsdDistance(s, this.dir) : RULES.lsdMiss;
    lsd.dist[team].push(d);
    this.world.stones.length = 0;
    this.current = null;
    lsd.index++;
    if (lsd.index < 4) {
      this.turn = lsd.index < 2 ? 'cw' : 'ccw';
      this.say(`LSD ${TEAM_NAMES[team]}: ${(d * 100).toFixed(1)} cm`);
      this.phase = 'aim';
      return;
    }
    const sum = (t: number): number => lsd.dist[t][0] + lsd.dist[t][1];
    const a = sum(0);
    const b = sum(1);
    const hammer = a === b ? this.rng.nextU32() & 1 : a < b ? 0 : 1;
    this.match.hammer = hammer;
    this.lsd = null;
    this.turn = 'cw';
    this.say(`LSD: Rot ${(a * 100).toFixed(1)} cm · Gelb ${(b * 100).toFixed(1)} cm – ${TEAM_NAMES[hammer]} hat den Hammer.`);
    this.phase = 'aim';
  }

  /** Record the score of the completed end and start the next one (or finish the match). */
  private finishEnd(): void {
    const r = this.endResult!;
    this.match.recordEnd(r.team, r.points);
    this.endResult = null;
    if (this.match.over) {
      this.phase = 'gameOver';
      const w = this.match.winner;
      this.say(`${TEAM_NAMES[w]} gewinnt ${this.match.total(w)}:${this.match.total(1 - w)}.`);
      return;
    }
    if (this.match.isExtraEnd) this.say('Gleichstand – Extra End.');
    this.nextEnd();
  }

  /** Clear the sheet and play the next end in the other direction. */
  private nextEnd(): void {
    this.world.stones.length = 0;
    this.world.events.length = 0;
    this.end = this.match.end;
    this.shot = 0;
    this.dir = (this.dir === 1 ? -1 : 1) as Dir;
    this.world.dir = this.dir;
    this.ice.nextEnd(this.rng);
    this.world.sweepers.recover(600);
    this.book = new IceBook(this.bookIce(), this.dir);
    this.weights = weightsFromBook(this.book);
    this.aimX = 0;
    this.aimY = teeY(this.dir);
    this.phase = 'aim';
    this.previewDirty = true;
  }

  // ───────────── info for rendering ─────────────

  /** Speed of the running stone [m/s]. */
  get speed(): number {
    const s = this.viewStone;
    return s && (this.phase === 'running' || this.phase === 'replay') ? Math.sqrt(s.vx * s.vx + s.vy * s.vy) : 0;
  }

  /** The skip's call for the running stone ("HARD!", "Line!", "Clean", "Off!"). */
  get call(): string {
    if (this.phase !== 'running' || !this.current?.moving || !this.current.inPlay) return '';
    if (!this.isAI(this.team) && this.options.sweepMode === 'calls') return CALL_TEXT[this.sweepCall];
    return CALL_TEXT[this.advice];
  }

  /**
   * Estimated unswept path of the planned throw as [x0, y0, x1, y1, …] (beginner aid). Stops at
   * the first contact with another stone. Empty when the preview is switched off.
   */
  preview(): readonly number[] {
    if (!this.options.preview || this.phase !== 'aim' || this.isAI(this.team)) return [];
    return this.planned.path;
  }

  /** The planned throw simulated without sweeping: path and the stone it meets first (-1 = none). */
  private get planned(): { path: number[]; hitId: number } {
    if (!this.previewDirty) return this.plan;
    this.previewDirty = false;
    const w = new World(this.ice, 1);
    w.mutateIce = false;
    w.dir = this.dir;
    for (const s of this.world.stones) if (s.inPlay && s !== this.current) w.addStone({ ...s });
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
    let hitId = -1;
    for (const e of w.events) {
      if (e.type === 'collision') {
        hitId = e.a === -1 ? e.b : e.a;
        break;
      }
    }
    this.plan = { path, hitId };
    return this.plan;
  }

  /** y of the near hog line (release must happen before it). */
  get nearHog(): number {
    return nearHogY(this.dir);
  }
}
