// Smoke test for the Pattern Lab capture core (lib/lab/capture): geometry
// resolution, pixel-layer stretching, the two transparency models, wire
// merging, and a real multi-layer render at a non-panel size through the
// same engine the worker uses. Run: npx tsx scripts/lab-capture-smoke.ts

import {
  CaptureCore,
  clampScale,
  mergeWireProject,
  resolveGeometry,
  stretchNearest,
  unmultiply,
  unpremultiply,
} from "../src/lib/lab/capture/core";
import { probeScaling } from "../src/lib/lab/capture/probe";
import { normalizeCaptureSettings } from "../src/lib/lab/capture/settings";
import { DEFAULT_CAPTURE_SETTINGS, type WireProject } from "../src/lib/lab/capture/types";
import { codeLayerFromSource } from "../src/lib/lab/store";
import { createPixelLayer, type CodeLayer, type Layer } from "../src/lib/lab/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const matrix = { width: 128, height: 64 };

// ── geometry ──
{
  const native = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "native", width: 1050, height: 600 }, matrix);
  assert(native.render.width === 1050 && native.output.height === 600 && native.scale === 1, "native geometry");

  const pixel = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "pixel", scale: 8 }, matrix);
  assert(pixel.render.width === 128 && pixel.output.width === 1024 && pixel.scale === 8, "pixel geometry");

  const clamped = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "led", scale: 64 }, matrix);
  assert(clamped.output.width <= 4096 && clamped.scale === clampScale(64, matrix), "scale clamps to the side limit");

  const huge = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "native", width: 99999, height: 1 }, matrix);
  assert(huge.output.width === 4096 && huge.output.height === 16, "native sides clamp");

  const normalized = normalizeCaptureSettings({ style: "bogus", width: "x", rotation: 45, video: { fps: 17, seconds: 900 } });
  assert(normalized.style === "auto" && normalized.rotation === 0 && normalized.video.fps === 30 && normalized.video.seconds === 60, "settings normalize");

  // Turns: the size is the finished picture; the pattern runs in the frame that turns into it.
  const portrait = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "native", width: 1080, height: 1920, rotation: 90 }, matrix);
  assert(portrait.render.width === 1920 && portrait.render.height === 1080 && portrait.output.width === 1080 && portrait.output.height === 1920, "90° native renders landscape into a portrait output");
  const turnedPixel = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "pixel", scale: 8, rotation: 270 }, matrix);
  assert(turnedPixel.render.width === 128 && turnedPixel.box.width === 1024 && turnedPixel.output.width === 512 && turnedPixel.output.height === 1024, "270° pixel output is the turned box");

  // Auto fallback: cover fit, centred, cropping the overflow.
  const autoNative = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "auto", width: 1050, height: 600 }, matrix, "native");
  const autoPixel = resolveGeometry({ ...DEFAULT_CAPTURE_SETTINGS, style: "auto", width: 1050, height: 600 }, matrix, "pixel");
  assert(autoNative.look === "native" && autoNative.render.width === 1050, "auto → native re-renders at the output size");
  assert(autoPixel.look === "pixel" && autoPixel.render.width === 128 && autoPixel.output.width === 1050, "auto → pixel keeps the output size, renders the matrix");
  assert(Math.abs(autoPixel.scale - 9.375) < 1e-9, `cover scale: ${autoPixel.scale}`);
  assert(Math.abs(autoPixel.offsetX + 75) < 1e-9 && autoPixel.offsetY === 0, `cover offsets: ${autoPixel.offsetX}, ${autoPixel.offsetY}`);

  // "smooth" was a look until 2026-08 — stored settings carrying it open as auto.
  const legacy = normalizeCaptureSettings({ ...DEFAULT_CAPTURE_SETTINGS, style: "smooth" });
  assert(legacy.style === "auto", "legacy smooth style falls back to auto");
}

// ── scaling probe ──
{
  const ranges: Array<[number, number]> = [[0, 1], [0, 1], [0, 1], [0, 1]];
  const project = (code: string) => {
    const { layer } = codeLayerFromSource(code, "L");
    return { matrix, layers: [layer], activeLayerId: layer.id, knobs: [0.5, 0.5, 0.5, 0.5], ranges };
  };
  // Frame-relative: a diagonal gradient plus a centred disc in frame units.
  const safe = probeScaling(project(`export function draw(display, params, time) {
  const w = display.width, h = display.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const dx = (u - 0.5) * (w / h), dy = v - 0.5;
    const disc = dx * dx + dy * dy < 0.08 ? 1 : 0;
    display.setValue(x, y, 0.6 * ((u + v) / 2) + 0.4 * disc);
  }
}`));
  assert(safe.verdict === "native", `frame-relative pattern scales: ${safe.reason} ${JSON.stringify(safe.metrics)}`);

  // Pixel-unit stripes: re-rendered bigger they come back N× as dense.
  const stripes = probeScaling(project(`export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++) for (let x = 0; x < display.width; x++)
    display.setValue(x, y, 0.5 + 0.5 * Math.sin(x * 0.3 + time));
}`));
  assert(stripes.verdict === "upscale" && stripes.reason === "frame-baked", `pixel-unit stripes are baked: ${stripes.reason} ${JSON.stringify(stripes.metrics)}`);

  // Literal bounds: paints only the old 128×64 corner of a bigger frame.
  const corner = probeScaling(project(`export function draw(display, params, time) {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++)
    display.setValue(x, y, (x + y) % 16 < 8 ? 0.9 : 0.2);
}`));
  assert(corner.verdict === "upscale", `corner-only pattern is baked: ${corner.reason} ${JSON.stringify(corner.metrics)}`);

  // A 128×64 buffer indexed with a literal stride: reads garbage at any other size.
  const stride = probeScaling(project(`export function setup(params) { params.buf = new Float32Array(128 * 64); }
export function update(dt, input, params) { for (let i = 0; i < params.buf.length; i++) params.buf[i] = (i % 128) / 128; }
export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++) for (let x = 0; x < display.width; x++) {
    const v = params.buf[y * 128 + x];
    display.setValue(x, y, v === undefined ? 0 : v);
  }
}`));
  assert(stride.verdict === "upscale", `literal-stride buffer is baked: ${stride.reason} ${JSON.stringify(stride.metrics)}`);

  // Too dark to tell falls back rather than guessing.
  const dark = probeScaling(project(`export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++) for (let x = 0; x < display.width; x++) display.setValue(x, y, 0.01);
}`));
  assert(dark.verdict === "upscale" && dark.reason === "too-dark", `dark pattern: ${dark.reason}`);
}

// ── stretch ──
{
  const src = new Uint8ClampedArray(2 * 2 * 4);
  // (0,0) red, (1,0) green, (0,1) blue, (1,1) white
  src.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const out = stretchNearest(src, 2, 2, 6, 3);
  const px = (x: number, y: number) => Array.from(out.slice((y * 6 + x) * 4, (y * 6 + x) * 4 + 4));
  assert(px(0, 0)[0] === 255 && px(2, 0)[0] === 255, "left column stays red");
  assert(px(3, 0)[1] === 255 && px(5, 0)[1] === 255, "right column green");
  assert(px(0, 2)[2] === 255, "bottom-left blue");
  assert(px(5, 2)[0] === 255 && px(5, 2)[1] === 255, "bottom-right white");
}

// ── transparency models ──
{
  const opaque = new Uint8ClampedArray([50, 0, 0, 255, 0, 0, 0, 255, 255, 128, 0, 255]);
  const out = new Uint8ClampedArray(12);
  unmultiply(opaque, out, 3);
  assert(out[0] === 255 && out[3] === 50, "dim red → full red at alpha 50");
  assert(out[7] === 0, "black → clear");
  assert(out[8] === 255 && out[9] === 128 && out[11] === 255, "bright stays, alpha 255");

  const coverage = new Uint8ClampedArray([128, 0, 255]);
  const premul = new Uint8ClampedArray([64, 64, 64, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
  const straight = new Uint8ClampedArray(12);
  unpremultiply(premul, coverage, straight, 3);
  assert(straight[0] === 128 && straight[3] === 128, "half-covered grey → straight 128 @ 128");
  assert(straight[7] === 0, "uncovered → clear");
  assert(straight[8] === 255 && straight[11] === 255, "full coverage unchanged");
}

// ── wire merge ──
{
  const art = createPixelLayer(matrix, "Art");
  art.data[0] = 255;
  art.data[3] = 255;
  const first: WireProject = { matrix, layers: [art], activeLayerId: art.id, knobs: [0, 0, 0, 0], ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] };
  const merged = mergeWireProject(null, first);
  assert(merged.layers.length === 1, "first merge keeps the layer");

  const { data: _omitted, ...withoutData } = art;
  void _omitted;
  const second: WireProject = { ...first, layers: [{ ...withoutData, opacity: 0.5 }] };
  const merged2 = mergeWireProject(merged, second);
  const layer = merged2.layers[0];
  assert(layer.type === "pixel" && layer.data === art.data && layer.opacity === 0.5, "rev-unchanged pixel layer keeps its buffer, takes new flags");

  const third: WireProject = { ...first, layers: [{ ...withoutData, id: "unknown" }] };
  assert(mergeWireProject(merged2, third).layers.length === 0, "a buffer-less unknown layer is dropped, not blanked");
}

// ── real render through the engine at an off-panel size ──
{
  const base = codeLayerFromSource(
    `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setPixel(x, y, 0, 60, 120);
}`,
    "Base",
  ).layer;

  // Pixel art: opaque red dot at matrix (10,10); must land stretched.
  const art = createPixelLayer(matrix, "Art");
  const dot = (10 * 128 + 10) * 4;
  art.data[dot] = 255;
  art.data[dot + 3] = 255;
  art.rev = 1;

  const top: CodeLayer = codeLayerFromSource(
    `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++)
      display.setValue(x, y, x / display.width);
}`,
    "Field",
  ).layer;
  top.ramp = {
    stops: [
      { position: 0, color: "#000000", alpha: 0 },
      { position: 1, color: "#ffffff", alpha: 1 },
    ],
    mode: "linear",
    wrap: false,
  };

  const layers: Layer[] = [top, art, base];
  const project = { matrix, layers, activeLayerId: top.id, knobs: [0.5, 0.5, 0.5, 0.5], ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] as Array<[number, number]> };

  const core = new CaptureCore({ ...DEFAULT_CAPTURE_SETTINGS, style: "native", width: 512, height: 256 });
  core.setProject(project);
  const frame = core.step(1 / 30);
  assert(frame && frame.geometry.render.width === 512 && frame.opaque.length === 512 * 256 * 4, "native frame at 512×256");
  assert(Object.keys(frame.errors).length === 0, `no layer errors: ${JSON.stringify(frame.errors)}`);

  const at = (buffer: Uint8ClampedArray, x: number, y: number) => Array.from(buffer.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
  // Far left: field is transparent → base blue shows.
  const left = at(frame.opaque, 1, 128);
  assert(left[2] > 100 && left[0] < 20, `left shows the base: ${left}`);
  // Far right: field is opaque white.
  const right = at(frame.opaque, 510, 128);
  assert(right[0] > 240 && right[1] > 240, `right is white: ${right}`);
  // The stretched dot: matrix (10,10) → output x 40..43, y 40..43.
  const dotPx = at(frame.opaque, 41, 41);
  assert(dotPx[0] > 200, `pixel art dot stretched into place: ${dotPx}`);
  const offDot = at(frame.opaque, 45, 41);
  assert(offDot[0] < 50, `next to the dot is not red: ${offDot}`);

  // Time advances and state persists across steps.
  const again = core.step(1 / 30);
  assert(again && Math.abs(again.time - 2 / 30) < 1e-9, "clock advanced by two steps");

  // Unpainted transparency: base covers everything, so alpha is 255 everywhere.
  core.setSettings({ ...core.settings, backdrop: "transparent", cutout: "unpainted" });
  const covered = core.step(0);
  assert(covered && covered.rgba !== covered.opaque && covered.rgba[3] === 255, "coverage alpha is full under an opaque base");

  // Hide the base: the left edge is now uncovered (field alpha 0, art elsewhere).
  core.setProject({ ...project, layers: [top, art, { ...base, visible: false }] });
  const holed = core.step(0);
  const leftA = at(holed!.rgba, 1, 128)[3];
  const rightA = at(holed!.rgba, 510, 128)[3];
  // (x=510 samples the ramp at 0.996 → alpha 254; the edge is not a bug.)
  assert(leftA < 8 && rightA >= 254, `unpainted cutout: left alpha ${leftA}, right alpha ${rightA}`);

  // Dark-to-clear: with the base back, the left (blue 0,60,120) keys to alpha 120.
  core.setProject(project);
  core.setSettings({ ...core.settings, cutout: "dark" });
  const keyed = core.step(0);
  const keyedLeft = at(keyed!.rgba, 1, 128);
  assert(keyedLeft[3] === 120 && keyedLeft[2] === 255, `unmult: ${keyedLeft}`);

  // Pixel style renders at the matrix and reports the blow-up.
  core.setSettings({ ...core.settings, style: "pixel", scale: 4, backdrop: "black" });
  const blocks = core.step(0);
  assert(blocks && blocks.geometry.render.width === 128 && blocks.geometry.output.width === 512 && blocks.rgba === blocks.opaque, "pixel style geometry");

  // Restart clears the clock.
  core.reset();
  assert(core.time === 0, "reset zeroes time");
  const fresh = core.step(0);
  assert(fresh && fresh.time === 0, "fresh frame at t=0");
}

console.log("lab-capture-smoke: OK");
