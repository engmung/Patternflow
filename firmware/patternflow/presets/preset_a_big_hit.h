// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: a big hit
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-a-big-hit.ts
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

namespace PatternABigHit {
  const char* NAME = "a big hit";
  const char* const KNOB_LABELS[4] = {"hueBase", "speed", "scale", "chaos"};

  struct Params {
    float hueBase = 0.0f;
    float speed = 0.0f;
    float scale = 0.0f;
    float chaos = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: a big hit
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-11
// Lineage: AI generated and curated
//
// Liquid plasma with chaos-warped neon ridges

void setup() {
    PFMath::buildSinLUT();

    params.hueBase = 0.5f;
    params.speed = 1.0f;
    params.scale = 0.1f;
    params.chaos = 1.0f;
    params.timeAcc = 0.0f;

  }

void update(float dt, const InputFrame& input) {
    params.hueBase = fmodf((float)((params.hueBase + input.knobDeltas[0] * 0.05f)), (float)(1.0f));
    if (params.hueBase < 0) params.hueBase += 1.0f;
    params.speed = max(0.0f, params.speed + input.knobDeltas[1] * 0.05f);
    params.scale = constrain(params.scale + input.knobDeltas[2] * 0.01f, 0.02f, 0.2f);
    params.chaos = constrain(params.chaos + input.knobDeltas[3] * 0.1f, 0.0f, 3.0f);
    params.timeAcc += dt * params.speed;
  }

void draw() {float time = params.timeAcc;

    float t = params.timeAcc;
    float s = params.scale;
    float c = params.chaos;

    for (int y = 0; y < PANEL_RES_H; y++) {
        float ny = y * s;
        for (int x = 0; x < PANEL_RES_W; x++) {
            float nx = x * s;
            
            // Nested trigonometric functions for liquid plasma/domain warping
            float v1 = PFMath::fastSin(nx + t);
            float v2 = PFMath::fastCos(ny - t * 0.8f);
            
            // Add chaos distortion
            float warpX = PFMath::fastSin(ny * 2.0f + t) * c;
            float warpY = PFMath::fastCos(nx * 2.0f - t * 1.2f) * c;
            
            float v3 = PFMath::fastSin((nx + warpX) * 1.5f + t * 1.5f);
            float v4 = PFMath::fastCos((ny + warpY) * 1.5f - t);
            
            // Combine fields and take absolute value to create sharp interference "ridges"
            float field = abs(v1 + v2 + v3 + v4);
            
            // Invert and sharpen: 0.0f is empty, highly peaked at exactly the ridges
            float val = 1.0f - (field * 0.5f);
            val = powf(constrain(val, 0.0f, 1.0f), 3.0f); // pow is ok sparsely, makes neon tubes pop
            
            // Boost brightness to ensure LED pop
            val = constrain(val * 2.5f, 0.0f, 1.0f);

            // Deep organic color shifting based on position
            float hue = fmodf((float)((params.hueBase + nx * 0.1f + ny * 0.1f + field * 0.05f)), (float)(1.0f));
            
            uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(hue, 1.0f - val * 0.2f, val, rgb_r, rgb_g, rgb_b); // Desaturate slightly at absolute brightest centers
            PFCanvas::setPixel(x, y, rgb_r, rgb_g, rgb_b);
        }
    }

    PFCanvas::present();
  }
} // namespace PatternABigHit
