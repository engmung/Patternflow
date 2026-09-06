// ═══════════════════════════════════════════════════════════
// PatternFlow - the console home page ("/")
//
// The device's front door: what someone sees when they type the panel's
// address. It lived in core_audio_ws.h because that file owned the web
// server; the page itself was never about audio, and deleting audio would
// have taken the home page with it.
//
// Nothing here but the route. The page is home_index.h, the server is
// core_http.h, and the install-in-progress interstitial is the same one
// every console page shows.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_http.h"
#include "core_patterns_http.h"
#include "core_send.h"
#include "home_index.h"

namespace PatternflowHomeHttp {

inline bool initialized = false;

inline void handleRoot() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  // Served from the gzip array generated right after the literal in
  // home_index.h — every page header carries a NAME_GZ / NAME_GZ_LEN pair
  // (same for the other console pages). The raw literal stays in the header:
  // it is what the console tooling diffs against console/*.html and what a
  // person reads. Nothing references it any more, so the linker leaves it
  // out of the image.
  PFSend::gz(PatternflowHttp::server(), HOME_INDEX_HTML_GZ, HOME_INDEX_HTML_GZ_LEN);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;
  PatternflowHttp::server().on("/", handleRoot);
  PatternflowHttp::begin();  // idempotent; whoever is first starts it
  initialized = true;
}

}  // namespace PatternflowHomeHttp
