// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0512
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0512.ts
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

namespace Pattern0512 {
  const char* NAME = "0512";
  const char* const KNOB_LABELS[4] = {"hueBase", "speed", "petals", "fold"};

  struct Params {
    float hueBase = 0.0f;
    float speed = 0.0f;
    float petals = 0.0f;
    float fold = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0512
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-12
// Lineage: AI generated and curated
//

void setup() {
    PFMath::buildSinLUT();

    params.hueBase = 0.85f;
    params.speed = 1.0f;
    params.petals = 6.0f;
    params.fold = 1.0f;
    params.timeAcc = 0.0f;

  }

void update(float dt, const InputFrame& input) {
    params.hueBase = fmodf((float)((params.hueBase + input.knobDeltas[0] * 0.05f)), (float)(1.0f));
    if (params.hueBase < 0) params.hueBase += 1.0f;
    params.speed = max(0.0f, params.speed + input.knobDeltas[1] * 0.05f);
    params.petals = constrain(params.petals + input.knobDeltas[2] * 0.5f, 3.0f, 16.0f);
    params.fold = constrain(params.fold + input.knobDeltas[3] * 0.05f, 0.0f, 5.0f);
    params.timeAcc += dt * params.speed;
  }

void draw() {float time = params.timeAcc;

    float t = params.timeAcc;
    int cx = PANEL_RES_W * 0.5f;
    int cy = PANEL_RES_H * 0.5f;
    float p = floorf(params.petals);
    float fold = params.fold;

    for (int y = 0; y < PANEL_RES_H; y++) {
        int dy = y - cy;
        for (int x = 0; x < PANEL_RES_W; x++) {
            int dx = x - cx;
            
            float angle = atan2f(dy, dx);
            float dist = sqrtf(dx * dx + dy * dy);
            
            // Sacred Geometry / Lotus math
            // The radius modulates based on the angle to create petals
            float petalWave = PFMath::fastSin(angle * p + t * 2.0f);
            float targetDist = 15.0f + petalWave * 10.0f + PFMath::fastSin(dist * 0.5f - t * 3.0f) * fold * 5.0f;
            
            float val = abs(dist - targetDist);
            
            uint8_t r = 0, g = 0, b = 0;
            
            if (val < 1.5f) {
                // Bright outline
                uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(params.hueBase, 0.5f, 1.0f, rgb_r, rgb_g, rgb_b);
                r = rgb_r; g = rgb_g; b = rgb_b;
            } else if (val < 5.0f && dist < targetDist) {
                // Inner petal glow
                uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(fmodf((float)((params.hueBase + 0.1f)), (float)(1.0f)), 0.9f, 1.0f - (val / 5.0f), rgb_r, rgb_g, rgb_b);
                r = rgb_r; g = rgb_g; b = rgb_b;
            } else if (dist < targetDist * 0.4f) {
                // Core
                if (fmodf((float)((x + y + floorf(t * 10))), (float)(3.0f)) == 0) {
                    uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(fmodf((float)((params.hueBase + 0.4f)), (float)(1.0f)), 1.0f, 1.0f, rgb_r, rgb_g, rgb_b);
                    r = rgb_r; g = rgb_g; b = rgb_b;
                }
            } else if (val < 10.0f && dist > targetDist) {
                // Outer aura
                if (floorf(fmodf((float)((angle * 20.0f)), (float)(2.0f))) == 0) {
                    uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(fmodf((float)((params.hueBase + 0.6f)), (float)(1.0f)), 1.0f, 0.4f * (1.0f - val/10.0f), rgb_r, rgb_g, rgb_b);
                    r = rgb_r; g = rgb_g; b = rgb_b;
                }
            }
            
            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
  }
} // namespace Pattern0512
