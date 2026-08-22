// Scratch experiment (not a check): how well does a coarse-grid comparison
// between a 128×64 render and a downsampled 512×256 render separate presets
// whose picture changes with resolution from ones that scale?

import { LabEngine } from "../src/lib/lab/engine";
import { codeLayerFromSource } from "../src/lib/lab/store";
import { livePresets } from "../src/lib/presets";
import { applyKnobEntries, defaultKnobState } from "../src/lib/lab/annotations";

const matrix = { width: 128, height: 64 };
const render = { width: 1024, height: 512 };

// Renders `steps` frames of `dt`, returning snapshots at the listed step indices.
function renderAt(
  code: string,
  size: { width: number; height: number },
  knobs: number[],
  ranges: Array<[number, number]>,
  steps: number,
  dt: number,
  sampleAt: number[],
) {
  const engine = new LabEngine();
  const { layer } = codeLayerFromSource(code, "L");
  let time = 0;
  const samples: Uint8ClampedArray[] = [];
  for (let i = 1; i <= steps; i++) {
    time += dt;
    const frame = engine.render(
      { matrix: size, layers: [layer], activeLayerId: layer.id, knobs, ranges },
      dt,
      time,
    );
    if (sampleAt.includes(i)) samples.push(new Uint8ClampedArray(frame.data));
  }
  const error = engine.errors.get(layer.id) ?? null;
  return { samples, error };
}

function coarse(data: Uint8ClampedArray, w: number, h: number, cw: number, ch: number): Float32Array {
  const out = new Float32Array(cw * ch * 3);
  const counts = new Float32Array(cw * ch);
  for (let y = 0; y < h; y++) {
    const cy = Math.min(ch - 1, Math.floor((y * ch) / h));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cw - 1, Math.floor((x * cw) / w));
      const ci = cy * cw + cx;
      const si = (y * w + x) * 4;
      out[ci * 3] += data[si];
      out[ci * 3 + 1] += data[si + 1];
      out[ci * 3 + 2] += data[si + 2];
      counts[ci] += 1;
    }
  }
  for (let i = 0; i < cw * ch; i++) {
    const n = Math.max(1, counts[i]);
    out[i * 3] /= n;
    out[i * 3 + 1] /= n;
    out[i * 3 + 2] /= n;
  }
  return out;
}

function diff(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// Total variation: how much the picture changes between neighbouring cells.
function variation(c: Float32Array, w: number, h: number): number {
  let sum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x + 1 < w) {
        const j = i + 3;
        sum += Math.abs(c[i] - c[j]) + Math.abs(c[i + 1] - c[j + 1]) + Math.abs(c[i + 2] - c[j + 2]);
      }
      if (y + 1 < h) {
        const j = i + w * 3;
        sum += Math.abs(c[i] - c[j]) + Math.abs(c[i + 1] - c[j + 1]) + Math.abs(c[i + 2] - c[j + 2]);
      }
    }
  }
  return sum / (w * h);
}

function blur3(c: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(c.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            sum += c[(yy * w + xx) * 3 + ch];
            n++;
          }
        }
        out[(y * w + x) * 3 + ch] = sum / n;
      }
    }
  }
  return out;
}

function luminance(c: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < c.length; i += 3) sum += 0.2126 * c[i] + 0.7152 * c[i + 1] + 0.0722 * c[i + 2];
  return sum / (c.length / 3);
}

const cw = 32;
const ch = 16;
const STEPS = 8;
const DT = 0.4;
const SAMPLES = [3, 5, 8];
const literal = /\b(128|64|127|63)\b/;
const rows: Array<{ name: string; lit: boolean; d: number; d0: number; lum: number; df: number; df0: number; tv: number; tvMin: number; err: string | null }> = [];
for (const preset of livePresets) {
  const code = preset.code;
  const lit = literal.test(code.replace(/\/\/.*$/gm, ""));
  const base = defaultKnobState();
  const { knobEntries } = codeLayerFromSource(code, "L");
  const knobState = knobEntries ? applyKnobEntries(knobEntries, base) : base;
  const a1 = renderAt(code, matrix, knobState.knobs, knobState.ranges, STEPS, DT, SAMPLES);
  const a2 = renderAt(code, matrix, knobState.knobs, knobState.ranges, STEPS, DT, SAMPLES);
  const b = renderAt(code, render, knobState.knobs, knobState.ranges, STEPS, DT, SAMPLES);
  let d = 0;
  let d0 = 0;
  let lum = 0;
  let df = 0;
  let df0 = 0;
  let tv = 0;
  let tvMin = Infinity;
  for (let i = 0; i < SAMPLES.length; i++) {
    const ca1 = coarse(a1.samples[i], matrix.width, matrix.height, cw, ch);
    const ca2 = coarse(a2.samples[i], matrix.width, matrix.height, cw, ch);
    const cb = coarse(b.samples[i], render.width, render.height, cw, ch);
    d = Math.max(d, diff(ca1, cb));
    d0 = Math.max(d0, diff(ca1, ca2));
    lum = Math.max(lum, luminance(ca1));
    // Fine: the big render box-filtered down to the matrix itself.
    const fa1 = coarse(a1.samples[i], matrix.width, matrix.height, matrix.width, matrix.height);
    const fa2 = coarse(a2.samples[i], matrix.width, matrix.height, matrix.width, matrix.height);
    const fb = coarse(b.samples[i], render.width, render.height, matrix.width, matrix.height);
    df = Math.max(df, diff(blur3(fa1, matrix.width, matrix.height), blur3(fb, matrix.width, matrix.height)));
    df0 = Math.max(df0, diff(fa1, fa2));
    const tvA = variation(fa1, matrix.width, matrix.height);
    const tvB = variation(fb, matrix.width, matrix.height);
    tv = Math.max(tv, tvB / Math.max(0.5, tvA));
    tvMin = Math.min(tvMin, tvB / Math.max(0.5, tvA));
  }
  rows.push({ name: preset.name ?? preset.id, lit, d, d0, lum, df, df0, tv, tvMin, err: b.error ?? a1.error });
}
rows.sort((x, y) => x.df - y.df);
for (const row of rows) {
  console.log(
    `${row.lit ? "lit128" : "      "} dc=${row.d.toFixed(1).padStart(5)} dblur=${row.df.toFixed(1).padStart(5)} d0=${row.df0.toFixed(1).padStart(4)} lum=${row.lum.toFixed(0).padStart(3)} tv=${row.tvMin.toFixed(2)}..${row.tv.toFixed(2)} ${row.name}${row.err ? "  ERR: " + row.err.slice(0, 60) : ""}`,
  );
}
