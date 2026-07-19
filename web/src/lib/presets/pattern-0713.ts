import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0713",
  num: 713,
  name: "0713",
  desc: "Particles wandering like fireflies in a dark space",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-13",
  lineage: "AI generated and curated via Pattern Lab",
  labOnly: true,
  code: `// ===== Patternflow pattern =====
// Title:   260713_Firefly
// Author:  Seunghun LEE
// Date:    2026-07-13
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Firefly Hollow (Summer Night Valley)
// 세로(64x128) 구성 — 달/fBM 구름 / 언덕 실루엣 / 흔들리는 풀숲 / 점멸 반딧불이
// @knobs Flies=2..14, Speed=0.2..3, Glow=1.5..6, Wind=0..1
//
// Knob 1 (Flies): 반딧불이 개체 수
// Knob 2 (Speed): 유영/점멸 속도
// Knob 3 (Glow): 발광 반경 (빛번짐 크기)
// Knob 4 (Wind): 풀숲 흔들림 세기 (+구름 드리프트 가속)

function hash(n) {
    let s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
}

// 2D 밸류 노이즈: 정수 격자 해시 + 코사인 보간
function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = (1 - Math.cos(xf * Math.PI)) * 0.5;
    const sy = (1 - Math.cos(yf * Math.PI)) * 0.5;
    const a = hash(xi * 12.9898 + yi * 78.233);
    const b = hash((xi + 1) * 12.9898 + yi * 78.233);
    const c = hash(xi * 12.9898 + (yi + 1) * 78.233);
    const d = hash((xi + 1) * 12.9898 + (yi + 1) * 78.233);
    const ab = a + (b - a) * sx;
    const cd = c + (d - c) * sx;
    return ab + (cd - ab) * sy;
}

export function setup(params) {
    params.flies = 8;
    params.speed = 1.0;
    params.glow = 3.0;
    params.wind = 0.4;
    params.t = 0;
    // 반딧불이 좌표/밝기 버퍼 (정규화 0..1) — 프레임당 할당 방지
    params.fu = new Float32Array(16);
    params.fv = new Float32Array(16);
    params.fb = new Float32Array(16);
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.flies = Math.round(input.knobValues[0]);
        params.speed = input.knobValues[1];
        params.glow = input.knobValues[2];
        params.wind = input.knobValues[3];
    }
    params.t += dt * params.speed;

    const t = params.t;
    const n = Math.min(16, params.flies);
    for (let i = 0; i < n; i++) {
        const s1 = 0.13 + 0.11 * hash(i * 7.1);
        const s2 = 0.09 + 0.13 * hash(i * 13.7);
        // 리사주 유영 (아래쪽 2/3 영역에서)
        params.fu[i] = 0.5 + 0.44 * Math.sin(t * s1 * 2.0 + i * 2.39);
        params.fv[i] = 0.62 + 0.30 * Math.sin(t * s2 * 2.0 + i * 5.17)
                            + 0.05 * Math.sin(t * 0.9 + i);
        // 숨쉬듯 점멸 (개체마다 위상/주기 다름)
        const p = Math.sin(t * (0.8 + 0.5 * hash(i * 3.3)) + i * 1.7);
        params.fb[i] = Math.max(0, p) ** 3;
    }
}

export function draw(display, params, time) {
    const W = display.width, H = display.height;
    const FLIP = 0;
    const portrait = W < H;
    const vw = portrait ? W : H;
    const vh = portrait ? H : W;

    const t = params.t;
    const n = Math.min(16, params.flies);
    const g2 = params.glow * params.glow;
    const cloudDrift = t * (0.4 + params.wind * 0.8);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let u, v;
            if (portrait) { u = x; v = y; }
            else if (FLIP) { u = H - 1 - y; v = x; }
            else { u = y; v = W - 1 - x; }

            // --- 하늘: 위가 짙고 아래로 은은한 지평 헤이즈 ---
            const g = v / vh;
            let val = 0.05 + 0.14 * g;

         
            // --- 구름: 2옥타브 fBM 밸류 노이즈, 덩어리 형태 ---
            if (v < vh * 0.5) {
                // 옥타브별로 다른 속도로 흘러 → 이동하며 형태가 변형됨
                let cn = noise2(u * 0.045 + cloudDrift * 0.12,
                                v * 0.09 + cloudDrift * 0.015) * 0.65
                       + noise2(u * 0.11 - cloudDrift * 0.07,
                                v * 0.22 + 40.0) * 0.35;
                // 높이 감쇠: 위쪽 하늘에 몰리고 아래로 갈수록 옅어짐
                cn *= 1.0 - (v / (vh * 0.5)) * 0.7;
                // soft threshold: 가장자리는 옅은 안개, 중심은 진한 덩어리
                const cd = (cn - 0.38) / 0.18;
                if (cd > 0) {
                    const soft = cd > 1 ? 1 : cd * cd * (3 - 2 * cd); // smoothstep
                    const lit = 1.0 + 0.5;
                    val += soft * 0.13 * lit;
                }
            }

            // --- 먼 언덕 실루엣 ---
            const hillTop = vh * 0.58
                + Math.sin(u * 0.09 + 2.0) * 5
                + Math.sin(u * 0.023) * 8;
            if (v >= hillTop) val = 0.07;

            // --- 풀숲 (앞쪽, 바람에 출렁이는 실루엣) ---
            const sway = Math.sin(u * 0.3 + t * 1.8) * params.wind * 4
                       + Math.sin(u * 0.9 - t * 2.6) * params.wind * 2;
            const gh = 10 + hash(Math.floor(u / 2) * 5.3) * 16;
            const grassTop = vh - gh + sway;
            if (v >= grassTop) {
                val = 0.015;
                if (v - grassTop < 1.2) val = 0.11; // 달빛 받은 풀끝
            }

            // --- 반딧불이 (가산 발광, 풀 위에도 비침) ---
            for (let i = 0; i < n; i++) {
                const du = u - params.fu[i] * vw;
                const dv = v - params.fv[i] * vh;
                const dd = du * du + dv * dv;
                if (dd < g2 * 9) {
                    val += params.fb[i] * Math.exp(-dd / g2);
                }
            }

            display.setValue(x, y, Math.max(0, Math.min(1, val)));
        }
    }
}

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
