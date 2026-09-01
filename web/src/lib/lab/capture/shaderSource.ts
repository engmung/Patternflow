// ── Shader source: the GLSL contract ─────────────────────────────────────────
// The pattern JS is the device's truth: a 128×64 grid, one setValue per LED,
// and a CPU that has to run it. For a poster it is the wrong machine — a
// per-pixel JS loop at 4K costs ~200 ms a frame, and a pattern that carries
// its own simulation grid (reaction-diffusion, automata, trails) can only
// upsample that grid, so the extra pixels hold no extra picture.
//
// The shader twin is the same composition written for the machine that IS
// built for per-pixel work. It is OUTPUT ONLY — the panel and the hardware
// export keep running the JS — so nothing here can drift into the device
// path. What lives in this file is the pure text half of it: what a source
// must declare, the preamble every compile gets, and how a driver's error
// log maps back to the lines the user actually wrote. The WebGL half is in
// shaderStage.ts; keeping them apart is what lets the smoke test run this
// contract in node.

import { SHADER_RAMP_SIZE } from "./shaderRamp";

/** GLSL ES 3.00. The version line must be the first line of the source. */
const VERSION = "#version 300 es";

/** Full-screen triangle from gl_VertexID — no attribute buffers at all. */
export const SHADER_VERTEX_SOURCE = `${VERSION}
void main() {
  vec2 pfVertex = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(pfVertex * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Everything a source can rely on. Uniform names are the contract the
 * conversion prompt hands the model, so they are stable: renaming one is a
 * breaking change for every shader anyone has already pasted in.
 */
export const SHADER_PREAMBLE = `${VERSION}
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec2 uResolution;   // render size in pixels
uniform float uTime;        // seconds since the take started
uniform int uFrame;         // frames since the take started (0 on the first)
uniform vec4 uKnob;         // the four knobs, in their real @knobs ranges
uniform vec4 uKnobNorm;     // the same four, 0..1 across their range
uniform vec4 uBtnPressed;   // 1.0 on the frame a knob button goes down
uniform vec4 uBtnHeld;      // 1.0 while it is held
uniform sampler2D uState;   // last frame's mainState output (wraps, nearest)
uniform sampler2D uRamp;    // the layer's colour ramp, live from the panel

out vec4 pfFragColor;

vec4 stateAt(vec2 fragCoord) {
  return texture(uState, fragCoord / uResolution);
}

vec4 stateOffset(vec2 fragCoord, vec2 delta) {
  return texture(uState, (fragCoord + delta) / uResolution);
}

// The Color Ramp panel, as a function: 0..1 in, straight RGBA out. Editing a
// stop moves this on the next frame — nothing here is baked into the shader.
vec4 ramp(float v) {
  float u = (clamp(v, 0.0, 1.0) * ${SHADER_RAMP_SIZE - 1}.0 + 0.5) / ${SHADER_RAMP_SIZE}.0;
  return texture(uRamp, vec2(u, 0.5));
}

#line 1
`;

/** How many lines the preamble adds before the user's line 1. */
export const SHADER_PREAMBLE_LINES = SHADER_PREAMBLE.split("\n").length - 1;

export type ShaderPass = "image" | "state";

/** The name of the entry point a pass calls. */
export const SHADER_ENTRY: Record<ShaderPass, string> = {
  image: "mainImage",
  state: "mainState",
};

/** Strip line and block comments — entry detection must not read a mention. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

export function declaresPass(source: string, pass: ShaderPass): boolean {
  const entry = SHADER_ENTRY[pass];
  return new RegExp(`\\bvoid\\s+${entry}\\s*\\(`).test(withoutComments(source));
}

/**
 * The fragment source for one pass: preamble, the user's code verbatim
 * (`#line 1` keeps their numbering), and a main() that calls the entry.
 * The user's source is never rewritten — a shader that compiles here is the
 * shader they wrote.
 */
export function buildFragmentSource(source: string, pass: ShaderPass): string {
  const entry = SHADER_ENTRY[pass];
  return `${SHADER_PREAMBLE}${source}
#line 100000
void main() {
  vec4 pfOut = vec4(0.0, 0.0, 0.0, 1.0);
  ${entry}(pfOut, gl_FragCoord.xy);
  pfFragColor = pfOut;
}
`;
}

/**
 * Drivers report `ERROR: 0:37: …` — string index, then line, counted in the
 * source they were handed. `#line 1` after the preamble already makes that
 * number the user's own, so it only needs saying in words; the wrapper past
 * `#line 100000` is ours, and a fault in there is reported as the wrapper
 * rather than as line 100003 of a 40-line shader. Logs also arrive
 * NUL-terminated and padded from some drivers, hence the control-character
 * strip: it is going straight into the panel.
 */
export function remapShaderLog(log: string): string {
  return log
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.replace(/\b0:(\d+):/g, (whole, digits: string) =>
        Number(digits) >= 100000 ? "wrapper:" : `line ${digits}:`,
      ),
    )
    .slice(0, 6)
    .join("\n");
}

export type ShaderSourceCheck = { ok: true; hasState: boolean } | { ok: false; error: string };

/** What can be said about a source without a GPU. */
export function checkShaderSource(source: string): ShaderSourceCheck {
  const trimmed = source.trim();
  if (!trimmed) return { ok: false, error: "The shader is empty." };
  if (/^\s*#version/m.test(source)) {
    return {
      ok: false,
      error: "Remove the #version line — the stage adds `#version 300 es` and the uniform block itself.",
    };
  }
  if (!declaresPass(source, "image")) {
    return {
      ok: false,
      error: "No `void mainImage(out vec4 fragColor, in vec2 fragCoord)` — that entry point is what the stage calls.",
    };
  }
  if (/\bout\s+vec4\s+\w+\s*;/.test(withoutComments(source))) {
    return {
      ok: false,
      error: "Remove the `out vec4` declaration — write the colour into mainImage's out parameter instead.",
    };
  }
  return { ok: true, hasState: declaresPass(source, "state") };
}
