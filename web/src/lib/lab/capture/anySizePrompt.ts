// ── "Any size" rewrite prompt ────────────────────────────────────────────────
// Most patterns bake the 128×64 frame into their math — cx = 64,
// Math.sin(x * 0.1), a Float32Array(128 * 64) — so re-run at a print size
// they tile, shrink into a corner, or go black. The scaling probe catches
// that and falls back to an upscale; the only thing that actually raises the
// quality is rewriting the code in frame-relative units.
//
// Same workflow as the C++ conversion: copy this prompt, hand it to whatever
// model you like, paste the answer back into the Code panel. The probe re-runs
// on the new code, and if it now scales, Auto switches to a native re-render
// by itself — the HUD is the verification.

import type { MatrixSize } from "@/lib/patternMatrix";

export function buildAnySizePrompt(code: string, matrix: MatrixSize): string {
  const { width, height } = matrix;
  return `You are editing one JavaScript LED pattern for the Patternflow web runtime. API, unchanged: optional setup(params), optional update(dt, input, params), required draw(display, params, time); display.width / display.height; display.setPixel(x, y, r, g, b) and display.setValue(x, y, v).

GOAL
The pattern was composed for a ${width} × ${height} pixel frame and currently assumes that size in its math. Rewrite it so that it draws THE SAME PICTURE at ${width} × ${height} and, when display.width / display.height are larger (for example ${width * 8} × ${height * 8}, or a frame with a slightly different aspect such as 1050 × 600), draws the same composition scaled up with more detail — NOT more repetitions, NOT a small copy in a corner, NOT a crop, NOT a blank.

RULES
- Work in frame-relative coordinates. Derive everything from display.width and display.height inside draw() (and wherever buffers are sized): u = x / display.width, v = y / display.height, or centred nx / ny with the aspect preserved. Express radii, thicknesses, spacings, wavelengths, speeds, cell sizes and offsets as fractions of the frame (typically of Math.min(display.width, display.height)), calibrated so the look at ${width} × ${height} is unchanged.
- Replace every literal that encodes the frame (${width}, ${height}, ${width / 2}, ${height / 2}, ${width * height}, strides like y * ${width} + x, bounds like x < ${width}) with the display dimensions. Buffers that hold one value per pixel must be allocated for display.width * display.height; if their size is fixed in setup(), allocate lazily in update()/draw() when the frame size is first known or changes.
- Pixel-unit frequencies become frame-unit frequencies: Math.sin(x * 0.1) → Math.sin(u * (0.1 * ${width})). Keep the numbers that produce the original look.
- Integer-pixel idioms (checkerboards, dithers, scanlines, 1-pixel lines) must keep their visual density: scale the cell size with the frame instead of testing x % 2 in raw pixels.
- Keep the pattern's name, structure, knob handling and behaviour. Keep every comment line that begins with // @ (annotations such as // @knobs and // @matrix) exactly as it is, and keep the license header and footer comments exactly as they are.
- Do not add features, do not change colours, do not rename the exported functions. Prefer minimal, surgical edits.
- Plain JavaScript, no imports, no TypeScript.

Reply with the complete rewritten pattern source in ONE code block and nothing else.

PATTERN SOURCE
${code}`;
}
