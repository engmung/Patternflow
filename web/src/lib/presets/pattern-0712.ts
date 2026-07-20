import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0712",
  num: 712,
  name: "0712",
  desc: "Emergent waves resembling a midsummer sea",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-12",
  lineage: "AI generated and curated via Pattern Lab",
  labOnly: true,
  code: `// ===== Patternflow pattern =====
// Title:   260712_Midsummer Sea
// Author:  Seunghun LEE
// Date:    2026-07-12
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Midsummer Sea (Vertical Pixel Seascape)
// 세로(64x128) 구성 — 하늘/태양/원근 파도/윤슬/해변 포말 레이어
// @knobs Waves=0..1, Speed=0.1..3, Sun=0..1, Glitter=0..1
//
// Knob 1 (Waves): 파도 진폭 + 해변에 밀려오는 물의 세기
// Knob 2 (Speed): 전체 시간 흐름 속도
// Knob 3 (Sun): 태양 고도 (0=수평선 노을, 1=한낮)
// Knob 4 (Glitter): 윤슬(반짝임) 밀도

function hash(n) {
    let s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
}

export function setup(params) {
    params.waves = 0.5;
    params.speed = 1.0;
    params.sun = 0.7;
    params.glit = 0.5;
    params.t = 0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.waves = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.sun = input.knobValues[2];
        params.glit = input.knobValues[3];
    }
    params.t += dt * params.speed;
}

export function draw(display, params, time) {
    const W = display.width, H = display.height;
    const FLIP = 0; // 패널 장착 방향 반대면 1
    const portrait = W < H;
    const vw = portrait ? W : H;
    const vh = portrait ? H : W;

    const t = params.t;
    const amp = params.waves;
    const horizon = Math.floor(vh * 0.34);
    const beachTop = vh - Math.floor(vh * 0.14);
    const sunU = vw * 0.5;
    const sunV = horizon - 3 - params.sun * (horizon - 8);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let u, v;
            if (portrait) { u = x; v = y; }
            else if (FLIP) { u = H - 1 - y; v = x; }
            else { u = y; v = W - 1 - x; }

            let val;

            if (v < horizon) {
                // --- 하늘: 수평선 쪽이 밝은 헤이즈 그라디언트 ---
                const g = v / horizon;
                val = 0.12 + 0.38 * g;

                // 태양 디스크 + 글로우
                const du = u - sunU, dv = (v - sunV) * 1.2;
                const d = Math.sqrt(du * du + dv * dv);
                if (d < 4.5) val = 1.0;
                else val += 0.7 * Math.exp(-d * 0.18);

                // 얇은 구름 밴드 (느리게 흐름)
                const cl = Math.sin(u * 0.11 + v * 0.9 + t * 0.25)
                         + Math.sin(u * 0.05 - v * 0.5 + 2.0);
                if (cl > 1.2 && v < horizon * 0.8) val += 0.12;

            } else if (v < beachTop) {
                // --- 바다: 원근 파도 밴드 ---
                const depth = (v - horizon) / (beachTop - horizon); // 0=수평선, 1=해변 앞
                const persp = 1.0 / (depth + 0.09);
                const wob = Math.sin(u * 0.25 + t * 1.3) * 0.5 * amp;
                const band = Math.sin(persp * 2.6 + wob + t * (1.5 + depth * 2.0));
                val = 0.42 - 0.22 * depth
                    + band * (0.06 + 0.14 * amp) * (0.4 + depth);

                // 태양 반사 기둥 (윤슬 길, 살짝 흔들림)
                const pathW = 2.5 + depth * 9.0;
                const sway = Math.sin(v * 0.5 + t) * amp * 2.0;
                const inPath = Math.abs(u - sunU + sway) < pathW;
                if (inPath) val += 0.12 + 0.1 * (1.0 - depth);

                // 윤슬 스파클 (파도 마루에서만 터짐)
                const sp = hash(u * 7.3 + v * 13.1 + Math.floor(t * 7.0) * 17.7);
                const thr = 1.0 - params.glit * (inPath ? 0.10 : 0.03);
                if (sp > thr && band > 0.2) val = 1.0;

            } else {
                // --- 해변: 모래 질감 + 밀려오는 포말 라인 ---
                const s = (v - beachTop) / (vh - beachTop);
                val = 0.5 + 0.15 * s + 0.06 * hash(u * 3.7 + v * 5.1);

                const surge = Math.sin(t * 1.8) * 0.5 + 0.5; // 밀물/썰물 호흡
                const edge = beachTop
                           + 2 + surge * (vh - beachTop) * 0.55 * (0.4 + amp)
                           + Math.sin(u * 0.35 + t * 2.2) * 2.5 * amp;

                if (v < edge) {
                    // 얕은 물 (모래보다 어둡게)
                    val = 0.34 - 0.1 * (edge - v) / (vh - beachTop);
                    if (edge - v < 1.5) val = 0.95; // 포말 라인
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
