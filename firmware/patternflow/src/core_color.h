// ═══════════════════════════════════════════════════════════
// PatternFlow - Shared color helpers (HSV→RGB, color ramp sampling)
// h is normalized 0..1 (not degrees). s and v are 0..1.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// Shared verbatim with loadable pattern modules — see the note in core_math.h.
#ifndef PF_MODULE_BUILD
#include <Arduino.h>
#endif
#include <math.h>
#include <stdint.h>

#include "core_math.h"  // ifloor/clamp: floorf and fminf are libm calls here

namespace PFColor {

inline void hsvToRgb(float h, float s, float v,
                     uint8_t& r, uint8_t& g, uint8_t& b) {
  h = h - PFMath::floorF(h);
  if (h < 0.0f) h += 1.0f;
  if (s < 0.0f) s = 0.0f; else if (s > 1.0f) s = 1.0f;
  if (v < 0.0f) v = 0.0f; else if (v > 1.0f) v = 1.0f;

  float c = v * s;
  float hh = h * 6.0f;
  // Sector and position within it. hh is in [0, 6]: 6.0f happens when h
  // rounds up to just under 1, and lands in sector 5 at f = 1 - the same
  // red that sector 0 at f = 0 gives. No fmodf: this runs once per pixel in
  // a module's inner loop, and fmodf there is a call into the host's libm,
  // a hundred-odd cycles, where this is one truncation.
  int i = (int)hh;
  if (i > 5) i = 5;
  float f = hh - (float)i;
  // 1 - |fmod(hh, 2) - 1| is f in an even sector and 1 - f in an odd one.
  float x = c * ((i & 1) ? (1.0f - f) : f);
  float m = v - c;

  float rf = 0.0f, gf = 0.0f, bf = 0.0f;
  switch (i) {
    case 0: rf = c; gf = x; bf = 0; break;
    case 1: rf = x; gf = c; bf = 0; break;
    case 2: rf = 0; gf = c; bf = x; break;
    case 3: rf = 0; gf = x; bf = c; break;
    case 4: rf = x; gf = 0; bf = c; break;
    default: rf = c; gf = 0; bf = x; break;
  }
  // The + 0.5f is the difference between rounding and truncating, and it was
  // missing. Truncation is not a wash: it is biased in one direction, and swept
  // over the whole HSV cube it cost a mean of 0.470 of an 8-bit level, every
  // channel, always downward. buildPowLUT four functions below has always
  // rounded, so the two helpers in this one header disagreed about the same
  // step. Measured by firmware/toolchain/check_math.py, which pins it.
  r = (uint8_t)((rf + m) * 255.0f + 0.5f);
  g = (uint8_t)((gf + m) * 255.0f + 0.5f);
  b = (uint8_t)((bf + m) * 255.0f + 0.5f);
}

struct ColorStop {
  float position;
  uint8_t r, g, b;
};

// Sample a colour ramp at t in 0..1, interpolating between the two stops that
// bracket it. Stops must be sorted by position.
//
// This used to assign the last stop whose position <= t and return - a step
// function, in an API named ramp, taking stops with float positions. Nothing
// said so; it was measured at 255 LSB from a linear interpolation, which is the
// entire 8-bit range. The evidence that it was never intended is in the one
// pattern that calls it: preset_origin.h places stops at 0.154, 0.556 and 0.816
// and ends with TWO identical white stops at 0.816 and 1.000. Irregular
// positions are gradient control points, and a duplicated final stop is how you
// say "reach white here and hold it" - under a step function it does nothing at
// all. Origin has been drawing bands where its author wrote a gradient.
//
// Cost: one divide per sample, which is a __divsf3 call on the S3. If that shows
// up in /api/status renderFrameUs, the answer is a prepared ramp that bakes the
// reciprocal spans once, not a return to drawing the wrong thing.
inline void sampleRamp(const ColorStop* ramp, int count, float t,
                       uint8_t& r, uint8_t& g, uint8_t& b) {
  if (count <= 0) { r = 0; g = 0; b = 0; return; }
  if (t < 0.0f) t = 0.0f; else if (t > 1.0f) t = 1.0f;
  if (count == 1 || t <= ramp[0].position) {
    r = ramp[0].r; g = ramp[0].g; b = ramp[0].b;
    return;
  }
  for (int i = 1; i < count; i++) {
    if (t <= ramp[i].position) {
      const float span = ramp[i].position - ramp[i - 1].position;
      // Two stops at the same position are a hard edge on purpose - that is how
      // a ramp says "boundary" - and must not divide by zero.
      const float u = span > 0.0f ? (t - ramp[i - 1].position) / span : 1.0f;
      const ColorStop& a = ramp[i - 1];
      const ColorStop& c = ramp[i];
      r = (uint8_t)((float)a.r + ((float)c.r - (float)a.r) * u + 0.5f);
      g = (uint8_t)((float)a.g + ((float)c.g - (float)a.g) * u + 0.5f);
      b = (uint8_t)((float)a.b + ((float)c.b - (float)a.b) * u + 0.5f);
      return;
    }
  }
  r = ramp[count - 1].r; g = ramp[count - 1].g; b = ramp[count - 1].b;
}

// Bake powf(v, exponent) into a 256-entry LUT — replaces per-pixel powf for
// FIXED exponents (gamma shaping, brightness curves, falloff sharpening).
// Fill once in setup(), then index with a 0..255 value in draw().
inline void buildPowLUT(float exponent, uint8_t lut[256]) {
  for (int i = 0; i < 256; i++) {
    lut[i] = (uint8_t)(powf((float)i * (1.0f / 255.0f), exponent) * 255.0f + 0.5f);
  }
}

// Float variant (0..1 in, 0..1 out) for when the shaped value feeds further
// math instead of going straight to a color channel.
inline void buildPowLUTf(float exponent, float lut[256]) {
  for (int i = 0; i < 256; i++) {
    lut[i] = powf((float)i * (1.0f / 255.0f), exponent);
  }
}

} // namespace PFColor
