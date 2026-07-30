export const PATTERN_MATRIX_WIDTH = 128;
export const PATTERN_MATRIX_HEIGHT = 64;
export const PATTERN_KNOB_COUNT = 4;
// Detents in one full turn of the physical encoder. The BOM reference part is
// Bourns PEC11R-4220F-S0024 — the S0024 suffix means 24 detents / 24 PPR, which
// distributors confirm. This was 20 for a long time, which silently put the web
// preview 20 % out of step with the hardware it claims to mirror.
// Sourcing a different encoder? Generic EC11s ship as 20, 24 or 30 detents —
// this constant has to match whatever is actually in the build.
// Keep in sync with ENCODER_CLICKS_PER_TURN in patternflowControls.ts.
export const PATTERN_DETENTS_PER_TURN = 24;

export type PatternParams = Record<string, unknown>;

export type PatternInput = {
  knobDeltas: number[];
  knobValues?: number[];
  knobNormalized?: number[];
  knobRanges?: Array<[number, number]>;
  btnPressed: boolean[];
  btnHeld: boolean[];
};

export type PatternDisplay = {
  width: number;
  height: number;
  // Canonical form is setPixel(x, y, r, g, b). The array form setPixel(x, y, [r, g, b])
  // is also accepted, since AI-generated patterns frequently emit it.
  setPixel: (x: number, y: number, r: number | number[], g?: number, b?: number) => void;
  // Value-field mode: write a 0..1 scalar; the runtime colors it through the
  // active ColorRamp (grayscale when no ramp is set).
  setValue: (x: number, y: number, v: number) => void;
};

export type PatternModule = {
  setup?: (params: PatternParams) => void;
  update?: (dt: number, input: PatternInput, params: PatternParams) => void;
  draw: (display: PatternDisplay, params: PatternParams, time: number) => void;
};

export type PatternRenderResult = {
  ok: boolean;
  error?: string;
};

export type PatternStillOptions = {
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  knobStart?: number[];
  knobTargets?: number[];
  knobRanges?: Array<[number, number]>;
  knobWrap?: boolean[];
  knobUnitsPerTurn?: number[];
  ramp?: ColorRamp | null;
  recolor?: boolean;
};

function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

// ── Color ramp ──────────────────────────────────────────────────────────────
// A ramp maps a 0..1 value to a color through up to a few stops. Patterns that
// draw with display.setValue() produce a pure value field; the ramp is the
// user's color decision, applied by the runtime (and baked in on C++ export).

export type RampMode = "linear" | "smooth" | "step" | "hsvShort" | "hsvLong";
export const RAMP_MODES: RampMode[] = ["linear", "smooth", "step", "hsvShort", "hsvLong"];

export type RampStop = {
  position: number; // 0..1
  color: [number, number, number]; // sRGB 0..255
  // Opacity of this stop, 0..1. Omitted means 1 (opaque). Lets a value field
  // fade to transparent so layered patterns can show through each other.
  alpha?: number;
};

export type ColorRamp = {
  stops: RampStop[];
  mode: RampMode;
  // When true the ramp is cyclic: past the last stop it blends back into the
  // first, so value fields that wrap (phase, hue-like signals) have no seam.
  wrap: boolean;
};

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rf) h = ((gf - bf) / delta) % 6;
    else if (max === gf) h = (bf - rf) / delta + 2;
    else h = (rf - gf) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : delta / max;
  return [h, s, max];
}

function hsvToRgbTuple(h: number, s: number, v: number): [number, number, number] {
  h = h - Math.floor(h);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number;
  let g: number;
  let b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function mixRampColors(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
  mode: RampMode,
): [number, number, number] {
  if (mode === "smooth") t = t * t * (3 - 2 * t);
  if (mode === "hsvShort" || mode === "hsvLong") {
    const ha = rgbToHsv(a[0], a[1], a[2]);
    const hb = rgbToHsv(b[0], b[1], b[2]);
    // Grey endpoints have no meaningful hue — borrow the other side's so the
    // blend doesn't sweep through arbitrary colors.
    const h1 = ha[1] === 0 ? hb[0] : ha[0];
    const h2 = hb[1] === 0 ? h1 : hb[0];
    let dh = h2 - h1;
    if (mode === "hsvShort") {
      if (dh > 0.5) dh -= 1;
      if (dh < -0.5) dh += 1;
    } else {
      if (dh > 0 && dh < 0.5) dh -= 1;
      else if (dh <= 0 && dh > -0.5) dh += 1;
    }
    return hsvToRgbTuple(h1 + dh * t, ha[1] + (hb[1] - ha[1]) * t, ha[2] + (hb[2] - ha[2]) * t);
  }
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function stopAlpha(stop: RampStop): number {
  const a = stop.alpha;
  if (a === undefined || !Number.isFinite(a)) return 1;
  return Math.max(0, Math.min(1, a));
}

// Alpha blends with the same easing the color uses: step holds, smooth eases,
// everything else (linear and both hsv modes) interpolates linearly.
function mixStopAlpha(a: RampStop, b: RampStop, t: number, mode: RampMode): number {
  if (mode === "smooth") t = t * t * (3 - 2 * t);
  const aa = stopAlpha(a);
  return aa + (stopAlpha(b) - aa) * t;
}

function sampleSortedRampRGBA(
  stops: RampStop[],
  mode: RampMode,
  wrap: boolean,
  t: number,
): [number, number, number, number] {
  if (stops.length === 0) return [255, 255, 255, 1];
  if (stops.length === 1) return [...stops[0].color, stopAlpha(stops[0])];
  t = Math.max(0, Math.min(1, t));

  const first = stops[0];
  const last = stops[stops.length - 1];

  if (t <= first.position || t >= last.position) {
    if (!wrap) {
      const edge = t <= first.position ? first : last;
      return [...edge.color, stopAlpha(edge)];
    }
    // Cyclic segment last → first crossing the 1→0 seam.
    const span = 1 - last.position + first.position;
    const local = span <= 0
      ? 0
      : ((t >= last.position ? t - last.position : t + 1 - last.position) / span);
    if (mode === "step") return [...last.color, stopAlpha(last)];
    return [
      ...mixRampColors(last.color, first.color, local, mode),
      mixStopAlpha(last, first, local, mode),
    ];
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t > b.position) continue;
    if (mode === "step") return [...a.color, stopAlpha(a)];
    const span = b.position - a.position;
    const local = span <= 0 ? 0 : (t - a.position) / span;
    return [...mixRampColors(a.color, b.color, local, mode), mixStopAlpha(a, b, local, mode)];
  }
  return [...last.color, stopAlpha(last)];
}

export function sampleRamp(ramp: ColorRamp, t: number): [number, number, number] {
  const sorted = [...ramp.stops].sort((a, b) => a.position - b.position);
  const [r, g, b] = sampleSortedRampRGBA(sorted, ramp.mode, ramp.wrap, t);
  return [r, g, b];
}

export function sampleRampRGBA(ramp: ColorRamp, t: number): [number, number, number, number] {
  const sorted = [...ramp.stops].sort((a, b) => a.position - b.position);
  return sampleSortedRampRGBA(sorted, ramp.mode, ramp.wrap, t);
}

// 256-entry RGB lookup table so per-pixel value→color is a plain array read.
// Rebuilt only when the ramp object changes.
export function buildRampLUT(ramp: ColorRamp): Uint8Array {
  const sorted = [...ramp.stops].sort((a, b) => a.position - b.position);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = sampleSortedRampRGBA(sorted, ramp.mode, ramp.wrap, i / 255);
    lut[i * 3] = clampByte(r);
    lut[i * 3 + 1] = clampByte(g);
    lut[i * 3 + 2] = clampByte(b);
  }
  return lut;
}

// RGBA variant: 256 × 4 bytes, alpha included. This is what the layered lab
// compositor consumes; the RGB table above stays for single-pattern callers.
export function buildRampLUTRGBA(ramp: ColorRamp): Uint8Array {
  const sorted = [...ramp.stops].sort((a, b) => a.position - b.position);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = sampleSortedRampRGBA(sorted, ramp.mode, ramp.wrap, i / 255);
    lut[i * 4] = clampByte(r);
    lut[i * 4 + 1] = clampByte(g);
    lut[i * 4 + 2] = clampByte(b);
    lut[i * 4 + 3] = clampByte(a * 255);
  }
  return lut;
}

function normalizePatternCode(code: string) {
  return code
    .replace(/^\s*import\s+.*?;?\s*$/gm, "")
    .replace(/\bexport\s+function\b/g, "function");
}

export function compilePatternCode(code: string): PatternModule {
  const normalized = normalizePatternCode(code);
  const wrapper = `
    "use strict";
    ${normalized}
    return {
      setup: typeof setup === "function" ? setup : undefined,
      update: typeof update === "function" ? update : undefined,
      draw: typeof draw === "function" ? draw : undefined
    };
  `;
  const moduleObject = new Function(wrapper)() as Partial<PatternModule>;

  if (typeof moduleObject.draw !== "function") {
    throw new Error("Pattern must export draw(display, params, time).");
  }

  return moduleObject as PatternModule;
}

export class PatternRuntime {
  public readonly width: number;
  public readonly height: number;
  public readonly data: Uint8ClampedArray;

  // Active color ramp for setValue() and recolor. Exposed so callers can cheaply
  // check identity each frame and only call setRamp when the object changed.
  public ramp: ColorRamp | null = null;
  // When true, the whole frame is recolored after draw(): each pixel's luminance
  // is mapped through the ramp. Lets the ramp restyle ordinary RGB patterns.
  public recolor = false;

  private rampLUT: Uint8Array | null = null; // 256×3 RGB (recolor path)
  private rampLUTA: Uint8Array | null = null; // 256×4 RGBA (setValue path)
  private module: PatternModule | null = null;
  private params: PatternParams = {};
  private display: PatternDisplay;

  constructor(width = PATTERN_MATRIX_WIDTH, height = PATTERN_MATRIX_HEIGHT) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.display = {
      width,
      height,
      setPixel: (x, y, r, g, b) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return;

        // Tolerate the array form setPixel(x, y, [r, g, b]) as well as the
        // canonical setPixel(x, y, r, g, b).
        let cr: number;
        let cg: number;
        let cb: number;
        if (Array.isArray(r)) {
          cr = r[0] ?? 0;
          cg = r[1] ?? 0;
          cb = r[2] ?? 0;
        } else {
          cr = r;
          cg = g ?? 0;
          cb = b ?? 0;
        }

        const index = (yi * this.width + xi) * 4;
        this.data[index] = clampByte(cr);
        this.data[index + 1] = clampByte(cg);
        this.data[index + 2] = clampByte(cb);
        this.data[index + 3] = 255;
      },
      setValue: (x, y, v) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return;

        const value = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
        const index = (yi * this.width + xi) * 4;
        const lut = this.rampLUTA;
        if (lut) {
          const li = Math.round(value * 255) * 4;
          this.data[index] = lut[li];
          this.data[index + 1] = lut[li + 1];
          this.data[index + 2] = lut[li + 2];
          this.data[index + 3] = lut[li + 3];
        } else {
          const byte = Math.round(value * 255);
          this.data[index] = byte;
          this.data[index + 1] = byte;
          this.data[index + 2] = byte;
          this.data[index + 3] = 255;
        }
      },
    };
  }

  public setRamp(ramp: ColorRamp | null) {
    this.ramp = ramp;
    this.rampLUT = ramp && ramp.stops.length > 0 ? buildRampLUT(ramp) : null;
    this.rampLUTA = ramp && ramp.stops.length > 0 ? buildRampLUTRGBA(ramp) : null;
  }

  public loadCode(code: string): PatternRenderResult {
    try {
      this.module = compilePatternCode(code);
      this.params = {};
      this.data.fill(0);
      this.module.setup?.(this.params);
      return { ok: true };
    } catch (error) {
      this.module = null;
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public renderFrame(dt: number, time: number, input: PatternInput): PatternRenderResult {
    if (!this.module) {
      return { ok: false, error: "No pattern loaded." };
    }

    try {
      // Mirror knob/button state onto params so patterns that read
      // params.knobValues in draw() (instead of input.knobValues in update())
      // still work — input is only passed to update().
      this.params.knobValues = input.knobValues;
      this.params.knobNormalized = input.knobNormalized;
      this.params.knobDeltas = input.knobDeltas;
      this.params.knobRanges = input.knobRanges;
      this.params.btnPressed = input.btnPressed;
      this.params.btnHeld = input.btnHeld;

      this.module.update?.(dt, input, this.params);
      this.data.fill(0);
      this.module.draw(this.display, this.params, time);
      if (this.recolor && this.rampLUTA) {
        // Luminance → ramp, alpha included: with alpha stops an RGB pattern
        // recolors into a translucent layer (dark = transparent, etc.). Only
        // pixels the pattern actually wrote are touched — untouched pixels
        // stay fully transparent for the layer compositor.
        const lut = this.rampLUTA;
        const data = this.data;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] === 0) continue;
          const luminance = Math.round(
            0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2],
          );
          const li = luminance * 4;
          data[index] = lut[li];
          data[index + 1] = lut[li + 1];
          data[index + 2] = lut[li + 2];
          data[index + 3] = lut[li + 3];
        }
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public getParamsSnapshot() {
    return JSON.parse(JSON.stringify(this.params)) as PatternParams;
  }
}

export function createIdleInput(
  knobDeltas?: number[],
  options: {
    knobValues?: number[];
    knobNormalized?: number[];
    knobRanges?: Array<[number, number]>;
    btnPressed?: boolean[];
    btnHeld?: boolean[];
  } = {},
): PatternInput {
  return {
    knobDeltas: Array.from({ length: PATTERN_KNOB_COUNT }, (_, index) => knobDeltas?.[index] ?? 0),
    knobValues: options.knobValues,
    knobNormalized: options.knobNormalized,
    knobRanges: options.knobRanges,
    btnPressed: Array.from({ length: PATTERN_KNOB_COUNT }, (_, index) => options.btnPressed?.[index] ?? false),
    btnHeld: Array.from({ length: PATTERN_KNOB_COUNT }, (_, index) => options.btnHeld?.[index] ?? false),
  };
}

export function knobTargetToDelta(previous: number, next: number, wrap = false, unitsPerTurn = 1) {
  let delta = next - previous;
  if (wrap) {
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
  }
  return delta * (PATTERN_DETENTS_PER_TURN / unitsPerTurn);
}

export function renderPatternStill(
  code: string,
  {
    width = PATTERN_MATRIX_WIDTH,
    height = PATTERN_MATRIX_HEIGHT,
    seconds = 2.4,
    fps = 30,
    knobStart = [0.5, 0.5, 0.5, 0.5],
    knobTargets = [0.5, 0.5, 0.5, 0.5],
    knobRanges,
    knobWrap,
    knobUnitsPerTurn,
    ramp,
    recolor,
  }: PatternStillOptions = {},
) {
  const runtime = new PatternRuntime(width, height);
  if (ramp) runtime.setRamp(ramp);
  runtime.recolor = Boolean(recolor && ramp);
  const loadResult = runtime.loadCode(code);
  if (!loadResult.ok) {
    return { ...loadResult, data: runtime.data };
  }

  const frameCount = Math.max(1, Math.floor(seconds * fps));
  const firstDeltas = knobTargets.map((target, index) =>
    knobTargetToDelta(
      knobStart[index] ?? 0.5,
      target,
      knobWrap?.[index] ?? false,
      knobUnitsPerTurn?.[index] ?? 1,
    ),
  );
  const knobNormalized = knobTargets.map((target, index) => {
    const range = knobRanges?.[index];
    if (!range) return target;
    const span = Math.max(0.0001, range[1] - range[0]);
    return (target - range[0]) / span;
  });

  for (let frame = 0; frame < frameCount; frame++) {
    const input = createIdleInput(frame === 0 ? firstDeltas : undefined, {
      knobValues: knobTargets,
      knobNormalized,
      knobRanges,
    });
    const result = runtime.renderFrame(1 / fps, frame / fps, input);
    if (!result.ok) {
      return { ...result, data: runtime.data };
    }
  }

  return { ok: true, data: new Uint8ClampedArray(runtime.data) };
}
