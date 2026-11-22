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
#include <string.h>

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
  constexpr int Q = SIN_LUT_SIZE / 4;
  constexpr float STEP = TWO_PI_F / (float)SIN_LUT_SIZE;
  sinLUT[0] = 0.0f;
  sinLUT[Q] = 1.0f;
  sinLUT[2 * Q] = 0.0f;
  sinLUT[3 * Q] = -1.0f;
  for (int i = 1; i < Q; i++) {
    const float s = sinf((float)i * STEP);
    sinLUT[i] = s;
    sinLUT[2 * Q - i] = s;
    sinLUT[2 * Q + i] = -s;
    sinLUT[SIN_LUT_SIZE - i] = -s;
  }
  sinLUTReady = true;
}

// Round toward negative infinity, as an int. On this target floorf() is not an
// instruction: GCC emits `call8 floorf` into a ~50-instruction newlib routine at
// every use, under -O2, -Os and even -ffast-math, and __builtin_floorf makes no
// difference. (That is the compiler, and still how it is in code compiled into
// the firmware. In a module, abi/pf_libm.h has given floorf an exact inline
// body since 2026-10 - bigger than what follows, because it has to be right
// for every float.) The FPU does have a FLOOR.S, but reaching it needs inline
// asm, and asm cannot be checked by a host test - which for a file that IS the
// pattern SDK is the more expensive problem.
//
// So: truncate, which IS one instruction (TRUNC.S), and correct the one case
// where truncation and flooring differ - a negative non-integer, where trunc
// lands one above floor. Five instructions and no call, identical arithmetic on
// the host and the panel, so check_math.py actually verifies what ships.
//
// Domain |x| < 2^31, the same limit jsMod documents below and for the same
// reason: the cast is what does the work.
inline int ifloor(float x) {
  const int i = (int)x;
  return (float)i > x ? i - 1 : i;
}

inline float floorF(float x) {
  return (float)ifloor(x);
}

inline float fract(float x) {
  float t = (float)(int)x;
  if (t > x) t -= 1.0f;
  return x - t;
}

// fminf/fmaxf are libm calls too in the firmware image - two register-window
// frames for a comparison the FPU does in one OLT.S - and in a module, where
// abi/pf_libm.h makes them inline, still up to three compares, because they
// keep the library's rules for NaN and signed zeros. Written as a comparison,
// GCC emits exactly that.
//
// The first comparison is `!(x > lo)` and not `x < lo`, which is the same
// two compares and differs for one input: NaN. With `x < lo` a NaN came
// straight through, and a pattern that indexes a table with
// (int)(clamp01(v) * 255.0f) then read wherever a NaN turned into an int
// points. Now NaN is `lo`.
inline float clamp(float x, float lo, float hi) {
  return !(x > lo) ? lo : (x > hi ? hi : x);
}

inline float clamp01(float x) {
  return !(x > 0.0f) ? 0.0f : (x > 1.0f ? 1.0f : x);
}

// JavaScript's `%` on floats: the sign of the dividend, the magnitude below
// |m|. A pattern ported from the lab reaches for fmodf here. This is one
// division and one truncation. The truncation is one instruction (TRUNC.S).
// The division is NOT - GCC emits a call into __divsf3 for any
// non-power-of-two divisor, verified on the shipping compiler; the comment
// used to claim both halves were single instructions and only one of them is.
// Against fmodf as a call into libm on every pixel - which it is in code
// compiled into the firmware, and was in a module until 2026-10 - this is far
// cheaper. The same value as fmodf to a last-bit rounding for anything a
// pattern feeds it; |x / m| has to stay under 2^31, and m must not be 0.
//
// Since 2026-11 a divisor the compiler can see does not divide either. Most
// calls are that: jsMod(x, 3.0f), jsMod(h + 0.33f, 1.0f). The quotient is
// x times a reciprocal folded at compile time, and because that reciprocal
// is rounded, a quotient within a rounding of a whole number can truncate to
// the wrong side. The result is then off by exactly |m|, and the four
// comparisons put it back. A power of two has an exact reciprocal and needs
// none of them, which matters: with them jsMod(x, 2.0f) was slower than the
// division GCC had already turned into a multiply, and 0601 lost 6 % of a
// frame. Measured as modules on a board: 0510, five calls by 3 and 4 and 1
// a pixel, 6.6 -> 5.3 ms.
inline float jsMod(float x, float m) {
#ifdef __GNUC__
  if (__builtin_constant_p(m) && m != 0.0f) {
    const float inv = 1.0f / m;
    float r = x - m * (float)(int)(x * inv);
    uint32_t bits;
    memcpy(&bits, &m, sizeof(bits));
    if ((bits & 0x007FFFFFu) == 0) return r;   // a power of two: x * inv is x / m
    const float am = m < 0.0f ? -m : m;
    if (x >= 0.0f) {
      if (r < 0.0f) r += am;
      else if (r >= am) r -= am;
    } else {
      if (r > 0.0f) r -= am;
      else if (r <= -am) r += am;
    }
    return r;
  }
#endif
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
  // A quarter turn on, as an index and not as an angle: sin and cos of the
  // same x then share the multiply and the truncation, and are the same
  // table entry apart, so the pair lies exactly on the table's circle.
  return sinLUT[((int)(x * ANGLE_TO_LUT) + (SIN_LUT_SIZE / 4)) & (SIN_LUT_SIZE - 1)];
}

inline void fastSinCos(float x, float& s, float& c) {
  const int idx = (int)(x * ANGLE_TO_LUT);
  s = sinLUT[idx & (SIN_LUT_SIZE - 1)];
  c = sinLUT[(idx + (SIN_LUT_SIZE / 4)) & (SIN_LUT_SIZE - 1)];
}

inline float lerp(float a, float b, float t) {
  return a + (b - a) * t;
}

// Cheap sqrt(x*x + y*y) replacement. 6.8% maximum relative error - measured
// and pinned by toolchain/check_math.py, not the ~5% this comment used to
// claim - and no sqrtf call, which on this target is a call into libm.
// 0.375 is the shift-friendly coefficient, not the minimax one.
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

// 1 / sqrt(x) and sqrt(x) with no call and no division: the bit-shift first
// guess and two Newton steps. 4.7e-6 maximum relative error, measured and
// pinned by toolchain/check_math.py, so either can stand in for the libm one
// wherever a pattern draws with the result. 0 for x <= 0 and for NaN.
//
// What they save, measured in a module on a board, per call: sqrtf 340 ns,
// fastSqrt 172. Normalising is where it counts, because dx / sqrtf(d2) is a
// call and a division, 555 ns, and dx * fastInvSqrt(d2) is 151. (Compiled
// into the firmware image by its older compiler the gap is small, 321 ns
// against 287. Patterns run as modules.) One Newton step with tuned constants
// was 114 and 109 ns at 0.065 % error and was left out: these are meant to be
// safe to put wherever sqrtf was.
inline float fastInvSqrt(float x) {
  if (!(x > 0.0f)) return 0.0f;
  uint32_t i;
  memcpy(&i, &x, sizeof(i));
  i = 0x5f375a86u - (i >> 1);
  float y;
  memcpy(&y, &i, sizeof(y));
  const float xhalf = 0.5f * x;
  y = y * (1.5f - xhalf * y * y);
  y = y * (1.5f - xhalf * y * y);
  return y;
}

inline float fastSqrt(float x) {
  if (!(x > 0.0f)) return 0.0f;
  return x * fastInvSqrt(x);
}

// Fast powf replacement for exponents that VARY per pixel — a FIXED exponent
// should be a 256-entry LUT instead (PFColor::buildPowLUT/buildPowLUTf).
// exp2(p·log2(x)), each half a polynomial: 0.0057% maximum relative error
// over x in (0,1], p in [0.2,5] - measured and pinned by
// toolchain/check_math.py - which is invisible on an 8-bit panel.
//
// Until 2026-11 the two halves were fastapprox's rational forms, 0.054%, and
// each carried a division, which on this target is a call into __divsf3. The
// polynomials have none. On a board, 10,000 calls went from 9.8 to 5.4 ms,
// and Hex Hive Pulse, which calls it once a pixel, from 16.2 to 12.7 ms a
// frame as a module.
//
// Domain: x > 0. x <= 0 returns 0, and so does NaN — note powf(0, negative)
// would be +inf, so a caller relying on that (value clamps to full white)
// must branch on x <= 0 itself.
inline float fastLog2(float x) {
  uint32_t bits;
  memcpy(&bits, &x, sizeof(bits));
  // Split x = m * 2^e with m in [sqrt(0.5), sqrt(2)) so u = m - 1 stays small.
  constexpr uint32_t HALF_SQRT2_BITS = 0x3f3504f3u;
  constexpr uint32_t OFFSET = 0x3f800000u - HALF_SQRT2_BITS;
  const uint32_t shifted = bits + OFFSET;
  const int32_t exp = (int32_t)(shifted >> 23) - 127;
  uint32_t mBits = (shifted & 0x007fffffu) + HALF_SQRT2_BITS;
  float m;
  memcpy(&m, &mBits, sizeof(m));
  const float u = m - 1.0f;
  float p = 0.24327278f;
  p = p * u - 0.39368969f;
  p = p * u + 0.48822569f;
  p = p * u - 0.72021413f;
  p = p * u + 1.44251764f;
  p = p * u - 6.3080529e-6f;
  return (float)exp + p;
}

inline float fastExp2(float p) {
  if (!(p > -126.0f)) return 0.0f;       // below normal range or NaN → 0
  if (p > 126.0f) p = 126.0f;            // keep exponent from overflowing
  const int w = ifloor(p);
  const float f = p - (float)w;
  float y = 0.013670309f;
  y = y * f + 0.051744998f;
  y = y * f + 0.24160436f;
  y = y * f + 0.69297290f;
  y = y * f + 1.00000346f;
  uint32_t scaleBits = (uint32_t)(w + 127) << 23;
  float scale;
  memcpy(&scale, &scaleBits, sizeof(scale));
  return y * scale;
}

inline float fastPow(float x, float p) {
  if (!(x > 0.0f)) return 0.0f;
  return fastExp2(p * fastLog2(x));
}

// Fast atan2 replacement — polynomial approximation, max error 2.03e-4 rad
// (0.0116°), measured and pinned by toolchain/check_math.py. The comment used
// to say ~0.0015 rad, which is 7.4x looser than the polynomial actually is.
// No LUT, one divide for range reduction (a __divsf3 call, as above). Same quadrant behavior
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
