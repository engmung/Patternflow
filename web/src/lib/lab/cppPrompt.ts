// ── C++ conversion prompt (moved out of the lab client) ──────────────────────
// Builds the "convert this JS pattern to an ESP32 firmware header" prompt.
// Layered compositions are flattened BEFORE reaching here, so this stays a
// single-pattern concern. Verbatim behavior from the pre-layer lab.

import {
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  buildRampLUTRGBA,
} from "@/lib/pattern/harness";
import { knobDetentStep } from "@/lib/pattern/controls";
import { withMatrixAnnotation, type MatrixSize } from "@/lib/pattern/matrix";
import { codeUsesValueField } from "@/lib/pattern/ramp";
import type { KnobRange, RampState } from "./types";
import { rampStateToHarness } from "./engine";

function roundRangeValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

export type CppPromptArgs = {
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
   * Ignored for value-field patterns (the ramp already IS their color).
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
    - Do NOT use PFTables::rT / PFTables::thetaT. Those tables are indexed by the PANEL grid and measured from the panel's centre, so they are wrong for this frame. Compute radius with sqrtf and angle with PFMath::fastAtan2 from the FRAME centre (FRAME_W * 0.5f, FRAME_H * 0.5f) instead, and do not call PFTables::init().
    - Size any per-pixel buffer by FRAME_W * FRAME_H.
`;

  const rangeLines = ranges
    .map((range, index) => {
      const detentStep = knobDetentStep(range);
      return `- ${knobLabels[index]}: min ${range[0]}, max ${range[1]}, current ${knobs[index]}, calibrated encoder step ${roundRangeValue(detentStep)} per detent`;
    })
    .join("\n");

  // Value-field patterns carry no color of their own. The ramp LUT is
  // precomputed HERE (same buildRampLUT as the live preview) and emitted as
  // a finished C array — models must not write sorting/interpolation code,
  // which is exactly where weaker models broke (unsorted stops → all-black
  // LUT, hallucinated tokens in hand-rolled lerp loops). The shared detector
  // ignores comments/strings, so an RGB pattern whose comments quote the
  // setValue API keeps its own colors instead of being forced onto the ramp.
  const usesValueField = !forceRgb && codeUsesValueField(code);
  const recolors = !forceRgb && !usesValueField && recolor === true;

  // Both ramp modes bake the SAME table: buildRampLUTRGBA with each entry's
  // alpha premultiplied into its RGB — the web shows the ramp composited
  // over the opaque black panel, so this table is exactly what the preview
  // renders, per-stop alpha included.
  const bakedLutRows = (): string[] => {
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
    return rows;
  };
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

  let rampSection = "";
  if (usesValueField) {
    rampSection = `
## Color ramp (value-field pattern) — PRE-BAKED, copy verbatim
This pattern writes a scalar field via display.setValue(x, y, v) with v in 0..1 and has NO color logic of its own. The user's color ramp has already been baked into the 256-entry RGB lookup table below (it encodes the stops, per-stop alpha, interpolation mode, and wrap exactly as the web preview renders them over the black panel).

Embed this table in the namespace EXACTLY as given:

static const uint8_t RAMP_LUT[256][3] = {
${bakedLutRows().join("\n")}
};

Rules:
- Copy the table verbatim — do NOT recompute, resample, reorder, shorten, or "optimize" it, and do NOT write any stop/interpolation/sorting code. The table IS the ramp.
- In draw(): clamp v to 0..1, then
    int li = (int)(v * 255.0f + 0.5f);
    PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
- Do NOT use PFColor:: functions for this pattern's colors; the LUT replaces all color work.
- (Reference only, for the header comment: stops ${stopSummary()}; mode ${ramp.mode}; wrap ${ramp.wrap ? "on" : "off"}.)
`;
  } else if (recolors) {
    rampSection = `
## Recolor (RGB pattern through the ramp) — PRE-BAKED, copy verbatim
This pattern computes its own RGB colors, and the user has RECOLOR enabled in Pattern Lab: the live preview replaces every drawn pixel's color with ramp[luminance of that color]. Your C++ must do the same or the hardware will not match the preview.

Embed this table in the namespace EXACTLY as given:

static const uint8_t RAMP_LUT[256][3] = {
${bakedLutRows().join("\n")}
};

Rules:
- Copy the table verbatim — do NOT recompute, resample, reorder, shorten, or "optimize" it, and do NOT write any stop/interpolation/sorting code. The table IS the ramp (per-stop alpha already baked in).
- Keep ALL of the pattern's own color logic exactly as the JS computes it — the r, g, b it produces drive the lookup. Convert at the write, every time:
    int lum = (int)(0.2126f * r + 0.7152f * g + 0.0722f * b + 0.5f);
    PFCanvas::setPixel(x, y, RAMP_LUT[lum][0], RAMP_LUT[lum][1], RAMP_LUT[lum][2]);
- EVERY pixel write goes through the table; never write the raw r, g, b. A pixel the pattern deliberately draws black becomes RAMP_LUT[0] — that is correct and matches the preview. Pixels the pattern never draws stay unlit; do NOT sweep the whole frame through the LUT.
- (Reference only, for the header comment: stops ${stopSummary()}; mode ${ramp.mode}; wrap ${ramp.wrap ? "on" : "off"}.)
`;
  }

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

    #include "src/core_math.h"   // PFMath:: fastSin, fastCos, fastAtan2, fastPow, fract, jsMod, lerp, approxLength, sin LUT
    #include "src/core_color.h"  // PFColor:: hsvToRgb, buildPowLUT/buildPowLUTf, ColorStop, sampleRamp
    #include "src/core_noise.h"  // PFNoise:: cellHash, valueNoise2D, perlin2D, fractal2D
    #include "src/core_tables.h" // PFTables:: init(), rT[], thetaT[] — per-pixel radius/angle from the panel center, precomputed
    #include "src/core_mem.h"    // PFMem:: allocFloats — PSRAM-first, zeroed allocation for framebuffer-sized buffers

Helper signatures — these are the FULL argument lists. Call them exactly like this; do not add size arguments, reorder parameters, or invent overloads:

    PFParams::apply(input, i, &floatParam, minF, maxF, stepF);            // absolute-bus/audio/delta priority, clamped
    PFParams::applyUnit(input, i, &floatParam, stepF);                    // 0..1 wrapping (hue/phase)
    PFParams::applyInt(input, i, &intParam, minI, maxI, stepI, wrap);     // wrap defaults to false
    PFParams::applyIndex(input, i, &intParam, count, stepI);              // discrete 0..count-1, stepI defaults to 1
    PFMath::buildSinLUT();                               // in setup(); idempotent
    float s  = PFMath::fastSin(angleRadians);
    float c  = PFMath::fastCos(angleRadians);
    float a  = PFMath::fastAtan2(dy, dx);                // returns (-π, π], like atan2f(y, x)
    float w  = PFMath::fastPow(base, exponent);          // base > 0 (returns 0 for base <= 0, even with a negative exponent); ~0.1% error
    PFTables::init();                                    // in setup(); idempotent
    float r  = PFTables::rT[y * PANEL_RES_W + x];        // fixed-center radius, screen-height units
    float th = PFTables::thetaT[y * PANEL_RES_W + x];    // fixed-center angle, -π..π
    float h  = PFNoise::cellHash(gx, gy);                // int cell coords → 0..1; optional 3rd int seed
    float n  = PFNoise::valueNoise2D(x, y);              // floats → 0..1
    float p  = PFNoise::perlin2D(x, y);                  // floats → ≈ -1..1
    float f  = PFNoise::fractal2D(x, y, octaves, roughness);
    PFColor::hsvToRgb(h01, s01, v01, r8, g8, b8);        // h/s/v floats 0..1; r8/g8/b8 are uint8_t& outputs
    static uint8_t plut[256];  PFColor::buildPowLUT(exponent, plut);   // fills (i/255)^exp scaled to 0..255
    static float  plutf[256];  PFColor::buildPowLUTf(exponent, plutf); // fills (i/255)^exp as 0..1 floats
    static float* buf = nullptr;  buf = PFMem::allocFloats(count);     // in setup(); PSRAM-first, returns zeroed memory (or nullptr)

Other interface rules:
${frameSection}- Never hardcode pixel dimensions as literals. Use the frame constants named above.
- All pixel writes go through PFCanvas::setPixel(x, y, r, g, b). Never call dma_display->drawPixelRGB888 directly.
- The last line of draw() must be PFCanvas::present();. Without it nothing reaches the panel.
- Macro collisions: Arduino.h and config.h define macros that will preprocessor-mangle same-named declarations into compile errors. Do NOT define your own variables, constants, or functions named PI, TWO_PI, HALF_PI, DEG_TO_RAD, RAD_TO_DEG, EULER, min, max, abs, sq, round, radians, degrees, constrain, MAX_HUE, MAX_SPEED, SPEED_STEP, MAX_FREQ, or FREQ_STEP. Use the existing PI / TWO_PI constants directly, use fminf/fmaxf/fabsf for your own helpers, and prefix pattern constants with the pattern name (e.g. CELLS_TWO_PI, CELLS_SPEED_STEP).

## Memory rules — lookup tables are cheap, framebuffer-scale buffers are not
A pattern is a loadable module: its statics are allocated when the pattern loads and freed when it unloads, so they cost nothing while another pattern is running. They come out of internal RAM, which is shared with the Wi-Fi stack and the HUB75 DMA driver — but there is real room now. Measured on a 128×64 board with the pattern resident: **86 KB free with no table, 63 KB left after a 16 KB table, 47 KB after 32 KB, and frame rate identical in every case (62 fps).** A lookup table costs memory and does not cost speed.

So **prefer a table over per-pixel math**. Precompute anything that depends only on x, y, or a constant — radial falloffs, palettes, easing curves, per-column phases, powf with a fixed exponent — in setup(), and index it in draw().

- Any per-pixel buffer (trail map, glow/density accumulator, feedback field — anything sized by PANEL_RES_W * PANEL_RES_H or similar) must be a POINTER allocated once in setup() with PFMem::allocFloats (include src/core_mem.h). PFMem allocates from PSRAM when available and returns zeroed memory:

    static float* trail = nullptr;
    void setup() { if (!trail) trail = PFMem::allocFloats(PANEL_RES_W * PANEL_RES_H); }

- Guard update() with \`if (!trail) return;\` and start draw() with \`if (!trail) { PFCanvas::present(); return; }\` so a failed allocation degrades to a blank pattern instead of crashing.
- Fixed-size state — particle arrays, knob params, and lookup tables of any shape — stays as plain statics. **Up to about 32 KB total across all of a pattern's statics is comfortable** (a 4,096-entry float table is 16 KB); that leaves ~47 KB free, well clear of the ~10 KB the web console needs to stay responsive. Past ~48 KB the console starts to feel it, so treat that as the ceiling rather than a target.
- Call PFTables::init() ONLY if the code actually reads PFTables::rT or PFTables::thetaT. Never call it "just in case" — it allocates two 32 KB tables.

## DO NOT reimplement existing helpers
The firmware ships tested, optimized versions of these. Using your own breaks shared optimizations (color calibration, sin LUT sharing) and wastes ROM. If the JavaScript source contains an inline hsvToRgb or sin LUT, strip it and call the firmware helper instead.

- DO NOT write your own HSV → RGB converter. Not as a separate function, not inline with a switch statement, not as a chain of fmodf + conditionals. Call PFColor::hsvToRgb(h, s, v, r, g, b). h is normalized 0..1, not degrees.
- DO NOT translate JavaScript's % operator on floats as fmodf(a, b). Call PFMath::jsMod(a, b): the same sign rule as JS %, and no library call — fmodf inside a module is a call into the host's libm on every pixel, and a hue wrap like (h + 0.33) % 1 runs once per pixel.
- DO NOT write your own sin LUT or fast-sin approximation. Call PFMath::buildSinLUT() once in setup(); use PFMath::fastSin / fastCos in draw().
- DO NOT write your own Perlin or fractal noise. Use PFNoise::perlin2D / fractal2D.
- DO NOT write your own atan/atan2 approximation or angle LUT. Use PFMath::fastAtan2 or the precomputed PFTables::thetaT (see the decision table).
- DO NOT translate sin-based hash formulas literally. If the JS contains fract(sin(x * 127.1 + y * 311.7) * 43758.5453) or similar, replace it with PFNoise::cellHash(gx, gy) (add a seed argument to decorrelate multiple uses). NEVER build a hash from PFMath::fastSin — the sin LUT's tiny error is amplified ~44,000× by the big multiplier and destroys the hash with visible banding.

## Expensive math — pick the tool by situation
The board trades memory for per-pixel math, and memory is the plentiful side of that trade (see the measurements in Memory rules). Choose per this table; it overrides any literal translation of the JS. When a situation is not listed and the value depends only on x, y, or a constant, **bake a table in setup() rather than computing it per pixel** — that is the house style, not a last resort:

| Situation in the pattern | Use this |
|---|---|
| Radius and/or angle from the FIXED panel center (rings, spirals, vortex, kaleidoscope) | PFTables::init() once in setup(); then PFTables::rT[i] / PFTables::thetaT[i] in draw() with i = y * PANEL_RES_W + x. Zero per-pixel cost — never call sqrtf or atan2f for a fixed center. rT is in screen-height units (0 center, 0.5 top/bottom edge); thetaT is -π..π. |
| Angle from a MOVING center | PFMath::fastAtan2(dy, dx) (~0.01° max error). Never call atan2f inside the pixel loop. |
| Distance from a MOVING center | sqrtf(dx*dx + dy*dy) — the S3 FPU makes sqrtf cheap; two per pixel cost under 1 ms per frame. |
| Random value per grid cell (voronoi seeds, cell colors/phases) | PFNoise::cellHash(gx, gy) or cellHash(gx, gy, seed). |
| Smooth organic field | PFNoise::valueNoise2D (cheapest) or perlin2D / fractal2D (richer). |
| powf(v, CONSTANT) | v*v for squares; otherwise bake a LUT in setup() with PFColor::buildPowLUT (byte out) / buildPowLUTf (float out) and index it in draw(). |
| cosh/sinh/tanh (soliton sech² profiles, gaussian-ish falloffs, erf) inside the pixel loop | Bake a LUT in setup() over the argument range and index it — measured on hardware, replacing two coshf per pixel with a 4 KB sech² table took the same pattern from 18 to 33 fps. Calling coshf/erff directly is fine outside the loop (needs firmware ≥ 3.5.2; older loaders refuse the module with "unresolved symbol"). |
| powf(v, e) where e VARIES per pixel or per frame | PFMath::fastPow(v, e) — never call libm powf inside the pixel loop. fastPow returns 0 for v <= 0; if the JS relied on Math.pow(0, negative) → Infinity → clamp-to-max, branch on v <= 0 explicitly and output that clamped value. |
| sin/cos inside the pixel loop | PFMath::fastSin / fastCos (call buildSinLUT() in setup()). Full-precision sinf/cosf only for one-shot computations outside the loop — and for hash inputs, use cellHash instead entirely. |

approxLength caveat: PFMath::approxLength is an octagonal approximation (~5% error — the isodistance contour is a visible octagon). With PFTables::rT and cheap sqrtf available it is almost never the right choice; only use it for non-visual weighting terms where the contour can never be seen. When in doubt, use PFTables::rT (fixed center) or sqrtf (moving center).

Last resort — half-resolution rendering: if the pattern is genuinely smooth/low-frequency and still too slow after the table above, compute the value on a 64×32 grid inside draw() and write each result to a 2×2 pixel block. Only for soft gradients; never for patterns with single-pixel details.

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
- Encoder buttons map 1:1: JS input.btnPressed[i] / input.btnHeld[i] become C++ input.btnPressed[i] / input.btnHeld[i] (same bool[4] semantics — edge vs level). If the JS pattern resets, freezes, or triggers on a button, keep that — but guard resets so they cannot fight an absolute hold: if (input.btnPressed[i] && !input.paramAbsoluteActive[i] && !input.knobAudioActive[i]) { ... }. Never consume long-press; that gesture is reserved for the firmware mode switcher.

Pattern Lab knob ranges and current values:
${rangeLines}
${rampSection}
## Performance
- Hoist anything that depends only on time, row, or parameters out of the inner pixel loop.
- Wrap every time accumulator at its period — the device runs for days, and an unbounded t += dt * speed loses float precision until sin-driven motion visibly stutters (hours at high speed). If t only ever feeds fastSin/fastCos through INTEGER multipliers (t, t*2.0f, t*3.0f...), wrap with if (t > TWO_PI) t -= TWO_PI;. For non-integer multipliers, wrap at a common period instead (e.g. multipliers 0.1 and 1.2 → period 20π wraps both seamlessly). A drift that is fract()ed anyway (hue cycling) should be its own accumulator wrapped with PFMath::fract. Never leave a time accumulator unbounded.
- Prefer multiplication and comparison over expensive functions and branches.
- Route every expensive call through the "Expensive math" decision table above — the fast path exists for each common case; a literal translation of the JS math is almost always the slow answer.
- Keep some pixels near full RGB output so LED brightness stays strong.
- Preserve local color logic from the JS — value-based bands, distance-driven hue, threshold steps, etc. The visual character lives in those rules.

## Self-check before output
Before finalizing your code block, verify each of these. If any answer is wrong, fix it.

1. Does the pattern use radius or angle from the FIXED panel center while calling sqrtf/atan2f per pixel? If yes, switch to PFTables::rT / PFTables::thetaT. Is atan2f called anywhere inside the pixel loop? If yes, switch to PFMath::fastAtan2. If I used approxLength, is its octagonal contour truly invisible? If not certain, use rT/sqrtf.
2. Did I write my own hsvToRgb, sin LUT, atan2 approximation, noise function, or a sin-based hash — or build a hash from PFMath::fastSin? If yes, replace with the PFColor / PFMath / PFNoise helpers.
3. Does draw() end with PFCanvas::present();?
4. Are all pixel writes via PFCanvas::setPixel? Did I avoid touching dma_display?
5. Does every knob go through a PFParams:: helper (no hand-written "param += input.knobDeltas[i] * step" accumulation, no reading input.knobValues), is ABSOLUTE_READY declared, and is every button reset guarded with !input.paramAbsoluteActive[i]?
6. Does every time accumulator wrap at its period (TWO_PI or a common multiple — see Performance)? An unbounded accumulator is a bug even if the preview looks fine.
7. Is every line valid C++ that will compile — no stray tokens, no placeholder text, no truncated statements? Re-read the block once before finalizing.
8. Is every per-pixel buffer (anything sized by PANEL_RES_W * PANEL_RES_H) a PFMem::allocFloats pointer rather than a static array, with the null guards in place? Fixed-size lookup tables are fine as statics — check they total under ~32 KB. Did I call PFTables::init() without reading rT/thetaT anywhere? If yes, remove the call.
8b. Is there per-pixel math whose result depends only on x, y, or a constant? If yes, move it into a table built in setup() — memory is cheap here and the pixel loop is not.${
    usesValueField
      ? "\n9. Did I paste the RAMP_LUT table verbatim (all 256 entries, unchanged), and does draw() get every color exclusively from RAMP_LUT with no other color code?"
      : recolors
        ? "\n9. Did I paste the RAMP_LUT table verbatim (all 256 entries, unchanged), does EVERY PFCanvas::setPixel take its color from RAMP_LUT[lum] with lum computed from the pattern's own r/g/b, and did I keep the pattern's color logic intact ahead of the lookup?"
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
