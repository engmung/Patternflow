#pragma once

#include "core_encoders.h"
#include "pattern_origin.h"
#include "pattern_wave1.h"
#include "pattern_vector_fluid.h"

struct PatternEntry {
  const char* name;
  const char* const* knobLabels;
  void (*setup)();
  void (*update)(float dt, const InputFrame& input);
  void (*draw)();
};

#define PATTERN_ENTRY(ns) { ns::NAME, ns::KNOB_LABELS, ns::setup, ns::update, ns::draw }

// To add a pattern:
// 1. Create pattern_new_name.h with namespace NewName and NAME, KNOB_LABELS,
//    setup(), update(float, const InputFrame&), draw().
// 2. Include the header above.
// 3. Add PATTERN_ENTRY(NewName) below.
PatternEntry patterns[] = {
  PATTERN_ENTRY(Origin),
  PATTERN_ENTRY(Wave1),
  PATTERN_ENTRY(FractalOrbitPattern),
};

const int NUM_PATTERNS = sizeof(patterns) / sizeof(patterns[0]);

#undef PATTERN_ENTRY
