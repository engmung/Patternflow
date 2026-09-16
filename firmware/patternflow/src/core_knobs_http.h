// ═══════════════════════════════════════════════════════════
// PatternFlow - Knob settings over HTTP
//
// Which way each encoder counts, and how many edges make one click. These
// are properties of the part soldered in, not of the firmware: some
// encoders count the other way round, some give two edges per detent
// instead of four, and a builder who got either should not have to rebuild.
// The compile-time INVERT_ENCODER in config.h stays as the default; what a
// person sets here overrides it per knob and persists (core_encoders.h).
//
// Routes (on the shared console server):
//   GET  /knobs        the page
//   GET  /api/knobs    {"ok":true,"inv":[..],"sub":[..],"clicks":[..],"raw":[..]}
//   POST /api/knobs    form fields invN=0|1 and subN=4|2|1 (N = 0..3), or
//                      inv= / sub= for all four; any subset. Answers as GET.
//
// Changes are applied at a frame boundary (PFLoopSync): the handler runs on
// the network core and the frame is reading the same counters.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <WiFi.h>

#include "core_http.h"
#include "core_send.h"
#include "core_loop_sync.h"
#include "core_encoders.h"
#include "core_patterns_http.h"   // noteConsolePageOpened - the console's activity clock
#include "knobs_index.h"

namespace PatternflowKnobsHttp {

inline WebServer& server() { return PatternflowHttp::server(); }
inline bool initialized = false;

inline void sendJson(int code, const String& body) {
  server().sendHeader("Cache-Control", "no-store");
  server().send(code, "application/json", body);
}

inline String settingsJson() {
  String json = "{\"ok\":true,\"inv\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += knobInvert[i] ? "true" : "false"; }
  json += "],\"sub\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += knobSubSteps[i]; }
  json += "],\"clicks\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += (long)getClicks(i); }
  json += "],\"raw\":[";
  for (int i = 0; i < 4; i++) { if (i) json += ','; json += (long)encPos[i]; }
  json += "]}";
  return json;
}

inline void handleGet() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  sendJson(200, settingsJson());
}

inline bool truthy(const String& v) { return v == "1" || v == "true" || v == "on"; }

inline void handlePost() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  bool inv[4], changed[4] = {false, false, false, false};
  int sub[4];
  bool any = false;
  for (int i = 0; i < 4; i++) {
    inv[i] = knobInvert[i];
    sub[i] = knobSubSteps[i];
    char key[6];
    snprintf(key, sizeof(key), "inv%d", i);
    if (server().hasArg(key)) { inv[i] = truthy(server().arg(key)); changed[i] = true; }
    else if (server().hasArg("inv")) { inv[i] = truthy(server().arg("inv")); changed[i] = true; }
    snprintf(key, sizeof(key), "sub%d", i);
    if (server().hasArg(key)) { sub[i] = (int)server().arg(key).toInt(); changed[i] = true; }
    else if (server().hasArg("sub")) { sub[i] = (int)server().arg("sub").toInt(); changed[i] = true; }
    if (changed[i] && clampSubSteps(sub[i]) != sub[i]) {
      sendJson(400, "{\"ok\":false,\"error\":\"sub must be 4, 2 or 1\"}");
      return;
    }
    any = any || changed[i];
  }
  if (!any) {
    sendJson(400, "{\"ok\":false,\"error\":\"nothing to set: invN, subN, inv or sub\"}");
    return;
  }
  // On the frame task: the rebase reads the counters the frame is reading.
  PFLoopSync::run([&] {
    for (int i = 0; i < 4; i++) {
      if (changed[i]) setKnobSettings(i, inv[i], sub[i]);
    }
  });
  if (!saveKnobSettings()) {
    sendJson(500, "{\"ok\":false,\"error\":\"applied, but could not save to NVS\"}");
    return;
  }
  Serial.printf("[KNOBS] set inv=%d%d%d%d sub=%d,%d,%d,%d\n",
                knobInvert[0], knobInvert[1], knobInvert[2], knobInvert[3],
                knobSubSteps[0], knobSubSteps[1], knobSubSteps[2], knobSubSteps[3]);
  sendJson(200, settingsJson());
}

inline void handleIndex() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  PFSend::gz(server(), KNOBS_INDEX_HTML_GZ, KNOBS_INDEX_HTML_GZ_LEN);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;
  server().on("/knobs", HTTP_GET, handleIndex);
  server().on("/api/knobs", HTTP_GET, handleGet);
  server().on("/api/knobs", HTTP_POST, handlePost);
  PatternflowHttp::begin();  // idempotent; whoever is first starts it
  initialized = true;
  Serial.println("[KNOBS] Ready - http://patternflow.local/knobs");
}

}  // namespace PatternflowKnobsHttp
