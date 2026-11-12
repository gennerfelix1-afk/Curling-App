/**
 * Central physics & geometry configuration.
 * ALL physical constants live here (see docs/PHYSICS.md, docs/RULES.md R1/R2).
 * Units: metres, seconds, kilograms, radians.
 */

/** Sheet geometry per World Curling Rules R1 (distances from the tee unless noted). */
export const SHEET = {
  /** Sheet length between inner edges of the back boards (R1: 44.50–45.720). */
  length: 45.72,
  /** Sheet width between side lines/boards (R1: 4.420–4.750). */
  width: 4.75,
  /** Tee to tee (centre to centre). */
  teeToTee: 34.747,
  /** Tee to inner edge of the hog line. */
  teeToHog: 6.401,
  /** Hog line width (stones must clear the inner edge). */
  hogLineWidth: 0.102,
  /** Tee to outer edge of the back line. */
  teeToBackLine: 1.829,
  /** Tee to hack line. */
  teeToHack: 3.658,
  /** Courtesy line distance outside the hog line. */
  courtesyBeyondHog: 1.219,
  /** House circle radii (outer edges): 12 ft, 8 ft, 4 ft, button (1 ft). */
  houseRadii: [1.829, 1.219, 0.61, 0.152] as const,
} as const;

/** Stone properties per R2. */
export const STONE = {
  /** Mass incl. handle (R2: 17.24–19.96 kg). */
  mass: 19.0,
  /** Outer radius (R2: circumference ≤ 0.914 m → radius ≤ 0.14547 m). */
  radius: 0.1454,
  /** Running band radius – only this ring touches the ice. */
  runningBandRadius: 0.0625,
  /** Moment of inertia factor: I = k * m * R^2. */
  inertiaFactor: 0.5,
} as const;

export const GRAVITY = 9.81;

/** Integration settings (docs/PHYSICS.md §7, §8). */
export const INTEGRATION = {
  /** Base fixed timestep frequency in Hz (≥ 240 Hz required). */
  hz: 240,
  /** Substeps per tick while stones are close to contact. */
  contactSubsteps: 8,
  /** Stones closer than 2R + this margin (plus travel per tick) trigger substepping [m]. */
  contactMargin: 0.004,
} as const;

/** Sliding friction on pebbled ice (docs/PHYSICS.md §3). */
export const FRICTION = {
  /** Base friction coefficient per ice speed setting (at u = uRef). */
  mu0: { keen: 0.0066, normal: 0.0075, heavy: 0.0085 },
  /** Share of friction that scales with u^-1/2 (0 = constant μ, 1 = pure v^-1/2). */
  velocityWeight: 0.3,
  /** Reference sliding speed for the v^-1/2 term [m/s]. */
  uRef: 1.0,
  /** Sliding speed below which the v^-1/2 term is capped [m/s]. */
  uMin: 0.03,
  /** Number of discrete contact points on the running band. */
  contactPoints: 24,
} as const;

/** Curl model (docs/PHYSICS.md §4) – empirically calibrated. */
export const CURL = {
  /** Lateral acceleration coefficient (× g) at full curl. */
  coeff: 0.00126,
  /** Per-game curl multiplier. */
  scale: { straight: 0.7, normal: 1.0, swingy: 1.35 },
  /** Speed above which curl fades out: F(v) = 1 / (1 + (v/vC)^2) [m/s]. */
  vC: 1.6,
  /** Fade-in at very low speed to avoid a hook in the last centimetres [m/s]. */
  vLo: 0.05,
  /** Spin below which curl becomes weak and erratic [rad/s]. */
  omegaLo: 0.1,
  /** Gain so that the rotation grip saturates at 1 (fully predictable) above ≈ 2.2 × omegaLo. */
  gripGain: 1.1,
  /** Spin above which curl decreases again [rad/s]. */
  omegaHi: 3.0,
  /** Weight of the slow side of the running band in the curl grip (0.5 = both sides equal). */
  slowSideWeight: 0.52,
  /** Directional term: lateral accel (× g) per unit left/right friction-factor difference. */
  dirCoeff: 0.0005,
  /** Erratic lateral acceleration (× g) for stones with (almost) no rotation. */
  noiseCoeff: 0.002,
  /** Correlation time of the erratic term [s]. */
  noiseTau: 2.5,
} as const;

/** Ice state field (docs/PHYSICS.md §5). */
export const ICE = {
  /** Grid cell size [m]. */
  cell: 0.04,
  /** Amplitude of local friction variation (± fraction). */
  frictionVariation: 0.025,
  /** Amplitude of local curl variation (± fraction). */
  curlVariation: 0.04,
  /** Node spacing of the smooth variation noise [m]. */
  variationSpacing: 0.6,
  /** Node spacing of the height field used for falls [m]. */
  fallSpacing: 1.5,
  /** Typical slope magnitude of falls [m/m]. */
  fallSlope: 1.2e-5,
  /** Pebble wear gained per metre travelled by a contact point passing a cell (saturating). */
  wearRate: 0.1,
  /** Friction reduction at full wear (fraction). */
  wearFriction: 0.05,
  /** Curl reduction at full wear (fraction). */
  wearCurl: 0.2,
  /** Random change of global friction / curl between ends (± fraction). */
  endDrift: 0.02,
  /** Max friction reduction from sweeping heat (fraction, saturating). */
  heatFriction: 0.25,
  /** Heat level at which half of the max reduction is reached. */
  heatHalf: 1.0,
  /** Max curl reduction from sweeping heat on the slow side (fraction, saturating). */
  heatCurl: 0.7,
  /** Heat level at which half of the max curl reduction is reached (curl responds earlier than friction). */
  heatCurlHalf: 0.3,
  /** Decay time of sweeping heat (ice cools down again) [s]. */
  heatTau: 1.5,
  /** Heat below this level is cleared. */
  heatEpsilon: 0.01,
  /** Hot cells are cooled every this many ticks. */
  coolStride: 12,
} as const;

/** Sweeping (docs/PHYSICS.md §6). */
export const SWEEP = {
  /** Sweepers: 0 and 1 = delivering team, 2 = skip of the non-delivering team (behind the tee line). */
  sweepers: 3,
  /** Swept patch per brush: depth along the path × width across it [m]. */
  brushDepth: 0.1,
  brushWidth: 0.16,
  /** Gap between the stone's leading edge and the brush patch, per sweeper [m]. */
  gap: [0.05, 0.17] as const,
  /** Lateral offset of the patch when sweeping on one side of the path [m]. */
  sideOffset: 0.045,
  /** Heat added per second under the brush at full intensity. */
  heatRate: 4.5,
  /** Fatigue gained per second at full intensity (scales with intensity²). */
  fatigueRate: 0.012,
  /** Fatigue recovered per second while resting. */
  recoveryRate: 0.04,
  /** Maximum loss of effectiveness through fatigue (fraction). */
  fatigueMax: 0.4,
  /** Intensity quantisation steps (inputs are recorded per tick for replays). */
  intensitySteps: 64,
  /** Radius of the brush head for stone contact detection [m]. */
  touchRadius: 0.08,
  /** Speed at which a sweeper moves over to another stone [m/s]. */
  moveSpeed: 4.0,
} as const;

/** Stone–stone collisions (docs/PHYSICS.md §7). */
export const COLLISION = {
  /** Coefficient of restitution granite–granite. */
  restitution: 0.85,
  /** Coulomb friction between striking bands. */
  stoneFriction: 0.06,
  /** Sequential-impulse iterations per substep. */
  iterations: 4,
} as const;

/** Delivery defaults (docs/PHYSICS.md §9). */
export const DELIVERY = {
  /** Release point distance before the near hog line [m]. */
  releaseBeforeHog: 1.5,
  /** Default handle rotation at release [rad/s] (≈ 3 rotations on a draw). */
  omega: 0.85,
} as const;

/**
 * Weights in curling language. Draw weights are defined by where an unswept stone thrown down
 * the centre line stops (metres past the tee line, negative = short of it); hit weights by their
 * hog-to-hog time on the current ice (seconds).
 */
export const WEIGHTS = [
  { id: 'guard', label: 'Guard', kind: 'draw', value: -3.2 },
  { id: 'top12', label: 'Top 12', kind: 'draw', value: -1.6 },
  { id: 'top8', label: 'Top 8', kind: 'draw', value: -1.0 },
  { id: 'top4', label: 'Top 4', kind: 'draw', value: -0.45 },
  { id: 'tee', label: 'Tee / Button', kind: 'draw', value: 0 },
  { id: 'back4', label: 'Back 4', kind: 'draw', value: 0.45 },
  { id: 'back8', label: 'Back 8', kind: 'draw', value: 1.0 },
  { id: 'back12', label: 'Back 12', kind: 'draw', value: 1.6 },
  { id: 'hack', label: 'Hack', kind: 'draw', value: 3.658 },
  { id: 'board', label: 'Board', kind: 'draw', value: 5.4 },
  { id: 'control', label: 'Control', kind: 'hit', value: 10.8 },
  { id: 'normal', label: 'Normal', kind: 'hit', value: 9.6 },
  { id: 'peel', label: 'Peel', kind: 'hit', value: 8.4 },
] as const;

/** Player execution: timing meters at delivery (docs/PLAN.md phase 4). */
export const EXECUTION = {
  /** Period of the timing meter [s]. */
  meterPeriod: 1.3,
  /** Relative speed error at full meter deviation, per difficulty. */
  weightError: { beginner: 0.02, club: 0.035, pro: 0.05 },
  /** Lateral aim error at the broom at full meter deviation [m], per difficulty. */
  lineError: { beginner: 0.2, club: 0.35, pro: 0.5 },
  /** Duration of the slide from the hack to the release point [s]. */
  slideTime: 2.2,
  /** Push delivery: seconds of holding to go from the lightest to the heaviest weight. */
  chargeTime: { beginner: 3.6, club: 3.0, pro: 2.5 },
  /** Push delivery: seconds the stone glides from the hack to the near hog line. */
  glideTime: 3.0,
  /** Push delivery: how far the slide wanders off the line without steering (share of lineError). */
  wander: { beginner: 0.6, club: 0.85, pro: 1.0 },
  /** Gesture delivery: ideal duration of the swipe from the hack to the release point [s]. */
  gestureTime: 1.3,
  /** Gesture delivery: relative pace error that counts as full weight deviation. */
  gesturePaceRange: 0.6,
  /** Gesture delivery: sideways slope of the swipe that counts as full line deviation. */
  gestureLineRange: 0.25,
  /** Gesture delivery: swipes shorter than this share of the slide are cancelled. */
  gestureMin: 0.3,
} as const;

export type Difficulty = keyof typeof EXECUTION.weightError;

/** Rule parameters (docs/RULES.md). */
export const RULES = {
  stonesPerTeam: 8,
  /** Free guard zone protection lasts until this stone of the end is delivered (five-rock rule). */
  fgzUntilStone: 6,
  /** Half width of the centre line [m] (for the no-tick rule). */
  centreLineHalfWidth: 0.0065,
  /** Decisions closer than this are shown with the measuring device [m]. */
  measureThreshold: 0.03,
  /** Last stone draw: distance recorded for a stone that is not in the house [m]. */
  lsdMiss: 1.996,
} as const;

/** Derived geometry helpers. */
export const DERIVED = {
  hogToHog: SHEET.teeToTee - 2 * SHEET.teeToHog,
  /** Max centre distance from tee for a stone to count as in the house (touching the 12-ft). */
  houseScoringRadius: SHEET.houseRadii[0] + STONE.radius,
  dt: 1 / INTEGRATION.hz,
} as const;

export type IceSpeed = keyof typeof FRICTION.mu0;
export type CurlAmount = keyof typeof CURL.scale;
