// ═══════════════════════════════════════════════════════════
// PatternFlow - ArduinoOTA wireless flashing
//
// Wraps the standard ArduinoOTA library so the main sketch only has to
// call PatternflowOta::begin() in setup() and PatternflowOta::handle()
// in loop(). When PF_OTA_ENABLED is 0 every entry point compiles to a
// no-op and no Wi-Fi stack is pulled in for OTA.
//
// Wi-Fi connection is shared with OSC: if PatternflowOsc::begin() has
// already connected, OTA reuses that connection; otherwise OTA brings
// the Wi-Fi up itself with the same PF_WIFI_SSID/PASS macros. Either
// module can be enabled independently.
//
// Cost when idle: one non-blocking UDP poll per loop iteration on
// port 3232. Negligible compared to pattern render time. Cost during
// upload: the upload chunk receive runs synchronously inside handle(),
// so frame rate dips while flashing — flashing only takes a few
// seconds so this is invisible in practice.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"

#if PF_OTA_ENABLED
#include <WiFi.h>
#include <ArduinoOTA.h>
#endif

namespace PatternflowOta {

#if PF_OTA_ENABLED
inline bool initialized = false;
inline bool inProgress = false;
inline unsigned int progressPct = 0;
#endif

inline bool isCompiledIn() {
#if PF_OTA_ENABLED
  return true;
#else
  return false;
#endif
}

inline bool isInProgress() {
#if PF_OTA_ENABLED
  return inProgress;
#else
  return false;
#endif
}

inline unsigned int progressPercent() {
#if PF_OTA_ENABLED
  return progressPct;
#else
  return 0;
#endif
}

inline const char* hostname() {
  return PF_OTA_HOSTNAME;
}

inline void begin() {
#if PF_OTA_ENABLED
  // Reuse the OSC Wi-Fi if it's already up; otherwise bring it up here.
  // Idempotent — calling WiFi.begin twice with the same creds is a
  // no-op when already connected.
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OTA] Connecting Wi-Fi...");
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(PF_WIFI_SSID, PF_WIFI_PASS);

    uint32_t startMs = millis();
    while (WiFi.status() != WL_CONNECTED &&
           (millis() - startMs) < PF_WIFI_CONNECT_TIMEOUT_MS) {
      delay(100);
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OTA] Wi-Fi unavailable; OTA disabled this boot");
    return;
  }

  ArduinoOTA.setHostname(PF_OTA_HOSTNAME);

  // Empty string = no authentication. setPassword with an empty string
  // would still set an MD5 hash internally and confuse the handshake,
  // so we guard.
  if (PF_OTA_PASSWORD[0] != '\0') {
    ArduinoOTA.setPassword(PF_OTA_PASSWORD);
  }

  ArduinoOTA.onStart([]() {
    inProgress = true;
    progressPct = 0;
    const char* type = (ArduinoOTA.getCommand() == U_FLASH)
                       ? "sketch" : "filesystem";
    Serial.printf("[OTA] Upload started (%s)\n", type);
  });

  ArduinoOTA.onEnd([]() {
    inProgress = false;
    Serial.println("\n[OTA] Upload complete; device will reboot");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    if (total > 0) {
      unsigned int next = (progress * 100u) / total;
      if (next != progressPct) {
        progressPct = next;
        Serial.printf("[OTA] %u%%\r", progressPct);
      }
    }
  });

  ArduinoOTA.onError([](ota_error_t error) {
    inProgress = false;
    const char* reason = "unknown";
    switch (error) {
      case OTA_AUTH_ERROR:    reason = "auth";    break;
      case OTA_BEGIN_ERROR:   reason = "begin";   break;
      case OTA_CONNECT_ERROR: reason = "connect"; break;
      case OTA_RECEIVE_ERROR: reason = "receive"; break;
      case OTA_END_ERROR:     reason = "end";     break;
    }
    Serial.printf("[OTA] Error: %s (%u)\n", reason, (unsigned)error);
  });

  ArduinoOTA.begin();
  initialized = true;

  bool authed = (PF_OTA_PASSWORD[0] != '\0');
  Serial.printf("[OTA] Ready — hostname \"%s.local\", IP %s, auth %s\n",
                PF_OTA_HOSTNAME, WiFi.localIP().toString().c_str(),
                authed ? "ON (see PF_OTA_PASSWORD)" : "OFF");
#endif
}

inline void handle() {
#if PF_OTA_ENABLED
  if (initialized && WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.handle();
  }
#endif
}

} // namespace PatternflowOta
