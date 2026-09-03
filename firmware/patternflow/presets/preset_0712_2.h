#pragma once

// ===== Patternflow pattern =====
// Title:   260713_Breakout Arcade
// Author:  Seunghun LEE
// Date:    2026-07-12
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_mem.h"
#include "../src/core_params.h"

namespace BreakoutArcade {

const char* NAME = "Breakout Arcade";
const char* const KNOB_LABELS[4] = {"Paddle", "Speed", "Luck", "Glow"};
constexpr bool ABSOLUTE_READY = true;

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{4,4,4},
  {8,8,9},{12,12,13},{16,16,17},{20,20,22},{24,23,26},{28,27,31},{31,30,35},{34,33,39},
  {38,36,44},{41,39,48},{44,42,53},{46,44,57},{49,47,61},{52,49,66},{54,51,70},{56,53,75},
  {59,55,79},{61,56,83},{63,58,88},{65,59,92},{66,60,97},{68,61,101},{69,62,105},{71,63,110},
  {72,63,114},{73,63,119},{74,64,123},{74,64,127},{75,64,132},{76,63,136},{76,63,141},{76,63,145},
  {77,62,150},{77,61,154},{77,60,158},{76,59,163},{76,58,167},{76,56,172},{75,55,176},{74,53,180},
  {73,51,185},{73,49,189},{71,47,194},{70,44,198},{69,42,202},{67,39,207},{66,36,211},{64,33,216},
  {62,30,220},{60,27,224},{58,23,229},{56,20,233},{54,16,238},{51,12,242},{48,8,246},{46,4,251},
  {44,0,255},{56,0,255},{68,0,255},{81,0,255},{93,0,255},{105,0,255},{118,0,255},{130,0,255},
  {142,0,255},{155,0,255},{167,0,255},{179,0,255},{192,0,255},{204,0,255},{216,0,255},{229,0,255},
  {241,0,255},{253,0,255},{255,0,245},{255,0,232},{255,0,220},{255,0,208},{255,0,195},{255,0,183},
  {255,0,171},{255,0,158},{255,0,146},{255,0,134},{255,0,121},{255,0,109},{255,0,97},{255,0,84},
  {255,0,72},{255,0,60},{255,0,47},{255,0,35},{255,0,23},{255,0,10},{255,2,0},{255,14,0},
  {255,27,0},{255,39,0},{255,51,0},{255,64,0},{255,67,4},{255,71,9},{255,74,14},{255,78,18},
  {255,81,23},{255,84,27},{255,88,32},{255,91,37},{255,95,41},{255,98,46},{255,102,50},{255,105,55},
  {255,109,59},{255,112,64},{255,115,69},{255,119,73},{255,122,78},{255,126,82},{255,129,87},{255,133,92},
  {255,136,96},{255,139,101},{255,143,105},{255,146,110},{255,150,114},{255,153,119},{255,157,124},{255,160,128},
  {255,164,133},{255,167,137},{255,170,142},{255,174,147},{255,177,151},{255,181,156},{255,184,160},{255,188,165},
  {255,191,170},{255,194,174},{255,198,179},{255,201,183},{255,205,188},{255,208,192},{255,212,197},{255,215,202},
  {255,218,206},{255,222,211},{255,225,215},{255,229,220},{255,232,225},{255,236,229},{255,239,234},{255,243,238},
  {255,246,243},{255,249,248},{255,253,252},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
};

static constexpr int VW = 64;
static constexpr int VH = 128;
static constexpr int ROWS = 8;
static constexpr int BRICK_W = 8;
static constexpr int BRICK_H = 5;
static constexpr int BRICK_TOP = 10;
static constexpr float PAD_W = 10.0f;
static constexpr float PAD_W_WIDE = 16.0f;
static constexpr float ITEM_FALL = 20.0f;
static constexpr float AI_SPD = 115.0f;

static uint8_t dead[64];
static float balls[32];
static uint8_t ballOn[8];
static float items[18];
static uint8_t itemOn[6];
// VW*VH floats (32 KB) — as a static array this sat in internal DRAM from
// boot for every build; allocated from PSRAM in setup() instead (PFMem).
static float* glow = nullptr;

static float knobPaddle = 46.116f;   // raw knob value, only changed by encoder
static float paddlePos = 46.116f;    // actual paddle position (manual or AI)
static float speed = 89.336f;
static float luck = 0.332f;
static float glowK = 0.355f;
static float tAccum = 0.0f;
static uint32_t rngState = 12345;
static float flash = 0.0f;
static int combo = 0;
static float idleT = 99.0f;
static float lastKnob = 46.116f;
static float aiTarget = 32.0f;
static float wideT = 0.0f;
static float fireT = 0.0f;
static float padW = PAD_W;
static bool fire = false;
static bool manual = false;

static float rnd() {
    rngState = (rngState * 48271u) % 2147483647u;
    return (float)rngState / 2147483647.0f;
}

static void depositGlow(float gx, float gy, float amt, float rad) {
    int x0 = (int)fmaxf(0.0f, floorf(gx - rad));
    int x1 = (int)fminf(VW - 1.0f, ceilf(gx + rad));
    int y0 = (int)fmaxf(0.0f, floorf(gy - rad));
    int y1 = (int)fminf(VH - 1.0f, ceilf(gy + rad));
    for (int gy2 = y0; gy2 <= y1; ++gy2) {
        for (int gx2 = x0; gx2 <= x1; ++gx2) {
            float du = gx2 - gx;
            float dv = gy2 - gy;
            float f = 1.0f - sqrtf(du * du + dv * dv) / (rad + 0.001f);
            if (f > 0.0f) {
                int idx = gx2 + gy2 * VW;
                float nv = glow[idx] + amt * f;
                if (nv > 1.0f) nv = 1.0f;
                glow[idx] = nv;
            }
        }
    }
}

static void multiball() {
    for (int i = 0; i < 8; ++i) {
        if (!ballOn[i]) continue;
        for (int j = 0; j < 8; ++j) {
            if (ballOn[j]) continue;
            ballOn[j] = 1;
            balls[j*4]   = balls[i*4];
            balls[j*4+1] = balls[i*4+1];
            float a = 0.3f + rnd() * 0.4f;
            balls[j*4+2] = -balls[i*4+2] * (0.7f + a);
            balls[j*4+3] = balls[i*4+3];
            float dx = balls[j*4+2];
            float dy = balls[j*4+3];
            float len = sqrtf(dx*dx + dy*dy);
            balls[j*4+2] = dx / len;
            balls[j*4+3] = dy / len;
            break;
        }
    }
}

void setup() {
    PFMath::buildSinLUT();
    memset(dead, 0, sizeof(dead));
    balls[0] = 32.0f;
    balls[1] = 80.0f;
    balls[2] = 0.55f;
    balls[3] = -0.84f;
    ballOn[0] = 1;
    for (int i = 1; i < 8; ++i) ballOn[i] = 0;
    memset(itemOn, 0, sizeof(itemOn));
    if (!glow) glow = PFMem::allocFloats(VW * VH);  // zeroed by PFMem
    else memset(glow, 0, sizeof(float) * VW * VH);
    knobPaddle = 46.116f;
    paddlePos = 46.116f;
    lastKnob = 46.116f;
    idleT = 99.0f;
    aiTarget = 32.0f;
    wideT = 0.0f;
    fireT = 0.0f;
    padW = PAD_W;
    fire = false;
    manual = false;
    flash = 0.0f;
    combo = 0;
}

void update(float dt, const InputFrame& input) {
    if (!glow) return;  // allocation failed — degrade to a blank pattern

    // --- Knob Paddle (encoder driven, used only for manual mode and idle detection) ---
    PFParams::apply(input, 0, &knobPaddle, 2.0f, 62.0f, 0.05f);

    PFParams::apply(input, 1, &speed, 25.0f, 200.0f, 0.1f);

    PFParams::apply(input, 2, &luck, 0.0f, 1.0f, 0.05f);

    PFParams::apply(input, 3, &glowK, 0.0f, 1.0f, 0.05f);

    if (input.btnPressed[0] && !input.paramAbsoluteActive[0] && !input.knobAudioActive[0]) {
        memset(dead, 0, sizeof(dead));
    }
    if (input.btnPressed[1] && !input.paramAbsoluteActive[1] && !input.knobAudioActive[1]) {
        multiball();
        flash = 1.0f;
    }
    if (input.btnPressed[2] && !input.paramAbsoluteActive[2] && !input.knobAudioActive[2]) {
        wideT = 6.0f;
    }
    if (input.btnPressed[3] && !input.paramAbsoluteActive[3] && !input.knobAudioActive[3]) {
        fireT = 4.0f;
        flash = 0.8f;
    }

    // --- Idle detection (only from knob, never from AI movement) ---
    if (lastKnob < -100.0f) lastKnob = knobPaddle;
    if (fabsf(knobPaddle - lastKnob) > 0.15f) {
        idleT = 0.0f;
    } else {
        idleT += dt;
    }
    lastKnob = knobPaddle;
    manual = (idleT < 5.0f);

    const int vw = VW;
    const int vh = VH;
    const int brickTop = BRICK_TOP;

    float decay = expf(-dt * (8.0f - 7.0f * glowK));
    for (int i = 0; i < vw * vh; ++i) {
        glow[i] *= decay;
    }

    wideT = fmaxf(0.0f, wideT - dt);
    fireT = fmaxf(0.0f, fireT - dt);
    padW = (wideT > 0.0f) ? PAD_W_WIDE : PAD_W;
    fire = (fireT > 0.0f);
    float padV = vh - 7.0f;

    // --- Paddle movement ---
    if (manual) {
        paddlePos = knobPaddle;
    } else {
        float diff = aiTarget - paddlePos;
        float step = fminf(fabsf(diff), AI_SPD * dt);
        paddlePos += (diff > 0.0f ? step : -step);
    }
    float minPad = padW * 0.5f;
    float maxPad = vw - padW * 0.5f;
    if (paddlePos < minPad) paddlePos = minPad;
    if (paddlePos > maxPad) paddlePos = maxPad;

    int aliveBalls = 0;
    float ballTX = -1.0f;
    float ballETA = 1e9f;

    for (int i = 0; i < 8; ++i) {
        if (!ballOn[i]) continue;
        int o = i * 4;
        balls[o]   += balls[o+2] * speed * dt;
        balls[o+1] += balls[o+3] * speed * dt;
        float bx = balls[o];
        float by = balls[o+1];

        if (bx < 2.0f) { balls[o] = bx = 2.0f; balls[o+2] = fabsf(balls[o+2]); }
        if (bx > vw - 2.0f) { balls[o] = bx = vw - 2.0f; balls[o+2] = -fabsf(balls[o+2]); }
        if (by < 2.0f) { balls[o+1] = by = 2.0f; balls[o+3] = fabsf(balls[o+3]); }

        if (by >= brickTop && by < brickTop + ROWS * BRICK_H) {
            int col = (int)(bx / BRICK_W);
            if (col < 0) col = 0;
            if (col > 7) col = 7;
            int row = (int)((by - brickTop) / BRICK_H);
            int idx = row * 8 + col;
            if (row >= 0 && row < ROWS && !dead[idx]) {
                dead[idx] = 1;
                if (!fire) balls[o+3] = -balls[o+3];
                combo++;
                flash = fminf(1.0f, 0.25f + combo * 0.1f);
                depositGlow(col * BRICK_W + BRICK_W * 0.5f,
                            brickTop + row * BRICK_H + BRICK_H * 0.5f,
                            0.9f, fire ? 5.0f : 3.0f);

                if (rnd() < luck * 0.4f) {
                    for (int s = 0; s < 6; ++s) {
                        if (itemOn[s]) continue;
                        itemOn[s] = 1;
                        items[s*3]   = col * BRICK_W + BRICK_W * 0.5f;
                        items[s*3+1] = brickTop + row * BRICK_H;
                        items[s*3+2] = floorf(rnd() * 3.0f);
                        break;
                    }
                }
            }
        }

        if (by >= padV - 1.0f && by <= padV + 2.0f && balls[o+3] > 0.0f
            && fabsf(bx - paddlePos) < padW * 0.5f + 1.0f) {
            balls[o+3] = -fabsf(balls[o+3]);
            balls[o+2] += (bx - paddlePos) / (padW * 0.5f) * 0.7f;
            float dx = balls[o+2];
            float dy = balls[o+3];
            float len = sqrtf(dx*dx + dy*dy);
            dx /= len;
            dy /= len;
            if (dy > -0.35f) dy = -0.35f;
            len = sqrtf(dx*dx + dy*dy);
            balls[o+2] = dx / len;
            balls[o+3] = dy / len;
            combo = 0;
        }

        if (by > vh + 4.0f) {
            ballOn[i] = 0;
            continue;
        }

        aliveBalls++;

        if (balls[o+3] > 0.0f) {
            float eta = (padV - by) / (balls[o+3] * speed);
            if (eta >= 0.0f && eta < ballETA) {
                ballETA = eta;
                ballTX = bx;
            }
        }

        depositGlow(bx, by, fire ? 0.5f : 0.3f, fire ? 2.5f : 1.5f);
    }

    if (aliveBalls == 0) {
        ballOn[0] = 1;
        balls[0] = vw * 0.5f;
        balls[1] = vh * 0.55f;
        balls[2] = rnd() > 0.5f ? 0.55f : -0.55f;
        balls[3] = -0.84f;
        flash = 1.0f;
        combo = 0;
    }

    int brickAlive = 0;
    for (int r = 0; r < ROWS; ++r) {
        for (int c = 0; c < 8; ++c) {
            if (!dead[r * 8 + c]) brickAlive++;
        }
    }
    if (brickAlive == 0) {
        memset(dead, 0, sizeof(dead));
        flash = 1.0f;
        depositGlow(vw * 0.5f, vh * 0.3f, 1.0f, 14.0f);
    }

    float itemTX = -1.0f;
    float itemETA = 1e9f;
    for (int s = 0; s < 6; ++s) {
        if (!itemOn[s]) continue;
        items[s*3+1] += ITEM_FALL * dt;
        float ix = items[s*3];
        float iy = items[s*3+1];

        if (iy >= padV - 1.0f && iy <= padV + 3.0f && fabsf(ix - paddlePos) < padW * 0.5f + 1.5f) {
            int ty = (int)items[s*3+2];
            if (ty == 0) multiball();
            else if (ty == 1) wideT = 6.0f;
            else fireT = 4.0f;
            flash = 1.0f;
            depositGlow(ix, padV, 1.0f, 6.0f);
            itemOn[s] = 0;
            continue;
        }
        if (iy > vh + 3.0f) {
            itemOn[s] = 0;
            continue;
        }

        float eta = (padV - iy) / ITEM_FALL;
        if (eta >= 0.0f && eta < itemETA) {
            itemETA = eta;
            itemTX = ix;
        }
    }

    if (ballTX < 0.0f) {
        aiTarget = (itemTX >= 0.0f) ? itemTX : vw * 0.5f;
    } else if (itemTX >= 0.0f) {
        float travelT = fabsf(itemTX - paddlePos) / AI_SPD;
        if (itemETA + 0.35f < ballETA && travelT < itemETA + 0.2f) {
            aiTarget = itemTX;
        } else {
            aiTarget = ballTX;
        }
    } else {
        aiTarget = ballTX;
    }

    flash = fmaxf(0.0f, flash - dt * 2.5f);

    tAccum += dt;
    if (tAccum > TWO_PI) tAccum -= TWO_PI;
}

void draw() {
    if (!glow) {  // allocation failed — show nothing rather than crash
        PFCanvas::present();
        return;
    }
    const int W = PANEL_RES_W; // 128
    const int H = PANEL_RES_H; // 64
    const float vw = VW;
    const float vh = VH;
    const int brickTop = BRICK_TOP;
    const float padV = vh - 7.0f;
    const float t = tAccum;

    for (int y = 0; y < H; ++y) {
        for (int x = 0; x < W; ++x) {
            float u = (float)y;
            float v = (float)(W - 1 - x);

            float val = 0.03f + 0.02f * PFMath::jsMod(v, 2.0f) + flash * 0.15f;

            if (u < 1.0f || u > vw - 2.0f) val = 0.3f;

            if (v >= brickTop && v < brickTop + ROWS * BRICK_H) {
                int col = (int)(u / BRICK_W);
                int row = (int)((v - brickTop) / BRICK_H);
                if (col >= 0 && col < 8 && row >= 0 && row < ROWS && !dead[row * 8 + col]) {
                    float lu = u - col * BRICK_W;
                    float lv = (v - brickTop) - row * BRICK_H;
                    bool border = (lu < 0.5f || lu > BRICK_W - 0.5f || lv < 0.5f || lv > BRICK_H - 0.5f);
                    val = border ? 0.30f : 0.80f - row * 0.05f;
                    if (fire) {
                        val += 0.12f * PFMath::fastSin(t * 10.0f + col * 2.0f + row);
                    }
                }
            }

            if (v >= padV && v <= padV + 1.0f && fabsf(u - paddlePos) < padW * 0.5f) {
                val = 0.9f;
                if (padW > PAD_W + 1.0f && fabsf(u - paddlePos) > padW * 0.5f - 2.0f) {
                    val = 0.6f + 0.4f * PFMath::fastSin(t * 12.0f);
                }
                if (manual && fabsf(u - paddlePos) < 1.0f && fabsf(v - padV) < 0.5f) {
                    val = 0.7f + 0.3f * PFMath::fastSin(t * 8.0f);
                }
            }

            int glowIdx = (int)u + (int)v * (int)vw;
            if (glowIdx >= 0 && glowIdx < (int)(vw * vh)) {
                val += glow[glowIdx] * 0.85f;
            }

            val = fmaxf(0.0f, fminf(1.0f, val));
            int li = (int)(val * 255.0f + 0.5f);
            if (li < 0) li = 0;
            if (li > 255) li = 255;
            PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
        }
    }

    // 람다 함수 수정
    auto plot = [&](float pu, float pv, float pval) {
        int puInt = (int)roundf(pu);
        int pvInt = (int)roundf(pv);
        int px = W - 1 - pvInt;
        int py = puInt;
        if (px >= 0 && px < W && py >= 0 && py < H) {
            pval = fmaxf(0.0f, fminf(1.0f, pval));
            int li = (int)(pval * 255.0f + 0.5f);
            if (li < 0) li = 0;
            if (li > 255) li = 255;
            PFCanvas::setPixel(px, py, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
        }
    };

    for (int s = 0; s < 6; ++s) {
        if (!itemOn[s]) continue;
        float ix = items[s*3];
        float iy = items[s*3+1];
        int ty = (int)items[s*3+2];
        float blink = 0.6f + 0.4f * PFMath::fastSin(t * (6.0f + ty * 4.0f) + s);
        plot(ix, iy, 1.0f);
        plot(ix - 1, iy, blink);
        plot(ix + 1, iy, blink);
        plot(ix, iy - 1, blink);
        plot(ix, iy + 1, blink);
        if (ty == 0) {
            plot(ix - 2, iy, blink * 0.5f);
            plot(ix + 2, iy, blink * 0.5f);
        }
    }

    for (int i = 0; i < 8; ++i) {
        if (!ballOn[i]) continue;
        float bx = balls[i*4];
        float by = balls[i*4+1];
        plot(bx, by, 1.0f);
        plot(bx - 1, by, 0.8f);
        plot(bx + 1, by, 0.8f);
        plot(bx, by - 1, 0.8f);
        plot(bx, by + 1, 0.8f);
        if (fire) {
            plot(bx - 1, by - 1, 0.6f);
            plot(bx + 1, by - 1, 0.6f);
            plot(bx - 1, by + 1, 0.6f);
            plot(bx + 1, by + 1, 0.6f);
        }
    }

    PFCanvas::present();
}

} // namespace BreakoutArcade

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.