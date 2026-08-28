// ═══════════════════════════════════════════════════════════
// Patternflow MQTT — what this edition calls itself, and what it sets
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
#define PF_VARIANT          "mqtt"
#define PF_VARIANT_VERSION  "v0.1.0"

// Presets that belong to a feature this build does not carry stay out of the
// pattern carousel, instead of appearing and doing nothing.
#define PF_ADDON_PRESETS

// Nothing else is changed. The radio stays at the conformance-tested setting,
// and a panel switching to this edition keeps its Wi-Fi, its brightness and
// its patterns — that is the rule for being on the shelf at all, not a
// courtesy.
