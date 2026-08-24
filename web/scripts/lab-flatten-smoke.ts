// Smoke test for the Pattern Lab layer-stack flattener: builds a 3-layer
// project (vfield code + pixel art + rgb code), flattens it to standalone JS,
// compiles it through the same harness the lab/community use, renders frames,
// and asserts the composite actually blends. Run: npx tsx scripts/lab-flatten-smoke.ts

import { flattenLayers } from "../src/lib/lab/flatten";
import { buildCppPrompt } from "../src/lib/lab/cppPrompt";
import { createPixelLayer, DEFAULT_RAMP_STATE, type CodeLayer } from "../src/lib/lab/types";
import { codeLayerFromSource } from "../src/lib/lab/store";
import { PatternRuntime, createIdleInput } from "../src/lib/patternHarness";
import { emptyShow } from "../src/lib/lab/director/types";
import { codeUsesValueField } from "../src/lib/patternRamp";
import { stripShareWrapping } from "../src/lib/sharePattern";
import { livePresets } from "../src/lib/presets";

function makeCode(code: string, name: string): CodeLayer {
  return codeLayerFromSource(code, name).layer;
}

const bottom = makeCode(
  `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setPixel(x, y, 0, 60, 120);
}`,
  "Base",
);

const pixel = createPixelLayer({ width: 128, height: 64 }, "Art");
// One opaque red dot at (10, 10), rest transparent.
const dotIndex = (10 * 128 + 10) * 4;
pixel.data[dotIndex] = 255;
pixel.data[dotIndex + 3] = 255;

const top = makeCode(
  `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setValue(x, y, x / display.width);
}`,
  "Field",
);
// Ramp: transparent black → opaque white, so the left half must show the base.
top.ramp = {
  stops: [
    { position: 0, color: "#000000", alpha: 0 },
    { position: 1, color: "#ffffff", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};
top.opacity = 1;

const layers = [top, pixel, bottom]; // index 0 = top of stack
const flat = flattenLayers(layers, { width: 128, height: 64 });

const runtime = new PatternRuntime(128, 64);
const load = runtime.loadCode(flat);
if (!load.ok) {
  console.error("FLATTEN COMPILE FAILED:", load.error);
  process.exit(1);
}
for (let frame = 0; frame < 3; frame++) {
  const result = runtime.renderFrame(1 / 30, frame / 30, createIdleInput());
  if (!result.ok) {
    console.error("FLATTEN RENDER FAILED:", result.error);
    process.exit(1);
  }
}

const at = (x: number, y: number) => {
  const i = (y * 128 + x) * 4;
  return [runtime.data[i], runtime.data[i + 1], runtime.data[i + 2]];
};

const leftEdge = at(0, 32); // field alpha ≈ 0 → base blue should show
const rightEdge = at(127, 32); // field alpha ≈ 1 → white
const dot = at(10, 10); // red dot blended under near-transparent field

const approx = (a: number[], b: number[], tol = 12) =>
  a.every((value, index) => Math.abs(value - b[index]) <= tol);

let failed = false;
if (!approx(leftEdge, [0, 60, 120])) {
  console.error("left edge should show the base layer, got", leftEdge);
  failed = true;
}
if (!approx(rightEdge, [255, 255, 255])) {
  console.error("right edge should be opaque white, got", rightEdge);
  failed = true;
}
if (!(dot[0] > 200 && dot[1] < 80)) {
  console.error("pixel-art red dot should survive compositing, got", dot);
  failed = true;
}

if (failed) process.exit(1);
console.log("flatten smoke OK", { leftEdge, rightEdge, dot, codeChars: flat.length });

// ── Mask semantics ──
// A code mask (x-gradient value field through a black→white ramp) over the
// base: luminance crosses the 0.5 threshold at x = 64, so the left half of
// the base must be hidden (black) and the right half visible.
const mask = makeCode(
  `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setValue(x, y, x / display.width);
}`,
  "Mask",
);
mask.role = "mask";
mask.ramp = {
  stops: [
    { position: 0, color: "#000000", alpha: 1 },
    { position: 1, color: "#ffffff", alpha: 1 },
  ],
  mode: "linear",
  wrap: false,
};

const maskFlat = flattenLayers([mask, bottom], { width: 128, height: 64 });
const maskRuntime = new PatternRuntime(128, 64);
const maskLoad = maskRuntime.loadCode(maskFlat);
if (!maskLoad.ok) {
  console.error("MASK FLATTEN COMPILE FAILED:", maskLoad.error);
  process.exit(1);
}
for (let frame = 0; frame < 2; frame++) {
  const result = maskRuntime.renderFrame(1 / 30, frame / 30, createIdleInput());
  if (!result.ok) {
    console.error("MASK FLATTEN RENDER FAILED:", result.error);
    process.exit(1);
  }
}
const maskAt = (x: number, y: number) => {
  const i = (y * 128 + x) * 4;
  return [maskRuntime.data[i], maskRuntime.data[i + 1], maskRuntime.data[i + 2]];
};
const maskedOut = maskAt(10, 32); // below threshold → base hidden
const maskedIn = maskAt(120, 32); // above threshold → base shows

let maskFailed = false;
if (!approx(maskedOut, [0, 0, 0])) {
  console.error("masked-out side should be black, got", maskedOut);
  maskFailed = true;
}
if (!approx(maskedIn, [0, 60, 120])) {
  console.error("masked-in side should show the base, got", maskedIn);
  maskFailed = true;
}
if (maskFailed) process.exit(1);
console.log("mask smoke OK", { maskedOut, maskedIn });

// ── .h export: RLE round-trip + scaffold structure + assembly ──
async function hExportSmoke() {
  const { rleEncode, rleDecode, buildHExport, assembleH, cleanPastedUnit, SLOT_BEGIN } =
    await import("../src/lib/lab/hExport");

  // RLE round-trip on a buffer with runs, singles, and transparency.
  const rlePixels = new Uint8ClampedArray(64 * 4);
  for (let i = 20; i < 40; i++) {
    rlePixels[i * 4] = 255;
    rlePixels[i * 4 + 3] = 255;
  }
  rlePixels[50 * 4 + 1] = 123;
  rlePixels[50 * 4 + 3] = 200;
  const rle = rleEncode(rlePixels);
  const decoded = rleDecode(rle, 64);
  for (let i = 0; i < rlePixels.length; i++) {
    if (decoded[i] !== rlePixels[i]) {
      console.error("RLE round-trip mismatch at byte", i, decoded[i], rlePixels[i]);
      process.exit(1);
    }
  }

  const exportData = buildHExport({
    name: "Smoke Comp",
    matrix: { width: 128, height: 64 },
    layers: [mask, pixel, bottom], // UI order: top → bottom
    knobs: [0.5, 2, 1, 0.2],
    ranges: [
      [0, 1],
      [0.1, 10],
      [0, 4.9],
      [0, 1],
    ],
    knobLabels: ["Hue", "Speed", "Freq", "Mix"],
  });

  const failures: string[] = [];
  const scaffold = exportData.scaffold;
  // Stack bottom→top: L0 = bottom code, L1 = pixel, L2 = mask code.
  if (exportData.units.length !== 2) failures.push(`expected 2 code units, got ${exportData.units.length}`);
  for (const unit of exportData.units) {
    if (!scaffold.includes(SLOT_BEGIN(unit.index))) failures.push(`missing slot marker L${unit.index}`);
    if (!unit.prompt.includes(`namespace L${unit.index}`)) failures.push(`prompt missing namespace L${unit.index}`);
  }
  if (!scaffold.includes("L1_RLE")) failures.push("missing pixel RLE array");
  if (!scaffold.includes("L0_RAMP[256][4]")) failures.push("missing ramp LUT");
  if (!scaffold.includes("MASK_LAYER")) failures.push("missing mask plan");
  if (!scaffold.includes("PFCanvas::present();")) failures.push("missing present()");
  const braceBalance =
    (scaffold.match(/\{/g)?.length ?? 0) - (scaffold.match(/\}/g)?.length ?? 0);
  if (braceBalance !== 0) failures.push(`unbalanced braces: ${braceBalance}`);

  // Assembly: a fenced fake unit replaces the stub for L0.
  const fake = "```cpp\nnamespace L0 {\n  void setup() {}\n  void update(float dt, const InputFrame& input) {}\n  void draw() { L0_setValue(0, 0, 1.0f); }\n}\n```";
  if (!cleanPastedUnit(fake, 0)) failures.push("cleanPastedUnit rejected a valid unit");
  const assembled = assembleH(scaffold, { 0: fake });
  if (!assembled.includes("L0_setValue(0, 0, 1.0f);")) failures.push("assembly did not insert the unit");
  if (/namespace L0 \{ \/\/ ".*" — STUB/.test(assembled)) failures.push("stub L0 still present after assembly");
  if (!assembled.includes("STUB")) failures.push("untouched L2 stub should remain");

  if (failures.length > 0) {
    console.error("H EXPORT SMOKE FAILED:", failures);
    process.exit(1);
  }
  console.log("h-export smoke OK", {
    scaffoldChars: scaffold.length,
    units: exportData.units.map((unit) => `L${unit.index}`),
  });
}

// ── @stack round-trip: embed → extract → same layers ──
async function stackSmoke() {
  const { buildStackAnnotation, extractStackAnnotation, hasStackAnnotation } =
    await import("../src/lib/lab/stackShare");

  const project = {
    matrix: { width: 128, height: 64 },
    layers: [mask, pixel, bottom],
    activeLayerId: mask.id,
    knobs: [0.5, 2, 1, 0.2],
    ranges: [
      [0, 1],
      [0.1, 10],
      [0, 4.9],
      [0, 1],
    ] as [number, number][],
    knobLabels: ["Hue", "Speed", "Freq", "Mix"],
    forkOf: null,
    editOf: null,
    gen: { count: 5, thinking: "LOW" as const, refs: 6, colorMode: "vfield" as const },
    director: emptyShow(),
  };

  const line = await buildStackAnnotation(project);
  if (!line) {
    console.error("STACK SMOKE FAILED: no annotation line produced");
    process.exit(1);
  }
  const shared = `${flat}\n\n${line}\n`;
  if (!hasStackAnnotation(shared)) {
    console.error("STACK SMOKE FAILED: annotation not detected");
    process.exit(1);
  }
  const restored = await extractStackAnnotation(shared);
  if (!restored) {
    console.error("STACK SMOKE FAILED: extract returned null");
    process.exit(1);
  }
  const failures: string[] = [];
  if (restored.layers.length !== 3) failures.push(`expected 3 layers, got ${restored.layers.length}`);
  if (restored.layers[0]?.role !== "mask") failures.push("mask role lost");
  const restoredPixel = restored.layers.find((layer) => layer.type === "pixel");
  if (!restoredPixel || restoredPixel.type !== "pixel") {
    failures.push("pixel layer lost");
  } else {
    const dot = (10 * 128 + 10) * 4;
    if (restoredPixel.data[dot] !== 255 || restoredPixel.data[dot + 3] !== 255) {
      failures.push("pixel bytes corrupted");
    }
  }
  if (restored.knobLabels[1] !== "Speed") failures.push("knob labels lost");
  if (failures.length > 0) {
    console.error("STACK SMOKE FAILED:", failures);
    process.exit(1);
  }
  console.log("stack smoke OK", {
    lineChars: line.length,
    mode: line.includes(" d:") ? "deflate" : "raw",
    layers: restored.layers.map((layer) => `${layer.type}${layer.role === "mask" ? "(mask)" : ""}`),
  });
}

void hExportSmoke().then(stackSmoke);

// ── RLE pixel embedding round trip ──
// Pixel layers flatten as run-length coded RGBA whenever that is smaller than
// raw bytes (see flatten.ts). Runs are capped at 256 pixels, so a layer whose
// runs straddle the cap — and one too noisy to compress, which must fall back
// to raw — both have to come back pixel-exact through the generated decoder.
{
  const rle = createPixelLayer({ width: 128, height: 64 }, "Runs");
  let run = 0;
  for (let i = 0; i < 128 * 64; i++) {
    // Run lengths 1, 2, …, 300 cycling, alternating two opaque colours.
    const colour = run % 2 === 0 ? [255, 40, 0, 255] : [0, 200, 255, 255];
    rle.data.set(colour, i * 4);
    if (i % 301 === 300) run++;
  }
  const noise = createPixelLayer({ width: 128, height: 64 }, "Noise");
  for (let i = 0; i < noise.data.length; i++) noise.data[i] = (i * 2654435761) >>> 24;
  for (let i = 3; i < noise.data.length; i += 4) noise.data[i] = 255;

  for (const layer of [rle, noise]) {
    const flat = flattenLayers([layer], { width: 128, height: 64 });
    const embed = flat.includes('__rle("') ? "rle" : "raw";
    const rt = new PatternRuntime(128, 64);
    const loaded = rt.loadCode(flat);
    if (!loaded.ok) {
      console.error(`${layer.name}: flattened code failed to load:`, loaded.error);
      process.exit(1);
    }
    const result = rt.renderFrame(1 / 30, 0, createIdleInput());
    if (!result.ok) {
      console.error(`${layer.name}: flattened code failed to render:`, result.error);
      process.exit(1);
    }
    let mismatches = 0;
    for (let i = 0; i < layer.data.length; i += 4) {
      if (rt.data[i] !== layer.data[i] || rt.data[i + 1] !== layer.data[i + 1] || rt.data[i + 2] !== layer.data[i + 2]) {
        mismatches++;
      }
    }
    if (mismatches > 0) {
      console.error(`${layer.name} (${embed}): ${mismatches} pixels differ after the round trip`);
      process.exit(1);
    }
    console.log(`pixel embed smoke OK`, { layer: layer.name, embed, codeChars: flat.length });
  }
  if (!flattenLayers([rle], { width: 128, height: 64 }).includes('__rle("')) {
    console.error("run-heavy layer should have taken the RLE path");
    process.exit(1);
  }
  if (flattenLayers([noise], { width: 128, height: 64 }).includes('__rle("')) {
    console.error("noise should have fallen back to raw bytes");
    process.exit(1);
  }
}

// ── the community's wrapping strip must leave a flattened stack intact ──
// Every preset and AI variant ends with a licence footer; flattened, that
// footer sits mid-file inside the layer's IIFE with the composite after it.
// The publish route strips licence wrapping before storing — and used to cut
// from the first footer to the end of the file, storing half a pattern.
function publishStripSmoke() {
  const footered = livePresets.find((preset) => /Made with Patternflow/.test(preset.code.slice(-400)));
  if (!footered) {
    console.error("expected at least one preset ending with a licence footer");
    process.exit(1);
  }
  const layer = codeLayerFromSource(footered.code, "Code 1").layer;
  const flat = flattenLayers([createPixelLayer({ width: 128, height: 64 }, "Pixel 1"), layer], { width: 128, height: 64 });
  const stored = stripShareWrapping(flat);
  const rt = new PatternRuntime(128, 64);
  const loaded = rt.loadCode(stored);
  if (!loaded.ok || !stored.includes("export function draw")) {
    console.error("stored stack is broken after stripShareWrapping:", loaded.error ?? "composite draw missing");
    process.exit(1);
  }
  console.log("publish strip smoke OK", { preset: footered.name, flatChars: flat.length, storedChars: stored.length });
}
publishStripSmoke();

// ── value-field detection must not read comments or strings ──
// AI-returned RGB code loves to quote the API ("// display.setValue(x, y, v)
// …"); matching that classified a setPixel pattern as a value field and the
// C++ prompt forced its baked colors through the ramp LUT.
{
  const rgbWithGuideComment = `// API guide: display.setValue(x, y, v) colors via the ramp.
/* also mentioned here: display.setValue(0, 0, 1) */
const doc = "display.setValue(1, 2, 3)";
const tpl = \`display.setValue(4, 5, 6)\`;
export function draw(display, params, time) {
  display.setPixel(0, 0, 255, 40, 0);
}`;
  const realValueField = `// draws a field
export function draw(display, params, time) {
  display.setValue(0, 0, 0.5);
}`;
  const commentThenReal = `// display.setValue is the API
export function draw(display, params, time) {
  const s = "it\\'s escaped"; display.setValue(1, 1, 1);
}`;

  const failures: string[] = [];
  if (codeUsesValueField(rgbWithGuideComment)) failures.push("comment/string mention misread as a call");
  if (!codeUsesValueField(realValueField)) failures.push("real setValue call not detected");
  if (!codeUsesValueField(commentThenReal)) failures.push("call after comments/escapes not detected");

  const promptArgs = {
    matrix: { width: 128, height: 64 },
    knobs: [0.5, 0.5, 0.5, 0.5],
    ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] as [number, number][],
    knobLabels: ["A", "B", "C", "D"],
    ramp: DEFAULT_RAMP_STATE,
  };
  const rgbPrompt = buildCppPrompt({ code: rgbWithGuideComment, ...promptArgs });
  const vfieldPrompt = buildCppPrompt({ code: realValueField, ...promptArgs });
  if (rgbPrompt.includes("RAMP_LUT")) failures.push("RGB pattern's prompt still carries the ramp LUT");
  if (!vfieldPrompt.includes("RAMP_LUT")) failures.push("value-field pattern's prompt lost the ramp LUT");

  // Recolor: an RGB pattern with the toggle ON carries the baked LUT and the
  // luminance-lookup contract — but never the value-field framing; a value
  // field with recolor on stays a value field.
  const recolorPrompt = buildCppPrompt({ code: rgbWithGuideComment, ...promptArgs, recolor: true });
  if (!recolorPrompt.includes("## Recolor") || !recolorPrompt.includes("RAMP_LUT")) {
    failures.push("recolor prompt is missing its section or LUT");
  }
  if (recolorPrompt.includes("no setPixel in the source")) {
    failures.push("recolor prompt slipped into the value-field framing");
  }
  const vfieldRecolor = buildCppPrompt({ code: realValueField, ...promptArgs, recolor: true });
  if (vfieldRecolor.includes("## Recolor")) {
    failures.push("value field with recolor should keep the value-field section only");
  }

  if (failures.length > 0) {
    console.error("VALUE-FIELD DETECTION SMOKE FAILED:", failures);
    process.exit(1);
  }
  console.log("value-field detection smoke OK");
}
