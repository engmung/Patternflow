// The GLSL prompt's COLOUR section comes in three forms, and the one a pattern
// gets decides how its shader twin is coloured. Until 22 November 2026 the
// prompt looked for setValue( anywhere in the source, so an RGB pattern with
// that in a comment had its colours sent through ramp(), and the layer's
// Recolor toggle was never read. The prompt did not say which way fragCoord.y
// runs either: up from the bottom row, against the pattern's y.

import { describe, expect, it } from "vitest";
import type { KnobRange, RampState } from "../types";
import { buildShaderPrompt } from "./shaderPrompt";

const MATRIX = { width: 128, height: 64 };
const RANGES: KnobRange[] = [[0, 1], [0, 1], [0, 1], [0, 1]];
const RAMP: RampState = {
  stops: [
    { position: 0, color: "#102040", alpha: 1 },
    { position: 0.5, color: "#ff4d00", alpha: 0.5 },
    { position: 1, color: "#ffe89a", alpha: 1 },
  ],
  mode: "oklab",
  wrap: false,
};

const VALUE_FIELD = `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++) display.setValue(x, y, x / display.width);
}`;

const RGB = `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++) display.setPixel(x, y, x * 2, y * 4, 128);
}`;

// The same pattern with the value-field call named in both kinds of comment
// and in a string, none of which is code.
const RGB_NAMING_SET_VALUE = `// Colours are baked in. display.setValue(x, y, v) would send them through the ramp.
/* setValue(x, y, v) is not called anywhere below. */
const hint = "display.setValue(x, y, v)";
${RGB}`;

const prompt = (code: string, recolor?: boolean) => buildShaderPrompt(code, MATRIX, RAMP, RANGES, recolor);

/** The COLOUR section: what stands between its heading and the next one. */
function colour(text: string): string {
  const heading = "\nCOLOUR\n";
  const start = text.indexOf(heading);
  const end = text.indexOf("\n\nRESOLUTION IS THE WHOLE POINT");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start + heading.length, end);
}

const RAMP_AS_DESCRIBED = "0.000 → #102040, 0.500 → #ff4d00 @ 0.50 alpha, 1.000 → #ffe89a";

describe("the GLSL prompt's COLOUR section", () => {
  it("sends a value-field pattern through ramp(v)", () => {
    const section = colour(prompt(VALUE_FIELD));
    expect(section).toContain("write `fragColor = ramp(v);` wherever the JS calls setValue(x, y, v)");
    expect(section).toContain("DO NOT bake the colours in");
    expect(section).toContain(RAMP_AS_DESCRIBED);
    expect(section).not.toContain("setPixel");
  });

  it("keeps an RGB pattern's own colours", () => {
    const section = colour(prompt(RGB));
    expect(section).toContain("display.setPixel(x, y, r, g, b) in 0..255 sRGB");
    expect(section).toContain("keep the same colours");
    expect(section).not.toContain("fragColor = ramp(");
    expect(section).not.toContain("DO NOT bake the colours in");
  });

  it("reads setValue( in a comment or a string as no call at all", () => {
    expect(colour(prompt(RGB_NAMING_SET_VALUE))).toBe(colour(prompt(RGB)));
    expect(colour(prompt(RGB_NAMING_SET_VALUE, true))).toBe(colour(prompt(RGB, true)));
  });

  it("sends an RGB pattern's luminance through ramp() when the layer has Recolor on", () => {
    const section = colour(prompt(RGB, true));
    expect(section).toContain("the layer has Recolor on");
    // The preview's weights (harness.ts renderFrame), on a colour clamped the
    // way setPixel clamps it.
    expect(section).toContain("vec3 c = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);");
    expect(section).toContain("fragColor = ramp(dot(c, vec3(0.2126, 0.7152, 0.0722)));");
    // A pixel drawn black takes the ramp's colour at 0. A pixel never drawn takes none.
    expect(section).toContain("A pixel the JS draws black is ramp(0.0)");
    expect(section).toContain("write fragColor = vec4(0.0) for it and keep it out of ramp()");
    expect(section).toContain("DO NOT bake the colours in");
    expect(section).toContain(RAMP_AS_DESCRIBED);
    expect(section).not.toContain("keep the same colours");
  });

  it("leaves Recolor out of a value-field pattern's prompt, where the ramp already is the colour", () => {
    expect(prompt(VALUE_FIELD, true)).toBe(prompt(VALUE_FIELD));
  });

  it("takes Recolor as off when it is not given", () => {
    expect(prompt(RGB)).toBe(prompt(RGB, false));
    expect(prompt(RGB)).not.toBe(prompt(RGB, true));
  });
});

describe("the GLSL prompt on which way y runs", () => {
  const forms: [string, string][] = [
    ["a value-field pattern", prompt(VALUE_FIELD)],
    ["an RGB pattern", prompt(RGB)],
    ["an RGB pattern with Recolor on", prompt(RGB, true)],
  ];

  it.each(forms)("tells %s to flip fragCoord.y before it derives a coordinate", (_, text) => {
    const flip = text.indexOf("vec2 p = vec2(fragCoord.x, uResolution.y - fragCoord.y);");
    expect(text).toContain("fragCoord.y grows upward");
    expect(text).toContain("The JS row y corresponds to uResolution.y - fragCoord.y.");
    expect(flip).toBeGreaterThan(-1);
    // The first coordinate the prompt derives is uv, in RESOLUTION.
    expect(flip).toBeLessThan(text.indexOf("vec2 uv = fragCoord / uResolution"));
    expect(text).toContain("where a section below derives one from fragCoord, derive it from p");
  });

  it.each(forms)("keeps the state helpers on the unflipped fragCoord for %s", (_, text) => {
    const feedback = text.slice(text.indexOf("\nFEEDBACK"), text.indexOf("\nALSO\n"));
    expect(feedback).toContain("hand them the entry point's own fragCoord, never the flipped p");
    // One row down the picture is one row back in fragCoord.y.
    expect(feedback).toContain("the JS row y + 1, one row DOWN the picture, is stateOffset(fragCoord, vec2(0.0, -h))");
    expect(feedback).toContain("Read neighbours with stateOffset(fragCoord, vec2(h, 0.0))");
    expect(feedback).toContain("mainImage then reads stateAt(fragCoord) and colours it.");
  });
});
