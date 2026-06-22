import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0512",
  num: 512,
  name: "0512",
  desc: "Symmetric flower/petal-like polar coordinates pattern",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-12",
  lineage: "AI generated and curated",
  code: `// Pattern: 0512
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-12
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

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function setup(params) {
    params.hueBase = 0.85;
    params.speed = 1.0;
    params.petals = 6.0;
    params.fold = 1.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase = (params.hueBase + input.knobDeltas[0] * 0.05) % 1.0;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.petals = clamp(params.petals + input.knobDeltas[2] * 0.5, 3.0, 16.0);
    params.fold = clamp(params.fold + input.knobDeltas[3] * 0.05, 0.0, 5.0);
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let cx = display.width * 0.5;
    let cy = display.height * 0.5;
    let p = Math.floor(params.petals);
    let fold = params.fold;

    for (let y = 0; y < display.height; y++) {
        let dy = y - cy;
        for (let x = 0; x < display.width; x++) {
            let dx = x - cx;
            
            let angle = Math.atan2(dy, dx);
            let dist = Math.sqrt(dx * dx + dy * dy);
            
            // Sacred Geometry / Lotus math
            // The radius modulates based on the angle to create petals
            let petalWave = Math.sin(angle * p + t * 2.0);
            let targetDist = 15.0 + petalWave * 10.0 + Math.sin(dist * 0.5 - t * 3.0) * fold * 5.0;
            
            let val = Math.abs(dist - targetDist);
            
            let r = 0, g = 0, b = 0;
            
            if (val < 1.5) {
                // Bright outline
                let rgb = hsvToRgb(params.hueBase, 0.5, 1.0);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (val < 5.0 && dist < targetDist) {
                // Inner petal glow
                let rgb = hsvToRgb((params.hueBase + 0.1) % 1.0, 0.9, 1.0 - (val / 5.0));
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (dist < targetDist * 0.4) {
                // Core
                if ((x + y + Math.floor(t * 10)) % 3 === 0) {
                    let rgb = hsvToRgb((params.hueBase + 0.4) % 1.0, 1.0, 1.0);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            } else if (val < 10.0 && dist > targetDist) {
                // Outer aura
                if (Math.floor(angle * 20.0) % 2 === 0) {
                    let rgb = hsvToRgb((params.hueBase + 0.6) % 1.0, 1.0, 0.4 * (1.0 - val/10.0));
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            }
            
            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
