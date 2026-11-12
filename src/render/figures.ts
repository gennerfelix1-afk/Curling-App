import * as THREE from 'three';
import type { Game } from '../game/game';
import { backLineY, hackY, type Dir } from '../physics/sheet';

/**
 * The players on the ice, built and animated in code: the thrower in the delivery lunge, two
 * sweepers who walk and brush, the skip holding the broom, and the other team's skip.
 * Simple jointed figures (capsules) – stylised, cheap to render, no asset files.
 */

/** Joint angles of a pose [rad]. Positive pitch swings a limb forward. */
interface Pose {
  /** Height of the hips above the ice [m]. */
  hip: number;
  /** Forward lean of the upper body. */
  lean: number;
  head: number;
  /** Shoulders: pitch (forward) and spread (sideways, away from the body). */
  lArm: number;
  lSpread: number;
  lElbow: number;
  rArm: number;
  rSpread: number;
  rElbow: number;
  /** Hips and knees (knee > 0 = bent). */
  lLeg: number;
  lKnee: number;
  rLeg: number;
  rKnee: number;
}

const STAND: Pose = { hip: 0.88, lean: 0.05, head: 0, lArm: 0.1, lSpread: 0.08, lElbow: 0.2, rArm: 0.1, rSpread: 0.08, rElbow: 0.2, lLeg: 0, lKnee: 0, rLeg: 0, rKnee: 0 };
/** Skip: one hand on the broom that marks the target. */
const SKIP: Pose = { ...STAND, lean: 0.12, rArm: 0.95, rElbow: 0.5, lArm: 0.15 };
/** Crouched in the hack, ready to push off. */
const HACK: Pose = { hip: 0.46, lean: 0.95, head: 0.7, lArm: 1.5, lSpread: 0.7, lElbow: 0.2, rArm: 1.35, rSpread: 0.05, rElbow: 0.15, lLeg: 1.5, lKnee: 1.9, rLeg: 0.5, rKnee: 2.0 };
/** Delivery lunge: sliding foot under the chest, trailing leg stretched back, hand on the stone. */
const SLIDE: Pose = { hip: 0.36, lean: 1.15, head: 0.95, lArm: 1.6, lSpread: 0.9, lElbow: 0.15, rArm: 1.65, rSpread: 0.05, rElbow: 0.1, lLeg: 1.7, lKnee: 1.95, rLeg: -1.25, rKnee: 0.12 };
/** Sweeper: bent over the brush, knees flexed. */
const SWEEP: Pose = { hip: 0.74, lean: 0.95, head: 0.55, lArm: 1.75, lSpread: -0.1, lElbow: 0.35, rArm: 1.45, rSpread: -0.1, rElbow: 0.5, lLeg: 0.45, lKnee: 0.7, rLeg: 0.45, rKnee: 0.7 };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function mix(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}

const SKIN = [0xf1c9a5, 0xd9a06f, 0x9c6b47, 0xf6d7bd];

class Figure {
  readonly group = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  /** Left and right hand (for holding a broom). */
  readonly hands: THREE.Mesh[] = [];
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private mats: THREE.MeshStandardMaterial[];
  private pose: Pose = { ...STAND };

  constructor(jacket: number, skin: number) {
    const jacketMat = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.75 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.6 });
    this.mats = [jacketMat, pantsMat, skinMat, shoeMat];
    const limb = (len: number, r: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 3, 8), mat);
      m.position.y = -len / 2; // hangs from its joint
      m.castShadow = true;
      return m;
    };
    // upper body, pivoting at the hips
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), jacketMat);
    chest.position.y = 0.3;
    chest.scale.set(1.15, 1, 0.8);
    chest.castShadow = true;
    this.torso.add(chest);
    this.head.position.y = 0.6;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), skinMat);
    skull.position.y = 0.11;
    skull.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), jacketMat);
    cap.position.y = 0.12;
    this.head.add(skull, cap);
    this.torso.add(this.head);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.21, 0.5, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
      hand.position.y = -0.27;
      elbow.add(limb(0.27, 0.042, jacketMat), hand);
      this.hands.push(hand);
      shoulder.add(limb(0.28, 0.05, jacketMat), elbow);
      this.torso.add(shoulder);
      this.arms.push({ shoulder, elbow });

      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.24), shoeMat);
      foot.position.set(0, -0.44, -0.06);
      foot.castShadow = true;
      knee.add(limb(0.43, 0.055, pantsMat), foot);
      hip.add(limb(0.43, 0.075, pantsMat), knee);
      this.group.add(hip);
      this.legs.push({ hip, knee });
    }
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), pantsMat);
    pelvis.scale.set(1.1, 0.7, 0.8);
    this.group.add(this.torso, pelvis);
  }

  /** Move smoothly towards a pose; `extra` adds animation on top (walking, brushing). */
  apply(target: Pose, dt: number, extra?: Partial<Pose>): void {
    const k = 1 - Math.pow(0.0005, dt);
    const p = this.pose;
    for (const key of Object.keys(p) as (keyof Pose)[]) p[key] += (target[key] - p[key]) * k;
    const q = extra ? { ...p } : p;
    if (extra) for (const key of Object.keys(extra) as (keyof Pose)[]) q[key] += extra[key]!;
    this.torso.position.y = 0;
    this.group.position.y = q.hip;
    this.torso.rotation.x = -q.lean;
    this.head.rotation.x = q.head;
    const [l, r] = this.arms;
    l.shoulder.rotation.set(q.lArm, 0, -q.lSpread);
    l.elbow.rotation.x = q.lElbow;
    r.shoulder.rotation.set(q.rArm, 0, q.rSpread);
    r.elbow.rotation.x = q.rElbow;
    const [ll, rl] = this.legs;
    ll.hip.rotation.x = q.lLeg;
    ll.knee.rotation.x = -q.lKnee;
    rl.hip.rotation.x = q.rLeg;
    rl.knee.rotation.x = -q.rKnee;
  }

  /** Stand at a point of the sheet, facing the direction (fx, fy). */
  place(x: number, y: number, fx: number, fy: number): void {
    this.group.position.x = x;
    this.group.position.z = -y;
    this.group.rotation.y = Math.atan2(-fx, fy);
  }

  setOpacity(o: number): void {
    this.group.visible = o > 0.02;
    for (const m of this.mats) {
      m.transparent = o < 0.99;
      m.opacity = o;
      m.depthWrite = o >= 0.99;
    }
  }

  /** World position of a hand (0 = left, 1 = right), or the midpoint of both (-1). */
  hand(which: number, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    if (which >= 0) return this.hands[which].getWorldPosition(out);
    const a = this.hands[0].getWorldPosition(out);
    const b = this.hands[1].getWorldPosition(new THREE.Vector3());
    return a.add(b).multiplyScalar(0.5);
  }

  get opacity(): number {
    return this.mats[0].opacity;
  }

  setJacket(color: number): void {
    this.mats[0].color.setHex(color);
  }
}

export interface BrushPose {
  x: number;
  y: number;
  /** Direction of travel. */
  fx: number;
  fy: number;
  visible: boolean;
  down: boolean;
  effective: number;
}

const TEAM_JACKETS = [0xc8202f, 0xe0b020];

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpD = new THREE.Vector3();

/** A broom: stick from the head on the ice up through the hands (plus a little beyond). */
class Broom {
  readonly stick: THREE.Mesh;
  readonly head: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, headColor: number) {
    this.mat = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.5, metalness: 0.3 });
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 8), this.mat);
    this.stick.castShadow = true;
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.1), new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.8 }));
    this.head.castShadow = true;
    scene.add(this.stick, this.head);
  }

  /** Stick from `foot` (on the ice) through `grip`, reaching 0.25 m beyond the grip. */
  set(foot: THREE.Vector3, grip: THREE.Vector3, heading: number, visible: boolean): void {
    this.stick.visible = this.head.visible = visible;
    if (!visible) return;
    tmpD.subVectors(grip, foot);
    const len = tmpD.length() + 0.25;
    tmpD.normalize();
    this.stick.scale.set(1, len, 1);
    this.stick.position.copy(foot).addScaledVector(tmpD, len / 2);
    this.stick.quaternion.setFromUnitVectors(UP, tmpD);
    this.head.position.set(foot.x, foot.y + 0.018, foot.z);
    this.head.rotation.set(0, heading, 0);
  }
}

/** All figures of the delivering team plus the other skip. */
export class Crew {
  private thrower = new Figure(TEAM_JACKETS[0], SKIN[0]);
  private sweepers = [new Figure(TEAM_JACKETS[0], SKIN[1]), new Figure(TEAM_JACKETS[0], SKIN[2])];
  private skip = new Figure(TEAM_JACKETS[0], SKIN[3]);
  private otherSkip = new Figure(TEAM_JACKETS[1], SKIN[1]);
  private walk = 0;
  private opacity = 1;
  private skipOpacity = 0;
  private sinceRelease = 0;
  private throwX = 0;
  private throwY = 0;
  private team = -1;
  /** Direction of the delivery (sheet coordinates). */
  private throwFx = 0;
  private throwFy = 1;
  private brooms: Broom[];
  private throwerBroom: Broom;
  private skipBroom: Broom;

  constructor(scene: THREE.Scene) {
    for (const f of [this.thrower, ...this.sweepers, this.skip, this.otherSkip]) scene.add(f.group);
    // sweepers 0, 1 and the other team's skip (2)
    this.brooms = [new Broom(scene, 0x12354d), new Broom(scene, 0x12354d), new Broom(scene, 0x7a1f6b)];
    // the thrower slides with a broom in the left hand for balance; the skip holds the target broom
    this.throwerBroom = new Broom(scene, 0x12354d);
    this.skipBroom = new Broom(scene, 0x0a7d3b);
  }

  /**
   * @param brushes where the brushes of sweepers 0, 1 and the other skip (2) are this frame
   * @param topView true while the camera looks straight down at the house
   * @param camera camera position – the thrower fades out when the camera passes him
   */
  update(game: Game, dt: number, brushes: readonly BrushPose[], topView: boolean, camera: THREE.Vector3): void {
    const d: Dir = game.dir;
    const ph = game.phase;
    const s = game.viewStone;
    const team = s ? s.team : game.team;
    if (team !== this.team) {
      this.team = team;
      for (const f of [this.thrower, ...this.sweepers, this.skip]) f.setJacket(TEAM_JACKETS[team % 2]);
      this.otherSkip.setJacket(TEAM_JACKETS[(team + 1) % 2]);
    }
    // seen from straight above the figures would hide the stones: fade them out there
    const k = 1 - Math.pow(0.001, dt);
    this.opacity += ((topView ? 0.16 : 1) - this.opacity) * k;
    this.skipOpacity += ((topView ? 0 : 1) - this.skipOpacity) * k;

    const delivering = ph === 'charge' || ph === 'glide' || ph === 'slide' || ph === 'gesture' || ph === 'meterWeight' || ph === 'meterLine';
    const running = ph === 'running' || ph === 'replay';

    // ── thrower ──
    if (delivering && s) {
      this.sinceRelease = 0;
      const hy = hackY(d);
      const dy = game.aimY - hy;
      const len = Math.sqrt(game.aimX * game.aimX + dy * dy);
      const fx = game.aimX / len;
      const fy = dy / len;
      this.throwFx = fx;
      this.throwFy = fy;
      // hips behind the stone, slightly left so that the right hand reaches the handle
      this.throwX = s.x - fx * 0.66 - fy * 0.1 * d;
      this.throwY = s.y - fy * 0.66 + fx * 0.1 * d;
      this.thrower.place(this.throwX, this.throwY, fx, fy);
      const moving = ph === 'glide' || ph === 'slide' || ph === 'gesture';
      this.thrower.apply(moving ? SLIDE : HACK, dt);
      this.thrower.setOpacity(1);
    } else if (running && this.sinceRelease < 60) {
      // follow through: glide on a little, then stand up
      this.sinceRelease += dt;
      const t = this.sinceRelease;
      const glide = 1.6 * (1 - Math.exp(-t * 1.2));
      this.thrower.place(this.throwX, this.throwY + d * glide, 0, d);
      this.thrower.apply(t < 1.6 ? mix(SLIDE, { ...SLIDE, rArm: 1.9, hip: 0.4 }, Math.min(1, t)) : STAND, dt);
      // the follow camera overtakes the thrower: fade him out before it gets there
      const dx = camera.x - this.throwX;
      const dz = camera.z + (this.throwY + d * glide);
      const near = Math.max(0, Math.min(1, (Math.sqrt(dx * dx + dz * dz) - 2.2) / 1.5));
      // behind the camera he is not visible anyway; in front and close he would block the view
      const ahead = (this.throwY + d * glide - -camera.z) * d > 0;
      this.thrower.setOpacity(ahead ? this.opacity * near : 0);
    } else {
      this.thrower.setOpacity(0);
      this.sinceRelease = 99;
    }

    // the thrower's balance broom: head on the ice to the front left, stick through the left hand
    if (this.thrower.opacity > 0.3 && this.thrower.group.visible) {
      // in sheet coordinates: forward = delivery direction, left = forward turned by +90°
      const fx = this.throwFx;
      const fy = this.throwFy;
      const lx = -fy;
      const ly = fx;
      const px = this.thrower.group.position.x;
      const py = -this.thrower.group.position.z;
      const foot = tmpA.set(px + fx * 0.8 + lx * 0.6, 0, -(py + fy * 0.8 + ly * 0.6));
      this.throwerBroom.set(foot, this.thrower.hand(0, tmpB), Math.atan2(fx, fy), true);
    } else {
      this.throwerBroom.set(tmpA, tmpB, 0, false);
    }

    // ── sweepers ──
    const speed = s ? Math.sqrt(s.vx * s.vx + s.vy * s.vy) : 0;
    this.walk += speed * dt * 7.5; // stride follows the stone
    for (let i = 0; i < 2; i++) {
      const b = brushes[i];
      const f = this.sweepers[i];
      if (!b || !b.visible) {
        f.setOpacity(0);
        continue;
      }
      const side = i ? 1 : -1; // thrower's right / left of the path
      // stand beside the path, just behind the brush
      const x = b.x + b.fy * side * 0.5 - b.fx * 0.42;
      const y = b.y - b.fx * side * 0.5 - b.fy * 0.42;
      // turned a little towards the path
      f.place(x, y, b.fx - b.fy * side * 0.35, b.fy + b.fx * side * 0.35);
      const step = Math.sin(this.walk + i * Math.PI) * 0.4;
      const stroke = b.down ? Math.sin(performance.now() / (55 - 25 * b.effective) + i * 2) * (0.1 + 0.18 * b.effective) : 0;
      const base = b.down ? SWEEP : { ...SWEEP, lean: 0.55, hip: 0.82, lArm: 1.1, rArm: 0.9, head: 0.3 };
      f.apply(base, dt, { lLeg: step, rLeg: -step, lKnee: Math.max(0, -step) * 0.9, rKnee: Math.max(0, step) * 0.9, lSpread: stroke, rSpread: -stroke });
      f.setOpacity(this.opacity);
      // the broom goes from the brush head on the ice up through both hands
      this.brooms[i].set(tmpA.set(b.x, b.down ? 0 : 0.1, -b.y), f.hand(-1, tmpB), Math.atan2(b.fx, b.fy), this.opacity > 0.3);
    }
    for (let i = 0; i < 2; i++) if (!brushes[i] || !brushes[i].visible) this.brooms[i].set(tmpA, tmpB, 0, false);

    // ── skip holding the broom ──
    const showSkip = ph !== 'endScore' && ph !== 'gameOver' && !game.drill;
    if (showSkip) {
      // behind the broom, facing the thrower; the broom is in the right hand
      this.skip.place(game.aimX - 0.17 * d, game.aimY + d * 0.38, 0, -d);
      this.skip.apply(SKIP, dt);
    }
    this.skip.setOpacity(showSkip ? this.skipOpacity : 0);
    this.skipBroom.set(tmpA.set(game.aimX, 0, -game.aimY), this.skip.hand(1, tmpB), 0, showSkip && this.skipOpacity > 0.3);

    // ── the other team's skip: waits behind the house, sweeps behind the tee line ──
    const ob = brushes[2];
    if (ob && ob.visible && ob.down) {
      this.otherSkip.place(ob.x - ob.fy * 0.5 - ob.fx * 0.42, ob.y + ob.fx * 0.5 - ob.fy * 0.42, ob.fx, ob.fy);
      const stroke = Math.sin(performance.now() / 40) * 0.25;
      this.otherSkip.apply(SWEEP, dt, { lSpread: stroke, rSpread: -stroke });
      this.otherSkip.setOpacity(this.opacity);
      this.brooms[2].set(tmpA.set(ob.x, 0, -ob.y), this.otherSkip.hand(-1, tmpB), Math.atan2(ob.fx, ob.fy), this.opacity > 0.3);
    } else if (showSkip && !game.lsd) {
      this.brooms[2].set(tmpA, tmpB, 0, false);
      this.otherSkip.place(1.55 * d, backLineY(d) + d * 0.9, -0.3 * d, -d);
      this.otherSkip.apply(STAND, dt);
      this.otherSkip.setOpacity(this.skipOpacity);
    } else {
      this.otherSkip.setOpacity(0);
      this.brooms[2].set(tmpA, tmpB, 0, false);
    }
  }
}
