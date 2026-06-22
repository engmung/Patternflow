// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0602
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0602.ts
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

namespace Pattern0602 {
  const char* NAME = "0602";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float k1 = 0.0f;
    float k2 = 0.0f;
    float k3 = 0.0f;
    float k4 = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0602
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-02
// Lineage: AI generated and curated
//
// Knob 1: Oil Core Shift (0-1)
// Knob 2: Melt Speed (0.1-10)
// Knob 3: Glitch Intensity/Slicing (0-4.9)
// Knob 4: Color Separation Tearing (0-1)

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.k1 = 0; params.k2 = 2; params.k3 = 0; params.k4 = 0; params.timeAcc = 0;

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
    params.k1 = knobs[0]; params.k2 = knobs[1];
    params.k3 = knobs[2]; params.k4 = knobs[3];
  }
  params.timeAcc += dt * params.k2 * 0.5f;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W, h = PANEL_RES_H, t = params.timeAcc;
  float glitchAmt = params.k3 * 10.0f;
  float tear = params.k4 * 3.0f;

  for (int y = 0; y < h; y++) {
    // Divide the Y axis into bands of specific thickness to generate horizontal swipe glitches
    float band = floorf(y / 4.0f);
    float glitchShift = PFMath::fastSin(band * 12.34f + t * 2.0f) * glitchAmt;
    
    // Add a strong choppy stuttering effect
    if (abs(PFMath::fastSin(band * 7.65f - t * 3.0f)) > 0.9f) {
      glitchShift *= 3.0f;
    }

    for (int x = 0; x < w; x++) {
      int gx = x + glitchShift; // Use distorted X coordinate
      
      float fluid = PFMath::fastSin(y * 0.03f + t) * PFMath::fastCos(gx * 0.03f - t) + PFMath::fastSin(gx * 0.02f + y * 0.01f);
      
      float contour = PFMath::fastSin(fluid * 5.0f);
      
      float rVal = PFMath::fastSin((contour + params.k1) * 2.5f + tear) * 0.5f + 0.5f;
      float gVal = PFMath::fastSin((contour + params.k1) * 2.5f) * 0.5f + 0.5f;
      float bVal = PFMath::fastSin((contour + params.k1) * 2.5f - tear) * 0.5f + 0.5f;

      float r = powf(rVal, 2.0f) * 255;
      float g = powf(gVal, 2.0f) * 255;
      float b = powf(bVal, 2.0f) * 255;

      PFCanvas::setPixel(x, y, floorf(r), floorf(g), floorf(b));
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0602
