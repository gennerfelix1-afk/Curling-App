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
  /** Substeps used when stones are close to contact. */
  contactSubsteps: 8,
} as const;

/** Derived geometry helpers. */
export const DERIVED = {
  hogToHog: SHEET.teeToTee - 2 * SHEET.teeToHog,
  /** Max centre distance from tee for a stone to count as in the house (touching the 12-ft). */
  houseScoringRadius: SHEET.houseRadii[0] + STONE.radius,
} as const;
