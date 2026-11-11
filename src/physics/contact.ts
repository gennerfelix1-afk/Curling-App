import { CURL, FRICTION, GRAVITY, STONE } from './config';
import { dcos, dsin, D_PI } from './dmath';
import type { Ice } from './ice';
import type { Stone } from './stone';

const N = FRICTION.contactPoints;
/** Contact point offsets on the running band (world-fixed; the ring is rotationally symmetric). */
export const RING_X = new Float64Array(N);
export const RING_Y = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const a = (2 * D_PI * (i + 0.5)) / N;
  RING_X[i] = STONE.runningBandRadius * dcos(a);
  RING_Y[i] = STONE.runningBandRadius * dsin(a);
}

export interface Accel {
  /** Linear acceleration from sliding friction [m/s²]. */
  fx: number;
  fy: number;
  /** Additional lateral/slope acceleration (curl, falls) [m/s²]. */
  cx: number;
  cy: number;
  /** Angular acceleration [rad/s²]. */
  alpha: number;
}

const fall = { x: 0, y: 0 };
const INERTIA_PER_MASS = STONE.inertiaFactor * STONE.radius * STONE.radius;

/**
 * Forces on a moving stone: sliding friction summed over the running-band contact points
 * (velocity dependent, read from the ice field) plus the empirical curl acceleration.
 */
export function stoneAccel(s: Stone, ice: Ice, out: Accel): void {
  const vx = s.vx;
  const vy = s.vy;
  const w = s.omega;
  const speed = Math.sqrt(vx * vx + vy * vy);
  // unit vector to the left of the direction of travel
  let nx = 0;
  let ny = 0;
  if (speed > 1e-9) {
    nx = -vy / speed;
    ny = vx / speed;
  }
  const sgn = w > 0 ? 1 : w < 0 ? -1 : 0;
  const vw = FRICTION.velocityWeight;
  const share = (ice.mu0 * GRAVITY) / N;

  let ax = 0;
  let ay = 0;
  let torque = 0;
  let slowSum = 0;
  let slowCount = 0;
  let fastSum = 0;
  let leftSum = 0;
  let rightSum = 0;
  for (let i = 0; i < N; i++) {
    const rx = RING_X[i];
    const ry = RING_Y[i];
    const ux = vx - w * ry;
    const uy = vy + w * rx;
    const u = Math.sqrt(ux * ux + uy * uy);
    const m = ice.sampleMu(s.x + rx, s.y + ry);
    const side = rx * nx + ry * ny;
    if (side > 0) leftSum += m;
    else rightSum += m;
    // curl grip of the ice under the running band, slow side weighted slightly higher
    const c = ice.sampleCurl(s.x + rx, s.y + ry);
    if (side * sgn > 0) {
      slowSum += c;
      slowCount++;
    } else {
      fastSum += c;
    }
    if (u < 1e-9) continue;
    const gv = 1 - vw + vw * Math.sqrt(FRICTION.uRef / (u > FRICTION.uMin ? u : FRICTION.uMin));
    const f = (share * m * gv) / u;
    const px = -f * ux;
    const py = -f * uy;
    ax += px;
    ay += py;
    torque += rx * py - ry * px;
  }
  out.fx = ax;
  out.fy = ay;
  out.alpha = torque / INERTIA_PER_MASS;

  let lat = 0;
  if (speed > 1e-4) {
    const r = speed / CURL.vC;
    const F = (speed / (speed + CURL.vLo)) / (1 + r * r);
    const xw = (w * sgn) / CURL.omegaLo;
    const grip = gripOf(xw); // 0 = no rotation, 1 = normal rotation
    const hi = w / CURL.omegaHi;
    const S = grip / (1 + hi * hi);
    const cSlow =
      slowCount > 0 && slowCount < N
        ? CURL.slowSideWeight * (slowSum / slowCount) + (1 - CURL.slowSideWeight) * (fastSum / (N - slowCount))
        : (slowSum + fastSum) / N;
    lat =
      GRAVITY *
      F *
      (CURL.coeff * ice.curlScale * S * cSlow * sgn +
        (CURL.dirCoeff * (leftSum - rightSum) * 2) / N +
        CURL.noiseCoeff * (1 - grip) * s.xi);
  }
  ice.sampleFall(s.x, s.y, fall);
  out.cx = lat * nx + GRAVITY * fall.x;
  out.cy = lat * ny + GRAVITY * fall.y;
}

/** Rotation "grip": rises from 0 (no rotation) and saturates at exactly 1 for normal rotation. */
function gripOf(xw: number): number {
  const g = (CURL.gripGain * xw) / Math.sqrt(1 + xw * xw);
  return g > 1 ? 1 : g;
}

/** 1 − grip: how erratic the stone is (0 for normal rotation). */
export function erraticFactor(omega: number): number {
  return 1 - gripOf(Math.abs(omega) / CURL.omegaLo);
}
