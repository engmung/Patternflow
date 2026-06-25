import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0614-2",
  num: 614.02,
  name: "0614-2",
  desc: "Hyper-Dimensional Folded Cross Matrix",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-14",
  lineage: "AI generated and curated",
  code: `// Pattern: 0614-2
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-14
// Lineage: AI generated and curated
//
// Hyper-Dimensional Folded Cross Matrix
// Knob 1: Matrix Scale/Density (0.0 to 1.0)
// Knob 2: Translation Core Speed (0.1 to 10.0)
// Knob 3: Spatial Tiling Grid Fold Limit (0.0 to 4.9)
// Knob 4: Color Inversion Mask State (0.0 to 1.0)

export function setup(params) {
    params.scale = 0.5;
    params.speed = 2.0;
    params.folds = 2.5;
    params.colorMask = 0.3;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.scale = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.folds = input.knobValues[2];
        params.colorMask = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let fSize = 8 + Math.floor(params.scale * 24);
    let foldLimit = params.folds;

    for (let y = 0; y < h; y++) {
        // Advanced coordinate mirror packing
        let fy = Math.abs((y % (fSize * 2)) - fSize) * foldLimit;
        for (let x = 0; x < w; x++) {
            let fx = Math.abs((x % (fSize * 2)) - fSize) * foldLimit;

            // Generate interlocking hard geometries inside folded matrix spaces
            let crossA = Math.sin(fx * 0.2 + t) * Math.cos(fy * 0.2 - t);
            let crossB = Math.cos(fx * 0.1 - t * 1.5) * Math.sin(fy * 0.1 + t);
            
            let combined = Math.abs(crossA + crossB);

            let r = 0, g = 0, b = 0;

            if (combined > 0.65) {
                let mask = params.colorMask;
                let edge = (combined - 0.65) / 0.35;

                // Absolute punchy neon fill colors
                if (mask < 0.5) {
                    r = Math.floor(255 * edge);
                    g = 0;
                    b = Math.floor(120 + 135 * (1.0 - edge));
                } else {
                    r = 0;
                    g = Math.floor(255 * edge);
                    b = Math.floor(180 * edge);
                }

                // Sharp laser lines tracking intersections
                if (combined > 0.92) {
                    r = 255; g = 255; b = 255;
                }
            } else if (combined < 0.08) {
                // Sharp vector dots tracking inverse centers
                r = 255; g = 255; b = 0;
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
