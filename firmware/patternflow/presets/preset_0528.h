// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0528
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0528.ts
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

namespace Pattern0528 {
  const char* NAME = "0528";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float time = 0.0f;
    float blockSize = 0.0f;
    float speed = 0.0f;
    float sparsity = 0.0f;
    float chaos = 0.0f;
  };
  Params params;

// Pattern: 0528
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-28
// Lineage: AI generated and curated
//
// Contrast Remix: Mechanical Grid Blocks
// Knob 1: Grid Block Size [0.0 to 1.0]
// Knob 2: Animation Speed [0.1 to 10.0]
// Knob 3: Sparsity Threshold Limit [0.0 to 4.9]
// Knob 4: Chaos Noise Modulation [0.0 to 1.0]

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

  
  params.blockSize = 4 + floorf(knobs[0] * 12); 
  params.speed = knobs[1];
  params.sparsity = knobs[2] / 4.9f; 
  params.chaos = knobs[3] * 1.5f;
  params.time += dt * params.speed;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float globalTime = params.time;

  for (int y = 0; y < PANEL_RES_H; y++) {
    int blockY = floorf(y / params.blockSize);
    float innerY = (fmodf((float)(y), (float)(params.blockSize))) / params.blockSize - 0.5f;

    for (int x = 0; x < PANEL_RES_W; x++) {
      int blockX = floorf(x / params.blockSize);
      float innerX = (fmodf((float)(x), (float)(params.blockSize))) / params.blockSize - 0.5f;

      // Compute individual cellular energy levels
      float cellEnergy = PFMath::fastSin(blockX * 0.35f + blockY * 0.25f + params.time) * 0.5f + 0.5f;

      // Inject high-frequency structural disorder based on chaos control
      if (params.chaos > 0.05f) {
        float structuralNoise = PFMath::fastSin(blockX * 3.1f - blockY * 2.3f - params.time * 2.0f);
        cellEnergy += structuralNoise * params.chaos * 0.3f;
        cellEnergy = max(0.0f, min(1.0f, (float)cellEnergy));
      }

      uint8_t r = 0, g = 0, b = 0;

      // Strict clip to keep background stark, sparse, and black
      if (cellEnergy > params.sparsity) {
        // Define mechanical circular dot mask inside the cell bounds
        float radiusSq = innerX * innerX + innerY * innerY;
        float maxRadius = cellEnergy * 0.45f;

        if (radiusSq < maxRadius) {
          float edgeProfile = 1.0f - (radiusSq / maxRadius);
          
          // Color selection based completely on cell parity and local energy states
          if (fmodf((float)((blockX + blockY)), (float)(2.0f)) == 0) {
            // Bright Orange/Yellow block cells
            r = 255;
            g = 80 + cellEnergy * 175;
            b = edgeProfile * 100;
          } else {
            // High-voltage Emerald/Teal block cells
            r = edgeProfile * 50;
            g = 230;
            b = 150 + cellEnergy * 105;
          }

          // Force hot-white cores inside energetic blocks
          if (edgeProfile > 0.85f) {
            r = 255; g = 255; b = 255;
          }
        }
      }

      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0528
