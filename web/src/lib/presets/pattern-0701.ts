import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0701",
  num: 701,
  name: "0701",
  desc: "Lissajous curve weaving generator",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-01",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// ===== Patternflow pattern =====
// Title:   Lissajous Weave
// Author:  Seunghun LEE
// Date:    2026-07-01
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Variation 16: Lissajous Weave (Structural Remix)
// Creates woven patterns using Lissajous curves with varying frequencies.
// Knob 1: X frequency (1-8)
// Knob 2: Speed (0.1-10.0)
// Knob 3: Y frequency (1-8)
// Knob 4: Phase offset (0.0-1.0)

export function setup(params) {
    params.freqX = 3.0;
    params.speed = 2.0;
    params.freqY = 4.0;
    params.phase = 0.5;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.freqX = 1 + Math.floor(input.knobValues[0] * 7);
        params.speed = input.knobValues[1];
        params.freqY = 1 + Math.floor(input.knobValues[2] * 7);
        params.phase = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;
    let fx = params.freqX;
    let fy = params.freqY;
    let phase = params.phase * Math.PI * 2;

    // Clear with background gradient
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let bg = Math.floor(10 + (x / w) * 20);
            display.setPixel(x, y, 0, bg, Math.floor(bg * 0.7));
        }
    }

    // Draw multiple Lissajous curves
    let numCurves = 12;
    for (let curve = 0; curve < numCurves; curve++) {
        let curvePhase = (curve / numCurves) * Math.PI * 2;
        let points = 300;
        let hue = (curve / numCurves + t * 0.01) % 1.0;
        
        for (let i = 0; i < points; i++) {
            let theta = (i / points) * Math.PI * 2 * 4 + t * 0.2;
            let cx = w/2 + Math.sin(theta * fx + t * 0.1 + curvePhase) * (w * 0.4);
            let cy = h/2 + Math.sin(theta * fy + t * 0.15 + curvePhase + phase) * (h * 0.4);
            
            let px = Math.floor(cx);
            let py = Math.floor(cy);
            
            if (px >= 0 && px < w && py >= 0 && py < h) {
                let brightness = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(theta * 3));
                let saturation = 0.8;
                
                let hh = hue * 6;
                let i = Math.floor(hh);
                let f = hh - i;
                let p = brightness * (1 - saturation);
                let q = brightness * (1 - saturation * f);
                let tt = brightness * (1 - saturation * (1 - f));
                let r, g, b;
                switch (i % 6) {
                    case 0: r = brightness; g = tt; b = p; break;
                    case 1: r = q; g = brightness; b = p; break;
                    case 2: r = p; g = brightness; b = tt; break;
                    case 3: r = p; g = q; b = brightness; break;
                    case 4: r = tt; g = p; b = brightness; break;
                    case 5: r = brightness; g = p; b = q; break;
                }
                
                // 직접 픽셀 설정 (additive 대신)
                display.setPixel(px, py,
                    Math.floor(r * 255),
                    Math.floor(g * 255),
                    Math.floor(b * 255)
                );
            }
        }
    }
}

// ── Made with Patternflow · https://patternflow.work ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
