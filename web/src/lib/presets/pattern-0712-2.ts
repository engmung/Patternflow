import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0712-2",
  num: 712.02,
  name: "0712-2",
  desc: "Breakout arcade game with paddle and balls",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-12",
  lineage: "AI generated and curated via Pattern Lab",
  labOnly: true,
  code: `// ===== Patternflow pattern =====
// Title:   260713_Breakout Arcade
// Author:  Seunghun LEE
// Date:    2026-07-12
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Breakout Arcade v2 (Wide Paddle + Item-Hungry AI)
// 세로(64x128) — 노브1 수동 조작 / 5초 방치 시 AI 복귀, AI가 아이템도 판단해서 캐치
// 벽돌 8줄 고정, 아이템(멀티볼/와이드/파이어볼) + 글로우 버퍼
// @knobs Paddle=2..62, Speed=25..90, Luck=0..1, Glow=0..1
//
// Knob 1 (Paddle): 패들 위치 직결 (돌리면 수동, 5초 방치 시 AI 복귀)
// Knob 2 (Speed): 공 속도 (px/s)
// Knob 3 (Luck): 아이템 드랍 확률
// Knob 4 (Glow): 잔광 유지 시간
// Button 1: 벽돌 리셋 / Button 2: 멀티볼 / Button 3: 와이드 / Button 4: 파이어볼

function rnd(params) {
    params.rng = (params.rng * 48271) % 2147483647;
    return params.rng / 2147483647;
}

const ROWS = 8;
const PAD_W = 10;        // 기본 패들 폭 (기존 7의 1.5배)
const PAD_W_WIDE = 16;   // 와이드 아이템 시
const ITEM_FALL = 20;    // 아이템 낙하 속도 px/s
const AI_SPD = 115;      // AI 패들 속도 px/s

export function setup(params) {
    params.vw = 64; params.vh = 128;
    params.speed = 50;
    params.luck = 0.4; params.glowK = 0.5;
    params.rng = 12345;

    params.dead = new Uint8Array(64);          // 8열 x 8줄
    params.balls = new Float32Array(32);       // 8개 x (x, y, dx, dy)
    params.ballOn = new Uint8Array(8);
    params.items = new Float32Array(18);       // 6개 x (x, y, type)
    params.itemOn = new Uint8Array(6);
    params.glow = new Float32Array(64 * 128);

    params.balls[0] = 32; params.balls[1] = 80;
    params.balls[2] = 0.55; params.balls[3] = -0.84;
    params.ballOn[0] = 1;

    params.px = 32;
    params.lastKnob = -999;
    params.idleT = 99;        // 시작은 AI 모드
    params.wideT = 0; params.fireT = 0;
    params.flash = 0; params.combo = 0;
    params.aiTarget = 32;
}

function depositGlow(params, gx, gy, amt, rad) {
    const vw = params.vw, vh = params.vh;
    const x0 = Math.max(0, Math.floor(gx - rad));
    const x1 = Math.min(vw - 1, Math.ceil(gx + rad));
    const y0 = Math.max(0, Math.floor(gy - rad));
    const y1 = Math.min(vh - 1, Math.ceil(gy + rad));
    for (let gy2 = y0; gy2 <= y1; gy2++) {
        for (let gx2 = x0; gx2 <= x1; gx2++) {
            const du = gx2 - gx, dv = gy2 - gy;
            const f = 1.0 - Math.sqrt(du * du + dv * dv) / (rad + 0.001);
            if (f > 0) {
                const idx = gx2 + gy2 * vw;
                const nv = params.glow[idx] + amt * f;
                params.glow[idx] = nv > 1 ? 1 : nv;
            }
        }
    }
}

function multiball(params) {
    for (let i = 0; i < 8; i++) {
        if (!params.ballOn[i]) continue;
        for (let j = 0; j < 8; j++) {
            if (params.ballOn[j]) continue;
            params.ballOn[j] = 1;
            params.balls[j * 4]     = params.balls[i * 4];
            params.balls[j * 4 + 1] = params.balls[i * 4 + 1];
            const a = 0.3 + rnd(params) * 0.4;
            params.balls[j * 4 + 2] = -params.balls[i * 4 + 2] * (0.7 + a);
            params.balls[j * 4 + 3] = params.balls[i * 4 + 3];
            const dx = params.balls[j * 4 + 2], dy = params.balls[j * 4 + 3];
            const len = Math.sqrt(dx * dx + dy * dy);
            params.balls[j * 4 + 2] = dx / len;
            params.balls[j * 4 + 3] = dy / len;
            break;
        }
    }
}

export function update(dt, input, params) {
    let knobPad = params.px;
    if (input && input.knobValues) {
        knobPad = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.luck = input.knobValues[2];
        params.glowK = input.knobValues[3];
    }
    if (input && input.btnPressed) {
        if (input.btnPressed[0]) params.dead.fill(0);
        if (input.btnPressed[1]) { multiball(params); params.flash = 1.0; }
        if (input.btnPressed[2]) params.wideT = 6.0;
        if (input.btnPressed[3]) { params.fireT = 4.0; params.flash = 0.8; }
    }

    // --- 수동/자동 판정 ---
    if (params.lastKnob < -100) params.lastKnob = knobPad;
    if (Math.abs(knobPad - params.lastKnob) > 0.15) params.idleT = 0;
    else params.idleT += dt;
    params.lastKnob = knobPad;
    const manual = params.idleT < 5.0;

    const vw = params.vw, vh = params.vh;
    const brickTop = 10, bw = 8, bh = 5;

    // 글로우 감쇠
    const decay = Math.exp(-dt * (8.0 - 7.0 * params.glowK));
    const glow = params.glow;
    for (let i = 0; i < glow.length; i++) glow[i] *= decay;

    params.wideT = Math.max(0, params.wideT - dt);
    params.fireT = Math.max(0, params.fireT - dt);
    const padW = params.wideT > 0 ? PAD_W_WIDE : PAD_W;
    const fire = params.fireT > 0;
    const padV = vh - 7;

    // --- 패들 이동 (충돌 판정보다 먼저) ---
    if (manual) {
        params.px = knobPad;
    } else {
        const diff = params.aiTarget - params.px;
        const step = Math.min(Math.abs(diff), AI_SPD * dt);
        params.px += Math.sign(diff) * step;
    }
    params.px = Math.max(padW * 0.5, Math.min(vw - padW * 0.5, params.px));

    // --- 공 시뮬레이션 + 위협 공 ETA 계산 ---
    let aliveBalls = 0;
    let ballTX = -1, ballETA = 1e9;

    for (let i = 0; i < 8; i++) {
        if (!params.ballOn[i]) continue;
        const o = i * 4;
        params.balls[o]     += params.balls[o + 2] * params.speed * dt;
        params.balls[o + 1] += params.balls[o + 3] * params.speed * dt;
        let bx = params.balls[o], by = params.balls[o + 1];

        if (bx < 2) { params.balls[o] = bx = 2; params.balls[o + 2] = Math.abs(params.balls[o + 2]); }
        if (bx > vw - 2) { params.balls[o] = bx = vw - 2; params.balls[o + 2] = -Math.abs(params.balls[o + 2]); }
        if (by < 2) { params.balls[o + 1] = by = 2; params.balls[o + 3] = Math.abs(params.balls[o + 3]); }

        // 벽돌 충돌
        if (by >= brickTop && by < brickTop + ROWS * bh) {
            const col = Math.min(7, Math.max(0, Math.floor(bx / bw)));
            const row = Math.floor((by - brickTop) / bh);
            const idx = row * 8 + col;
            if (!params.dead[idx]) {
                params.dead[idx] = 1;
                if (!fire) params.balls[o + 3] = -params.balls[o + 3];
                params.combo++;
                params.flash = Math.min(1, 0.25 + params.combo * 0.1);
                depositGlow(params, col * bw + bw * 0.5, brickTop + row * bh + bh * 0.5,
                            0.9, fire ? 5 : 3);

                if (rnd(params) < params.luck * 0.4) {
                    for (let s = 0; s < 6; s++) {
                        if (params.itemOn[s]) continue;
                        params.itemOn[s] = 1;
                        params.items[s * 3]     = col * bw + bw * 0.5;
                        params.items[s * 3 + 1] = brickTop + row * bh;
                        params.items[s * 3 + 2] = Math.floor(rnd(params) * 3);
                        break;
                    }
                }
            }
        }

        // 패들 반사
        if (by >= padV - 1 && by <= padV + 2 && params.balls[o + 3] > 0
            && Math.abs(bx - params.px) < padW * 0.5 + 1) {
            params.balls[o + 3] = -Math.abs(params.balls[o + 3]);
            params.balls[o + 2] += (bx - params.px) / (padW * 0.5) * 0.7;
            let dx = params.balls[o + 2], dy = params.balls[o + 3];
            let len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
            if (dy > -0.35) dy = -0.35;
            len = Math.sqrt(dx * dx + dy * dy);
            params.balls[o + 2] = dx / len;
            params.balls[o + 3] = dy / len;
            params.combo = 0;
        }

        if (by > vh + 4) { params.ballOn[i] = 0; continue; }

        aliveBalls++;

        // 하강 중인 공의 패들 도착 시간 (가장 급한 공 기록)
        if (params.balls[o + 3] > 0) {
            const eta = (padV - by) / (params.balls[o + 3] * params.speed);
            if (eta >= 0 && eta < ballETA) { ballETA = eta; ballTX = bx; }
        }

        depositGlow(params, bx, by, fire ? 0.5 : 0.3, fire ? 2.5 : 1.5);
    }

    // 전멸 → 리스폰
    if (aliveBalls === 0) {
        params.ballOn[0] = 1;
        params.balls[0] = vw * 0.5; params.balls[1] = vh * 0.55;
        params.balls[2] = rnd(params) > 0.5 ? 0.55 : -0.55;
        params.balls[3] = -0.84;
        params.flash = 1.0; params.combo = 0;
    }

    // 벽돌 전멸 → 리필
    let brickAlive = 0;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 8; c++)
            if (!params.dead[r * 8 + c]) brickAlive++;
    if (brickAlive === 0) {
        params.dead.fill(0);
        params.flash = 1.0;
        depositGlow(params, vw * 0.5, vh * 0.3, 1.0, 14);
    }

    // --- 아이템 낙하 & 캐치 + 아이템 ETA 계산 ---
    let itemTX = -1, itemETA = 1e9;
    for (let s = 0; s < 6; s++) {
        if (!params.itemOn[s]) continue;
        params.items[s * 3 + 1] += ITEM_FALL * dt;
        const ix = params.items[s * 3], iy = params.items[s * 3 + 1];

        if (iy >= padV - 1 && iy <= padV + 3 && Math.abs(ix - params.px) < padW * 0.5 + 1.5) {
            const ty = params.items[s * 3 + 2];
            if (ty === 0) multiball(params);
            else if (ty === 1) params.wideT = 6.0;
            else params.fireT = 4.0;
            params.flash = 1.0;
            depositGlow(params, ix, padV, 1.0, 6);
            params.itemOn[s] = 0;
            continue;
        }
        if (iy > vh + 3) { params.itemOn[s] = 0; continue; }

        // AI용: 가장 먼저 떨어질 아이템
        const eta = (padV - iy) / ITEM_FALL;
        if (eta >= 0 && eta < itemETA) { itemETA = eta; itemTX = ix; }
    }

    // --- AI 타겟 결정: ETA 우선순위 ---
    // 1) 위협 공이 없으면 아이템으로 (없으면 중앙 대기)
    // 2) 아이템이 공보다 0.35초 이상 먼저 도착하고, 거기까지 갈 시간이 되면 아이템 먼저
    // 3) 그 외엔 공 수비
    if (ballTX < 0) {
        params.aiTarget = itemTX >= 0 ? itemTX : vw * 0.5;
    } else if (itemTX >= 0) {
        const travelT = Math.abs(itemTX - params.px) / AI_SPD;
        if (itemETA + 0.35 < ballETA && travelT < itemETA + 0.2) {
            params.aiTarget = itemTX;
        } else {
            params.aiTarget = ballTX;
        }
    } else {
        params.aiTarget = ballTX;
    }

    params.flash = Math.max(0, params.flash - dt * 2.5);
    params.padW = padW;
    params.fire = fire ? 1 : 0;
    params.manual = manual ? 1 : 0;
    params.t = (params.t || 0) + dt;
}

export function draw(display, params, time) {
    const W = display.width, H = display.height;
    const FLIP = 0;
    const portrait = W < H;
    const vw = params.vw, vh = params.vh;
    const brickTop = 10, bw = 8, bh = 5;
    const padV = vh - 7;
    const t = params.t || 0;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let u, v;
            if (portrait) { u = x; v = y; }
            else if (FLIP) { u = H - 1 - y; v = x; }
            else { u = y; v = W - 1 - x; }

            let val = 0.03 + 0.02 * (v % 2) + params.flash * 0.15;

            if (u < 1 || u > vw - 2) val = 0.3;

            // 벽돌 8줄
            if (v >= brickTop && v < brickTop + ROWS * bh) {
                const col = Math.floor(u / bw);
                const row = Math.floor((v - brickTop) / bh);
                if (col >= 0 && col < 8 && !params.dead[row * 8 + col]) {
                    const lu = u - col * bw;
                    const lv = (v - brickTop) - row * bh;
                    const border = (lu === 0 || lu === bw - 1 || lv === 0 || lv === bh - 1);
                    val = border ? 0.30 : 0.80 - row * 0.05;
                    if (params.fire) val += 0.12 * Math.sin(t * 10 + col * 2 + row);
                }
            }

            // 패들
            if (v >= padV && v <= padV + 1 && Math.abs(u - params.px) < params.padW * 0.5) {
                val = 0.9;
                if (params.padW > PAD_W + 1 && Math.abs(u - params.px) > params.padW * 0.5 - 2) {
                    val = 0.6 + 0.4 * Math.sin(t * 12);
                }
                if (params.manual && Math.abs(u - params.px) < 1 && v === padV) {
                    val = 0.7 + 0.3 * Math.sin(t * 8);
                }
            }

            val += params.glow[u + v * vw] * 0.85;

            display.setValue(x, y, Math.max(0, Math.min(1, val)));
        }
    }

    const plot = (pu, pv, pval) => {
        let px, py;
        pu = Math.round(pu); pv = Math.round(pv);
        if (portrait) { px = pu; py = pv; }
        else if (FLIP) { px = pv; py = H - 1 - pu; }
        else { px = W - 1 - pv; py = pu; }
        if (px >= 0 && px < W && py >= 0 && py < H) display.setValue(px, py, pval);
    };

    // 아이템 글리프
    for (let s = 0; s < 6; s++) {
        if (!params.itemOn[s]) continue;
        const ix = params.items[s * 3], iy = params.items[s * 3 + 1];
        const ty = params.items[s * 3 + 2];
        const blink = 0.6 + 0.4 * Math.sin(t * (6 + ty * 4) + s);
        plot(ix, iy, 1.0);
        plot(ix - 1, iy, blink); plot(ix + 1, iy, blink);
        plot(ix, iy - 1, blink); plot(ix, iy + 1, blink);
        if (ty === 0) { plot(ix - 2, iy, blink * 0.5); plot(ix + 2, iy, blink * 0.5); }
    }

    // 공
    for (let i = 0; i < 8; i++) {
        if (!params.ballOn[i]) continue;
        const bx = params.balls[i * 4], by = params.balls[i * 4 + 1];
        plot(bx, by, 1.0);
        plot(bx - 1, by, 0.8); plot(bx + 1, by, 0.8);
        plot(bx, by - 1, 0.8); plot(bx, by + 1, 0.8);
        if (params.fire) {
            plot(bx - 1, by - 1, 0.6); plot(bx + 1, by - 1, 0.6);
            plot(bx - 1, by + 1, 0.6); plot(bx + 1, by + 1, 0.6);
        }
    }
}

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
