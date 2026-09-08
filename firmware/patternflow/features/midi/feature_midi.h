// ═══════════════════════════════════════════════════════════
// PatternFlow - MIDI, as a feature
//
// Sound integration's third dialect after OSC and audio: a DAW, a controller
// or a phone drives the four knobs with control changes, and the knobs drive
// them back. The mapping is core_midi.h; the transport shipped here is
// RTP-MIDI over Wi-Fi (core_midi_rtp.h).
//
// Hooks: setup, onNetwork, loop, fillInput, observeFrame, takePattern, the
// NETWORK-screen toggle trio, appendStatus. No core edits.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_feature.h"
#include "core_midi.h"
#include "core_midi_http.h"
#include "core_midi_rtp.h"

namespace PFFeatureMidi {

inline void setup() {
  PatternflowMidi::loadSettings();
  PatternflowMidiRtp::prepare();
}

inline void onNetwork() {
  PatternflowMidiRtp::begin();
  PatternflowMidiHttp::begin();
}

inline void loop(const PFFeatureFrame&) {
  PatternflowMidiRtp::handle();
}

inline void fillInput(InputFrame& input) { PatternflowMidi::fillInput(input); }

inline void observeFrame(const InputFrame& input, const PFFeatureFrame& frame) {
  PatternflowMidi::observeFrame(input, frame.patternIndex);
}

inline bool takePattern(int* idx) { return PatternflowMidi::takePattern(idx); }

inline bool isRuntimeEnabled() { return PatternflowMidi::runtimeEnabled; }
inline void setRuntimeEnabled(bool on) { PatternflowMidi::setRuntimeEnabled(on); }

inline void appendStatus(String& json) {
  char peer[sizeof(PatternflowMidiRtp::peerName)];
  int peers;
  PatternflowMidiRtp::copyPeer(peer, sizeof(peer), peers);
  json += ",\"midi\":{\"runtime\":";
  json += PatternflowMidi::runtimeEnabled ? "true" : "false";
  json += ",\"channel\":";
  json += (int)PF_MIDI_CHANNEL;
  json += ",\"outDiv\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += PatternflowMidi::outDivisor[i]; }
  json += "],\"outMul\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += PatternflowMidi::outMultiplier[i]; }
  json += "]";
  json += ",\"outMode\":\"";
  json += PatternflowMidi::outAbsolute ? "abs" : "rel";
  json += "\"";
  json += ",\"host\":\"";
  json += PatternflowMidiRtp::host;
  json += "\",\"rtpPeers\":";
  json += peers;
  json += ",\"rtpPeer\":\"";
  json += peer;
  json += "\",\"rx\":";
  json += PatternflowMidi::rxCount;
  json += ",\"tx\":";
  json += PatternflowMidi::txCount;
  PatternflowMidiRtp::appendDiagnostics(json);
  json += "}";
}

inline const PFFeature descriptor = {
    "midi",
    "midi",        // cap - the lab and the site probe for this
    setup,
    onNetwork,
    loop,
    observeFrame,
    fillInput,
    nullptr,       // onUserInput
    nullptr,       // claimsPattern - MIDI only asks
    takePattern,
    nullptr,       // onSleep
    nullptr,       // requestSleep
    "MIDI",        // shortName - the NETWORK screen row
    isRuntimeEnabled,
    setRuntimeEnabled,
    appendStatus,
    nullptr,       // drawOverlay
    "/midi",       // navPath - the console header link
    "MIDI",        // navLabel
    "The panel as a MIDI port: the session, how far a knob turn goes, and the map.",
};

}  // namespace PFFeatureMidi
