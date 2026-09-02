// ═══════════════════════════════════════════════════════════
// PatternFlow - /api/midi: the one MIDI setting a person changes
//
//   GET  /midi                  the page
//   GET  /api/midi              channel, outbound sensitivity, host, session
//   POST /api/midi?on=0|1       the MIDI row on the NETWORK screen, from here
//   POST /api/midi?outDiv=N     detents per outbound step, 1..16, persisted
//   POST /api/midi?outMul=N     steps per detent, 1..8 (the other direction)
//        ...&knob=1..4          apply to one knob; absent = all four
//   POST /api/midi?outMode=abs|rel  knobs out as a virtual 0..127 position
//                               (default) or as 64±steps. Persisted.
//   POST /api/midi?host=<ip>    the host to invite on boot and whenever no
//                               session is up; empty string = wait to be
//                               invited. Persisted.
//
// The mapping itself is fixed by docs/midi-spec.md and not a setting; what
// varies from one DAW session to the next is how much parameter a wrist
// should move, and that is this one number.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <WiFi.h>

#include "../../src/core_http.h"
#include "../../src/core_patterns_http.h"
#include "../../src/core_send.h"
#include "midi_index.h"
#include "core_midi.h"
#include "core_midi_rtp.h"

namespace PatternflowMidiHttp {

inline bool initialized = false;

inline void sendState() {
  String json = "{\"ok\":true,\"channel\":";
  json += (int)PF_MIDI_CHANNEL;
  json += ",\"outDiv\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += PatternflowMidi::outDivisor[i]; }
  json += "],\"outMul\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += PatternflowMidi::outMultiplier[i]; }
  json += "],\"outMode\":\"";
  json += PatternflowMidi::outAbsolute ? "abs" : "rel";
  json += "\",\"host\":\"";
  json += PatternflowMidiRtp::host;
  json += "\",\"runtime\":";
  json += PatternflowMidi::runtimeEnabled ? "true" : "false";
  json += ",\"rtpPeers\":";
  json += PatternflowMidiRtp::peers;
  json += ",\"rtpPeer\":\"";
  json += PatternflowMidiRtp::peerName;
  json += "\",\"you\":\"";
  json += PatternflowHttp::server().client().remoteIP().toString();
  json += "\",\"ip\":\"";
  json += WiFi.localIP().toString();
  json += "\",\"port\":";
  json += (int)PF_MIDI_RTP_PORT;
  json += ",\"outPos\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += PatternflowMidi::outPos[i];
  }
  json += "],\"rx\":";
  json += PatternflowMidi::rxCount;
  json += ",\"tx\":";
  json += PatternflowMidi::txCount;
  json += "}";
  PatternflowHttp::server().send(200, "application/json", json);
}

inline void handleIndex() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  PFSend::progmem(PatternflowHttp::server(), MIDI_INDEX_HTML);
}

inline void begin() {
  if (initialized) return;
  initialized = true;
  WebServer& s = PatternflowHttp::server();
  s.on("/midi", HTTP_GET, handleIndex);
  s.on("/api/midi", HTTP_GET, []() { sendState(); });
  s.on("/api/midi", HTTP_POST, []() {
    WebServer& s = PatternflowHttp::server();
    int knob = -1;
    if (s.hasArg("knob")) {
      knob = s.arg("knob").toInt() - 1;
      if (knob < 0 || knob > 3) {
        s.send(400, "application/json", "{\"ok\":false,\"error\":\"knob must be 1..4\"}");
        return;
      }
    }
    if (s.hasArg("outDiv") && !PatternflowMidi::setOutDivisor(knob, s.arg("outDiv").toInt())) {
      s.send(400, "application/json", "{\"ok\":false,\"error\":\"outDiv must be 1..16\"}");
      return;
    }
    if (s.hasArg("on")) PatternflowMidi::setRuntimeEnabled(s.arg("on") == "1");
    if (s.hasArg("outMul") && !PatternflowMidi::setOutMultiplier(knob, s.arg("outMul").toInt())) {
      s.send(400, "application/json", "{\"ok\":false,\"error\":\"outMul must be 1..8\"}");
      return;
    }
    if (s.hasArg("outMode")) {
      String m = s.arg("outMode");
      if (m != "abs" && m != "rel") {
        s.send(400, "application/json", "{\"ok\":false,\"error\":\"outMode must be abs or rel\"}");
        return;
      }
      PatternflowMidi::setOutAbsolute(m == "abs");
    }
    if (s.hasArg("host") && !PatternflowMidiRtp::setHost(s.arg("host"))) {
      s.send(400, "application/json", "{\"ok\":false,\"error\":\"host must be an IPv4 address or empty\"}");
      return;
    }
    sendState();
  });
  PatternflowHttp::begin();
}

}  // namespace PatternflowMidiHttp
