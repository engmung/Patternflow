// ═══════════════════════════════════════════════════════════
// PatternFlow - /api/midi: the one MIDI setting a person changes
//
//   GET  /api/midi              channel, outbound sensitivity, session state
//   POST /api/midi?outDiv=N     detents per relative-CC step, 1..16, persisted
//
// The mapping itself is fixed by docs/midi-spec.md and not a setting; what
// varies from one DAW session to the next is how much parameter a wrist
// should move, and that is this one number.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

#include "../../src/core_http.h"
#include "core_midi.h"
#include "core_midi_rtp.h"

namespace PatternflowMidiHttp {

inline bool initialized = false;

inline void sendState() {
  String json = "{\"ok\":true,\"channel\":";
  json += (int)PF_MIDI_CHANNEL;
  json += ",\"outDiv\":";
  json += PatternflowMidi::outDivisor;
  json += ",\"runtime\":";
  json += PatternflowMidi::runtimeEnabled ? "true" : "false";
  json += ",\"rtpPeers\":";
  json += PatternflowMidiRtp::peers;
  json += ",\"rx\":";
  json += PatternflowMidi::rxCount;
  json += ",\"tx\":";
  json += PatternflowMidi::txCount;
  json += "}";
  PatternflowHttp::server().send(200, "application/json", json);
}

inline void begin() {
  if (initialized) return;
  initialized = true;
  WebServer& s = PatternflowHttp::server();
  s.on("/api/midi", HTTP_GET, []() { sendState(); });
  s.on("/api/midi", HTTP_POST, []() {
    WebServer& s = PatternflowHttp::server();
    if (s.hasArg("outDiv") && !PatternflowMidi::setOutDivisor(s.arg("outDiv").toInt())) {
      s.send(400, "application/json", "{\"ok\":false,\"error\":\"outDiv must be 1..16\"}");
      return;
    }
    sendState();
  });
  PatternflowHttp::begin();
}

}  // namespace PatternflowMidiHttp
