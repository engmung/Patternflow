// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: <Name>
// Author:  <handle>
// Source:  <url>            (optional)
// Lineage: original         (or "remixed from @someone's ...")
// Generated from web/src/lib/presets/<file>.ts  (the JS pattern is the source of truth)
//
// To make a new pattern, copy this file, rename the namespace, and register it
// in pattern_registry.h:
//   custom<N>.h              -> sketch ROOT (your patterns; reusable slots, editable as IDE tabs)
//   presets/preset_<name>.h  -> presets/ subfolder (curated; change includes to "../src/...")
// The includes below are the ROOT form (for custom patterns).

#pragma once
#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
// Conditional — include only when actually used:
// #include "src/core_math.h"   // PFMath:: fastSin/fastCos, buildSinLUT, lerp, fract
// #include "src/core_color.h"  // PFColor:: hsvToRgb, ColorStop, sampleRamp
// #include "src/core_noise.h"  // PFNoise:: perlin2D, fractal2D

namespace TemplatePattern {
  const char* NAME = "Template";
  const char* const KNOB_LABELS[4] = {"k1", "k2", "k3", "k4"};

  void setup() {
    // runs once on load
  }

  void update(float dt, const InputFrame& input) {
    // input.knobDeltas[i] : per-frame change in detents
    // input.btnPressed[i] : true only on the frame button i is pressed (edge)
    // input.btnHeld[i]    : true while button i is held (level)   (i = 0..3)
  }

  void draw() {
    for (int y = 0; y < PANEL_RES_H; y++) {
      for (int x = 0; x < PANEL_RES_W; x++) {
        PFCanvas::setPixel(x, y, 0, 0, 0);   // r,g,b 0..255
      }
    }
    PFCanvas::present();   // required — must be the last line
  }
} // namespace TemplatePattern
