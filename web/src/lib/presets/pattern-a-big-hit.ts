import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-a-big-hit",
  num: 9999,
  name: "a big hit",
  desc: "Liquid plasma with chaos-warped neon ridges",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-11",
  lineage: "AI generated and curated",
  code: `// Pattern: a big hit
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-11
// Lineage: AI generated and curated
//
// Liquid plasma with chaos-warped neon ridges
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
    params.hueBase = 0.5;
    params.speed = 1.0;
    params.scale = 0.1;
    params.chaos = 1.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase = (params.hueBase + input.knobDeltas[0] * 0.05) % 1.0;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.scale = clamp(params.scale + input.knobDeltas[2] * 0.01, 0.02, 0.2);
    params.chaos = clamp(params.chaos + input.knobDeltas[3] * 0.1, 0.0, 3.0);
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let s = params.scale;
    let c = params.chaos;

    for (let y = 0; y < display.height; y++) {
        let ny = y * s;
        for (let x = 0; x < display.width; x++) {
            let nx = x * s;
            
            // Nested trigonometric functions for liquid plasma/domain warping
            let v1 = Math.sin(nx + t);
            let v2 = Math.cos(ny - t * 0.8);
            
            // Add chaos distortion
            let warpX = Math.sin(ny * 2.0 + t) * c;
            let warpY = Math.cos(nx * 2.0 - t * 1.2) * c;
            
            let v3 = Math.sin((nx + warpX) * 1.5 + t * 1.5);
            let v4 = Math.cos((ny + warpY) * 1.5 - t);
            
            // Combine fields and take absolute value to create sharp interference "ridges"
            let field = Math.abs(v1 + v2 + v3 + v4);
            
            // Invert and sharpen: 0.0 is empty, highly peaked at exactly the ridges
            let val = 1.0 - (field * 0.5);
            val = Math.pow(clamp(val, 0.0, 1.0), 3.0); // pow is ok sparsely, makes neon tubes pop
            
            // Boost brightness to ensure LED pop
            val = clamp(val * 2.5, 0.0, 1.0);

            // Deep organic color shifting based on position
            let hue = (params.hueBase + nx * 0.1 + ny * 0.1 + field * 0.05) % 1.0;
            
            let rgb = hsvToRgb(hue, 1.0 - val * 0.2, val); // Desaturate slightly at absolute brightest centers
            display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
        }
    }
}`,
};
