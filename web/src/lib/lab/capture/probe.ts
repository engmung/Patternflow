// ── Scaling probe ────────────────────────────────────────────────────────────
// Does this composition survive being re-run at a bigger grid, or is the
// 128×64 frame baked into its code? Most patterns never say: one uses
// x / display.width everywhere and scales like a vector drawing, the next
// writes Math.sin(x * 0.1) or cx = 64 and re-rendered at 1024 px it comes out
// as four tiles, or a small picture in a corner, or empty.
//
// Nobody can tell from the source, so the probe renders instead: the stack at
// its own matrix and at an aspect-true multiple, both box-filtered down to the
// matrix grid, and compares three things —
//
//   layout     mean |difference| after a 3×3 blur (the blur forgives the
//              jagged-vs-antialiased edges a correct re-render always has)
//   density    total variation of the big render ÷ the small one. A pattern
//              in pixel units comes back with N× the stripes (ratio ≫ 1) or
//              paints only its old frame (ratio ≪ 1); one that scales stays
//              near 1.
//   detail     what the first two structurally cannot see: whether the big
//              render is finer than the grid it came from, or the same picture
//              in bigger blocks. Both metrics compare box-filtered copies, and
//              a block upscale filters down to exactly the original — a
//              perfect score for a render that gained nothing.
//
// Thresholds come from all 46 bundled presets (scripts/_probe-experiment.ts):
// the scale-safe ones sit at layout ≤ 22 / density 0.83–1.0, the baked ones
// at layout ≥ 35 or density outside 0.3–2 — no overlap at 4× or 8×.

import type { MatrixSize } from "@/lib/pattern/matrix";
import { LabEngine } from "../engine";
import type { CaptureProject } from "./types";
import { stretchNearest } from "./core";
import type { Layer } from "../types";

export type ProbeVerdict = "native" | "upscale";

export type ProbeReason =
  | "scales"
  | "frame-baked"
  | "layout-changes"
  | "no-detail"
  | "too-dark"
  | "non-deterministic"
  | "errors";

export type ProbeResult = {
  verdict: ProbeVerdict;
  reason: ProbeReason;
  /** Grid the comparison render ran at. */
  probed: MatrixSize;
  metrics: {
    layout: number;
    density: number;
    luminance: number;
    noise: number;
    /** Share of the big render's cells that hold detail below matrix scale. */
    detail: number;
  };
};

export const PROBE_LAYOUT_MAX = 27;
/**
 * Below this share of textured cells the big render carries no information the
 * matrix render did not — it is the same picture in bigger blocks.
 *
 * The usual author is a pattern that samples a fixed internal field (a
 * simulation grid, a sprite table) with nearest lookups: honest code, and the
 * shape an AI "any size" rewrite of a simulation comes back in. A composition
 * of large flat cells lands here too at some knob settings, which is not a
 * fault of the code — in both cases the upscale is pixel-identical to the
 * native render and costs a fraction of it, so the verdict is the same.
 */
export const PROBE_DETAIL_MIN = 0.02;
export const PROBE_DENSITY_MIN = 0.55;
export const PROBE_DENSITY_MAX = 1.5;
export const PROBE_LUMINANCE_MIN = 10;
/** Below this mean neighbour difference a frame is flat — no texture to compare. */
export const PROBE_VARIATION_MIN = 2;
export const PROBE_NOISE_MAX = 12;
const PROBE_PIXEL_BUDGET = 600_000;
const PROBE_STEPS = 8;
const PROBE_DT = 0.4;
const PROBE_SAMPLES = [3, 5, 8];

/** Aspect-true multiple of the matrix the probe renders at, within budget. */
export function probeGrid(matrix: MatrixSize): MatrixSize {
  const pixels = matrix.width * matrix.height;
  const factor = Math.max(2, Math.min(4, Math.floor(Math.sqrt(PROBE_PIXEL_BUDGET / pixels))));
  return { width: matrix.width * factor, height: matrix.height * factor };
}

/** Box-filter an RGBA buffer to a coarser RGB float grid. */
export function boxDown(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): Float32Array {
  const out = new Float32Array(outWidth * outHeight * 3);
  const counts = new Float32Array(outWidth * outHeight);
  for (let y = 0; y < height; y++) {
    const oy = Math.min(outHeight - 1, Math.floor((y * outHeight) / height));
    for (let x = 0; x < width; x++) {
      const ox = Math.min(outWidth - 1, Math.floor((x * outWidth) / width));
      const oi = oy * outWidth + ox;
      const si = (y * width + x) * 4;
      out[oi * 3] += data[si];
      out[oi * 3 + 1] += data[si + 1];
      out[oi * 3 + 2] += data[si + 2];
      counts[oi] += 1;
    }
  }
  for (let i = 0; i < counts.length; i++) {
    const n = Math.max(1, counts[i]);
    out[i * 3] /= n;
    out[i * 3 + 1] /= n;
    out[i * 3 + 2] /= n;
  }
  return out;
}

function blur3(source: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += source[(yy * width + xx) * 3 + channel];
            n++;
          }
        }
        out[(y * width + x) * 3 + channel] = sum / n;
      }
    }
  }
  return out;
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Mean absolute neighbour difference — how busy the picture is. */
function variation(source: Float32Array, width: number, height: number): number {
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (x + 1 < width) {
        const j = i + 3;
        sum += Math.abs(source[i] - source[j]) + Math.abs(source[i + 1] - source[j + 1]) + Math.abs(source[i + 2] - source[j + 2]);
      }
      if (y + 1 < height) {
        const j = i + width * 3;
        sum += Math.abs(source[i] - source[j]) + Math.abs(source[i + 1] - source[j + 1]) + Math.abs(source[i + 2] - source[j + 2]);
      }
    }
  }
  return sum / (width * height);
}

/**
 * The share of factor×factor cells whose pixels are not all identical — i.e.
 * how much of the big render is finer than the matrix grid it came from. An
 * exact nearest blow-up scores 0; a genuine re-render scores its edges, which
 * for any real composition is a large fraction of the frame.
 */
export function blockDetail(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  factor: number,
): number {
  if (factor < 2) return 1;
  let cells = 0;
  let textured = 0;
  for (let by = 0; by + factor <= height; by += factor) {
    for (let bx = 0; bx + factor <= width; bx += factor) {
      cells++;
      const first = (by * width + bx) * 4;
      let differs = false;
      for (let y = by; y < by + factor && !differs; y++) {
        for (let x = bx; x < bx + factor; x++) {
          const index = (y * width + x) * 4;
          if (
            data[index] !== data[first] ||
            data[index + 1] !== data[first + 1] ||
            data[index + 2] !== data[first + 2]
          ) {
            differs = true;
            break;
          }
        }
      }
      if (differs) textured++;
    }
  }
  return cells === 0 ? 1 : textured / cells;
}

function luminance(source: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < source.length; i += 3) {
    sum += 0.2126 * source[i] + 0.7152 * source[i + 1] + 0.0722 * source[i + 2];
  }
  return sum / (source.length / 3);
}

/** Pixel layers stretched to `grid` (the same thing the stage does). */
function layersAt(layers: Layer[], grid: MatrixSize): Layer[] {
  return layers.map((layer) => {
    if (layer.type !== "pixel") return layer;
    if (layer.width === grid.width && layer.height === grid.height) return layer;
    return {
      ...layer,
      width: grid.width,
      height: grid.height,
      data: stretchNearest(layer.data, layer.width, layer.height, grid.width, grid.height),
    };
  });
}

/** Run a fresh engine for the probe's frame sequence; snapshots at PROBE_SAMPLES. */
function renderSequence(
  project: CaptureProject,
  grid: MatrixSize,
): { samples: Uint8ClampedArray[]; errored: boolean } {
  const engine = new LabEngine();
  const layers = layersAt(project.layers, grid);
  const samples: Uint8ClampedArray[] = [];
  let time = 0;
  for (let step = 1; step <= PROBE_STEPS; step++) {
    time += PROBE_DT;
    const frame = engine.render(
      {
        matrix: grid,
        layers,
        activeLayerId: project.activeLayerId,
        knobs: project.knobs,
        ranges: project.ranges,
      },
      PROBE_DT,
      time,
    );
    if (PROBE_SAMPLES.includes(step)) samples.push(new Uint8ClampedArray(frame.data));
  }
  let errored = false;
  engine.errors.forEach((message) => {
    if (message) errored = true;
  });
  return { samples, errored };
}

export function probeScaling(project: CaptureProject): ProbeResult {
  const matrix = project.matrix;
  const probed = probeGrid(matrix);
  const small = renderSequence(project, matrix);
  const again = renderSequence(project, matrix);
  const big = renderSequence(project, probed);

  let layout = 0;
  let noise = 0;
  let lum = 0;
  let densityMin = Infinity;
  let densityMax = 0;
  let judged = 0;
  let detail = 0;
  const factor = Math.round(probed.width / matrix.width);

  for (let index = 0; index < small.samples.length; index++) {
    const a = boxDown(small.samples[index], matrix.width, matrix.height, matrix.width, matrix.height);
    const a2 = boxDown(again.samples[index], matrix.width, matrix.height, matrix.width, matrix.height);
    const b = boxDown(big.samples[index], probed.width, probed.height, matrix.width, matrix.height);
    const sampleLum = luminance(a);
    lum = Math.max(lum, sampleLum);
    noise = Math.max(noise, meanAbsDiff(a, a2));
    layout = Math.max(
      layout,
      meanAbsDiff(blur3(a, matrix.width, matrix.height), blur3(b, matrix.width, matrix.height)),
    );
    // A dark or flat frame has no texture to compare; judge density on the
    // others only.
    if (sampleLum < PROBE_LUMINANCE_MIN) continue;
    const variationA = variation(a, matrix.width, matrix.height);
    if (variationA < PROBE_VARIATION_MIN) continue;
    judged++;
    const ratio = variation(b, matrix.width, matrix.height) / variationA;
    densityMin = Math.min(densityMin, ratio);
    densityMax = Math.max(densityMax, ratio);
    // Judged frames only: a dark or flat one is all identical cells and would
    // read as a block upscale whatever the code does.
    detail = Math.max(
      detail,
      blockDetail(big.samples[index], probed.width, probed.height, factor),
    );
  }

  const density = judged > 0 ? (densityMin + densityMax) / 2 : 1;
  const metrics = { layout, density, luminance: lum, noise, detail };
  const result = (verdict: ProbeVerdict, reason: ProbeReason): ProbeResult => ({
    verdict,
    reason,
    probed,
    metrics,
  });

  // The big render erroring where the small one did not (an array sized for
  // the old frame, say) is the clearest "baked in" there is.
  if (big.errored && !small.errored) return result("upscale", "errors");
  if (noise > PROBE_NOISE_MAX) return result("upscale", "non-deterministic");
  if (judged === 0) return result("upscale", "too-dark");
  if (densityMin < PROBE_DENSITY_MIN || densityMax > PROBE_DENSITY_MAX) {
    return result("upscale", "frame-baked");
  }
  if (layout > PROBE_LAYOUT_MAX) return result("upscale", "layout-changes");
  // Last, and only for code that passed everything else: it re-renders
  // faithfully but adds nothing. Upscaling the matrix frame is then the same
  // picture for a fraction of the work — and the panel can say so.
  if (detail < PROBE_DETAIL_MIN) return result("upscale", "no-detail");
  return result("native", "scales");
}

/**
 * Identity of everything the verdict depends on. Knobs count, coarsely: a
 * pattern can be frame-relative at one setting and flat or glitch-shifted in
 * pixels at another, so the verdict follows the picture — but only after a
 * knob has moved an eighth of its range, not on every tick of a drag.
 */
export function probeKey(project: CaptureProject): string {
  const knobs = project.knobs
    .map((value, index) => {
      const range = project.ranges[index] ?? [0, 1];
      const span = Math.max(1e-6, range[1] - range[0]);
      return Math.round(((value - range[0]) / span) * 8);
    })
    .join(",");
  const parts: string[] = [`${project.matrix.width}x${project.matrix.height}`, `k:${knobs}`];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    parts.push(
      layer.type === "code"
        ? `c:${layer.id}:${layer.role}:${layer.maskInvert}:${layer.opacity > 0}:${layer.recolor}:${layer.code.length}:${hash(layer.code)}`
        : `p:${layer.id}:${layer.role}:${layer.maskInvert}:${layer.opacity > 0}:${layer.rev}`,
    );
  }
  return parts.join("|");
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function describeProbe(result: ProbeResult): string {
  switch (result.reason) {
    case "scales":
      return "re-rendered — the pattern scales cleanly";
    case "frame-baked":
      return "upscaled — the frame size is baked into the code (re-rendering would tile or crop it)";
    case "layout-changes":
      return "upscaled — the picture changes with resolution";
    case "no-detail":
      return "upscaled — it re-renders at any size but draws nothing finer there, so the blow-up is the same picture for a fraction of the work";
    case "too-dark":
      return "upscaled — too dark or too flat to verify a re-render";
    case "non-deterministic":
      return "upscaled — the pattern is random, so a re-render can't be verified";
    case "errors":
      return "upscaled — the pattern errors at any other size";
  }
}
