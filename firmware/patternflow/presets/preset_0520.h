// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0520
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0520.ts
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

namespace Pattern0520 {
  const char* NAME = "0520";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float density = 0.0f;
    float speed = 0.0f;
    float thickness = 0.0f;
    float mutation = 0.0f;
    float timeAcc = 0.0f;
  };
  Params params;

// Pattern: 0520
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-20
// Lineage: AI generated and curated
//
// Bio-Luminescent Tendrils
// Knob 1: Wave Density (spatial frequency density)
// Knob 2: Fluid Speed (animation speed)
// Knob 3: Tendril Thicken (tendril thickness and cohesion)
// Knob 4: Color Mutation (position-based color mutation range)

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

    params.density = 0.5f;
    params.speed = 1.0f;
    params.thickness = 0.5f;
    params.mutation = 0.5f;
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
        params.density = knobs[0];
        params.speed = knobs[1];
        params.thickness = knobs[2];
        params.mutation = knobs[3];
    }
    params.timeAcc += dt * params.speed;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

    float t = params.timeAcc;
    float w = PANEL_RES_W;
    float h = PANEL_RES_H;

    // Adjust knob mapping
    float freq = 0.03f + params.density * 0.12f;
    float thickScale = 0.5f + params.thickness * 2.5f;

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            float nx = x * freq;
            float ny = y * freq;

            // Generate honeycomb-shaped structural distortion field
            float f1 = PFMath::fastSin(nx + t) * PFMath::fastCos(ny + t * 0.5f);
            float f2 = PFMath::fastSin(ny - t * 0.7f) * PFMath::fastCos(nx - t * 0.3f);
            
            // Synthesize organic tendril network
            float nX = nx + f1 * 1.5f;
            float nY = ny + f2 * 1.5f;
            
            float v1 = PFMath::fastSin(nX * 2.0f - t * 0.8f);
            float v2 = PFMath::fastCos(nY * 2.0f + t * 1.1f);
            float centerField = abs(v1 + v2);

            // Smoothly extract tendril boundaries
            float val = expf(-powf(centerField - 0.4f, 2.0f) * thickScale);
            val = constrain(val * 1.8f, 0.0f, 1.0f);

            // Colorful color combinations tied to local phase and fluidity
            float hue = fmodf((float)((0.2f + params.mutation * (x / w) + f1 * 0.1f + t * 0.04f)), (float)(1.0f));
            if (hue < 0) hue += 1.0f;

            // Induce white light at the bright centerlines
            float sat = constrain(1.0f - val * 0.4f, 0.5f, 1.0f);
            uint8_t rgb_r, rgb_g, rgb_b; PFColor::hsvToRgb(hue, sat, val, rgb_r, rgb_g, rgb_b);

            PFCanvas::setPixel(x, y, rgb_r, rgb_g, rgb_b);
        }
    }

    PFCanvas::present();
  }
} // namespace Pattern0520
