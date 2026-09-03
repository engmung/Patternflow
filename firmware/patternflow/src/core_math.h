// ═══════════════════════════════════════════════════════════
// PatternFlow - Shared math helpers (sin LUT, fast trig, fract)
// Used by patterns to avoid duplicating LUTs and trig wrappers.
// Call PFMath::buildSinLUT() once from setup() before drawing.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// Hardware-free by design, so loadable pattern modules share this file verbatim
// instead of carrying a second copy that can drift (abi/pf_module.h includes
// it). A module links freestanding with no Arduino core, hence the guard —
// nothing here uses Arduino anyway, the include is historical.
#ifndef PF_MODULE_BUILD
#include <Arduino.h>
#endif
#include <math.h>
#include <stdint.h>

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

// JavaScript's `%` on floats: the sign of the dividend, the magnitude below
// |m|. A pattern ported from the lab reaches for fmodf here, and in a module
// that is a call into the host's libm on every pixel; this is one division
// and one truncation, a single instruction each on this FPU. The same value
// as fmodf to a last-bit rounding for anything a pattern feeds it; |x / m|
// has to stay under 2^31, and m must not be 0.
inline float jsMod(float x, float m) {
  return x - m * (float)(int)(x / m);
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

// Fast powf replacement for exponents that VARY per pixel — a FIXED exponent
// should be a 256-entry LUT instead (PFColor::buildPowLUT/buildPowLUTf).
// exp2(p·log2(x)) with float bit-trick approximations (fastapprox-style):
// ~0.1% typical error, invisible on an 8-bit panel, roughly an order of
// magnitude cheaper than libm powf on the S3.
//
// Domain: x > 0. x <= 0 returns 0 — note powf(0, negative) would be +inf,
// so a caller relying on that (value clamps to full white) must branch on
// x <= 0 itself.
inline float fastLog2(float x) {
  union { float f; uint32_t i; } vx = { x };
  union { uint32_t i; float f; } mx = { (vx.i & 0x007FFFFFu) | 0x3f000000u };
  float y = (float)vx.i * 1.1920928955078125e-7f;  // vx.i / 2^23
  return y - 124.22551499f
           - 1.498030302f * mx.f
           - 1.72587999f / (0.3520887068f + mx.f);
}

inline float fastExp2(float p) {
  if (p < -126.0f) p = -126.0f;        // below float denormal range → 0-ish
  else if (p > 126.0f) p = 126.0f;     // keep the bit cast from overflowing
  float offset = (p < 0.0f) ? 1.0f : 0.0f;
  int w = (int)p;
  float z = p - (float)w + offset;
  union { uint32_t i; float f; } v;
  v.i = (uint32_t)((float)(1 << 23) *
        (p + 121.2740575f + 27.7280233f / (4.84252568f - z) - 1.49012907f * z));
  return v.f;
}

inline float fastPow(float x, float p) {
  if (x <= 0.0f) return 0.0f;
  return fastExp2(p * fastLog2(x));
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
