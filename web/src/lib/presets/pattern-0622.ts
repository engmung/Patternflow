import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0622",
  num: 622,
  name: "0622",
  desc: "Domain Remix: Hyperbolic Mirror Grid",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-22",
  lineage: "AI generated and curated",
  code: `// Pattern: 0622
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-22
// Lineage: AI generated and curated
//
// Domain Remix: Hyperbolic Mirror Grid
// Applies a dividing grid coordinate division that multiplies inwards toward the screen boundaries.
// Knob 1: Boundary Scaling Factor (0..1)
// Knob 2: Animation Speed (0.1..10.0) [Clamped, No Wrap]
// Knob 3: Sub-division Complexity Grid (0.0..4.9) [Clamped, No Wrap]
// Knob 4: Primary Color Domain Map (0..1)

export function setup(params) {
    params.boundary = 0.3;
    params.speed = 1.5;
    params.subdiv = 2.0;
    params.colorMap = 0.6;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        let v = input.knobValues;
        params.boundary = v[0];
        params.speed = v[1];
        params.subdiv = v[2];
        params.colorMap = v[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let divFactor = 1.0 + params.subdiv * 2.0;

    for (let y = 0; y < h; y++) {
        // Warp coordinates non-linearly outward from center
        let ny = (y - h / 2) / (h / 2);
        let wy = ny / (1.001 - Math.abs(ny) * params.boundary * 0.9);

        for (let x = 0; x < w; x++) {
            let nx = (x - w / 2) / (w / 2);
            let wx = nx / (1.001 - Math.abs(nx) * params.boundary * 0.9);

            let gridX = Math.floor((wx + 2.0) * divFactor);
            let gridY = Math.floor((wy + 2.0) * divFactor);

            let wave = Math.sin(gridX * 1.5 + gridY * 1.2 + t);
            let sig = (wave + 1.0) * 0.5;

            let r = 0, g = 0, b = 0;

            if (sig > 0.7) {
                r = 255; g = 255; b = 255;
            } else if (((gridX + gridY) % 2 === 0) && sig > 0.3) {
                r = Math.floor(40 + params.colorMap * 180);
                g = Math.floor(200 * sig);
                b = Math.floor(20 + (1.0 - params.colorMap) * 200);
            } else if (sig > 0.45) {
                r = 30; g = 40; b = 100;
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
