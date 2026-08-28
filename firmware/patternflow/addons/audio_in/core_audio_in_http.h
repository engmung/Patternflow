// ═══════════════════════════════════════════════════════════
// PatternFlow - /audio-in: watching and shaping the microphone
//
// Three routes:
//
//   GET  /audio-in           the page
//   GET  /api/audio-in       live levels + the current shaping. Polled.
//   POST /api/audio-in       set one band, or the driving flag
//
// ── Why polling and not the websocket ───────────────────────────────────
//
// The audio addon already runs a websocket on :81, and reusing it was the
// obvious idea. It is the wrong one: that socket carries levels INTO the
// device from a browser tab, and this page is the opposite direction. Wiring
// both through one server means the mic page cannot work on a build that has
// the browser path composed out - which is exactly the build someone with a
// microphone would want.
//
// So: a small GET, polled at ~10 Hz by the page. The response is deliberately
// tiny (four levels, four mapped values, a peak) because this device's web
// server is single-connection and every byte here is a byte the panel is not
// rendering. The shaping is sent once on load and only re-sent when the page
// changes it.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <WiFi.h>

#include "../../src/core_patterns_http.h"
#include "../../src/core_send.h"
#include "../../src/webserver/WebServer.h"
#include "audio_in_index.h"
#include "core_audio_fft.h"
#include "core_audio_in_map.h"
#include "core_audio_pdm.h"

namespace PFAudioInHttp {

inline bool initialized = false;

inline WebServer& server() { return PatternflowPatternsHttp::server(); }

inline void handleIndex() {
  server().sendHeader("Cache-Control", "no-store");
  PFSend::progmem(server(), AUDIO_IN_INDEX_HTML);
}

// Everything the page needs in one object. `level` is the raw band, exactly
// as the FFT produced it; `out` is what the knob is being driven to. Showing
// both is the point - a band that is moving while its output is flat is a
// shaping problem, and one where neither moves is a microphone problem.
inline void handleGet() {
  String j = "{\"source\":\"";
  j += PFAudioPdm::sourceName();
  j += "\",\"driving\":";
  j += PFAudioInMap::driving ? "true" : "false";
  j += ",\"rawPeak\":";
  j += String(PFAudioFFT::rawPeak, 5);
  j += ",\"rawDc\":";
  j += String(PFAudioFFT::rawDc, 5);
  j += ",\"windows\":";
  j += PFAudioPdm::windowsRead;

  j += ",\"level\":[";
  for (int i = 0; i < 4; i++) {
    if (i) j += ',';
    j += String(PFAudioFFT::bands[i], 4);
  }
  j += "],\"out\":[";
  for (int i = 0; i < 4; i++) {
    if (i) j += ',';
    j += String(PFAudioInMap::mapped(i, PFAudioFFT::bands[i]), 4);
  }
  j += "],\"bands\":[";
  for (int i = 0; i < 4; i++) {
    const PFAudioInMap::Band& b = PFAudioInMap::bands[i];
    if (i) j += ',';
    j += "{\"hzMin\":";
    j += String(b.hzMin, 1);
    j += ",\"hzMax\":";
    j += String(b.hzMax, 1);
    j += ",\"inMin\":";
    j += String(b.inMin, 4);
    j += ",\"inMax\":";
    j += String(b.inMax, 4);
    j += ",\"gain\":";
    j += String(b.gain, 3);
    j += ",\"outMin\":";
    j += String(b.outMin, 3);
    j += ",\"outMax\":";
    j += String(b.outMax, 3);
    j += '}';
  }
  j += "],\"hzRange\":[";
  j += String(PFAudioInMap::MIN_HZ, 1);
  j += ',';
  j += String(PFAudioInMap::MAX_HZ, 1);

  // Three decimals, not five: this is 40 numbers ten times a second and the
  // page draws them as bars a few pixels wide. The precision that matters is
  // in `level`, which is what the shaping actually consumes.
  j += "],\"spec\":[";
  {
    float s[PFAudioFFT::SPEC_BUCKETS];
    PFAudioFFT::spectrum(s);
    for (int i = 0; i < PFAudioFFT::SPEC_BUCKETS; i++) {
      if (i) j += ',';
      j += String(s[i], 3);
    }
  }
  j += "]}";

  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", j);
}

inline float argFloat(const char* name, float fallback) {
  if (!server().hasArg(name)) return fallback;
  const String v = server().arg(name);
  if (!v.length()) return fallback;
  return v.toFloat();
}

// One band per POST, addressed by index, or `driving` on its own. Partial
// updates are allowed: the page sends only the handle that moved, so dragging
// one edge cannot clobber the other three by round-tripping a stale copy.
inline void handleSet() {
  if (server().hasArg("driving")) {
    const String v = server().arg("driving");
    PFAudioInMap::driving = (v == "1" || v == "true");
  }

  if (server().hasArg("band")) {
    const int b = server().arg("band").toInt();
    if (b < 0 || b > 3) {
      server().send(400, "application/json", "{\"error\":\"band must be 0-3\"}");
      return;
    }
    PFAudioInMap::Band& x = PFAudioInMap::bands[b];
    x.hzMin = argFloat("hzMin", x.hzMin);
    x.hzMax = argFloat("hzMax", x.hzMax);
    PFAudioInMap::clampRange(x);
    x.inMin = constrain(argFloat("inMin", x.inMin), 0.0f, 1.0f);
    x.inMax = constrain(argFloat("inMax", x.inMax), 0.0f, 1.0f);
    x.gain = constrain(argFloat("gain", x.gain), 0.2f, 4.0f);
    x.outMin = constrain(argFloat("outMin", x.outMin), 0.0f, 1.0f);
    x.outMax = constrain(argFloat("outMax", x.outMax), 0.0f, 1.0f);
    // The mapping forces this anyway; doing it here too means what gets saved
    // is what gets used, and a reload does not silently move a handle.
    if (x.inMax < x.inMin + 0.01f) x.inMax = min(1.0f, x.inMin + 0.01f);
  }

  PFAudioInMap::save();
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", "{\"ok\":true}");
}

inline void handleReset() {
  PFAudioInMap::Band d[4] = {
      {   62.0f,  375.0f, 0.010f, 0.150f, 1.0f, 0.30f, 0.85f},
      {  375.0f, 1500.0f, 0.008f, 0.120f, 1.2f, 0.30f, 0.85f},
      { 1500.0f, 5000.0f, 0.004f, 0.050f, 1.6f, 0.30f, 0.85f},
      { 5000.0f, 8000.0f, 0.003f, 0.030f, 1.8f, 0.30f, 0.85f},
  };
  for (int i = 0; i < 4; i++) PFAudioInMap::bands[i] = d[i];
  PFAudioInMap::save();
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", "{\"ok\":true}");
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/audio-in", HTTP_GET, handleIndex);
  server().on("/api/audio-in", HTTP_GET, handleGet);
  server().on("/api/audio-in", HTTP_POST, handleSet);
  server().on("/api/audio-in/reset", HTTP_POST, handleReset);

  initialized = true;
  Serial.println("[AUDIO-IN] /audio-in ready");
}

}  // namespace PFAudioInHttp
