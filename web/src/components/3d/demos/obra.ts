import * as THREE from 'three';
import {
  ENCODER_CLICKS_PER_TURN,
  LOGICAL_KNOB_RANGES,
  LOGICAL_KNOB_TO_WEB_KNOB,
  getKnobValueDelta,
  toEncoderDelta,
  type KnobValues,
} from '@/lib/pattern/controls';

// Obra, from Patternflood's demos (firmware/demos/pfd/demos/obra.py in
// github.com/jof/patternflood, by Jonathan Lassoff, after SeungHun's 0521 and
// 0522 dither and Obra Dinn's look): a solid that turns and morphs from one
// form to the next, lit by a light that circles it, printed in two to five
// inks through a dither screen, with an ink outline. A port of the original,
// for the preview of a case with a 128 x 128 panel: the same forms, light,
// screens, inks and outline, one ray per LED, without the original's sound
// input. Its knobs as on the device: k0 turns it, k1 morphs the form, k2
// changes the screen, k3 the inks.

const N = 128;
const R_BOUND = 1.42; // every form fits in this sphere (at size 1)
const STEPS = 32;
const HIT = 4e-3;
const FOV = 1.9;
const EYE = 3.0;
const SPIN = 0.35; // radians a second, left alone
/** A frame that takes longer than this marches at half resolution, as the original does on a slow machine. */
const SLOW_MS = 12;

type Sdf = (x: number, y: number, z: number) => number;

// --- the forms ----------------------------------------------------------------

const hyp2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const hyp3 = (a: number, b: number, c: number) => Math.sqrt(a * a + b * b + c * c);

function torus(x: number, y: number, z: number) {
  return hyp2(hyp2(x, z) - 0.82, y) - 0.36;
}

function gyroid(x: number, y: number, z: number, t: number) {
  const s = 3.4;
  const g =
    Math.sin(x * s + t) * Math.cos(y * s) + Math.sin(y * s) * Math.cos(z * s) + Math.sin(z * s) * Math.cos(x * s);
  return Math.max(hyp3(x, y, z) - 1.15, (Math.abs(g) / s - 0.07) * 0.7);
}

function twisted(x: number, y: number, z: number, t: number) {
  const a = y * (1.3 + 0.5 * Math.sin(t * 0.7));
  const c = Math.cos(a);
  const s = Math.sin(a);
  const qx = Math.abs(c * x - s * z) - 0.5;
  const qy = Math.abs(y) - 0.95;
  const qz = Math.abs(s * x + c * z) - 0.5;
  const out = hyp3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return (out + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - 0.08) * 0.75;
}

/** Four metaballs, their centres for time t (worked out once a frame). */
function blobCentres(t: number) {
  return [0, 1, 2, 3].map((i) => {
    const ph = t * (0.6 + 0.17 * i) + i * 1.7;
    return [0.6 * Math.sin(ph), 0.55 * Math.cos(ph * 1.3 + i), 0.5 * Math.sin(ph * 0.7 + 2 * i), 0.42 + 0.06 * i];
  });
}

function blobs(x: number, y: number, z: number, centres: number[][]) {
  const k = 0.45;
  let d = 0;
  for (let i = 0; i < 4; i++) {
    const [cx, cy, cz, r] = centres[i];
    const di = hyp3(x - cx, y - cy, z - cz) - r;
    if (i === 0) {
      d = di;
    } else {
      // polynomial smooth min
      const h = Math.min(Math.max(0.5 + (0.5 * (di - d)) / k, 0), 1);
      d = di + (d - di) * h - k * h * (1 - h);
    }
  }
  return d;
}

function octa(x: number, y: number, z: number) {
  return (Math.abs(x) + Math.abs(y) + Math.abs(z) - 1.15) * 0.577;
}

function rings(x: number, y: number, z: number) {
  const p = [x, y, z];
  let d = Infinity;
  [[0, 1], [1, 2], [2, 0]].forEach(([a, b], i) => {
    const q = hyp2(p[a], p[b]) - (1.0 - 0.18 * i);
    d = Math.min(d, hyp2(q, p[3 - a - b]) - 0.1);
  });
  return d;
}

/** The six forms, in the order k1 morphs through them, for one frame's time. */
function forms(t: number): Sdf[] {
  const centres = blobCentres(t);
  return [
    torus,
    (x, y, z) => blobs(x, y, z, centres),
    (x, y, z) => twisted(x, y, z, t),
    (x, y, z) => gyroid(x, y, z, t),
    octa,
    rings,
  ];
}

// --- screens and inks (firmware/demos/pfd/ink.py) ---------------------------

/** Inks, darkest first, as 0..1 RGB. Black is the paper: on the panel, ink is light. */
const PALETTES: number[][][] = [
  [[0, 0, 0], [0.18, 0.11, 0.05], [0.62, 0.42, 0.18], [1.0, 0.86, 0.6]], // obra
  [[0, 0, 0], [0.0, 0.25, 0.55], [1.0, 0.28, 0.55], [1.0, 0.86, 0.3]], // riso
  [[0.02, 0.06, 0.03], [0.12, 0.3, 0.12], [0.42, 0.66, 0.2], [0.8, 0.95, 0.45]], // gameboy
  [[0, 0, 0], [0.22, 0.04, 0.45], [0.95, 0.15, 0.6], [0.2, 0.9, 1.0], [1, 1, 1]], // synth
  [[0, 0, 0], [0.35, 0.02, 0.02], [0.95, 0.3, 0.02], [1.0, 0.8, 0.25], [1, 1, 0.9]], // ember
  [[0, 0, 0], [0.02, 0.1, 0.3], [0.1, 0.5, 0.8], [0.75, 0.95, 1.0]], // ice
  [[0, 0.02, 0.05], [0.0, 0.18, 0.3], [0.05, 0.55, 0.65], [0.8, 1.0, 1.0]], // pool
  [[0, 0, 0], [0.18, 0.04, 0.28], [0.75, 0.2, 0.4], [1.0, 0.6, 0.35], [1.0, 0.95, 0.75]], // dusk
  [[0, 0, 0], [0.05, 0.05, 0.3], [0.45, 0.1, 0.6], [1.0, 0.35, 0.55], [1.0, 0.92, 0.8]], // nebula
  [[0, 0, 0], [0.02, 0.06, 0.18], [0.1, 0.35, 0.5], [1.0, 0.62, 0.22], [1.0, 0.95, 0.85]], // night
  [[0, 0, 0], [0.0, 0.14, 0.18], [0.05, 0.6, 0.35], [0.55, 1.0, 0.6], [0.98, 0.75, 1.0]], // aurora
  [[0, 0.02, 0.03], [0.03, 0.17, 0.2], [0.95, 0.38, 0.06], [1.0, 0.95, 0.86]], // koi
  [[0.0, 0.07, 0.14], [0.0, 0.36, 0.45], [0.76, 0.66, 0.45], [1.0, 1.0, 0.95]], // beach
  [[0, 0.02, 0.0], [0.0, 0.2, 0.05], [0.15, 0.75, 0.25], [0.78, 1.0, 0.72]], // phosphor
  [[0.02, 0.02, 0.02], [0.28, 0.25, 0.2], [0.62, 0.57, 0.48], [0.84, 0.8, 0.71]], // sand
  [[0, 0, 0], [0.1, 0.1, 0.12], [0.42, 0.42, 0.46], [1.0, 0.98, 0.92]], // silver
  [[0, 0, 0], [1, 1, 1]], // mac
  [[0, 0, 0], [1.0, 0.0, 0.6]], // hotpink
];

const SCREENS = ['bayer8', 'bayer4', 'blue', 'dots', 'lines', 'hatch', 'bayer2', 'ign'] as const;
type ScreenKind = (typeof SCREENS)[number];

/** The n x n Bayer matrix (n a power of two), as thresholds in [0, 1). */
function bayer(n: number): number[][] {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length;
    const next = Array.from({ length: 2 * s }, () => new Array<number>(2 * s).fill(0));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = 4 * m[y][x];
        next[y][x] = v;
        next[y][x + s] = v + 2;
        next[y + s][x] = v + 3;
        next[y + s][x + s] = v + 1;
      }
    }
    m = next;
  }
  const size = m.length * m.length;
  return m.map((row) => row.map((v) => (v + 0.5) / size));
}

function tile(m: number[][], scale = 1): Float32Array {
  const out = new Float32Array(N * N);
  const s = m.length;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) out[y * N + x] = m[Math.floor(y / scale) % s][Math.floor(x / scale) % s];
  }
  return out;
}

/** Values to their rank, spread over [0, 1): any field becomes a uniform screen. */
function rank(v: Float32Array): Float32Array {
  const order = Array.from(v.keys()).sort((a, b) => v[a] - v[b] || a - b);
  const out = new Float32Array(v.length);
  order.forEach((i, r) => {
    out[i] = (r + 0.5) / v.length;
  });
  return out;
}

let blue: number[][] | null = null;

/** A tileable blue-noise threshold map by void filling, made once (a fraction of a second). */
function blueNoise(size = 64, sigma = 1.6): number[][] {
  if (blue) return blue;
  const k = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dy = Math.min(y, size - y);
      const dx = Math.min(x, size - x);
      k[y * size + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  // A fixed seed (mulberry32), so the screen is the same every time.
  let seed = 7;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const energy = new Float32Array(size * size).map(() => random() * 1e-3);
  const out = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let i = 0; i < size * size; i++) {
    let best = 0;
    for (let j = 1; j < energy.length; j++) if (energy[j] < energy[best]) best = j;
    const by = Math.floor(best / size);
    const bx = best % size;
    out[by][bx] = (i + 0.5) / (size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        energy[y * size + x] += k[((y - by + size) % size) * size + ((x - bx + size) % size)];
      }
    }
    energy[best] = Infinity;
  }
  blue = out;
  return out;
}

/** A threshold map: the original's screen(kind, scale, angle=0.6, pitch=4 * scale). */
function screen(kind: ScreenKind, scale: number): Float32Array {
  if (kind.startsWith('bayer')) return tile(bayer(Number(kind.slice(5))), scale);
  if (kind === 'blue') return tile(blueNoise(), scale);
  const out = new Float32Array(N * N);
  if (kind === 'ign') {
    // Jimenez's interleaved gradient noise
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = 0.06711056 * Math.floor(x / scale) + 0.00583715 * Math.floor(y / scale);
        out[y * N + x] = (52.9829189 * (v % 1)) % 1;
      }
    }
    return out;
  }
  const angle = 0.6;
  const pitch = 4.0 * scale;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const fine = tile(bayer(8));
  const frac = (v: number) => v - Math.floor(v);
  if (kind === 'hatch') {
    // an etcher's cross-hatching: line sets come in one by one as tone rises
    const p = Math.max(3, Math.round(pitch));
    const mod = (v: number) => ((v % p) + p) % p;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const sets = [mod(x + y), mod(x - y), mod(y)].map((w, i) => 0.06 + 0.27 * i + (0.3 * Math.min(w, p - w)) / (p / 2));
        out[y * N + x] = Math.min(Math.min(sets[0], sets[1]), Math.min(sets[2], 0.95));
      }
    }
    return out;
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x * c + y * s) / pitch;
      const v = (-x * s + y * c) / pitch;
      const d = kind === 'dots' ? hyp2(frac(u) - 0.5, frac(v) - 0.5) : Math.abs(frac(v) - 0.5);
      out[y * N + x] = d + 1e-4 * fine[y * N + x];
    }
  }
  return rank(out);
}

/** A dim floor glow under the object, with its shadow, so the screen shows in the dark too. */
const BACKDROP = (() => {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fy = Math.min(Math.max((y - 92) / 36, 0), 1);
      const shadow = Math.min(Math.max(1.3 - hyp2((x - 64) / 48, (y - 116) / 9), 0), 1);
      out[y * N + x] = 0.2 * fy * (1 - 0.95 * shadow);
    }
  }
  return out;
})();

/** HSV to RGB, all 0..1. */
function hsv(h: number, s: number, v = 1): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

/** The turn: yaw about y after pitch about x, row-major. */
function rotation(yaw: number, pitch: number): number[] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // ry @ rx
  return [cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp];
}

// --- the demo -----------------------------------------------------------------

export class ObraDemo {
  public readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(N * N * 4);
  private readonly tone = new Float32Array(N * N);
  private readonly mask = new Uint8Array(N * N);

  private yaw = 0.4;
  private spin = SPIN;
  private morph = 0;
  private morphTo = 0;
  private screenIndex = 0;
  private paletteIndex = 0;
  private scale = 1;
  private outline = true;
  private t = 0;
  private light = 0;
  private thresh = screen(SCREENS[0], 1);
  private res = 1;
  private cost = 0;
  private lastMorphTouch = -Infinity;
  /** When each knob was last turned, for its light's flash. */
  private touched = [-10, -10, -10, -10];
  /** Clicks turned on k2 and k3 not yet spent on a step through their lists. */
  private clicks = [0, 0];

  constructor() {
    this.texture = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat);
    this.texture.needsUpdate = true;
  }

  /** One frame: the knobs since the last, then the time step and the picture. */
  render(dt: number, knobValues: KnobValues, prevKnobValues: KnobValues) {
    const d = LOGICAL_KNOB_TO_WEB_KNOB.map((id, k) =>
      toEncoderDelta(LOGICAL_KNOB_RANGES[k], getKnobValueDelta(id, knobValues[id], prevKnobValues[id])),
    );
    this.turn(d);
    this.step(Math.min(dt, 0.1));
    this.draw();
  }

  private turn(d: number[]) {
    d.forEach((v, k) => {
      if (v) this.touched[k] = this.t;
    });
    this.yaw += (d[0] * 2 * Math.PI) / ENCODER_CLICKS_PER_TURN;
    if (d[1]) {
      this.morphTo += d[1] / 6;
      this.lastMorphTouch = this.t;
    }
    // k2 and k3 step through their lists a click at a time.
    for (const k of [2, 3]) {
      this.clicks[k - 2] += d[k];
      while (Math.abs(this.clicks[k - 2]) >= 1) {
        const dir = Math.sign(this.clicks[k - 2]);
        this.clicks[k - 2] -= dir;
        if (k === 2) {
          this.screenIndex = (this.screenIndex + dir + SCREENS.length) % SCREENS.length;
          this.thresh = screen(SCREENS[this.screenIndex], this.scale);
        } else {
          this.paletteIndex = (this.paletteIndex + dir + PALETTES.length) % PALETTES.length;
        }
      }
    }
  }

  /**
   * The knobs' lights, k0 to k3, as sRGB 0..1: k0's hue follows the turn,
   * k1's the form, k2's the screen, k3 is the brightest ink; each flares for
   * a moment when its knob is turned (the original's lights() and glow()).
   */
  lights(): [number, number, number][] {
    const glow = (k: number, hue: number): [number, number, number] => {
      const a = Math.max(0, 1 - (this.t - this.touched[k]) / 0.6);
      return hsv(hue, 0.8).map((c) => Math.min(1, (0.5 + 0.5 * a) * c)) as [number, number, number];
    };
    const inks = PALETTES[this.paletteIndex];
    const top = inks[inks.length - 1];
    return [
      glow(0, (((this.yaw / (2 * Math.PI)) % 1) + 1) % 1),
      glow(1, (((this.morph / 6) % 1) + 1) % 1),
      glow(2, this.screenIndex / SCREENS.length),
      [top[0], top[1], top[2]],
    ];
  }

  private step(dt: number) {
    this.t += dt;
    this.yaw += this.spin * dt;
    this.morph += (this.morphTo - this.morph) * (1 - Math.exp(-dt / 0.6));
    // Left alone, it wanders through its forms.
    if (this.t - this.lastMorphTouch > 20) this.morphTo += dt / 14;
    this.light += dt * 0.5;
  }

  private sdfFor(): Sdf {
    const shapes = forms(this.t);
    const n = shapes.length;
    const m = ((this.morph % n) + n) % n;
    const i = Math.floor(m);
    let f = m - i;
    f = f * f * (3 - 2 * f);
    const a = shapes[i];
    if (f < 1e-3) return a;
    const b = shapes[(i + 1) % n];
    return (x, y, z) => a(x, y, z) * (1 - f) + b(x, y, z) * f;
  }

  private draw() {
    const t0 = performance.now();
    const sdf = this.sdfFor();
    const r = rotation(this.yaw, 0.55 + 0.3 * Math.sin(this.t * 0.23));
    const res = this.res;
    const n = N / res;
    // The light, circling.
    const la = this.light;
    let lx = Math.cos(la) * 0.8;
    let ly = 0.6 + 0.2 * Math.sin(la * 0.7);
    let lz = Math.sin(la) * 0.8 + 0.4;
    const ll = hyp3(lx, ly, lz);
    lx /= ll;
    ly /= ll;
    lz /= ll;
    // Into the object's own space: v @ rot, i.e. by the transpose.
    const toObj = (x: number, y: number, z: number) => [
      x * r[0] + y * r[3] + z * r[6],
      x * r[1] + y * r[4] + z * r[7],
      x * r[2] + y * r[5] + z * r[8],
    ];
    const eye = toObj(0, 0, EYE);
    const TET = [[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]];
    const e = 3e-3;

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        // One ray per res x res block, through its centre.
        let rx = (col * res + (res - 1) / 2 - 63.5) / 64;
        let ry = (63.5 - (row * res + (res - 1) / 2)) / 64;
        let rz = -FOV;
        const rl = hyp3(rx, ry, rz);
        rx /= rl;
        ry /= rl;
        rz /= rl;
        let tone = -1;
        // Where it meets the bounding sphere (the eye is on +z looking down -z).
        const b = -EYE * rz;
        const disc = b * b - (EYE * EYE - R_BOUND * R_BOUND);
        if (disc > 0) {
          const root = Math.sqrt(disc);
          let t = b - root;
          const far = b + root;
          const [dx, dy, dz] = toObj(rx, ry, rz);
          let hit = false;
          for (let s = 0; s < STEPS && t < far; s++) {
            const d = sdf(eye[0] + dx * t, eye[1] + dy * t, eye[2] + dz * t);
            t += d;
            if (d < HIT) {
              hit = true;
              break;
            }
          }
          if (hit) {
            const px = eye[0] + dx * t;
            const py = eye[1] + dy * t;
            const pz = eye[2] + dz * t;
            let nx = 0;
            let ny = 0;
            let nz = 0;
            for (const [ox, oy, oz] of TET) {
              const v = sdf(px + ox * e, py + oy * e, pz + oz * e);
              nx += v * ox;
              ny += v * oy;
              nz += v * oz;
            }
            // object space -> world: rot @ n
            const wx = r[0] * nx + r[1] * ny + r[2] * nz;
            const wy = r[3] * nx + r[4] * ny + r[5] * nz;
            const wz = r[6] * nx + r[7] * ny + r[8] * nz;
            const nl = hyp3(wx, wy, wz) + 1e-9;
            const mx = wx / nl;
            const my = wy / nl;
            const mz = wz / nl;
            const nd = mx * lx + my * ly + mz * lz;
            const diff = (0.5 + 0.5 * nd) ** 2; // wrapped: the shadow side still reads
            const spec = Math.min(Math.max((lx - 2 * nd * mx) * rx + (ly - 2 * nd * my) * ry + (lz - 2 * nd * mz) * rz, 0), 1) ** 18;
            const rim = (1 - Math.min(Math.max(-(mx * rx + my * ry + mz * rz), 0), 1)) ** 3;
            tone = 0.04 + 0.8 * diff + 0.5 * spec + 0.2 * rim;
          }
        }
        for (let y = row * res; y < (row + 1) * res; y++) {
          for (let x = col * res; x < (col + 1) * res; x++) {
            const i = y * N + x;
            this.mask[i] = tone >= 0 ? 1 : 0;
            this.tone[i] = tone >= 0 ? tone : BACKDROP[i];
          }
        }
      }
    }

    // Through the screen onto the inks, then the outline in the brightest.
    const inks = PALETTES[this.paletteIndex];
    const scale = SCREENS[this.screenIndex] !== 'dots' ? this.scale : 1;
    const edgeInk = inks.length > 2 ? inks[inks.length - 1] : inks[1];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const v = scale > 1 ? this.tone[Math.floor(y / scale) * scale * N + Math.floor(x / scale) * scale] : this.tone[i];
        const f = Math.min(Math.max(v, 0), 1) * (inks.length - 1);
        let ink = inks[Math.min(Math.floor(f) + (f % 1 > this.thresh[i] ? 1 : 0), inks.length - 1)];
        if (this.outline && this.mask[i]) {
          const up = this.mask[((y + N - 1) % N) * N + x];
          const down = this.mask[((y + 1) % N) * N + x];
          const left = this.mask[y * N + ((x + N - 1) % N)];
          const right = this.mask[y * N + ((x + 1) % N)];
          if (!(up && down && left && right)) ink = edgeInk;
        }
        // Row 0 is the top; the texture's origin is its bottom-left.
        const o = ((N - 1 - y) * N + x) * 4;
        this.data[o] = Math.round(ink[0] * 255);
        this.data[o + 1] = Math.round(ink[1] * 255);
        this.data[o + 2] = Math.round(ink[2] * 255);
        this.data[o + 3] = 255;
      }
    }
    this.texture.needsUpdate = true;

    this.cost += (performance.now() - t0 - this.cost) * 0.05;
    if (this.cost > SLOW_MS && this.res === 1 && this.t > 2) this.res = 2; // past the warm-up
  }
}
