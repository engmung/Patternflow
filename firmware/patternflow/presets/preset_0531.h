// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0531
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0531.ts
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

namespace Pattern0531 {
  const char* NAME = "0531";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float time = 0.0f;
    float colorShift = 0.0f;
    float speed = 0.0f;
    float density = 0.0f;
    float invertThreshold = 0.0f;
  };
  Params params;

// Pattern: 0531
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-31
// Lineage: AI generated and curated
//
// Posterized Thermal Gradient
// Knob 1: Thermal Core Offset (Base shift of threshold indices)
// Knob 2: Animation Speed
// Knob 3: Material Density Scale (Frequency of spatial noise bands)
// Knob 4: Color Palette Inversion Threshold

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.time = 0;

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

  
  
  // Custom material control mapping
  params.colorShift = knobs[0];
  params.speed = knobs[1];
  params.density = 0.02f + (knobs[2] / 4.9f) * 0.15f; // 0.02f to 0.17f
  params.invertThreshold = knobs[3];
  
  params.time += dt * params.speed;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float globalTime = params.time;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;

  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      // Complex spatial signal generating topological lines
      float n1 = PFMath::fastSin(x * params.density + params.time * 0.7f);
      float n2 = PFMath::fastCos(y * params.density - params.time * 0.5f);
      float n3 = PFMath::fastSin((x + y) * params.density * 0.5f + params.time);
      
      float compositeSignal = (n1 + n2 + n3) / 3.0f * 0.5f + 0.5f; // Normalized 0 to 1
      
      // Map to 5 distinct discrete material color bands
      float evaluationVal = fmodf((float)((compositeSignal + params.colorShift)), (float)(1.0f));
      int bandIndex = floorf(evaluationVal * 5);
      
      uint8_t r = 0, g = 0, b = 0;
      
      // Assign static, vivid material colors per index band mimicking thermal cameras
      switch ((int)(bandIndex)) {
        case 0: {
      // Ultra Hot Core
          r = 255; g = 255; b = 255;
      break;
    }
    case 1: {
      // Intense Heat
          r = 255; g = 140; b = 0;
      break;
    }
    case 2: {
      // Fluid Plasma
          r = 220; g = 0; b = 100;
      break;
    }
    case 3: {
      // Subdued Ambient Fill
          r = 40; g = 0; b = 160;
      break;
    }
    case 4: {
      // Deep Sub-zero Cold
          r = 5; g = 10; b = 40;
      break;
    }
    }
      
      // Perform color block inverting check based on Knob 4 configuration
      if (evaluationVal > params.invertThreshold) {
        float brightSave = (r + g + b) / 3;
        r = brightSave * 0.2f;
        g = 255 - g;
        b = 255;
      }
      
      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0531
