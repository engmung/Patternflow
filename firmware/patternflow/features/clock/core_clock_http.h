// ═══════════════════════════════════════════════════════════
// PatternFlow - /clock page and /api/clock
//
//   GET  /clock              the page
//   GET  /clock/glyphs.bin   the digit glyphs, as compiled in - the page's
//                            preview draws the same pixels as the panel, and
//                            lists the faces from the same bytes
//   GET  /api/clock          every setting, plus the panel's time as it sees it
//   POST /api/clock          any subset of:
//        on=0|1  tz=<POSIX TZ>  h12=0|1  rot=0..3  face=0..N-1  gap=0..32
//        sep=0|1|2  sepw=1..8  in=0|1  out=0|1  dim=0..100
//        ink=RRGGBB  bg=RRGGBB  fade=0|1     - persisted, answers as GET
//
// rot:  quarter turns of the panel; 1 is upright, the way its menus read.
// gap:  px between the rows (upright) or between the pairs (wide).
// sep:  the bar between the rows / the colon across - 0 none, 1 cut from
//       the pattern like the digits, 2 drawn in the ink colour.
// in:   inside the digits - 0 the pattern, 1 the ink colour.
// out:  outside them - 0 the pattern at `dim` percent, 1 the bg colour.
//
// The face reads these settings from the render core every frame, so the
// write happens there (core_loop_sync.h) - the rule every feature's config
// handler follows.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "clock_config.h"

#include "../../net_config.h"
#include "../../src/core_patterns_http.h"
#include "../../src/core_loop_sync.h"

#if PF_CLOCK_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED && PF_CLOCK_ENABLED
#include "../../src/webserver/WebServer.h"  // vendored: see src/webserver/VENDORED.md
#include <WiFi.h>
#include <time.h>
#include "../../src/core_clock.h"
#include "../../src/core_send.h"
#include "core_clock_face.h"
#include "clock_glyphs.h"
#include "clock_index.h"
#endif

namespace PatternflowClockHttp {

#if PF_CLOCK_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED && PF_CLOCK_ENABLED

inline WebServer& server() { return PatternflowPatternsHttp::server(); }
inline bool initialized = false;

inline void appendJsonString(String& json, const char* key, const char* value) {
  json += "\"";
  json += key;
  json += "\":\"";
  if (value) {
    for (const char* p = value; *p; ++p) {
      char c = *p;
      if (c == '"' || c == '\\') json += '\\';
      if (c >= 32) json += c;
    }
  }
  json += "\"";
}

inline void appendHex(String& json, const char* key, uint32_t rgb) {
  char hex[8];
  snprintf(hex, sizeof(hex), "%06X", (unsigned)(rgb & 0xFFFFFF));
  appendJsonString(json, key, hex);
}

inline void sendState(int code) {
  using namespace PatternflowClockFace;
  String json;
  json.reserve(640);
  json = "{\"ok\":true,\"on\":";
  json += enabled ? "true" : "false";
  json += ",";
  appendJsonString(json, "tz", tz);
  json += ",\"h12\":";
  json += twelveHour ? "true" : "false";
  json += ",\"rot\":";
  json += (int)rotation;
  json += ",\"face\":";
  json += (int)face;
  json += ",\"faces\":[";
  for (int i = 0; i < faceCount(); i++) {
    if (i) json += ',';
    json += "\"";
    for (const char* p = faceName(i); *p; ++p) {
      if (*p == '"' || *p == '\\') json += '\\';
      json += *p;
    }
    json += "\"";
  }
  json += "],\"gap\":";
  json += (int)gap;
  json += ",\"sep\":";
  json += (int)sep;
  json += ",\"sepw\":";
  json += (int)sepW;
  json += ",\"in\":";
  json += (int)inside;
  json += ",\"out\":";
  json += (int)outside;
  json += ",\"dim\":";
  json += (int)dimPct;
  json += ",";
  appendHex(json, "ink", inkPacked());
  json += ",";
  appendHex(json, "bg", bgPacked());
  json += ",\"fade\":";
  json += fade ? "true" : "false";
  // The panel as the pattern sees it (native), for the page's preview.
  json += ",\"w\":";
  json += (int)PANEL_RES_W;
  json += ",\"h\":";
  json += (int)PANEL_RES_H;
  json += ",\"glyphsRev\":";
  json += (int)CLOCK_GLYPHS_REV;
  json += ",\"synced\":";
  struct tm t;
  bool have = PatternflowClock::localTime(&t);
  json += have ? "true" : "false";
  char buf[24] = {};
  if (have) strftime(buf, sizeof(buf), "%H:%M:%S", &t);
  json += ",";
  appendJsonString(json, "time", buf);
  buf[0] = '\0';
  if (have) strftime(buf, sizeof(buf), "%a %b %d %Y", &t);
  json += ",";
  appendJsonString(json, "today", buf);
  buf[0] = '\0';
  if (have) strftime(buf, sizeof(buf), "%Z", &t);
  json += ",";
  appendJsonString(json, "zone", buf);
  json += "}";
  server().sendHeader("Cache-Control", "no-store");
  server().send(code, "application/json", json);
}

inline void handleIndex() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  PFSend::progmem(server(), CLOCK_INDEX_HTML);
}

// The glyph blob, straight out of flash. Immutable for the life of a
// firmware, which is what the page keys its cache on (?v=glyphsRev).
inline void handleGlyphs() {
  server().sendHeader("Cache-Control", "public, max-age=31536000, immutable");
  server().send_P(200, "application/octet-stream", (PGM_P)CLOCK_GLYPHS, CLOCK_GLYPHS_LEN);
}

inline void handleGet() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  sendState(200);
}

inline bool flag(const char* name, bool current) {
  if (!server().hasArg(name)) return current;
  const String& v = server().arg(name);
  return v == "1" || v == "true" || v == "on";
}

inline uint8_t small(const char* name, uint8_t current, uint8_t lo, uint8_t hi) {
  if (!server().hasArg(name)) return current;
  long v = server().arg(name).toInt();
  if (v < lo || v > hi) return current;
  return (uint8_t)v;
}

inline bool hexArg(const char* name, uint32_t* out) {
  if (!server().hasArg(name)) return false;
  String hex = server().arg(name);
  if (hex.startsWith("#")) hex = hex.substring(1);
  if (hex.length() != 6) return false;
  char* end = nullptr;
  unsigned long v = strtoul(hex.c_str(), &end, 16);
  if (!end || *end != '\0') return false;
  *out = (uint32_t)v;
  return true;
}

inline void configOnLoop() {
  using namespace PatternflowClockFace;
  enabled = flag("on", enabled);
  twelveHour = flag("h12", twelveHour);
  rotation = small("rot", rotation, 0, 3);
  int nf = faceCount();
  face = small("face", face, 0, (uint8_t)(nf > 0 ? nf - 1 : 0));
  gap = small("gap", gap, 0, 32);
  sep = small("sep", sep, 0, SepColour);
  sepW = small("sepw", sepW, 1, 8);
  inside = small("in", inside, 0, FillColour);
  outside = small("out", outside, 0, FillColour);
  dimPct = small("dim", dimPct, 0, 100);
  fade = flag("fade", fade);
  uint32_t rgb;
  if (hexArg("ink", &rgb)) setInkPacked(rgb);
  if (hexArg("bg", &rgb)) setBgPacked(rgb);
  if (server().hasArg("tz")) {
    String z = server().arg("tz");
    z.trim();
    if (z.length() > 0 && z.length() < (int)TZ_BYTES && strcmp(z.c_str(), tz) != 0) {
      setTimezone(z.c_str());  // restarts NTP against the new zone
    }
  }
  saveConfig();
  sendState(200);
}

inline void handleConfig() { PFLoopSync::run([] { configOnLoop(); }); }

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;
  server().on("/clock", HTTP_GET, handleIndex);
  server().on("/clock/glyphs.bin", HTTP_GET, handleGlyphs);
  server().on("/api/clock", HTTP_GET, handleGet);
  server().on("/api/clock", HTTP_POST, handleConfig);
  initialized = true;
  // This line is the feature's marker in bundles/build.sh's binary scan.
  Serial.println("[CLOCK] /clock ready");
}

#else

inline void begin() {}

#endif

}  // namespace PatternflowClockHttp
