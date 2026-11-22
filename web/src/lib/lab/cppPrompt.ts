// ── C++ conversion prompt (moved out of the lab client) ──────────────────────
// Builds the "convert this JS pattern to an ESP32 firmware header" prompt.
// Layered compositions are flattened BEFORE reaching here, so this stays a
// single-pattern concern. Verbatim behavior from the pre-layer lab.
//
// What this prompt and a stack's per-layer prompt (hExport.ts) both say about
// the S3 is in cppRules.ts. What only a whole header needs is here: its
// includes, PFCanvas, present(), the knobs through PFParams, and the ramp.

import {
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  buildRampLUTRGBA,
} from "@/lib/pattern/harness";
import { knobDetentStep, roundRangeValue } from "@/lib/pattern/controls";
import { withMatrixAnnotation, type MatrixSize } from "@/lib/pattern/matrix";
import { codeUsesValueField } from "@/lib/pattern/ramp";
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
  canvasClearRule,
  expensiveMath,
  helperSignatures,
  macroCollisions,
  performanceRules,
} from "./cppRules";
import type { KnobRange, RampState } from "./types";
import { rampStateToHarness } from "./engine";

type CppPromptArgs = {
  code: string;
  matrix: MatrixSize;
  knobs: number[];
  ranges: KnobRange[];
  knobLabels: string[];
  ramp: RampState;
  /**
   * The piece's name, verbatim. Shows look the pattern up by NAME (and by
   * the .pfm slug derived from it), so the prompt pins NAME to this string
   * instead of inviting the model to invent a "short name".
   */
  name?: string;
  /**
   * The layer's Recolor toggle: the preview replaces every drawn pixel's
   * color with ramp[luminance], so the C++ must do the same at each write.
   * This prompt ignores it for a value-field pattern. The preview does not:
   * its recolor pass runs after every draw() (lib/pattern/harness.ts,
   * renderFrame), so a value's ramp colour goes through the ramp again. A
   * stack's scaffold follows the preview there (hExport.ts, rampTwice).
   */
  recolor?: boolean;
  /**
   * Flattened layer stacks contain display.setValue INSIDE embedded layers,
   * but their top-level contract is plain setPixel with every LUT already
   * baked in as arrays — so the value-field/ramp/recolor prompt sections
   * must not fire.
   */
  forceRgb?: boolean;
};

/**
 * How a single pattern's header uses the ramp table, or null when it has
 * none. "value": the code draws with display.setValue, and the ramp is its
 * colour. "recolor": the code draws RGB and the layer's Recolor toggle sends
 * each write through the ramp by luminance. The shared detector ignores
 * comments/strings, so an RGB pattern whose comments quote the setValue API
 * keeps its own colors instead of being forced onto the ramp.
 */
export function rampUse({
  code,
  recolor,
  forceRgb,
}: Pick<CppPromptArgs, "code" | "recolor" | "forceRgb">): "value" | "recolor" | null {
  if (forceRgb) return null;
  if (codeUsesValueField(code)) return "value";
  return recolor === true ? "recolor" : null;
}

/**
 * The line a ramp pattern's header carries where its table goes. The prompt
 * asks the model for this line and no table; injectRampLut (hExport.ts) puts
 * the table there when the answer is pasted into To hardware.
 */
export const RAMP_LUT_PLACEHOLDER = "// PF_RAMP_LUT";

/**
 * The ramp as the 256 × 3 table a single pattern's header indexes. Both ramp
 * modes bake the SAME table: buildRampLUTRGBA with each entry's alpha
 * premultiplied into its RGB — the web shows the ramp composited over the
 * opaque black panel, so this table is exactly what the preview renders,
 * per-stop alpha included.
 *
 * Until November 2026 the prompt pasted these 256 entries and asked the model
 * to copy them back: 3,394 characters each way for the Lab's opening ramp,
 * and the place models cut an answer short. Weaker models also broke when
 * asked to build the table themselves (unsorted stops → all-black LUT,
 * hallucinated tokens in hand-rolled lerp loops). So no model sees it or
 * writes it now.
 */
export function bakedRampLut(ramp: RampState): string {
  const lut = buildRampLUTRGBA(rampStateToHarness(ramp));
  const rows: string[] = [];
  for (let i = 0; i < 256; i += 8) {
    const entries: string[] = [];
    for (let j = i; j < i + 8; j++) {
      const alpha = lut[j * 4 + 3] / 255;
      entries.push(
        `{${Math.round(lut[j * 4] * alpha)},${Math.round(lut[j * 4 + 1] * alpha)},${Math.round(
          lut[j * 4 + 2] * alpha,
        )}}`,
      );
    }
    rows.push(`  ${entries.join(",")},`);
  }
  return `static const uint8_t RAMP_LUT[256][3] = {\n${rows.join("\n")}\n};`;
}

export function buildCppPrompt({
  code,
  matrix,
  knobs,
  ranges,
  knobLabels,
  ramp,
  recolor,
  forceRgb,
  name,
}: CppPromptArgs) {
  // C-string safe; the device UI truncates long names itself.
  const pinnedName = (name ?? "").trim().replace(/["\\]/g, "");
  // ── Frame ──
  // A pattern composed for the panel's own grid compiles exactly as it
  // always did: loop PANEL_RES_W/H, write PFCanvas::setPixel, done. Any
  // other grid declares itself to the canvas, which owns the single
  // logical→physical mapping (see firmware/patternflow/src/core_canvas.h).
  const isPanelFrame =
    matrix.width === PATTERN_MATRIX_WIDTH && matrix.height === PATTERN_MATRIX_HEIGHT;
  const frameSection = isPanelFrame
    ? `- Use PANEL_RES_W and PANEL_RES_H for the pixel loops.
`
    : `- FRAME: this pattern is composed for a ${matrix.width} × ${matrix.height} grid, which is NOT the panel's ${PATTERN_MATRIX_WIDTH} × ${PATTERN_MATRIX_HEIGHT}. Handle it exactly like this and in no other way:
    - Declare the grid in the namespace: \`constexpr int FRAME_W = ${matrix.width}; constexpr int FRAME_H = ${matrix.height};\`
    - Make \`PFCanvas::setFrame(FRAME_W, FRAME_H);\` the FIRST line of draw().
    - Loop over FRAME_W / FRAME_H — not PANEL_RES_W / PANEL_RES_H — and pass those same logical x, y straight to PFCanvas::setPixel.
    - Do NOT rotate, swap, mirror, offset, or otherwise transform the coordinates yourself, and do not mention the panel's dimensions anywhere in the drawing math. PFCanvas::setFrame installs the mapping and setPixel applies it; doing it a second time turns the pattern the wrong way.
    - ${NO_PANEL_TABLES}
    - Size any per-pixel buffer by FRAME_W * FRAME_H.
`;

  const rangeLines = ranges
    .map((range, index) => {
      const detentStep = knobDetentStep(range);
      return `- ${knobLabels[index]}: min ${range[0]}, max ${range[1]}, current ${knobs[index]}, calibrated encoder step ${roundRangeValue(detentStep)} per detent`;
    })
    .join("\n");

  // Value-field patterns carry no color of their own, and a recolored RGB
  // pattern takes its colour from the same table. The table is baked HERE
  // (bakedRampLut, the live preview's own buildRampLUTRGBA) and goes into the
  // pasted header. The prompt asks for the placeholder line only.
  const use = rampUse({ code, recolor, forceRgb });
  const usesValueField = use === "value";
  const recolors = use === "recolor";

  const stopSummary = () =>
    [...ramp.stops]
      .sort((a, b) => a.position - b.position)
      .map(
        (stop) =>
          `${stop.position.toFixed(3)}:${stop.color}${
            stop.alpha !== 1 ? `@${stop.alpha.toFixed(2)}` : ""
          }`,
      )
      .join(", ");

  // What both ramp sections say about the table: where it goes, and that the
  // model writes none of it.
  const placeholderRules = `Mark where the table goes with this one line, by itself, inside the namespace and right after ABSOLUTE_READY:

    ${RAMP_LUT_PLACEHOLDER}

Pattern Lab replaces that line with the table when the header is pasted back into To hardware: static const uint8_t RAMP_LUT[256][3], one {r, g, b} per entry.

Rules:
- Write the placeholder line once and write NO table yourself: no RAMP_LUT definition and no entries. Write no stop, interpolation or sorting code either. Read RAMP_LUT as if it were declared on that line.`;

  let rampSection = "";
  if (usesValueField) {
    rampSection = `
## Color ramp (value-field pattern) — PRE-BAKED, Pattern Lab writes the table
This pattern writes a scalar field via display.setValue(x, y, v) with v in 0..1 and has NO color logic of its own. The user's color ramp has already been baked into a 256-entry RGB lookup table (it encodes the stops, per-stop alpha, interpolation mode, and wrap exactly as the web preview renders them over the black panel). You never see that table and never write it.

${placeholderRules}
- In draw(), clamp before indexing. PFMath::clamp01 sends NaN to 0, so li stays inside the table whatever v is:
    int li = (int)(PFMath::clamp01(v) * 255.0f + 0.5f);
    PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
- Do NOT use PFColor:: functions for this pattern's colors; the LUT replaces all color work.
- (Reference only, for the header comment: stops ${stopSummary()}; mode ${ramp.mode}; wrap ${ramp.wrap ? "on" : "off"}.)
`;
  } else if (recolors) {
    rampSection = `
## Recolor (RGB pattern through the ramp) — PRE-BAKED, Pattern Lab writes the table
This pattern computes its own RGB colors, and the user has RECOLOR enabled in Pattern Lab: the live preview replaces every drawn pixel's color with ramp[luminance of that color]. Your C++ must do the same or the hardware will not match the preview. The ramp has already been baked into a 256-entry RGB lookup table (per-stop alpha already baked in). You never see that table and never write it.

${placeholderRules}
- Keep ALL of the pattern's own color logic exactly as the JS computes it — the r, g, b it produces drive the lookup. Convert at the write, every time, and clamp before indexing. PFMath::clamp sends NaN to its lower bound, so lum stays inside the table:
    int lum = (int)(PFMath::clamp(0.2126f * r + 0.7152f * g + 0.0722f * b, 0.0f, 255.0f) + 0.5f);
    PFCanvas::setPixel(x, y, RAMP_LUT[lum][0], RAMP_LUT[lum][1], RAMP_LUT[lum][2]);
- EVERY pixel write goes through the table; never write the raw r, g, b. A pixel the pattern deliberately draws black becomes RAMP_LUT[0] — that is correct and matches the preview. Pixels the pattern never draws stay unlit; do NOT sweep the whole frame through the LUT.
- (Reference only, for the header comment: stops ${stopSummary()}; mode ${ramp.mode}; wrap ${ramp.wrap ? "on" : "off"}.)
`;
  }

  // Item 7 forbids placeholder text. A ramp pattern has one line of it.
  const placeholderException = use ? ` (the one ${RAMP_LUT_PLACEHOLDER} line is the exception)` : "";

  return `Convert the JavaScript LED pattern below into a single complete Arduino-compatible C++ header for the Patternflow ESP32-S3 firmware.
${
  usesValueField
    ? `
NOTE: the JS pattern draws with display.setValue(x, y, v) — a 0..1 value field colored by a lookup ramp (see "Color ramp" section below). There is no setPixel in the source; your C++ maps v through the baked ramp LUT and writes the resulting RGB with PFCanvas::setPixel.
`
    : recolors
      ? `
NOTE: the JS pattern computes its own RGB via display.setPixel, and Pattern Lab's RECOLOR toggle is ON — the preview maps every drawn color through a ramp by luminance. Translate the pattern's color logic as written, then route each pixel write through the baked RAMP_LUT (see the "Recolor" section below).
`
      : ""
}

## Output format
- One single code block labeled cpp. No prose before or after the block.
- The block must start with #pragma once and end with } // namespace YourPatternName.
- No nested triple backticks inside the block.

## Required interface
Define one unique namespace. Inside it expose exactly these symbols:

    const char* NAME = "${pinnedName || "Short Name"}";
    const char* const KNOB_LABELS[4] = {"...", "...", "...", "..."};${
      pinnedName
        ? `

NAME must be EXACTLY the string above, character for character — do not
shorten, retitle or re-case it. Shows and the device look the pattern up
by this string.`
        : ""
    }
    constexpr bool ABSOLUTE_READY = true;
    void setup();
    void update(float dt, const InputFrame& input);
    void draw();

Always-required includes:

    #include <Arduino.h>
    #include "config.h"
    #include "src/core_display.h"
    #include "src/core_encoders.h"
    #include "src/core_canvas.h"
    #include "src/core_params.h"

Conditional includes — only when actually used in your code:

    #include "src/core_math.h"   // PFMath:: fastSin, fastCos, fastAtan2, fastPow, fract, ifloor, floorF, clamp, clamp01, jsMod, lerp, approxLength, sin LUT
    #include "src/core_color.h"  // PFColor:: hsvToRgb, buildPowLUT/buildPowLUTf, ColorStop, sampleRamp (posterised bands), sampleRampLerp (gradient)
    #include "src/core_noise.h"  // PFNoise:: cellHash, valueNoise2D, perlin2D, fractal2D
    #include "src/core_tables.h" // PFTables:: init(), rT[], thetaT[] — per-pixel radius/angle from the panel center, precomputed
    #include "src/core_mem.h"    // PFMem:: allocFloats — PSRAM-first, zeroed allocation for framebuffer-sized buffers

${HELPER_SIGNATURES_INTRO}

${helperSignatures({ params: true, tables: true })}

Other interface rules:
${frameSection}- Never hardcode pixel dimensions as literals. Use the frame constants named above.
- All pixel writes go through PFCanvas::setPixel(x, y, r, g, b). Never call dma_display->drawPixelRGB888 directly.
- The last line of draw() must be PFCanvas::present();. Without it nothing reaches the panel.
${canvasClearRule(isPanelFrame)}
${macroCollisions("prefix pattern constants with the pattern name (e.g. CELLS_TWO_PI, CELLS_SPEED_STEP)")}

${MEMORY_HEADING}
${MEMORY_STATICS}

- Any per-pixel buffer (trail map, glow/density accumulator, feedback field — anything sized by PANEL_RES_W * PANEL_RES_H or similar) must be a POINTER allocated once in setup() with PFMem::allocFloats (include src/core_mem.h). PFMem allocates from PSRAM when available and returns zeroed memory:

    static float* trail = nullptr;
    void setup() { if (!trail) trail = PFMem::allocFloats(PANEL_RES_W * PANEL_RES_H); }

- Guard update() with \`if (!trail) return;\` and start draw() with \`if (!trail) { PFCanvas::present(); return; }\` so a failed allocation degrades to a blank pattern instead of crashing.
${MEMORY_FIXED_STATE}
${MEMORY_TABLES_INIT}

${DO_NOT_REIMPLEMENT}

${expensiveMath({ panelTables: true })}

## Knob conversion
- The JS preview uses input.knobValues as absolute values (after the Pattern Lab min/max ranges are applied).
- The firmware receives input.knobDeltas — plus an absolute override bus. Never integrate deltas by hand; the PFParams helpers (src/core_params.h) do delta accumulation, clamping, AND the absolute-bus override in one call.
- For each knob, store the parameter as state initialized to its current Pattern Lab value below.
- In update(), one helper call per knob — pick by the parameter's shape:
    PFParams::apply(input, i, &param, MIN, MAX, STEP[i]);        // float with a min/max range (the common case)
    PFParams::applyUnit(input, i, &param, STEP[i]);              // float 0..1 that WRAPS (hue, phase)
    PFParams::applyInt(input, i, &param, MIN, MAX, STEP, wrap);  // int range; wrap=true cycles (e.g. hue 0..359)
    PFParams::applyIndex(input, i, &param, COUNT, STEP);         // discrete index 0..COUNT-1 (mode pickers)
- Use the calibrated encoder step below as STEP so physical encoders match the live editor and one detent feels the same on both.
- Declare constexpr bool ABSOLUTE_READY = true; right after KNOB_LABELS — it marks the pattern as driveable by the absolute bus (timed shows / Director).
- If the JS reads input.knobNormalized[i] (e.g. generated layer-stack patterns), keep the raw knob state exactly as above and compute the normalized value from it each frame: (raw - min) / (max - min). Do NOT store the normalized value as the knob state itself.
- Preserve knob meanings from the JS code (any comments naming the knobs) in KNOB_LABELS. Knobs the comments mark as unused get the label "-" and no update logic.
${BUTTONS_RULE}
${WALL_TIME_RULE}

Pattern Lab knob ranges and current values:
${rangeLines}
${rampSection}
${performanceRules({ fullBrightness: true })}

${NAN_RULES}

## Self-check before output
Before finalizing your code block, verify each of these. If any answer is wrong, fix it.

1. Does the pattern use radius or angle from the FIXED panel center while calling sqrtf/atan2f per pixel? If yes, switch to PFTables::rT / PFTables::thetaT. Is atan2f called anywhere inside the pixel loop? If yes, switch to PFMath::fastAtan2. If I used approxLength, is its octagonal contour truly invisible? If not certain, use rT or the moving-center row of the table.
2. Did I write my own hsvToRgb, sin LUT, atan2 approximation, noise function, or a sin-based hash — or build a hash from PFMath::fastSin? If yes, replace with the PFColor / PFMath / PFNoise helpers.
3. Does draw() end with PFCanvas::present();?
4. Are all pixel writes via PFCanvas::setPixel? Did I avoid touching dma_display?
5. Does every knob go through a PFParams:: helper (no hand-written "param += input.knobDeltas[i] * step" accumulation, no reading input.knobValues), is ABSOLUTE_READY declared, and is every button reset guarded with !input.paramAbsoluteActive[i]?
6. Does every time accumulator wrap at its period (TWO_PI or a common multiple — see Performance)? An unbounded accumulator is a bug even if the preview looks fine.
7. Is every line valid C++ that will compile — no stray tokens, no placeholder text${placeholderException}, no truncated statements? Re-read the block once before finalizing.
8. Is every per-pixel buffer (anything sized by PANEL_RES_W * PANEL_RES_H) a PFMem::allocFloats pointer rather than a static array, with the null guards in place? Fixed-size lookup tables are fine as statics — check they total under ~32 KB. Did I call PFTables::init() without reading rT/thetaT anywhere? If yes, remove the call.
8b. Is there per-pixel math whose result depends only on x, y, or a constant? If yes, move it into a table built in setup() — memory is cheap here and the pixel loop is not.${
    usesValueField
      ? `\n9. Is the ${RAMP_LUT_PLACEHOLDER} line in the namespace once, with no RAMP_LUT table of my own anywhere, and does draw() get every color exclusively from RAMP_LUT with no other color code?`
      : recolors
        ? `\n9. Is the ${RAMP_LUT_PLACEHOLDER} line in the namespace once, with no RAMP_LUT table of my own anywhere, does EVERY PFCanvas::setPixel take its color from RAMP_LUT[lum] with lum computed from the pattern's own r/g/b, and did I keep the pattern's color logic intact ahead of the lookup?`
        : ""
  }${
    isPanelFrame
      ? ""
      : `\n${usesValueField || recolors ? "10" : "9"}. Is PFCanvas::setFrame(FRAME_W, FRAME_H) the first line of draw(), do all loops run over FRAME_W/FRAME_H, and did I avoid transforming the coordinates myself or touching PFTables?`
  }

## JavaScript source
\`\`\`javascript
${withMatrixAnnotation(code, matrix)}
\`\`\``;
}
