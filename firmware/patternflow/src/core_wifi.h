// Patternflow - shared Wi-Fi bring-up
//
// OSC, OTA, and the audio-react server all need the same STA connection.
// Each module used to call WiFi.mode()/WiFi.begin() on its own, so when
// OSC's connect attempt didn't finish inside the timeout, OTA would issue
// a *second* WiFi.begin() while the first was still in progress. The IDF
// rejects that with:
//
//   E wifi:sta is connecting, cannot set config
//
// and the half-started connection never completes. Routing every module
// through ensure() guarantees WiFi.begin() is issued exactly once; later
// callers just keep waiting on the same attempt.
//
// License: MIT
#pragma once

#include <Arduino.h>
#include "config.h"

#if PF_OSC_ENABLED || PF_OTA_ENABLED || PF_AUDIO_ENABLED
#define PF_WIFI_NEEDED 1
#include <WiFi.h>
#endif

namespace PatternflowWifi {

#ifdef PF_WIFI_NEEDED
inline bool connectStarted = false;

// Idempotent. Brings the STA up once and blocks until connected or the
// per-call timeout elapses. The first caller issues WiFi.begin(); any
// later caller skips begin() (avoiding "cannot set config") and simply
// waits for the same attempt to finish, which also extends the total
// connect window across modules.
inline bool ensure() {
  if (WiFi.status() == WL_CONNECTED) return true;

  if (!connectStarted) {
    connectStarted = true;
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(PF_WIFI_SSID, PF_WIFI_PASS);
  }

  uint32_t startMs = millis();
  while (WiFi.status() != WL_CONNECTED &&
         (millis() - startMs) < PF_WIFI_CONNECT_TIMEOUT_MS) {
    delay(100);
  }
  return WiFi.status() == WL_CONNECTED;
}
#else
inline bool ensure() { return false; }
#endif

} // namespace PatternflowWifi
