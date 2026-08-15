#pragma once

// ===== Patternflow pattern =====
// Title:   Retro Digital Tapestry
// Author:  Seunghun LEE
// Date:    2026-06-28
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_color.h"
#include "../src/core_params.h"

namespace RetroDigitalTapestry {

const char* NAME = "Retro Digital Tapestry";
const char* const KNOB_LABELS[4] = {"Cell Scale", "Speed", "Logic Mode", "Wave Mod"};
constexpr bool ABSOLUTE_READY = true;

float cellScale = -0.101f;
float speed = 1.99f;
float logicMode = 1.001f;
float waveMod = 1.346f;
float timeAcc = 0.0f;

void setup() {
    PFMath::buildSinLUT();
    cellScale = -0.101f;
    speed = 1.99f;
    logicMode = 1.001f;
    waveMod = 1.346f;
    timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    PFParams::apply(input, 0, &cellScale, -0.101f, 0.5f, 0.05f);

    PFParams::apply(input, 1, &speed, 0.1f, 5.0f, 0.1f);

    PFParams::apply(input, 2, &logicMode, 0.0f, 1.001f, 0.05f);

    PFParams::apply(input, 3, &waveMod, 0.0f, 3.0f, 0.05f);

    timeAcc += dt * speed * 2.0f;
}

void draw() {
    int scale = (int)(4.0f + cellScale * 24.0f);
    if (scale < 1) scale = 1;
    int mode = (int)(logicMode * 5.0f);
    float waveF = 0.02f + waveMod * 0.08f;
    float t = timeAcc;
    
    int floorT = (int)floorf(t);
    int floorT15 = (int)floorf(t * 1.5f);
    int floorT08 = (int)floorf(t * 0.8f);

    float minVal = floorf(50.0f * (PFMath::fastSin(t * 2.0f) * 0.5f + 0.5f));
    float hsv_v = 220.0f / 255.0f;
    float hsv_s = (220.0f - minVal) / 220.0f;

    for (int y = 0; y < PANEL_RES_H; y++) {
        int sy = y / scale;
        float cosY = PFMath::fastCos(y * waveF - t);

        for (int x = 0; x < PANEL_RES_W; x++) {
            int sx = x / scale;
            int patternVal = 0;

            switch (mode) {
                case 0:  patternVal = (sx ^ sy) + floorT; break;
                case 1:  patternVal = (sx & sy) * 3 + floorT15; break;
                case 2:  patternVal = (sx * 7 + sy * 3) ^ floorT; break;
                case 3:  patternVal = (sx ^ (sy + floorT)) & 15; break;
                default: patternVal = ((sx * sx + sy * sy) >> 2) + floorT08; break;
            }

            float smoothS = PFMath::fastSin(x * waveF + t) * cosY;
            bool bitActive = (patternVal & 8) != 0;

            uint8_t r = 0, g = 0, b = 0;

            if (bitActive) {
                float hu = smoothS * 0.3f + 0.5f + (float)(patternVal % 16) / 32.0f;
                hu = fmodf(hu, 1.0f);
                if (hu < 0.0f) hu += 1.0f;

                PFColor::hsvToRgb(hu, hsv_s, hsv_v, r, g, b);
            } else {
                if ((x % scale == 0) || (y % scale == 0)) {
                    r = 20; g = 10; b = 40;
                }
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace RetroDigitalTapestry

// ── Made with Patternflow · https://patternflow.work ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
