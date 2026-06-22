import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0516",
  num: 516,
  name: "0516",
  desc: "Color bands pattern",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-16",
  lineage: "AI generated and curated",
  code: `// Pattern: 0516
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-16
// Lineage: AI generated and curated
//
// Controls:
// Knob 1 (Normalized): Ribbon Base Hue
// Knob 2 (Value): Oscillation Speed
// Knob 3 (Normalized): Number of Ribbons (Density)
// Knob 4 (Normalized): Amplitude/Height Spread

function hsv(h, s, v) {
  h = (h % 1.0 + 1.0) % 1.0;
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
  return (Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255);
}

export function setup(params) {
  params.hue = 0.5;
  params.speed = 1.0;
  params.ribbons = 0.5;
  params.amplitude = 0.5;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobNormalized) {
    params.hue = input.knobNormalized[0];
    params.speed = input.knobValues[1] || 1.0;
    params.ribbons = input.knobNormalized[2];
    params.amplitude = input.knobNormalized[3];
  }
  params.timeAcc += dt * params.speed * 2.0;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  
  let numRibbons = Math.floor(2 + params.ribbons * 8);
  let amp = 5.0 + params.amplitude * (h / 2.0 - 5.0);
  let s = 0.05;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx = x * s;
      let totalGlow = 0.0;
      let sumHue = 0.0;

      // Render multiple overlapping ribbons
      for (let i = 0; i < numRibbons; i++) {
        let phaseOffset = i * 1.337;
        
        // 1D plasma slice moving through time
        let v1 = Math.sin(nx + t + phaseOffset);
        let v2 = Math.cos(nx * 1.5 - t * 0.8 + phaseOffset);
        let waveHeight = (v1 + v2) * amp;
        
        let ribbonCenterY = h / 2 + waveHeight;
        
        // Calculate distance from current pixel Y to ribbon center
        let dist = Math.abs(y - ribbonCenterY);
        
        // Additive glow logic
        if (dist < 4.0) {
          let glow = 1.0 / (dist + 1.0); // Inverse distance falloff
          glow = Math.pow(glow, 1.5);
          totalGlow += glow;
          // Mix hue based on ribbon index
          sumHue += params.hue + i * 0.1; 
        }
      }

      let r = 0, g = 0, b = 0;
      if (totalGlow > 0.1) {
        let avgHue = (sumHue / Math.max(1, Math.ceil(totalGlow))) % 1.0;
        let val = Math.min(1.0, totalGlow * 0.8);
        
        let c = hsv(avgHue, 1.0 - val * 0.3, val);
        r = (c >> 16) & 0xFF; g = (c >> 8) & 0xFF; b = c & 0xFF;
      }
      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
