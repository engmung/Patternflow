// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0515
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0515.ts
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

namespace Pattern0515 {
  const char* NAME = "0515";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float speed = 0.0f;
    float width = 0.0f;
    float shift = 0.0f;
    float phase = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0515
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Knobs: 1=Band Speed, 2=Band Width, 3=Layer Shift, 4=Color Phase

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.speed = 0.5f;
  params.width = 0.5f;
  params.shift = 0.5f;
  params.phase = 0.5f;
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
    params.speed = knobs[0];
    params.width = knobs[1];
    params.shift = knobs[2];
    params.phase = knobs[3];
  }
  params.timeAcc += dt * (0.3f + params.speed * 2.5f);
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float t = params.timeAcc;
  float bandWidth = 0.1f + params.width * 0.4f;  // 0.1f.0.0f.5f as fraction of width
  float layerShift = params.shift * w * 0.5f;   // pixel offset between layers
  float hueBase = params.phase;                 // 0.0.1f

  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      // Layer 1: travelling sine wave texture, offset moving right
      float nx1 = (x + t * w * 0.2f) / w;
      float tex1 = PFMath::fastSin(nx1 * 12 + PFMath::fastSin(y * 0.1f + t) * 3);
      // Layer 2: moving left, shifted vertically
      float nx2 = (x - t * w * 0.15f + layerShift) / w;
      float tex2 = PFMath::fastCos(nx2 * 8 + PFMath::fastCos(y * 0.07f - t) * 2.5f);

      // Convert to 0.0.1f value
      float v1 = (tex1 + 1) * 0.5f;
      float v2 = (tex2 + 1) * 0.5f;
      // Threshold bands: each layer has a moving threshold that creates ribbons
      float th1 = 0.5f + PFMath::fastSin(t * 2) * 0.2f;
      float th2 = 0.5f + PFMath::fastCos(t * 2.3f) * 0.2f;
      float m1 = v1 > th1 ? 1.0f : 0.0f;
      float m2 = v2 > th2 ? 1.0f : 0.0f;

      float intensity = m1 + m2 * 0.7f; // additive, layer2 softer
      float hue = hueBase;
      if (m1 > 0 && m2 > 0) {
        // overlap gives a bright highlight and different hue
        hue = fmodf((float)((hueBase + 0.5f)), (float)(1.0f));
        intensity = 1.2f;
      } else if (m1 > 0) {
        hue = hueBase;
      } else if (m2 > 0) {
        hue = hueBase + 0.2f;
      }
      intensity = min(1.0f, (float)intensity);
      float sat = 0.8f;
      int bright = intensity * 1.1f;
      if (intensity > 0.9f) bright = 1.0f;
      uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(hue, sat, bright, rgb_r, rgb_g, rgb_b);
      PFCanvas::setPixel(x, y, rgb_r, rgb_g, rgb_b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0515
