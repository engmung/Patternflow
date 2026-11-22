// The two C++ conversion prompts: buildCppPrompt for one whole header, and a
// stack's per-layer prompt from buildHExport. Until November 2026 each carried
// its own helper list, DO NOT list and expensive-math table, and they had
// drifted: the layer prompt called sqrtf "cheap on the S3 FPU" while the
// other said it is a call into libm. The shared text is cppRules.ts now, and
// the first half of this file holds the two prompts to it.
//
// The second half is the single prompt against what it was on 22 November
// 2026, commit 1eb0e85. Its sentences were moved, not reworded, and the guide's
// practice AI knows a prompt by lines it contains
// (components/guide/desk/ai/answers.ts). So every change to its fixed text is
// listed below as what it said and what it says. Taking the list back out of
// today's prompt has to give the old text again, to the character: the old
// text's length and sha256 are pinned. An edit to the prompt that is not in
// the list fails that. Add the edit to the list, or drop the pin once the list
// no longer earns its keep.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RAMP_LUT_PLACEHOLDER, bakedRampLut, buildCppPrompt, rampUse } from "./cppPrompt";
import {
  BUTTONS_RULE,
  DO_NOT_REIMPLEMENT,
  HELPER_SIGNATURES_INTRO,
  MEMORY_FIXED_STATE,
  MEMORY_HEADING,
  MEMORY_STATICS,
  NAN_RULES,
  WALL_TIME_RULE,
  canvasClearRule,
  expensiveMath,
  helperSignatures,
  performanceRules,
} from "./cppRules";
import { buildHExport } from "./hExport";
import type { CodeLayer, KnobRange, RampState } from "./types";

const RGB = `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setPixel(x, y, (x * 2) & 255, (y * 4) & 255, 128);
}`;
const FIELD = `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setValue(x, y, (x + y) / (display.width + display.height));
}`;
const WARM: RampState = {
  stops: [
    { position: 0, color: "#081840", alpha: 1 },
    { position: 0.55, color: "#ff4d00", alpha: 0.5 },
    { position: 1, color: "#ffe89a", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};
const KNOBS = [0, 2, 0, 0.06];
const RANGES: KnobRange[] = [[0, 1], [0.1, 10], [0, 4.9], [0, 1]];
const LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];
const PANEL = { width: 128, height: 64 };
const TALL = { width: 64, height: 128 };

const single = (more: Partial<Parameters<typeof buildCppPrompt>[0]> = {}) =>
  buildCppPrompt({ code: RGB, matrix: PANEL, knobs: KNOBS, ranges: RANGES, knobLabels: LABELS, ramp: WARM, name: "My pattern", ...more });

function codeLayer(name: string, code: string, more: Partial<CodeLayer> = {}): CodeLayer {
  return {
    id: name,
    type: "code",
    name,
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    code,
    ramp: WARM,
    recolor: false,
    knobsAnnotationRaw: null,
    matrixAnnotationRaw: null,
    ...more,
  };
}

/** The per-layer prompts of a stack of two, bottom layer first: a value field under RGB. */
const layerPrompts = (matrix = PANEL, top: Partial<CodeLayer> = {}) =>
  buildHExport({
    name: "Stack",
    matrix,
    layers: [codeLayer("Top", RGB, top), codeLayer("Bottom", FIELD)],
    knobs: KNOBS,
    ranges: RANGES,
    knobLabels: LABELS,
  }).units.map((unit) => unit.prompt);

const count = (text: string, part: string) => text.split(part).length - 1;

describe("what both prompts say about the S3", () => {
  const whole = single();
  const [field, rgb] = layerPrompts();

  it.each([
    ["the DO NOT list", DO_NOT_REIMPLEMENT],
    ["the expensive-math table", expensiveMath({ panelTables: true })],
    ["how to call the helpers", HELPER_SIGNATURES_INTRO],
    ["where statics live", `${MEMORY_HEADING}\n${MEMORY_STATICS}`],
    ["how much fixed state is comfortable", MEMORY_FIXED_STATE],
    ["buttons, and the guard on a reset", BUTTONS_RULE],
    ["the wall time", WALL_TIME_RULE],
    ["NaN and infinity", NAN_RULES],
  ])("%s is in the single prompt and in each layer's, once", (_name, text) => {
    for (const prompt of [whole, field, rgb]) expect(count(prompt, text)).toBe(1);
  });

  it("gives a layer the Performance section less the line about LED brightness", () => {
    expect(whole).toContain(performanceRules({ fullBrightness: true }));
    expect(rgb).toContain(performanceRules({ fullBrightness: false }));
    expect(rgb).not.toContain("Keep some pixels near full RGB output");
  });

  it("gives a layer the helpers less PFParams: the scaffold has the knobs", () => {
    expect(whole).toContain(helperSignatures({ params: true, tables: true }));
    expect(rgb).toContain(helperSignatures({ params: false, tables: true }));
    expect(rgb).not.toContain("PFParams::apply(");
    expect(rgb).toContain("knobVal[i]");
  });

  // What the layer prompt went without until the two were made one.
  it.each([
    "PFMath::ifloor(x)",
    "PFMath::floorF(x)",
    "PFMath::fract(x)",
    "PFMath::clamp(x, lo, hi) or PFMath::clamp01(x)",
    "PFMath::jsMod(a, b)",
    "PFColor::sampleRampLerp",
    "cosh/sinh/tanh",
    "input.timeValid / input.hour / input.minute / input.second",
    "!input.paramAbsoluteActive[i]",
  ])("a layer's prompt has %s", (part) => {
    expect(rgb).toContain(part);
    expect(field).toContain(part);
  });

  it("no longer calls sqrtf cheap, in either", () => {
    for (const prompt of [whole, field, rgb]) {
      expect(prompt).not.toContain("cheap on the S3 FPU");
      expect(prompt).toContain("sqrtf is a CALL into libm on this target");
    }
  });

  it("leaves PFTables out of a layer whose frame is not the panel's", () => {
    const [, tall] = layerPrompts(TALL);
    expect(tall).toContain(expensiveMath({ panelTables: false }));
    expect(tall).not.toContain("FIXED panel center (rings");
    expect(tall).not.toContain("float r  = PFTables::rT[");
    expect(tall).toContain("Do NOT use PFTables::rT / PFTables::thetaT.");
    expect(rgb).toContain("so PFTables IS available");
  });
});

describe("what only one of them says", () => {
  const whole = single();
  const [, rgb] = layerPrompts();

  // The preview clears before every draw() and the firmware canvas does not.
  // A layer's buffer is cleared by the scaffold, so only the single file is told.
  it("tells the single file to clear a canvas it does not fill", () => {
    expect(whole).toContain(canvasClearRule(true));
    expect(whole).toContain("make PFCanvas::clear(); the first line of draw()");
    expect(rgb).not.toContain("PFCanvas::clear()");
  });

  it("says setFrame has cleared it already on a frame that is not the panel's", () => {
    const tall = single({ matrix: TALL });
    expect(tall).toContain(canvasClearRule(false));
    expect(tall).toContain("add no PFCanvas::clear() of your own");
    expect(tall).not.toContain("make PFCanvas::clear();");
  });

  it("tells a layer that recolor is the scaffold's, when it is on", () => {
    const [, plain] = layerPrompts();
    const [, recolored] = layerPrompts(PANEL, { recolor: true });
    expect(recolored).toContain("Recolor is on for this layer.");
    expect(plain).not.toContain("Recolor is on for this layer.");
  });

  it("keeps the lines the practice AI knows each prompt by", () => {
    expect(whole.startsWith("Convert the JavaScript LED pattern below into a single complete Arduino-compatible C++ header for the Patternflow ESP32-S3 firmware.")).toBe(true);
    expect(whole).toContain("## JavaScript source");
    expect(rgb.startsWith("Translate ONE LAYER of a Patternflow layer-stack composition from JavaScript to C++ for the ESP32-S3 firmware.")).toBe(true);
  });
});

// fastSqrt, fastInvSqrt and fastSinCos are new in core_math.h and may not all
// stay. Each is offered from one string in cppRules.ts, so taking one out is
// one edit. Emptied, the prompts go without it and nothing here minds.
describe("the three helpers new in core_math.h", () => {
  const rules = fs.readFileSync(path.resolve(__dirname, "cppRules.ts"), "utf8");
  const whole = single();
  const [field, rgb] = layerPrompts();

  it.each(["fastSqrt", "fastInvSqrt", "fastSinCos"])("%s is named in one place in cppRules.ts, and nowhere in the builders", (helper) => {
    expect(count(rules, helper)).toBeLessThanOrEqual(1);
    for (const file of ["cppPrompt.ts", "hExport.ts"]) {
      expect(count(fs.readFileSync(path.resolve(__dirname, file), "utf8"), helper), file).toBe(0);
    }
    const inRules = count(rules, helper);
    for (const prompt of [whole, field, rgb]) expect(count(prompt, `PFMath::${helper}(`)).toBe(inRules);
  });

  it("gives fastPow the error math_test.cpp pins", () => {
    expect(whole).toContain("about 0.006% error");
    expect(whole).not.toContain("~0.1% error");
  });
});

describe("the ramp table", () => {
  it("is in no prompt: a ramp pattern is asked for one placeholder line", () => {
    const value = single({ code: FIELD });
    const recolored = single({ recolor: true });
    for (const prompt of [value, recolored]) {
      expect(count(prompt, `\n    ${RAMP_LUT_PLACEHOLDER}\n`)).toBe(1);
      expect(prompt).not.toMatch(/\{\d+,\d+,\d+\}/);
      expect(prompt).not.toContain("static const uint8_t RAMP_LUT[256][3] = {");
      expect(prompt).toContain(`9. Is the ${RAMP_LUT_PLACEHOLDER} line in the namespace once, with no RAMP_LUT table of my own anywhere`);
      expect(prompt).toContain(`no placeholder text (the one ${RAMP_LUT_PLACEHOLDER} line is the exception)`);
    }
    expect(value).toContain("int li = (int)(PFMath::clamp01(v) * 255.0f + 0.5f);");
    expect(recolored).toContain("int lum = (int)(PFMath::clamp(0.2126f * r + 0.7152f * g + 0.0722f * b, 0.0f, 255.0f) + 0.5f);");
  });

  // scripts/lab-flatten-smoke.ts holds the same line: an RGB pattern's prompt
  // never names the table.
  it("is not named to a pattern that draws its own RGB", () => {
    expect(single()).not.toContain("RAMP_LUT");
    expect(single({ code: FIELD, forceRgb: true })).not.toContain("RAMP_LUT");
  });

  it("is 256 entries of three bytes, with a stop's alpha taken into them", () => {
    const table = bakedRampLut(WARM);
    const lines = table.split("\n");
    expect(lines[0]).toBe("static const uint8_t RAMP_LUT[256][3] = {");
    expect(lines[lines.length - 1]).toBe("};");
    expect(lines).toHaveLength(34);
    const entries = [...table.matchAll(/\{(\d+),(\d+),(\d+)\}/g)].map((m) => m.slice(1).map(Number));
    expect(entries).toHaveLength(256);
    expect(entries[0]).toEqual([8, 24, 64]);
    expect(entries[255]).toEqual([255, 232, 154]);
    // #ff4d00 at half alpha, over the panel's black: 0.55 x 255 is entry 140.
    expect(entries[140][0]).toBeGreaterThan(120);
    expect(entries[140][0]).toBeLessThan(136);
  });

  it("knows which patterns read it", () => {
    expect(rampUse({ code: RGB })).toBeNull();
    expect(rampUse({ code: RGB, recolor: true })).toBe("recolor");
    expect(rampUse({ code: FIELD })).toBe("value");
    // A value field with recolor on is still a value field to this prompt.
    expect(rampUse({ code: FIELD, recolor: true })).toBe("value");
    expect(rampUse({ code: FIELD, forceRgb: true })).toBeNull();
    expect(rampUse({ code: RGB, recolor: true, forceRgb: true })).toBeNull();
  });
});

// ── the single prompt, against 22 November 2026 ──

/** A prompt's fixed text: what is left without the knob lines and the pattern's own JavaScript. */
const fixedText = (prompt: string) =>
  prompt
    .slice(0, prompt.indexOf("## JavaScript source"))
    .split("\n")
    .filter((line) => !line.includes("calibrated encoder step"))
    .join("\n");

/** One change: what the prompt says now, and what it said. An addition said nothing. */
type Change = { why: string; now: string | RegExp; was: string };

const EVERY_PROMPT: Change[] = [
  {
    why: "fastPow's error is the one firmware/toolchain/tests/math_test.cpp pins",
    now: "even with a negative exponent); about 0.006% error",
    was: "even with a negative exponent); ~0.1% error",
  },
  {
    why: "module statics are placed in PSRAM first (firmware/patternflow/src/core_module_memory.h), so the free-heap figures went",
    now: "A pattern is a loadable module: its statics are allocated when the pattern loads and freed when it unloads. They are placed in PSRAM first and take internal RAM only when PSRAM refuses, so a lookup table no longer comes out of the RAM the Wi-Fi stack and the HUB75 DMA driver share.",
    was: "A pattern is a loadable module: its statics are allocated when the pattern loads and freed when it unloads, so they cost nothing while another pattern is running. They come out of internal RAM, which is shared with the Wi-Fi stack and the HUB75 DMA driver — but there is real room now. Measured on a 128×64 board with the pattern resident: **86 KB free with no table, 63 KB left after a 16 KB table, 47 KB after 32 KB, and frame rate identical in every case (62 fps).** A lookup table costs memory and does not cost speed.",
  },
  {
    why: "the same: what 32 KB of statics left of internal RAM",
    now: "(a 4,096-entry float table is 16 KB).\n",
    was: "(a 4,096-entry float table is 16 KB); that leaves ~47 KB free, well clear of the ~10 KB the web console needs to stay responsive. Past ~48 KB the console starts to feel it, so treat that as the ceiling rather than a target.\n",
  },
  {
    why: "the measurements it pointed at are gone",
    now: "(see Memory rules)",
    was: "(see the measurements in Memory rules)",
  },
  {
    why: "a moving centre is offered the new root, whatever cppRules.ts says of it",
    now: /(\| Distance from a MOVING center \| )[^|]*?(sqrtf\(dx\*dx \+ dy\*dy\)\. Note that sqrtf is a CALL)/,
    was: "$1$2",
  },
  {
    why: "a row for normalising a vector, while cppRules.ts offers one",
    now: /\| Normalising a vector [^\n]*\n/,
    was: "",
  },
  {
    why: "sine and cosine of one angle in one call, while cppRules.ts offers it",
    now: /(\(call buildSinLUT\(\) in setup\(\)\)\.)[^|]*?( Full-precision sinf\/cosf only)/,
    was: "$1$2",
  },
  {
    why: "when in doubt about approxLength, the table's row and not sqrtf by name",
    now: "When in doubt, use PFTables::rT (fixed center) or the moving-center row of the table.",
    was: "When in doubt, use PFTables::rT (fixed center) or sqrtf (moving center).",
  },
  {
    why: "float literals and libm names",
    now: /- Every float literal carries an f [^\n]*\n/,
    was: "",
  },
  {
    why: "no divide by a loop-invariant divisor in the pixel loop",
    now: /\n- No float division by a loop-invariant divisor [^\n]*/,
    was: "",
  },
  {
    why: "a LUT index that survives NaN, and an angle wrap that returns",
    now: `${NAN_RULES}\n\n`,
    was: "",
  },
  {
    why: "the self-check says the same about approxLength",
    now: "If not certain, use rT or the moving-center row of the table.",
    was: "If not certain, use rT/sqrtf.",
  },
];

const CLEAR_ON_THE_PANEL: Change = {
  why: "the firmware canvas is not cleared between frames",
  now: `${canvasClearRule(true)}\n`,
  was: "",
};

const CLEAR_OFF_THE_PANEL: Change = {
  why: "setFrame clears a frame that is not the panel's",
  now: `${canvasClearRule(false)}\n`,
  was: "",
};

const PLACEHOLDER_RULES = `Mark where the table goes with this one line, by itself, inside the namespace and right after ABSOLUTE_READY:

    // PF_RAMP_LUT

Pattern Lab replaces that line with the table when the header is pasted back into To hardware: static const uint8_t RAMP_LUT[256][3], one {r, g, b} per entry.

Rules:
- Write the placeholder line once and write NO table yourself: no RAMP_LUT definition and no entries. Write no stop, interpolation or sorting code either. Read RAMP_LUT as if it were declared on that line.
`;

const SELF_CHECK_7: Change = {
  why: "the one placeholder line is allowed",
  now: " (the one // PF_RAMP_LUT line is the exception)",
  was: "",
};

// The old sections held the 256 rows where <the table> stands.
const VALUE_FIELD: Change[] = [
  {
    why: "the table is not pasted for the model to copy back: it asks for a placeholder, and the index clamps",
    now: `## Color ramp (value-field pattern) — PRE-BAKED, Pattern Lab writes the table
This pattern writes a scalar field via display.setValue(x, y, v) with v in 0..1 and has NO color logic of its own. The user's color ramp has already been baked into a 256-entry RGB lookup table (it encodes the stops, per-stop alpha, interpolation mode, and wrap exactly as the web preview renders them over the black panel). You never see that table and never write it.

${PLACEHOLDER_RULES}- In draw(), clamp before indexing. PFMath::clamp01 sends NaN to 0, so li stays inside the table whatever v is:
    int li = (int)(PFMath::clamp01(v) * 255.0f + 0.5f);
`,
    was: `## Color ramp (value-field pattern) — PRE-BAKED, copy verbatim
This pattern writes a scalar field via display.setValue(x, y, v) with v in 0..1 and has NO color logic of its own. The user's color ramp has already been baked into the 256-entry RGB lookup table below (it encodes the stops, per-stop alpha, interpolation mode, and wrap exactly as the web preview renders them over the black panel).

Embed this table in the namespace EXACTLY as given:

<the table>

Rules:
- Copy the table verbatim — do NOT recompute, resample, reorder, shorten, or "optimize" it, and do NOT write any stop/interpolation/sorting code. The table IS the ramp.
- In draw(): clamp v to 0..1, then
    int li = (int)(v * 255.0f + 0.5f);
`,
  },
  SELF_CHECK_7,
  {
    why: "the self-check asks for the placeholder, not the pasted table",
    now: "9. Is the // PF_RAMP_LUT line in the namespace once, with no RAMP_LUT table of my own anywhere, and does",
    was: "9. Did I paste the RAMP_LUT table verbatim (all 256 entries, unchanged), and does",
  },
];

const RECOLOR: Change[] = [
  {
    why: "the same for a recolored RGB pattern",
    now: `## Recolor (RGB pattern through the ramp) — PRE-BAKED, Pattern Lab writes the table
This pattern computes its own RGB colors, and the user has RECOLOR enabled in Pattern Lab: the live preview replaces every drawn pixel's color with ramp[luminance of that color]. Your C++ must do the same or the hardware will not match the preview. The ramp has already been baked into a 256-entry RGB lookup table (per-stop alpha already baked in). You never see that table and never write it.

${PLACEHOLDER_RULES}- Keep ALL of the pattern's own color logic exactly as the JS computes it — the r, g, b it produces drive the lookup. Convert at the write, every time, and clamp before indexing. PFMath::clamp sends NaN to its lower bound, so lum stays inside the table:
    int lum = (int)(PFMath::clamp(0.2126f * r + 0.7152f * g + 0.0722f * b, 0.0f, 255.0f) + 0.5f);
`,
    was: `## Recolor (RGB pattern through the ramp) — PRE-BAKED, copy verbatim
This pattern computes its own RGB colors, and the user has RECOLOR enabled in Pattern Lab: the live preview replaces every drawn pixel's color with ramp[luminance of that color]. Your C++ must do the same or the hardware will not match the preview.

Embed this table in the namespace EXACTLY as given:

<the table>

Rules:
- Copy the table verbatim — do NOT recompute, resample, reorder, shorten, or "optimize" it, and do NOT write any stop/interpolation/sorting code. The table IS the ramp (per-stop alpha already baked in).
- Keep ALL of the pattern's own color logic exactly as the JS computes it — the r, g, b it produces drive the lookup. Convert at the write, every time:
    int lum = (int)(0.2126f * r + 0.7152f * g + 0.0722f * b + 0.5f);
`,
  },
  SELF_CHECK_7,
  {
    why: "the self-check asks for the placeholder, not the pasted table",
    now: "9. Is the // PF_RAMP_LUT line in the namespace once, with no RAMP_LUT table of my own anywhere, does",
    was: "9. Did I paste the RAMP_LUT table verbatim (all 256 entries, unchanged), does",
  },
];

/** Take each change back out of today's text. A change that is not there, or is there twice, fails by name. */
function asItWas(text: string, changes: Change[]): string {
  for (const change of changes) {
    if (typeof change.now === "string") {
      expect(count(text, change.now), change.why).toBe(1);
      text = text.replace(change.now, () => change.was);
    } else {
      // An offer cppRules.ts no longer makes leaves nothing to take out.
      expect(text.match(new RegExp(change.now.source, "g"))?.length ?? 0, change.why).toBeLessThanOrEqual(1);
      text = text.replace(change.now, change.was);
    }
  }
  return text;
}

describe("the single prompt against 22 November 2026", () => {
  it.each([
    {
      name: "an RGB pattern on the panel",
      prompt: single(),
      changes: [...EVERY_PROMPT, CLEAR_ON_THE_PANEL],
      length: 18312,
      sha256: "31de9508071786be247492c9f4d9e8eb998170e6cb46926ca41cdadd7aa22a8f",
    },
    {
      name: "a value field on the panel",
      prompt: single({ code: FIELD }),
      changes: [...EVERY_PROMPT, CLEAR_ON_THE_PANEL, ...VALUE_FIELD],
      length: 19752,
      sha256: "2e716e338e4d372a4900747859076d80e368512ff21c861a3a0bbb95c0357a6a",
    },
    {
      name: "a recolored RGB pattern on a 64 × 128 frame",
      prompt: single({ matrix: TALL, recolor: true }),
      changes: [...EVERY_PROMPT, CLEAR_OFF_THE_PANEL, ...RECOLOR],
      length: 21406,
      sha256: "91b9b266f62c6870b83cd5d82dc0058d7d9071af451773f62c033ea49d39338c",
    },
  ])("$name: differs from it by the listed changes and nothing else", ({ prompt, changes, length, sha256 }) => {
    const was = asItWas(fixedText(prompt), changes);
    expect(was.length).toBe(length);
    expect(createHash("sha256").update(was).digest("hex")).toBe(sha256);
  });

  // The whole prompt for the Lab's opening pattern went from 25,878 characters
  // to 24,982, and the answer no longer carries its 3,394-character table
  // back. Here, with a five-line value field, 23,638 characters became 22,946:
  // the table was 3,190 of them, and the rules added in the same change come
  // to 2,009. The sizes below are bounds and not those numbers, so an offer in
  // cppRules.ts can be reworded or taken out without a visit here.
  it("is shorter for a ramp pattern, though it says more", () => {
    expect(bakedRampLut(WARM).length).toBeGreaterThan(3000);
    expect(single({ code: FIELD }).length).toBeLessThan(23638);
    expect(single().length).toBeGreaterThan(19010);
  });
});
