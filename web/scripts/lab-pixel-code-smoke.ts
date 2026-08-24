// Smoke test for pixel-layer → standalone pattern code (pixelToCode.ts):
// builds sprites that exercise both data paths (RLE and raw), compiles the
// generated pattern through the same harness the lab uses, renders a frame,
// and asserts every pixel lands back where it was drawn, premultiplied over
// the black panel. Run: npx tsx scripts/lab-pixel-code-smoke.ts

import { buildPixelPatternCode } from "../src/lib/lab/pixelToCode";
import { createPixelLayer } from "../src/lib/lab/types";
import { PatternRuntime, createIdleInput } from "../src/lib/patternHarness";

const W = 128;
const H = 64;

function renderThrough(code: string): Uint8ClampedArray {
  const runtime = new PatternRuntime(W, H);
  const loaded = runtime.loadCode(code);
  if (!loaded.ok) {
    console.error("GENERATED CODE FAILED TO LOAD:", loaded.error);
    process.exit(1);
  }
  const result = runtime.renderFrame(1 / 30, 0, createIdleInput());
  if (!result.ok) {
    console.error("GENERATED CODE FAILED TO RENDER:", result.error);
    process.exit(1);
  }
  return runtime.data;
}

/** Every frame pixel must equal the source premultiplied over black (±1). */
function assertRoundTrip(name: string, source: Uint8ClampedArray, out: Uint8ClampedArray) {
  let worst = 0;
  let worstAt = -1;
  for (let i = 0; i < W * H; i++) {
    const j = i * 4;
    const alpha = source[j + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const want = source[j + c] * alpha;
      const diff = Math.abs(out[j + c] - want);
      if (diff > worst) {
        worst = diff;
        worstAt = i;
      }
    }
  }
  if (worst > 1) {
    const x = worstAt % W;
    const y = (worstAt / W) | 0;
    console.error(`${name}: worst channel error ${worst} at (${x}, ${y})`);
    process.exit(1);
  }
}

// ── flat sprite, off-centre → RLE path, exact placement ──
{
  const layer = createPixelLayer({ width: W, height: H }, "Art");
  // A filled block with a hole, plus scattered singles and a semi-transparent
  // edge — drawn away from the centre so the anchor math has to be exact.
  for (let y = 9; y < 30; y++) {
    for (let x = 17; x < 55; x++) {
      if (x > 30 && x < 40 && y > 14 && y < 24) continue; // hole stays clear
      const i = (y * W + x) * 4;
      layer.data[i] = 255;
      layer.data[i + 1] = 120;
      layer.data[i + 2] = 0;
      layer.data[i + 3] = y === 9 ? 128 : 255; // one semi-transparent row
    }
  }
  const single = (50 * W + 100) * 4;
  layer.data[single + 1] = 200;
  layer.data[single + 3] = 255;

  const code = buildPixelPatternCode(layer);
  if (!code) {
    console.error("Art: expected code, got null");
    process.exit(1);
  }
  for (const marker of ["// @matrix 128x64", "DISTORT HERE", "SPRITE_DATA", "decodeRLE("]) {
    if (!code.includes(marker)) {
      console.error(`Art: generated code is missing "${marker}"`);
      process.exit(1);
    }
  }
  assertRoundTrip("Art", layer.data, renderThrough(code));
  console.log("pixel-to-code smoke OK", { sprite: "Art", path: "rle", codeChars: code.length });
}

// ── noisy sprite → raw path, exact bytes ──
{
  const layer = createPixelLayer({ width: W, height: H }, "Noise");
  for (let y = 20; y < 52; y++) {
    for (let x = 40; x < 104; x++) {
      const i = (y * W + x) * 4;
      layer.data[i] = ((x * 37 + y * 101) * 2654435761) >>> 24;
      layer.data[i + 1] = ((x * 11 + y * 7) * 40503) >>> 8;
      layer.data[i + 2] = (x * y) & 255;
      layer.data[i + 3] = 255;
    }
  }
  const code = buildPixelPatternCode(layer);
  if (!code) {
    console.error("Noise: expected code, got null");
    process.exit(1);
  }
  if (code.includes("decodeRLE(")) {
    console.error("Noise: should have fallen back to raw bytes, found the RLE path");
    process.exit(1);
  }
  assertRoundTrip("Noise", layer.data, renderThrough(code));
  console.log("pixel-to-code smoke OK", { sprite: "Noise", path: "raw", codeChars: code.length });
}

// ── empty layer → null, nothing to export ──
{
  const layer = createPixelLayer({ width: W, height: H }, "Blank");
  if (buildPixelPatternCode(layer) !== null) {
    console.error("Blank: an empty layer should export as null");
    process.exit(1);
  }
  console.log("pixel-to-code smoke OK", { sprite: "Blank", path: "null" });
}
