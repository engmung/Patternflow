import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0619",
  num: 619,
  name: "0619",
  desc: "Bitwise Interference Shards with cyberpunk colors",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-19",
  lineage: "AI generated and curated",
  code: `// Pattern: 0619
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-19
// Lineage: AI generated and curated
//
// Bitwise Interference Shards
// Knob 1: Block Division Resolution (0.0 to 1.0)
// Knob 2: Transition Frequency Speed (0.1 to 10.0)
// Knob 3: Bitwise Shift Modifier (0.0 to 4.9)
// Knob 4: Color Mapping Selection (0.0 to 1.0)

export function setup(params) {
    params.res = 0.5;
    params.speed = 2.0;
    params.bitMod = 2.0;
    params.palette = 0.3;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.res = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.bitMod = input.knobValues[2];
        params.palette = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let blockSize = 4 + Math.floor(params.res * 16);
    let shiftVal = Math.floor(params.bitMod) + 1;

    for (let y = 0; y < h; y++) {
        // 비트연산과 결합하기 위한 축 데이터 정수화 및 미러링
        let bx = Math.floor(y / blockSize);
        let my = Math.abs((y % (blockSize * 2)) - blockSize);

        for (let x = 0; x < w; x++) {
            let ax = Math.floor(x / blockSize);
            let mx = Math.abs((x % (blockSize * 2)) - blockSize);

            // 정수 그리드 ID에 대한 비트 XOR 간섭 유도
            let shardId = (ax ^ bx) << shiftVal;
            let wave = Math.sin((mx + my) * 0.3 + (shardId * 0.1) + t);
            let combined = Math.abs(wave);

            let r = 0, g = 0, b = 0;

            if (combined > 0.6) {
                let norm = (combined - 0.6) / 0.4;
                
                // 테마 분기를 통한 사이버펑크 3색 스웨치 맵핑
                if (params.palette < 0.5) {
                    // Ice & Violet
                    r = Math.floor(130 * norm);
                    g = Math.floor(255 * (1.0 - norm));
                    b = 255;
                } else {
                    // Gold & Crimson
                    r = 255;
                    g = Math.floor(180 * norm);
                    b = 0;
                }

                if (combined > 0.93) {
                    r = 255; g = 255; b = 255;
                }
            } else if (combined < 0.05) {
                // 파편의 경계면을 분리해주는 완전 암전 그루브 라인 스티치
                r = 20; g = 20; b = 40;
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
