// ── Layer-stack → firmware header (.h) export ────────────────────────────────
// The principle that makes this reliable: THE LLM NEVER TOUCHES MACHINE DATA.
//
// A layered composition splits into two kinds of content:
//
//   deterministic   buffers, knob accumulation, ramp LUTs (exact bytes),
//                   pixel art (RLE, exact bytes), masking, blending,
//                   compositing — Pattern Lab emits FINISHED C++ for all of
//                   it. No model in the loop, no way to corrupt a table.
//
//   creative        each code layer's JS translated to C++ — the only part
//                   that needs a model. Each layer becomes one small unit
//                   (namespace L<i> { setup/update/draw }) with a fixed
//                   contract, translated by its OWN focused prompt.
//
// The scaffold ships with compiling no-op stubs in every slot, so the file
// builds (black screen) before any translation lands; the export wizard
// swaps pasted units into the marked slots and assembles the final header.
// This kills the two failure modes that plagued whole-file conversion:
// models "optimizing" 1024-entry LUT arrays, and models re-deriving knob
// delta accumulation differently per pattern (the scaffold does it once).
//
// Composite math mirrors compositor.ts / flatten.ts — keep the three in sync.

import {
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  buildRampLUTRGBA,
} from "@/lib/patternHarness";
import { knobDetentStep } from "@/lib/patternflowControls";
import type { MatrixSize } from "@/lib/patternMatrix";
import { codeUsesValueField } from "@/lib/patternRamp";
import { KNOBS_ANNOTATION_RE } from "./annotations";
import { rampStateToHarness } from "./engine";
import type { CodeLayer, KnobRange, Layer } from "./types";

// ── helpers ──

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "Composition";
}

function fmtFloat(value: number): string {
  if (Number.isInteger(value)) return `${value}.0f`;
  return `${Math.round(value * 100000) / 100000}f`;
}

function stripLayerAnnotations(code: string): string {
  return code
    .replace(KNOBS_ANNOTATION_RE, "")
    .replace(/^[ \t]*\/\/[ \t]*@matrix[ \t].*$/gm, "")
    .replace(/^[ \t]*\/\/[ \t]*@ramp[ \t].*$/gm, "");
}

/** RLE pack RGBA bytes as {count, r, g, b, a} runs (count 1..255). */
export function rleEncode(data: Uint8ClampedArray): number[] {
  const out: number[] = [];
  let i = 0;
  const pixels = data.length / 4;
  while (i < pixels) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    let count = 1;
    while (
      count < 255 &&
      i + count < pixels &&
      data[(i + count) * 4] === r &&
      data[(i + count) * 4 + 1] === g &&
      data[(i + count) * 4 + 2] === b &&
      data[(i + count) * 4 + 3] === a
    ) {
      count++;
    }
    out.push(count, r, g, b, a);
    i += count;
  }
  return out;
}

/** Mirror of the scaffold's rleDecode, for round-trip testing. */
export function rleDecode(rle: number[], pixelCount: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixelCount * 4);
  let o = 0;
  for (let i = 0; i + 4 < rle.length && o < out.length; i += 5) {
    const count = rle[i];
    for (let k = 0; k < count && o < out.length; k++) {
      out[o++] = rle[i + 1];
      out[o++] = rle[i + 2];
      out[o++] = rle[i + 3];
      out[o++] = rle[i + 4];
    }
  }
  return out;
}

function byteRows(values: number[], perRow: number, indent: string): string {
  const rows: string[] = [];
  for (let i = 0; i < values.length; i += perRow) {
    rows.push(indent + values.slice(i, i + perRow).join(","));
  }
  return rows.join(",\n");
}

function lutRows(layer: CodeLayer): string {
  const lut = buildRampLUTRGBA(rampStateToHarness(layer.ramp));
  const entries: string[] = [];
  for (let i = 0; i < 256; i++) {
    entries.push(`{${lut[i * 4]},${lut[i * 4 + 1]},${lut[i * 4 + 2]},${lut[i * 4 + 3]}}`);
  }
  const rows: string[] = [];
  for (let i = 0; i < 256; i += 8) {
    rows.push("  " + entries.slice(i, i + 8).join(","));
  }
  return rows.join(",\n");
}

const blendCode = (blend: Layer["blend"]) =>
  blend === "add" ? 1 : blend === "multiply" ? 2 : blend === "screen" ? 3 : 0;

export const SLOT_BEGIN = (i: number) => `// >>> LAYER ${i} TRANSLATION BEGIN <<<`;
export const SLOT_END = (i: number) => `// >>> LAYER ${i} TRANSLATION END <<<`;

// ── export bundle ──

export type HExportLayerUnit = {
  /** Stack index (bottom → top) — also the L<i> namespace number. */
  index: number;
  name: string;
  usesValueField: boolean;
  isMask: boolean;
  /** The focused JS→C++ prompt for this one unit. */
  prompt: string;
};

export type HExportArgs = {
  name: string;
  matrix: MatrixSize;
  /** UI order (layers[0] = top). */
  layers: Layer[];
  knobs: number[];
  ranges: KnobRange[];
  knobLabels: string[];
};

export type HExport = {
  scaffold: string;
  units: HExportLayerUnit[];
  namespaceName: string;
  /** Bottom→top stack actually exported (visible layers). */
  stackNames: string[];
};

export function buildHExport(args: HExportArgs): HExport {
  const { name, matrix, knobs, ranges, knobLabels } = args;
  // Bottom → top, matching the compositor.
  const stack = [...args.layers]
    .reverse()
    .filter((layer) => layer.visible && (layer.role === "mask" || layer.opacity > 0));

  const ns = `LabStack_${sanitizeName(name)}`;
  const isPanelFrame =
    matrix.width === PATTERN_MATRIX_WIDTH && matrix.height === PATTERN_MATRIX_HEIGHT;

  // Paint groups + their masks (same lastPaint logic as engine/flatten).
  type Group = { layerIndex: number; opacity: number; blend: number; masks: number[] };
  const groups: Group[] = [];
  let lastPaint: Group | null = null;
  stack.forEach((layer, index) => {
    if (layer.role === "mask") {
      if (lastPaint) lastPaint.masks.push(index);
      return;
    }
    const group: Group = {
      layerIndex: index,
      opacity: layer.opacity,
      blend: blendCode(layer.blend),
      masks: [],
    };
    lastPaint = group;
    if (layer.opacity > 0) groups.push(group);
  });
  const maskFlat: { layerIndex: number; pixelArt: boolean; invert: boolean }[] = [];
  const groupMaskAt: number[] = [];
  for (const group of groups) {
    groupMaskAt.push(maskFlat.length);
    for (const maskIndex of group.masks) {
      const maskLayer = stack[maskIndex];
      maskFlat.push({
        layerIndex: maskIndex,
        pixelArt: maskLayer.type === "pixel",
        invert: maskLayer.maskInvert,
      });
    }
  }

  const codeLayers = stack
    .map((layer, index) => ({ layer, index }))
    .filter((entry): entry is { layer: CodeLayer; index: number } => entry.layer.type === "code");

  const knobNorm = knobs.map((value, i) => {
    const range = ranges[i] ?? [0, 1];
    const span = Math.max(0.0001, range[1] - range[0]);
    return Math.max(0, Math.min(1, (value - range[0]) / span));
  });

  const parts: string[] = [];
  parts.push(`// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: ${name} — Pattern Lab layer-stack composition (${stack.length} layer${stack.length === 1 ? "" : "s"})
//
// SCAFFOLD (deterministic, generated by Pattern Lab — do not hand-edit):
// buffers, shared-knob accumulation, ramp LUTs, pixel art, masks, blending
// and compositing are finished code. ONLY the "namespace L<i>" blocks between
// the >>> markers are translated from each layer's JavaScript; stubs compile
// to a black layer until replaced.
//
// Layers (bottom → top):
${stack.map((layer, i) => `//   L${i}. ${layer.name.replace(/\n/g, " ")} (${layer.type}${layer.role === "mask" ? `, MASK${layer.maskInvert ? " inverted" : ""}` : `, ${layer.blend}, ${Math.round(layer.opacity * 100)}%`})`).join("\n")}
#pragma once
#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_mem.h"
#include "src/core_math.h"
#include "src/core_color.h"
#include "src/core_noise.h"
#include "src/core_params.h"${isPanelFrame ? `\n#include "src/core_tables.h"` : ""}

namespace ${ns} {

const char* NAME = "${name.replace(/"/g, "'").slice(0, 24)}";
const char* const KNOB_LABELS[4] = {${knobLabels.map((label) => `"${label.replace(/"/g, "'").slice(0, 14)}"`).join(", ")}};
// Knobs run through PFParams: the MQTT absolute bus (Director / Show
// manager, 0..1000) can pin any of them deterministically.
constexpr bool ABSOLUTE_READY = true;

constexpr int FRAME_W = ${matrix.width};
constexpr int FRAME_H = ${matrix.height};
constexpr int PIX_N = FRAME_W * FRAME_H;
constexpr int LAYER_N = ${stack.length};

// ── Shared knobs: encoder detents become values HERE, once, for every layer ──
static const float KNOB_MIN[4]  = {${ranges.map((r) => fmtFloat(r[0])).join(", ")}};
static const float KNOB_MAX[4]  = {${ranges.map((r) => fmtFloat(r[1])).join(", ")}};
static const float KNOB_STEP[4] = {${ranges.map((r) => fmtFloat(knobDetentStep(r))).join(", ")}}; // value per detent — two turns cross the range
static float knobVal[4]  = {${knobs.map(fmtFloat).join(", ")}};
static float knobNorm[4] = {${knobNorm.map(fmtFloat).join(", ")}};

// ── Layer buffers (RGBA8, PSRAM-first, allocated once in setup) ──
static uint8_t* layerBuf[LAYER_N] = {${stack.map(() => "nullptr").join(", ")}};`);

  // Paint groups + masks.
  const maskCount = Math.max(1, maskFlat.length);
  parts.push(`
// ── Composite plan (bottom → top; blend: 0 normal, 1 add, 2 multiply, 3 screen) ──
constexpr int GROUP_N = ${groups.length};
static const uint8_t G_LAYER[${Math.max(1, groups.length)}]   = {${groups.map((g) => g.layerIndex).join(", ") || "0"}};
static const float   G_OPACITY[${Math.max(1, groups.length)}] = {${groups.map((g) => fmtFloat(g.opacity)).join(", ") || "0.0f"}};
static const uint8_t G_BLEND[${Math.max(1, groups.length)}]   = {${groups.map((g) => g.blend).join(", ") || "0"}};
static const uint8_t G_MASK_AT[${Math.max(1, groups.length)}] = {${groupMaskAt.join(", ") || "0"}};
static const uint8_t G_MASK_N[${Math.max(1, groups.length)}]  = {${groups.map((g) => g.masks.length).join(", ") || "0"}};
static const uint8_t MASK_LAYER[${maskCount}]  = {${maskFlat.map((m) => m.layerIndex).join(", ") || "0"}};
static const uint8_t MASK_PXART[${maskCount}]  = {${maskFlat.map((m) => (m.pixelArt ? 1 : 0)).join(", ") || "0"}};
static const uint8_t MASK_INVERT[${maskCount}] = {${maskFlat.map((m) => (m.invert ? 1 : 0)).join(", ") || "0"}};`);

  // Per-code-layer ramp LUTs + paint helpers; pixel layers as RLE.
  for (let index = 0; index < stack.length; index++) {
    const layer = stack[index];
    if (layer.type === "pixel") {
      const rle = rleEncode(layer.data);
      parts.push(`
// ── L${index} "${layer.name.replace(/\n/g, " ")}": pixel art, RLE {count,r,g,b,a} — decoded once in setup ──
static const uint8_t L${index}_RLE[${rle.length}] = {
${byteRows(rle, 20, "  ")}
};`);
      continue;
    }
    parts.push(`
// ── L${index} "${layer.name.replace(/\n/g, " ")}": ramp LUT (RGBA, alpha included — baked by Pattern Lab, copy-proof) ──
static const uint8_t L${index}_RAMP[256][4] = {
${lutRows(layer)}
};
static inline void L${index}_setValue(int x, int y, float v) {
  if ((unsigned)x >= (unsigned)FRAME_W || (unsigned)y >= (unsigned)FRAME_H) return;
  if (!(v > 0.0f)) v = 0.0f; else if (v > 1.0f) v = 1.0f;
  const uint8_t* c = L${index}_RAMP[(int)(v * 255.0f + 0.5f)];
  uint8_t* p = layerBuf[${index}] + (((size_t)y * FRAME_W + x) << 2);
  p[0] = c[0]; p[1] = c[1]; p[2] = c[2]; p[3] = c[3];
}
static inline void L${index}_setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  if ((unsigned)x >= (unsigned)FRAME_W || (unsigned)y >= (unsigned)FRAME_H) return;
  uint8_t* p = layerBuf[${index}] + (((size_t)y * FRAME_W + x) << 2);
  p[0] = r; p[1] = g; p[2] = b; p[3] = 255;
}`);
  }

  // Translation slots with compiling stubs.
  for (const { layer, index } of codeLayers) {
    parts.push(`
${SLOT_BEGIN(index)}
namespace L${index} { // "${layer.name.replace(/\n/g, " ")}" — STUB. Replace this whole namespace with the
                      // AI translation (Pattern Lab → firmware export → Copy prompt for L${index}).
  void setup() {}
  void update(float dt, const InputFrame& input) { (void)dt; (void)input; }
  void draw() {}
}
${SLOT_END(index)}`);
  }

  // Deterministic pipeline.
  const pixelDecodes = stack
    .map((layer, index) =>
      layer.type === "pixel"
        ? `  rleDecode(L${index}_RLE, sizeof(L${index}_RLE), layerBuf[${index}]);`
        : null,
    )
    .filter(Boolean)
    .join("\n");
  const layerSetups = codeLayers.map(({ index }) => `  L${index}::setup();`).join("\n");
  const layerUpdates = codeLayers.map(({ index }) => `  L${index}::update(dt, input);`).join("\n");
  const layerDraws = codeLayers
    .map(({ layer, index }) => {
      const recolor = layer.recolor
        ? `\n  recolorBuffer(layerBuf[${index}], L${index}_RAMP);`
        : "";
      return `  memset(layerBuf[${index}], 0, (size_t)PIX_N * 4);\n  L${index}::draw();${recolor}`;
    })
    .join("\n");

  parts.push(`
// ── Deterministic pipeline (do not edit) ──
static void rleDecode(const uint8_t* rle, size_t len, uint8_t* out) {
  size_t o = 0;
  const size_t cap = (size_t)PIX_N * 4;
  for (size_t i = 0; i + 4 < len && o < cap; i += 5) {
    for (int k = 0; k < rle[i] && o < cap; k++) {
      out[o++] = rle[i + 1]; out[o++] = rle[i + 2]; out[o++] = rle[i + 3]; out[o++] = rle[i + 4];
    }
  }
}

// Binary mask test — identical to the Pattern Lab preview: pixel art is "on"
// where something was drawn (alpha >= 0.5); code layers where ramp-colored
// luminance x alpha crosses 0.5.
static inline bool maskOn(const uint8_t* p, bool pixelArt, bool invert) {
  bool on;
  if (pixelArt) on = p[3] >= 128;
  else on = (0.2126f * p[0] + 0.7152f * p[1] + 0.0722f * p[2]) * (p[3] / 255.0f) >= 127.5f;
  return invert ? !on : on;
}

static void recolorBuffer(uint8_t* buf, const uint8_t lut[256][4]) {
  for (int i = 0; i < PIX_N; i++) {
    uint8_t* p = buf + (size_t)i * 4;
    if (p[3] == 0) continue;
    int lum = (int)(0.2126f * p[0] + 0.7152f * p[1] + 0.0722f * p[2] + 0.5f);
    if (lum > 255) lum = 255;
    const uint8_t* c = lut[lum];
    p[0] = c[0]; p[1] = c[1]; p[2] = c[2]; p[3] = c[3];
  }
}

void setup() {
  for (int i = 0; i < LAYER_N; i++)
    if (!layerBuf[i]) layerBuf[i] = (uint8_t*)PFMem::alloc((size_t)PIX_N * 4);
  for (int i = 0; i < LAYER_N; i++)
    if (!layerBuf[i]) return; // allocation failed → draw() degrades to blank
${pixelDecodes ? `${pixelDecodes}\n` : ""}${layerSetups}
}

void update(float dt, const InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    // Absolute bus (when held) > audio/weather > encoder deltas — one call,
    // same clamping the old delta loop did.
    PFParams::apply(input, i, &knobVal[i], KNOB_MIN[i], KNOB_MAX[i], KNOB_STEP[i]);
    knobNorm[i] = (knobVal[i] - KNOB_MIN[i]) / (KNOB_MAX[i] - KNOB_MIN[i]);
  }
${layerUpdates}
}

void draw() {${isPanelFrame ? "" : "\n  PFCanvas::setFrame(FRAME_W, FRAME_H);"}
  for (int i = 0; i < LAYER_N; i++)
    if (!layerBuf[i]) { PFCanvas::present(); return; }

${layerDraws}

  // Composite bottom → top over the panel's black — same math as the web preview.
  for (int y = 0; y < FRAME_H; y++) {
    for (int x = 0; x < FRAME_W; x++) {
      const size_t j = ((size_t)y * FRAME_W + x) << 2;
      float cr = 0.0f, cg = 0.0f, cb = 0.0f;
      for (int gi = 0; gi < GROUP_N; gi++) {
        bool hidden = false;
        for (int m = 0; m < G_MASK_N[gi]; m++) {
          const int mi = G_MASK_AT[gi] + m;
          if (!maskOn(layerBuf[MASK_LAYER[mi]] + j, MASK_PXART[mi] != 0, MASK_INVERT[mi] != 0)) {
            hidden = true;
            break;
          }
        }
        if (hidden) continue;
        const uint8_t* p = layerBuf[G_LAYER[gi]] + j;
        const float a = (p[3] / 255.0f) * G_OPACITY[gi];
        if (a <= 0.0f) continue;
        const float sr = p[0], sg = p[1], sb = p[2], inv = 1.0f - a;
        switch (G_BLEND[gi]) {
          case 1: cr += sr * a; cg += sg * a; cb += sb * a; break;
          case 2:
            cr = cr * inv + (cr * sr / 255.0f) * a;
            cg = cg * inv + (cg * sg / 255.0f) * a;
            cb = cb * inv + (cb * sb / 255.0f) * a;
            break;
          case 3:
            cr = cr * inv + (255.0f - (255.0f - cr) * (255.0f - sr) / 255.0f) * a;
            cg = cg * inv + (255.0f - (255.0f - cg) * (255.0f - sg) / 255.0f) * a;
            cb = cb * inv + (255.0f - (255.0f - cb) * (255.0f - sb) / 255.0f) * a;
            break;
          default:
            cr = cr * inv + sr * a;
            cg = cg * inv + sg * a;
            cb = cb * inv + sb * a;
            break;
        }
      }
      int ir = (int)(cr + 0.5f); if (ir > 255) ir = 255;
      int ig = (int)(cg + 0.5f); if (ig > 255) ig = 255;
      int ib = (int)(cb + 0.5f); if (ib > 255) ib = 255;
      PFCanvas::setPixel(x, y, (uint8_t)ir, (uint8_t)ig, (uint8_t)ib);
    }
  }
  PFCanvas::present();
}

} // namespace ${ns}`);

  const scaffold = parts.join("\n");

  const units: HExportLayerUnit[] = codeLayers.map(({ layer, index }) => ({
    index,
    name: layer.name,
    usesValueField: codeUsesValueField(layer.code),
    isMask: layer.role === "mask",
    prompt: buildLayerPrompt({
      layer,
      index,
      matrix,
      isPanelFrame,
      knobs,
      ranges,
      knobLabels,
    }),
  }));

  return {
    scaffold,
    units,
    namespaceName: ns,
    stackNames: stack.map((layer) => layer.name),
  };
}

// ── per-layer translation prompt ──

function buildLayerPrompt({
  layer,
  index,
  matrix,
  isPanelFrame,
  knobs,
  ranges,
  knobLabels,
}: {
  layer: CodeLayer;
  index: number;
  matrix: MatrixSize;
  isPanelFrame: boolean;
  knobs: number[];
  ranges: KnobRange[];
  knobLabels: string[];
}): string {
  const usesValueField = codeUsesValueField(layer.code);
  const L = `L${index}`;

  const knobLines = ranges
    .map(
      (range, i) =>
        `- knobVal[${i}] "${knobLabels[i]}": min ${range[0]}, max ${range[1]}, current ${knobs[i]}`,
    )
    .join("\n");

  const frameSection = isPanelFrame
    ? `- The frame equals the panel (${matrix.width} × ${matrix.height}), so PFTables IS available: for radius/angle from the FIXED center call PFTables::init() once in setup() and read PFTables::rT[y * PANEL_RES_W + x] / PFTables::thetaT[...] in draw() — never per-pixel sqrtf/atan2f for a fixed center.`
    : `- This composition's frame is ${matrix.width} × ${matrix.height}, which is NOT the panel's ${PATTERN_MATRIX_WIDTH} × ${PATTERN_MATRIX_HEIGHT}. Do NOT use PFTables (its tables are indexed by the panel grid) and do not call PFTables::init(). Compute radius with sqrtf and angle with PFMath::fastAtan2 from the frame centre (FRAME_W * 0.5f, FRAME_H * 0.5f). The scaffold owns PFCanvas::setFrame — never call it yourself.`;

  return `Translate ONE LAYER of a Patternflow layer-stack composition from JavaScript to C++ for the ESP32-S3 firmware.

This layer plugs into an already-finished scaffold header. The scaffold owns the canvas, present(), frame mapping, knob accumulation, the color ramp, masking and compositing — you translate ONLY this layer's drawing logic.

## Output format
- ONE code block labeled cpp containing EXACTLY one namespace and nothing else:

    namespace ${L} {
      // your statics...
      void setup() { ... }
      void update(float dt, const InputFrame& input) { ... }
      void draw() { ... }
    }

- All three functions must be defined (empty bodies are fine). No includes, no code outside the namespace, no NAME/KNOB_LABELS, no prose before or after the block, no nested triple backticks.

## The layer contract — deviations break the assembly
- Draw ONLY through these scaffold-provided functions:
    ${L}_setValue(int x, int y, float v);                 // v 0..1 — this layer's color ramp (alpha included) is PRE-BAKED into a LUT behind this call
    ${L}_setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b);
${
    usesValueField
      ? `  This layer is a VALUE FIELD: the JS draws with display.setValue(x, y, v). Use ${L}_setValue exclusively and write NO color code whatsoever — no HSV, no palettes, no LUTs of your own. The ramp is already baked.`
      : `  This layer draws RGB directly: translate display.setPixel(x, y, r, g, b) calls to ${L}_setPixel(x, y, r, g, b).`
  }
- Loop over FRAME_W × FRAME_H (scaffold constants). Coordinates are logical — never rotate, mirror, offset, or letterbox them, never call PFCanvas:: anything, never call present().
- Pixels you don't write stay transparent for the compositor — if the JS clears to black each frame implicitly by writing every pixel, keep writing every pixel; if it intentionally leaves pixels unwritten, leave them unwritten.
- KNOBS ARE ALREADY ACCUMULATED by the scaffold. Read them, never compute them:
    knobVal[i]    // absolute value — identical to input.knobValues[i] in the JS
    knobNorm[i]   // the same knob normalized 0..1 — identical to input.knobNormalized[i]
  Do NOT touch input.knobDeltas and do NOT constrain/accumulate knob state yourself.
- Buttons map 1:1: JS input.btnPressed[i] / input.btnHeld[i] are the same fields on the C++ InputFrame (edge vs level), read them in update(). Never consume long-press.
- JS params.* state becomes namespace statics. The JS draw(display, params, time) \`time\` argument does not exist here: keep your own time accumulator(s) in update() and wrap them (see Performance).

Shared knob reference (labels and current tuning):
${knobLines}

## Memory rules — big buffers must never be static arrays
- Any per-pixel buffer (trail map, glow accumulator — anything sized by FRAME_W * FRAME_H) must be a POINTER allocated once in setup() with PFMem::allocFloats(count) (PSRAM-first, zeroed):

    static float* trail = nullptr;
    void setup() { if (!trail) trail = PFMem::allocFloats(FRAME_W * FRAME_H); }

- Guard update() with \`if (!trail) return;\` and draw() with \`if (!trail) return;\` so a failed allocation degrades to a blank layer (the scaffold still presents).
- Fixed-size state (particle arrays, lookup tables of any shape) stays as plain statics — up to about 32 KB total per layer is comfortable, and a table costs memory without costing frame rate. Prefer precomputing anything that depends only on x, y or a constant in setup() over recomputing it per pixel.

## DO NOT reimplement existing helpers
- DO NOT write your own HSV→RGB. Call PFColor::hsvToRgb(h01, s01, v01, r8, g8, b8) — h is 0..1, outputs are uint8_t&.
- DO NOT write your own sin LUT or fast-sin. Call PFMath::buildSinLUT() once in setup(); use PFMath::fastSin / fastCos in draw().
- DO NOT write your own Perlin/fractal noise. Use PFNoise::valueNoise2D / perlin2D / fractal2D.
- DO NOT translate fract(sin(x*127.1+y*311.7)*43758.5453)-style hashes literally, and NEVER build a hash from PFMath::fastSin — use PFNoise::cellHash(gx, gy) (optional int seed).

## Expensive math — pick the tool by situation
${frameSection}
- Angle from a MOVING center: PFMath::fastAtan2(dy, dx). Never atan2f in the pixel loop.
- Distance from a MOVING center: sqrtf(dx*dx + dy*dy) — cheap on the S3 FPU.
- powf(v, CONSTANT): v*v for squares; otherwise bake a LUT in setup() with PFColor::buildPowLUT(exp, lut) / buildPowLUTf(exp, lutf) and index it in draw().
- powf(v, e) with varying e: PFMath::fastPow(v, e) (returns 0 for v <= 0 — branch explicitly if the JS relied on Infinity-clamping).
- sin/cos inside the pixel loop: PFMath::fastSin / fastCos only.
- Macro collisions: do NOT define your own PI, TWO_PI, HALF_PI, min, max, abs, sq, round, constrain, MAX_HUE, MAX_SPEED, SPEED_STEP, MAX_FREQ, FREQ_STEP. Use existing PI/TWO_PI; prefix your constants with ${L}_.

## Performance
- Hoist anything depending only on time, row, or knobs out of the inner pixel loop.
- Wrap every time accumulator at its period (TWO_PI for integer sin multipliers; a common multiple otherwise; PFMath::fract for hue drifts). The device runs for days — an unbounded t += dt is a bug even if it looks fine.
- Preserve the JS's visual character: value bands, thresholds, distance-driven hue live in the local rules — keep them.

## Self-check before output
1. Exactly one namespace ${L} with setup/update/draw defined, nothing outside it?
2. Every pixel write via ${usesValueField ? `${L}_setValue` : `${L}_setPixel`}, zero PFCanvas/present/setFrame calls${usesValueField ? ", zero color code" : ""}?
3. Knobs read from knobVal/knobNorm only — no knobDeltas, no constrain of knob state?
4. Any framebuffer-sized static array? Convert to PFMem::allocFloats with null guards.
5. Every time accumulator wrapped? Every helper from PF* instead of hand-rolled?
6. Valid compilable C++ — no placeholders, no truncation, no stray tokens?

## JavaScript source for THIS layer ("${layer.name.replace(/\n/g, " ")}")
\`\`\`javascript
${stripLayerAnnotations(layer.code)}
\`\`\``;
}

// ── assembly ──

/** Strip a pasted LLM answer down to the code (drop \`\`\` fences / prose edges). */
export function cleanPastedUnit(pasted: string, index: number): string | null {
  let text = pasted.trim();
  const fence = text.match(/```(?:cpp|c\+\+|arduino)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!new RegExp(`namespace\\s+L${index}\\b`).test(text)) return null;
  return text;
}

/** Swap pasted layer units into their marked slots. Missing units keep stubs. */
export function assembleH(scaffold: string, units: Record<number, string>): string {
  let out = scaffold;
  for (const [key, unit] of Object.entries(units)) {
    const index = Number(key);
    const cleaned = cleanPastedUnit(unit, index);
    if (!cleaned) continue;
    const begin = SLOT_BEGIN(index);
    const end = SLOT_END(index);
    const beginAt = out.indexOf(begin);
    const endAt = out.indexOf(end);
    if (beginAt < 0 || endAt < 0 || endAt <= beginAt) continue;
    out =
      out.slice(0, beginAt + begin.length) + "\n" + cleaned + "\n" + out.slice(endAt);
  }
  return out;
}
