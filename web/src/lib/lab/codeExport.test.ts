// A code layer on its way to the device, through the two functions the
// scaffold gives it: L<i>_setPixel and L<i>_setValue. textExport.test.ts holds
// the header to the preview for text and pixel art, with one code layer that
// only ever paints. Here the code layers do what those cases leave out. They
// recolor, they draw a value field, they are masks, and they sit on multiply
// and screen.
//
// Recolor is the reason. Until November 2026 the scaffold drew a layer and
// then walked its whole buffer again to recolor it. It recolors at the write
// now, and a value field on a recolored layer reads a second table, the ramp
// taken twice (hExport.ts, rampTwice). That is what the preview does to such
// a layer: its recolor pass runs after every draw(), value field or not, so
// the value's ramp colour goes through the ramp again. These cases hold the
// header to it, LED for LED.
//
// Each layer's C++ is written by hand next to its JavaScript, the way the To
// hardware window's paste box takes it. The numbers are whole on both sides,
// and the opacities have odd denominators, so no channel lands on half a step
// (textExport.test.ts says why that matters).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PatternRuntime, buildRampLUTRGBA, createIdleInput } from "@/lib/pattern/harness";
import type { MatrixSize } from "@/lib/pattern/matrix";
import { CXX, cxxFlags, writeStubs } from "./cxxHarness";
import { LabEngine, rampStateToHarness } from "./engine";
import { flattenLayers } from "./flatten";
import { assembleH, buildHExport, rampTwice } from "./hExport";
import { DEFAULT_RAMP_STATE, createPixelLayer, type CodeLayer, type Layer, type PixelLayer, type RampState } from "./types";

const FRAME: MatrixSize = { width: 32, height: 16 };
const RANGES: Array<[number, number]> = [[0, 1], [0, 1], [0, 1], [0, 1]];
const KNOBS = [0, 0, 0, 0];

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Pixel art under the code: random colour, a third of it clear, some of it half there. */
function artLayer(id: string, seed: number): PixelLayer {
  const next = random(seed);
  const layer = createPixelLayer(FRAME, id);
  for (let i = 0; i < FRAME.width * FRAME.height; i++) {
    const roll = next();
    if (roll < 0.33) continue;
    layer.data.set(
      [Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256), roll < 0.5 ? Math.floor(next() * 256) : 255],
      i * 4,
    );
  }
  return { ...layer, id, name: id };
}

// ── the layers, in JavaScript and in C++ ──

type Twin = { js: string; cpp: (index: number) => string };

const twin = (js: string, cpp: (L: string) => string): Twin => ({
  js: `export function draw(display) {
  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
${js}
    }
  }
}`,
  cpp: (index) => `namespace L${index} {
  void setup() {}
  void update(float dt, const InputFrame& input) { (void)dt; (void)input; }
  void draw() {
    for (int y = 0; y < FRAME_H; y++) {
      for (int x = 0; x < FRAME_W; x++) {
${cpp(`L${index}`)}
      }
    }
  }
}`,
});

/** RGB on every pixel. */
const STRIPES = twin(
  "      display.setPixel(x, y, (x * 16) & 255, (y * 32) & 255, 128);",
  (L) => `        ${L}_setPixel(x, y, (x * 16) & 255, (y * 32) & 255, 128);`,
);

/** RGB on one pixel in three: the rest is never written. */
const DOTS = twin(
  `      if ((x + y) % 3 !== 0) continue;
      display.setPixel(x, y, (x * 8) & 255, 255 - y * 16, (x * y * 5) & 255);`,
  (L) => `        if ((x + y) % 3 != 0) continue;
        ${L}_setPixel(x, y, (x * 8) & 255, 255 - y * 16, (x * y * 5) & 255);`,
);

/** A value on every pixel, 127 and 128 among them: both sides of a mask's half. */
const FIELD = twin(
  "      display.setValue(x, y, ((x * 7 + y * 13) % 256) / 255);",
  (L) => `        ${L}_setValue(x, y, ((x * 7 + y * 13) % 256) / 255.0f);`,
);

/** A value field with holes in it, and the values a display has to survive: NaN, 2 and -1. */
const RAGGED = twin(
  `      if ((x + 2 * y) % 5 === 0) continue;
      const k = (x * 11 + y * 3) % 256;
      display.setValue(x, y, x === 3 ? NaN : x === 4 ? 2 : x === 5 ? -1 : k / 255);`,
  (L) => `        if ((x + 2 * y) % 5 == 0) continue;
        const int k = (x * 11 + y * 3) % 256;
        ${L}_setValue(x, y, x == 3 ? NAN : x == 4 ? 2.0f : x == 5 ? -1.0f : k / 255.0f);`,
);

/** Values on the even columns and RGB on the odd ones, from one layer. */
const BOTH = twin(
  `      if (x % 2 === 0) display.setValue(x, y, ((x + y * 5) % 256) / 255);
      else display.setPixel(x, y, (x * 8) & 255, (y * 16) & 255, 200);`,
  (L) => `        if (x % 2 == 0) ${L}_setValue(x, y, ((x + y * 5) % 256) / 255.0f);
        else ${L}_setPixel(x, y, (x * 8) & 255, (y * 16) & 255, 200);`,
);

// ── the ramps ──

// Clear below a fifth and half there at three fifths. Recolor has entries with
// no alpha to leave alone, and an alpha to carry over.
const FADE: RampState = {
  stops: [
    { position: 0, color: "#101040", alpha: 0 },
    { position: 0.2, color: "#2030c0", alpha: 0 },
    { position: 0.6, color: "#ff4d00", alpha: 0.5 },
    { position: 1, color: "#ffe89a", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};

const WARM: RampState = {
  stops: [
    { position: 0, color: "#081840", alpha: 1 },
    { position: 0.55, color: "#ff4d00", alpha: 1 },
    { position: 1, color: "#ffe89a", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};

/** White all the way, from clear to solid: a mask that turns on its alpha alone. */
const GHOST: RampState = {
  stops: [
    { position: 0, color: "#ffffff", alpha: 0 },
    { position: 1, color: "#ffffff", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};

// ── the stacks ──

const TWINS = new Map<string, Twin>();

function code(id: string, source: Twin, ramp: RampState, more: Partial<CodeLayer> = {}): CodeLayer {
  TWINS.set(id, source);
  return {
    id,
    type: "code",
    name: id,
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    code: source.js,
    ramp,
    recolor: false,
    knobsAnnotationRaw: null,
    matrixAnnotationRaw: null,
    ...more,
  };
}

/** A stack, top layer first as the Layers panel has it. */
type Case = { name: string; layers: Layer[] };

const CASES: Case[] = [
  {
    name: "RecolorAtTheWrite",
    layers: [code("Stripes1", STRIPES, FADE, { recolor: true, opacity: 0.8 }), artLayer("Art1", 101)],
  },
  {
    name: "RecolorLeavesHoles",
    layers: [code("Dots2", DOTS, WARM, { recolor: true, blend: "add", opacity: 0.6 }), artLayer("Art2", 102)],
  },
  {
    name: "ValueTwice",
    layers: [code("Field3", FIELD, FADE, { recolor: true, blend: "screen", opacity: 0.8 }), artLayer("Art3", 103)],
  },
  {
    name: "ValueTwiceRagged",
    layers: [code("Ragged4", RAGGED, FADE, { recolor: true }), artLayer("Art4", 104)],
  },
  {
    name: "ValueOnce",
    layers: [code("Ragged5", RAGGED, FADE, { blend: "multiply", opacity: 0.6 }), artLayer("Art5", 105)],
  },
  {
    name: "BothWrites",
    layers: [code("Both6", BOTH, WARM, { recolor: true }), artLayer("Art6", 106)],
  },
  {
    name: "ValueMask",
    layers: [code("Mask7", FIELD, DEFAULT_RAMP_STATE, { role: "mask" }), code("Stripes7", STRIPES, DEFAULT_RAMP_STATE)],
  },
  {
    name: "AlphaMaskInverted",
    layers: [code("Mask8", FIELD, GHOST, { role: "mask", maskInvert: true }), artLayer("Art8", 108)],
  },
  {
    name: "RecolorMask",
    layers: [code("Mask9", STRIPES, DEFAULT_RAMP_STATE, { role: "mask", recolor: true }), artLayer("Art9", 109)],
  },
  {
    name: "ValueTwiceMask",
    layers: [code("Mask10", FIELD, FADE, { role: "mask", recolor: true }), artLayer("Art10", 110)],
  },
  {
    name: "ScreenOverMultiply",
    layers: [
      code("Stripes11", STRIPES, DEFAULT_RAMP_STATE, { blend: "screen", opacity: 0.8 }),
      code("Field11", FIELD, WARM, { blend: "multiply", opacity: 0.6 }),
      artLayer("Art11", 111),
    ],
  },
];

function preview(entry: Case): Uint8ClampedArray {
  return new LabEngine()
    .render({ matrix: FRAME, layers: entry.layers, activeLayerId: entry.layers[0].id, knobs: KNOBS, ranges: RANGES }, 1 / 60, 0)
    .data.slice();
}

function exportedJs(entry: Case): Uint8ClampedArray {
  const runtime = new PatternRuntime(FRAME.width, FRAME.height);
  expect(runtime.loadCode(flattenLayers(entry.layers, FRAME)).error).toBeUndefined();
  const input = createIdleInput(KNOBS, { knobValues: KNOBS, knobNormalized: KNOBS, knobRanges: RANGES });
  expect(runtime.renderFrame(1 / 60, 0, input).error).toBeUndefined();
  return runtime.data.slice();
}

/** The first pixel that differs, as a sentence, or null. RGB only: the panel has no alpha. */
function firstDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): string | null {
  for (let i = 0; i < a.length / 4; i++) {
    for (let c = 0; c < 3; c++) {
      if (a[i * 4 + c] !== b[i * 4 + c]) {
        return `(${i % FRAME.width}, ${Math.floor(i / FRAME.width)}): ${Array.from(a.subarray(i * 4, i * 4 + 3))} against ${Array.from(b.subarray(i * 4, i * 4 + 3))}`;
      }
    }
  }
  return null;
}

// ── what each case is there to show ──

describe("the stacks themselves", () => {
  const lit = (data: Uint8ClampedArray) => data.some((byte, i) => (i & 3) !== 3 && byte > 0);

  it.each(CASES.map((entry) => [entry.name, entry] as const))("%s: lights something", (_name, entry) => {
    expect(lit(preview(entry))).toBe(true);
  });

  it("recolor changes what a layer shows, on a colour and on a value", () => {
    for (const name of ["RecolorAtTheWrite", "ValueTwice", "BothWrites"]) {
      const entry = CASES.find((each) => each.name === name)!;
      const off: Case = { ...entry, layers: entry.layers.map((layer) => (layer.type === "code" ? { ...layer, recolor: false } : layer)) };
      expect(firstDifference(preview(entry), preview(off)), name).not.toBeNull();
    }
  });
});

describe("a ramp taken twice", () => {
  // The preview, asked directly: 256 values in a row on a layer with recolor on.
  it.each([["a ramp with clear entries", FADE], ["a solid ramp", WARM], ["black to white", DEFAULT_RAMP_STATE]] as const)(
    "is what the preview shows for a value field with recolor on: %s",
    (_name, ramp) => {
      const runtime = new PatternRuntime(256, 1);
      runtime.setRamp(rampStateToHarness(ramp));
      runtime.recolor = true;
      expect(
        runtime.loadCode("export function draw(display) { for (let x = 0; x < 256; x++) display.setValue(x, 0, x / 255); }").error,
      ).toBeUndefined();
      expect(runtime.renderFrame(1 / 60, 0, createIdleInput(KNOBS)).error).toBeUndefined();
      const twice = rampTwice(buildRampLUTRGBA(rampStateToHarness(ramp)));
      expect(Array.from(runtime.data)).toEqual(Array.from(twice));
    },
  );

  it("leaves an entry with no alpha as it was, and moves the others", () => {
    const once = buildRampLUTRGBA(rampStateToHarness(FADE));
    const twice = rampTwice(once);
    // Entry 20 sits in the clear fifth. Entry 255 is #ffe89a, and its
    // luminance is 54.2 + 165.9 + 11.1, which rounds to 231.
    expect(once[20 * 4 + 3]).toBe(0);
    expect(Array.from(twice.subarray(20 * 4, 21 * 4))).toEqual(Array.from(once.subarray(20 * 4, 21 * 4)));
    expect(Array.from(once.subarray(255 * 4, 256 * 4))).toEqual([255, 232, 154, 255]);
    expect(Array.from(twice.subarray(255 * 4, 256 * 4))).toEqual(Array.from(once.subarray(231 * 4, 232 * 4)));
    expect(Array.from(twice)).not.toEqual(Array.from(once));
  });
});

describe("a code layer in the flattened JS", () => {
  it.each(CASES.map((entry) => [entry.name, entry] as const))("%s: same pixels as the preview", (_name, entry) => {
    expect(firstDifference(preview(entry), exportedJs(entry))).toBeNull();
  });
});

describe("a recolored layer in the scaffold", () => {
  const scaffoldOf = (name: string) =>
    buildHExport({ name, matrix: FRAME, layers: CASES.find((entry) => entry.name === name)!.layers, knobs: KNOBS, ranges: RANGES, knobLabels: ["A", "B", "C", "D"] }).scaffold;

  it("recolors where the layer writes, and has no second pass", () => {
    const text = scaffoldOf("RecolorAtTheWrite");
    expect(text).not.toContain("recolorBuffer");
    expect(text).toContain("const uint8_t* c = L1_RAMP[lum];");
    expect(text).toContain("const uint8_t* c = L1_RAMP_TWICE[(int)(v * 255.0f + 0.5f)];");
    // Between two frames the only thing that touches the buffer is the memset and the layer.
    expect(text).toMatch(/memset\(layerBuf\[1\], 0, \(size_t\)PIX_N \* 4\);\n {2}L1::draw\(\);\n\n {2}\/\/ Composite/);
  });

  it("leaves a layer with recolor off as it was", () => {
    const text = scaffoldOf("ValueOnce");
    expect(text).not.toContain("_RAMP_TWICE");
    expect(text).toContain("const uint8_t* c = L1_RAMP[(int)(v * 255.0f + 0.5f)];");
    expect(text).toContain("p[0] = r; p[1] = g; p[2] = b; p[3] = 255;");
  });
});

// ── the C++ header ──

// GitHub's runners have g++. A desk without a compiler skips the header half;
// CI does not get to.
if (!CXX && process.env.CI) throw new Error("no C++ compiler on this runner, and the header test needs one");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Every case's header in one program: build once, print each frame as hex. */
function runHeaders(cases: Case[]): Map<string, Uint8ClampedArray> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-code-header-"));
  dirs.push(dir);
  writeStubs(dir);

  const namespaces = cases.map((entry) => {
    const built = buildHExport({ name: entry.name, matrix: FRAME, layers: entry.layers, knobs: KNOBS, ranges: RANGES, knobLabels: ["A", "B", "C", "D"] });
    const units: Record<number, string> = {};
    for (const unit of built.units) units[unit.index] = TWINS.get(unit.name)!.cpp(unit.index);
    const header = assembleH(built.scaffold, units);
    // Every code layer has its translation: no stub is left to draw black.
    expect(header).not.toContain("STUB");
    fs.writeFileSync(path.join(dir, `${entry.name}.h`), header);
    return built.namespaceName;
  });

  fs.writeFileSync(
    path.join(dir, "main.cpp"),
    `#include <stdio.h>
${cases.map((entry) => `#include "${entry.name}.h"`).join("\n")}

static void dump(const char* name) {
  printf("%s ", name);
  for (int i = 0; i < PFCanvas::frameW * PFCanvas::frameH * 3; i++) printf("%02x", PFCanvas::frame[i]);
  printf(" %d\\n", PFCanvas::presents);
}

int main() {
  InputFrame input{};
${cases
  .map(
    (entry, i) => `  PFCanvas::presents = 0;
  memset(PFCanvas::frame, 0, sizeof PFCanvas::frame);
  ${namespaces[i]}::setup();
  ${namespaces[i]}::update(1.0f / 60.0f, input);
  ${namespaces[i]}::draw();
  dump("${entry.name}");`,
  )
  .join("\n")}
  return 0;
}
`,
  );
  const binary = path.join(dir, "headers");
  execFileSync(CXX!, [...cxxFlags(dir), "main.cpp", "-o", binary], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });

  const frames = new Map<string, Uint8ClampedArray>();
  for (const line of execFileSync(binary, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim().split("\n")) {
    const [name, hex, presents] = line.trim().split(" ");
    expect(presents, `${name} presented once`).toBe("1");
    const rgba = new Uint8ClampedArray(FRAME.width * FRAME.height * 4);
    for (let i = 0; i < rgba.length / 4; i++) {
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = parseInt(hex.slice((i * 3 + c) * 2, (i * 3 + c) * 2 + 2), 16);
      rgba[i * 4 + 3] = 255;
    }
    frames.set(name, rgba);
  }
  return frames;
}

describe.skipIf(!CXX)("a code layer in the C++ header", () => {
  let frames: Map<string, Uint8ClampedArray> | null = null;
  const header = (name: string) => (frames ??= runHeaders(CASES)).get(name)!;

  it.each(CASES.map((entry) => [entry.name, entry] as const))("%s: same pixels as the preview", (name, entry) => {
    expect(firstDifference(preview(entry), header(name))).toBeNull();
  }, 60_000);
});
