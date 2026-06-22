// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0519-1
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0519-1.ts
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

namespace Pattern05191 {
  const char* NAME = "0519-1";
  const char* const KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

  struct Params {
    float rawKnob0 = 0.0f;
    float rawKnob1 = 2.0f;
    float rawKnob2 = 0.0f;
    float rawKnob3 = 0.06f;
    float timeAcc = 0.0f;
    float tension = 0.0f;
    float zoom = 0.0f;
    float sharpness = 0.0f;
  };
  Params params;

// Pattern: 0519-1
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-19
// Lineage: AI generated and curated
//
// Knobs for Organic Isocontours:
// Knob 1: Surface Tension (Blob expansion/contraction)
// Knob 2: Undulation Speed
// Knob 3: Map Zoom Level
// Knob 4: Contour Sharpness (Stepped bands vs smooth gradients)

void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.0f;
    params.rawKnob1 = 2.0f;
    params.rawKnob2 = 0.0f;
    params.rawKnob3 = 0.06f;

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

  float speed = true ? knobs[1] : 2.0f;
  params.timeAcc += dt * speed * 0.5f;
  
  if (true) {
    params.tension = (knobs[0] - 0.5f) * 2.0f; // -1 to 1
    params.zoom = 0.02f + knobs[2] * 0.08f;
    params.sharpness = knobs[3];
  } else {
    params.tension = 0.0f;
    params.zoom = 0.05f;
    params.sharpness = 1.0f;
  }
  }

void draw() {const float knobs[4] = { params.rawKnob0, params.rawKnob1, params.rawKnob2, params.rawKnob3 };
float time = params.timeAcc;

  float w = PANEL_RES_W;
  float h = PANEL_RES_H;
  float t = params.timeAcc;
  
  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      float nx = x * params.zoom;
      float ny = y * params.zoom;
      
      // Sum of sine waves for a smooth organic field
      float v1 = PFMath::fastSin(nx + t) + PFMath::fastCos(ny - t);
      float v2 = PFMath::fastSin((nx + ny) * 0.8f + t * 1.3f);
      float v3 = PFMath::fastCos((nx - ny) * 1.2f - t * 0.7f);
      
      float field = (v1 + v2 + v3) / 3.0f; 
      field += params.tension;
      
      uint8_t r = 0, g = 0, b = 0;
      
      if (field > 0.0f) {
        // We are inside the organic blob
        // Create topographical contour lines
        float bands = field * 10.0f;
        float bandFract = bands - floorf(bands);
        
        float edgeValue = bandFract;
        if (params.sharpness > 0.5f) {
          // Sharp topographical steps
          edgeValue = bandFract > 0.8f ? 1.0f : 0.2f;
        }
        
        // Colors respond dynamically to the field height
        float hue = 0.3f + field * 0.4f; // Greens to Blues
        hue = hue - floorf(hue);
        
        float i = floorf(hue * 6);
        float f = hue * 6 - i;
        float val = 0.5f + edgeValue * 0.5f;
        float sat = 0.8f;
        
        float p = val * (1 - sat);
        float q = val * (1 - f * sat);
        float v_t = val * (1 - (1 - f) * sat);
        float rv, gv, bv;
        switch ((int)(fmodf((float)(i), (float)(6.0f)))) {
          case 0: {
      rv = val; gv = v_t; bv = p;
      break;
    }
    case 1: {
      rv = q; gv = val; bv = p;
      break;
    }
    case 2: {
      rv = p; gv = val; bv = v_t;
      break;
    }
    case 3: {
      rv = p; gv = q; bv = val;
      break;
    }
    case 4: {
      rv = v_t; gv = p; bv = val;
      break;
    }
    default: {
      rv = val; gv = p; bv = q;
      break;
    }
    }
        r = floorf(rv * 255);
        g = floorf(gv * 255);
        b = floorf(bv * 255);
      }
      
      PFCanvas::setPixel(x, y, r, g, b);
    }
  }

    PFCanvas::present();
  }
} // namespace Pattern05191
