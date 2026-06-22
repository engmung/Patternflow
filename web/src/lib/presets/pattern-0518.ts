import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0518",
  num: 518,
  name: "0518",
  desc: "Vertical/horizontal cross glitch patterns",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-18",
  lineage: "AI generated and curated",
  code: `// Pattern: 0518
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-18
// Lineage: AI generated and curated
//
// Controls:
// Knob 1: Palette Split (distance between band colors)
// Knob 2: Animation Speed
// Knob 3: Shear Amplitude (horizontal stretching)
// Knob 4: Band Frequency (number of slices)

function hsvToRgb(h, s, v) {
  h = (h % 1 + 1) % 1;
  let i = Math.floor(h * 6), f = h * 6 - i;
  let p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
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

function hash21(x, y) {
  let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function noise2D(x, y) {
  let ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  let ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  let a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

export function setup(params) {
  params.split = 0.5;
  params.speed = 1.0;
  params.shear = 20.0;
  params.bands = 0.1;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.split = input.knobValues[0];
    params.speed = input.knobValues[1] * 2.0;
    params.shear = input.knobValues[2] * 40.0;
    params.bands = 0.02 + input.knobValues[3] * 0.2;
  }
  params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
  let w = display.width, h = display.height;
  let t = params.timeAcc;

  for (let y = 0; y < h; y++) {
    // Determine which band we are in
    let bandId = Math.floor(y * params.bands);
    let bandFract = (y * params.bands) - bandId;
    
    // Alternate direction and speed per band
    let dir = (bandId % 2 === 0) ? 1 : -1;
    let bandSpeed = dir * (1.0 + noise2D(bandId, 0) * 2.0) * t;
    
    // Shear offset based on band noise
    let offset = noise2D(bandId * 5.1, t * 0.2) * params.shear;
    
    for (let x = 0; x < w; x++) {
      let shearedX = x + offset + bandSpeed;
      let n = noise2D(shearedX * 0.05, y * 0.05);
      
      // Color logic: alternating bands use split complementary hues
      let localHue = (bandId % 2 === 0) ? n * 0.2 : params.split + n * 0.2;
      
      // Add a slight darkening at the edges of the bands to separate them
      let edgeDarken = Math.sin(bandFract * Math.PI);
      let val = Math.max(0, (n * 1.5) * edgeDarken);
      
      let rgb = hsvToRgb(localHue, 0.8, Math.min(1, val));
      display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}`,
};
