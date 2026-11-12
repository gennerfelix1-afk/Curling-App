import { ICE, SHEET, STONE, SWEEP } from '../physics/config';
import type { Game } from '../game/game';
import { backLineY, farHogY, hackY, HALF_LENGTH, HALF_WIDTH, nearHogY, teeY, type Dir } from '../physics/sheet';
import type { Stone } from '../physics/stone';
import type { CameraMode, GameView } from './view';

const TEAM_COLORS = ['#d62839', '#f2c230'];
const TEAM_DARK = ['#8f1422', '#a67f0c'];

/** Simple top-down canvas view with a camera that follows the play (phase 4). */
export class View2D implements GameView {
  cameraMode: CameraMode = 'auto';
  debug = false;

  playHeight(): number {
    return this.h - this.top - this.bottom;
  }

  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** Camera: centre along the sheet and visible length [m]. */
  private camY = 0;
  private camLen = 12;
  private scale = 1;
  private dir: Dir = 1;
  private first = true;
  /** Screen area not covered by the HUD / control panels. */
  private top = 96;
  private bottom = 150;
  private cx = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = width;
    this.h = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  /** Sheet → screen. Play direction always points up. */
  private sx(x: number): number {
    return this.cx + this.dir * x * this.scale;
  }
  private sy(y: number): number {
    return this.cy - this.dir * (y - this.camY) * this.scale;
  }
  private get cy(): number {
    return this.top + (this.h - this.top - this.bottom) / 2;
  }

  setInsets(top: number, bottom: number): void {
    this.top = top;
    this.bottom = bottom;
  }

  /** Screen → sheet coordinates (for aiming). */
  toSheet(px: number, py: number): { x: number; y: number } {
    return {
      x: ((px - this.cx) / this.scale) * this.dir,
      y: this.camY - ((py - this.cy) / this.scale) * this.dir,
    };
  }

  private updateCamera(game: Game, dt: number): void {
    const d = game.dir;
    const tee = teeY(d);
    let cy: number;
    let len: number;
    const houseView = { cy: tee - d * 2.6, len: 10.2 };
    switch (game.phase) {
      case 'meterWeight':
      case 'meterLine':
      case 'gesture':
      case 'charge':
      case 'glide':
      case 'slide':
        cy = hackY(d) + d * 5.5;
        len = 13;
        break;
      case 'replay':
      case 'running': {
        const s = game.viewStone!;
        const along = s.y * d;
        const farHog = farHogY(d) * d;
        if (along > farHog - 3 || !s.inPlay) {
          cy = houseView.cy;
          len = houseView.len;
        } else {
          cy = (along + 2.5) * d;
          len = 11;
        }
        break;
      }
      default:
        cy = houseView.cy;
        len = houseView.len;
    }
    if (this.first || this.dir !== d) {
      this.camY = cy;
      this.camLen = len;
      this.first = false;
    } else {
      const k = 1 - Math.pow(0.02, dt); // smooth follow
      this.camY += (cy - this.camY) * k;
      this.camLen += (len - this.camLen) * k;
    }
    this.dir = d;
    // narrow screens: keep a strip free for the overview map
    const reserve = this.w < 700 ? this.mapWidth() + 14 : 0;
    this.cx = (this.w - reserve) / 2;
    this.scale = Math.min((this.w - reserve) / (SHEET.width + 0.3), (this.h - this.top - this.bottom) / this.camLen);
  }

  draw(game: Game, dt: number): void {
    this.updateCamera(game, dt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b1d2a';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawSheet(game);
    this.drawHeat(game);
    this.drawPreview(game);
    this.drawBroom(game);
    for (const s of game.viewWorld.stones) if (s.inPlay) this.drawStone(s);
    this.drawMeasure(game);
    this.drawSweepers(game);
    this.drawMinimap(game);
  }

  private line(y: number, width: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * this.scale);
    ctx.beginPath();
    ctx.moveTo(this.sx(-HALF_WIDTH), this.sy(y));
    ctx.lineTo(this.sx(HALF_WIDTH), this.sy(y));
    ctx.stroke();
  }

  private drawSheet(game: Game): void {
    const ctx = this.ctx;
    const s = this.scale;
    // ice
    const top = this.sy(this.dir * HALF_LENGTH);
    const bottom = this.sy(-this.dir * HALF_LENGTH);
    ctx.fillStyle = '#eef5fa';
    ctx.fillRect(this.sx(-this.dir * HALF_WIDTH), top, SHEET.width * s, bottom - top);
    // houses
    const rings = ['#1c64b0', '#eef5fa', '#c8202f', '#eef5fa'];
    for (const d of [1, -1] as Dir[]) {
      const ty = teeY(d);
      SHEET.houseRadii.forEach((r, i) => {
        ctx.beginPath();
        ctx.arc(this.sx(0), this.sy(ty), r * s, 0, Math.PI * 2);
        ctx.fillStyle = rings[i];
        ctx.fill();
      });
      this.line(ty, 0.013, '#33475b');
      this.line(backLineY(d), 0.013, '#33475b');
      // hog line: inner edge at farHogY, band extends away from the house
      this.line(farHogY(d) - d * (SHEET.hogLineWidth / 2), SHEET.hogLineWidth, '#c8202f');
      // hack
      ctx.fillStyle = '#222';
      const hy = (SHEET.teeToTee / 2 + SHEET.teeToHack) * d;
      for (const side of [-1, 1]) {
        ctx.fillRect(this.sx(side * 0.12) - 0.07 * s, this.sy(hy) - 0.04 * s, 0.14 * s, 0.1 * s);
      }
    }
    // centre line
    ctx.strokeStyle = '#33475b';
    ctx.lineWidth = Math.max(1, 0.013 * s);
    ctx.beginPath();
    ctx.moveTo(this.sx(0), this.sy(hackY(1)));
    ctx.lineTo(this.sx(0), this.sy(hackY(-1)));
    ctx.stroke();
    // boards
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = Math.max(2, 0.06 * s);
    ctx.strokeRect(this.sx(-this.dir * HALF_WIDTH), top, SHEET.width * s, bottom - top);
    void game;
  }

  /** Sweep marks: cells that currently carry sweeping heat. */
  private drawHeat(game: Game): void {
    const ice = game.viewIce;
    const ctx = this.ctx;
    const size = Math.ceil(ice.cell * this.scale) + 1;
    ctx.fillStyle = '#4aa3df';
    for (const k of ice.hotCells) {
      const h = ice.heat[k];
      const x = ice.x0 + ((k % ice.nx) + 0.5) * ice.cell;
      const y = ice.y0 + (Math.floor(k / ice.nx) + 0.5) * ice.cell;
      ctx.globalAlpha = Math.min(0.55, 0.6 * (h / (h + ICE.heatHalf)));
      ctx.fillRect(this.sx(x) - size / 2, this.sy(y) - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawPreview(game: Game): void {
    const p = game.preview();
    if (p.length < 4) return;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(20, 120, 60, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(this.sx(p[0]), this.sy(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(this.sx(p[i]), this.sy(p[i + 1]));
    ctx.stroke();
    ctx.setLineDash([]);
    // ghost of the final position
    ctx.beginPath();
    ctx.arc(this.sx(p[p.length - 2]), this.sy(p[p.length - 1]), STONE.radius * this.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawBroom(game: Game): void {
    if (game.phase === 'endScore' || game.phase === 'gameOver') return;
    const ctx = this.ctx;
    const x = this.sx(game.aimX);
    const y = this.sy(game.aimY);
    const r = Math.max(8, 0.14 * this.scale);
    ctx.strokeStyle = '#0a7d3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawStone(st: Stone): void {
    const ctx = this.ctx;
    const x = this.sx(st.x);
    const y = this.sy(st.y);
    const r = STONE.radius * this.scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#8a9099';
    ctx.fill();
    ctx.strokeStyle = '#4c5158';
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = TEAM_COLORS[st.team % 2];
    ctx.fill();
    // handle shows the rotation
    const c = Math.cos(st.angle);
    const s = Math.sin(st.angle);
    const hx = this.dir * c;
    const hy = -this.dir * s;
    ctx.strokeStyle = TEAM_DARK[st.team % 2];
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - hx * r * 0.15, y - hy * r * 0.15);
    ctx.lineTo(x + hx * r * 0.6, y + hy * r * 0.6);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /** End result: mark the counting stones; show the measuring device for close decisions. */
  private drawMeasure(game: Game): void {
    const r = game.endResult;
    if (!r || game.phase !== 'endScore') return;
    const ctx = this.ctx;
    const tx = this.sx(0);
    const ty = this.sy(teeY(game.dir));
    const find = (id: number): Stone | undefined => game.viewWorld.stones.find((q) => q.id === id);
    for (let i = 0; i < r.points; i++) {
      const s = find(r.ranking[i].id);
      if (!s) continue;
      ctx.beginPath();
      ctx.arc(this.sx(s.x), this.sy(s.y), STONE.radius * this.scale * 1.25, 0, Math.PI * 2);
      ctx.strokeStyle = '#0a7d3b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const m of r.measured) {
      const s = find(m.id);
      if (!s) continue;
      const x = this.sx(s.x);
      const y = this.sy(s.y);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      const label = `${(m.dist * 100).toFixed(1)} cm`;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(11, 29, 42, 0.9)';
      ctx.fillRect(x - w / 2, y - STONE.radius * this.scale - 24, w, 19);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, y - STONE.radius * this.scale - 10);
    }
  }

  private drawSweepers(game: Game): void {
    if (game.phase !== 'running') return;
    const s = game.viewStone;
    if (!s || !s.moving) return;
    const ctx = this.ctx;
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed < 0.01) return;
    const ang = Math.atan2(-this.dir * s.vy, this.dir * s.vx); // screen angle of travel
    game.viewWorld.sweepers.state.forEach((sw, k) => {
      if (k > 1 && !sw.down) return; // the other skip only appears while sweeping
      const active = game.sweepIntensity(k) > 0;
      const x = sw.down ? sw.x : s.x + (s.vx / speed) * (0.4 + k * 0.15) + (k ? 0.35 : -0.35) * (-s.vy / speed);
      const y = sw.down ? sw.y : s.y + (s.vy / speed) * (0.4 + k * 0.15) + (k ? 0.35 : -0.35) * (s.vx / speed);
      // brush strokes wiggle sideways with the intensity
      const wig = active ? Math.sin(performance.now() / (60 - 25 * sw.effective) + k) * 0.05 * this.scale : 0;
      ctx.save();
      ctx.translate(this.sx(x), this.sy(y));
      ctx.rotate(ang);
      ctx.fillStyle = sw.down ? (k > 1 ? '#7a1f6b' : '#12354d') : 'rgba(18, 53, 77, 0.35)';
      ctx.fillRect((-SWEEP.brushDepth / 2) * this.scale, (-SWEEP.brushWidth / 2) * this.scale + wig, SWEEP.brushDepth * this.scale, SWEEP.brushWidth * this.scale);
      ctx.restore();
    });
  }

  private mapHeight(): number {
    return Math.min((this.h - this.top - this.bottom) * 0.7, 380);
  }
  private mapWidth(): number {
    return (SHEET.width * this.mapHeight()) / SHEET.length;
  }

  /** Overview of the whole sheet at the right edge. */
  private drawMinimap(game: Game): void {
    const ctx = this.ctx;
    const mh = this.mapHeight();
    const k = mh / SHEET.length;
    const mw = SHEET.width * k;
    const x0 = this.w - mw - 8;
    const y0 = this.top + 12;
    const mx = (x: number): number => x0 + mw / 2 + this.dir * x * k;
    const my = (y: number): number => y0 + mh / 2 - this.dir * y * k;
    ctx.fillStyle = 'rgba(238, 245, 250, 0.9)';
    ctx.fillRect(x0, y0, mw, mh);
    for (const d of [1, -1] as Dir[]) {
      ctx.beginPath();
      ctx.arc(mx(0), my(teeY(d)), SHEET.houseRadii[0] * k, 0, Math.PI * 2);
      ctx.fillStyle = '#1c64b0';
      ctx.fill();
      ctx.fillStyle = '#c8202f';
      ctx.fillRect(x0, my(nearHogY(d)) - 0.5, mw, 1);
    }
    for (const s of game.viewWorld.stones) {
      if (!s.inPlay) continue;
      ctx.beginPath();
      ctx.arc(mx(s.x), my(s.y), Math.max(2, STONE.radius * k * 1.6), 0, Math.PI * 2);
      ctx.fillStyle = TEAM_COLORS[s.team % 2];
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // visible window
    ctx.strokeStyle = '#0a7d3b';
    ctx.lineWidth = 1;
    const vy = ((this.h - this.top - this.bottom) / this.scale) * k;
    ctx.strokeRect(x0, my(this.camY) - vy / 2, mw, vy);
  }
}
