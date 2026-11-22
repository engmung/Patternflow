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
// The header has no divide in its pixel loop. On the S3 a float divide by
// anything but a constant power of two is a call into __divsf3, and the
// scaffold made one for every paint layer on every pixel, three more in
// multiply and screen, and one in a code mask's test. A byte over 255 comes
// from a 256-entry table the compiler works out (OVER_255), and the mask
// compares with both sides times 255.
//
// Multiplying by 1.0f / 255.0f is shorter and is not the same number. In
// screen it leaves an exact half just under itself, and the header then rounds
// down where the preview rounds up: textExport.test.ts's stacks at 50% and 25%
// went from one LED a level off the preview to 160. The table holds the
// divide's own quotients.

import {
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  buildRampLUTRGBA,
} from "@/lib/pattern/harness";
import { knobDetentStep, normalizeKnob } from "@/lib/pattern/controls";
import type { MatrixSize } from "@/lib/pattern/matrix";
import { codeUsesValueField } from "@/lib/pattern/ramp";
import { KNOBS_ANNOTATION_RE } from "./annotations";
import { exportStack } from "./compositor";
import { RAMP_LUT_PLACEHOLDER, bakedRampLut, rampUse } from "./cppPrompt";
import {
  BUTTONS_RULE,
  DO_NOT_REIMPLEMENT,
  HELPER_SIGNATURES_INTRO,
  MEMORY_FIXED_STATE,
  MEMORY_HEADING,
  MEMORY_STATICS,
  MEMORY_TABLES_INIT,
  NAN_RULES,
  NO_PANEL_TABLES,
  WALL_TIME_RULE,
  expensiveMath,
  helperSignatures,
  macroCollisions,
  performanceRules,
} from "./cppRules";
import { rampStateToHarness } from "./engine";
import { TEXT_EFFECT_RATE, activeTextEffect, textEffectPeriod, textEffectSource, type ActiveTextEffect } from "./textEffects";
import { isRasterLayer, type CodeLayer, type KnobRange, type Layer, type RampLayer, type RampState, type TextLayer, type TextSource } from "./types";

// ── helpers ──

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "Composition";
}

// Rounded before the whole-number test: a Director knob at 62.99999999999999
// only becomes whole at five places, and 63f is not a C++ literal.
function fmtFloat(value: number): string {
  const text = String(Math.round(value * 100000) / 100000);
  return /[.e]/.test(text) ? `${text}f` : `${text}.0f`;
}

// A `"` ends a C++ string and a `\` escapes the quote after it. The one-layer
// path (enforcePatternName, cppPrompt.ts) leaves both out the same way.
function literalText(text: string): string {
  return text.trim().replace(/["\\]/g, "");
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

const rampLut = (layer: RampLayer) => buildRampLUTRGBA(rampStateToHarness(layer.ramp));

/**
 * A ramp taken twice: what the preview shows for a value field on a layer with
 * recolor on. display.setValue colours v with ramp[v], and the recolor pass
 * that follows every draw() (lib/pattern/harness.ts, renderFrame) sends each
 * written pixel through the ramp again by the luminance of that colour. An
 * entry with no alpha stays as it is: the pass skips a pixel whose alpha is 0.
 * Worked out here in the preview's own doubles, so the header looks it up once.
 */
export function rampTwice(lut: Uint8Array): Uint8Array {
  const out = new Uint8Array(lut.length);
  for (let i = 0; i < 256; i++) {
    const j = i * 4;
    const from =
      lut[j + 3] === 0 ? j : Math.round(0.2126 * lut[j] + 0.7152 * lut[j + 1] + 0.0722 * lut[j + 2]) * 4;
    out.set(lut.subarray(from, from + 4), j);
  }
  return out;
}

function lutRows(lut: Uint8Array): string {
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

// The firmware keeps a pattern's name in MODULE_NAME_BYTES = 40
// (firmware/patternflow/pattern_registry.h): 39 characters and the NUL. A show
// finds its pattern by NAME, compared whole. Until November 2026 the scaffold
// cut NAME at 24, so a 30-character name went out six short of the show's cue
// for it and the show found nothing.
const NAME_CHARS = 39;

export const SLOT_BEGIN = (i: number) => `// >>> LAYER ${i} TRANSLATION BEGIN <<<`;
const SLOT_END = (i: number) => `// >>> LAYER ${i} TRANSLATION END <<<`;

// ── export bundle ──

type HExportLayerUnit = {
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

type HExport = {
  scaffold: string;
  units: HExportLayerUnit[];
  namespaceName: string;
  /** Bottom→top stack actually exported (visible layers). */
  stackNames: string[];
};

export function buildHExport(args: HExportArgs): HExport {
  const { name, matrix, knobs, ranges, knobLabels } = args;
  // Bottom → top, matching the compositor. A 0% layer leaves with the masks
  // resting on it: a mask over a 0% layer gates nothing.
  const stack = exportStack(args.layers);

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
        pixelArt: isRasterLayer(maskLayer),
        invert: maskLayer.maskInvert,
      });
    }
  }

  const codeLayers = stack
    .map((layer, index) => ({ layer, index }))
    .filter((entry): entry is { layer: CodeLayer; index: number } => entry.layer.type === "code");

  const knobNorm = knobs.map((value, i) =>
    Math.max(0, Math.min(1, normalizeKnob(value, ranges[i] ?? [0, 1]))),
  );

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

const char* NAME = "${literalText(name).slice(0, NAME_CHARS)}";
const char* const KNOB_LABELS[4] = {${knobLabels.map((label) => `"${literalText(label).slice(0, 14)}"`).join(", ")}};
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

  // Text layers that move: what each one moves, its phase, and for a ramp
  // its LUT. The steps are textEffects.ts, written in C++ below.
  const effects = new Map<number, { layer: TextLayer; effect: ActiveTextEffect; source: TextSource }>();
  stack.forEach((layer, index) => {
    if (layer.type !== "text") return;
    const effect = activeTextEffect(layer);
    const source = effect ? textEffectSource(layer, effect) : null;
    if (effect && source) effects.set(index, { layer, effect, source });
  });

  // Per-code-layer ramp LUTs + paint helpers; pixel layers as RLE.
  for (let index = 0; index < stack.length; index++) {
    const layer = stack[index];
    const moving = effects.get(index);
    if (moving) {
      const { layer: text, effect, source } = moving;
      const rle = rleEncode(source.data);
      parts.push(`
// ── L${index} "${text.name.replace(/\n/g, " ")}": text, ${effect} on knob ${text.spec.effectKnob + 1} — ${
        effect === "twinkle" ? "the letters" : `what it moves, ${source.width} columns from x = ${source.x}`
      }, RLE {count,r,g,b,a}, decoded once in setup ──
static const uint8_t L${index}_RLE[${rle.length}] = {
${byteRows(rle, 20, "  ")}
};
static uint8_t* L${index}_src = nullptr;
static float L${index}_phase = 0.0f;
constexpr int L${index}_SRC_X = ${source.x};
constexpr int L${index}_SRC_W = ${source.width};
constexpr int L${index}_PERIOD = ${textEffectPeriod(effect, text)};
constexpr int L${index}_LEAD = ${text.width - source.x};${
        effect === "ramp"
          ? `
static const uint8_t L${index}_RAMP[256][4] = {
${lutRows(rampLut(text))}
};`
          : ""
      }`);
      continue;
    }
    if (isRasterLayer(layer)) {
      const rle = rleEncode(layer.data);
      parts.push(`
// ── L${index} "${layer.name.replace(/\n/g, " ")}": ${layer.type === "text" ? "text as drawn" : "pixel art"}, RLE {count,r,g,b,a} — decoded once in setup ──
static const uint8_t L${index}_RLE[${rle.length}] = {
${byteRows(rle, 20, "  ")}
};`);
      continue;
    }
    // Recolor used to be a second walk over the layer's buffer after draw():
    // 32 KB of PSRAM read and written again every frame. It happens at the
    // write now. A colour takes one lookup by its luminance, and a value
    // takes one lookup in the ramp taken twice (rampTwice has why).
    const lut = rampLut(layer);
    parts.push(`
// ── L${index} "${layer.name.replace(/\n/g, " ")}": ramp LUT (RGBA, alpha included — baked by Pattern Lab, copy-proof) ──
static const uint8_t L${index}_RAMP[256][4] = {
${lutRows(lut)}
};${
      layer.recolor
        ? `
// Recolor is on, so the preview sends each pixel this layer writes through the
// ramp by its luminance. A value's ramp colour goes the same way, a second
// time: entry i here is L${index}_RAMP[luminance of L${index}_RAMP[i]], and
// entry i as it was where its alpha is 0.
static const uint8_t L${index}_RAMP_TWICE[256][4] = {
${lutRows(rampTwice(lut))}
};`
        : ""
    }
static inline void L${index}_setValue(int x, int y, float v) {
  if ((unsigned)x >= (unsigned)FRAME_W || (unsigned)y >= (unsigned)FRAME_H) return;
  if (!(v > 0.0f)) v = 0.0f; else if (v > 1.0f) v = 1.0f;
  const uint8_t* c = L${index}_RAMP${layer.recolor ? "_TWICE" : ""}[(int)(v * 255.0f + 0.5f)];
  uint8_t* p = layerBuf[${index}] + (((size_t)y * FRAME_W + x) << 2);
  p[0] = c[0]; p[1] = c[1]; p[2] = c[2]; p[3] = c[3];
}
static inline void L${index}_setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  if ((unsigned)x >= (unsigned)FRAME_W || (unsigned)y >= (unsigned)FRAME_H) return;
  uint8_t* p = layerBuf[${index}] + (((size_t)y * FRAME_W + x) << 2);
${
      layer.recolor
        ? `  int lum = (int)(0.2126f * r + 0.7152f * g + 0.0722f * b + 0.5f);
  if (lum > 255) lum = 255;
  const uint8_t* c = L${index}_RAMP[lum];
  p[0] = c[0]; p[1] = c[1]; p[2] = c[2]; p[3] = c[3];`
        : `  p[0] = r; p[1] = g; p[2] = b; p[3] = 255;`
    }
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
      effects.has(index)
        ? `  if (!L${index}_src) L${index}_src = (uint8_t*)PFMem::alloc((size_t)L${index}_SRC_W * FRAME_H * 4);
  if (!L${index}_src) return;
  rleDecode(L${index}_RLE, sizeof(L${index}_RLE), L${index}_src, (size_t)L${index}_SRC_W * FRAME_H * 4);`
        : isRasterLayer(layer)
          ? `  rleDecode(L${index}_RLE, sizeof(L${index}_RLE), layerBuf[${index}]);`
          : null,
    )
    .filter(Boolean)
    .join("\n");
  const effectUpdates = [...effects]
    .map(
      ([index, { layer, effect }]) =>
        `  advanceText(&L${index}_phase, dt, knobNorm[${layer.spec.effectKnob}], ${fmtFloat(TEXT_EFFECT_RATE[effect])}, (float)L${index}_PERIOD);`,
    )
    .join("\n");
  const effectDraws = [...effects]
    .map(([index, { effect }]) =>
      effect === "scroll"
        ? `  textScroll(layerBuf[${index}], L${index}_src, L${index}_SRC_W, L${index}_PERIOD, L${index}_LEAD, (int)L${index}_phase);`
        : effect === "twinkle"
          ? `  textTwinkle(layerBuf[${index}], L${index}_src, (int)L${index}_phase);`
          : `  textRamp(layerBuf[${index}], L${index}_src, L${index}_SRC_X, L${index}_SRC_W, L${index}_RAMP, (int)L${index}_phase);`,
    )
    .join("\n");
  const layerSetups = codeLayers.map(({ index }) => `  L${index}::setup();`).join("\n");
  const layerUpdates = codeLayers.map(({ index }) => `  L${index}::update(dt, input);`).join("\n");
  const layerDraws = codeLayers
    .map(({ index }) => `  memset(layerBuf[${index}], 0, (size_t)PIX_N * 4);\n  L${index}::draw();`)
    .join("\n");

  parts.push(`
// ── Deterministic pipeline (do not edit) ──
static void rleDecode(const uint8_t* rle, size_t len, uint8_t* out, size_t cap = (size_t)PIX_N * 4) {
  size_t o = 0;
  for (size_t i = 0; i + 4 < len && o < cap; i += 5) {
    for (int k = 0; k < rle[i] && o < cap; k++) {
      out[o++] = rle[i + 1]; out[o++] = rle[i + 2]; out[o++] = rle[i + 3]; out[o++] = rle[i + 4];
    }
  }
}

// i / 255 for each of the 256 bytes, worked out by the compiler. On the S3 a
// float divide by 255 is a call into __divsf3, and the compositor made one for
// every paint layer on every pixel, and three more in multiply and screen. It
// reads the quotient here now. These are the quotients the divide gave, so a
// pixel's alpha comes out to the bit as it did.
struct ByteOver255 {
  float v[256];
  constexpr ByteOver255() : v() { for (int i = 0; i < 256; i++) v[i] = i / 255.0f; }
};
static constexpr ByteOver255 OVER_255{};

// Binary mask test — identical to the Pattern Lab preview: pixel art is "on"
// where something was drawn (alpha >= 0.5); code layers where ramp-colored
// luminance x alpha crosses 0.5. The code layer's test has both sides times
// 255, alpha as its byte against 127.5 x 255, so it divides nothing.
static inline bool maskOn(const uint8_t* p, bool pixelArt, bool invert) {
  bool on;
  if (pixelArt) on = p[3] >= 128;
  else on = (0.2126f * p[0] + 0.7152f * p[1] + 0.0722f * p[2]) * p[3] >= 127.5f * 255.0f;
  return invert ? !on : on;
}

${effects.size > 0 ? TEXT_FX_CPP : ""}void setup() {
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
${effectUpdates ? `${effectUpdates}\n` : ""}${layerUpdates}
}

void draw() {${isPanelFrame ? "" : "\n  PFCanvas::setFrame(FRAME_W, FRAME_H);"}
  for (int i = 0; i < LAYER_N; i++)
    if (!layerBuf[i]) { PFCanvas::present(); return; }
${[...effects.keys()].map((index) => `  if (!L${index}_src) { PFCanvas::present(); return; }\n`).join("")}
${effectDraws ? `${effectDraws}\n` : ""}${layerDraws}

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
        const float a = OVER_255.v[p[3]] * G_OPACITY[gi];
        if (a <= 0.0f) continue;
        const float sr = p[0], sg = p[1], sb = p[2], inv = 1.0f - a;
        switch (G_BLEND[gi]) {
          case 1: cr += sr * a; cg += sg * a; cb += sb * a; break;
          case 2:
            cr = cr * inv + (cr * OVER_255.v[p[0]]) * a;
            cg = cg * inv + (cg * OVER_255.v[p[1]]) * a;
            cb = cb * inv + (cb * OVER_255.v[p[2]]) * a;
            break;
          case 3:
            cr = cr * inv + (255.0f - (255.0f - cr) * OVER_255.v[255 - p[0]]) * a;
            cg = cg * inv + (255.0f - (255.0f - cg) * OVER_255.v[255 - p[1]]) * a;
            cb = cb * inv + (255.0f - (255.0f - cb) * OVER_255.v[255 - p[2]]) * a;
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

// textEffects.ts in C++. Each pixel is integer work, and the phase only adds
// dt × speed and takes a remainder, as the preview's does; textExport.test.ts
// compiles this and compares the frames.
const TEXT_FX_CPP = `// ── Text effects: a moving text layer drawn again each frame from what it
// carries, at a phase one knob speeds up (0 stands it still) ──
static inline void advanceText(float* phase, float dt, float knob, float rate, float period) {
  const float n = knob > 0.0f ? (knob < 1.0f ? knob : 1.0f) : 0.0f;
  float p = *phase + dt * (n * rate);
  if (!(p >= 0.0f)) p = 0.0f;
  else if (p >= period) p = fmodf(p, period);
  *phase = p;
}

static inline int twinkleHash(int x, int y) {
  uint32_t h = (uint32_t)(x + 1) * 0x9e3779b1u ^ (uint32_t)(y + 1) * 0x85ebca77u;
  h ^= h >> 15;
  h *= 0x2c1b3c6du;
  h ^= h >> 12;
  return (int)(h & 255u);
}

static void textScroll(uint8_t* out, const uint8_t* src, int srcW, int period, int lead, int step) {
  int m = (step + lead) % period;
  if (m < 0) m += period;
  const int shift = m - FRAME_W;
  for (int y = 0; y < FRAME_H; y++) {
    for (int x = 0; x < FRAME_W; x++) {
      uint8_t* p = out + (((size_t)y * FRAME_W + x) << 2);
      const int c = x + shift;
      if (c < 0 || c >= srcW) { p[0] = p[1] = p[2] = p[3] = 0; continue; }
      const uint8_t* s = src + (((size_t)y * srcW + c) << 2);
      p[0] = s[0]; p[1] = s[1]; p[2] = s[2]; p[3] = s[3];
    }
  }
}

static void textTwinkle(uint8_t* out, const uint8_t* src, int step) {
  for (int y = 0; y < FRAME_H; y++) {
    for (int x = 0; x < FRAME_W; x++) {
      const size_t j = ((size_t)y * FRAME_W + x) << 2;
      const int a = src[j + 3];
      out[j] = src[j]; out[j + 1] = src[j + 1]; out[j + 2] = src[j + 2];
      if (a == 0) { out[j + 3] = 0; continue; }
      const int u = (step + twinkleHash(x, y)) & 255;
      const int tri = u < 128 ? u : 255 - u;
      out[j + 3] = (uint8_t)((a * (255 - tri - (tri >> 1)) + 127) / 255);
    }
  }
}

static void textRamp(uint8_t* out, const uint8_t* src, int srcX, int srcW, const uint8_t lut[256][4], int step) {
  for (int y = 0; y < FRAME_H; y++) {
    for (int x = 0; x < FRAME_W; x++) {
      uint8_t* p = out + (((size_t)y * FRAME_W + x) << 2);
      const int c = x - srcX;
      if (c < 0 || c >= srcW) { p[0] = p[1] = p[2] = p[3] = 0; continue; }
      const uint8_t* s = src + (((size_t)y * srcW + c) << 2);
      const int a = s[3];
      if (a == 0) { p[0] = p[1] = p[2] = p[3] = 0; continue; }
      const int u = (s[0] + step) & 511;
      const uint8_t* k = lut[u < 256 ? u : 511 - u];
      p[0] = k[0]; p[1] = k[1]; p[2] = k[2];
      p[3] = (uint8_t)((a * k[3] + 127) / 255);
    }
  }
}

`;

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

  // The scaffold's own includes, as a sentence: a layer writes none.
  const included = ["src/core_math.h", "src/core_color.h", "src/core_noise.h", "src/core_mem.h"];
  if (isPanelFrame) included.push("src/core_tables.h");
  const includedList = `${included.slice(0, -1).join(", ")} and ${included[included.length - 1]}`;

  const frameNote = isPanelFrame
    ? `The frame equals the panel (${matrix.width} × ${matrix.height}), so PFTables IS available and the first row of the table applies.`
    : `This composition's frame is ${matrix.width} × ${matrix.height}, which is NOT the panel's ${PATTERN_MATRIX_WIDTH} × ${PATTERN_MATRIX_HEIGHT}. ${NO_PANEL_TABLES} The scaffold owns PFCanvas::setFrame — never call it yourself.`;

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
  }${
    layer.recolor
      ? `\n  Recolor is on for this layer. The scaffold applies it inside these two calls, so pass the pattern's own values and write no luminance or ramp code.`
      : ""
  }
- Loop over FRAME_W × FRAME_H (scaffold constants). Coordinates are logical — never rotate, mirror, offset, or letterbox them, never call PFCanvas:: anything, never call present().
- Pixels you don't write stay transparent for the compositor — if the JS clears to black each frame implicitly by writing every pixel, keep writing every pixel; if it intentionally leaves pixels unwritten, leave them unwritten.
- KNOBS ARE ALREADY ACCUMULATED by the scaffold. Read them, never compute them:
    knobVal[i]    // absolute value — identical to input.knobValues[i] in the JS
    knobNorm[i]   // the same knob normalized 0..1 — identical to input.knobNormalized[i]
  Do NOT touch input.knobDeltas and do NOT constrain/accumulate knob state yourself.
${BUTTONS_RULE}
${WALL_TIME_RULE}
- input reaches a layer in update() and nowhere else, so read the buttons and the time there.
- JS params.* state becomes namespace statics. The JS draw(display, params, time) \`time\` argument does not exist here: keep your own time accumulator(s) in update() and wrap them (see Performance).

Shared knob reference (labels and current tuning):
${knobLines}

## Helpers
The scaffold already includes ${includedList}, so write no #include. ${HELPER_SIGNATURES_INTRO}

${helperSignatures({ params: false, tables: isPanelFrame })}

${macroCollisions(`prefix your constants with ${L}_ (e.g. ${L}_TWO_PI, ${L}_SPEED_STEP)`)}

${MEMORY_HEADING}
${MEMORY_STATICS}

- Any per-pixel buffer (trail map, glow accumulator — anything sized by FRAME_W * FRAME_H) must be a POINTER allocated once in setup() with PFMem::allocFloats(count) (PSRAM-first, zeroed):

    static float* trail = nullptr;
    void setup() { if (!trail) trail = PFMem::allocFloats(FRAME_W * FRAME_H); }

- Guard update() with \`if (!trail) return;\` and draw() with \`if (!trail) return;\` so a failed allocation degrades to a blank layer (the scaffold still presents).
${MEMORY_FIXED_STATE}${isPanelFrame ? `\n${MEMORY_TABLES_INIT}` : ""}

${DO_NOT_REIMPLEMENT}

${expensiveMath({ panelTables: isPanelFrame })}

${frameNote}

${performanceRules({ fullBrightness: false })}

${NAN_RULES}

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

/**
 * Stamp the lab's name back onto a pasted translation. Models retitle NAME
 * even when the prompt pins it ("HexagonalHivePulse" came back as
 * "HexHivePulse"), and NAME is the string shows and the device look the
 * pattern up by — so the paste path enforces it instead of trusting it.
 */
export function enforcePatternName(code: string, name: string): string {
  const clean = literalText(name);
  if (!clean) return code;
  return code.replace(
    /(const\s+char\s*\*\s*NAME\s*=\s*")[^"\n]*(")/,
    (_m, head: string, tail: string) => head + clean + tail,
  );
}

/** Strip a pasted LLM answer down to the code (drop \`\`\` fences / prose edges). */
export function cleanPastedUnit(pasted: string, index: number): string | null {
  let text = pasted.trim();
  const fence = text.match(/```(?:cpp|c\+\+|arduino)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!new RegExp(`namespace\\s+L${index}\\b`).test(text)) return null;
  return text;
}

/**
 * Cut a pasted one-layer answer down to the header. A chat answer copied whole
 * brings the model's words and the ``` fence along. The header starts at the
 * line #pragma once, or at the comment lines just above it (presets open with
 * their SPDX line), and ends where a fence closes. null when no line starts
 * with #pragma once.
 */
export function cleanPastedHeader(pasted: string): string | null {
  const lines = pasted.split("\n");
  const pragma = lines.findIndex((line) => /^\s*#pragma\s+once\b/.test(line));
  if (pragma < 0) return null;
  let start = pragma;
  while (start > 0 && /^\s*(\/\/|\/\*|\*|$)/.test(lines[start - 1])) start -= 1;
  const fence = lines.findIndex((line, i) => i > pragma && /^\s*```/.test(line));
  return lines
    .slice(start, fence < 0 ? lines.length : fence)
    .join("\n")
    .trim();
}

// The placeholder as a model writes it: a comment by itself on a line. Words
// after the token are let through, and so is the block-comment spelling.
const PLACEHOLDER_LINE = new RegExp(
  String.raw`^([ \t]*)(?:\/\/|\/\*)[ \t]*${RAMP_LUT_PLACEHOLDER.replace(/^\/\/\s*/, "")}\b[^\r\n]*`,
  "m",
);
// A table the answer wrote for itself, whatever is in it:
// static const uint8_t RAMP_LUT[256][3] = { ... };
const OWN_TABLE =
  /^([ \t]*)(?:(?:static|const|constexpr|inline)\s+)*(?:uint8_t|unsigned\s+char|byte)\s+(?:PROGMEM\s+)?RAMP_LUT\s*\[\s*256\s*\]\s*\[\s*3\s*\]\s*(?:PROGMEM\s*)?=\s*\{[\s\S]*?\}\s*;/gm;
// The name declared in any other shape, a flat [768] for one.
const OTHER_TABLE =
  /\b(?:uint8_t|unsigned\s+char|byte|u?int(?:16|32)?_t|int|float|char)\s+(?:PROGMEM\s+)?RAMP_LUT\s*\[/;
const NAMESPACE_OPEN = /^[ \t]*namespace\s+[A-Za-z_]\w*\s*\{[^\r\n]*/m;

/**
 * Put the ramp table into a pasted one-layer header. The conversion prompt
 * asks for one placeholder line where the table goes (cppPrompt.ts), and the
 * table written here is the one the prompt used to paste: bakedRampLut, every
 * byte. Three answers come back:
 *
 *   the placeholder is there    the table takes its place
 *   the answer wrote a table    RAMP_LUT[256][3] = { ... } is replaced whole,
 *                               cut short or not: the model never saw the bytes
 *   neither, and it reads one   the table goes in where the namespace opens
 *
 * A pattern that reads no ramp comes back as it was pasted. So does a header
 * that never names RAMP_LUT: a table nothing indexes is 768 bytes of nothing.
 * And so does one that declares RAMP_LUT in a shape this does not know. A
 * second definition would stop the build, and the code indexing the first
 * would still be wrong.
 */
export function injectRampLut(
  header: string,
  pattern: { code: string; ramp: RampState; recolor?: boolean; forceRgb?: boolean },
): string {
  if (!rampUse(pattern)) return header;
  const eol = header.includes("\r\n") ? "\r\n" : "\n";
  const table = (indent: string) =>
    bakedRampLut(pattern.ramp)
      .split("\n")
      .map((line) => indent + line)
      .join(eol);

  // With the placeholder there, a table the answer wrote as well would be a
  // second definition, so those go first.
  const cleared = header.replace(OWN_TABLE, "");
  const mark = PLACEHOLDER_LINE.exec(cleared);
  if (mark) {
    return cleared.slice(0, mark.index) + table(mark[1]) + cleared.slice(mark.index + mark[0].length);
  }
  if (cleared !== header) {
    // The answer's first table is where this one goes. A second would not
    // have compiled, so it goes too.
    let placed = false;
    return header.replace(OWN_TABLE, (_m, indent: string) => {
      if (placed) return "";
      placed = true;
      return table(indent);
    });
  }
  if (!/\bRAMP_LUT\b/.test(header) || OTHER_TABLE.test(header)) return header;
  const opened = NAMESPACE_OPEN.exec(header);
  if (!opened) return header;
  const at = opened.index + opened[0].length;
  return header.slice(0, at) + eol + table("") + header.slice(at);
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
