// ═══════════════════════════════════════════════════════════
// PatternFlow - the feature list
//
// **THE CORE OWNS THIS FILE. A VARIANT DOES NOT EDIT IT.**
//
// That sentence is the whole point. A variant that edits a core file
// conflicts on it every single time it pulls a core update — forever, on the
// same line, for as long as the variant exists. One line is enough to make
// "take the update" a chore that eventually stops happening.
//
// So a firmware drops its own `features_local.h` next to this file and owns it
// completely: its own includes, and `PF_FEATURE_LIST` naming the descriptors it
// wants, in the order it wants them. Nothing in the core tree changes.
//
// Two ways to use that, and the first is the usual one:
//
//   **A named build from this repository.** `firmware/bundles/<name>/` holds
//   the two files; `bundles/build.sh <name>` copies them in, builds, and
//   removes them again. Nothing is forked and nothing is duplicated, so a
//   core change has to compile against the build before it lands.
//
//     ./firmware/bundles/build.sh audio
//
//   **Somebody else's firmware, in their own repository.** Their features and
//   their `features_local.h` are copied over a checkout of core, which makes
//   their build a file copy rather than a merge:
//
//     cp -r my-features/*     core/firmware/patternflow/features/
//     cp    features_local.h  core/firmware/patternflow/features/
//     cd core/firmware/patternflow && pio run -e firmware
//
// A variant's `features_local.h` looks like this — it may add features, drop
// features it does not want, and reorder what is left:
//
//     #include "audio_in/feature_audio_in.h"
//     #define PF_FEATURE_LIST            \
//         &PFFeatureOsc::descriptor,     \
//         &PFFeatureAudio::descriptor,   \
//         &PFFeatureAudioIn::descriptor
//
// Or, for a build with no features at all:
//
//     #define PF_FEATURES_NONE
//
// Order is dispatch order. It matters where features compete: one that CLAIMS
// the pattern (a show) should come after ones that only ASK (a remote
// picker), or the picker never gets a turn.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "pf_feature.h"

// The variant's file, if there is one. Included before the defaults so it can
// define PF_FEATURE_LIST and suppress them entirely.
#if defined(__has_include)
#if __has_include("features_local.h")
#define PF_FEATURES_LOCAL_PRESENT 1
#include "features_local.h"
#elif __has_include("addons_local.h")
// Legacy filename (pre-rename). Same seam, same rules.
#define PF_FEATURES_LOCAL_PRESENT 1
#include "addons_local.h"
#endif
#endif

// ── Legacy name shim (2026-08-30) ───────────────────────────────────────
//
// The tree was addons/ and the vocabulary was "addon" until docs/EDITIONS.md
// settled on "feature". An out-of-tree composition written against the old
// names — two files copied over a checkout, the recipe Simone's bundle uses —
// must keep building, so the old spellings are accepted here and mapped.
// Delete this block once every out-of-tree bundle has migrated.
#if defined(PF_ADDON_LIST) && !defined(PF_FEATURE_LIST)
#define PF_FEATURE_LIST PF_ADDON_LIST
#endif
#if defined(PF_ADDONS_NONE) && !defined(PF_FEATURES_NONE)
#define PF_FEATURES_NONE
#endif

// A local file that defines neither macro would fall through to the defaults
// below and produce the FULL build — wearing whatever name overrides.h gives
// it. That is a firmware lying about what it contains, and the only evidence
// is a byte count nobody reads. Misspell the macro and the build stops here
// instead.
#if defined(PF_FEATURES_LOCAL_PRESENT) && !defined(PF_FEATURES_NONE) &&     !defined(PF_FEATURE_LIST)
#error "features_local.h must define PF_FEATURE_LIST or PF_FEATURES_NONE (typo?)"
#endif

#if !defined(PF_FEATURES_NONE) && !defined(PF_FEATURE_LIST)
// No edition file: the default composition, and it carries no features.
//
// Patternflow is a device that loads interactive patterns and runs them under
// four knobs. That is the whole of it, and none of it is a feature: the
// loader, the encoders, the panel, Wi-Fi, /update, sleep and the console are
// the device. A panel with nothing in this list still does the thing it is
// for, and does it with more room than any other build - the largest
// contiguous block a loadable .pfm can claim is 92,148 bytes here against
// 73,716 with features loaded, measured on hardware.
//
// Everything else is a way of driving it from somewhere else, and each has an
// edition on the shelf, one click away:
//
//   audio       - OSC, browser audio, and the on-board microphone
//   performance - sequences, MQTT and weather
//
// This is not a ranking - see docs/EDITIONS.md.
#define PF_FEATURES_NONE
#endif

#ifdef PF_FEATURES_NONE
// A zero-length array is not valid C++, so an empty build gets a null pointer
// and a count of zero instead. Every dispatch loop is bounded by the count,
// so nothing is ever dereferenced.
inline const PFFeature* const* const PF_FEATURES = nullptr;
inline constexpr size_t PF_FEATURE_COUNT = 0;
#else
inline const PFFeature* const PF_FEATURES[] = {PF_FEATURE_LIST};
inline constexpr size_t PF_FEATURE_COUNT = sizeof(PF_FEATURES) / sizeof(PF_FEATURES[0]);
#endif
