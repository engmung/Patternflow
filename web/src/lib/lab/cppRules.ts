// ── What both C++ conversion prompts tell a model about the ESP32-S3 ─────────
// Pattern Lab asks a model for C++ in two places. buildCppPrompt (cppPrompt.ts)
// asks for one whole header from one code layer. buildLayerPrompt (hExport.ts)
// asks for one layer of a stack, to go into the scaffold. Each carried its own
// helper list, its own DO NOT list and its own table of expensive math, and by
// November 2026 the two disagreed: the layer prompt called sqrtf "cheap on the
// S3 FPU", and the other said, from the disassembly, that it is a call into
// libm. The text they share is written here, once.
//
// What only one of them can say stays in its builder. A single file owns the
// canvas and its knobs: it draws with PFCanvas::setPixel and ends on
// present(), and each knob goes through PFParams. A layer owns neither: it
// writes L<i>_setPixel or L<i>_setValue and reads knobVal and knobNorm. The
// first line of each prompt stays in its builder too. The guide's practice AI
// tells the two apart by it (components/guide/desk/ai/answers.ts).
//
// Most of the sentences below came from cppPrompt.ts as they were. Written for
// this file: the three offers just below, the two float rules that close the
// Performance section, the NaN section, and the rule about clearing the canvas.

// ── Helpers new in firmware/patternflow/src/core_math.h ──
// Three of them, each named in its own string here and nowhere else in this
// file. Empty a string and the prompts stop offering that helper: the table
// row it sits in reads as it did before.
const OFFER_FAST_SQRT =
  "PFMath::fastSqrt(dx*dx + dy*dy) where about 5e-6 relative error is fine: no libm call and no divide, half the time of sqrtf in a module (172 ns against 340, measured on the board), and 0 for an argument that is <= 0 or NaN. Where the root has to be exact, ";
const OFFER_FAST_INV_SQRT = `| Normalising a vector (dx, dy) to length 1 | const float inv = PFMath::fastInvSqrt(dx*dx + dy*dy); then dx * inv and dy * inv. That replaces a sqrtf and a divide, the two calls dx / sqrtf(dx*dx + dy*dy) makes: 151 ns against 555 in a module, measured on the board. It returns 0 for an argument that is <= 0 or NaN, so a zero-length vector comes out as (0, 0). |
`;
const OFFER_FAST_SIN_COS =
  " When one angle needs both, PFMath::fastSinCos(angle, s, c) fills float& s and c from one table index.";

// ── Helper signatures ──

/** Opens the signature list in both prompts. */
export const HELPER_SIGNATURES_INTRO =
  "Helper signatures — these are the FULL argument lists. Call them exactly like this; do not add size arguments, reorder parameters, or invent overloads:";

const PARAM_SIGNATURES = `    PFParams::apply(input, i, &floatParam, minF, maxF, stepF);            // absolute-bus/audio/delta priority, clamped
    PFParams::applyUnit(input, i, &floatParam, stepF);                    // 0..1 wrapping (hue/phase)
    PFParams::applyInt(input, i, &intParam, minI, maxI, stepI, wrap);     // wrap defaults to false
    PFParams::applyIndex(input, i, &intParam, count, stepI);              // discrete 0..count-1, stepI defaults to 1`;

const MATH_SIGNATURES = `    PFMath::buildSinLUT();                               // in setup(); idempotent
    float s  = PFMath::fastSin(angleRadians);
    float c  = PFMath::fastCos(angleRadians);
    float a  = PFMath::fastAtan2(dy, dx);                // returns (-π, π], like atan2f(y, x)
    float w  = PFMath::fastPow(base, exponent);          // base > 0 (returns 0 for base <= 0, even with a negative exponent); about 0.006% error`;

const TABLE_SIGNATURES = `    PFTables::init();                                    // in setup(); idempotent
    float r  = PFTables::rT[y * PANEL_RES_W + x];        // fixed-center radius, screen-height units
    float th = PFTables::thetaT[y * PANEL_RES_W + x];    // fixed-center angle, -π..π`;

const NOISE_COLOR_MEM_SIGNATURES = `    float h  = PFNoise::cellHash(gx, gy);                // int cell coords → 0..1; optional 3rd int seed
    float n  = PFNoise::valueNoise2D(x, y);              // floats → 0..1
    float p  = PFNoise::perlin2D(x, y);                  // floats → about -1.51..1.51, NOT -1..1
    float f  = PFNoise::fractal2D(x, y, octaves, roughness);
    PFColor::hsvToRgb(h01, s01, v01, r8, g8, b8);        // h/s/v floats 0..1; r8/g8/b8 are uint8_t& outputs
    static uint8_t plut[256];  PFColor::buildPowLUT(exponent, plut);   // fills (i/255)^exp scaled to 0..255
    static float  plutf[256];  PFColor::buildPowLUTf(exponent, plutf); // fills (i/255)^exp as 0..1 floats
    static float* buf = nullptr;  buf = PFMem::allocFloats(count);     // in setup(); PSRAM-first, returns zeroed memory (or nullptr)`;

/**
 * The helpers' call forms, one a line. `params` adds the PFParams calls a
 * single file makes for its knobs; a layer reads knobVal and knobNorm and has
 * none. `tables` adds PFTables, which a layer has only on a frame the size of
 * the panel.
 */
export function helperSignatures({ params, tables }: { params: boolean; tables: boolean }): string {
  return [
    ...(params ? [PARAM_SIGNATURES] : []),
    MATH_SIGNATURES,
    ...(tables ? [TABLE_SIGNATURES] : []),
    NOISE_COLOR_MEM_SIGNATURES,
  ].join("\n");
}

// ── Interface rules that depend on who is asking ──

/**
 * Arduino's macros. `prefix` is how this prompt's constants get out of their
 * way: the pattern's name in a single file, the layer's in a stack.
 */
export function macroCollisions(prefix: string): string {
  return `- Macro collisions: Arduino.h and config.h define macros that will preprocessor-mangle same-named declarations into compile errors. Do NOT define your own variables, constants, or functions named PI, TWO_PI, HALF_PI, DEG_TO_RAD, RAD_TO_DEG, EULER, min, max, abs, sq, round, radians, degrees, constrain, MAX_HUE, MAX_SPEED, SPEED_STEP, MAX_FREQ, or FREQ_STEP. Use the existing PI / TWO_PI constants directly, use fminf/fmaxf/fabsf for your own helpers, and ${prefix}.`;
}

/** A frame that is not the panel's has no PFTables. The single file says it under FRAME, a layer under Expensive math. */
export const NO_PANEL_TABLES =
  "Do NOT use PFTables::rT / PFTables::thetaT. Those tables are indexed by the PANEL grid and measured from the panel's centre, so they are wrong for this frame. Compute radius with sqrtf and angle with PFMath::fastAtan2 from the FRAME centre (FRAME_W * 0.5f, FRAME_H * 0.5f) instead, and do not call PFTables::init().";

/**
 * The single file only: the scaffold clears each layer's buffer before the
 * layer draws. The lab's runtime starts every draw() from black
 * (lib/pattern/harness.ts, renderFrame). The firmware's canvas keeps the last
 * frame: PFCanvas::present() ends in resetFrame(), which puts back the frame
 * mapping and nothing else (firmware/patternflow/src/core_canvas.h). setFrame()
 * does clear, for any frame that is not the panel's.
 */
export function canvasClearRule(isPanelFrame: boolean): string {
  return isPanelFrame
    ? "- The JS preview starts every draw() from a black frame. The firmware canvas does not: PFCanvas::present() leaves the pixels where they are, so whatever draw() does not write this frame still shows the last one. If the JS leaves any pixel unwritten in a frame (particles, lines, dots over black), make PFCanvas::clear(); the first line of draw(). A pattern that writes every pixel every frame does not need it."
    : "- The JS preview starts every draw() from a black frame. On this frame size PFCanvas::setFrame does the same, so add no PFCanvas::clear() of your own.";
}

// ── Memory ──

export const MEMORY_HEADING = "## Memory rules — lookup tables are cheap, framebuffer-scale buffers are not";

/**
 * Where a module's statics go, as firmware/patternflow/src/core_module_memory.h
 * places them since 2026-10: PSRAM for every data section, internal RAM only
 * if PSRAM refuses. The free-heap figures this paragraph carried were measured
 * while tables still came out of internal RAM, and nothing has been measured
 * since to put in their place.
 */
export const MEMORY_STATICS = `A pattern is a loadable module: its statics are allocated when the pattern loads and freed when it unloads. They are placed in PSRAM first and take internal RAM only when PSRAM refuses, so a lookup table no longer comes out of the RAM the Wi-Fi stack and the HUB75 DMA driver share.

So **prefer a table over per-pixel math**. Precompute anything that depends only on x, y, or a constant — radial falloffs, palettes, easing curves, per-column phases, powf with a fixed exponent — in setup(), and index it in draw().`;

export const MEMORY_FIXED_STATE =
  "- Fixed-size state — particle arrays, knob params, and lookup tables of any shape — stays as plain statics. **Up to about 32 KB total across all of a pattern's statics is comfortable** (a 4,096-entry float table is 16 KB).";

export const MEMORY_TABLES_INIT =
  '- Call PFTables::init() ONLY if the code actually reads PFTables::rT or PFTables::thetaT. Never call it "just in case" — it allocates two 32 KB tables.';

// ── DO NOT reimplement ──

export const DO_NOT_REIMPLEMENT = `## DO NOT reimplement existing helpers
The firmware ships tested, optimized versions of these. Using your own breaks shared optimizations (color calibration, sin LUT sharing) and wastes ROM. If the JavaScript source contains an inline hsvToRgb or sin LUT, strip it and call the firmware helper instead.

- DO NOT write your own HSV → RGB converter. Not as a separate function, not inline with a switch statement, not as a chain of fmodf + conditionals. Call PFColor::hsvToRgb(h, s, v, r, g, b). h is normalized 0..1, not degrees.
- DO NOT translate JavaScript's % operator on floats as fmodf(a, b). Call PFMath::jsMod(a, b): the same sign rule as JS %, written as one division and one truncation — a hue wrap like (h + 0.33) % 1 runs once per pixel.
- DO NOT call floorf(). It is not an instruction on this target - it is a call into a ~50-instruction libm routine in code compiled into the firmware, and exact inline code two to three times the size of the PFMath forms in a module. Use PFMath::ifloor(x) for the integer, PFMath::floorF(x) for the float, or PFMath::fract(x) for the fractional part; all three truncate and correct, which is five instructions and no call. Measured: removing one floorf from a per-pixel path also made the object code SMALLER, because the call sequence costs more than the inline does.
- DO NOT call fminf() / fmaxf() to clamp. Each carries the library's NaN and signed-zero rules - a register-window call in the firmware image, up to three compares inline in a module - for a comparison the FPU does in one instruction. Write PFMath::clamp(x, lo, hi) or PFMath::clamp01(x), or a plain ternary - all compile to a compare and a branch.
- Ramps come in two kinds and the names are load-bearing. PFColor::sampleRamp holds the last stop at or below t, giving flat bands with hard edges and no division. PFColor::sampleRampLerp interpolates between the bracketing stops, which is a gradient and costs one soft-float divide per sample. Pick by what the JavaScript actually draws: a posterised palette is not a gradient someone forgot to smooth.
- DO NOT write your own sin LUT or fast-sin approximation. Call PFMath::buildSinLUT() once in setup(); use PFMath::fastSin / fastCos in draw().
- DO NOT write your own Perlin or fractal noise. Use PFNoise::perlin2D / fractal2D.
- DO NOT write your own atan/atan2 approximation or angle LUT. Use PFMath::fastAtan2 or the precomputed PFTables::thetaT (see the decision table).
- DO NOT translate sin-based hash formulas literally. If the JS contains fract(sin(x * 127.1 + y * 311.7) * 43758.5453) or similar, replace it with PFNoise::cellHash(gx, gy) (add a seed argument to decorrelate multiple uses). NEVER build a hash from PFMath::fastSin — the sin LUT's tiny error is amplified ~44,000× by the big multiplier and destroys the hash with visible banding.`;

// ── Expensive math ──

const FIXED_CENTER_ROW = `| Radius and/or angle from the FIXED panel center (rings, spirals, vortex, kaleidoscope) | PFTables::init() once in setup(); then PFTables::rT[i] / PFTables::thetaT[i] in draw() with i = y * PANEL_RES_W + x. Zero per-pixel cost — never call sqrtf or atan2f for a fixed center. rT is in screen-height units (0 center, 0.5 top/bottom edge); thetaT is -π..π. |
`;

/**
 * The decision table and what follows it. `panelTables` keeps the row that
 * reads PFTables: a layer on a frame that is not the panel's goes without.
 */
export function expensiveMath({ panelTables }: { panelTables: boolean }): string {
  return `## Expensive math — pick the tool by situation
The board trades memory for per-pixel math, and memory is the plentiful side of that trade (see Memory rules). Choose per this table; it overrides any literal translation of the JS. When a situation is not listed and the value depends only on x, y, or a constant, **bake a table in setup() rather than computing it per pixel** — that is the house style, not a last resort:

| Situation in the pattern | Use this |
|---|---|
${panelTables ? FIXED_CENTER_ROW : ""}| Angle from a MOVING center | PFMath::fastAtan2(dy, dx) (~0.01° max error). Never call atan2f inside the pixel loop. |
| Distance from a MOVING center | ${OFFER_FAST_SQRT}sqrtf(dx*dx + dy*dy). Note that sqrtf is a CALL into libm on this target, not an FPU instruction — verified by disassembling the shipping compiler — so it is not free, and a per-pixel one is worth avoiding where the geometry allows. Compare squared distances instead of taking a root wherever the comparison is all you need. |
${OFFER_FAST_INV_SQRT}| Random value per grid cell (voronoi seeds, cell colors/phases) | PFNoise::cellHash(gx, gy) or cellHash(gx, gy, seed). |
| Smooth organic field | PFNoise::valueNoise2D (cheapest) or perlin2D / fractal2D (richer). |
| powf(v, CONSTANT) | v*v for squares; otherwise bake a LUT in setup() with PFColor::buildPowLUT (byte out) / buildPowLUTf (float out) and index it in draw(). |
| cosh/sinh/tanh (soliton sech² profiles, gaussian-ish falloffs, erf) inside the pixel loop | Bake a LUT in setup() over the argument range and index it — measured on hardware, replacing two coshf per pixel with a 4 KB sech² table took the same pattern from 18 to 33 fps. Calling coshf/erff directly is fine outside the loop (needs firmware ≥ 3.5.2; older loaders refuse the module with "unresolved symbol"). |
| powf(v, e) where e VARIES per pixel or per frame | PFMath::fastPow(v, e) — never call libm powf inside the pixel loop. fastPow returns 0 for v <= 0; if the JS relied on Math.pow(0, negative) → Infinity → clamp-to-max, branch on v <= 0 explicitly and output that clamped value. |
| sin/cos inside the pixel loop | PFMath::fastSin / fastCos (call buildSinLUT() in setup()).${OFFER_FAST_SIN_COS} Full-precision sinf/cosf only for one-shot computations outside the loop — and for hash inputs, use cellHash instead entirely. |

approxLength caveat: PFMath::approxLength is an octagonal approximation — 6.8% maximum relative error, measured and pinned by firmware/toolchain/check_math.py, and the isodistance contour is a visible octagon. With PFTables::rT available it is almost never the right choice; only use it for non-visual weighting terms where the contour can never be seen. When in doubt, use PFTables::rT (fixed center) or the moving-center row of the table.

Last resort — half-resolution rendering: if the pattern is genuinely smooth/low-frequency and still too slow after the table above, compute the value on a 64×32 grid inside draw() and write each result to a 2×2 pixel block. Only for soft gradients; never for patterns with single-pixel details.`;
}

// ── Buttons and the clock ──

export const BUTTONS_RULE =
  "- Encoder buttons map 1:1: JS input.btnPressed[i] / input.btnHeld[i] become C++ input.btnPressed[i] / input.btnHeld[i] (same bool[4] semantics — edge vs level). If the JS pattern resets, freezes, or triggers on a button, keep that — but guard resets so they cannot fight an absolute hold: if (input.btnPressed[i] && !input.paramAbsoluteActive[i] && !input.knobAudioActive[i]) { ... }. Never consume long-press; that gesture is reserved for the firmware mode switcher.";

export const WALL_TIME_RULE =
  "- Wall time maps 1:1: JS input.timeValid / input.hour / input.minute / input.second become C++ input.timeValid / input.hour / input.minute / input.second (bool, then uint8_t). Keep the JS fallback for timeValid == false — the board only knows the time once NTP has synced.";

// ── Performance ──

// What each line stands on, read off the S3 compiler's own output
// (xtensa-esp32s3-elf-g++ 8.4.0, -O2): x * 0.1 is __extendsfdf2, __muldf3 and
// __truncdfsf2, and sin(x * 2.0) calls the double sin; x / 255.0f calls
// __divsf3, while x * (1.0f / 255.0f) and x / 256.0f call nothing. No build
// of a pattern passes -fsingle-precision-constant, so the literal is the only
// place this is decided. (77 community and preset headers built as modules in
// November 2026 had not one double among them: the rule is being followed.)
const FLOAT_RULES = `- Every float literal carries an f and every libm call uses its f name: x * 0.1f and sinf(a), not x * 0.1 and sin(a). The S3's FPU is single precision. A bare 0.1 makes the expression double, and x * 0.1 is then three library calls where x * 0.1f is one instruction.
- No float division by a loop-invariant divisor inside the pixel loop. On the S3 a float divide is a call into __divsf3 unless the divisor is a constant power of two. Hoist the reciprocal above the loop, const float inv = 1.0f / d;, and multiply by it. For a constant, write x * (1.0f / 255.0f) and not x / 255.0f: the compiler folds the first into one multiply and leaves the second as the call.`;

/**
 * The Performance section. `fullBrightness` adds the single file's line about
 * LED brightness: a layer's pixels go through the compositor, and a value
 * field's colours are the ramp's.
 */
export function performanceRules({ fullBrightness }: { fullBrightness: boolean }): string {
  return `## Performance
- Hoist anything that depends only on time, row, or parameters out of the inner pixel loop.
- Wrap every time accumulator at its period — the device runs for days, and an unbounded t += dt * speed loses float precision until sin-driven motion visibly stutters (hours at high speed). If t only ever feeds fastSin/fastCos through INTEGER multipliers (t, t*2.0f, t*3.0f...), wrap with if (t > TWO_PI) t -= TWO_PI;. For non-integer multipliers, wrap at a common period instead (e.g. multipliers 0.1 and 1.2 → period 20π wraps both seamlessly). A drift that is fract()ed anyway (hue cycling) should be its own accumulator wrapped with PFMath::fract. Never leave a time accumulator unbounded.
- Prefer multiplication and comparison over expensive functions and branches.
- Route every expensive call through the "Expensive math" decision table above — the fast path exists for each common case; a literal translation of the JS math is almost always the slow answer.
${fullBrightness ? "- Keep some pixels near full RGB output so LED brightness stays strong.\n" : ""}- Preserve local color logic from the JS — value-based bands, distance-driven hue, threshold steps, etc. The visual character lives in those rules.
${FLOAT_RULES}`;
}

// ── NaN and infinity ──

/**
 * What a float32 that went wrong does to the device. PFMath::clamp and clamp01
 * send NaN to their lower bound (core_math.h). The loop that never ends is in
 * the header of firmware/patternflow/src/core_loop_sync.h: draw() runs on the
 * loop task, which is on no watchdog, and nothing there restarts a panel whose
 * loop has stopped arriving. A NaN does not hang that loop, since the
 * comparison is false. Infinity does, and so does a value past about 1.3e8,
 * where a float32 no longer changes when 2π is taken off it.
 */
export const NAN_RULES = `## NaN and infinity
float32 reaches NaN and infinity where the browser's doubles did not.
- A lookup-table index has to survive NaN and overshoot. Clamp the value before it becomes an index: PFMath::clamp01(v) and PFMath::clamp(x, lo, hi) send NaN to their lower bound. (int)(v * 255.0f) on a NaN or a runaway v reads outside the table.
- Wrap an angle with PFMath::jsMod(a, TWO_PI) or one if, never with a loop. while (a > PI) a -= TWO_PI; never ends once a is infinite, or too large for the subtraction to change it. draw() runs on the loop task, which is on no watchdog, so a draw() that does not return freezes the panel until someone restarts it.`;
