// ── "Shader twin" conversion prompt ──────────────────────────────────────────
// Same workflow as the C++ conversion and the any-size rewrite: copy a prompt,
// hand it to whatever model you like, paste the answer back — except the answer
// lands in the Graphic Export panel's shader field, not in the Code panel. The
// JS pattern is untouched: it stays what the panel plays and what the hardware
// export bakes. The shader is a second expression of the same composition, for
// the one job JS cannot do — filling a poster with real detail.
//
// The prompt carries the whole runtime contract (shaderSource.ts), the knob
// ranges as they actually are, and the layer's colour ramp — as a DESCRIPTION,
// so the model knows what the picture looks like, and with an instruction to
// call ramp(v) rather than reproduce it. Baking the colours in would freeze the
// Color Ramp panel out of the twin; the ramp travels as a texture instead
// (shaderRamp.ts), so editing a stop repaints the export live.

import type { MatrixSize } from "@/lib/patternMatrix";
import { parseKnobsAnnotation } from "../annotations";
import type { KnobRange, RampState } from "../types";

const MODE_NOTES: Record<string, string> = {
  linear: "straight RGB interpolation between stops",
  smooth: "RGB interpolation with a smoothstep ease between stops",
  step: "no interpolation — each stop holds until the next one",
  hsvShort: "HSV interpolation, hue takes the short way round",
  hsvLong: "HSV interpolation, hue takes the long way round",
  oklab: "OKLab interpolation (perceptually even, no hue drift)",
  oklchShort: "OKLCh interpolation, hue the short way (even chroma)",
  oklchLong: "OKLCh interpolation, hue the long way (even chroma)",
};

function describeRamp(ramp: RampState): string {
  const stops = ramp.stops
    .map((stop) => `${stop.position.toFixed(3)} → ${stop.color}${stop.alpha < 1 ? ` @ ${stop.alpha.toFixed(2)} alpha` : ""}`)
    .join(", ");
  const mode = MODE_NOTES[ramp.mode] ?? ramp.mode;
  return `${stops}\nInterpolation: ${mode}${ramp.wrap ? "; the ramp WRAPS (value 1 meets value 0 again)" : ""}.`;
}

function describeKnobs(code: string, ranges: KnobRange[]): string {
  const parsed = parseKnobsAnnotation(code);
  return ranges
    .map((range, index) => {
      const entry = parsed?.[index];
      const name = entry?.name ?? `Knob ${index + 1}`;
      const [min, max] = entry ? [entry.min, entry.max] : range;
      const component = ["x", "y", "z", "w"][index];
      return `  uKnob.${component} — ${name}: ${min} … ${max}`;
    })
    .join("\n");
}

export function buildShaderPrompt(
  code: string,
  matrix: MatrixSize,
  ramp: RampState,
  ranges: KnobRange[],
): string {
  const { width, height } = matrix;
  return `You are porting ONE JavaScript LED pattern to a GLSL fragment shader. The JavaScript keeps running the LED panel; the shader is a second, output-only expression of the same composition, used to render stills and clips at print and screen sizes (1024×512 up to 4096 px a side) where the JS version is far too slow and, if it carries a simulation grid, too coarse.

TARGET RUNTIME
GLSL ES 3.00, one fragment shader, rendered full-frame. Write ONLY function definitions — the stage prepends the version line, precision, the uniform block and its own main(). Do NOT write #version, do NOT declare an "out" variable, do NOT write main(), and do NOT use any texture the stage does not give you.

Entry points:
  void mainImage(out vec4 fragColor, in vec2 fragCoord)   REQUIRED — the picture. fragColor is straight (un-premultiplied) RGBA, 0..1.
  void mainState(out vec4 stateOut, in vec2 fragCoord)    OPTIONAL — one frame of simulation state; see FEEDBACK.

Uniforms and helpers, always available:
  uniform vec2 uResolution;   // render size in pixels (NOT ${width}×${height} — anything up to 4096)
  uniform float uTime;        // seconds since the take started
  uniform int uFrame;         // frames since the take started, 0 on the first
  uniform vec4 uKnob;         // the four knobs in their real ranges (below)
  uniform vec4 uKnobNorm;     // the same four, 0..1 across their range
  uniform vec4 uBtnPressed;   // 1.0 on the frame a knob button goes down
  uniform vec4 uBtnHeld;      // 1.0 while it is held
  uniform sampler2D uState;   // last frame's mainState output; wraps, NEAREST
  vec4 stateAt(vec2 fragCoord);                    // this pixel's previous state
  vec4 stateOffset(vec2 fragCoord, vec2 delta);    // a neighbour, delta in pixels
  vec4 ramp(float v);                              // the layer's live colour ramp, 0..1 in

KNOBS — same names, same real values the JS pattern reads from input.knobValues:
${describeKnobs(code, ranges)}
uKnob is the knob VALUE, not a normalised slider: use it exactly where the JS uses knobValues[i]. Buttons map 1:1 with input.btnPressed[i] / input.btnHeld[i]: uBtnPressed.x > 0.5 is "button 1 was pressed this frame".

COLOUR
${
    /setValue\s*\(/.test(code)
      ? `The JS draws with display.setValue(x, y, v) — a 0..1 value field the runtime colours through the layer's ramp. Do the same: write \`fragColor = ramp(v);\` wherever the JS calls setValue(x, y, v). DO NOT bake the colours in and do not write your own gradient — ramp() IS the Color Ramp panel, so the user goes on editing their colours with the shader running. For reference, it currently holds:
${describeRamp(ramp)}
ramp() clamps its input to 0..1 and returns straight RGBA, alpha included.`
      : "The JS draws with display.setPixel(x, y, r, g, b) in 0..255 sRGB. Divide by 255 and keep the same colours. (A ramp(float v) helper exists but this pattern does not use one.)"
  }

RESOLUTION IS THE WHOLE POINT
The composition must look like the ${width}×${height} original and gain REAL detail as uResolution grows — never more repetitions, never a crop, never the same picture in bigger blocks.
- Derive every coordinate from uResolution: vec2 uv = fragCoord / uResolution, or a centred coordinate with the aspect preserved. Turn pixel-unit frequencies into frame-unit ones: a JS Math.sin(x * 0.1) is Math.sin(u * ${(0.1 * width).toFixed(1)}) in frame units.
- Replace every literal that encodes the frame (${width}, ${height}, ${width / 2}, ${height / 2}, strides, bounds) with uResolution.
- Anything the JS quantised to LED cells (checkerboards, dithers, scanlines, 1-pixel strokes) must keep its frame-relative SIZE, so scale the cell size with uResolution rather than testing raw pixels. Where the JS had one hard-edged LED, prefer a smooth edge sized in frame units — at 4096 px a jagged step is the one thing that will look wrong.
- No arrays of per-pixel state, no loops over the whole frame: a fragment shader runs once per pixel. Anything the JS accumulated in a Float32Array is either recomputed from uTime, or becomes FEEDBACK.

FEEDBACK — only if the JS carries state between frames
If the pattern integrates a field (reaction–diffusion, cellular automata, fluid, decay trails, phosphor memory), write mainState as well. Rules:
- One RGBA texel per pixel is the state. Pack the fields into channels and say which is which in a comment (e.g. R = u, G = v, B = stress).
- Seed it: if (uFrame == 0) { ...initial field... } — reproduce the JS seeding. Reseed on a button too, where the JS does: if (uBtnPressed.x > 0.5) { ...seed... }.
- Read neighbours with stateOffset(fragCoord, vec2(h, 0.0)) where h is a frame-relative step, NOT one pixel:
    float h = max(1.0, floor(min(uResolution.x / ${width}.0, uResolution.y / ${height}.0)));
  With h = 1 at the original size this is the JS lattice exactly; at 4K it keeps the structures the same size in the frame instead of shrinking them to ${width}ths of it.
- Use a 9-tap Laplacian at that spacing (edges 0.2, corners 0.05, centre −1) rather than a 5-tap: a wide stencil with only four taps aliases into grid-scale noise.
- Keep the same time step and coefficients the JS uses, and keep every clamp and non-finite guard it has — a shader that diverges goes to NaN and stays black.
- mainImage then reads stateAt(fragCoord) and colours it. It must not integrate anything itself.

ALSO
- No randomness outside a hash of the coordinate (write one inline, e.g. a fract(sin(dot(...))) hash) — every frame must be reproducible from uFrame and uTime alone.
- Keep the pattern's structure and its knob behaviour. Start the shader with a short comment block: the pattern's title, what each knob does, and the channel packing if there is state.
- Do not add features, do not "improve" the composition, do not change the palette.

Reply with the complete shader in ONE code block and nothing else.

PATTERN SOURCE (JavaScript)
${code}`;
}
