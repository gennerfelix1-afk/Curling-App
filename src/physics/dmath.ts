/**
 * Deterministic math helpers. Math.sin/cos/exp may differ in the last bit between JS engines;
 * these use only + - * / so replays are bit-identical everywhere. (Math.sqrt is IEEE-exact.)
 */
const PI = 3.141592653589793;
const TWO_PI = 2 * PI;

function reduce(x: number): number {
  let r = x - TWO_PI * Math.floor(x / TWO_PI);
  if (r > PI) r -= TWO_PI;
  return r;
}

/** Deterministic sine (Taylor series after range reduction to [-π, π]). */
export function dsin(x: number): number {
  const r = reduce(x);
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let n = 1; n <= 14; n++) {
    term *= -r2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

/** Deterministic cosine. */
export function dcos(x: number): number {
  const r = reduce(x);
  const r2 = r * r;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 14; n++) {
    term *= -r2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}

/** Deterministic exp for moderate |x| (scaling and squaring + Taylor). */
export function dexp(x: number): number {
  let k = 0;
  let r = x;
  while (r > 0.5 || r < -0.5) {
    r *= 0.5;
    k++;
  }
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 14; n++) {
    term *= r / n;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum *= sum;
  return sum;
}

export const D_PI = PI;
