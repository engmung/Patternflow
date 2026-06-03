// Patternflow - shared Wi-Fi bring-up (non-blocking + auto-reconnect)
//
// OSC, OTA, and the audio-react server all ride on one STA connection.
// This module owns it so there is exactly one WiFi.begin() in flight and
// one place that handles dropouts.
//
//   begin()  — kicks off the join and returns immediately. Boot never
//              blocks; patterns render right away.
//   tick()   — called every loop. Detects the 0->1 connect edge (so the
//              caller can start network services once connected) and,
//              while disconnected, retries on a fixed interval. esp_wifi's
//              own auto-reconnect is also enabled, so most transient drops
//              recover without us; the explicit retry covers the cases it
//              gives up on (initial join failed, AP rebooted, ...).
//
// Replaces the old blocking connect that froze setup() for up to 8 s and
// never recovered once a join failed.
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

// How often to re-issue WiFi.begin() while disconnected (from net_config.h).
// Long enough to let a join attempt finish before we kick it again.
constexpr uint32_t RETRY_INTERVAL_MS = PF_WIFI_RETRY_INTERVAL_MS;

inline bool started = false;
inline bool connectedNow = false;
inline bool justConnectedEdge = false;
inline uint32_t lastBeginMs = 0;

// Kick off the connection and return immediately.
inline void begin() {
  if (started) return;
  started = true;
  WiFi.persistent(false);       // don't thrash NVS with creds every boot
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);         // lower latency for OSC/OTA/WS
  WiFi.setAutoReconnect(true);  // let the IDF re-join on transient drops
  WiFi.begin(PF_WIFI_SSID, PF_WIFI_PASS);
  lastBeginMs = millis();
  Serial.println("[WiFi] connecting (non-blocking)...");
}

// Call once per loop. Maintains the connection and exposes a one-shot
// "just connected" edge via consumeJustConnected().
inline void tick() {
  bool connected = (WiFi.status() == WL_CONNECTED);

  if (connected) {
    if (!connectedNow) {
      connectedNow = true;
      justConnectedEdge = true;
      Serial.printf("[WiFi] connected — IP %s\n",
                    WiFi.localIP().toString().c_str());
    }
    return;
  }

  // Disconnected (or never joined).
  if (connectedNow) {
    connectedNow = false;
    Serial.println("[WiFi] connection lost; retrying...");
    lastBeginMs = 0;  // retry promptly on a fresh drop
  }

  uint32_t now = millis();
  if (now - lastBeginMs >= RETRY_INTERVAL_MS) {
    lastBeginMs = now;
    WiFi.disconnect();  // clear any half-finished attempt (avoids the
                        // "sta is connecting, cannot set config" error)
    WiFi.begin(PF_WIFI_SSID, PF_WIFI_PASS);
    Serial.println("[WiFi] retry connect...");
  }
}

inline bool isConnected() {
  return WiFi.status() == WL_CONNECTED;
}

// True exactly once after each successful (re)connection. The caller uses
// this to (re)start network services.
inline bool consumeJustConnected() {
  bool e = justConnectedEdge;
  justConnectedEdge = false;
  return e;
}

// Short status word for the on-device info screen.
inline const char* statusText() {
  switch (WiFi.status()) {
    case WL_CONNECTED:      return "CONNECTED";
    case WL_NO_SSID_AVAIL:  return "NO SSID";
    case WL_CONNECT_FAILED: return "AUTH FAIL";
    default:                return "CONNECTING";
  }
}

inline String ipString() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return String("—");
}

#else  // !PF_WIFI_NEEDED — all network features compiled out

inline void begin() {}
inline void tick() {}
inline bool isConnected() { return false; }
inline bool consumeJustConnected() { return false; }
inline const char* statusText() { return "OFF"; }
inline String ipString() { return String("—"); }

#endif

} // namespace PatternflowWifi
