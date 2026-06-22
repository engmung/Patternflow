// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0601
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0601.ts
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

namespace Pattern0601 {
  const char* NAME = "0601";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float time = 0.0f;
    float cellSize = 0.0f;
    float speed = 0.0f;
    float threshold = 0.0f;
    float phaseSplit = 0.0f;
  };
  Params params;

// Pattern: 0601
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-01
// Lineage: AI generated and curated
//
// Cellular Wave Matrix
// Knob 1: Grid Density (Cell Size Selector)
// Knob 2: Animation Speed
// Knob 3: Cell Inversion Threshold (Hardness of square blocks)
// Knob 4: Local Phase Split (Offset between alternating columns)

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

  
  
  // Custom structural control mapping
  params.cellSize = max(4.0f, floorf((1.0f - knobs[0]) * 24 + 4));
  params.speed = knobs[1];
  params.threshold = knobs[2] / 4.9f; // Normalize 0 to 1
  params.phaseSplit = knobs[3] * PI * 2;
  
  params.time += dt * params.speed;
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float globalTime = params.time;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float size = params.cellSize;

  for (int y = 0; y < h; y++) {
    // Structural layout: block coordinate
    int cellY = floorf(y / size);
    
    for (int x = 0; x < w; x++) {
      int cellX = floorf(x / size);
      
      // Calculate a distinct phase per cell grid structural group
      float wavePhase = params.time + cellX * 0.4f + cellY * 0.3f;
      if (fmodf((float)(cellX), (float)(2.0f)) == 0) {
        wavePhase += params.phaseSplit;
      }

      // Generate localized square-wave signal
      float signal = PFMath::fastSin(wavePhase) * 0.5f + 0.5f;
      
      // Determine if this pixel is part of the core cell or its shell boundary
      int localX = fmodf((float)(x), (float)(size));
      int localY = fmodf((float)(y), (float)(size));
      bool isEdge = (localX == 0 || localX == size - 1 || localY == 0 || localY == size - 1);
      
      int bright = 0;
      uint8_t r = 0, g = 0, b = 0;

      if (signal > params.threshold) {
        // Active Cell State
        bright = isEdge ? 255 : (0.4f + (signal - params.threshold) * 0.6f) * 255;
        
        // Color linked entirely to structural cell ID and signal intensity
        float colorAngle = wavePhase + cellX * 0.1f;
        r = (PFMath::fastSin(colorAngle) * 0.5f + 0.5f) * bright;
        g = (PFMath::fastSin(colorAngle + 1.5f) * 0.5f + 0.5f) * bright;
        b = (PFMath::fastSin(colorAngle + 3.0f) * 0.5f + 0.5f) * bright;
      } else {
        // Inactive/Background State: Draw thin, dim moving tracking lines
        float scanline = PFMath::fastSin(x * 0.1f - params.time * 2.0f) * 0.5f + 0.5f;
        if (scanline > 0.85f && isEdge) {
          r = 0;
          g = scanline * 120;
          b = scanline * 180;
        }
      }

      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern0601
