// ═══════════════════════════════════════════════════════════
// PatternFlow - the show player, as an addon
//
// The first thing ported onto the addon seam, and deliberately the
// hardest: sequences touch boot, the network, every frame, user input,
// pattern control and the overlay pass. If this fits, the hook set is
// real.
//
// Nothing of the player itself is here — core_show.h and its two
// companions are unchanged beside this file. All this does is say which
// of their functions answers which moment.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_addon.h"
#include "core_show.h"
#include "core_show_http.h"
#include "core_show_schedule.h"
#include "core_library_http.h"

namespace PFAddonShow {

inline void setup() {
  PatternflowShowSchedule::begin();
  PatternflowShow::begin();
}

inline void onNetwork() {
  PatternflowShowHttp::begin();
}

inline void loop(const PFAddonFrame& frame) {
  // Advance the running .pfs cue table (no-op when nothing is playing).
  PatternflowShow::tick();

  // Night/wake scheduler: may queue Black or start the wake sequence. It
  // needs to know what is on the panel, which is what the frame carries.
  if (!PatternflowPatternsHttp::isConsolePaused()) {
    PatternflowShowSchedule::tick(frame.patternName, frame.running);
  }
}

inline void onUserInput() {
  PatternflowShowSchedule::noteInteraction();
}

// A running show owns the pattern: OSC, MQTT and HTTP pickers stand down
// rather than yanking it out from under a sequence.
inline bool claimsPattern() {
  return PatternflowShow::isPlaying();
}

// Show playback must be able to load a module even if Home/Patterns left
// the console-pause flag set — /show is a player, not a library editor.
inline bool takePattern(int* idx) {
  if (!PatternflowShow::consumePatternIdx(*idx)) return false;
  PatternflowPatternsHttp::releaseConsolePause();
  return true;
}

// Scheduler-owned clock face, drawn over Black only (dim night clock or
// the big snooze face).
inline void drawOverlay(const PFAddonFrame& frame) {
  if (frame.patternName && strcmp(frame.patternName, "Black") == 0) {
    PatternflowShowSchedule::drawOwnedClock();
  }
}

inline const PFAddon descriptor = {
    "show",        // name
    "shows",       // cap reported by /api/status
    setup,
    onNetwork,
    loop,
    nullptr,       // observeFrame
    nullptr,       // fillInput
    onUserInput,
    claimsPattern,
    takePattern,
    nullptr,       // onSleep
    nullptr,       // requestSleep
    nullptr,       // shortName - not listed in the device menu
    nullptr,       // isRuntimeEnabled
    nullptr,       // setRuntimeEnabled
    nullptr,       // appendStatus
    drawOverlay,
    "/show",       // navPath - the console header link
    "Sequences",   // navLabel
};

}  // namespace PFAddonShow
