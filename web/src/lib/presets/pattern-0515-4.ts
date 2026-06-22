import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0515-4",
  num: 515.04,
  name: "0515-4",
  desc: "Grid complexity and cell patterns",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-15",
  lineage: "AI generated and curated",
  code: `// Pattern: 0515-4
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Knob 1 (0-1): Grid complexity (size of cells)
// Knob 2 (0.1-10): Mechanical oscillation speed
// Knob 3 (0-4.9): Joint thickness (gear tooth size)
// Knob 4 (0-1): Sharpness vs inner fill brightness

function hsvToRgb(h, s, v) {
  h = h - Math.floor(h);
  if (h < 0) h += 1;
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

export function setup(params) {
  params.k1 = 0;
  params.k2 = 2;
  params.k3 = 0;
  params.k4 = 0.06;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.k1 = input.knobValues[0];
    params.k2 = input.knobValues[1];
    params.k3 = input.knobValues[2];
    params.k4 = input.knobValues[3];
  }
  params.timeAcc += dt * params.k2;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  
  let cellSize = Math.floor(8 + params.k1 * 16);
  let thickness = 1.0 + params.k3;
  let fillBright = params.k4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gx = Math.floor(x / cellSize);
      let gy = Math.floor(y / cellSize);
      
      let lx = (x % cellSize) - cellSize * 0.5;
      let ly = (y % cellSize) - cellSize * 0.5;

      // Checkerboard phase offset causes adjacent cells to "spin" inversely
      let isEven = (gx + gy) % 2 === 0;
      let phase = isEven ? t * 2.0 : -t * 2.0;

      // Simulated rotation via coordinate transform
      let rx = lx * Math.cos(phase) - ly * Math.sin(phase);
      let ry = lx * Math.sin(phase) + ly * Math.cos(phase);

      // SDF Cross / Gear shape
      let crossDist = Math.min(Math.abs(rx), Math.abs(ry));
      let boundary = Math.max(Math.abs(rx), Math.abs(ry));
      
      let r = 0, g = 0, b = 0;

      // Color logic: High contrast mechanic. Edges are pure white, fills are solid
      if (boundary < cellSize * 0.45 && crossDist < thickness) {
        // Inner edge highlight
        if (Math.abs(crossDist - thickness) < 0.8) {
          r = 255; g = 255; b = 255;
        } else {
          // Inner fill
          let localHue = isEven ? 0.05 : 0.55; // Orange vs Cyan checkerboard
          let c = hsvToRgb(localHue, 0.9, fillBright + 0.2);
          r = c[0]; g = c[1]; b = c[2];
        }
      } else if (boundary > cellSize * 0.45 && boundary < cellSize * 0.5) {
        // Outer mechanical housing boundary
        let c = hsvToRgb(0.8, 0.8, 0.3);
        r = c[0]; g = c[1]; b = c[2];
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
