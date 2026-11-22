// The prompt Pattern Lab's Copy prompt puts on the clipboard (CodePanel.tsx):
// the focused code layer as a seed, the frame, the knobs as they stand and
// the API rules, for whatever AI chat the user pastes it into. Two places copy
// its wording. The guide's practice AI tells it apart by lines it always
// writes (components/guide/desk/ai/answers.ts, checked by answers.test.ts),
// and the community atlas mirrors it (lib/atlas/data.ts). Change them with it.
// variantPrompt.test.ts fails while the atlas's copy of the tech guide differs
// from this one by a character.
//
// The landing page's Copy creation prompt is this prompt in RGB mode with a
// knob block of its own (components/sections/variantPrompt.ts). It is built
// here, by buildVariantPrompt, so the two give the same API rules.

import { buildMatrixAnnotationLine, describeMatrixShape, type MatrixSize } from "@/lib/pattern/matrix";
import type { ColorMode } from "./settings";

const KNOB_LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];

function controlLines(knobs: number[], ranges: Array<[number, number]>) {
  return ranges
    .map(
      (range, index) =>
        `- ${KNOB_LABELS[index]} range: ${range[0]} to ${range[1]}, current value: ${knobs[index]}`,
    )
    .join("\n");
}

// ── Frame ───────────────────────────────────────────────────────────────────
// One honest statement of the pixel grid, derived from the numbers alone. This
// is the ONLY place the model is told about shape — no compensating axis
// flips, no second "orientation" knob to disagree with it.
function frameLine(matrix: MatrixSize) {
  const { width, height } = matrix;
  const shape = describeMatrixShape(matrix);
  const shapeNote =
    shape === "landscape"
      ? `It is WIDER than it is tall (${(width / height).toFixed(2)}:1). Compose for a wide frame.`
      : shape === "portrait"
        ? `It is TALLER than it is wide (1:${(height / width).toFixed(2)}). Compose for a tall frame — a design meant for a wide frame will read as cramped and over-zoomed here.`
        : "It is SQUARE. Compose for a square frame.";
  return `Frame — the pattern is drawn into a ${width} × ${height} pixel grid: ${width} wide (x = 0..${width - 1}) and ${height} tall (y = 0..${height - 1}). ${shapeNote} Lay the composition, bands, and motion out for these proportions.`;
}

function variantIntro(matrix: MatrixSize) {
  return `I am writing custom LED patterns in JavaScript for a Patternflow ${matrix.width}x${matrix.height} LED matrix web preview.

${frameLine(matrix)}

I will give you one existing Patternflow pattern. Use it as a seed, not as a cage. Create exactly 5 distinct standalone variations that explore different visual directions.`;
}

// Technical + quality spec (API rules, controls, color).
// Split into pieces so the pixel-write rule and the color section can swap
// depending on ColorMode. The buttons, the wall time and the @matrix line are
// pieces of their own because a prompt copied beside a preview that has none
// of them leaves them out (PreviewRule).
const TECH_API_KNOBS = `Required API for every pattern:
- export function setup(params) {}
- export function update(dt, input, params) {}
- export function draw(display, params, time) {}
- Use input.knobValues as the primary control API. input.knobValues is an array of 4 absolute knob values after the min/max ranges are applied.
- Declare the ranges your 4 knobs want with ONE comment line near the top of the file, exactly this format:
  // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1
  (exactly 4 comma-separated entries, Name=min..max, short names). Pattern Lab parses this line, renames the on-screen knobs, and sets their min/max automatically — the user can then retune any range and your pattern follows, because you read the values back through input.knobValues.
- Read input.knobValues[i] directly as the parameter value (matching your @knobs ranges). Do NOT read input.knobNormalized and remap it with baked constants such as 3 + kn[0] * 9 — that disconnects Pattern Lab's range editor (the user's min/max edits stop doing anything). input.knobNormalized is acceptable only for a truly unitless 0..1 blend where any range would mean the same thing.
- Keep input.knobDeltas only as compatibility fallback if needed.`;

const TECH_API_BUTTONS = `- Optional: each knob also has a push button. input.btnPressed[i] is true only on the frame it is pressed (edge); input.btnHeld[i] is true while it is held down. Use these for momentary actions like reset, freeze, cycle, or trigger. Do not use long-press or mode-switching; that is a reserved system gesture.`;

// The four fields the firmware's input frame ends with (abi/pf_abi.h). The
// wording follows firmware/CUSTOM_PATTERNS.md, "The time". A module that reads
// timeValid is stamped ABI 3 and v3.12.0 refuses to install it, so the line
// keeps the time to patterns that are about it.
const TECH_API_WALL_TIME = `- Optional, only for a pattern that is about the time: input.hour (0 to 23), input.minute and input.second hold the local time when input.timeValid is true, so read timeValid first. Only a board with the clock feature gives true, once it has synced. Every other board gives false and 0 in the other three, so the pattern needs something to show without the time. The four are on input only, so copy what draw() needs onto params in update().`;

const TECH_API_DRAW = `- IMPORTANT: input is passed ONLY to update(dt, input, params). draw's signature is draw(display, params, time) with NO input argument — params.input does not exist. To read knob or button values inside draw, use params.knobValues / params.knobNormalized / params.knobDeltas / params.btnPressed / params.btnHeld (the harness mirrors the latest input onto params every frame), or stash whatever you need on params during update. Never read input.* or params.input.* inside draw.`;

// The conversion prompt's rule ("Wrap every time accumulator", in what
// buildCppPrompt under lib/lab writes), asked of the JavaScript first so the
// C++ has a period to keep.
const TECH_API_ACCUMULATOR = `- Wrap every time accumulator the pattern keeps (params.t += dt * speed) at its period. The device runs for days on 32-bit floats, where an unbounded t loses precision until the motion stutters, and JavaScript's doubles hide that in the preview. A t that only reaches Math.sin or Math.cos through integer multipliers wraps at 2π: if (params.t > 2 * Math.PI) params.t -= 2 * Math.PI. A motion at any other rate gets an accumulator of its own, so the wrap never shows as a jump.`;

// The two lines after the loop rule are lib/lab/capture/anySizePrompt.ts in
// short. That prompt exists to rewrite a pattern written in pixel units, and
// a pattern written in frame units from the start never needs it.
const TECH_API_FRAME = `- Use display.width and display.height in loops. Never hardcode the frame's pixel dimensions inside draw() — the same pattern is run at other resolutions, and a hardcoded size crops or zooms it.
- Take positions from normalized coordinates, not pixel indices. const u = x / display.width runs 0 to 1 across the frame. For round shapes use a centered pair that keeps the aspect: nx = (x - display.width / 2) / s and ny = (y - display.height / 2) / s, with s = Math.min(display.width, display.height).
- Give frequencies and sizes in those frame units. Pattern Lab's Graphic Export runs the same code at up to 4096 pixels a side, where Math.sin(x * 0.1) is about 65 waves across and not the two it is at 128. Math.sin(u * 12.8) is two at any size.`;

const TECH_API_MATRIX_LINE = `- Declare the frame you composed for with ONE comment line near the top of the file, exactly this format:
  {{MATRIX_LINE}}
  Use exactly the dimensions given above. Pattern Lab reads this line to set the preview resolution, and the firmware uses it to map the pattern onto the physical panel.`;

const TECH_PIXEL_RGB = `- Write each pixel with display.setPixel(x, y, r, g, b) — EXACTLY five arguments, where r, g, b are three SEPARATE integer arguments in the range 0–255. Never pass a color array such as display.setPixel(x, y, [r, g, b]); never pass a packed color or a 4th alpha argument. The array form renders pure black.
- Use only plain JavaScript and Math.*. No browser APIs, DOM APIs, imports, async code, external libraries, dynamic evaluation, or per-pixel allocations.`;

const TECH_PIXEL_VFIELD = `- Write each pixel with display.setValue(x, y, v) — EXACTLY three arguments, where v is a single number from 0.0 to 1.0. Do NOT call display.setPixel anywhere.
- Use only plain JavaScript and Math.*. No browser APIs, DOM APIs, imports, async code, external libraries, dynamic evaluation, or per-pixel allocations.`;

const TECH_CONTROLS = `Creative control mapping:
- It is okay to keep one knob as animation speed, preferably Knob 2, if that suits the pattern.
- Do not keep all four knobs as the same old hue/speed/mode/frequency template unless it is genuinely the best fit.
- Redesign the controls creatively for each pattern. Examples: cell size, symmetry fold, glitch amount, palette split, trail length, scanline spacing, pulse width, inversion threshold, rotation, warp depth, density, edge thickness, phase offset, bloom-like gain, or motif selection.
- Each pattern should have a slightly different control personality. The controls should reveal the unique idea of that pattern.
- Include a short comment near setup() or update() naming what the 4 knobs do for that specific pattern.`;

const TECH_COLOR_RGB = `Color direction:
- Make color part of the pattern logic, not just a global hue wash.
- Avoid relying on a single full-frame gradient or a uniform hue shift across the whole image.
- Prefer colors that respond to local pattern values: distance fields, cell seeds, stripe index, phase, brightness, threshold bands, motion direction, edge thickness, density, or mask state.
- Good examples: large values become red while small values become blue; interior/exterior use different palettes; threshold bands step through 3-5 colors; cell IDs pick related colors; moving fronts leave warmer highlights; thin edges are white while filled regions are saturated.
- Both smooth local gradients and stepped posterized color bands are welcome, as long as the color changes are tied to the geometry or signal of the pattern.
- Keep at least some pixels near full LED brightness.`;

const TECH_COLOR_VFIELD = `Value-field direction (IMPORTANT — there is NO color in this pattern):
- The pattern outputs only a scalar value field via display.setValue(x, y, v). Color is applied OUTSIDE the pattern by a user-controlled color ramp that maps v = 0..1 to colors.
- Do NOT compute any colors, palettes, hues, RGB values, or hsvToRgb helpers anywhere. No color logic at all — pour all effort into geometry, structure, and motion.
- Treat v as the pattern's tonal value and design the field so it reads well under ANY ramp:
  - Use the full 0..1 range every frame: some pixels near 0, some near 1.
  - Build deliberate tonal structure tied to the geometry: edges, bands, plateaus, gradients driven by distance, phase, cell id, density, or masks.
  - Value contrast is your only material — sharp boundaries, layered levels, and clear figure/ground separation matter more than in RGB mode.
  - Avoid uniform mid-grey mush (everything hovering near 0.5) and avoid pure binary output unless the idea is intentionally hard-edged.
- Knobs must control geometry/motion/structure, never color (no hue knobs — color belongs to the ramp).`;

// What the panel does that a screen does not, closing the color section in
// both modes. The second line is the total power clamp
// (firmware/patternflow/src/core_power.h): it estimates a frame's current from
// its summed LED on-time and gives the next frame a lower brightness when that
// is over the budget.
const TECH_LED_PANEL = `- An LED that is off is black, and the panel has no backlight, so a frame gets its contrast from the areas it leaves dark.
- A frame that is near white all over asks for more current than the firmware's power budget allows, and the firmware then lowers the brightness of the whole panel.`;

/**
 * A rule the prompt gives only where the preview beside the Copy button has
 * what it describes. The buttons and the wall time arrive on `input`, and the
 * frame is read from the `@matrix` line. Pattern Lab's preview has all of it.
 */
export type PreviewRule = "buttons" | "wallTime" | "matrixLine";

/**
 * The API rules, the control mapping and the color section. The atlas quotes
 * what this returns for "vfield" and its own 64 × 128 frame
 * (lib/atlas/data.ts).
 */
export function buildTechGuide(
  colorMode: ColorMode,
  matrix: MatrixSize,
  without: readonly PreviewRule[] = [],
) {
  const api = [
    TECH_API_KNOBS,
    without.includes("buttons") ? null : TECH_API_BUTTONS,
    without.includes("wallTime") ? null : TECH_API_WALL_TIME,
    TECH_API_DRAW,
    TECH_API_ACCUMULATOR,
    TECH_API_FRAME,
    without.includes("matrixLine")
      ? null
      : TECH_API_MATRIX_LINE.replace("{{MATRIX_LINE}}", buildMatrixAnnotationLine(matrix)),
    colorMode === "vfield" ? TECH_PIXEL_VFIELD : TECH_PIXEL_RGB,
  ].filter((piece): piece is string => piece !== null);
  const colorSection = colorMode === "vfield" ? TECH_COLOR_VFIELD : TECH_COLOR_RGB;
  return `${api.join("\n")}\n\n${TECH_CONTROLS}\n\n${colorSection}\n${TECH_LED_PANEL}`;
}

// The third of the five directions is about what the pattern is made of. In
// RGB mode that is its color. A value-field pattern has none, and was asked
// for "color logic" here all the same until 22 November 2026.
const THIRD_DIRECTION: Record<ColorMode, string> = {
  rgb: "Palette/material remix: change color logic, brightness rhythm, or foreground/background relationship.",
  vfield:
    "Tonal remix: change how the values are distributed between 0 and 1 and how hard the contrast between them is. Swapping figure and ground counts.",
};

// Seed-based direction: remix one existing pattern.
function variantSeedDirection(colorMode: ColorMode) {
  return `Variation direction:
- Keep the general intent and the four control roles understandable, but do not copy the original structure too literally.
- At least 3 of the 5 variations must change the main drawing algorithm, not only constants, colors, thresholds, or speed.
- Avoid making all 5 outputs feel like the same pattern with different parameter values.
- Do not reuse the same grid, shape, distance formula, or composition in every variation.
- Give each variation a different dominant idea. Use these five directions:
  1. Structural remix: change the main geometry or repetition system.
  2. Motion remix: change how time moves through the pattern.
  3. ${THIRD_DIRECTION[colorMode]}
  4. Domain remix: warp, mirror, fold, scroll, rotate, or otherwise remap coordinates.
  5. Contrast remix: make a clearly different sparse/dense, hard/soft, or organic/mechanical interpretation.
- The variations can be bold. They should still feel related to the seed, but not trapped inside its exact look.
- Keep the patterns bright enough for an LED matrix and reasonably ESP32-friendly.
- Avoid smoothing/lerping knob-controlled values unless the visual idea specifically needs inertia.`;
}

type VariantPromptParts = {
  /** The seed. */
  code: string;
  matrix: MatrixSize;
  colorMode: ColorMode;
  /** Where the knobs stand, placed above the seed: a heading line, then a line for each knob. */
  controls: string;
  /** Rules to leave out, for a preview that has nothing behind them. */
  without?: readonly PreviewRule[];
};

/**
 * The prompt, whichever page copies it. The model returns 5 markdown code
 * blocks, in the ColorMode asked for.
 */
export function buildVariantPrompt({ code, matrix, colorMode, controls, without }: VariantPromptParts) {
  return `${variantIntro(matrix)}

Very important output rules:
- Return exactly 5 separate JavaScript code blocks.
- Each code block must be a complete standalone Patternflow pattern.
- Do not combine the 5 variations into one file.
- Do not add a mode selector, preset array, switch statement, or any code that contains multiple patterns in one output.
- Do not write wrapper text inside the code blocks.
- Put a short variation name before each code block.
- Do not include nested triple backticks inside any code block.

${buildTechGuide(colorMode, matrix, without)}

${variantSeedDirection(colorMode)}

${controls}

Existing pattern${
    colorMode === "vfield"
      ? " (NOTE: if this seed calls display.setPixel and computes colors, it is an older RGB-mode pattern — take only its geometry/motion ideas; every variation you output must use display.setValue(x, y, v) with NO color logic)"
      : ""
  }:
\`\`\`javascript
${code}
\`\`\``;
}

// Pattern Lab's Copy prompt, in the ColorMode picked beside the button.
export function buildVariantCopyPrompt(
  code: string,
  knobs: number[],
  ranges: Array<[number, number]>,
  colorMode: ColorMode = "rgb",
  matrix: MatrixSize = { width: 128, height: 64 },
) {
  return buildVariantPrompt({
    code,
    matrix,
    colorMode,
    controls: `Current Pattern Lab controls:\n${controlLines(knobs, ranges)}`,
  });
}
