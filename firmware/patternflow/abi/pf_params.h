// ═══ FROZEN CONTRACT ═══ Installed .pfm modules read this layout WITHOUT
// recompiling. Append at the tail only; bump PF_ABI_MODULE_VERSION; then
// refresh abi.sums (check_abi_freeze.py --update) — CI fails on any drift.
// Patternflow absolute param bus helpers (0..1000 wire scale).
//
// Shared by firmware presets and loadable modules. Priority per channel:
//   1. paramAbsoluteActive  → lerp(min, max, v/1000)
//   2. knobAudioActive      → lerp(min, max, 0..1)  (Weather / audio)
//   3. knobDeltas           → integrate with step
//
// ── One source, two builds ───────────────────────────────────────────────
// Reading paramAbsoluteActive on a host that predates those fields means
// reading past the end of its InputFrame, so a converted pattern cannot
// simply be installed on old firmware. Rather than fork the catalogue, the
// absolute tier compiles out when a module is built for the older host
// (-DPF_ABI_MODULE_VERSION=1): the same converted source then behaves as it
// always did — audio, then knob deltas — and stamps a descriptor those
// loaders accept. Build it for the newer host and the absolute tier is there.
//
// So converting a pattern is never a decision about which firmware its
// author's audience runs; that is the build's business, not the source's.
//
// License: MIT
#pragma once

#include <math.h>
#include <stdint.h>

// Deliberately NOT including pf_abi.h: the firmware reaches this header
// through src/core_params.h while pf_abi.h arrives by another path, and the
// two spellings defeat its include guard. The macro is all that is needed,
// and every route that matters already sets it — pf_abi.h when a module
// builds, -D from build_module.py when it targets the older host. This
// default is what the firmware itself, which always has the fields, gets.
#ifndef PF_ABI_MODULE_VERSION
#define PF_ABI_MODULE_VERSION 2
#endif

// PF_ABI_MODULE_VERSION >= 2 means "this build's host has the absolute
// fields". Kept as one named test so no helper below can drift from the rest.
#if PF_ABI_MODULE_VERSION >= 2
#define PF_PARAMS_HAS_ABSOLUTE 1
#else
#define PF_PARAMS_HAS_ABSOLUTE 0
#endif

namespace PFParams {

inline float unit1000(uint16_t v) {
  if (v > 1000) v = 1000;
  return (float)v / 1000.0f;
}

inline float lerp(float lo, float hi, float u) {
  return lo + (hi - lo) * u;
}

inline float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Float param with linear absolute / audio / delta paths.
template <typename Frame>
inline void apply(const Frame& input, int i, float* param, float lo, float hi, float step) {
  if (!param || i < 0 || i > 3) return;
#if PF_PARAMS_HAS_ABSOLUTE
  if (input.paramAbsoluteActive[i]) {
    *param = clampf(lerp(lo, hi, unit1000(input.paramAbsolute[i])), lo, hi);
    return;
  }
#endif
  if (input.knobAudioActive[i]) {
    *param = clampf(lerp(lo, hi, input.knobAudioValue[i]), lo, hi);
    return;
  }
  if (input.knobDeltas[i] != 0) {
    *param = clampf(*param + (float)input.knobDeltas[i] * step, lo, hi);
  }
}

// Integer param. When wrap=true, values cycle through [lo, hi] inclusive.
template <typename Frame>
inline void applyInt(const Frame& input, int i, int* param, int lo, int hi, int step,
                     bool wrap = false) {
  if (!param || i < 0 || i > 3) return;
#if PF_PARAMS_HAS_ABSOLUTE
  if (input.paramAbsoluteActive[i]) {
    float u = unit1000(input.paramAbsolute[i]);
    if (wrap) {
      // 0..1000 maps across the full wrap range (e.g. hue 0..359).
      int span = hi - lo + 1;
      if (span <= 0) {
        *param = lo;
      } else {
        int v = lo + (int)(u * (float)span);
        if (v > hi) v = hi;
        *param = v;
      }
    } else {
      *param = lo + (int)(u * (float)(hi - lo) + 0.5f);
      if (*param < lo) *param = lo;
      if (*param > hi) *param = hi;
    }
    return;
  }
#endif
  if (input.knobAudioActive[i]) {
    float u = input.knobAudioValue[i];
    if (u < 0.0f) u = 0.0f;
    if (u > 1.0f) u = 1.0f;
    if (wrap) {
      int span = hi - lo + 1;
      int v = lo + (int)(u * (float)span);
      if (v > hi) v = hi;
      *param = v;
    } else {
      *param = lo + (int)(u * (float)(hi - lo) + 0.5f);
      if (*param < lo) *param = lo;
      if (*param > hi) *param = hi;
    }
    return;
  }
  if (input.knobDeltas[i] == 0) return;
  int next = *param + input.knobDeltas[i] * step;
  if (wrap) {
    int span = hi - lo + 1;
    if (span <= 0) {
      *param = lo;
      return;
    }
    next = (next - lo) % span;
    if (next < 0) next += span;
    *param = next + lo;
  } else {
    if (next < lo) next = lo;
    if (next > hi) next = hi;
    *param = next;
  }
}

// Discrete index 0..count-1 (pattern modes, preset pickers).
template <typename Frame>
inline void applyIndex(const Frame& input, int i, int* param, int count, int step = 1) {
  if (!param || count <= 0 || i < 0 || i > 3) return;
#if PF_PARAMS_HAS_ABSOLUTE
  if (input.paramAbsoluteActive[i]) {
    int idx = (int)(unit1000(input.paramAbsolute[i]) * (float)count);
    if (idx >= count) idx = count - 1;
    *param = idx;
    return;
  }
#endif
  if (input.knobAudioActive[i]) {
    int idx = (int)(input.knobAudioValue[i] * (float)count);
    if (idx >= count) idx = count - 1;
    if (idx < 0) idx = 0;
    *param = idx;
    return;
  }
  if (input.knobDeltas[i] == 0) return;
  int next = *param + input.knobDeltas[i] * step;
  next %= count;
  if (next < 0) next += count;
  *param = next;
}

// Unit param 0..1 with wrap on delta (typical hueBase / phase knobs).
template <typename Frame>
inline void applyUnit(const Frame& input, int i, float* param, float step = 0.05f) {
  if (!param || i < 0 || i > 3) return;
#if PF_PARAMS_HAS_ABSOLUTE
  if (input.paramAbsoluteActive[i]) {
    *param = unit1000(input.paramAbsolute[i]);
    return;
  }
#endif
  if (input.knobAudioActive[i]) {
    float u = input.knobAudioValue[i];
    if (u < 0.0f) u = 0.0f;
    if (u > 1.0f) u = 1.0f;
    *param = u;
    return;
  }
  if (input.knobDeltas[i] == 0) return;
  *param += (float)input.knobDeltas[i] * step;
  *param = *param - floorf(*param);
  if (*param < 0.0f) *param += 1.0f;
}

}  // namespace PFParams
