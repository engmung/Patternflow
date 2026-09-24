// ═══════════════════════════════════════════════════════════
// PatternFlow - the console web server, owned by nobody in particular
//
// One WebServer serves every console page and every /api/* route. It used
// to live inside core_audio_ws.h, for the historical reason that audio was
// the first feature that needed a web server — so every other page rode on
// `PatternflowAudio::httpServer`, and each one carried an
// `#if PF_AUDIO_ENABLED` fork to own a fallback server when audio was
// compiled out. That made a feature file the owner of shared ground:
// removing audio removed the console.
//
// The server lives here instead. It belongs to the core the way the panel
// and the encoders do, and features — including audio — attach to it.
//
// Ownership only. Route registration stays with whoever owns the route
// (core_patterns_http.h registers /patterns, and so on), and the shared
// console chrome at /pf-console.js is registered here because it belongs
// to no single page — as is the list of request headers the server keeps.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall
#include "core_send.h"
#include "theme_index.h"

namespace PatternflowHttp {

// Port 80. PF_AUDIO_HTTP_PORT named the same port and remains as the audio
// module's own alias; nothing else should have to know about it.
constexpr uint16_t HTTP_PORT = 80;

inline WebServer httpServer(HTTP_PORT);
inline WebServer& server() { return httpServer; }

inline bool started = false;

// Registered once, by the first begin() that runs — the console chrome is
// not any one page's property.
inline bool chromeRegistered = false;

inline void registerChrome() {
  if (chromeRegistered) return;
  chromeRegistered = true;
  // Shared console chrome + light theme, loaded by every page's <head> as
  // /pf-console.js?h=<its CRC>. Kept for a year under that URL; a firmware
  // with different chrome stamps a different h into its pages (core_send.h).
  httpServer.on("/pf-console.js", []() {
    PFSend::gz(httpServer, PF_CONSOLE_JS_GZ, PF_CONSOLE_JS_GZ_LEN,
               "application/javascript", PFSend::STAMPED);
  });
  // The chrome gives every page an inline icon. This answers the requests
  // that come anyway (a tab open on /api/status, a page whose chrome did not
  // load) once, where a 404 would be asked again on every visit. Only on a
  // Host that can only be the panel: on the hotspot, a site the phone tried
  // to reach asks for its icon here too.
  httpServer.on("/favicon.ico", []() { PFSend::noContent(httpServer); });
  httpServer.onNotFound([]() {
    httpServer.sendHeader("Cache-Control", PFSend::CC_NO_STORE);
    httpServer.send(404, "text/plain", "Not found");
  });
}

// Idempotent: every feature's begin() calls this, the first one wins.
inline void begin() {
  if (started) return;
  // The request headers a handler can read. collectHeaders() REPLACES the
  // server's list rather than adding to it, so this is the one call and the
  // whole set: X-PF-Name / X-PF-Last carry a pattern upload's filename and
  // batch end (core_patterns_http.h), If-None-Match lets PFSend::gz answer
  // 304. check_send.py fails if anything else calls it. Before
  // httpServer.begin(), whose close() installs an empty list when none is set.
  static const char* headerKeys[] = {"X-PF-Name", "X-PF-Last", "If-None-Match"};
  httpServer.collectHeaders(headerKeys, sizeof(headerKeys) / sizeof(headerKeys[0]));
  registerChrome();
  httpServer.begin();
  started = true;
  Serial.printf("[HTTP] console on http://%s/\n",
                WiFi.localIP().toString().c_str());
}

inline void handle() {
  if (started) httpServer.handleClient();
}

}  // namespace PatternflowHttp
