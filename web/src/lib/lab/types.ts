// ── Pattern Lab layer model ──────────────────────────────────────────────────
// The lab composes a stack of layers into one LED frame, Photoshop-style:
//
//   code layers    a JS pattern (setup/update/draw) with its OWN color ramp,
//                  knob values/ranges and error state. The ramp is chained to
//                  the code because two stacked patterns rarely share colors.
//   pixel layers   a hand-drawn / imported RGBA bitmap, edited in the pixel
//                  panel. Transparency is real alpha, so cutouts layer over
//                  the patterns beneath.
//
// Convention: `layers[0]` is the TOP of the stack (what the Layers panel shows
// first), so compositing walks the array back-to-front.

import type { RampMode } from "@/lib/patternHarness";
import type { MatrixSize } from "@/lib/patternMatrix";
import type { ColorMode, PatternVariant, ThinkingLevelKey } from "@/lib/gemini";
import type { DirectorShow } from "./director/types";

export type KnobRange = [number, number];

// Kept deliberately small: every mode here must stay cheap to replicate on the
// ESP32 (integer math per pixel), so the flattened export can bake it 1:1.
export type BlendMode = "normal" | "add" | "multiply" | "screen";
export const BLEND_MODES: BlendMode[] = ["normal", "add", "multiply", "screen"];

// UI-facing ramp state: hex strings for <input type="color">, alpha 0..1 per
// stop. The harness ColorRamp (RGB tuples + alpha) is derived from this.
export type RampStopState = { position: number; color: string; alpha: number };
export type RampState = { stops: RampStopState[]; mode: RampMode; wrap: boolean };

export const MAX_RAMP_STOPS = 64;

// The neutral baseline: 0 = black, 1 = white. Doubles as the mask-friendly
// default — a value field maps straight to the 0.5 mask threshold.
export const DEFAULT_RAMP_STATE: RampState = {
  stops: [
    { position: 0, color: "#000000", alpha: 1 },
    { position: 1, color: "#ffffff", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};

/**
 * What a layer contributes to the composite:
 *   paint  draws its pixels (the normal case)
 *   mask   draws NOTHING — instead it clips the next paint layer below it,
 *          binary: a pixel of that layer shows only where the mask is "on".
 *          Pixel-art mask: on where alpha ≥ 0.5 (wherever color was drawn).
 *          Code mask: on where luminance × alpha ≥ 0.5 — the layer's color
 *          ramp shapes what crosses the threshold, so the ramp IS the mask
 *          control. Binary on purpose: one compare per pixel on the ESP32.
 */
export type LayerRole = "paint" | "mask";

type LayerCommon = {
  id: string;
  name: string;
  visible: boolean;
  /** Layer-wide opacity multiplier, 0..1 — on top of any per-pixel alpha. */
  opacity: number;
  blend: BlendMode;
  role: LayerRole;
  /** Mask polarity: false = bright/colored reveals; true = flips it. */
  maskInvert: boolean;
};

export type CodeLayer = LayerCommon & {
  type: "code";
  code: string;
  ramp: RampState;
  /** Recolor the layer's RGB output through its ramp by luminance. */
  recolor: boolean;
  // Raw `// @knobs` / `// @matrix` lines last applied, so an annotation is
  // re-applied only when the line itself changes (manual tuning survives
  // ordinary edits) — same trick the single-pattern lab used. Knobs
  // themselves are PROJECT-level: there is one physical set of four
  // encoders, shared by every layer (unlike ramps, which chain per layer).
  knobsAnnotationRaw: string | null;
  matrixAnnotationRaw: string | null;
};

export type PixelLayer = LayerCommon & {
  type: "pixel";
  width: number;
  height: number;
  /**
   * Straight (non-premultiplied) RGBA bytes, width × height × 4. Pixel tools
   * mutate this buffer in place for speed; every mutation bumps `rev` so React
   * and the persistence layer notice.
   */
  data: Uint8ClampedArray;
  rev: number;
};

export type Layer = CodeLayer | PixelLayer;

/**
 * `license` is the parent's SPDX id, used to narrow the publish picker to what
 * a derivative may legally use. Optional because drafts saved before it existed
 * do not carry it — the publish API enforces the same rule either way.
 */
export type ForkRef = { id: string; title: string; license?: string | null } | null;

export type GenSettings = {
  count: number;
  thinking: ThinkingLevelKey;
  refs: number;
  colorMode: ColorMode;
};

export type GalleryItem = PatternVariant & { id: string; pinned?: boolean };

export type GenJob = {
  id: string;
  count: number;
  thinkingLevel: ThinkingLevelKey;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  resultCount?: number;
  error?: string;
};

export type LabProject = {
  matrix: MatrixSize;
  layers: Layer[];
  activeLayerId: string;
  // One physical knob set for the whole composition — every code layer
  // receives the same input, exactly like patterns on the device. (A future
  // "knob button targets a layer" mode stays possible on top of this.)
  knobs: number[];
  ranges: KnobRange[];
  knobLabels: string[];
  forkOf: ForkRef;
  gen: GenSettings;
  /** Knob automation over time — the Director panel's show (see director/). */
  director: DirectorShow;
};

export function layerId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function cloneRampState(ramp: RampState): RampState {
  return {
    stops: ramp.stops.map((stop) => ({ ...stop })),
    mode: ramp.mode,
    wrap: ramp.wrap,
  };
}

export function createPixelLayer(matrix: MatrixSize, name: string): PixelLayer {
  return {
    id: layerId(),
    type: "pixel",
    name,
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    width: matrix.width,
    height: matrix.height,
    data: new Uint8ClampedArray(matrix.width * matrix.height * 4),
    rev: 0,
  };
}

export function isCodeLayer(layer: Layer | undefined | null): layer is CodeLayer {
  return layer?.type === "code";
}

export function isPixelLayer(layer: Layer | undefined | null): layer is PixelLayer {
  return layer?.type === "pixel";
}

/** Next free "Prefix N" name given the existing stack. */
export function nextLayerName(layers: Layer[], prefix: string): string {
  let max = 0;
  for (const layer of layers) {
    const match = layer.name.match(new RegExp(`^${prefix}\\s+(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix} ${max + 1}`;
}
