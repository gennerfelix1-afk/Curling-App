import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SHEET } from '../physics/config';

/**
 * Everything around the sheet, generated in code (no asset files): procedural textures for ice
 * and granite, neighbouring sheets, stands with spectators, hall lights and reflections.
 */

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d')! };
}

/** Small repeatable pseudo-random generator for textures (visuals only, not physics). */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Normal map of pebbled ice: thousands of tiny frozen droplets. */
export function pebbleNormalMap(): THREE.CanvasTexture {
  const size = 256;
  const h = new Float32Array(size * size);
  const r = rand(7);
  for (let n = 0; n < 900; n++) {
    const cx = r() * size;
    const cy = r() * size;
    const rad = 2 + r() * 3.5;
    const amp = 0.5 + r() * 0.5;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy) / rad;
        if (d >= 1) continue;
        const x = (Math.round(cx) + dx + size) % size;
        const y = (Math.round(cy) + dy + size) % size;
        h[y * size + x] = Math.max(h[y * size + x], amp * (1 - d * d));
      }
    }
  }
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x + size - 1) % size)];
      const rr = h[y * size + ((x + 1) % size)];
      const u = h[((y + size - 1) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      const nx = (l - rr) * 1.5;
      const ny = (u - d) * 1.5;
      const nz = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (y * size + x) * 4;
      img.data[k] = (nx * nz * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * nz * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Speckled granite for the stones. */
export function graniteMap(): THREE.CanvasTexture {
  const size = 256;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = '#8f959c';
  ctx.fillRect(0, 0, size, size);
  const r = rand(21);
  for (let n = 0; n < 5200; n++) {
    const v = r();
    const shade = v < 0.45 ? 40 + r() * 50 : v < 0.8 ? 150 + r() * 60 : 215 + r() * 35;
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},${0.35 + r() * 0.5})`;
    const s = 0.6 + r() * 2.2;
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, s, s * (0.5 + r() * 0.6), r() * 3.14, 0, 6.3);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Banner with text for the end walls. */
function banner(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg;
  // shrink the font until the text fits the banner
  let px = 76;
  do {
    ctx.font = `800 ${px}px system-ui, sans-serif`;
    px -= 4;
  } while (ctx.measureText(text).width > c.width - 40 && px > 20);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Arena {
  /** Objects that can be hidden on weak devices. */
  detail: THREE.Object3D[];
  iceMaterial: THREE.MeshStandardMaterial;
}

/** Reflections: a small studio-like environment, pre-filtered once. */
export function setupEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();
}

export function buildArena(scene: THREE.Scene): Arena {
  const detail: THREE.Object3D[] = [];
  const W = SHEET.width;
  const L = SHEET.length;
  scene.fog = new THREE.Fog(0x0a1620, 38, 95);

  // the playing surface: glossy pebbled ice
  const pebble = pebbleNormalMap();
  pebble.repeat.set(W / 0.45, L / 0.45);
  const iceMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f8fc,
    roughness: 0.2,
    metalness: 0,
    normalMap: pebble,
    normalScale: new THREE.Vector2(0.22, 0.22),
  });
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(W, L), iceMaterial);
  ice.rotation.x = -Math.PI / 2;
  ice.receiveShadow = true;
  scene.add(ice);

  // walkway and neighbouring sheets
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 62), new THREE.MeshStandardMaterial({ color: 0x232b33, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  scene.add(floor);
  const sideIce = new THREE.MeshStandardMaterial({ color: 0xe6eff5, roughness: 0.3 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x1d4f7a, roughness: 0.6 });
  const ring = [0x1c64b0, 0xeef5fa, 0xc8202f, 0xeef5fa].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  for (const side of [-1, 1]) {
    const x = side * (W + 0.45);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, L), sideIce);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(x, -0.005, 0);
    scene.add(sheet);
    for (const end of [-1, 1]) {
      SHEET.houseRadii.forEach((r, i) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), ring[i]);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, -0.004 + i * 0.0004, (end * SHEET.teeToTee) / 2);
        scene.add(m);
      });
    }
    // outer divider of the neighbouring sheet
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, L), boardMat);
    div.position.set(side * (W * 1.5 + 0.52), 0.07, 0);
    scene.add(div);
  }

  // hall: walls and roof
  const hall = new THREE.Mesh(
    new THREE.BoxGeometry(40, 13, 66),
    new THREE.MeshStandardMaterial({ color: 0x15222e, roughness: 1, side: THREE.BackSide }),
  );
  hall.position.y = 6.45;
  scene.add(hall);

  // stands on both long sides, with spectators
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x2d3944, roughness: 0.9 });
  const rows = 6;
  const seats = 64;
  const bodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.2, 0.42, 3, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    rows * seats * 2,
  );
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), rows * seats * 2);
  const jackets = [0xc8202f, 0x1c64b0, 0xf2c230, 0x2f9e5b, 0xeeeeee, 0x333a44, 0x7a1f6b, 0xd9772b];
  const skins = [0xf1c9a5, 0xd9a06f, 0x9c6b47, 0xf6d7bd, 0x6e4a32];
  const r = rand(99);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < rows; row++) {
      const x = side * (9.6 + row * 1.0);
      const y = 0.45 + row * 0.5;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 58), stepMat);
      step.position.set(x, y - 0.25, 0);
      scene.add(step);
      detail.push(step);
      for (let s = 0; s < seats; s++) {
        if (r() < 0.14) continue; // empty seat
        const z = -28 + (s + r() * 0.3) * (56 / seats);
        m4.makeTranslation(x + (r() - 0.5) * 0.15, y + 0.42, z);
        bodies.setMatrixAt(n, m4);
        bodies.setColorAt(n, col.setHex(jackets[Math.floor(r() * jackets.length)]));
        m4.makeTranslation(x + (r() - 0.5) * 0.1, y + 0.9 + r() * 0.06, z);
        heads.setMatrixAt(n, m4);
        heads.setColorAt(n, col.setHex(skins[Math.floor(r() * skins.length)]));
        n++;
      }
    }
  }
  bodies.count = heads.count = n;
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  scene.add(bodies, heads);
  detail.push(bodies, heads);

  // banners behind both ends and along the stands
  const bannerMat = (text: string, bg: string): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ map: banner(text, bg, '#ffffff') });
  for (const end of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), bannerMat('CURLING ARENA', end > 0 ? '#1c64b0' : '#c8202f'));
    b.position.set(0, 3.2, end * 31.5);
    if (end > 0) b.rotation.y = Math.PI;
    scene.add(b);
    detail.push(b);
  }
  for (const side of [-1, 1]) {
    // the text fits the texture once and is repeated along the stand
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(58, 0.7), bannerMat('GOOD CURLING  ·  HURRY HARD  ·', '#0f2c44'));
    (fascia.material as THREE.MeshBasicMaterial).map!.repeat.set(5, 1);
    (fascia.material as THREE.MeshBasicMaterial).map!.wrapS = THREE.RepeatWrapping;
    fascia.position.set(side * 9.05, 0.4, 0);
    fascia.rotation.y = -side * (Math.PI / 2);
    scene.add(fascia);
    detail.push(fascia);
  }

  // rows of hall lights under the roof (the light itself comes from the rig in the view)
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfdfdf5, fog: false });
  for (let z = -27; z <= 27; z += 6) {
    for (const x of [-4.5, 0, 4.5]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), lamp);
      l.rotation.x = Math.PI / 2;
      l.position.set(x, 12.6, z);
      scene.add(l);
    }
  }
  return { detail, iceMaterial };
}
