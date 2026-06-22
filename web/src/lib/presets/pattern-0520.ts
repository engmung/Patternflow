import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0520",
  num: 520,
  name: "0520",
  desc: "Bio-luminescent tendrils with fluid motion",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-20",
  lineage: "AI generated and curated",
  code: `// Pattern: 0520
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-20
// Lineage: AI generated and curated
//
// Bio-Luminescent Tendrils
// Knob 1: Wave Density (spatial frequency density)
// Knob 2: Fluid Speed (animation speed)
// Knob 3: Tendril Thicken (tendril thickness and cohesion)
// Knob 4: Color Mutation (position-based color mutation range)

function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function setup(params) {
    params.density = 0.5;
    params.speed = 1.0;
    params.thickness = 0.5;
    params.mutation = 0.5;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.density = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.thickness = input.knobValues[2];
        params.mutation = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let w = display.width;
    let h = display.height;

    // Adjust knob mapping
    let freq = 0.03 + params.density * 0.12;
    let thickScale = 0.5 + params.thickness * 2.5;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let nx = x * freq;
            let ny = y * freq;

            // Generate honeycomb-shaped structural distortion field
            let f1 = Math.sin(nx + t) * Math.cos(ny + t * 0.5);
            let f2 = Math.sin(ny - t * 0.7) * Math.cos(nx - t * 0.3);
            
            // Synthesize organic tendril network
            let nX = nx + f1 * 1.5;
            let nY = ny + f2 * 1.5;
            
            let v1 = Math.sin(nX * 2.0 - t * 0.8);
            let v2 = Math.cos(nY * 2.0 + t * 1.1);
            let centerField = Math.abs(v1 + v2);

            // Smoothly extract tendril boundaries
            let val = Math.exp(-Math.pow(centerField - 0.4, 2.0) * thickScale);
            val = clamp(val * 1.8, 0.0, 1.0);

            // Colorful color combinations tied to local phase and fluidity
            let hue = (0.2 + params.mutation * (x / w) + f1 * 0.1 + t * 0.04) % 1.0;
            if (hue < 0) hue += 1.0;

            // Induce white light at the bright centerlines
            let sat = clamp(1.0 - val * 0.4, 0.5, 1.0);
            let rgb = hsvToRgb(hue, sat, val);

            display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
        }
    }
}`,
};
