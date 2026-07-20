#pragma once

// ===== Patternflow pattern =====
// Title:   Lissajous Weave
// Author:  Seunghun LEE
// Date:    2026-07-01
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_color.h"

namespace LissajousWeave {

    const char* NAME = "Lissajous Weave";
    const char* const KNOB_LABELS[4] = {"X Frequency", "Speed", "Y Frequency", "Phase Offset"};

    // Knob state tracking initialized to the specified Pattern Lab current values
    float knob1 = 1.586f;  // min 0,  max 2.8, step 0.05
    float knob2 = 0.358f;  // min 0,  max 2,   step 0.1
    float knob3 = 1.437f;  // min 0,  max 7,   step 0.05
    float knob4 = 2.713f;  // min -3, max 3,   step 0.05

    // Derived pattern parameters
    float freqX = 3.0f;
    float speed = 2.0f;
    float freqY = 4.0f;
    float phase = 0.5f;
    float timeAcc = 0.0f;

    void setup() {
        PFMath::buildSinLUT();
        
        // Initialize derived parameters from initial knob values
        freqX = 1.0f + floorf(knob1 * 7.0f);
        speed = knob2;
        freqY = 1.0f + floorf(knob3 * 7.0f);
        phase = knob4;
        timeAcc = 0.0f;
    }

    void update(float dt, const InputFrame& input) {
        // Update Knob 1
        knob1 += input.knobDeltas[0] * 0.05f;
        if (knob1 < 0.0f) knob1 = 0.0f;
        if (knob1 > 2.8f) knob1 = 2.8f;

        // Update Knob 2
        knob2 += input.knobDeltas[1] * 0.1f;
        if (knob2 < 0.0f) knob2 = 0.0f;
        if (knob2 > 2.0f) knob2 = 2.0f;

        // Update Knob 3
        knob3 += input.knobDeltas[2] * 0.05f;
        if (knob3 < 0.0f) knob3 = 0.0f;
        if (knob3 > 7.0f) knob3 = 7.0f;

        // Update Knob 4
        knob4 += input.knobDeltas[3] * 0.05f;
        if (knob4 < -3.0f) knob4 = -3.0f;
        if (knob4 > 3.0f)  knob4 = 3.0f;

        // Recompute parameters based on updated knob positions
        freqX = 1.0f + floorf(knob1 * 7.0f);
        speed = knob2;
        freqY = 1.0f + floorf(knob3 * 7.0f);
        phase = knob4;

        timeAcc += dt * speed;
    }

    void draw() {
        float t = timeAcc;
        float fx = freqX;
        float fy = freqY;
        float phaseRad = phase * 3.14159265f * 2.0f;

        // Clear display with a vertical/horizontal background gradient
        for (int y = 0; y < PANEL_RES_H; y++) {
            for (int x = 0; x < PANEL_RES_W; x++) {
                int bg = 10 + (x * 20) / PANEL_RES_W;
                PFCanvas::setPixel(x, y, 0, bg, (bg * 7) / 10);
            }
        }

        // Draw multiple Lissajous curves
        const int numCurves = 12;
        const int points = 300;
        const float centerW = PANEL_RES_W * 0.5f;
        const char centerH = PANEL_RES_H * 0.5f;
        const float radiusW = PANEL_RES_W * 0.4f;
        const float radiusH = PANEL_RES_H * 0.4f;

        for (int curve = 0; curve < numCurves; curve++) {
            float curvePhase = ((float)curve / numCurves) * 3.14159265f * 2.0f;
            float hue = fmodf((float)curve / numCurves + t * 0.01f, 1.0f);
            if (hue < 0.0f) hue += 1.0f;

            for (int i = 0; i < points; i++) {
                float theta = ((float)i / points) * 3.14159265f * 8.0f + t * 0.2f;
                
                float cx = centerW + PFMath::fastSin(theta * fx + t * 0.1f + curvePhase) * radiusW;
                float cy = centerH + PFMath::fastSin(theta * fy + t * 0.15f + curvePhase + phaseRad) * radiusH;

                int px = (int)cx;
                int py = (int)cy;

                if (px >= 0 && px < PANEL_RES_W && py >= 0 && py < PANEL_RES_H) {
                    float brightness = 0.3f + 0.7f * (0.5f + 0.5f * PFMath::fastSin(theta * 3.0f));
                    float saturation = 0.8f;

                    uint8_t r, g, b;
                    PFColor::hsvToRgb(hue, saturation, brightness, r, g, b);
                    PFCanvas::setPixel(px, py, r, g, b);
                }
            }
        }

        PFCanvas::present();
    }

} // namespace LissajousWeave

// ── Made with Patternflow · https://patternflow.work ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
