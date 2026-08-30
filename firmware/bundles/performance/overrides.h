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
#define PF_VARIANT_VERSION  "v0.2.1"

// ── The show player's night face ────────────────────────────────────────
//
// The night/wake scheduler switches to Black by name, so this edition ships
// it (features_local.h includes the header; this names the entry). Hidden,
// because the panel going dark is not something to land on while turning K4
// through the list. The bare core defines PF_FEATURE_PRESETS empty - a preset
// rides with the composition that needs it, never with the default.
#define PF_FEATURE_PRESET_INCLUDE "show/preset_black.h"
#define PF_FEATURE_PRESETS PATTERN_ENTRY_HIDDEN(Black),

// Nothing else is changed. The radio stays at the conformance-tested setting,
// and a panel switching to this edition keeps its Wi-Fi, its brightness and
// its patterns — that is the rule for being on the shelf at all, not a
// courtesy.
