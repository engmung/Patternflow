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
#include <Preferences.h>
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

// Active credentials in use. Loaded from NVS (where Improv-Serial provisioning
// writes them, see core_improv.h) when present, otherwise the compile-time
// placeholders from net_config.h. Held in String so they outlive begin().
inline String activeSsid;
inline String activePass;
inline bool credsFromNvs = false;

// NVS namespace dedicated to provisioned Wi-Fi, kept separate from the app's
// "patternflow" prefs so the two handles never collide. Opened only for the
// duration of each read/write below.
constexpr const char* WIFI_NVS_NS = "pf_wifi";

// Pull stored credentials out of NVS, falling back to the compile-time
// placeholders when nothing has been provisioned yet.
inline void loadCredentials() {
  String ssid, pass;
  Preferences p;
  if (p.begin(WIFI_NVS_NS, /*readOnly=*/true)) {
    ssid = p.getString("ssid", "");
    pass = p.getString("pass", "");
    p.end();
  }
  if (ssid.length() > 0) {
    activeSsid = ssid;
    activePass = pass;
    credsFromNvs = true;
  } else {
    activeSsid = PF_WIFI_SSID;
    activePass = PF_WIFI_PASS;
    credsFromNvs = false;
  }
}

// Kick off the connection and return immediately.
inline void begin() {
  if (started) return;
  started = true;
  loadCredentials();
  WiFi.persistent(false);       // don't thrash NVS with creds every boot
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);         // lower latency for OSC/OTA/WS
  WiFi.setAutoReconnect(true);  // let the IDF re-join on transient drops
  WiFi.begin(activeSsid.c_str(), activePass.c_str());
  lastBeginMs = millis();
  Serial.printf("[WiFi] connecting to \"%s\" (%s creds, non-blocking)...\n",
                activeSsid.c_str(), credsFromNvs ? "provisioned" : "built-in");
}

// Store new credentials (handed over by Improv-Serial) and restart the join
// immediately so the next tick() reflects the new network. Persisted to NVS
// so they survive reboot and win over the built-in placeholders.
inline void applyCredentials(const String& ssid, const String& pass) {
  Preferences p;
  if (p.begin(WIFI_NVS_NS, /*readOnly=*/false)) {
    p.putString("ssid", ssid);
    p.putString("pass", pass);
    p.end();
  }
  activeSsid = ssid;
  activePass = pass;
  credsFromNvs = true;
  started = true;

  // Force a clean reconnect with the new creds (mirrors the retry path).
  connectedNow = false;
  justConnectedEdge = false;
  WiFi.disconnect();
  WiFi.begin(activeSsid.c_str(), activePass.c_str());
  lastBeginMs = millis();
  Serial.printf("[WiFi] applying provisioned creds for \"%s\"\n", ssid.c_str());
}

inline bool hasStoredCredentials() { return credsFromNvs; }
inline const String& currentSsid() { return activeSsid; }

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
    WiFi.begin(activeSsid.c_str(), activePass.c_str());
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
inline void applyCredentials(const String&, const String&) {}
inline bool hasStoredCredentials() { return false; }
inline const String& currentSsid() { static String s; return s; }
inline bool isConnected() { return false; }
inline bool consumeJustConnected() { return false; }
inline const char* statusText() { return "OFF"; }
inline String ipString() { return String("—"); }

#endif

} // namespace PatternflowWifi
