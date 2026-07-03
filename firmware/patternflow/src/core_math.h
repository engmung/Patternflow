// ═══════════════════════════════════════════════════════════
// PatternFlow - Shared math helpers (sin LUT, fast trig, fract)
// Used by patterns to avoid duplicating LUTs and trig wrappers.
// Call PFMath::buildSinLUT() once from setup() before drawing.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <math.h>

namespace PFMath {

// 1024 entries → ~0.35° resolution. 256 entries quantized small-angle
// rotation in vortex-style patterns into visible facets; 1024 is fine
// enough that the LUT is no longer the limiting factor. Cost: 4KB RAM.
constexpr int SIN_LUT_SIZE = 1024;
constexpr float TWO_PI_F = 6.28318530717958647692f;
constexpr float INV_TWO_PI_F = 0.15915494309189533577f;
constexpr float ANGLE_TO_LUT = INV_TWO_PI_F * (float)SIN_LUT_SIZE;

inline float sinLUT[SIN_LUT_SIZE];
inline bool sinLUTReady = false;

inline void buildSinLUT() {
  if (sinLUTReady) return;
  for (int i = 0; i < SIN_LUT_SIZE; i++) {
    sinLUT[i] = sinf((float)i / (float)SIN_LUT_SIZE * TWO_PI_F);
  }
  sinLUTReady = true;
}

inline float fract(float x) {
  return x - floorf(x);
}

inline float fastSin(float x) {
  // The `& (SIZE-1)` mask wraps both positive and negative indices into
  // [0, SIZE), so the explicit floorf + branch path is redundant. (int)
  // truncates toward zero, which differs from floor by one bucket for
  // negative arguments — 0.35° at 1024 entries, visually irrelevant and
  // much cheaper in the inner loop.
  return sinLUT[(int)(x * ANGLE_TO_LUT) & (SIN_LUT_SIZE - 1)];
}

inline float fastCos(float x) {
  return fastSin(x + (float)M_PI_2);
}

inline float lerp(float a, float b, float t) {
  return a + (b - a) * t;
}

// Cheap sqrt(x*x + y*y) replacement. ~5% error, no sqrtf call.
// Use when the exact radius does not matter visually (radial fades,
// ring patterns, distance-based hue). Saves real time on the ESP32
// when this runs inside the pixel loop.
inline float approxLength(float x, float y) {
  float ax = fabsf(x);
  float ay = fabsf(y);
  float mx = ax > ay ? ax : ay;
  float mn = ax > ay ? ay : ax;
  return mx + mn * 0.375f;
}

// Fast atan2 replacement — polynomial approximation, max error ~0.0015 rad
// (≈0.09°), no LUT, one divide for range reduction. Same quadrant behavior
// and (-π, π] range as atan2f, at a fraction of the cost. atan2f is the most
// expensive common per-pixel call; use this for angle-driven patterns whose
// center MOVES. For a fixed panel-center angle, prefer the precomputed
// PFTables::thetaT (core_tables.h) — that one is free.
inline float fastAtan2(float y, float x) {
  float ax = fabsf(x);
  float ay = fabsf(y);
  float mx = ax > ay ? ax : ay;
  if (mx == 0.0f) return 0.0f;  // atan2(0, 0) is undefined; return 0 like most libms
  float mn = ax > ay ? ay : ax;
  float a = mn / mx;  // [0, 1]
  // atan(a) on [0, 1] — minimax cubic-in-a² polynomial.
  float s = a * a;
  float r = ((-0.0464964749f * s + 0.15931422f) * s - 0.327622764f) * s * a + a;
  if (ay > ax) r = 1.57079637f - r;
  if (x < 0.0f) r = 3.14159274f - r;
  if (y < 0.0f) r = -r;
  return r;
}

} // namespace PFMath
