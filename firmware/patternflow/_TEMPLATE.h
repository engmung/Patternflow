// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: <Name>
// Author:  <handle>
// Source:  <url>            (optional)
// Lineage: original         (or "remixed from @someone's ...")
// Generated from web/src/lib/presets/<file>.ts  (the JS pattern is the source of truth)
//
// To make a new PRESET (compiled into the firmware), copy this file to
// presets/preset_<name>.h, rename the namespace, change the includes below to
// the "../config.h" / "../src/..." form, and register it in pattern_registry.h.
// Every compiled-in preset costs internal DRAM; the registry ships Origin alone.
//
// A pattern of your OWN belongs in a .pfm module instead — firmware/modules/,
// built by firmware/toolchain/build_module.py, uploaded at /patterns over
// Wi-Fi. No rebuild, no reflash. See firmware/CUSTOM_PATTERNS.md.
// The includes below are the sketch-root form, as this file sits there.

#pragma once
#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
// Conditional — include only when actually used:
// #include "src/core_math.h"   // PFMath:: fastSin/fastCos, fastAtan2, buildSinLUT, lerp, fract
// #include "src/core_color.h"  // PFColor:: hsvToRgb, buildPowLUT, ColorStop, sampleRamp
// #include "src/core_noise.h"  // PFNoise:: cellHash, valueNoise2D, perlin2D, fractal2D
// #include "src/core_tables.h" // PFTables:: init, rT[]/thetaT[] — per-pixel radius/angle from center
// #include "src/core_mem.h"    // PFMem:: allocFloats — REQUIRED for framebuffer-sized buffers: never
//                              // declare them as static arrays (they lock internal DRAM from boot);
//                              // allocate once in setup(): if (!buf) buf = PFMem::allocFloats(N);

namespace TemplatePattern {
  const char* NAME = "Template";
  const char* const KNOB_LABELS[4] = {"k1", "k2", "k3", "k4"};

  void setup() {
    // runs once on load
  }

  void update(float dt, const InputFrame& input) {
    // input.knobDeltas[i] : per-frame change in detents — 1 detent, 1 step,
    //   no acceleration. Scale it by YOUR parameter's range rather than a
    //   habit constant: (max - min) / 48 makes one knob cross its whole range
    //   in two turns, which is what every generated pattern now does.
    // input.btnPressed[i] : true only on the frame button i is pressed (edge)
    // input.btnHeld[i]    : true while button i is held (level)   (i = 0..3)
  }

  void draw() {
    // PANEL_RES_W/H come from config.h — change them there for a different
    // panel, never here. If this pattern was composed for a grid that is NOT
    // the panel's (a 64x128 portrait pattern, say), declare it instead:
    //
    //   constexpr int FRAME_W = 64, FRAME_H = 128;   // near the top
    //   PFCanvas::setFrame(FRAME_W, FRAME_H);        // first line of draw()
    //   ...then loop FRAME_W/FRAME_H and pass those x,y straight to setPixel.
    //
    // The canvas maps the frame onto the panel (straight through, quarter
    // turn, or centred). Never rotate the coordinates yourself, and don't use
    // PFTables inside a declared frame — see README.md.
    for (int y = 0; y < PANEL_RES_H; y++) {
      for (int x = 0; x < PANEL_RES_W; x++) {
        PFCanvas::setPixel(x, y, 0, 0, 0);   // r,g,b 0..255
      }
    }
    PFCanvas::present();   // required — must be the last line
  }
} // namespace TemplatePattern
