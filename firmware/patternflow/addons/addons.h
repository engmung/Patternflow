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
// So a variant drops its own `addons_local.h` next to this file and owns it
// completely: its own includes, and `PF_ADDON_LIST` naming the descriptors it
// wants, in the order it wants them. Nothing in the core tree changes, which
// makes a variant's build a file copy rather than a merge:
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
#include "addons_local.h"
#endif
#endif

#if !defined(PF_ADDONS_NONE) && !defined(PF_ADDON_LIST)
// No variant file: this is what core ships.
#include "osc/addon_osc.h"
#include "show/addon_show.h"
#include "weather/addon_weather.h"
#include "mqtt/addon_mqtt.h"
#include "audio/addon_audio.h"
#define PF_ADDON_LIST                \
  &PFAddonOsc::descriptor,           \
      &PFAddonShow::descriptor,      \
      &PFAddonWeather::descriptor,   \
      &PFAddonMqtt::descriptor,      \
      &PFAddonAudio::descriptor
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
