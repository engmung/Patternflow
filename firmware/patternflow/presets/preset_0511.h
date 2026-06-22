// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0511
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0511.ts
//

#pragma once
#include <Arduino.h>
#include <math.h>
#include "../config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_color.h"
#include "../src/core_noise.h"

namespace Pattern0511 {
  const char* NAME = "0511";
  const char* const KNOB_LABELS[4] = {"hueBase", "speed", "rowHeight", "segWidth"};

  struct Params {
    float hueBase = 0.0f;
    float speed = 0.0f;
    float rowHeight = 0.0f;
    float segWidth = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0511
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-11
// Lineage: AI generated and curated
//
// 5. Sliding Segmented Rows (Kinetic/Ticker/Glitch Foundation)

void setup() {
    PFMath::buildSinLUT();

    params.hueBase = 0.2f;
    params.speed = 1.0f;
    params.rowHeight = 8.0f;
    params.segWidth = 16.0f;
    params.timeAcc = 0.0f;

  }

void update(float dt, const InputFrame& input) {
    params.hueBase = fmodf((float)((params.hueBase + input.knobDeltas[0] * 0.05f)), (float)(1.0f));
    if (params.hueBase < 0) params.hueBase += 1.0f;
    params.speed = max(0.0f, params.speed + input.knobDeltas[1] * 0.05f);
    params.rowHeight = constrain(params.rowHeight + input.knobDeltas[2] * 0.5f, 4.0f, 16.0f);
    params.segWidth = constrain(params.segWidth + input.knobDeltas[3] * 1.0f, 8.0f, 48.0f);
    params.timeAcc += dt * params.speed;
  }

void draw() {float time = params.timeAcc;

    float t = params.timeAcc;
    float rh = floorf(params.rowHeight);
    float sw = floorf(params.segWidth);

    for (int y = 0; y < PANEL_RES_H; y++) {
        float rowIdx = floorf(y / rh);
        float ly = fmodf((float)(y), (float)(rh));
        float halfRh = (int)(rh) >> 1;
        
        // Each row has a unique speed and direction based on its index
        float speedMult = (fmodf((float)(rowIdx), (float)(2.0f)) == 0 ? 1 : -1) * ((fmodf((float)(rowIdx), (float)(3.0f))) * 0.5f + 0.5f);
        float rowOffset = t * 20.0f * speedMult;

        for (int x = 0; x < PANEL_RES_W; x++) {
            float adjX = x + rowOffset;
            float segIdx = floorf(adjX / sw);
            float lx = floorf(fmodf((float)(adjX), (float)(sw)));
            if (lx < 0) lx += sw; // JS modulo fix for negative numbers
            
            float halfSw = (int)(sw) >> 1;
            
            // Pseudo-random hash for this specific block segment
            float hash = abs(PFMath::fastSin(rowIdx * 12.9898f + segIdx * 78.233f)) * 10000;
            float val = hash - floorf(hash); // Random value 0.0f - 1.0f

            uint8_t r = 0, g = 0, b = 0;
            float draw = false;
            float hOffset = 0;

            // Coordinate relative to segment center
            int cx = lx - halfSw;
            int cy = ly - halfRh;
            float maxL = max(abs(cx), abs(cy));

            // Map random segment value to distinct UI/HUD style blocks
            if (val < 0.2f) {
                // Loading bar segment
                if (ly > halfRh - 2 && ly < halfRh + 2 && lx < sw * 0.8f) { draw = true; hOffset = 0.0f; }
            } else if (val < 0.4f) {
                // Caution Chevrons
                if (fmodf((float)((lx + ly)), (float)(6.0f)) < 3) { draw = true; hOffset = 0.2f; }
            } else if (val < 0.6f) {
                // Empty Space (Spacing block)
            } else if (val < 0.8f) {
                // Data nodes (Dots)
                if (fmodf((float)(lx), (float)(4.0f)) == 0 && fmodf((float)(ly), (float)(4.0f)) == 0) { draw = true; hOffset = 0.6f; }
            } else {
                // Signal waveform (Sine within segment)
                float waveY = halfRh + PFMath::fastSin(lx * 0.5f) * (halfRh - 1);
                if (abs(ly - waveY) < 1.5f) { draw = true; hOffset = 0.8f; }
            }

            // Draw segment boundary
            if (lx == 0) {
                draw = true; 
                hOffset = 0.5f; // Boundary marker color
            }

            if (draw) {
                uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(fmodf((float)((params.hueBase + hOffset)), (float)(1.0f)), 0.9f, 1.0f, rgb_r, rgb_g, rgb_b);
                r = rgb_r; g = rgb_g; b = rgb_b;
            }
            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
  }
} // namespace Pattern0511
