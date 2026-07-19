import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0629-2",
  num: 629.02,
  name: "0629-2",
  desc: "Vector field particle flow simulation",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-29",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// ===== Patternflow pattern =====
// Title:   Vector Field Particle Flow
// Author:  Seunghun LEE
// Date:    2026-06-29
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Vector Field Particle Flow
// Author: Creative AI Collaborator
// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Knob 1: Field Turbulence / Curl
// Knob 2: Stream Velocity
// Knob 3: Particle Density Scaling
// Knob 4: Directional Palette Shift

function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (((i % 6) + 6) % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

export function setup(params) {
    params.turbulence = 0.5;
    params.speed = 2.0;
    params.density = 2.5;
    params.palette = 0.1;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.turbulence = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.density = input.knobValues[2];
        params.palette = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let nx = x / w - 0.5;
            let ny = y / h - 0.5;

            // 회전 벡터 필드 계산
            let angle = Math.sin(nx * params.density * 4.0 + t) + Math.cos(ny * params.density * 4.0 - t);
            let forceX = Math.sin(angle * params.turbulence * 5.0);
            let forceY = Math.cos(angle * params.turbulence * 5.0);

            let value = Math.sin((nx * forceX + ny * forceY) * 10.0 + t * 2.0);
            let intensity = Math.max(0.0, value * 0.5 + 0.5);

            let r = 0, g = 0, b = 0;
            if (intensity > 0.1) {
                let hue = params.palette + (angle / (Math.PI * 2)) + (forceX * 0.2);
                hue = Math.abs(hue % 1.0);
                
                let rgb = hsvToRgb(hue, 0.85, intensity);
                r = rgb[0]; g = rgb[1]; b = rgb[2];

                if (intensity > 0.88) {
                    r = 255; g = 255; b = 255;
                }
            }
            display.setPixel(x, y, r, g, b);
        }
    }
}

// ── Made with Patternflow · https://patternflow.work ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
