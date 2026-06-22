// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0510
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0510.ts
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

namespace Pattern0510 {
  const char* NAME = "0510";
  const char* const KNOB_LABELS[4] = {"hueBase", "speed", "scale", "distortion"};

  struct Params {
    float hueBase = 0.0f;
    float speed = 0.0f;
    float scale = 0.0f;
    float distortion = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0510
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-10
// Lineage: AI generated and curated
//

void setup() {
    PFMath::buildSinLUT();

    params.hueBase = 0.0f;
    params.speed = 1.0f;
    params.scale = 1.0f;
    params.distortion = 1.0f;
    params.timeAcc = 0.0f;

  }

void update(float dt, const InputFrame& input) {
    params.hueBase += input.knobDeltas[0] * 0.05f;
    if (params.hueBase < 0) params.hueBase += 1.0f;
    params.hueBase = fmodf(params.hueBase, 1.0f);

    params.speed = max(0.0f, params.speed + input.knobDeltas[1] * 0.05f);
    params.scale = max(0.1f, params.scale + input.knobDeltas[2] * 0.05f);
    params.distortion = max(0.0f, params.distortion + input.knobDeltas[3] * 0.05f);

    params.timeAcc += dt * params.speed;
  }

void draw() {float time = params.timeAcc;

    float t = params.timeAcc;
    float scaleFactor = params.scale * 0.15f;
    float distAmount = params.distortion * 2.0f;
    float hBase = params.hueBase;

    for (int y = 0; y < PANEL_RES_H; y++) {
        float ny = y * scaleFactor;
        
        float dyWave = PFMath::fastSin(ny * 0.6f + t * 0.8f) * distAmount;
        float nyMain = ny - t * 1.2f;

        for (int x = 0; x < PANEL_RES_W; x++) {
            float nx = x * scaleFactor;
            
            float dxWave = PFMath::fastCos(nx * 0.7f - t * 0.9f) * distAmount;

            float val = PFMath::fastSin(nx + dyWave + t) + PFMath::fastCos(nyMain + dxWave);
            
            float normVal = constrain((val + 2.0f) * 0.25f, 0.0f, 1.0f);

            uint8_t r = 0, g = 0, b = 0;

            if (normVal < 0.3f) {
                uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(hBase, 0.9f, 1.0f, rgb_r, rgb_g, rgb_b);
                r = rgb_r; g = rgb_g; b = rgb_b;
            } else if (normVal < 0.5f) {
                r = 0; g = 0; b = 0;
            } else if (normVal < 0.7f) {
                if (fmodf((float)(x), (float)(3.0f)) == 0 && fmodf((float)(y), (float)(3.0f)) == 0) {
                    uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(fmodf((float)((hBase + 0.33f)), (float)(1.0f)), 0.8f, 1.0f, rgb_r, rgb_g, rgb_b);
                    r = rgb_r; g = rgb_g; b = rgb_b;
                }
            } else {
                if (fmodf((float)((x + y)), (float)(4.0f)) < 2) {
                    uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(fmodf((float)((hBase + 0.66f)), (float)(1.0f)), 0.9f, 1.0f, rgb_r, rgb_g, rgb_b);
                    r = rgb_r; g = rgb_g; b = rgb_b;
                }
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
  }
} // namespace Pattern0510
