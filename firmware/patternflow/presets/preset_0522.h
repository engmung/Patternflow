// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0522
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0522.ts
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

namespace Pattern0522 {
  const char* NAME = "0522";
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

// Pattern: 0522
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-22
// Lineage: AI generated and curated
//
// Quad-Fold Warp Gate (Domain Remix)
// Knob 1: Warp Amplitude (sine wave distortion strength of quad-fold mirror symmetry planes)
// Knob 2: Whirlpool Velocity (scroll speed frequency of distorted coordinates)
// Knob 3: Sub-Grid Block Size (macro resolution scale of bit substrate after domain warp)
// Knob 4: Matrix Boolean Mask (XOR/AND composite domain matching gate threshold level)

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
  params.timeAcc += dt * params.velocity * 3.2f;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float t = params.timeAcc;

  const float ditherPattern[] = {0, 12, 3, 15, 8, 4, 11, 7, 2, 14, 1, 13, 10, 6, 9, 5};
  int pSize = max(1.0f, floorf(1.0f + params.blockSize * 4.0f));

  int cx = (int)(w) >> 1;
  int cy = (int)(h) >> 1;

  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      // 1. Domain Warping
      float warpX = PFMath::fastSin(y * 0.07f + t) * (params.tear * 15.0f);
      float warpY = PFMath::fastCos(x * 0.07f - t) * (params.tear * 15.0f);

      // 2. Quad-Fold Mirroring
      int dx = abs(x - cx + floorf(warpX));
      int dy = abs(y - cy + floorf(warpY));

      int sx = floorf(dx / pSize) * pSize;
      int sy = floorf(dy / pSize) * pSize;

      // 3. Calculate scrolling bits on warped space
      float cellSeed = PFMath::fastSin(floorf(sy / 5) * 62.19f) * 0.5f + 0.5f;
      int flow = floorf(fmodf((float)((sx / 4 - t * (1.1f + cellSeed * 0.3f))), (float)(16.0f)));
      if (flow < 0) flow += 16;
      float gateMass = flow < 4 ? 1.0f : 0.0f;

      // 4. Symmetric domain matrix bitmask
      int maskVal = floorf(params.bitThresh * 31);
      float bitField = (((sx / pSize) ^ (sy / pSize)) & maskVal) == 0 ? 0.45f : 0.0f;

      float totalSignal = gateMass * 0.6f + bitField;
      float spaceWave = PFMath::fastSin(sqrtf(dx * dx + dy * dy) * 0.12f - t) * 0.2f;
      totalSignal += spaceWave;

      int mx = fmodf((float)(x), (float)(4.0f));
      int my = fmodf((float)(y), (float)(4.0f));
      float thresh = ditherPattern[my * 4 + mx] / 16.0f;

      uint8_t r = 0, g = 0, b = 0;
      if (totalSignal > thresh) {
        if (gateMass > 0.0f && (sx == 0 || sy == 0)) {
          // Pass psychedelic neon sky blue beam through vertex centerline of mirror symmetry
          r = 0; g = 220; b = 255;
        } else if (bitField > 0.0f && fmodf((float)((sx * sy)), (float)(3.0f)) == 0) {
          // Flash neon violet/magenta at orthogonal high-dimension node blocks
          r = 255; g = 0; b = 180;
        } else {
          r = 255; g = 255; b = 255;
        }
      } else if (totalSignal > thresh * 0.5f && dx < pSize * 6) {
        // Add deep cosmic techno midnight indigo shading around warp gate threshold
        r = 20; g = 10; b = 70;
      }

      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0522
