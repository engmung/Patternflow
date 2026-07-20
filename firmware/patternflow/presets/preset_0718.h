#pragma once

// ===== Patternflow pattern =====
// Title:   260718_Warped Wave
// Author:  Seunghun LEE
// Date:    2026-07-18
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================
#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_color.h"

namespace WarpedWave {

const char* NAME = "Warped Wave";
const char* const KNOB_LABELS[4] = {"Hue", "Speed", "Warp Amp", "Warp Freq"};

static float s_hue = 0.0f;
static float s_speed = 2.0f;
static float s_warpAmp = 0.2f;
static float s_warpFreq = 0.5f;
static float s_timeAcc = 0.0f;

void setup() {
    PFMath::buildSinLUT();
    // no PFTables needed — warping uses moving-center / non-radial math
}

void update(float dt, const InputFrame& input) {
    // Accumulate knob deltas
    s_hue      += input.knobDeltas[0] * 0.05f;
    s_speed    += input.knobDeltas[1] * 0.1f;
    s_warpAmp  += input.knobDeltas[2] * 0.05f;
    s_warpFreq += input.knobDeltas[3] * 0.05f;

    // Clamp to documented ranges
    s_hue      = fmaxf(0.0f, fminf(1.0f, s_hue));
    s_speed    = fmaxf(-20.0f, fminf(20.0f, s_speed));
    s_warpAmp  = fmaxf(0.1f, fminf(1.0f, s_warpAmp));
    s_warpFreq = fmaxf(0.0f, fminf(30.0f, s_warpFreq));

    // Button resets (press, not long-press)
    if (input.btnPressed[0]) s_hue = 0.0f;
    if (input.btnPressed[1]) s_speed = 2.0f;
    if (input.btnPressed[2]) s_warpAmp = 0.2f;
    if (input.btnPressed[3]) s_warpFreq = 0.5f;

    // Map warpAmp from raw 0.1..1 to 0..1.225 (as in JS: v[2]*0.25)
    // We store raw and convert on use, preserving the JS mapping.

    s_timeAcc += dt * s_speed;
    // Wrap time accumulator.  Multipliers: t*0.3, t*0.4, t*1.0.  Common period: 20π wraps all seamlessly.
    const float PERIOD = 20.0f * PI;
    if (s_timeAcc > PERIOD) s_timeAcc -= PERIOD;
    if (s_timeAcc < 0.0f)    s_timeAcc += PERIOD;
}

void draw() {
    const float w = (float)PANEL_RES_W;
    const float h = (float)PANEL_RES_H;
    const float invW = 1.0f / w;
    const float invH = 1.0f / h;
    const float t = s_timeAcc;

    const float waveFreq = 15.0f;
    // Map raw warpAmp (0.1..1) to JS scale (0..1.225) via v*0.25
    const float warpAmp = s_warpAmp * 0.25f;
    const float warpFreqBase = 3.0f + s_warpFreq * 8.0f;

    // Precompute hue RGB once per frame
    uint8_t hcR, hcG, hcB;
    PFColor::hsvToRgb(s_hue, 1.0f, 1.0f, hcR, hcG, hcB);

    for (int y = 0; y < PANEL_RES_H; ++y) {
        const float ny = ((float)y * invH - 0.5f) * 2.0f; // -1..1
        for (int x = 0; x < PANEL_RES_W; ++x) {
            const float nx = ((float)x * invW - 0.5f) * 2.0f;

            // Warp coordinates
            const float wx = nx + warpAmp * PFMath::fastSin(ny * warpFreqBase + t * 0.3f);
            const float wy = ny + warpAmp * PFMath::fastCos(nx * warpFreqBase * 1.3f + t * 0.4f);

            const float dist = sqrtf(wx * wx + wy * wy);
            const float wave = PFMath::fastSin(dist * waveFreq + t);

            float tt = (wave * 0.8f + 1.0f) * 0.5f;
            tt = fmaxf(0.0f, fminf(1.0f, tt));

            uint8_t r = 0, g = 0, b = 0;
            if (tt >= 0.154f) {
                r = 10; g = 10; b = 10;
            }
            if (tt >= 0.556f) {
                r = (uint8_t)fmaxf(0, fminf(255, (int)(hcR * 1.5f)));
                g = (uint8_t)fmaxf(0, fminf(255, (int)(hcG * 1.5f)));
                b = (uint8_t)fmaxf(0, fminf(255, (int)(hcB * 1.5f)));
            }
            if (tt >= 0.816f) {
                r = 255; g = 255; b = 255;
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace WarpedWave

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
