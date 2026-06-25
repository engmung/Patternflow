import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0614",
  num: 614,
  name: "0614",
  desc: "Concentric Velvet Rings with meditative vortex",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-14",
  lineage: "AI generated and curated",
  code: `// Pattern: 0614
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-14
// Lineage: AI generated and curated
//
// Concentric Velvet Rings: 부드러운 벨벳 질감의 물결이 원형으로 중첩되며 안쪽으로 빨려 들어가는 정적인 명상 효과
// Knob 1: Ring Frequency (동심원 링의 압축률)
// Knob 2: Vortex Speed (흡입 및 확장 속도)
// Knob 3: Edge Softness (경계면 소프트 필터 강도)
// Knob 4: Color Depth Hue (메인 테마 컬러 필터)

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
    params.freq = 2.0;
    params.speed = 1.8;
    params.soft = 0.5;
    params.hue = 0.8;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.freq = 0.5 + input.knobValues[0] * 5.0;
        params.speed = input.knobValues[1];
        params.soft = 0.1 + input.knobValues[2] * 0.9;
        params.hue = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;
    let cx = w / 2;
    let cy = h / 2;

    for (let y = 0; y < h; y++) {
        let dy = y - cy;
        for (let x = 0; x < w; x++) {
            let dx = x - cx;

            let dist = Math.sqrt(dx * dx + dy * dy) * 0.1;
            let wave = Math.sin(dist * params.freq - t);
            
            let smoothSig = Math.abs(wave);
            smoothSig = Math.pow(smoothSig, params.soft * 3.0);

            let r = 0, g = 0, b = 0;
            if (smoothSig > 0.05) {
                let hVal = (params.hue + dist * 0.01) % 1.0;
                let rgb = hsvToRgb(hVal, 0.85, smoothSig);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
                
                if (smoothSig > 0.9) {
                    r = Math.min(255, r + 80); g = Math.min(255, g + 80); b = Math.min(255, b + 80);
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
