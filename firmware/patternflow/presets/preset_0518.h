// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0518
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0518.ts
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

namespace Pattern0518 {
  const char* NAME = "0518";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float split = 0.0f;
    float speed = 0.0f;
    float shear = 0.0f;
    float bands = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0518
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-18
// Lineage: AI generated and curated
//
// Controls:
// Knob 1: Palette Split (distance between band colors)
// Knob 2: Animation Speed
// Knob 3: Shear Amplitude (horizontal stretching)
// Knob 4: Band Frequency (number of slices)




  float hash21(float x, float y) {

  float n = PFMath::fastSin(x * 12.9898f + y * 78.233f) * 43758.5453f;
  return n - floorf(n);

  }



  float noise2D(float x, float y) {

  float ix = floorf(x), iy = floorf(y), fx = x - ix, fy = y - iy;
  float ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  float a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;

  }

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.split = 0.5f;
  params.speed = 1.0f;
  params.shear = 20.0f;
  params.bands = 0.1f;
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
    params.split = knobs[0];
    params.speed = knobs[1] * 2.0f;
    params.shear = knobs[2] * 40.0f;
    params.bands = 0.02f + knobs[3] * 0.2f;
  }
  params.timeAcc += dt * params.speed;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W, h = PANEL_RES_H;
  float t = params.timeAcc;

  for (int y = 0; y < h; y++) {
    // Determine which band we are in
    int bandId = floorf(y * params.bands);
    float bandFract = (y * params.bands) - bandId;
    
    // Alternate direction and speed per band
    float dir = (fmodf((float)(bandId), (float)(2.0f)) == 0) ? 1 : -1;
    float bandSpeed = dir * (1.0f + noise2D(bandId, 0.0f) * 2.0f) * t;
    
    // Shear offset based on band noise
    float offset = noise2D(bandId * 5.1f, t * 0.2f) * params.shear;
    
    for (int x = 0; x < w; x++) {
      float shearedX = x + offset + bandSpeed;
      float n = noise2D(shearedX * 0.05f, y * 0.05f);
      
      // Color logic: alternating bands use split complementary hues
      float localHue = (fmodf((float)(bandId), (float)(2.0f)) == 0) ? n * 0.2f : params.split + n * 0.2f;
      
      // Add a slight darkening at the edges of the bands to separate them
      float edgeDarken = PFMath::fastSin(bandFract * PI);
      float val = max(0.0f, (n * 1.5f) * edgeDarken);
      
      uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(localHue, 0.8f, min(1.0f, (float)val), rgb_r, rgb_g, rgb_b);
      PFCanvas::setPixel(x, y, rgb_r, rgb_g, rgb_b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0518
