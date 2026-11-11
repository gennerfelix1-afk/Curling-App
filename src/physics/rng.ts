/** Seeded PRNG (xoshiro128**), deterministic across engines (32-bit integer math only). */
export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed: number) {
    // splitmix32 to expand the seed
    let s = seed >>> 0;
    const next = (): number => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next() | 1;
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    const r = Math.imul(this.rotl(Math.imul(this.b, 5), 7), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = this.rotl(this.d, 11);
    return r;
  }

  private rotl(x: number, k: number): number {
    return (x << k) | (x >>> (32 - k));
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }

  /** Approximately standard-normal value (sum of 4 uniforms; no transcendental functions). */
  gauss(): number {
    const s = this.float() + this.float() + this.float() + this.float();
    return (s - 2) * 1.7320508075688772;
  }

  /** Independent child stream. */
  fork(label: number): Rng {
    return new Rng((this.nextU32() ^ Math.imul(label + 1, 0x9e3779b1)) >>> 0);
  }

  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: readonly [number, number, number, number]): void {
    [this.a, this.b, this.c, this.d] = s;
  }
}
