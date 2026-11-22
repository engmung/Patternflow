// The scaffold buildHExport writes for a layer stack has to compile before a
// single layer is translated. The stubs draw black, and everything around
// them is finished C++. Until 24 October 2026 two things in it stopped g++.
// A knob that only became a whole number once rounded to five places came out
// as `63f`, which C++ reads as 63 with a literal suffix nobody defined. The
// Director leaves a 0..360 knob there at bus value 175 of 1000
// (62.99999999999999). And a backslash at the end of the pattern name or a
// knob label escaped the closing quote.
//
// Since November 2026 the file also holds the scaffold to three things. NAME
// keeps the 39 characters the firmware keeps. The composite divides nothing in
// its pixel loop, and reads a byte over 255 from a table whose entries are the
// quotients the divide gave. And a pasted one-layer header gets its ramp table
// from the lab, where the model left a placeholder for it.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MODULE_NAME_BYTES } from "@/lib/guide/panelScreens";
import { BUS_WIRE_MAX } from "@/lib/pattern/controls";
import { bakedRampLut, buildCppPrompt } from "./cppPrompt";
import { CXX, cxxFlags, writeStubs } from "./cxxHarness";
import { buildHExport, enforcePatternName, injectRampLut, type HExportArgs } from "./hExport";
import { DEFAULT_RAMP_STATE, createPixelLayer, type CodeLayer, type KnobRange, type Layer, type RampState } from "./types";

const FRAME = { width: 128, height: 64 };
const RANGES: KnobRange[] = [[0, 360], [0, 100], [0, 1], [0, 1]];

/** The knob the Director's transport sets for a bus value (lib/lab/director/transport.ts). */
const fromBus = (v: number, range: KnobRange) => range[0] + (v / BUS_WIRE_MAX) * (range[1] - range[0]);

// 62.99999999999999, 7.000000000000001, a value that rounds to 0, and one
// that was always fine.
const KNOBS = [fromBus(175, RANGES[0]), fromBus(70, RANGES[1]), 0.000001, 0.5];

function codeLayer(name: string): CodeLayer {
  return {
    id: name,
    type: "code",
    name,
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    code: "export function draw(display) {}",
    ramp: DEFAULT_RAMP_STATE,
    recolor: false,
    knobsAnnotationRaw: null,
    matrixAnnotationRaw: null,
  };
}

// A code layer over pixel art, so the header is the scaffold and not one
// translated pattern. The names end in a backslash too: they land in comments.
function stack(): Layer[] {
  const art = createPixelLayer(FRAME, "Under\\");
  art.data.set([255, 0, 0, 255], 0);
  return [codeLayer("Top\\"), { ...art, name: "Under\\" }];
}

function scaffold(overrides: Partial<HExportArgs> = {}) {
  return buildHExport({
    name: "Lab",
    matrix: FRAME,
    layers: stack(),
    knobs: KNOBS,
    ranges: RANGES,
    knobLabels: ["Hue", "Speed", "Mode", "Freq"],
    ...overrides,
  });
}

describe("numbers in the scaffold", () => {
  it("writes a knob that rounds to a whole number as a float literal", () => {
    expect(KNOBS[0]).not.toBe(63);
    expect(KNOBS[1]).not.toBe(7);
    const { scaffold: text } = scaffold();
    expect(text).toContain("static float knobVal[4]  = {63.0f, 7.0f, 0.0f, 0.5f};");
    expect(text).toContain("static float knobNorm[4] = {0.175f, 0.07f, 0.0f, 0.5f};");
  });

  it("has no digits ending in a bare f", () => {
    const { scaffold: text } = scaffold();
    expect(text.match(/(?<![\w.])\d+f\b/g)).toBeNull();
  });
});

describe("names in the scaffold", () => {
  const name = 'Say "hi" AC\\';
  const knobLabels = ["Speed\\", 'Big "C"', "C", "D"];
  /** Sixty characters: the most the Lab's own name box takes. */
  const SIXTY = "Sixty characters, as many as the Lab's name box takes".padEnd(60, ".");

  it("leaves the quotes and backslashes out of NAME and the knob labels", () => {
    const { scaffold: text } = scaffold({ name, knobLabels });
    expect(text).toContain('const char* NAME = "Say hi AC";');
    expect(text).toContain('const char* const KNOB_LABELS[4] = {"Speed", "Big C", "C", "D"};');
  });

  it("names the pattern as a one-layer header does", () => {
    const { scaffold: text } = scaffold({ name, knobLabels });
    expect(text).toContain(enforcePatternName('const char* NAME = "Placeholder";', name));
  });

  // A show finds its pattern by NAME, compared whole, and the firmware keeps
  // 39 characters of it (MODULE_NAME_BYTES, pattern_registry.h). The scaffold
  // cut at 24, so the show's cue for a 30-character name found nothing.
  it("keeps the 39 characters of a name the firmware keeps", () => {
    expect(MODULE_NAME_BYTES - 1).toBe(39);
    const thirty = "Thirty characters of a pattern";
    expect(thirty).toHaveLength(30);
    expect(scaffold({ name: thirty }).scaffold).toContain(`const char* NAME = "${thirty}";`);

    expect(SIXTY).toHaveLength(60);
    const { scaffold: text } = scaffold({ name: SIXTY });
    expect(text).toContain(`const char* NAME = "${SIXTY.slice(0, MODULE_NAME_BYTES - 1)}";`);
    expect(text).not.toContain(`NAME = "${SIXTY.slice(0, MODULE_NAME_BYTES)}`);
  });

  // The firmware cuts a one-layer header's NAME itself. The lab must not cut it shorter.
  it("has no cut of its own on the one-layer path", () => {
    expect(enforcePatternName('const char* NAME = "Placeholder";', SIXTY)).toBe(`const char* NAME = "${SIXTY}";`);
    const prompt = buildCppPrompt({
      code: "export function draw(display) { display.setPixel(0, 0, 255, 0, 0); }",
      matrix: FRAME,
      knobs: KNOBS,
      ranges: RANGES,
      knobLabels: ["Hue", "Speed", "Mode", "Freq"],
      ramp: DEFAULT_RAMP_STATE,
      name: SIXTY,
    });
    expect(prompt).toContain(`const char* NAME = "${SIXTY}";`);
  });
});

// On the S3 a float divide by 255 is a call into __divsf3. The composite made
// one for every paint layer on every pixel, three more in multiply and screen,
// and one in a code mask's test.
describe("the composite in the scaffold", () => {
  it("divides nothing in draw(), and reads a byte over 255 from the table", () => {
    const { scaffold: text } = scaffold();
    // The last draw() is the scaffold's own. The one before it is a layer's stub.
    const draw = text.slice(text.lastIndexOf("void draw()"));
    expect(draw).toContain("// Composite bottom → top");
    expect(draw).not.toMatch(/\/ ?255/);
    expect(draw).toContain("const float a = OVER_255.v[p[3]] * G_OPACITY[gi];");
    expect(draw).toContain("cr = cr * inv + (cr * OVER_255.v[p[0]]) * a;");
    expect(draw).toContain("cr = cr * inv + (255.0f - (255.0f - cr) * OVER_255.v[255 - p[0]]) * a;");
    expect(text).toContain("constexpr ByteOver255() : v() { for (int i = 0; i < 256; i++) v[i] = i / 255.0f; }");
  });

  it("tests a code mask with both sides times 255", () => {
    const { scaffold: text } = scaffold();
    expect(text).toContain("* p[3] >= 127.5f * 255.0f;");
    expect(text).not.toContain("p[3] / 255.0f");
  });
});

// ── the ramp table in a pasted header ──

const VALUE_CODE = "export function draw(display) { display.setValue(0, 0, 0.5); }";
const RGB_CODE = "export function draw(display) { display.setPixel(0, 0, 255, 0, 0); }";
const WARM: RampState = {
  stops: [
    { position: 0, color: "#081840", alpha: 1 },
    { position: 0.55, color: "#ff4d00", alpha: 0.5 },
    { position: 1, color: "#ffe89a", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};
const TABLE = bakedRampLut(WARM);
const VALUE = { code: VALUE_CODE, ramp: WARM };

/** A one-layer header as a model writes it, with `where` on the line the table belongs on. */
const pasted = (where: string) => `// Pattern: Wave
#pragma once
#include <Arduino.h>
#include "src/core_canvas.h"

namespace Wave {

const char* NAME = "Wave";
constexpr bool ABSOLUTE_READY = true;
${where}

void draw() {
  for (int x = 0; x < 128; x++) {
    const int li = x * 2;
    PFCanvas::setPixel(x, 0, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
  }
  PFCanvas::present();
}

} // namespace Wave`;

const definitions = (text: string) => text.split("RAMP_LUT[256][3] = {").length - 1;

describe("the ramp table in a pasted one-layer header", () => {
  it("takes the placeholder's place", () => {
    expect(injectRampLut(pasted("// PF_RAMP_LUT"), VALUE)).toBe(pasted(TABLE));
  });

  it.each([
    ["with words after it", "// PF_RAMP_LUT (Pattern Lab writes the table here)"],
    ["without the space", "//PF_RAMP_LUT"],
    ["as a block comment", "/* PF_RAMP_LUT */"],
  ])("knows the placeholder %s", (_name, line) => {
    expect(injectRampLut(pasted(line), VALUE)).toBe(pasted(TABLE));
  });

  it("keeps the placeholder's indent on every line of the table", () => {
    const indented = TABLE.split("\n").map((line) => `  ${line}`).join("\n");
    expect(injectRampLut(pasted("  // PF_RAMP_LUT"), VALUE)).toBe(pasted(indented));
  });

  // The model never saw the bytes, so a table it wrote is a guess, whole or cut short.
  it.each([
    ["cut short", "static const uint8_t RAMP_LUT[256][3] = {\n  {8,24,64},{9,24,63},\n  // ... 254 more entries ...\n};"],
    ["whole and wrong", `static const uint8_t RAMP_LUT[256][3] = {\n${"  {1,2,3},\n".repeat(256)}};`],
    ["declared another way", "const unsigned char RAMP_LUT[256][3] PROGMEM = { {0,0,0} };"],
  ])("replaces a table the answer wrote itself: %s", (_name, own) => {
    expect(injectRampLut(pasted(own), VALUE)).toBe(pasted(TABLE));
  });

  it("goes in where the namespace opens when the header reads a table it never declares", () => {
    const header = pasted("");
    const out = injectRampLut(header, VALUE);
    expect(out).toBe(header.replace("namespace Wave {\n", `namespace Wave {\n${TABLE}\n`));
    expect(out.indexOf(TABLE)).toBeLessThan(out.indexOf("RAMP_LUT[li][0]"));
  });

  it("leaves one definition when the answer wrote the placeholder and a table", () => {
    const out = injectRampLut(pasted("// PF_RAMP_LUT\nstatic const uint8_t RAMP_LUT[256][3] = { {1,2,3} };"), VALUE);
    expect(definitions(out)).toBe(1);
    expect(out).toContain(TABLE);
    expect(out).not.toContain("{1,2,3}");
    expect(out).not.toContain("PF_RAMP_LUT");
  });

  it("writes it for a recolored RGB pattern too", () => {
    expect(injectRampLut(pasted("// PF_RAMP_LUT"), { code: RGB_CODE, ramp: WARM, recolor: true })).toBe(pasted(TABLE));
  });

  it("gives the same header when it is pasted a second time", () => {
    const once = injectRampLut(pasted("// PF_RAMP_LUT"), VALUE);
    expect(injectRampLut(once, VALUE)).toBe(once);
    // And follows the ramp: the table is the lab's, not the header's.
    const cooler = { ...VALUE, ramp: { ...WARM, stops: WARM.stops.map((stop) => ({ ...stop, color: "#3fa7ff" })) } };
    expect(injectRampLut(once, cooler)).toBe(pasted(bakedRampLut(cooler.ramp)));
  });

  it("keeps a pasted header's CRLF line ends", () => {
    const out = injectRampLut(pasted("// PF_RAMP_LUT").replace(/\n/g, "\r\n"), VALUE);
    expect(out).toBe(pasted(TABLE).replace(/\n/g, "\r\n"));
  });

  it.each([
    ["a pattern that reads no ramp", pasted("// PF_RAMP_LUT"), { code: RGB_CODE, ramp: WARM }],
    ["a flattened stack, whose tables are its own", pasted("// PF_RAMP_LUT"), { code: VALUE_CODE, ramp: WARM, forceRgb: true }],
    ["a header that never names the table", "#pragma once\nnamespace Wave {\n  void draw() {}\n}\n", VALUE],
    ["a header that declares it in another shape", pasted("static const uint8_t RAMP_LUT[768] = { 0 };"), VALUE],
    ["a header with no namespace to put it in", "#pragma once\nvoid draw() { PFCanvas::setPixel(0, 0, RAMP_LUT[0][0], 0, 0); }\n", VALUE],
  ])("leaves %s as it was pasted", (_name, header, pattern) => {
    expect(injectRampLut(header, pattern)).toBe(header);
  });
});

// GitHub's runners have g++, so the compiler half runs there.
if (!CXX && process.env.CI) throw new Error("no C++ compiler on this runner, and the header test needs one");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!CXX)("the scaffold through the compiler", () => {
  it("builds with the knobs and names above, and the program reads them back", () => {
    const built = scaffold({ name: "AC\\", knobLabels: ["Speed\\", "B", "C", "D"] });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hexport-"));
    dirs.push(dir);
    writeStubs(dir);
    fs.writeFileSync(path.join(dir, "Lab.h"), built.scaffold);
    const ns = built.namespaceName;
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include <stdio.h>
#include "Lab.h"

int main() {
  printf("%s|%s|%g|%g|%g|%g\\n", ${ns}::NAME, ${ns}::KNOB_LABELS[0],
         ${ns}::knobVal[0], ${ns}::knobVal[1], ${ns}::knobVal[2], ${ns}::knobVal[3]);
  return 0;
}
`,
    );
    const binary = path.join(dir, "lab");
    execFileSync(CXX!, [...cxxFlags(dir), "main.cpp", "-o", binary], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    expect(execFileSync(binary, { encoding: "utf8" }).trim()).toBe("AC|Speed|63|7|0|0.5");
  });

  // The table is worked out by the compiler, and the divide it replaces ran on
  // the chip. They have to be the same 256 floats, or alpha moves by a bit.
  it("its table of bytes over 255 holds what the divide gives", () => {
    const built = scaffold();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hexport-"));
    dirs.push(dir);
    writeStubs(dir);
    fs.writeFileSync(path.join(dir, "Lab.h"), built.scaffold);
    const ns = built.namespaceName;
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include <stdio.h>
#include "Lab.h"

int main() {
  int off = 0;
  for (int i = 0; i < 256; i++) {
    volatile float byte = (float)i;
    if (${ns}::OVER_255.v[i] != byte / 255.0f) off++;
  }
  printf("%d of 256 differ, and 255 over 255 is %g\\n", off, ${ns}::OVER_255.v[255]);
  return 0;
}
`,
    );
    const binary = path.join(dir, "table");
    execFileSync(CXX!, [...cxxFlags(dir), "main.cpp", "-o", binary], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    expect(execFileSync(binary, { encoding: "utf8" }).trim()).toBe("0 of 256 differ, and 255 over 255 is 1");
  });

  // A header the way a model returns it for a value field: the placeholder
  // where the table goes, and the index clamped as the prompt asks. With the
  // table put in it builds, and it lights the bytes the lab baked.
  it("builds a pasted header once its ramp table is in, and draws the lab's bytes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hexport-"));
    dirs.push(dir);
    writeStubs(dir);
    const header = `#pragma once
#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_params.h"
#include "src/core_math.h"

namespace Wave {

const char* NAME = "Wave";
const char* const KNOB_LABELS[4] = {"-", "-", "-", "-"};
constexpr bool ABSOLUTE_READY = true;
// PF_RAMP_LUT

void setup() {}
void update(float dt, const InputFrame& input) { (void)dt; (void)input; }
void draw() {
  for (int x = 0; x < PANEL_RES_W; x++) {
    // 0, 2, 4 and on to 248, then NaN, 2 and -1 in the last three columns.
    const float v = x == 125 ? NAN : x == 126 ? 2.0f : x == 127 ? -1.0f : (x * 2) / 255.0f;
    int li = (int)(PFMath::clamp01(v) * 255.0f + 0.5f);
    PFCanvas::setPixel(x, 0, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
  }
  PFCanvas::present();
}

} // namespace Wave`;
    expect(header).not.toContain("RAMP_LUT[256][3]");
    fs.writeFileSync(path.join(dir, "Wave.h"), injectRampLut(header, VALUE));
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include <stdio.h>
#include "Wave.h"

int main() {
  Wave::setup();
  Wave::draw();
  for (int x = 0; x < PANEL_RES_W; x++) printf("%d,%d,%d ", PFCanvas::frame[x * 3], PFCanvas::frame[x * 3 + 1], PFCanvas::frame[x * 3 + 2]);
  return 0;
}
`,
    );
    const binary = path.join(dir, "wave");
    execFileSync(CXX!, [...cxxFlags(dir), "main.cpp", "-o", binary], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    const drawn = execFileSync(binary, { encoding: "utf8" }).trim().split(" ");
    const entries = [...TABLE.matchAll(/\{(\d+,\d+,\d+)\}/g)].map((m) => m[1]);
    expect(entries).toHaveLength(256);
    for (let x = 0; x < 125; x++) expect(drawn[x], `column ${x}`).toBe(entries[x * 2]);
    // clamp01 sends NaN and -1 to entry 0, and 2 to entry 255.
    expect(drawn.slice(125)).toEqual([entries[0], entries[255], entries[0]]);
  });
});
