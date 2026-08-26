// ═══════════════════════════════════════════════════════════
// PatternFlow - audio-react, as an addon
//
// The fourth port, and the one that tested the boundary the RFC drew
// around the device's own UI. Audio is not only a web page: it has a row
// on the NETWORK screen and a knob that turns it off, because somebody
// standing at the panel should be able to stop it reacting.
//
// Rather than let the sketch keep naming this one feature, the menu learned
// to list addons generically: expose `shortName`, `isRuntimeEnabled` and
// `setRuntimeEnabled` and the NETWORK screen shows a row and toggles it.
// The core still owns the menu — it just no longer knows what audio is.
//
// It is also the only addon that runs a server of its own (the websocket on
// PF_AUDIO_WS_PORT), which the seam allows: the rule is only that the loop
// hook must not block.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Preferences.h>
#include "../pf_addon.h"
#include "core_audio_ws.h"

namespace PFAddonAudio {

inline void setup() {
  // The runtime switch survives reboots; the addon owns its own key.
  Preferences prefs;
  prefs.begin("pf", /*readOnly=*/true);
  PatternflowAudio::setRuntimeEnabled(prefs.getBool("audio_runtime", true));
  prefs.end();
}

inline void onNetwork() {
  PatternflowAudio::begin();
}

inline void loop(const PFAddonFrame&) {
  PatternflowAudio::handle();
}

// Audio contributes deltas (a beat nudges a knob) and lane values (a band's
// level drives a mapped parameter).
inline void fillInput(InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    int audioDelta = PatternflowAudio::consumeKnobDelta(i);
    if (input.knobDeltas[i] == 0) input.knobDeltas[i] = audioDelta;
    input.knobAudioActive[i] = PatternflowAudio::isActive(i);
    input.knobAudioValue[i] = PatternflowAudio::value(i);
  }
}

inline bool isRuntimeEnabled() { return PatternflowAudio::isRuntimeEnabled(); }

inline void setRuntimeEnabled(bool on) {
  PatternflowAudio::setRuntimeEnabled(on);
  Preferences prefs;
  prefs.begin("pf", /*readOnly=*/false);
  prefs.putBool("audio_runtime", on);
  prefs.end();
}

inline const PFAddon descriptor = {
    "audio",
    "audio",
    setup,
    onNetwork,
    loop,
    nullptr,       // observeFrame
    fillInput,
    nullptr,       // onUserInput
    nullptr,       // claimsPattern
    nullptr,       // takePattern
    nullptr,       // onSleep
    nullptr,       // requestSleep
    "AUD",         // shortName - the NETWORK screen row
    isRuntimeEnabled,
    setRuntimeEnabled,
    nullptr,       // appendStatus
    nullptr,       // drawOverlay
};

}  // namespace PFAddonAudio
