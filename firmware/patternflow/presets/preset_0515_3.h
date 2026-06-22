// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0515-3
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0515-3.ts
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

namespace Pattern05153 {
  const char* NAME = "0515-3";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float hueBase = 0.0f;
    float speed = 0.0f;
    float freq = 0.0f;
    float chaos = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0515-3
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Variation 2: Grid Interference





// Knob1: Hue, Knob2: Speed, Knob3: Frequency, Knob4: Chaos

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.hueBase = 0.6f;
  params.speed = 1.0f;
  params.freq = 0.1f;
  params.chaos = 1.0f;
  params.timeAcc = 0.0f;

  }

void update(float dt, const InputFrame& input) {
    params.rawKnob0 += input.knobDeltas[0] * 0.05f;
    if (params.rawKnob0 < 0.0f) params.rawKnob0 += 1.0f;
    params.rawKnob0 = fmodf(params.rawKnob0, 1.0f);

    params.rawKnob1 = constrain(params.rawKnob1 + input.knobDeltas[1] * 0.1f, 0.1f, 10.0f);

    params.rawKnob2 = constrain(params.rawKnob2 + input.knobDeltas[2] * 0.05f, 0.0f, 4.9f);

    params.rawKnob3 += input.knobDeltas[3] * 0.05f;
    if (params.rawKnob3 < 0.0f) params.rawKnob3 += 1.0f;
    params.rawKnob3 = fmodf(params.rawKnob3, 1.0f);

    const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };

  if (true) {
    params.hueBase = knobs[0];
    params.speed = knobs[1] * 4 + 0.4f;
    params.freq = knobs[2] * 0.15f + 0.05f;
    params.chaos = knobs[3] * 3;
  }
  params.timeAcc += dt * params.speed;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float t = params.timeAcc;
  float f = params.freq;

  for (int y = 0; y < PANEL_RES_H; y++) {
    for (int x = 0; x < PANEL_RES_W; x++) {
      float v1 = PFMath::fastSin(x * f + t);
      float v2 = PFMath::fastSin(y * f * 1.3f - t * 1.1f);
      float v3 = PFMath::fastSin((x + y) * f * 0.7f + t * 0.8f);
      float v4 = PFMath::fastSin((x - y) * f * 1.2f - t * 0.9f);

      float field = abs(v1 + v2 + v3 + v4) * (0.4f + params.chaos * 0.1f);
      float val = powf(constrain(1.2f - field, 0.0f, 1.0f), 3.0f);

      float hue = fmodf((float)((params.hueBase + (x + y) * 0.003f + field * 0.4f)), (float)(1.0f));
      uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(hue, 0.9f, val * 0.9f + 0.1f, rgb_r, rgb_g, rgb_b);
      PFCanvas::setPixel(x, y, rgb_r, rgb_g, rgb_b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern05153
