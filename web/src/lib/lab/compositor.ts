// ── Layer compositor ─────────────────────────────────────────────────────────
// Straight-alpha painter's algorithm over an opaque black base (the physical
// LED panel is black when off). Blend modes are limited to what the firmware
// can afford per pixel; the flattened JS export replicates this math 1:1, so
// keep the two in sync (see flatten.ts).

import type { BlendMode } from "./types";

export type CompositeEntry = {
  /** Straight RGBA bytes, width × height × 4 — same frame as the target. */
  data: Uint8ClampedArray;
  opacity: number; // 0..1
  blend: BlendMode;
  /** Binary per-pixel coverage from mask layers: 0 hides the pixel entirely. */
  mask?: Uint8Array;
};

/**
 * AND one mask layer's buffer into a coverage bitmap (1 byte per pixel).
 * Pixel-art masks switch on wherever something was drawn (alpha ≥ 0.5);
 * code masks switch on where luminance × alpha crosses 0.5 — so the layer's
 * color ramp tunes the mask. Keep this math in sync with flatten.ts.
 */
export function applyMaskToCoverage(
  coverage: Uint8Array,
  data: Uint8ClampedArray,
  isPixelLayer: boolean,
  invert: boolean,
  pixelCount: number,
) {
  for (let i = 0; i < pixelCount; i++) {
    if (coverage[i] === 0) continue;
    const j = i * 4;
    let on: boolean;
    if (isPixelLayer) {
      on = data[j + 3] >= 128;
    } else {
      const alpha = data[j + 3] / 255;
      on = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) * alpha >= 127.5;
    }
    if (invert) on = !on;
    if (!on) coverage[i] = 0;
  }
}

/** Fill the target with opaque black, then blend entries bottom → top. */
export function compositeLayers(
  out: Uint8ClampedArray,
  entries: CompositeEntry[],
  pixelCount: number,
) {
  for (let i = 0; i < pixelCount; i++) {
    const j = i * 4;
    out[j] = 0;
    out[j + 1] = 0;
    out[j + 2] = 0;
    out[j + 3] = 255;
  }

  for (const entry of entries) {
    const source = entry.data;
    const opacity = Math.max(0, Math.min(1, entry.opacity));
    if (opacity <= 0) continue;
    const blend = entry.blend;
    const mask = entry.mask;

    for (let i = 0; i < pixelCount; i++) {
      if (mask && mask[i] === 0) continue;
      const j = i * 4;
      const alpha = (source[j + 3] / 255) * opacity;
      if (alpha <= 0) continue;
      const sr = source[j];
      const sg = source[j + 1];
      const sb = source[j + 2];
      const inv = 1 - alpha;

      if (blend === "add") {
        out[j] = out[j] + sr * alpha;
        out[j + 1] = out[j + 1] + sg * alpha;
        out[j + 2] = out[j + 2] + sb * alpha;
      } else if (blend === "multiply") {
        out[j] = out[j] * inv + ((out[j] * sr) / 255) * alpha;
        out[j + 1] = out[j + 1] * inv + ((out[j + 1] * sg) / 255) * alpha;
        out[j + 2] = out[j + 2] * inv + ((out[j + 2] * sb) / 255) * alpha;
      } else if (blend === "screen") {
        out[j] = out[j] * inv + (255 - ((255 - out[j]) * (255 - sr)) / 255) * alpha;
        out[j + 1] = out[j + 1] * inv + (255 - ((255 - out[j + 1]) * (255 - sg)) / 255) * alpha;
        out[j + 2] = out[j + 2] * inv + (255 - ((255 - out[j + 2]) * (255 - sb)) / 255) * alpha;
      } else {
        out[j] = out[j] * inv + sr * alpha;
        out[j + 1] = out[j + 1] * inv + sg * alpha;
        out[j + 2] = out[j + 2] * inv + sb * alpha;
      }
      // Alpha stays 255: the base is opaque.
    }
  }
}
