import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0629",
  num: 629,
  name: "0629",
  desc: "Chromatic aberration vortex waves",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-29",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// ===== Patternflow pattern =====
// Title:   Chromatic Aberration Vortex
// Author:  Seunghun LEE
// Date:    2026-06-29
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Chromatic Aberration Vortex
// Author: Creative AI Collaborator
// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Knob 1: Aberration Split Distance
// Knob 2: Rotation Swirl Speed
// Knob 3: Vortex Ring Wave Density
// Knob 4: Base Color Shift Matrix

export function setup(params) {
    params.split = 0.4;
    params.speed = 1.5;
    params.density = 2.0;
    params.colorBias = 0.5;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.split = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.density = input.knobValues[2];
        params.colorBias = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let cx = w / 2, cy = h / 2;
    let maxShift = params.split * 8.0;

    for (let y = 0; y < h; y++) {
        let dy = y - cy;
        for (let x = 0; x < w; x++) {
            let dx = x - cx;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let angle = Math.atan2(dy, dx);

            // R, G, B 개별 채널에 서로 다른 물리 왜곡 위상(반경/각도) 적용
            let shiftR = Math.sin(dist * 0.05 - t) * maxShift;
            let shiftG = Math.sin(dist * 0.05 - t + 1.0) * maxShift * 0.5;
            let shiftB = Math.sin(dist * 0.05 - t + 2.0) * maxShift * -0.5;

            // Red Channel Matrix
            let rDist = dist + shiftR;
            let rWave = Math.sin(rDist * (params.density * 0.1 + 0.05) - t * 2.0 + angle);
            let rInt = Math.max(0.0, rWave * 0.5 + 0.5);

            // Green Channel Matrix
            let gDist = dist + shiftG;
            let gWave = Math.sin(gDist * (params.density * 0.1 + 0.05) - t * 2.0 + angle + 1.0);
            let gInt = Math.max(0.0, gWave * 0.5 + 0.5);

            // Blue Channel Matrix
            let bDist = dist + shiftB;
            let bWave = Math.sin(bDist * (params.density * 0.1 + 0.05) - t * 2.0 + angle + 2.0);
            let bInt = Math.max(0.0, bWave * 0.5 + 0.5);

            // 컬러 마스터 바이어스 합성
            let r = Math.floor(rInt * 255 * (params.colorBias * 0.5 + 0.5));
            let g = Math.floor(gInt * 255 * (1.0 - params.colorBias * 0.3));
            let b = Math.floor(bInt * 255 * (0.3 + params.colorBias * 0.7));

            // 채널들이 완벽히 중첩되는 피크는 완전한 흰색 광원 형성
            if (rInt > 0.85 && gInt > 0.85 && bInt > 0.85) {
                r = 255; g = 255; b = 255;
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
