// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0513
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0513.ts
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

namespace Pattern0513 {
  const char* NAME = "0513";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float hue = 0.0f;
    float speed = 0.0f;
    float mode = 0.0f;
    float freq = 0.0f;
    float hueT = 0.0f;
    float speedT = 0.0f;
    float modeT = 0.0f;
    float freqT = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0513
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-13
// Lineage: AI generated and curated
//






  float wrap01(float v) {
 v = v - floorf(v); if (v < 0) v += 1.0f; return v; 
  }


  float mix(float a, float b, float t) {
 return a + (b - a) * t; 
  }


  float mixHue(float a, float b, float t) {

    float d = b - a;
    if (d > 0.5f) d -= 1.0f;
    if (d < -0.5f) d += 1.0f;
    return wrap01(a + d * t);

  }

void setup() {
    PFMath::buildSinLUT();

    params.hue = 0.56f; params.speed = 0.42f; params.mode = 0.35f; params.freq = 0.45f;
    params.hueT = params.hue; params.speedT = params.speed; params.modeT = params.mode; params.freqT = params.freq;
    params.timeAcc = 0.0f;

  }

void update(float dt, const InputFrame& input) {
    float d0 = 0.0f, d1 = 0.0f, d2 = 0.0f, d3 = 0.0f;
    if (true) {
        d0 = input.knobDeltas[0]; d1 = input.knobDeltas[1];
        d2 = input.knobDeltas[2]; d3 = input.knobDeltas[3];
    }
    params.hueT = wrap01(params.hueT + d0 * 0.012f);
    params.speedT = constrain(params.speedT + d1 * 0.018f, 0.0f, 1.0f);
    params.modeT = constrain(params.modeT + d2 * 0.018f, 0.0f, 1.0f);
    params.freqT = constrain(params.freqT + d3 * 0.018f, 0.0f, 1.0f);
    float s = constrain(dt * 7.5f, 0.0f, 1.0f);
    params.hue = mixHue(params.hue, params.hueT, s);
    params.speed = mix(params.speed, params.speedT, s);
    params.mode = mix(params.mode, params.modeT, s);
    params.freq = mix(params.freq, params.freqT, s);
    params.timeAcc += dt * (0.18f + params.speed * 1.85f);
  }

void draw() {float time = params.timeAcc;

    float w = PANEL_RES_W, h = PANEL_RES_H;
    float t = params.timeAcc, hue = params.hue, mode = params.mode, freq = params.freq;

    int cellSize = floorf(mix(16.0f, 4.0f, freq));
    float invCell = 1.0f / cellSize;
    uint8_t c1_r, c1_g, c1_b; PFColor::hsvToRgb(hue, 0.9f, 1.0f, c1_r, c1_g, c1_b);
    float shiftIntensity = mix(0.0f, 3.0f, mode);

    for (int y = 0; y < h; y++) {
        int gy = floorf(y * invCell);
        int shiftX = floorf(PFMath::fastSin(gy * 0.5f + t * 2.0f) * cellSize * shiftIntensity);
        float ny = (y - gy * cellSize) * invCell - 0.5f;
        float absNy = abs(ny);
        
        for (int x = 0; x < w; x++) {
            int effX = x + shiftX;
            int gx = floorf(effX * invCell);
            float nx = (effX - gx * cellSize) * invCell - 0.5f;
            float absNx = abs(nx);

            uint8_t r = 0, g = 0, b = 0;
            float mask = fmodf((float)((gx + gy)), (float)(2.0f)) == 0;
            
            if (mask) {
                if (absNx < 0.3f && absNy < 0.3f) {
                    r = c1_r; g = c1_g; b = c1_b;
                }
            } else {
                if (absNx > 0.4f || absNy > 0.4f) {
                    r = 255; g = 255; b = 255;
                }
            }
            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
  }
} // namespace Pattern0513
