// ═══════════════════════════════════════════════════════════
// Patternflow Performance — what this edition calls itself, and what it sets
//
// Included from config.h before any default, so anything `#ifndef`-guarded
// anywhere in the tree can be set here: transmit power, panel clock,
// brightness cap, hostname. Nothing in this file is a core file, and the
// build script puts it back the way it found it.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// Reported in /api/status as `variant` and `variantVersion`, worn as a badge
// on every console page, and shown on the shelf card. This version is the
// edition's own and moves at whatever pace suits it — it has nothing to say
// about the core version, which is reported separately.
#define PF_VARIANT          "performance"
#define PF_VARIANT_VERSION  "v0.4.0"

// ── Feature presets ─────────────────────────────────────────────────────
// Black: show scheduler night/alarm face (hidden from K4 browse).
// Weather: compiled-in face — needs NTP + PatternflowWeather host APIs that
// .pfm modules cannot call (not in PFHostAPI).
#define PF_FEATURE_PRESET_INCLUDE "performance_presets.h"
#define PF_FEATURE_PRESETS \
  PATTERN_ENTRY_HIDDEN(Black), \
  PATTERN_ENTRY(Weather),

// Nothing else is changed. The radio stays at the conformance-tested setting,
// and a panel switching to this edition keeps its Wi-Fi, its brightness and
// its patterns — that is the rule for being on the shelf at all, not a
// courtesy.
