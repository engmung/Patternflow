// ═══════════════════════════════════════════════════════════
// PatternFlow - Shared color helpers (HSV→RGB, color ramp sampling)
// h is normalized 0..1 (not degrees). s and v are 0..1.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <math.h>

namespace PFColor {

inline void hsvToRgb(float h, float s, float v,
                     uint8_t& r, uint8_t& g, uint8_t& b) {
  h = h - floorf(h);
  if (h < 0.0f) h += 1.0f;
  if (s < 0.0f) s = 0.0f; else if (s > 1.0f) s = 1.0f;
  if (v < 0.0f) v = 0.0f; else if (v > 1.0f) v = 1.0f;

  float c = v * s;
  float hh = h * 6.0f;
  float x = c * (1.0f - fabsf(fmodf(hh, 2.0f) - 1.0f));
  float m = v - c;

  float rf = 0.0f, gf = 0.0f, bf = 0.0f;
  switch ((int)hh % 6) {
    case 0: rf = c; gf = x; bf = 0; break;
    case 1: rf = x; gf = c; bf = 0; break;
    case 2: rf = 0; gf = c; bf = x; break;
    case 3: rf = 0; gf = x; bf = c; break;
    case 4: rf = x; gf = 0; bf = c; break;
    default: rf = c; gf = 0; bf = x; break;
  }
  r = (uint8_t)((rf + m) * 255.0f);
  g = (uint8_t)((gf + m) * 255.0f);
  b = (uint8_t)((bf + m) * 255.0f);
}

struct ColorStop {
  float position;
  uint8_t r, g, b;
};

inline void sampleRamp(const ColorStop* ramp, int count, float t,
                       uint8_t& r, uint8_t& g, uint8_t& b) {
  if (t < 0.0f) t = 0.0f; else if (t > 1.0f) t = 1.0f;
  r = ramp[0].r; g = ramp[0].g; b = ramp[0].b;
  for (int i = 0; i < count; i++) {
    if (t >= ramp[i].position) {
      r = ramp[i].r; g = ramp[i].g; b = ramp[i].b;
    } else {
      break;
    }
  }
}

} // namespace PFColor
