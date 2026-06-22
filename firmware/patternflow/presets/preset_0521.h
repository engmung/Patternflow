// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0521
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0521.ts
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

namespace Pattern0521 {
  const char* NAME = "0521";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float tear = 0.0f;
    float velocity = 0.0f;
    float blockSize = 0.0f;
    float bitThresh = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0521
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-21
// Lineage: AI generated and curated
//
// Asymmetric Bitwise Glitch Cascade (Point Color)
// Knob 1: Tear Severity (horizontal crack intensity from fault tearing)
// Knob 2: Cascade Velocity (waterfall frequency of vertically falling bit chunks)
// Knob 3: Pixel Block Size (macro resolution unit of bitwise fragment chunks)
// Knob 4: Bitwise Threshold (binary mask bit matching threshold level)

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

  params.tear = 0.5f;
  params.velocity = 2.0f;
  params.blockSize = 2.5f;
  params.bitThresh = 0.06f;
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
    params.tear = knobs[0];
    params.velocity = knobs[1];
    params.blockSize = knobs[2];
    params.bitThresh = knobs[3];
  }
  params.timeAcc += dt * params.velocity * 3.0f;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float t = params.timeAcc;

  const float ditherPattern[] = {0, 12, 3, 15, 8, 4, 11, 7, 2, 14, 1, 13, 10, 6, 9, 5};
  int pSize = max(1.0f, floorf(1.0f + params.blockSize * 4.0f));

  for (int y = 0; y < h; y++) {
    int faultLine = PFMath::fastSin(y * 0.08f + t * 0.4f) * PFMath::fastCos(y * 0.03f);
    int hShift = 0;
    if (faultLine > 0.9f - params.tear * 0.7f) {
      hShift = floorf(tanf(y * 0.05f + t) * (params.tear * 15.0f));
    }

    for (int x = 0; x < w; x++) {
      int sx = floorf((fmodf((float)((x + hShift + w)), (float)(w))) / pSize) * pSize;
      int sy = floorf(y / pSize) * pSize;

      float streamSeed = PFMath::fastSin(floorf(sx / 8) * 54.12f) * 0.5f + 0.5f;
      int drop = floorf(fmodf((float)((sy / 4 - t * (0.6f + streamSeed * 0.4f))), (float)(16.0f)));
      if (drop < 0) drop += 16;
      int rainMass = drop < 6 ? 1.0f : 0.0f;

      int maskVal = floorf(params.bitThresh * 31);
      float bitField = (((sx / pSize) ^ (sy / pSize)) & maskVal) == 0 ? 0.5f : 0.0f;

      float totalSignal = rainMass * 0.6f + bitField;
      
      int cx = sx - w * 0.5f;
      int cy = sy - h * 0.5f;
      float bgWave = PFMath::fastSin(sqrtf(cx * cx + cy * cy) * 0.15f - t) * 0.25f;
      totalSignal += bgWave;

      int mx = fmodf((float)(x), (float)(4.0f));
      int my = fmodf((float)(y), (float)(4.0f));
      float thresh = ditherPattern[my * 4 + mx] / 16.0f;

      uint8_t r = 0, g = 0, b = 0;
      if (totalSignal > thresh) {
        // [Point Layer] Only the head chunk of specific falling streams gets an electric neon pink point highlight
        if (rainMass > 0.0f && drop == 0) {
          r = 255; g = 0; b = 150;
        } else {
          r = 255; g = 255; b = 255;
        }
      }

      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0521
