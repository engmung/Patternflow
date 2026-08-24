// ── Pixel layer → standalone pattern code ────────────────────────────────────
// Turns one pixel-art layer into a self-contained JS pattern whose whole
// reason to exist is being PASTED INTO AN AI CHAT: the user draws a sprite,
// copies it as code, and asks an AI to animate or distort it. The pixel
// layer itself is untouched — this is a copy, not a conversion.
//
// What an AI needs to work on pixel art without wrecking it, learned the
// hard way in hExport.ts ("the LLM never sees machine data"):
//   · the pixel bytes as ONE clearly-marked line it is told to copy through
//     verbatim — models that retype base64 corrupt it
//   · an ASCII preview comment so the model can SEE what it is distorting
//   · an inverse-mapping draw loop (screen pixel → sprite coordinate) with
//     a marked DISTORT block — coordinate warps are the natural lever, and
//     inverse mapping leaves no holes
//   · the harness contract in the header, because the chat has no other
//     way to know what draw(display, params, time) means
//
// Encoding reuses flatten.ts's proven pair: RLE {count-1,r,g,b,a} when it
// wins, raw RGBA otherwise, both base64 with the same ~10-line decoder.
// The buffer is cropped to the sprite's bounding box first — a 128×64
// canvas with a small drawing in it shrinks from ~44 KB to a few KB.

import { withMatrixAnnotation } from "@/lib/patternMatrix";
import { rleEncodeRGBA } from "./flatten";
import { bytesToBase64 } from "./serialize";
import type { PixelLayer } from "./types";

type SpriteCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/** Tight bounding box of non-transparent pixels; null when nothing is drawn. */
function cropToSprite(layer: PixelLayer): SpriteCrop | null {
  const { width, height, data } = layer;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y++) {
    const src = ((minY + y) * width + minX) * 4;
    cropped.set(data.subarray(src, src + cropWidth * 4), y * cropWidth * 4);
  }
  return { x: minX, y: minY, width: cropWidth, height: cropHeight, data: cropped };
}

const PREVIEW_MAX_COLS = 56;
const PREVIEW_LEVELS = ":-=+*#%@";

/**
 * The sprite as comment-art, so a text model can see the drawing it is
 * asked to bend. Cells are ~2× taller than wide, so rows sample at twice
 * the column step to keep the proportions roughly honest.
 */
function asciiPreview(sprite: SpriteCrop): string[] {
  const stepX = Math.max(1, Math.ceil(sprite.width / PREVIEW_MAX_COLS));
  const stepY = stepX * 2;
  const rows: string[] = [];
  for (let y = 0; y < sprite.height; y += stepY) {
    let row = "";
    for (let x = 0; x < sprite.width; x += stepX) {
      let sum = 0;
      let alphaMax = 0;
      let count = 0;
      for (let dy = 0; dy < stepY && y + dy < sprite.height; dy++) {
        for (let dx = 0; dx < stepX && x + dx < sprite.width; dx++) {
          const i = ((y + dy) * sprite.width + (x + dx)) * 4;
          const alpha = sprite.data[i + 3] / 255;
          if (alpha * 255 > alphaMax) alphaMax = alpha * 255;
          sum +=
            (0.2126 * sprite.data[i] + 0.7152 * sprite.data[i + 1] + 0.0722 * sprite.data[i + 2]) *
            alpha;
          count++;
        }
      }
      if (alphaMax < 32) {
        row += ".";
        continue;
      }
      const level = Math.min(
        PREVIEW_LEVELS.length - 1,
        Math.floor((sum / count / 255) * PREVIEW_LEVELS.length),
      );
      row += PREVIEW_LEVELS[level];
    }
    rows.push(row);
  }
  return rows;
}

/** A layer name inside a `//` comment: no line terminators. */
function commentSafe(name: string): string {
  return name.replace(/[\r\n\u2028\u2029]/g, " ");
}

const B64_DECODER = `function decodeB64(s, n) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = new Uint8ClampedArray(n);
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < s.length && o < n; i++) {
    const v = A.indexOf(s[i]);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out;
}`;

const RLE_DECODER = `// Run-length coded RGBA: base64 of {count-1, r, g, b, a} tuples.
function decodeRLE(s, n) {
  const t = decodeB64(s, (s.length * 3) >> 2), out = new Uint8ClampedArray(n);
  let o = 0;
  for (let i = 0; i + 4 < t.length && o < n; i += 5) {
    for (let k = t[i] + 1; k > 0 && o < n; k--) {
      out[o++] = t[i + 1]; out[o++] = t[i + 2]; out[o++] = t[i + 3]; out[o++] = t[i + 4];
    }
  }
  return out;
}`;

/**
 * Build the standalone pattern. Returns null when the layer is fully
 * transparent — there is no sprite to export.
 */
export function buildPixelPatternCode(layer: PixelLayer): string | null {
  const sprite = cropToSprite(layer);
  if (!sprite) return null;

  const rle = rleEncodeRGBA(sprite.data);
  const useRLE = rle.length < sprite.data.length;
  const dataLiteral = bytesToBase64(useRLE ? rle : sprite.data);
  const decodeCall = useRLE ? "decodeRLE" : "decodeB64";

  // Fractions of the frame; at the original frame size the sprite lands on
  // the exact pixels it was drawn on (originX = anchor·W − w/2 = bbox x).
  const anchorX = (sprite.x + sprite.width / 2) / layer.width;
  const anchorY = (sprite.y + sprite.height / 2) / layer.height;

  const preview = asciiPreview(sprite)
    .map((row) => `//   ${row}`)
    .join("\n");

  const code = `// Pixel sprite: ${commentSafe(layer.name)} — exported by Patternflow Pattern Lab.
//
// WHAT THIS IS — a JavaScript pattern for a ${layer.width}×${layer.height} LED matrix. As it
// stands it draws the sprite below, unchanged, exactly where it was drawn.
// It exists to be modified: animate the sprite, distort it, add effects.
//
// THE ONE RULE — never retype, reflow, or shorten the SPRITE_DATA string
// or the decoder functions. They are machine data; one wrong character
// destroys the image. Copy them through verbatim and make every change in
// draw() (or an added update()).
//
// THE HARNESS — draw(display, params, time) runs every frame. time is in
// seconds. display.width/height is the grid; display.setPixel(x, y, r, g, b)
// takes 0–255; pixels you don't set are off (black — LEDs emit light).
// You may add update(dt, input, params); the four physical knobs arrive as
// input.knobValues[0..3] there and params.knobValues in draw. If you bind
// knobs, declare them on one line, e.g. // @knobs Strength=0..1, Speed=0..4, -, -
//
// HOW TO DISTORT — draw() walks every screen pixel and computes which
// sprite pixel lands there (sx, sy), then samples nearest-neighbour so the
// art stays crisp. Warp sx/sy inside the DISTORT block:
//   sx += Math.sin(sy * 0.4 + time * 2) * 2;          // wavy
//   sy += Math.sin(time) * 4;                          // bob up and down
//   const s = 1 + 0.2 * Math.sin(time * 3);            // breathe: divide
//   sx = SPRITE_W / 2 + (sx - SPRITE_W / 2) / s;       // around the centre
//
// The sprite, roughly (. = transparent, : dim → @ bright):
${preview}

const SPRITE_W = ${sprite.width}, SPRITE_H = ${sprite.height};
// Where the sprite sits, as fractions of the frame (0.5, 0.5 = centred).
const ANCHOR_X = ${anchorX}, ANCHOR_Y = ${anchorY};

// machine data — copy verbatim, do not edit ↓
const SPRITE_DATA = "${dataLiteral}";
const SPRITE = ${decodeCall}(SPRITE_DATA, SPRITE_W * SPRITE_H * 4);

${B64_DECODER}
${useRLE ? `\n${RLE_DECODER}\n` : ""}
function sample(sx, sy) {
  const xi = Math.round(sx), yi = Math.round(sy);
  if (xi < 0 || xi >= SPRITE_W || yi < 0 || yi >= SPRITE_H) return -1;
  return (yi * SPRITE_W + xi) * 4;
}

export function draw(display, params, time) {
  const originX = display.width * ANCHOR_X - SPRITE_W / 2;
  const originY = display.height * ANCHOR_Y - SPRITE_H / 2;
  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
      let sx = x - originX;
      let sy = y - originY;

      // ── DISTORT HERE ── warp sx/sy before sampling (examples in header)

      const i = sample(sx, sy);
      if (i < 0) continue;
      const a = SPRITE[i + 3] / 255;
      if (a <= 0) continue;
      // Alpha premultiplies onto the black panel: LEDs emit light.
      display.setPixel(x, y, SPRITE[i] * a, SPRITE[i + 1] * a, SPRITE[i + 2] * a);
    }
  }
}`;

  return withMatrixAnnotation(code, { width: layer.width, height: layer.height });
}
