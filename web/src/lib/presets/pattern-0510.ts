import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0510",
  num: 510,
  name: "0510",
  desc: "Deformed sine waves with distortion and color mapping",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-10",
  lineage: "AI generated and curated",
  code: `// Pattern: 0510
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-10
// Lineage: AI generated and curated
//
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

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function setup(params) {
    params.hueBase = 0.0;
    params.speed = 1.0;
    params.scale = 1.0;
    params.distortion = 1.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase += input.knobDeltas[0] * 0.05;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.hueBase %= 1.0;

    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.scale = Math.max(0.1, params.scale + input.knobDeltas[2] * 0.05);
    params.distortion = Math.max(0.0, params.distortion + input.knobDeltas[3] * 0.05);

    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let scaleFactor = params.scale * 0.15;
    let distAmount = params.distortion * 2.0;
    let hBase = params.hueBase;

    for (let y = 0; y < display.height; y++) {
        let ny = y * scaleFactor;
        
        let dyWave = Math.sin(ny * 0.6 + t * 0.8) * distAmount;
        let nyMain = ny - t * 1.2;

        for (let x = 0; x < display.width; x++) {
            let nx = x * scaleFactor;
            
            let dxWave = Math.cos(nx * 0.7 - t * 0.9) * distAmount;

            let val = Math.sin(nx + dyWave + t) + Math.cos(nyMain + dxWave);
            
            let normVal = clamp((val + 2.0) * 0.25, 0.0, 1.0);

            let r = 0, g = 0, b = 0;

            if (normVal < 0.3) {
                let rgb = hsvToRgb(hBase, 0.9, 1.0);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (normVal < 0.5) {
                r = 0; g = 0; b = 0;
            } else if (normVal < 0.7) {
                if (x % 3 === 0 && y % 3 === 0) {
                    let rgb = hsvToRgb((hBase + 0.33) % 1.0, 0.8, 1.0);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            } else {
                if ((x + y) % 4 < 2) {
                    let rgb = hsvToRgb((hBase + 0.66) % 1.0, 0.9, 1.0);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
