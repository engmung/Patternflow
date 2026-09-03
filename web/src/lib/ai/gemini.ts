// Bring-your-own-key Gemini integration for Pattern Lab.
//
// The API key is stored only in the browser (localStorage) and sent directly to
// Google's endpoint from the client — it never touches our servers. Because this
// is a static, open-source site we deliberately avoid bundling any shared key.

import {
  buildMatrixAnnotationLine,
  describeMatrixShape,
  withMatrixAnnotation,
  type MatrixSize,
} from "@/lib/pattern/matrix";

// Swap these to change the model / reasoning depth used for in-app generation.
//
// NOTE: we call the `generateContent` endpoint, not the newer Interactions API.
// `/v1beta/interactions` does not send CORS headers, so browsers block it from
// any origin (localhost and production alike). `generateContent` does send them,
// which is what makes client-side BYOK work without a server proxy.
export const GEMINI_MODEL = "gemini-3.6-flash";

// The settings vocabulary (thinking levels, colour modes, the variant shape)
// lives in ./settings so the lab can persist a GenSettings block without
// importing this client. Re-exported here for everyone who already does.
import {
  COLOR_MODES,
  GEMINI_THINKING_LEVEL,
  THINKING_LEVELS,
  type ColorMode,
  type PatternVariant,
  type ThinkingLevelKey,
} from "./settings";
export { COLOR_MODES, GEMINI_THINKING_LEVEL, THINKING_LEVELS };
export type { ColorMode, PatternVariant, ThinkingLevelKey };

// ---------------------------------------------------------------------------
// License / attribution stamped onto every generated pattern.
// Edit these two templates to change the notice. `{{name}}` and `{{year}}` are
// filled in automatically; everything else is yours to change.
// ---------------------------------------------------------------------------
export const LICENSE_HEADER_TEMPLATE = `// Pattern: {{name}}
// Author: your name here
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: {{date}}
// Made with Patternflow Pattern Lab — https://patternflow.work/pattern-lab`;

export const LICENSE_FOOTER_TEMPLATE = `// ---
// Made with Patternflow Pattern Lab — https://patternflow.work/pattern-lab
// Licensed CC-BY-SA-4.0. Keep this notice if you share or remix.`;

function stampLicense(code: string, name: string): string {
  const today = new Date();
  const date = today.toISOString().slice(0, 10); // YYYY-MM-DD, filled automatically
  const header = LICENSE_HEADER_TEMPLATE.replaceAll("{{name}}", name)
    .replaceAll("{{date}}", date)
    .replaceAll("{{year}}", String(today.getFullYear()));
  return `${header}\n\n${code.trim()}\n\n${LICENSE_FOOTER_TEMPLATE}\n`;
}

// Some models put the whole pattern on one line or emit literal "\n" escapes
// inside the JSON string. If there are no real newlines but escaped ones exist,
// restore them so the code shows as normal multi-line text in the editor.
function normalizeCode(code: string): string {
  if (code.includes("\n")) return code;
  if (code.includes("\\n")) {
    return code
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t");
  }
  return code;
}

export const GEMINI_KEY_STORAGE = "patternflow_gemini_key";

const KNOB_LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];

export function loadGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveGeminiKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    if (key) {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, key);
    } else {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
  } catch {
    // Ignore private-mode / storage-disabled sessions.
  }
}

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

// Technical + quality spec shared by every path (API rules, controls, color).
// Split into pieces so the pixel-write rule and the color section can swap
// depending on ColorMode.
const TECH_API_COMMON = `Required API for every pattern:
- export function setup(params) {}
- export function update(dt, input, params) {}
- export function draw(display, params, time) {}
- Use input.knobValues as the primary control API. input.knobValues is an array of 4 absolute knob values after the min/max ranges are applied.
- Declare the ranges your 4 knobs want with ONE comment line near the top of the file, exactly this format:
  // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1
  (exactly 4 comma-separated entries, Name=min..max, short names). Pattern Lab parses this line, renames the on-screen knobs, and sets their min/max automatically — the user can then retune any range and your pattern follows, because you read the values back through input.knobValues.
- Read input.knobValues[i] directly as the parameter value (matching your @knobs ranges). Do NOT read input.knobNormalized and remap it with baked constants such as 3 + kn[0] * 9 — that disconnects Pattern Lab's range editor (the user's min/max edits stop doing anything). input.knobNormalized is acceptable only for a truly unitless 0..1 blend where any range would mean the same thing.
- Keep input.knobDeltas only as compatibility fallback if needed.
- Optional: each knob also has a push button. input.btnPressed[i] is true only on the frame it is pressed (edge); input.btnHeld[i] is true while it is held down. Use these for momentary actions like reset, freeze, cycle, or trigger. Do not use long-press or mode-switching; that is a reserved system gesture.
- IMPORTANT: input is passed ONLY to update(dt, input, params). draw's signature is draw(display, params, time) with NO input argument — params.input does not exist. To read knob or button values inside draw, use params.knobValues / params.knobNormalized / params.knobDeltas / params.btnPressed / params.btnHeld (the harness mirrors the latest input onto params every frame), or stash whatever you need on params during update. Never read input.* or params.input.* inside draw.
- Use display.width and display.height in loops. Never hardcode the frame's pixel dimensions inside draw() — the same pattern is run at other resolutions, and a hardcoded size crops or zooms it.
- Declare the frame you composed for with ONE comment line near the top of the file, exactly this format:
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

function buildTechGuide(colorMode: ColorMode, matrix: MatrixSize) {
  const pixelRule = colorMode === "vfield" ? TECH_PIXEL_VFIELD : TECH_PIXEL_RGB;
  const colorSection = colorMode === "vfield" ? TECH_COLOR_VFIELD : TECH_COLOR_RGB;
  const api = TECH_API_COMMON.replace("{{MATRIX_LINE}}", buildMatrixAnnotationLine(matrix));
  return `${api}\n${pixelRule}\n\n${TECH_CONTROLS}\n\n${colorSection}`;
}

// Seed-based direction for the clipboard prompt (remix one existing pattern).
const VARIANT_SEED_DIRECTION = `Variation direction:
- Keep the general intent and the four control roles understandable, but do not copy the original structure too literally.
- At least 3 of the 5 variations must change the main drawing algorithm, not only constants, colors, thresholds, or speed.
- Avoid making all 5 outputs feel like the same pattern with different parameter values.
- Do not reuse the same grid, shape, distance formula, or composition in every variation.
- Give each variation a different dominant idea. Use these five directions:
  1. Structural remix: change the main geometry or repetition system.
  2. Motion remix: change how time moves through the pattern.
  3. Palette/material remix: change color logic, brightness rhythm, or foreground/background relationship.
  4. Domain remix: warp, mirror, fold, scroll, rotate, or otherwise remap coordinates.
  5. Contrast remix: make a clearly different sparse/dense, hard/soft, or organic/mechanical interpretation.
- The variations can be bold. They should still feel related to the seed, but not trapped inside its exact look.
- Keep the patterns bright enough for an LED matrix and reasonably ESP32-friendly.
- Avoid smoothing/lerping knob-controlled values unless the visual idea specifically needs inertia.`;

// Divergence direction for the in-app call: draw on many references, spread wide.
const VARIANT_DIVERGE_DIRECTION = `Direction — maximize variety:
- These are NEW patterns, not edits of one source. Do not converge on a single look across the set.
- Borrow ideas freely, but never closely reproduce a single familiar template or any reference shown.
- Give each output a different dominant idea. Spread the set across these axes: structure/geometry, how time moves, color logic, coordinate domain (warp/mirror/fold/scroll/rotate), and density/contrast.
- Most outputs must use a different main drawing algorithm — not the same pattern with different constants, colors, thresholds, or speed.
- Do not reuse the same grid, shape, distance formula, or composition across outputs.
- Be bold: it is good if the set spans very different moods — sparse vs dense, hard vs soft, organic vs mechanical, geometric vs noisy.
- Keep the patterns bright enough for an LED matrix and reasonably ESP32-friendly.
- Avoid smoothing/lerping knob-controlled values unless the visual idea specifically needs inertia.`;

// Prompt for the clipboard fallback: the model returns 5 markdown code blocks.
// Follows the same ColorMode as the in-app call so v-field users get v-field
// output from external chatbots too.
export function buildVariantCopyPrompt(
  code: string,
  knobs: number[],
  ranges: Array<[number, number]>,
  colorMode: ColorMode = "rgb",
  matrix: MatrixSize = { width: 128, height: 64 },
) {
  return `${variantIntro(matrix)}

Very important output rules:
- Return exactly 5 separate JavaScript code blocks.
- Each code block must be a complete standalone Patternflow pattern.
- Do not combine the 5 variations into one file.
- Do not add a mode selector, preset array, switch statement, or any code that contains multiple patterns in one output.
- Do not write wrapper text inside the code blocks.
- Put a short variation name before each code block.
- Do not include nested triple backticks inside any code block.

${buildTechGuide(colorMode, matrix)}

${VARIANT_SEED_DIRECTION}

Current Pattern Lab controls:
${controlLines(knobs, ranges)}

Existing pattern${
    colorMode === "vfield"
      ? " (NOTE: if this seed calls display.setPixel and computes colors, it is an older RGB-mode pattern — take only its geometry/motion ideas; every variation you output must use display.setValue(x, y, v) with NO color logic)"
      : ""
  }:
\`\`\`javascript
${code}
\`\`\``;
}

// Instruction for the in-app structured-output call: the model returns JSON
// matching the schema below, so there are no markdown fences to parse. `count`
// sets how many patterns; `examples` is a random sample of existing Patternflow
// patterns used to widen the model's range so output is not all one style.
function buildVariantApiInstruction(
  code: string,
  knobs: number[],
  ranges: Array<[number, number]>,
  count: number,
  examples: Array<{ name: string; code: string }>,
  matrix: MatrixSize,
  seedWithCurrent: boolean,
  colorMode: ColorMode,
) {
  const phrase = count === 1 ? "1 standalone pattern" : `${count} distinct standalone patterns`;

  const noReferences = examples.length === 0 && !seedWithCurrent;
  const creativityLine = noReferences
    ? "No reference patterns are provided, on purpose. Invent the most original, surprising, and varied patterns you can purely from the rules below — do not fall back on common defaults.\n\n"
    : "";

  // Existing presets are RGB-mode; when generating value fields, make sure the
  // model doesn't imitate their setPixel/color code.
  const vfieldReferenceCaveat =
    colorMode === "vfield"
      ? " NOTE: the references are older RGB-mode patterns that call display.setPixel and compute colors — your output must instead call display.setValue(x, y, v) with NO color logic. Use the references only for geometry, structure, and motion ideas."
      : "";

  // Every bundled preset was composed for the stock 128×64 panel. Asking for a
  // different frame while showing landscape references is exactly how patterns
  // came out cropped and over-zoomed, so say so outright.
  const frameReferenceCaveat =
    matrix.width === 128 && matrix.height === 64
      ? ""
      : ` NOTE: the references were composed for a 128×64 frame; you are composing for ${matrix.width}×${matrix.height}. Take their ideas, not their proportions — re-lay every composition out for the ${describeMatrixShape(matrix)} frame described above.`;

  const referenceBlock = examples.length
    ? `Reference patterns — these show the RANGE of styles that work on Patternflow. Use them ONLY as inspiration for what is possible. Do NOT copy, port, or closely reproduce any single one.${vfieldReferenceCaveat}${frameReferenceCaveat}

${examples.map((example) => `===== ${example.name} =====\n${example.code}`).join("\n\n")}

`
    : "";

  return `I am writing custom LED patterns in JavaScript for a Patternflow ${matrix.width}x${matrix.height} LED matrix web preview.

${frameLine(matrix)}

Create exactly ${phrase} that are genuinely different from one another. Aim for wide variety, not small tweaks of a single look.

${creativityLine}Return the patterns as structured JSON matching the provided schema: an array of exactly ${count} object${count === 1 ? "" : "s"}. Each object has:
- "name": a short pattern name.
- "knobNotes": one line naming what the 4 knobs do for that pattern.
- "code": a complete standalone Patternflow pattern as plain JavaScript text. Do NOT wrap it in markdown fences. Do NOT combine patterns, add a mode selector, preset array, or switch statement that holds multiple patterns.
- Format the code as normal, readable multi-line JavaScript using real line breaks and indentation. Do NOT put the whole pattern on a single line and do NOT minify it.
- Do NOT add any license header, copyright line, author/date comment, or attribution footer — those are added automatically. Start directly with the pattern code.

${buildTechGuide(colorMode, matrix)}

${VARIANT_DIVERGE_DIRECTION}

${referenceBlock}${
    seedWithCurrent
      ? `The pattern currently open in the editor (you may relate to it loosely, but prioritize variety over staying close to it):
\`\`\`javascript
${code}
\`\`\`

`
      : ""
  }Current Pattern Lab controls:
${controlLines(knobs, ranges)}`;
}

function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : undefined;
}

// Transient server-side failures worth retrying: overload (503), quota bursts
// (429), and the occasional 500.
function isRetryableError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 503 || status === 429 || status === 500) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /(503|500|429|UNAVAILABLE|overloaded|RESOURCE_EXHAUSTED)/i.test(message);
}

// Turn the SDK's verbose error blobs into one human-readable line for the UI.
function describeGeminiError(error: unknown): string {
  const status = errorStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  if (status === 503 || /503|UNAVAILABLE|overloaded/i.test(message)) {
    return "Gemini is temporarily overloaded (503). Please try again in a moment.";
  }
  if (status === 429 || /429|RESOURCE_EXHAUSTED/i.test(message)) {
    return "Rate limit or quota reached (429). Wait a bit, then retry.";
  }
  if (status === 403 || /403|PERMISSION_DENIED/i.test(message)) {
    return "Your API key can't access this model (403). Check the key, or switch GEMINI_MODEL.";
  }
  if (status === 400 || /400|API key not valid|INVALID_ARGUMENT/i.test(message)) {
    return "Request rejected (400). The API key may be invalid or the request malformed.";
  }
  return message || "Generation failed.";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts - 1) break;
      await sleep(800 * 2 ** attempt); // 0.8s, 1.6s, 3.2s
    }
  }
  throw lastError;
}

export async function generatePatternVariants({
  apiKey,
  code,
  knobs,
  ranges,
  count = 5,
  thinkingLevel = GEMINI_THINKING_LEVEL,
  examples = [],
  matrix = { width: 128, height: 64 },
  seedWithCurrent = true,
  colorMode = "rgb",
}: {
  apiKey: string;
  code: string;
  knobs: number[];
  ranges: Array<[number, number]>;
  count?: number;
  thinkingLevel?: ThinkingLevelKey;
  examples?: Array<{ name: string; code: string }>;
  matrix?: MatrixSize;
  seedWithCurrent?: boolean;
  colorMode?: ColorMode;
}): Promise<PatternVariant[]> {
  // Dynamic import keeps the SDK out of the initial page bundle — it only loads
  // when the user actually clicks Generate.
  const { GoogleGenAI, Type, ThinkingLevel } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  // Structured output: the schema forces exactly 5 objects so there are no
  // markdown code fences to parse out. Retry transient overloads (503/429).
  let response;
  try {
    response = await withRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildVariantApiInstruction(
          code,
          knobs,
          ranges,
          count,
          examples,
          matrix,
          seedWithCurrent,
          colorMode,
        ),
        config: {
          temperature: 1,
          topP: 0.95,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingLevel: ThinkingLevel[thinkingLevel] },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            minItems: String(count),
            maxItems: String(count),
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                knobNotes: { type: Type.STRING },
                code: { type: Type.STRING },
              },
              required: ["name", "code"],
              propertyOrdering: ["name", "knobNotes", "code"],
            },
          },
        },
      }),
    );
  } catch (error) {
    throw new Error(describeGeminiError(error));
  }

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected response shape from Gemini.");
  }

  const variants: PatternVariant[] = parsed
    .filter(
      (item): item is { name?: unknown; knobNotes?: unknown; code?: unknown } =>
        Boolean(item) && typeof item === "object",
    )
    .filter((item) => typeof item.code === "string" && item.code.trim().length > 0)
    .map((item) => {
      const name =
        typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Variation";
      // Models drop the @matrix line often enough that it can't be trusted to
      // the prompt alone, and a pattern with no declared frame silently falls
      // back to 128×64 later on. The requested size is the authority here — it
      // is what the model was told to compose for.
      const code = withMatrixAnnotation(normalizeCode(item.code as string), matrix);
      return {
        name,
        knobNotes: typeof item.knobNotes === "string" ? item.knobNotes : undefined,
        code: stampLicense(code, name),
      };
    });

  if (variants.length === 0) {
    throw new Error("No usable variations were returned.");
  }

  return variants;
}
