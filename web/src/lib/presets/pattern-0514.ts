import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0514",
  num: 514,
  name: "0514",
  desc: "Warped wave patterns with variable speed",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-14",
  lineage: "AI generated and curated",
  code: `// Pattern: 0514
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-14
// Lineage: AI generated and curated
//
function hsvToRgb(h, s, v) {
  h = h - Math.floor(h);
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wrap01(v) {
  v = v - Math.floor(v);
  if (v < 0) v += 1.0;
  return v;
}

export function setup(params) {
  params.timeAcc = 0;
  params.hueT = 0.57;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.hueT = wrap01(params.hueT + (input.knobValues[0] - 0.5) * 0.008);
    params.speed = input.knobValues[1];
    params.depth = input.knobValues[2];
    params.warp = input.knobValues[3];
  }
  params.timeAcc += dt * (0.23 + params.speed * 2.5);
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  let hue = params.hueT;
  let warp = 7 + params.warp * 28;

  let c1 = hsvToRgb(hue, 0.94, 1);
  let c2 = hsvToRgb(hue + 0.11, 0.86, 1);
  let c3 = hsvToRgb(hue + 0.39, 0.93, 0.98);
  let c4 = hsvToRgb(hue + 0.71, 0.74, 0.95);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cellSize = 9;
      let gx = Math.floor(x / cellSize);
      let gy = Math.floor(y / cellSize);
      
      let cx = (gx + 0.5) * cellSize + Math.sin(gy * 0.7 + t * 1.05) * warp * 0.75;
      let cy = (gy + 0.5) * cellSize + Math.cos(gx * 0.85 - t * 0.55) * warp * 0.75;

      let tex1 = (Math.sin(cx * 0.046 + t * 1.05) + Math.cos(cy * 0.053 - t * 0.85)) * 0.5 + 0.5;
      let tex2 = Math.sin(y * 0.022 + t * 0.32 * params.depth) * 0.5 + 0.5;

      let intensity = tex1 * (1 - params.depth * 0.4) + tex2 * params.depth * 1.2;
      intensity = clamp(intensity, 0, 1);

      let lx = (x % cellSize) / cellSize - 0.5;
      let ly = (y % cellSize) / cellSize - 0.5;

      let r = 0, g = 0, b = 0;
      if (intensity < 0.35) {
        if (Math.max(Math.abs(lx), Math.abs(ly)) < 0.4) { r = c1[0]; g = c1[1]; b = c1[2]; }
      } else if (intensity < 0.52) {
      } else if (intensity < 0.7) {
        if (Math.abs(lx) < 0.22 || Math.abs(ly) < 0.22) { r = c2[0]; g = c2[1]; b = c2[2]; }
      } else if (intensity < 0.86) {
        if (Math.abs(lx - ly) < 0.26) { r = c3[0]; g = c3[1]; b = c3[2]; }
      } else {
        if (Math.max(Math.abs(lx), Math.abs(ly)) < 0.48) { r = c4[0]; g = c4[1]; b = c4[2]; }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
