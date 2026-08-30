// ═══════════════════════════════════════════════════════════
// PatternFlow - /audio-in: watching and shaping the microphone
//
// Three routes:
//
//   GET  /audio-in           the page
//   GET  /api/audio-in       live levels + the current shaping. Polled.
//   POST /api/audio-in       set one band, or the microphone switch
//
// ── Why polling and not the websocket ───────────────────────────────────
//
// The audio feature already runs a websocket on :81, and reusing it was the
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
// Two shapes from one route. `?levels=1` is what the page polls ten times a
// second and carries no configuration at all: the page owns the config after
// it has read it once, and sending it back on every tick is what made a
// dragged handle spring back to whatever the device last managed to save.
//
// Field names are the extension's — levels, outputs, spectrum — because the
// page's paint loop is lifted from popup.js and renaming them here would mean
// editing code whose whole value is that it is not edited.
inline void handleGet() {
  const bool levelsOnly = server().hasArg("levels");

  if (levelsOnly) {
    String j = "{\"source\":\"";
    j += PFAudioFFT::sourceLabel();
    j += "\",\"rawPeak\":";
    j += String(PFAudioFFT::rawPeak, 5);
    j += ",\"rawDc\":";
    j += String(PFAudioFFT::rawDc, 5);
    j += ",\"dropped\":";
    j += PFAudioPdm::dropped;
    // Damped, because these are what the mapping consumes and what the page
    // paints - the raw per-window numbers still leave through rawPeak and
    // /api/status for anyone diagnosing the silicon.
    j += ",\"levels\":[";
    for (int i = 0; i < 4; i++) {
      if (i) j += ',';
      j += String(PFAudioInMap::smoothLevel[i], 4);
    }
    // The level as the mapping consumes it in auto mode - the page paints
    // its dot and meters from this so what you see is what the knob gets.
    j += "],\"levelsN\":[";
    for (int i = 0; i < 4; i++) {
      if (i) j += ',';
      j += String(PFAudioInMap::normalized(i, PFAudioInMap::smoothLevel[i]), 4);
    }
    j += "],\"outputs\":[";
    for (int i = 0; i < 4; i++) {
      if (i) j += ',';
      j += String(PFAudioInMap::mapped(i, PFAudioInMap::smoothLevel[i]), 4);
    }
    // The breathing window, for the editor's boxes: in auto mode each band
    // maps between its learned floor and its peak envelope, and the box's
    // dashed edges are drawn from exactly these.
    if (PFAudioInMap::autoRange) {
      j += "],\"env\":[";
      for (int i = 0; i < 4; i++) {
        if (i) j += ',';
        j += "{\"lo\":";
        j += String(PFAudioInMap::noiseRef[i] * PFAudioInMap::NORM_LO_K, 4);
        j += ",\"hi\":";
        j += String(PFAudioInMap::envHi[i], 4);
        j += '}';
      }
    }
    j += "],\"spectrum\":[";
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
    return;
  }

  String j = "{\"source\":\"";
  j += PFAudioFFT::sourceLabel();
  j += "\",\"micOn\":";
  j += PFAudioInMap::micOn ? "true" : "false";
  j += ",\"micGain\":";
  j += String(PFAudioInMap::micGain, 1);
  j += ",\"autoRange\":";
  j += PFAudioInMap::autoRange ? "true" : "false";
  j += ",\"smoothing\":";
  j += String(PFAudioInMap::smoothing, 3);
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
    j += ",\"knob\":";
    j += b.knob;
    j += ",\"muted\":";
    j += b.muted ? "true" : "false";
    // The curve, as the editor described it (a preset id or bezier handles,
    // opaque here). The editor re-bakes its table from this on load, so the
    // 33 samples never need to travel back.
    j += ",\"meta\":\"";
    for (const char* c = PFAudioInMap::metas[i]; *c; c++) {
      if (*c == '"' || *c == '\\') j += '\\';
      j += *c;
    }
    j += "\",\"lutSet\":";
    j += PFAudioInMap::lutSet[i] ? "true" : "false";
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

// Apply whatever band fields arrived under the given argument names. Shared
// by the single-band form (bare names + band=N) and the editor's whole-config
// form (suffixed names, hzMin0..hzMin3), so the two cannot drift.
inline void applyBandArgs(int b, const String& suffix) {
  PFAudioInMap::Band& x = PFAudioInMap::bands[b];
  const String sHzMin = "hzMin" + suffix, sHzMax = "hzMax" + suffix;
  x.hzMin = argFloat(sHzMin.c_str(), x.hzMin);
  x.hzMax = argFloat(sHzMax.c_str(), x.hzMax);
  PFAudioInMap::clampRange(x);
  x.inMin = constrain(argFloat(("inMin" + suffix).c_str(), x.inMin), 0.0f, 1.0f);
  x.inMax = constrain(argFloat(("inMax" + suffix).c_str(), x.inMax), 0.0f, 1.0f);
  x.gain = constrain(argFloat(("gain" + suffix).c_str(), x.gain), 0.2f, 4.0f);
  x.outMin = constrain(argFloat(("outMin" + suffix).c_str(), x.outMin), 0.0f, 1.0f);
  x.outMax = constrain(argFloat(("outMax" + suffix).c_str(), x.outMax), 0.0f, 1.0f);
  if (server().hasArg("knob" + suffix))
    x.knob = constrain((int)server().arg("knob" + suffix).toInt(), 0, 3);
  if (server().hasArg("muted" + suffix)) {
    const String m = server().arg("muted" + suffix);
    x.muted = (m == "1" || m == "true");
  }
  if (x.inMax < x.inMin + 0.01f) x.inMax = min(1.0f, x.inMin + 0.01f);

  // The curve table: 33 comma-separated 0..255 samples. An empty value
  // clears the table and the band falls back to its gain exponent.
  if (server().hasArg("lut" + suffix)) {
    const String csv = server().arg("lut" + suffix);
    if (!csv.length()) {
      PFAudioInMap::lutSet[b] = 0;
    } else {
      uint8_t parsed[PFAudioInMap::LUT_POINTS];
      int n = 0, acc = 0;
      bool has = false, ok = true;
      for (unsigned k = 0; k <= csv.length(); k++) {
        const char c = k < csv.length() ? csv[k] : ',';
        if (c >= '0' && c <= '9') {
          acc = acc * 10 + (c - '0');
          has = true;
          if (acc > 255) { ok = false; break; }
        } else if (c == ',') {
          if (!has || n >= PFAudioInMap::LUT_POINTS) { ok = false; break; }
          parsed[n++] = (uint8_t)acc;
          acc = 0;
          has = false;
        } else { ok = false; break; }
      }
      if (ok && n == PFAudioInMap::LUT_POINTS) {
        memcpy(PFAudioInMap::luts[b], parsed, sizeof(parsed));
        PFAudioInMap::lutSet[b] = 1;
      }
    }
  }
  if (server().hasArg("meta" + suffix)) {
    const String m = server().arg("meta" + suffix);
    strncpy(PFAudioInMap::metas[b], m.c_str(), sizeof(PFAudioInMap::metas[b]) - 1);
    PFAudioInMap::metas[b][sizeof(PFAudioInMap::metas[b]) - 1] = 0;
  }
}

// One band per POST, addressed by index, or `mic` on its own. Partial
// updates are allowed: the page sends only the handle that moved, so dragging
// one edge cannot clobber the other three by round-tripping a stale copy.
inline void handleSet() {
  if (server().hasArg("mic")) {
    const String v = server().arg("mic");
    PFAudioInMap::micOn = (v == "1" || v == "true");
  }
  if (server().hasArg("auto")) {
    const String v = server().arg("auto");
    PFAudioInMap::autoRange = (v == "1" || v == "true");
  }
  if (server().hasArg("micGain")) {
    PFAudioInMap::micGain = constrain(server().arg("micGain").toFloat(),
                                      PFAudioInMap::MIC_GAIN_MIN,
                                      PFAudioInMap::MIC_GAIN_MAX);
  }
  if (server().hasArg("smoothing")) {
    PFAudioInMap::smoothing =
        constrain(server().arg("smoothing").toFloat(), 0.05f, 0.9f);
  }

  // Single-band form: band=N plus bare field names. The strip-era contract,
  // still honoured.
  if (server().hasArg("band")) {
    const int b = server().arg("band").toInt();
    if (b < 0 || b > 3) {
      server().send(400, "application/json", "{\"error\":\"band must be 0-3\"}");
      return;
    }
    applyBandArgs(b, "");
  }

  // Whole-config form: suffixed field names (hzMin0..hzMin3, lut2, meta1...).
  // The editor saves everything it owns in one request - four sequential
  // POSTs on a single-connection server was a drag stuttering the panel.
  for (int b = 0; b < 4; b++) {
    const String suffix(b);
    if (server().hasArg("hzMin" + suffix) || server().hasArg("lut" + suffix) ||
        server().hasArg("knob" + suffix) || server().hasArg("muted" + suffix) ||
        server().hasArg("outMin" + suffix)) {
      applyBandArgs(b, suffix);
    }
  }

  PFAudioInMap::save();
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", "{\"ok\":true}");
}

inline void handleReset() {
  PFAudioInMap::resetBands();
  PFAudioInMap::micGain = 8.0f;
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
