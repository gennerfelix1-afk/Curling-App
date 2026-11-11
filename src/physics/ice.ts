import { CURL, FRICTION, ICE, SHEET, type CurlAmount, type IceSpeed } from './config';
import { DERIVED } from './config';
import { dexp } from './dmath';
import { Rng } from './rng';

/** Heat decay factor per cooling step (deterministic exp). */
const COOL_FACTOR = dexp((-ICE.coolStride * DERIVED.dt) / ICE.heatTau);

export interface IceOptions {
  seed: number;
  speed: IceSpeed;
  curl: CurlAmount;
  /** Local random variation of friction / curl. */
  variation: boolean;
  /** Slight slopes ("falls"). */
  falls: boolean;
  /** Pebble wear along travelled paths. */
  wear: boolean;
  /** Slight change of the ice between ends. */
  endDrift: boolean;
}

export const DEFAULT_ICE_OPTIONS: IceOptions = {
  seed: 1,
  speed: 'normal',
  curl: 'normal',
  variation: true,
  falls: true,
  wear: true,
  endDrift: true,
};

/** Smooth noise in [-1, 1]: random values on a coarse lattice, bilinearly interpolated. */
function smoothNoise(rng: Rng, nx: number, ny: number, cell: number, spacing: number): Float32Array {
  const cx = Math.ceil((nx * cell) / spacing) + 2;
  const cy = Math.ceil((ny * cell) / spacing) + 2;
  const coarse = new Float32Array(cx * cy);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rng.range(-1, 1);
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const gy = ((j + 0.5) * cell) / spacing;
    const j0 = Math.floor(gy);
    const ty = gy - j0;
    for (let i = 0; i < nx; i++) {
      const gx = ((i + 0.5) * cell) / spacing;
      const i0 = Math.floor(gx);
      const tx = gx - i0;
      const a = coarse[j0 * cx + i0];
      const b = coarse[j0 * cx + i0 + 1];
      const c = coarse[(j0 + 1) * cx + i0];
      const d = coarse[(j0 + 1) * cx + i0 + 1];
      out[j * nx + i] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/**
 * Ice state field: a grid over the whole sheet. Stones read the friction factor at the contact
 * points of their running band; wear and sweeping heat are written back into the field.
 */
export class Ice {
  readonly cell = ICE.cell;
  readonly nx: number;
  readonly ny: number;
  readonly x0 = -SHEET.width / 2;
  readonly y0 = -SHEET.length / 2;
  readonly options: IceOptions;

  /** Global friction coefficient (ice speed incl. end drift). */
  mu0: number;
  /** Global curl multiplier (incl. end drift). */
  curlScale: number;

  /** Raw layers. */
  readonly base: Float32Array;
  readonly curlBase: Float32Array;
  readonly wear: Float32Array;
  readonly heat: Float32Array;
  /** Effective layers sampled by stones (kept in sync via refreshCell). */
  readonly mu: Float32Array;
  readonly curl: Float32Array;

  /** Cells that currently carry sweeping heat. */
  private hot: number[] = [];
  private readonly hotFlag: Uint8Array;

  /** Falls: lateral acceleration direction (-∇h) on a coarse node grid. */
  readonly fnx: number;
  readonly fny: number;
  readonly fallX: Float32Array;
  readonly fallY: Float32Array;

  constructor(options: Partial<IceOptions> = {}, copyFrom?: Ice) {
    this.options = { ...DEFAULT_ICE_OPTIONS, ...options };
    this.nx = Math.ceil(SHEET.width / this.cell);
    this.ny = Math.ceil(SHEET.length / this.cell);
    this.fnx = Math.ceil(SHEET.width / ICE.fallSpacing) + 1;
    this.fny = Math.ceil(SHEET.length / ICE.fallSpacing) + 1;
    if (copyFrom) {
      this.mu0 = copyFrom.mu0;
      this.curlScale = copyFrom.curlScale;
      this.base = copyFrom.base; // immutable after construction → shared
      this.curlBase = copyFrom.curlBase;
      this.fallX = copyFrom.fallX;
      this.fallY = copyFrom.fallY;
      this.wear = copyFrom.wear.slice();
      this.heat = copyFrom.heat.slice();
      this.mu = copyFrom.mu.slice();
      this.curl = copyFrom.curl.slice();
      this.hot = copyFrom.hot.slice();
      this.hotFlag = copyFrom.hotFlag.slice();
      return;
    }
    const o = this.options;
    const n = this.nx * this.ny;
    this.mu0 = FRICTION.mu0[o.speed];
    this.curlScale = CURL.scale[o.curl];
    this.base = new Float32Array(n).fill(1);
    this.curlBase = new Float32Array(n).fill(1);
    this.wear = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.mu = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.hotFlag = new Uint8Array(n);
    this.fallX = new Float32Array(this.fnx * this.fny);
    this.fallY = new Float32Array(this.fnx * this.fny);

    const rng = new Rng(o.seed);
    const frictionRng = rng.fork(1);
    const curlRng = rng.fork(2);
    const fallRng = rng.fork(3);
    if (o.variation) {
      const f = smoothNoise(frictionRng, this.nx, this.ny, this.cell, ICE.variationSpacing);
      const c = smoothNoise(curlRng, this.nx, this.ny, this.cell, ICE.variationSpacing * 2);
      for (let i = 0; i < n; i++) {
        this.base[i] = 1 + ICE.frictionVariation * f[i];
        this.curlBase[i] = 1 + ICE.curlVariation * c[i];
      }
    }
    if (o.falls) {
      // Smooth height field on the coarse nodes; fall = -gradient (central differences).
      const w = this.fnx + 2;
      const h = new Float32Array(w * (this.fny + 2));
      const amp = ICE.fallSlope * ICE.fallSpacing; // height difference giving the typical slope
      for (let i = 0; i < h.length; i++) h[i] = fallRng.range(-amp, amp);
      for (let j = 0; j < this.fny; j++) {
        for (let i = 0; i < this.fnx; i++) {
          const k = (j + 1) * w + (i + 1);
          this.fallX[j * this.fnx + i] = -(h[k + 1] - h[k - 1]) / (2 * ICE.fallSpacing);
          this.fallY[j * this.fnx + i] = -(h[k + w] - h[k - w]) / (2 * ICE.fallSpacing);
        }
      }
    }
    for (let i = 0; i < n; i++) this.refreshCell(i);
  }

  /** Recompute the effective friction / curl factors of one cell from the raw layers. */
  refreshCell(i: number): void {
    const wear = this.wear[i];
    const h = this.heat[i];
    const warm = h / (h + ICE.heatHalf);
    this.mu[i] = this.base[i] * (1 - ICE.wearFriction * wear) * (1 - ICE.heatFriction * warm);
    this.curl[i] = this.curlBase[i] * (1 - ICE.wearCurl * wear) * (1 - (ICE.heatCurl * h) / (h + ICE.heatCurlHalf));
  }

  private bilinear(layer: Float32Array, x: number, y: number): number {
    const nx = this.nx;
    let fx = (x - this.x0) / this.cell - 0.5;
    let fy = (y - this.y0) / this.cell - 0.5;
    if (fx < 0) fx = 0;
    else if (fx > nx - 1.001) fx = nx - 1.001;
    if (fy < 0) fy = 0;
    else if (fy > this.ny - 1.001) fy = this.ny - 1.001;
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * nx + i;
    const a = layer[k];
    const b = layer[k + 1];
    const c = layer[k + nx];
    const d = layer[k + nx + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  /** Local friction factor (dimensionless, ~1) at a point. */
  sampleMu(x: number, y: number): number {
    return this.bilinear(this.mu, x, y);
  }

  /** Local curl factor (dimensionless, ~1) at a point. */
  sampleCurl(x: number, y: number): number {
    return this.bilinear(this.curl, x, y);
  }

  /** Slope acceleration direction (-∇h) at a point; multiply by g. */
  sampleFall(x: number, y: number, out: { x: number; y: number }): void {
    let fx = (x - this.x0) / ICE.fallSpacing;
    let fy = (y - this.y0) / ICE.fallSpacing;
    if (fx < 0) fx = 0;
    else if (fx > this.fnx - 1.001) fx = this.fnx - 1.001;
    if (fy < 0) fy = 0;
    else if (fy > this.fny - 1.001) fy = this.fny - 1.001;
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * this.fnx + i;
    const w = this.fnx;
    out.x =
      (this.fallX[k] + (this.fallX[k + 1] - this.fallX[k]) * tx) * (1 - ty) +
      (this.fallX[k + w] + (this.fallX[k + w + 1] - this.fallX[k + w]) * tx) * ty;
    out.y =
      (this.fallY[k] + (this.fallY[k + 1] - this.fallY[k]) * tx) * (1 - ty) +
      (this.fallY[k + w] + (this.fallY[k + w + 1] - this.fallY[k + w]) * tx) * ty;
  }

  /** Index of the cell containing a point, or -1 outside the sheet. */
  cellIndex(x: number, y: number): number {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((y - this.y0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return -1;
    return j * this.nx + i;
  }

  /** Add pebble wear at a point (saturating towards 1). */
  addWear(x: number, y: number, amount: number): void {
    const k = this.cellIndex(x, y);
    if (k < 0) return;
    this.wear[k] += amount * (1 - this.wear[k]);
    this.refreshCell(k);
  }

  /** Add sweeping heat to a cell (by index). */
  addHeat(k: number, amount: number): void {
    this.heat[k] += amount;
    if (!this.hotFlag[k]) {
      this.hotFlag[k] = 1;
      this.hot.push(k);
    }
    this.refreshCell(k);
  }

  /** Indices of the cells currently carrying sweeping heat (for rendering sweep marks). */
  get hotCells(): readonly number[] {
    return this.hot;
  }

  /** Number of cells currently carrying sweeping heat. */
  get hotCount(): number {
    return this.hot.length;
  }

  /** One cooling step: swept ice returns to its normal state (call every ICE.coolStride ticks). */
  cool(): void {
    const hot = this.hot;
    let n = 0;
    for (let i = 0; i < hot.length; i++) {
      const k = hot[i];
      const h = this.heat[k] * COOL_FACTOR;
      if (h < ICE.heatEpsilon) {
        this.heat[k] = 0;
        this.hotFlag[k] = 0;
      } else {
        this.heat[k] = h;
        hot[n++] = k;
      }
      this.refreshCell(k);
    }
    hot.length = n;
  }

  /** Apply the slight change of the ice between ends (deterministic via rng). */
  nextEnd(rng: Rng): void {
    if (!this.options.endDrift) return;
    const base = FRICTION.mu0[this.options.speed];
    const curl = CURL.scale[this.options.curl];
    this.mu0 = Math.min(base * 1.06, Math.max(base * 0.94, this.mu0 * (1 + rng.range(-ICE.endDrift, ICE.endDrift))));
    this.curlScale = Math.min(curl * 1.1, Math.max(curl * 0.9, this.curlScale * (1 + rng.range(-ICE.endDrift, ICE.endDrift))));
  }

  /** Independent copy (wear/heat copied, static layers shared) – e.g. for AI simulations. */
  clone(): Ice {
    return new Ice(this.options, this);
  }
}
