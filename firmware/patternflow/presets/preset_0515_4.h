// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0515-4
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0515-4.ts
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

namespace Pattern05154 {
  const char* NAME = "0515-4";
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

// Pattern: 0515-4
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Knob 1 (0-1): Grid complexity (size of cells)
// Knob 2 (0.1-10): Mechanical oscillation speed
// Knob 3 (0-4.9): Joint thickness (gear tooth size)
// Knob 4 (0-1): Sharpness vs inner fill brightness

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.k1 = 0;
  params.k2 = 2;
  params.k3 = 0;
  params.k4 = 0.06f;
  params.timeAcc = 0;

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
    params.k1 = knobs[0];
    params.k2 = knobs[1];
    params.k3 = knobs[2];
    params.k4 = knobs[3];
  }
  params.timeAcc += dt * params.k2;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float t = params.timeAcc;
  
  int cellSize = floorf(8 + params.k1 * 16);
  float thickness = 1.0f + params.k3;
  float fillBright = params.k4;

  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      int gx = floorf(x / cellSize);
      int gy = floorf(y / cellSize);
      
      float lx = (fmodf((float)(x), (float)(cellSize))) - cellSize * 0.5f;
      float ly = (fmodf((float)(y), (float)(cellSize))) - cellSize * 0.5f;

      // Checkerboard phase offset causes adjacent cells to "spin" inversely
      float isEven = fmodf((float)((gx + gy)), (float)(2.0f)) == 0;
      float phase = isEven ? t * 2.0f : -t * 2.0f;

      // Simulated rotation via coordinate transform
      float rx = lx * PFMath::fastCos(phase) - ly * PFMath::fastSin(phase);
      float ry = lx * PFMath::fastSin(phase) + ly * PFMath::fastCos(phase);

      // SDF Cross / Gear shape
      float crossDist = min(abs(rx), abs(ry));
      float boundary = max(abs(rx), abs(ry));
      
      uint8_t r = 0, g = 0, b = 0;

      // Color logic: High contrast mechanic. Edges are pure white, fills are solid
      if (boundary < cellSize * 0.45f && crossDist < thickness) {
        // Inner edge highlight
        if (abs(crossDist - thickness) < 0.8f) {
          r = 255; g = 255; b = 255;
        } else {
          // Inner fill
          float localHue = isEven ? 0.05f : 0.55f; // Orange vs Cyan checkerboard
          uint8_t c_r, c_g, c_b; PFColor::hsvToRgb(localHue, 0.9f, fillBright + 0.2f, c_r, c_g, c_b);
          r = c_r; g = c_g; b = c_b;
        }
      } else if (boundary > cellSize * 0.45f && boundary < cellSize * 0.5f) {
        // Outer mechanical housing boundary
        uint8_t c_r, c_g, c_b; PFColor::hsvToRgb(0.8f, 0.8f, 0.3f, c_r, c_g, c_b);
        r = c_r; g = c_g; b = c_b;
      }

      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern05154
