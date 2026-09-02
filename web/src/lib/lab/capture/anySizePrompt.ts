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
//
// The rewrite has a ceiling, and the SIMULATIONS rule below is where it shows.
// A pattern that integrates a field per frame cannot be made to fill a poster
// by JavaScript alone: run the field at 4K and one frame is seconds of CPU;
// leave it small and the picture is a block enlargement whatever draw() does.
// That is the case the shader twin exists for (shaderPrompt.ts) — this prompt
// is the one to reach for when a pattern is merely written in pixel units.

import type { MatrixSize } from "@/lib/pattern/matrix";

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
- SIMULATIONS — read this if the pattern integrates a field between frames (reaction–diffusion, cellular automata, fluid, trails, phosphor decay) in a buffer whose size is fixed in setup(). Sampling that fixed grid with nearest lookups inside draw() SATISFIES NOTHING: the picture is then a block enlargement of a ${width} × ${height} image at every output size — the same pixels, hundreds of times the work. Do one of these instead, in this order:
  1. Allocate the field for display.width × display.height and keep the structures the same size in the frame: read neighbours at a spacing of h = max(1, floor(min(display.width / ${width}, display.height / ${height}))) pixels rather than 1, and use a 9-tap Laplacian at that spacing (edges 0.2, corners 0.05, centre −1) so a wide stencil does not alias into grid-scale noise. Keep the time step, the coefficients, the clamps and the non-finite guards exactly as they are.
  2. If that is not numerically viable for this model, keep the small field but make the extra pixels carry real information: resample it smoothly (bilinear or bicubic, in frame units) AND add detail derived from the field itself — iso-contour lines, gradient-shaded filaments, noise modulated by the local value — calibrated so that at ${width} × ${height} the picture is unchanged. Say which you did in ONE added comment line.
  Do not simply blur the upscale, and do not leave the nearest-neighbour lookup in place.
- Keep the pattern's name, structure, knob handling and behaviour. Keep every comment line that begins with // @ (annotations such as // @knobs and // @matrix) exactly as it is, and keep the license header and footer comments exactly as they are.
- Do not add features, do not change colours, do not rename the exported functions. Prefer minimal, surgical edits.
- Plain JavaScript, no imports, no TypeScript.

Reply with the complete rewritten pattern source in ONE code block and nothing else.

PATTERN SOURCE
${code}`;
}
