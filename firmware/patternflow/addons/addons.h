// ═══════════════════════════════════════════════════════════
// PatternFlow - the addon list
//
// **THE CORE OWNS THIS FILE. A VARIANT DOES NOT EDIT IT.**
//
// That sentence is the whole point. A variant that edits a core file
// conflicts on it every single time it pulls a core update — forever, on the
// same line, for as long as the variant exists. One line is enough to make
// "take the update" a chore that eventually stops happening.
//
// So a firmware drops its own `addons_local.h` next to this file and owns it
// completely: its own includes, and `PF_ADDON_LIST` naming the descriptors it
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
//   **Somebody else's firmware, in their own repository.** Their addons and
//   their `addons_local.h` are copied over a checkout of core, which makes
//   their build a file copy rather than a merge:
//
//     cp -r my-addons/*     core/firmware/patternflow/addons/
//     cp    addons_local.h  core/firmware/patternflow/addons/
//     cd core/firmware/patternflow && pio run -e firmware
//
// A variant's `addons_local.h` looks like this — it may add features, drop
// features it does not want, and reorder what is left:
//
//     #include "audio_in/addon_audio_in.h"
//     #define PF_ADDON_LIST            \
//         &PFAddonOsc::descriptor,     \
//         &PFAddonAudio::descriptor,   \
//         &PFAddonAudioIn::descriptor
//
// Or, for a build with no addons at all:
//
//     #define PF_ADDONS_NONE
//
// Order is dispatch order. It matters where addons compete: one that CLAIMS
// the pattern (a show) should come after ones that only ASK (a remote
// picker), or the picker never gets a turn.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "pf_addon.h"

// The variant's file, if there is one. Included before the defaults so it can
// define PF_ADDON_LIST and suppress them entirely.
#if defined(__has_include)
#if __has_include("addons_local.h")
#define PF_ADDONS_LOCAL_PRESENT 1
#include "addons_local.h"
#endif
#endif

// A local file that defines neither macro would fall through to the defaults
// below and produce the FULL build — wearing whatever name overrides.h gives
// it. That is a firmware lying about what it contains, and the only evidence
// is a byte count nobody reads. Misspell the macro and the build stops here
// instead.
#if defined(PF_ADDONS_LOCAL_PRESENT) && !defined(PF_ADDONS_NONE) &&     !defined(PF_ADDON_LIST)
#error "addons_local.h must define PF_ADDON_LIST or PF_ADDONS_NONE (typo?)"
#endif

#if !defined(PF_ADDONS_NONE) && !defined(PF_ADDON_LIST)
// No edition file: this is the default composition - what ships on the board.
//
// Patterns, sequences, weather, and OSC for live control that needs no
// infrastructure. Two features are deliberately NOT here, and each has an
// edition of its own on the shelf, one click away:
//
//   audio - the browser websocket and the on-board microphone, which needs
//           four wires soldered to a board with no footprint for it yet
//   mqtt  - Simone Majocchi's client, FlowLocal and Director, for the people
//           running a broker
//
// This is not a ranking - see docs/EDITIONS.md. A composition is a build-time
// choice, and the reason to make one is that a build without MQTT in it
// cannot have had MQTT broken by a change to something else.
#include "osc/addon_osc.h"
#include "show/addon_show.h"
#include "weather/addon_weather.h"
#define PF_ADDON_LIST                \
  &PFAddonOsc::descriptor,           \
      &PFAddonShow::descriptor,      \
      &PFAddonWeather::descriptor
#endif

#ifdef PF_ADDONS_NONE
// A zero-length array is not valid C++, so an empty build gets a null pointer
// and a count of zero instead. Every dispatch loop is bounded by the count,
// so nothing is ever dereferenced.
inline const PFAddon* const* const PF_ADDONS = nullptr;
inline constexpr size_t PF_ADDON_COUNT = 0;
#else
inline const PFAddon* const PF_ADDONS[] = {PF_ADDON_LIST};
inline constexpr size_t PF_ADDON_COUNT = sizeof(PF_ADDONS) / sizeof(PF_ADDONS[0]);
#endif
