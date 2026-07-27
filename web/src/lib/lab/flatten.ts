// ── Layer-stack flattening ───────────────────────────────────────────────────
// Turns the lab's layered composition into ONE standalone JS pattern that any
// existing consumer understands: the community sandbox, "Open in Pattern Lab",
// the AI variation prompt, and — because the output is plain setup/update/draw
// with setPixel — the C++ conversion prompt for the ESP32 firmware (the .h
// path). That last consumer shapes every choice here:
//
//   · each code layer's color ramp is baked into a 256×4 RGBA LUT array —
//     no interpolation code to translate, just a table to copy
//   · pixel-art layers embed as base64 with a ~10-line alphabet decoder
//     (no atob), which ports to C++ mechanically — or can be swapped for a
//     PROGMEM byte array by a deterministic exporter later
//   · blending is the same integer-friendly math as compositor.ts — keep the
//     two in sync
//
// Layer code is embedded inside an IIFE so same-named functions/consts in two
// layers can never collide; the wrapper feeds each layer a private display
// writing into its own RGBA buffer, then composites bottom → top.

import { buildRampLUTRGBA } from "@/lib/patternHarness";
import { withMatrixAnnotation, type MatrixSize } from "@/lib/patternMatrix";
import { codeUsesValueField } from "@/lib/patternRamp";
import { KNOBS_ANNOTATION_RE, defaultKnobState } from "./annotations";
import { rampStateToHarness } from "./engine";
import { bytesToBase64 } from "./serialize";
import type { CodeLayer, KnobRange, Layer } from "./types";

export type FlattenKnobs = { labels: string[]; ranges: KnobRange[] };

function stripForEmbedding(code: string): string {
  return code
    .replace(/^\s*import\s+.*?;?\s*$/gm, "")
    .replace(/\bexport\s+function\b/g, "function")
    .replace(KNOBS_ANNOTATION_RE, "")
    .replace(/^[ \t]*\/\/[ \t]*@matrix[ \t].*$/gm, "")
    .replace(/^[ \t]*\/\/[ \t]*@ramp[ \t].*$/gm, "");
}

function lutLiteral(layer: CodeLayer): string {
  const lut = buildRampLUTRGBA(rampStateToHarness(layer.ramp));
  return `[${Array.from(lut).join(",")}]`;
}

/** Does this composition even need flattening, or is it a single plain pattern? */
export function needsFlatten(layers: Layer[]): boolean {
  const visible = layers.filter(
    (layer) => layer.visible && (layer.role === "mask" || layer.opacity > 0),
  );
  if (visible.length !== 1) return true;
  return visible[0].type !== "code" || visible[0].role === "mask";
}

export function flattenLayers(
  layers: Layer[],
  matrix: MatrixSize,
  knobConfig?: FlattenKnobs,
): string {
  // Bottom → top for compositing. Masks ride along regardless of opacity
  // (opacity is a paint concept; a mask is binary).
  const stack = [...layers]
    .reverse()
    .filter((layer) => layer.visible && (layer.role === "mask" || layer.opacity > 0));

  const manifest = stack
    .map(
      (layer, index) =>
        `//   ${index + 1}. ${layer.name.replace(/\n/g, " ")} (${layer.type}, ${
          layer.role === "mask"
            ? `MASK${layer.maskInvert ? " inverted" : ""}`
            : `${layer.blend}, ${Math.round(layer.opacity * 100)}%`
        })`,
    )
    .join("\n");

  const parts: string[] = [];
  parts.push(`// Patternflow layer-stack composition — flattened by Pattern Lab.
// Layers (bottom → top):
${manifest}
const __W = ${matrix.width}, __H = ${matrix.height};
const __stack = [];

function __b64(s, n) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = new Uint8ClampedArray(n);
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < s.length && o < n; i++) {
    const v = A.indexOf(s[i]);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out;
}

function __mkDisplay(L) {
  return {
    width: __W, height: __H,
    setPixel(x, y, r, g, b) {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || xi >= __W || yi < 0 || yi >= __H) return;
      const i = (yi * __W + xi) * 4, B = L.buf;
      if (Array.isArray(r)) { B[i] = r[0] || 0; B[i + 1] = r[1] || 0; B[i + 2] = r[2] || 0; }
      else { B[i] = r; B[i + 1] = g || 0; B[i + 2] = b || 0; }
      B[i + 3] = 255;
    },
    setValue(x, y, v) {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || xi >= __W || yi < 0 || yi >= __H) return;
      v = Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0;
      const i = (yi * __W + xi) * 4, B = L.buf, T = L.lut;
      if (T) {
        const li = Math.round(v * 255) * 4;
        B[i] = T[li]; B[i + 1] = T[li + 1]; B[i + 2] = T[li + 2]; B[i + 3] = T[li + 3];
      } else {
        const byte = Math.round(v * 255);
        B[i] = byte; B[i + 1] = byte; B[i + 2] = byte; B[i + 3] = 255;
      }
    },
  };
}`);

  for (const layer of stack) {
    const roleProps = `role: "${layer.role}", maskInvert: ${layer.maskInvert}`;
    if (layer.type === "pixel") {
      parts.push(`
// ── pixel layer: ${layer.name.replace(/\n/g, " ")} ──
__stack.push({
  kind: "pixel", opacity: ${layer.opacity}, blend: "${layer.blend}", ${roleProps},
  buf: __b64("${bytesToBase64(layer.data)}", __W * __H * 4),
});`);
      continue;
    }

    const usesValue = codeUsesValueField(layer.code);
    const needsLUT = usesValue || layer.recolor;
    parts.push(`
// ── code layer: ${layer.name.replace(/\n/g, " ")} ──
(function () {
  // Shadow the wrapper's own exports: a layer that defines no setup/update
  // must yield undefined here, not capture the OUTER setup (infinite loop).
  var setup, update, draw;
${stripForEmbedding(layer.code)}
  __stack.push({
    kind: "code", opacity: ${layer.opacity}, blend: "${layer.blend}", recolor: ${layer.recolor}, ${roleProps},
    lut: ${needsLUT ? lutLiteral(layer) : "null"},
    buf: new Uint8ClampedArray(__W * __H * 4),
    params: {},
    fSetup: typeof setup === "function" ? setup : null,
    fUpdate: typeof update === "function" ? update : null,
    fDraw: typeof draw === "function" ? draw : null,
  });
})();`);
  }

  parts.push(`
// Mask grouping: a mask layer paints nothing — it gates the nearest paint
// layer BELOW it (stacked masks intersect). Binary threshold: pixel-art masks
// switch on where alpha >= 0.5, code masks where luminance × alpha >= 0.5.
const __groups = [];
{
  let last = null;
  for (const L of __stack) {
    if (L.role === "mask") { if (last) last.masks.push(L); continue; }
    L.masks = [];
    last = L;
    if (L.opacity > 0) __groups.push(L);
  }
}

function __maskOn(M, j) {
  const B = M.buf;
  let on;
  if (M.kind === "pixel") on = B[j + 3] >= 128;
  else on = (0.2126 * B[j] + 0.7152 * B[j + 1] + 0.0722 * B[j + 2]) * (B[j + 3] / 255) >= 127.5;
  return M.maskInvert ? !on : on;
}

// One shared knob set: every layer receives the same input, exactly like
// patterns running on the device's four physical encoders.
function __mirror(L) {
  const inp = L.lastInput;
  if (!inp) return;
  L.params.knobValues = inp.knobValues;
  L.params.knobNormalized = inp.knobNormalized;
  L.params.knobDeltas = inp.knobDeltas;
  L.params.knobRanges = inp.knobRanges;
  L.params.btnPressed = inp.btnPressed;
  L.params.btnHeld = inp.btnHeld;
}

export function setup(params) {
  for (const L of __stack) {
    if (L.kind !== "code") continue;
    L.display = __mkDisplay(L);
    if (L.fSetup) L.fSetup(L.params);
  }
}

export function update(dt, input, params) {
  for (const L of __stack) {
    if (L.kind !== "code") continue;
    L.lastInput = input;
    __mirror(L);
    if (L.fUpdate) L.fUpdate(dt, input, L.params);
  }
}

export function draw(display, params, time) {
  for (const L of __stack) {
    if (L.kind !== "code" || !L.fDraw) continue;
    L.buf.fill(0);
    __mirror(L);
    L.fDraw(L.display, L.params, time);
    if (L.recolor && L.lut) {
      const B = L.buf, T = L.lut;
      for (let i = 0; i < B.length; i += 4) {
        if (B[i + 3] === 0) continue;
        const lum = Math.round(0.2126 * B[i] + 0.7152 * B[i + 1] + 0.0722 * B[i + 2]) * 4;
        B[i] = T[lum]; B[i + 1] = T[lum + 1]; B[i + 2] = T[lum + 2]; B[i + 3] = T[lum + 3];
      }
    }
  }

  // Composite bottom → top over the panel's opaque black.
  const count = __W * __H;
  for (let i = 0; i < count; i++) {
    const j = i * 4;
    let r = 0, g = 0, b = 0;
    for (const L of __groups) {
      let hidden = false;
      for (let m = 0; m < L.masks.length; m++) {
        if (!__maskOn(L.masks[m], j)) { hidden = true; break; }
      }
      if (hidden) continue;
      const B = L.buf;
      const a = (B[j + 3] / 255) * L.opacity;
      if (a <= 0) continue;
      const sr = B[j], sg = B[j + 1], sb = B[j + 2], inv = 1 - a;
      if (L.blend === "add") { r += sr * a; g += sg * a; b += sb * a; }
      else if (L.blend === "multiply") {
        r = r * inv + ((r * sr) / 255) * a;
        g = g * inv + ((g * sg) / 255) * a;
        b = b * inv + ((b * sb) / 255) * a;
      } else if (L.blend === "screen") {
        r = r * inv + (255 - ((255 - r) * (255 - sr)) / 255) * a;
        g = g * inv + (255 - ((255 - g) * (255 - sg)) / 255) * a;
        b = b * inv + (255 - ((255 - b) * (255 - sb)) / 255) * a;
      } else {
        r = r * inv + sr * a;
        g = g * inv + sg * a;
        b = b * inv + sb * a;
      }
    }
    display.setPixel(i % __W, (i / __W) | 0, r, g, b);
  }
}`);

  // Carry the shared knob labels/ranges so reopening the flattened pattern
  // restores the same tuning.
  const hasCode = stack.some((layer): layer is CodeLayer => layer.type === "code");
  const knobState = knobConfig ?? {
    labels: defaultKnobState().labels,
    ranges: defaultKnobState().ranges,
  };
  const trim = (value: number) => `${Math.round(value * 1000) / 1000}`;
  const knobsLine = hasCode
    ? `// @knobs ${knobState.labels
        .map((label, index) => {
          const range = knobState.ranges[index] ?? [0, 1];
          const name = label.replace(/[,=]/g, " ").trim() || "-";
          return `${name}=${trim(range[0])}..${trim(range[1])}`;
        })
        .join(", ")}`
    : null;

  const body = parts.join("\n");
  return withMatrixAnnotation(knobsLine ? `${knobsLine}\n${body}` : body, matrix);
}
