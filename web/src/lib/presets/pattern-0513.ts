import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0513",
  num: 513,
  name: "0513",
  desc: "Sine/cosine wave interference pattern",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-13",
  lineage: "AI generated and curated",
  code: `// Pattern: 0513
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-13
// Lineage: AI generated and curated
//


function hsvToRgb(h, s, v) {
    let r, g, b;
    h = h - Math.floor(h);
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
        default: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wrap01(v) { v = v - Math.floor(v); if (v < 0) v += 1.0; return v; }
function mix(a, b, t) { return a + (b - a) * t; }
function mixHue(a, b, t) {
    let d = b - a;
    if (d > 0.5) d -= 1.0;
    if (d < -0.5) d += 1.0;
    return wrap01(a + d * t);
}

export function setup(params) {
    params.hue = 0.56; params.speed = 0.42; params.mode = 0.35; params.freq = 0.45;
    params.hueT = params.hue; params.speedT = params.speed; params.modeT = params.mode; params.freqT = params.freq;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    let d0 = 0.0, d1 = 0.0, d2 = 0.0, d3 = 0.0;
    if (input && input.knobDeltas) {
        d0 = input.knobDeltas[0] || 0.0; d1 = input.knobDeltas[1] || 0.0;
        d2 = input.knobDeltas[2] || 0.0; d3 = input.knobDeltas[3] || 0.0;
    }
    params.hueT = wrap01(params.hueT + d0 * 0.012);
    params.speedT = clamp(params.speedT + d1 * 0.018, 0.0, 1.0);
    params.modeT = clamp(params.modeT + d2 * 0.018, 0.0, 1.0);
    params.freqT = clamp(params.freqT + d3 * 0.018, 0.0, 1.0);
    let s = clamp(dt * 7.5, 0.0, 1.0);
    params.hue = mixHue(params.hue, params.hueT, s);
    params.speed = mix(params.speed, params.speedT, s);
    params.mode = mix(params.mode, params.modeT, s);
    params.freq = mix(params.freq, params.freqT, s);
    params.timeAcc += dt * (0.18 + params.speed * 1.85);
}

export function draw(display, params, time) {
    let w = display.width, h = display.height;
    let t = params.timeAcc, hue = params.hue, mode = params.mode, freq = params.freq;

    let cellSize = Math.floor(mix(16.0, 4.0, freq));
    let invCell = 1.0 / cellSize;
    let c1 = hsvToRgb(hue, 0.9, 1.0);
    let shiftIntensity = mix(0.0, 3.0, mode);

    for (let y = 0; y < h; y++) {
        let gy = Math.floor(y * invCell);
        let shiftX = Math.floor(Math.sin(gy * 0.5 + t * 2.0) * cellSize * shiftIntensity);
        let ny = (y - gy * cellSize) * invCell - 0.5;
        let absNy = Math.abs(ny);
        
        for (let x = 0; x < w; x++) {
            let effX = x + shiftX;
            let gx = Math.floor(effX * invCell);
            let nx = (effX - gx * cellSize) * invCell - 0.5;
            let absNx = Math.abs(nx);

            let r = 0, g = 0, b = 0;
            let mask = (gx + gy) % 2 === 0;
            
            if (mask) {
                if (absNx < 0.3 && absNy < 0.3) {
                    r = c1[0]; g = c1[1]; b = c1[2];
                }
            } else {
                if (absNx > 0.4 || absNy > 0.4) {
                    r = 255; g = 255; b = 255;
                }
            }
            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
