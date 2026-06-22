// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0514
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0514.ts
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

namespace Pattern0514 {
  const char* NAME = "0514";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float timeAcc = 0.0f;
    float hueT = 0.0f;
    float speed = 0.0f;
    float depth = 0.0f;
    float warp = 0.0f;
  };
  Params params;

// Pattern: 0514
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-14
// Lineage: AI generated and curated
//




  float wrap01(float v) {

  v = v - floorf(v);
  if (v < 0) v += 1.0f;
  return v;

  }

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.timeAcc = 0;
  params.hueT = 0.57f;

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
    params.hueT = wrap01(params.hueT + (knobs[0] - 0.5f) * 0.008f);
    params.speed = knobs[1];
    params.depth = knobs[2];
    params.warp = knobs[3];
  }
  params.timeAcc += dt * (0.23f + params.speed * 2.5f);
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float t = params.timeAcc;
  float hue = params.hueT;
  float warp = 7 + params.warp * 28;

  uint8_t c1_r, c1_g, c1_b; PFColor::hsvToRgb(hue, 0.94f, 1.0f, c1_r, c1_g, c1_b);
  uint8_t c2_r, c2_g, c2_b; PFColor::hsvToRgb(hue + 0.11f, 0.86f, 1.0f, c2_r, c2_g, c2_b);
  uint8_t c3_r, c3_g, c3_b; PFColor::hsvToRgb(hue + 0.39f, 0.93f, 0.98f, c3_r, c3_g, c3_b);
  uint8_t c4_r, c4_g, c4_b; PFColor::hsvToRgb(hue + 0.71f, 0.74f, 0.95f, c4_r, c4_g, c4_b);

  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      int cellSize = 9;
      int gx = floorf(x / cellSize);
      int gy = floorf(y / cellSize);
      
      int cx = (gx + 0.5f) * cellSize + PFMath::fastSin(gy * 0.7f + t * 1.05f) * warp * 0.75f;
      int cy = (gy + 0.5f) * cellSize + PFMath::fastCos(gx * 0.85f - t * 0.55f) * warp * 0.75f;

      float tex1 = (PFMath::fastSin(cx * 0.046f + t * 1.05f) + PFMath::fastCos(cy * 0.053f - t * 0.85f)) * 0.5f + 0.5f;
      float tex2 = PFMath::fastSin(y * 0.022f + t * 0.32f * params.depth) * 0.5f + 0.5f;

      float intensity = tex1 * (1 - params.depth * 0.4f) + tex2 * params.depth * 1.2f;
      intensity = constrain(intensity, 0, 1.0f);

      float lx = (fmodf((float)(x), (float)(cellSize))) / cellSize - 0.5f;
      float ly = (fmodf((float)(y), (float)(cellSize))) / cellSize - 0.5f;

      uint8_t r = 0, g = 0, b = 0;
      if (intensity < 0.35f) {
        if (max(abs(lx), abs(ly)) < 0.4f) { r = c1_r; g = c1_g; b = c1_b; }
      } else if (intensity < 0.52f) {
      } else if (intensity < 0.7f) {
        if (abs(lx) < 0.22f || abs(ly) < 0.22f) { r = c2_r; g = c2_g; b = c2_b; }
      } else if (intensity < 0.86f) {
        if (abs(lx - ly) < 0.26f) { r = c3_r; g = c3_g; b = c3_b; }
      } else {
        if (max(abs(lx), abs(ly)) < 0.48f) { r = c4_r; g = c4_g; b = c4_b; }
      }

      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0514
