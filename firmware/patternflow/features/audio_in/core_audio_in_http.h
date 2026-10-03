// ═══════════════════════════════════════════════════════════
// PatternFlow - /audio-in: watching and shaping the microphone
//
// Owns: the page and its four routes. The settings they read and write live
// in core_audio_in_map.h; nothing is stored here but the phone's last frame.
//
//   GET  /audio-in                 the page
//   GET  /api/audio-in             the whole configuration, read once on load
//   GET  /api/audio-in?levels=1    live levels, mapped values, spectrum. Polled.
//   POST /api/audio-in             settings: the switch, gain, auto, the two
//                                  speeds, and any band's fields
//   POST /api/audio-in/reset       the firmware's defaults - one band, or all
//
// The contract, field by field, is docs/rest-api.md ("Microphone"). The phone
// capture app reads the configuration and posts monitor frames through the
// same routes, so a field here is not ours alone to rename.
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
// So: a GET the page polls. The poll reply carries no configuration at all
// (levels, what they map to, and a 64-bucket spectrum to draw) because this
// device's web server is single-connection and every byte here is time the
// one connection is not free for anything else. The configuration is sent
// once on load and the page sends back only what it changed.
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

// ── External frames ─────────────────────────────────────────────────────
//
// A phone running the capture app analyses on the phone and sends the panel
// nothing but final lane values - which leaves the console editor BLIND on a
// board with no microphone: an empty plot, boxes with nothing to breathe
// against, no way to see a curve doing anything. So the app also POSTs its
// analysis here a few times a second (levels, envelopes, a spectrum sized to
// this device's axis), and while those frames stay fresh - and the
// microphone is off; a live mic outranks a monitor - the poll payload serves
// them instead. The page cannot tell the difference, except that `source`
// says "phone" and the values arrive already normalized (`ext:true`, so the
// page skips its own scale conversion).
inline float extLevels[4] = {0, 0, 0, 0};
inline float extEnv[8] = {0, 0, 0, 0, 0, 0, 0, 0};  // lo,hi per band
inline float extSpec[64] = {0};
inline uint32_t extMs = 0;

inline bool extFresh() {
  return extMs != 0 && (millis() - extMs) < 3000 && !PFAudioInMap::micOn;
}

// When did a console page last poll? That timestamp IS the monitor demand:
// the frame POST's reply tells the phone whether anyone is watching, and the
// phone throttles itself from a 4 Hz monitor to a 2 s heartbeat when the
// answer is no - full detail while tuning, near-zero load while filming,
// no switch anywhere.
inline uint32_t pagePollMs = 0;

inline bool pageWatching() {
  return pagePollMs != 0 && (millis() - pagePollMs) < 2500;
}

// "l0,l1,l2,l3;lo0,hi0,..lo3,hi3;s0,..,s63" - 4+8+64 floats, three groups.
// A frame that does not parse to exactly that shape is dropped whole.
inline void parseFrame(const String& s) {
  float vals[76];
  int n = 0, start = 0;
  for (unsigned i = 0; i <= s.length() && n < 76; i++) {
    const char c = i < s.length() ? s[i] : ',';
    if (c == ',' || c == ';') {
      if (i > (unsigned)start) vals[n++] = s.substring(start, i).toFloat();
      start = i + 1;
    }
  }
  if (n != 76) return;
  memcpy(extLevels, vals, sizeof(extLevels));
  memcpy(extEnv, vals + 4, sizeof(extEnv));
  memcpy(extSpec, vals + 12, sizeof(extSpec));
  extMs = millis();
}

inline WebServer& server() { return PatternflowPatternsHttp::server(); }

inline void handleIndex() {
  // gz() picks the page's cache policy itself (PFSend::PAGE, its default:
  // ?v= versioning, ETag, host gating). Add no Cache-Control header here;
  // a second one would contradict the policy's.
  PFSend::gz(server(), AUDIO_IN_INDEX_HTML_GZ, AUDIO_IN_INDEX_HTML_GZ_LEN);
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
// page IS the extension's editor (tools/patternflow-audio-extension/editor.*,
// assembled for the device by toolchain/build_audio_in_page.py) and it paints
// both sources through one frame shape.
inline void handleGet() {
  const bool levelsOnly = server().hasArg("levels");

  if (levelsOnly) {
    // idle=1 is a poll that must not count as an audience: the phone reads
    // that demand in every frame reply and throttles itself by it, so a
    // client that only wants a trickle of status says so. Nothing in this
    // tree sends it today (the page's Monitor toggle, which did, is gone);
    // it stays because the demand signal is the phone's contract.
    if (!server().hasArg("idle")) pagePollMs = millis();
    const bool ext = extFresh();
    // One allocation instead of one per `+=`: the reply is about 700 bytes
    // and a String grows 16 at a time, so unreserved this was some forty
    // reallocs of internal heap, ten times a second.
    String j;
    j.reserve(768);
    j += "{\"source\":\"";
    j += ext ? "phone" : PFAudioFFT::sourceLabel();
    j += "\",\"ext\":";
    j += ext ? "true" : "false";
    j += ",\"rawPeak\":";
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
      j += String(ext ? extLevels[i] : PFAudioInMap::smoothLevel[i], 4);
    }
    // The level as the mapping consumes it in auto mode - sent so a page can
    // paint its cursor from what the knob gets rather than from its own
    // re-derivation. This and `outputs` are always the MICROPHONE's: while
    // `ext` frames are being served the phone is doing its own mapping, and
    // these two do not describe it.
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
    if (ext) {
      // The phone's own envelopes - its auto range, seen from here.
      j += "],\"env\":[";
      for (int i = 0; i < 4; i++) {
        if (i) j += ',';
        j += "{\"lo\":";
        j += String(extEnv[i * 2], 4);
        j += ",\"hi\":";
        j += String(extEnv[i * 2 + 1], 4);
        j += '}';
      }
    } else if (PFAudioInMap::autoRange) {
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
    if (ext) {
      for (int i = 0; i < 64; i++) {
        if (i) j += ',';
        j += String(extSpec[i], 3);
      }
    } else {
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

  // About 1.3 KB with four empty metas; see the note on the poll reply.
  String j;
  j.reserve(1536);
  j += "{\"source\":\"";
  j += PFAudioFFT::sourceLabel();
  j += "\",\"micOn\":";
  j += PFAudioInMap::micOn ? "true" : "false";
  j += ",\"micGain\":";
  j += String(PFAudioInMap::micGain, 1);
  j += ",\"autoRange\":";
  j += PFAudioInMap::autoRange ? "true" : "false";
  j += ",\"smoothing\":";
  j += String(PFAudioInMap::smoothing, 3);
  j += ",\"attack\":";
  j += String(PFAudioInMap::attack, 3);
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
  // Two decimals: the low edge is one FFT bin, 31.25 Hz, and at one decimal
  // a client taking its axis from here was handed a bound that is not the
  // one clampRange() holds a band to.
  j += "],\"hzRange\":[";
  j += String(PFAudioInMap::MIN_HZ, 2);
  j += ',';
  j += String(PFAudioInMap::MAX_HZ, 2);

  // Three decimals: these are drawn as bars a few pixels wide. (`spec`,
  // `level`, `out`, `rawPeak`, `rawDc` and `windows` ride in this reply for
  // scripts and for diagnosing a microphone; the page draws from the poll.)
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

// Does this request say anything about band N in the suffixed form? Every
// field a band has is on the list. It used to be five of them - the ones a
// whole-config save always carries - which meant a request with only
// `inMax2`, the top edge of one box, was answered {"ok":true} and changed
// nothing. A page that sends only what moved needs that to work.
inline bool hasBandArgs(const String& suffix) {
  static const char* const FIELDS[] = {"hzMin", "hzMax", "inMin", "inMax",
                                       "gain",  "outMin", "outMax", "knob",
                                       "muted", "lut",   "meta"};
  for (const char* f : FIELDS)
    if (server().hasArg(String(f) + suffix)) return true;
  return false;
}

// Apply whatever band fields arrived under the given argument names; a field
// that did not arrive keeps its value. Shared by the single-band form (bare
// names + band=N) and the suffixed form (hzMin0..hzMin3), so the two cannot
// drift.
//
// Two pairs are settled TOGETHER after the fields are in, whichever half
// arrived: hzMin/hzMax (ordered, inside the analysable range, a bin apart)
// and inMin/inMax (inMax at least 0.01 above inMin). So one half of a pair
// sent alone can move the other half; a client that wants to know what was
// stored sends both.
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

// Every field is optional and a request changes only what it names: `mic`
// on its own, one slider, one edge of one box, or everything at once. That
// is the point - a page that sends back its whole copy on every edit lets
// two open tabs revert each other, and a drag clobber three bands it never
// touched.
inline void handleSet() {
  // Monitor frames are state, not settings: no NVS save, no other fields.
  // The reply carries the demand signal - see pageWatching().
  if (server().hasArg("frame")) {
    parseFrame(server().arg("frame"));
    server().sendHeader("Cache-Control", "no-store");
    server().send(200, "application/json",
                  pageWatching() ? "{\"ok\":true,\"watch\":true}"
                                 : "{\"ok\":true,\"watch\":false}");
    return;
  }
  // Refused before anything is applied: a 400 that had already flipped the
  // microphone switch in memory would not be a refusal.
  int single = -1;
  if (server().hasArg("band")) {
    single = server().arg("band").toInt();
    if (single < 0 || single > 3) {
      server().sendHeader("Cache-Control", "no-store");
      server().send(400, "application/json",
                    "{\"ok\":false,\"error\":\"band must be 0-3\"}");
      return;
    }
  }
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
  if (server().hasArg("attack")) {
    PFAudioInMap::attack =
        constrain(server().arg("attack").toFloat(), 0.05f, 0.9f);
  }

  // Single-band form: band=N plus bare field names. The strip-era contract,
  // still honoured.
  if (single >= 0) applyBandArgs(single, "");

  // Suffixed form: field names carrying their band (hzMin0..hzMin3, lut2,
  // meta1...). Any number of bands in one request, any subset of each one's
  // fields - four sequential POSTs on a single-connection server was a drag
  // stuttering the panel.
  for (int b = 0; b < 4; b++) {
    const String suffix(b);
    if (hasBandArgs(suffix)) applyBandArgs(b, suffix);
  }

  PFAudioInMap::save();
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", "{\"ok\":true}");
}

// The defaults live in the firmware (core_audio_in_map.h resetBand) and the
// page asks for them here rather than keeping a table of its own - the one it
// had was the extension's, and "Reset band" put a 5-16 kHz band on an axis
// that ends at 8.
//
//   band=N   that band only: its range, window, gain, output range, knob,
//            mute and curve. Nothing else moves. The reply names the band, so
//            a client can tell this from an older firmware that ignored the
//            argument and reset everything.
//   (none)   all four bands and curves, damping, attack and the input gain.
//            Not the microphone switch and not auto range.
inline void handleReset() {
  server().sendHeader("Cache-Control", "no-store");
  if (server().hasArg("band")) {
    // Exactly one digit. toInt() reads "" and "x" as 0, and a reset is not
    // the request to guess on.
    const String v = server().arg("band");
    if (v.length() != 1 || v[0] < '0' || v[0] > '3') {
      server().send(400, "application/json",
                    "{\"ok\":false,\"error\":\"band must be 0-3\"}");
      return;
    }
    PFAudioInMap::resetBand(v[0] - '0');
    PFAudioInMap::save();
    String j = "{\"ok\":true,\"band\":";
    j += v[0];
    j += '}';
    server().send(200, "application/json", j);
    return;
  }
  PFAudioInMap::resetBands();
  PFAudioInMap::micGain = PFAudioInMap::MIC_GAIN_DEFAULT;
  PFAudioInMap::save();
  server().send(200, "application/json", "{\"ok\":true}");
}

inline void begin() {
  if (initialized) return;
  if (!PatternflowWifi::linkUp()) return;

  server().on("/audio-in", HTTP_GET, handleIndex);
  server().on("/api/audio-in", HTTP_GET, handleGet);
  server().on("/api/audio-in", HTTP_POST, handleSet);
  server().on("/api/audio-in/reset", HTTP_POST, handleReset);

  initialized = true;
  Serial.println("[AUDIO-IN] /audio-in ready");
}

}  // namespace PFAudioInHttp
