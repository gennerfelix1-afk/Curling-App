import * as THREE from 'three';
import type { Game } from '../game/game';
import { ICE, SHEET, STONE, SWEEP } from '../physics/config';
import { backLineY, farHogY, hackY, HALF_LENGTH, HALF_WIDTH, nearHogY, teeY, type Dir } from '../physics/sheet';
import type { Stone } from '../physics/stone';
import { World } from '../physics/world';
import { buildArena, graniteMap, setupEnvironment, type Arena } from './arena';
import type { CameraMode, GameView } from './view';

const TEAM_COLORS = [0xd62839, 0xf2c230];
const FOV = 45;
const UP = new THREE.Vector3(0, 1, 0);

/** Sheet (x, y) → three.js world: X = x, Y = up, Z = -y. */
const V = (x: number, y: number, h = 0): THREE.Vector3 => new THREE.Vector3(x, h, -y);

function flat(geo: THREE.BufferGeometry, color: number, h: number, opacity = 1): THREE.Mesh {
  // opaque markings lie "in the ice": glossy like it and able to receive the stones' shadows
  const mat =
    opacity < 1
      ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0, envMapIntensity: 0.35, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = opacity >= 1;
  m.rotation.x = -Math.PI / 2;
  m.position.y = h;
  m.renderOrder = Math.round(h * 10000);
  return m;
}

interface StoneMesh {
  group: THREE.Group;
  cap: THREE.Mesh;
  shadow: THREE.Mesh;
}

/**
 * Three.js view: slightly raised 3D camera that starts behind the thrower, follows the stone and
 * switches to a top view near the house. Reads the game state only – no game logic in here.
 */
export class View3D implements GameView {
  cameraMode: CameraMode = 'auto';
  debug = false;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private w = 1;
  private h = 1;
  private top = 96;
  private bottom = 150;
  /** Taller control panel while delivering (power scale / line gauge). */
  private readonly bottomDelivery = 235;

  private camPos = new THREE.Vector3(0, 12, 0);
  private camTarget = new THREE.Vector3();
  private camInit = false;
  private sun!: THREE.DirectionalLight;
  private arena!: Arena;
  /** Shadows and spectators are switched off when the device cannot keep up. */
  private detailOn = true;
  /** `?quality=high` keeps all detail regardless of the frame rate (for screenshots / strong devices). */
  private pinQuality = new URLSearchParams(location.search).get('quality') === 'high';

  private stones: StoneMesh[] = [];
  private stoneGeo!: { body: THREE.BufferGeometry; cap: THREE.BufferGeometry; handle: THREE.BufferGeometry; grip: THREE.BufferGeometry };
  private capMats = TEAM_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
  private granite = new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.55, metalness: 0.05 });

  private heatTex!: THREE.DataTexture;
  private heatData!: Uint8Array;
  private heatDirty: number[] = [];
  private heatMode = '';
  private lastIce: unknown = null;
  private heatFrame = 0;
  private lastPreview: readonly number[] | null = null;
  private lastResultKey = '';
  /** Adaptive resolution: frame time average and current pixel ratio. */
  private frameAvg = 16;
  private pixelRatio = 1;
  private slowFor = 0;

  private broom = new THREE.Group();
  private preview!: THREE.Line;
  private predicted!: THREE.Line;
  private aimLine!: THREE.Line;
  private aimKey = '';
  /** Ice spray at impacts: a small pool of particles. */
  private sparks!: THREE.Points;
  private sparkVel = new Float32Array(96 * 3);
  private sparkLife = new Float32Array(96);
  private sparkNext = 0;
  private shake = 0;
  private brushes: THREE.Group[] = [];
  private rings: THREE.Mesh[] = [];
  private measureLines!: THREE.LineSegments;
  private arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, 0x00a060);
  private labels: HTMLElement;
  private debugBox: HTMLElement;
  private predictAge = 99;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(UP, 0);

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    // on high-density screens the pixel density already smooths the edges
    const antialias = (window.devicePixelRatio || 1) < 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x0a1620);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setupEnvironment(this.renderer, this.scene);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa6ba, 0.8));
    // hall lights from above; the shadow area follows the camera target
    this.sun = new THREE.DirectionalLight(0xffffff, 1.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 1;
    sc.far = 30;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);
    this.arena = buildArena(this.scene);
    this.granite.map = graniteMap();
    this.granite.color.setHex(0xffffff);
    this.buildSheet();
    this.buildStoneGeometry();
    this.buildMarkers();
    this.labels = document.createElement('div');
    this.labels.className = 'labels3d';
    overlay.appendChild(this.labels);
    this.debugBox = document.createElement('pre');
    this.debugBox.className = 'debug3d';
    overlay.appendChild(this.debugBox);
  }

  // ───────────── static scene ─────────────

  private buildSheet(): void {
    const sc = this.scene;
    // ice, hall and stands come from the arena; here: the markings of the playing sheet

    const ringColors = [0x1c64b0, 0xeaf3f9, 0xc8202f, 0xeaf3f9];
    for (const d of [1, -1] as Dir[]) {
      const ty = teeY(d);
      SHEET.houseRadii.forEach((r, i) => {
        const m = flat(new THREE.CircleGeometry(r, 72), ringColors[i], 0.001 + i * 0.0004);
        m.position.set(0, m.position.y, -ty);
        sc.add(m);
      });
      const line = (y: number, width: number, color: number): void => {
        const m = flat(new THREE.PlaneGeometry(SHEET.width, width), color, 0.003);
        m.position.z = -y;
        sc.add(m);
      };
      line(ty, 0.02, 0x33475b);
      line(backLineY(d), 0.02, 0x33475b);
      line(farHogY(d) - d * (SHEET.hogLineWidth / 2), SHEET.hogLineWidth, 0xc8202f);
      // hack
      for (const side of [-1, 1]) {
        const hack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0x1b1b1b }));
        hack.position.copy(V(side * 0.12, hackY(d === 1 ? -1 : 1), 0.025));
        sc.add(hack);
      }
      // end boards
      const end = new THREE.Mesh(new THREE.BoxGeometry(SHEET.width + 0.3, 0.14, 0.15), new THREE.MeshStandardMaterial({ color: 0x6b4423 }));
      end.position.copy(V(0, d * (HALF_LENGTH + 0.075), 0.07));
      sc.add(end);
    }
    const centre = flat(new THREE.PlaneGeometry(0.02, SHEET.teeToTee + 2 * SHEET.teeToHack), 0x33475b, 0.0032);
    sc.add(centre);
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, SHEET.length), new THREE.MeshStandardMaterial({ color: 0x6b4423 }));
      board.position.set(side * (HALF_WIDTH + 0.075), 0.07, 0);
      sc.add(board);
    }
  }

  /** Overlay texture on the ice: sweep marks, or the friction field in debug mode. */
  private ensureHeat(game: Game): void {
    if (this.heatTex) return;
    const ice = game.viewIce;
    this.heatData = new Uint8Array(ice.nx * ice.ny * 4);
    this.heatTex = new THREE.DataTexture(this.heatData, ice.nx, ice.ny, THREE.RGBAFormat);
    this.heatTex.magFilter = THREE.LinearFilter;
    this.heatTex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(ice.nx * ice.cell, ice.ny * ice.cell),
      new THREE.MeshBasicMaterial({ map: this.heatTex, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    // texture row 0 = sheet y0 (most negative y) = +Z in three → flip V
    m.scale.y = -1;
    (m.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    m.position.set(ice.x0 + (ice.nx * ice.cell) / 2, 0.004, -(ice.y0 + (ice.ny * ice.cell) / 2));
    m.renderOrder = 60;
    this.scene.add(m);
  }

  private updateHeat(game: Game): void {
    this.ensureHeat(game);
    const ice = game.viewIce;
    if (ice !== this.lastIce) {
      // another ice object (replay ↔ game): repaint from scratch
      this.lastIce = ice;
      this.heatMode = '';
      this.heatDirty.length = 0;
    }
    // uploading the texture is the expensive part: at most every other frame
    this.heatFrame++;
    if (this.heatFrame % 2 === 1 && this.heatMode !== '') return;
    const d = this.heatData;
    const mode = this.debug ? 'debug' : 'heat';
    let changed = false;
    if (mode === 'debug') {
      // friction field: red = more friction, blue = less; refreshed a few times per second
      if (this.heatMode !== mode || this.predictAge === 0) {
        for (let k = 0; k < ice.mu.length; k++) {
          const dev = (ice.mu[k] - 1) * 12;
          const a = Math.min(1, Math.abs(dev));
          d[k * 4] = dev > 0 ? 230 : 30;
          d[k * 4 + 1] = 60;
          d[k * 4 + 2] = dev > 0 ? 40 : 230;
          d[k * 4 + 3] = Math.round(a * 170);
        }
        changed = true;
      }
    } else {
      if (this.heatMode !== mode) {
        d.fill(0);
        changed = true;
      }
      for (const k of this.heatDirty) d[k * 4 + 3] = 0;
      if (this.heatDirty.length) changed = true;
      this.heatDirty.length = 0;
      for (const k of ice.hotCells) {
        const h = ice.heat[k];
        d[k * 4] = 60;
        d[k * 4 + 1] = 150;
        d[k * 4 + 2] = 225;
        d[k * 4 + 3] = Math.round(Math.min(0.6, 0.7 * (h / (h + ICE.heatHalf))) * 255);
        this.heatDirty.push(k);
        changed = true;
      }
    }
    this.heatMode = mode;
    if (changed) this.heatTex.needsUpdate = true;
  }

  private buildStoneGeometry(): void {
    const R = STONE.radius;
    // profile of a curling stone (lathe): flat running surface, bulging striking band
    const pts = [
      [0.0, 0.0], [R * 0.45, 0.0], [R * 0.82, 0.012], [R * 0.98, 0.04], [R, 0.062],
      [R * 0.98, 0.085], [R * 0.82, 0.108], [R * 0.5, 0.114], [0.0, 0.114],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.stoneGeo = {
      body: new THREE.LatheGeometry(pts, 40),
      cap: new THREE.CylinderGeometry(R * 0.62, R * 0.66, 0.02, 32),
      handle: new THREE.CylinderGeometry(0.012, 0.012, 0.045, 10),
      grip: new THREE.BoxGeometry(0.115, 0.022, 0.026),
    };
  }

  private stoneMesh(i: number): StoneMesh {
    while (this.stones.length <= i) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.stoneGeo.body, this.granite);
      const cap = new THREE.Mesh(this.stoneGeo.cap, this.capMats[0]);
      cap.position.y = 0.122;
      const post = new THREE.Mesh(this.stoneGeo.handle, this.capMats[0]);
      post.position.set(-0.03, 0.15, 0);
      const grip = new THREE.Mesh(this.stoneGeo.grip, this.capMats[0]);
      grip.position.set(0.018, 0.175, 0);
      group.add(body, cap, post, grip);
      for (const part of group.children) part.castShadow = true;
      const shadow = flat(new THREE.CircleGeometry(STONE.radius * 1.1, 24), 0x000000, 0.0045, 0.16);
      this.scene.add(group, shadow);
      this.stones.push({ group, cap, shadow });
    }
    return this.stones[i];
  }

  private buildMarkers(): void {
    // the skip's broom
    const ring = flat(new THREE.RingGeometry(0.1, 0.14, 32), 0x0a7d3b, 0.006);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x0a7d3b }));
    stick.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x0a7d3b }));
    head.position.y = 0.02;
    this.broom.add(ring, stick, head);
    this.scene.add(this.broom);

    const dashed = new THREE.LineDashedMaterial({ color: 0x14783c, dashSize: 0.18, gapSize: 0.14, depthTest: false });
    this.preview = new THREE.Line(new THREE.BufferGeometry(), dashed);
    this.preview.renderOrder = 80;
    this.predicted = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff7a00, depthTest: false }));
    this.predicted.renderOrder = 81;
    this.measureLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false }));
    this.measureLines.renderOrder = 82;
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3).fill(-999), 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.9, depthWrite: false }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.aimLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0a7d3b, depthTest: false }));
    this.aimLine.renderOrder = 79;
    this.scene.add(this.preview, this.predicted, this.aimLine, this.measureLines, this.arrow);

    // brushes: 0, 1 = sweepers, 2 = the other team's skip
    for (let k = 0; k < SWEEP.sweepers; k++) {
      const g = new THREE.Group();
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(SWEEP.brushWidth, 0.03, SWEEP.brushDepth),
        new THREE.MeshStandardMaterial({ color: k > 1 ? 0x7a1f6b : 0x12354d }),
      );
      pad.position.y = 0.02;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.25, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      // handle leaning back towards the sweeper, who walks beside the path
      const side = k % 2 ? 1 : -1;
      shaft.position.set(side * 0.16, 0.5, 0.28);
      shaft.rotation.order = 'ZXY';
      shaft.rotation.set(0.5, 0, -side * 0.3);
      g.add(pad, shaft);
      this.scene.add(g);
      this.brushes.push(g);
    }
  }

  // ───────────── camera ─────────────

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    if (this.pixelRatio === 1 && this.frameAvg === 16) this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    const c = this.renderer.domElement;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
  }

  playHeight(): number {
    return this.h - this.top - this.bottom;
  }

  /** Camera height from which a rectangle of the given size fits into the view. */
  private fitHeight(width: number, length: number): number {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = this.w / this.playHeight();
    return Math.max(length / 2 / t, width / 2 / (t * aspect)) * 1.04;
  }

  private updateCamera(game: Game, dt: number): void {
    const d = game.dir;
    const tee = teeY(d);
    const pos = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const house = (): void => {
      // top view of the playing end: hog line to back line
      const cy = tee - d * 2.2;
      const hgt = this.fitHeight(SHEET.width + 0.5, 9.0);
      tgt.copy(V(0, cy, 0));
      pos.copy(V(0, cy - d * hgt * 0.12, hgt));
    };
    const s = game.viewStone;
    let mode: 'house' | 'delivery' | 'follow' | 'sheet' = 'house';
    if (this.cameraMode === 'sheet') mode = 'sheet';
    else if (this.cameraMode === 'auto') {
      const ph = game.phase;
      if (ph === 'meterWeight' || ph === 'meterLine' || ph === 'gesture' || ph === 'charge' || ph === 'glide' || ph === 'slide') mode = 'delivery';
      else if ((ph === 'running' || ph === 'replay') && s && s.inPlay && s.y * d < farHogY(d) * d - 1.5) mode = 'follow';
    }
    switch (mode) {
      case 'delivery': {
        const sy = s ? s.y : hackY(d);
        const sx = s ? s.x : 0;
        // tall (portrait) screens look down more steeply so the ice fills the view
        const tall = this.w / this.playHeight() < 1;
        pos.copy(V(sx * 0.5, sy - d * (tall ? 4.6 : 3.2), tall ? 3.6 : 1.8));
        tgt.copy(V(sx, sy + d * (tall ? 3.6 : 8), 0));
        break;
      }
      case 'follow':
      {
        const tall = this.w / this.playHeight() < 1;
        pos.copy(V(s!.x * 0.7, s!.y - d * (tall ? 4.2 : 3.6), tall ? 3.8 : 2.0));
        tgt.copy(V(s!.x, s!.y + d * (tall ? 4.5 : 5), 0));
      }
        break;
      case 'sheet': {
        const hgt = this.fitHeight(SHEET.width + 1, SHEET.length * 0.62);
        pos.copy(V(0, -d * (HALF_LENGTH + 6), hgt * 0.75));
        tgt.copy(V(0, d * 2, 0));
        break;
      }
      default:
        house();
    }
    if (!this.camInit) {
      this.camPos.copy(pos);
      this.camTarget.copy(tgt);
      this.camInit = true;
    } else {
      const k = 1 - Math.pow(0.012, dt);
      this.camPos.lerp(pos, k);
      this.camTarget.lerp(tgt, k);
    }
    this.camera.aspect = this.w / this.playHeight();
    this.camera.updateProjectionMatrix();
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.sun.position.set(this.camTarget.x + 2.5, 14, this.camTarget.z + 3);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.002, dt);
    }
    // looking almost straight down: keep "up" along the sheet so the play direction points up
    this.camera.up.set(0, 0.2, -d).normalize();
    this.camera.lookAt(this.camTarget);
  }

  /** Stone hits stone: a burst of ice spray and a short camera shake. */
  impact(x: number, y: number, strength: number): void {
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.round(8 + 22 * strength);
    for (let i = 0; i < n; i++) {
      const k = this.sparkNext;
      this.sparkNext = (this.sparkNext + 1) % 96;
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random() * 1.6) * (0.4 + strength);
      pos.setXYZ(k, x, 0.08, -y);
      this.sparkVel[k * 3] = Math.cos(a) * v;
      this.sparkVel[k * 3 + 1] = 0.6 + Math.random() * 1.4 * strength;
      this.sparkVel[k * 3 + 2] = Math.sin(a) * v;
      this.sparkLife[k] = 0.35 + Math.random() * 0.4;
    }
    pos.needsUpdate = true;
    this.shake = Math.max(this.shake, 0.05 * strength);
  }

  private updateSparks(dt: number): void {
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    let any = false;
    for (let k = 0; k < 96; k++) {
      if (this.sparkLife[k] <= 0) continue;
      any = true;
      this.sparkLife[k] -= dt;
      if (this.sparkLife[k] <= 0) {
        pos.setY(k, -999);
        continue;
      }
      this.sparkVel[k * 3 + 1] -= 6 * dt;
      const y = Math.max(0.01, pos.getY(k) + this.sparkVel[k * 3 + 1] * dt);
      pos.setXYZ(k, pos.getX(k) + this.sparkVel[k * 3] * dt, y, pos.getZ(k) + this.sparkVel[k * 3 + 2] * dt);
    }
    if (any) pos.needsUpdate = true;
  }

  toSheet(px: number, py: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((px / this.w) * 2 - 1, -(((py - this.top) / this.playHeight()) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    return { x: hit.x, y: -hit.z };
  }

  private toScreen(x: number, y: number, h: number): { x: number; y: number } {
    const p = V(x, y, h).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.w, y: this.top + ((1 - p.y) / 2) * this.playHeight() };
  }

  // ───────────── per-frame ─────────────

  /** Lower the render resolution when the device cannot keep up (keeps the game fluid on phones). */
  private adaptResolution(dt: number): void {
    this.frameAvg += (dt * 1000 - this.frameAvg) * 0.05;
    this.slowFor = this.frameAvg > 24 ? this.slowFor + dt : 0;
    if (this.slowFor > 2 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.5);
      this.slowFor = 0;
      this.frameAvg = 17;
      this.resize(this.w, this.h);
    } else if (this.slowFor > 2 && this.detailOn && !this.pinQuality) {
      // still too slow at the lowest resolution: no shadows, no spectators
      this.detailOn = false;
      this.sun.castShadow = false;
      for (const o of this.arena.detail) o.visible = false;
      this.slowFor = 0;
      this.frameAvg = 17;
    }
  }

  draw(game: Game, dt: number): void {
    this.bottom = game.phase === 'charge' || game.phase === 'glide' ? this.bottomDelivery : 150;
    this.adaptResolution(dt);
    this.updateCamera(game, dt);
    this.updateHeat(game);

    // stones
    let n = 0;
    for (const s of game.viewWorld.stones) {
      if (!s.inPlay) continue;
      const m = this.stoneMesh(n++);
      m.group.visible = m.shadow.visible = true;
      m.group.position.set(s.x, 0, -s.y);
      m.group.rotation.y = s.angle;
      m.shadow.position.set(s.x, m.shadow.position.y, -s.y);
      const mat = this.capMats[s.team % 2];
      if (m.cap.material !== mat) for (let i = 1; i < 4; i++) (m.group.children[i] as THREE.Mesh).material = mat;
    }
    for (; n < this.stones.length; n++) this.stones[n].group.visible = this.stones[n].shadow.visible = false;

    // broom and preview
    const aiming = game.phase !== 'endScore' && game.phase !== 'gameOver' && game.phase !== 'replay';
    this.broom.visible = aiming;
    this.broom.position.set(game.aimX, 0, -game.aimY);
    const p = game.preview();
    this.preview.visible = p.length >= 4;
    if (this.preview.visible && p !== this.lastPreview) {
      this.lastPreview = p;
      this.setLine(this.preview, p, 0.012);
    }

    // while delivering: the line from the hack to the broom
    const delivering = game.phase === 'charge' || game.phase === 'glide';
    this.aimLine.visible = delivering;
    if (delivering) {
      const key = `${game.aimX},${game.aimY}`;
      if (key !== this.aimKey) {
        this.aimKey = key;
        this.setLine(this.aimLine, [0, hackY(game.dir), game.aimX, game.aimY], 0.013);
      }
    }

    this.updateSparks(dt);
    this.drawSweepers(game);
    this.drawResult(game);
    this.drawDebug(game, dt);

    const r = this.renderer;
    r.setScissorTest(false);
    r.clear();
    r.setViewport(0, this.bottom, this.w, this.playHeight());
    r.setScissor(0, this.bottom, this.w, this.playHeight());
    r.setScissorTest(true);
    r.render(this.scene, this.camera);
  }

  private setLine(line: THREE.Line, pts: readonly number[], h: number): void {
    const arr = new Float32Array((pts.length / 2) * 3);
    for (let i = 0; i < pts.length / 2; i++) {
      arr[i * 3] = pts[i * 2];
      arr[i * 3 + 1] = h;
      arr[i * 3 + 2] = -pts[i * 2 + 1];
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    line.computeLineDistances();
  }

  private drawSweepers(game: Game): void {
    const s = game.viewStone;
    const speed = s ? Math.sqrt(s.vx * s.vx + s.vy * s.vy) : 0;
    const show = (game.phase === 'running' || game.phase === 'replay') && !!s && s.inPlay && speed > 0.01;
    const now = performance.now();
    this.brushes.forEach((g, k) => {
      const sw = game.viewWorld.sweepers.state[k];
      g.visible = show && (k < 2 || sw.down);
      if (!g.visible || !s) return;
      const fx = s.vx / speed;
      const fy = s.vy / speed;
      let x: number;
      let y: number;
      if (sw.down) {
        // stroke across the path, faster with more intensity
        const wig = Math.sin(now / (55 - 25 * sw.effective) + k * 2) * 0.06;
        x = sw.x + -fy * wig;
        y = sw.y + fx * wig;
      } else {
        // walking beside the stone, brush lifted
        const side = k ? 0.42 : -0.42;
        x = s.x + fx * (0.45 + k * 0.2) + fy * side;
        y = s.y + fy * (0.45 + k * 0.2) - fx * side;
      }
      g.position.set(x, sw.down ? 0 : 0.12, -y);
      g.rotation.y = Math.atan2(fx, fy) + Math.PI;
    });
  }

  /** End result: rings around the counting stones, measuring lines and distance labels. */
  private drawResult(game: Game): void {
    const r = game.phase === 'endScore' ? game.endResult : null;
    const find = (id: number): Stone | undefined => game.viewWorld.stones.find((q) => q.id === id);
    let n = 0;
    const seg: number[] = [];
    let html = '';
    if (r) {
      for (let i = 0; i < r.points; i++) {
        const s = find(r.ranking[i].id);
        if (!s) continue;
        if (this.rings.length <= n) {
          const ring = flat(new THREE.RingGeometry(STONE.radius * 1.15, STONE.radius * 1.32, 32), 0x0a7d3b, 0.007);
          this.scene.add(ring);
          this.rings.push(ring);
        }
        const ring = this.rings[n++];
        ring.visible = true;
        ring.position.set(s.x, ring.position.y, -s.y);
      }
      for (const m of r.measured) {
        const s = find(m.id);
        if (!s) continue;
        seg.push(0, 0.16, -teeY(game.dir), s.x, 0.16, -s.y);
        const p = this.toScreen(s.x, s.y, 0.3);
        html += `<span style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">${(m.dist * 100).toFixed(1)} cm</span>`;
      }
    }
    for (; n < this.rings.length; n++) this.rings[n].visible = false;
    const key = seg.join();
    if (key !== this.lastResultKey) {
      this.lastResultKey = key;
      this.measureLines.geometry.dispose();
      this.measureLines.geometry = new THREE.BufferGeometry();
      this.measureLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
    }
    if (this.labels.innerHTML !== html) this.labels.innerHTML = html;
  }

  /** Debug overlay: friction field, velocity arrow, predicted path, numbers. */
  private drawDebug(game: Game, dt: number): void {
    const s = game.viewStone;
    const on = this.debug;
    this.debugBox.style.display = on ? '' : 'none';
    const moving = on && (game.phase === 'running' || game.phase === 'replay') && !!s && s.inPlay && s.moving;
    this.arrow.visible = moving;
    this.predicted.visible = moving;
    this.predictAge = on ? this.predictAge + dt : 99;
    if (!on) return;
    if (this.predictAge > 0.3) this.predictAge = 0;
    const ice = game.viewIce;
    let text = `Eis μ0 ${ice.mu0.toFixed(5)}  Curl ×${ice.curlScale.toFixed(2)}  warme Zellen ${ice.hotCount}\n`;
    if (s && moving) {
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      this.arrow.position.set(s.x, 0.2, -s.y);
      this.arrow.setDirection(new THREE.Vector3(s.vx, 0, -s.vy).normalize());
      this.arrow.setLength(Math.max(0.3, speed), 0.15, 0.1);
      if (this.predictAge === 0) {
        // where the stone stops if nobody sweeps from now on
        const w = new World(ice, 1);
        w.mutateIce = false;
        w.dir = game.dir;
        for (const q of game.viewWorld.stones) if (q.inPlay) w.addStone({ ...q });
        const me = w.getStone(s.id)!;
        const path = [me.x, me.y];
        while (!w.isAtRest() && w.tick < 240 * 60) {
          w.step();
          if (w.tick % 24 === 0) path.push(me.x, me.y);
        }
        path.push(me.x, me.y);
        this.setLine(this.predicted, path, 0.014);
      }
      const sw = game.viewWorld.sweepers.state;
      text +=
        `v ${speed.toFixed(3)} m/s  ω ${s.omega.toFixed(3)} rad/s  Umdr. ${(Math.abs(s.angle) / (2 * Math.PI)).toFixed(2)}\n` +
        `Pos x ${s.x.toFixed(3)}  y ${s.y.toFixed(3)}  Rest zum Tee ${((teeY(game.dir) - s.y) * game.dir).toFixed(2)} m\n` +
        `Reibungsfaktor ${ice.sampleMu(s.x, s.y).toFixed(3)}  Curl-Faktor ${ice.sampleCurl(s.x, s.y).toFixed(3)}\n` +
        `Wischer ${sw.map((q) => `${q.effective.toFixed(2)}${q.down ? '↓' : ' '} (müde ${q.fatigue.toFixed(2)})`).join('  ')}\n` +
        `orange = Bahn ohne weiteres Wischen · Feld: rot = mehr Reibung, blau = weniger`;
    } else {
      text += `Phase ${game.phase}  Tick ${game.world.tick}  nahe Hog ${nearHogY(game.dir).toFixed(2)}`;
    }
    if (this.debugBox.textContent !== text) this.debugBox.textContent = text;
  }
}
