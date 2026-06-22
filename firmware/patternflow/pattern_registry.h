#pragma once

#include "src/core_encoders.h"

// ── CUSTOM (your own patterns; root files, editable as Arduino IDE tabs) ──
// custom1..customN are reusable slots — overwrite a slot's body (and its NAME)
// to try a new pattern without renaming files or touching this list.
#include "custom1.h"
#include "custom2.h"
#include "custom3.h"

// ── PRESETS (curated showcase, in presets/) ──
#include "presets/preset_origin.h"
#include "presets/preset_wave_saw.h"
#include "presets/preset_0510.h"
#include "presets/preset_0511.h"
#include "presets/preset_0512.h"
#include "presets/preset_0513.h"
#include "presets/preset_0514.h"
#include "presets/preset_0515_3.h"
#include "presets/preset_0515_4.h"
#include "presets/preset_0515.h"
#include "presets/preset_0518.h"
#include "presets/preset_0519_1.h"
#include "presets/preset_0520.h"
#include "presets/preset_0521.h"
#include "presets/preset_0522.h"
#include "presets/preset_0527.h"
#include "presets/preset_0528.h"
#include "presets/preset_0531.h"
#include "presets/preset_0601.h"
#include "presets/preset_0602.h"
#include "presets/preset_a_big_hit.h"

struct PatternEntry {
  const char* name;
  const char* const* knobLabels;
  void (*setup)();
  void (*update)(float dt, const InputFrame& input);
  void (*draw)();
};

#define PATTERN_ENTRY(ns) { ns::NAME, ns::KNOB_LABELS, ns::setup, ns::update, ns::draw }

// To add a pattern:
// - Custom (your own): overwrite a custom<N>.h slot in the root, or add custom<N+1>.h.
// - Preset (curated): copy _TEMPLATE.h to presets/preset_<name>.h ("../src/..." includes).
// Then #include it in the matching section above and add PATTERN_ENTRY(Namespace)
// in the matching section below — custom first. See README.md for the convention.
PatternEntry patterns[] = {
  // ── CUSTOM ──
  PATTERN_ENTRY(Custom1),
  PATTERN_ENTRY(Custom2),
  PATTERN_ENTRY(Custom3),
  // ── PRESETS ──
  PATTERN_ENTRY(Origin),
  PATTERN_ENTRY(WaveSaw),
  PATTERN_ENTRY(Pattern0510),
  PATTERN_ENTRY(Pattern0511),
  PATTERN_ENTRY(Pattern0512),
  PATTERN_ENTRY(Pattern0513),
  PATTERN_ENTRY(Pattern0514),
  PATTERN_ENTRY(Pattern05153),
  PATTERN_ENTRY(Pattern05154),
  PATTERN_ENTRY(Pattern0515),
  PATTERN_ENTRY(Pattern0518),
  PATTERN_ENTRY(Pattern05191),
  PATTERN_ENTRY(Pattern0520),
  PATTERN_ENTRY(Pattern0521),
  PATTERN_ENTRY(Pattern0522),
  PATTERN_ENTRY(Pattern0527),
  PATTERN_ENTRY(Pattern0528),
  PATTERN_ENTRY(Pattern0531),
  PATTERN_ENTRY(Pattern0601),
  PATTERN_ENTRY(Pattern0602),
  PATTERN_ENTRY(PatternABigHit),
};

const int NUM_PATTERNS = sizeof(patterns) / sizeof(patterns[0]);
// Custom patterns are the first NUM_CUSTOM entries; presets follow.
const int NUM_CUSTOM = 3;
const int NUM_PRESETS = NUM_PATTERNS - NUM_CUSTOM;

#undef PATTERN_ENTRY
