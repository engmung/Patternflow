#pragma once

#include "src/core_encoders.h"

// ── PRESETS (curated showcase, in presets/) ──
#include "presets/preset_origin.h"
#include "presets/preset_wave_saw.h"

// ── CUSTOM (community / user patterns, in root for Arduino IDE editing) ──
#include "custom_spark_matrix.h"
#include "custom_hyperbolic_grid.h"
#include "custom_cellular_interference.h"

struct PatternEntry {
  const char* name;
  const char* const* knobLabels;
  void (*setup)();
  void (*update)(float dt, const InputFrame& input);
  void (*draw)();
};

#define PATTERN_ENTRY(ns) { ns::NAME, ns::KNOB_LABELS, ns::setup, ns::update, ns::draw }

// To add a pattern:
// 1. Copy _TEMPLATE.h to:
//      custom_<name>.h        in the root        (user patterns, editable in the Arduino IDE)
//      presets/preset_<name>.h in presets/       (curated; use "../src/..." includes)
// 2. Include it under the matching section above.
// 3. Add PATTERN_ENTRY(Namespace) under the matching section below.
//    Keep presets first and bump NUM_PRESETS if you add a preset.
// See README.md for the full convention.
PatternEntry patterns[] = {
  // ── PRESETS ──
  PATTERN_ENTRY(Origin),
  PATTERN_ENTRY(WaveSaw),
  // ── CUSTOM ──
  PATTERN_ENTRY(SparkMatrixPattern),
  PATTERN_ENTRY(HyperbolicGridPattern),
  PATTERN_ENTRY(CellularInterferencePattern),
};

const int NUM_PATTERNS = sizeof(patterns) / sizeof(patterns[0]);
// Presets occupy the first NUM_PRESETS slots; the rest are custom patterns.
const int NUM_PRESETS = 2;

#undef PATTERN_ENTRY
