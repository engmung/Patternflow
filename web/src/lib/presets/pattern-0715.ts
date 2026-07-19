import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0715",
  num: 715,
  name: "0715",
  desc: "Poincaré sphere projection visualization",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-15",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// ===== Patternflow pattern =====
// Title:   Poincaré Sphere
// Author:  Seunghun LEE
// Date:    2026-07-15
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Poincaré Sphere
// Author: Collaborator
// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Knob 1: 위상 변화 컬러톤 (0.0 to 1.0)
// Knob 2: 구면 자전 속도 (0.1 to 10.0)
// Knob 3: 구면 위선/경선 조밀도 (0.0 to 4.9)
// Knob 4: 정사영 왜곡 곡률 (0.0 to 1.0)

export function setup(params) {
    params.hue = 0.4;
    params.speed = 2.0;
    params.density = 2.5;
    params.curve = 0.5;
    params.time = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.hue = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.density = input.knobValues[2];
        params.curve = input.knobValues[3];
    }
    params.time += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.time;

    let cx = w / 2;
    let cy = h / 2;
    
    let gridCount = 2.0 + params.density * 3.0; // 격자 조밀도
    let curvature = 0.1 + params.curve * 2.0;

    for (let y = 0; y < h; y++) {
        let dy = (y - cy) / cy; // -1.0 to 1.0
        for (let x = 0; x < w; x++) {
            let dx = (x - cx) / cy; // -w/h to w/h

            let r2 = dx * dx + dy * dy;
            
            // 3D 구면 정사영 왜곡 인자
            let projectionScale = 1.0 / (1.0 + r2 * curvature);
            let sphereX = dx * projectionScale;
            let sphereY = dy * projectionScale;

            // 왜곡 좌표계 기반의 평형 가상 웨이브
            let waveU = Math.sin(sphereX * gridCount * 6.28 + t);
            let waveV = Math.sin(sphereY * gridCount * 6.28 - t * 0.7);

            // 격자 선 검출
            let line = Math.abs(waveU) * Math.abs(waveV);
            let r = 0, g = 0, b = 0;

            if (line < 0.15) {
                let intensity = (1.0 - line / 0.15);
                
                r = Math.floor(intensity * 128 * params.hue);
                g = Math.floor(intensity * 255 * (1.0 - params.hue));
                b = Math.floor(intensity * 255);

                if (line < 0.03) {
                    r = 255; g = 255; b = 255;
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
