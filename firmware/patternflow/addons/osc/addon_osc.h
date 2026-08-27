// ═══════════════════════════════════════════════════════════
// PatternFlow - OSC, as an addon
//
// The fifth port onto the addon seam, and the first one that did not fit.
//
// OSC was left in the core by the RFC's first draft, on the grounds that it
// needs no infrastructure — no broker, no computer beyond the one already
// making the music. That reasoning does not survive contact: a panel running
// somebody's standalone AP transport needs no infrastructure either, and the
// test cannot be applied to one feature and not another.
//
// The line that does hold is simpler. OSC is how a panel talks to Max,
// TouchDesigner and Ableton — it is sound integration, and it belongs with
// the rest of the sound integration rather than in the core by historical
// accident. Nothing is stranded by its leaving: a build without it can still
// be updated, still runs every community pattern, and still takes remote
// control over HTTP (`POST /api/params`, `POST /api/patterns/select`).
//
// ── What this port cost the seam ────────────────────────────────────────
//
// The four features ported before this one all spoke in names and booleans,
// so `observeFrame` handing over a pattern NAME was enough. OSC publishes
// `/patternflow/pattern/index` and an app-mode integer, both fixed in a
// released wire specification that hosts are built against — the index
// cannot be quietly swapped for the name.
//
// So `PFAddonFrame` gained `patternIndex` and `appMode`, and `observeFrame`
// now takes the frame instead of a bare name. That is the first genuine gap
// the hook set has shown, and it was found the only way such things are
// found: by porting a feature that had not been considered when the hooks
// were derived.
//
// Hooks used: setup, onNetwork, loop, observeFrame, fillInput, takePattern,
// and the runtime-toggle trio that puts it on the device's NETWORK screen.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_addon.h"
#include "core_osc.h"

namespace PFAddonOsc {

// The device's NETWORK screen row and the NVS key behind it. OSC has always
// been switchable there; moving the feature must not move the switch.
inline void setup() {
  Preferences prefs;
  if (prefs.begin("patternflow", true)) {
    PatternflowOsc::setRuntimeEnabled(prefs.getBool("osc_runtime", true));
    prefs.end();
  }
}

inline void onNetwork() {
  PatternflowOsc::begin();
}

// Virtual rotation from the host, merged at the raw 1x-per-detent rate —
// deliberately NOT amplified by the fast-spin curve, which exists to read a
// human wrist and means nothing for a number arriving over UDP.
inline void fillInput(InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    input.knobDeltas[i] += PatternflowOsc::consumeKnobDelta(i);
  }
}

// Outward: knob turns, buttons, pattern and mode changes, heartbeat. Runs on
// the finished frame, so what the host hears is exactly what the pattern saw.
inline void observeFrame(const InputFrame& input, const PFAddonFrame& frame) {
  PatternflowOsc::update(input, frame.patternName, frame.patternIndex,
                         0,  // content mode: removed years ago, still on the wire as 0
                         frame.appMode);
}

// Inward: /patternflow/pattern/index. Loading a module is the sketch's job,
// so the addon asks and the sketch performs.
inline bool takePattern(int* idx) {
  return PatternflowOsc::consumePatternIdx(*idx);
}

inline bool isRuntimeEnabled() { return PatternflowOsc::isRuntimeEnabled(); }
inline void setRuntimeEnabled(bool on) { PatternflowOsc::setRuntimeEnabled(on); }

inline const PFAddon descriptor = {
    "osc",
    "osc",         // cap - the site and the lab probe for this
    setup,
    onNetwork,
    nullptr,       // loop - update() runs from observeFrame, on the finished frame
    observeFrame,
    fillInput,
    nullptr,       // onUserInput
    nullptr,       // claimsPattern - OSC never owns the panel, it only asks
    takePattern,
    nullptr,       // onSleep
    nullptr,       // requestSleep
    "OSC",        // shortName - the device NETWORK screen row
    isRuntimeEnabled,
    setRuntimeEnabled,
    nullptr,       // appendStatus
    nullptr,       // drawOverlay
};

}  // namespace PFAddonOsc
