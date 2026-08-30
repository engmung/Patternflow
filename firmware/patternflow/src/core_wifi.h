// Patternflow - shared Wi-Fi bring-up (non-blocking + auto-reconnect)
//
// Everything network-side rides on one STA connection.
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

// One core switch, not a disjunction of feature flags. This used to read
// `#if PF_OSC_ENABLED || PF_OTA_ENABLED || PF_AUDIO_ENABLED || ...`, which
// was the core deciding whether the radio exists by enumerating features —
// and a stale enumeration at that: the console, MQTT and weather all need
// Wi-Fi and were never in the list. Whether this panel has a radio is the
// core's own question; PF_WIFI_ENABLED answers it in net_config.h.
#if PF_WIFI_ENABLED
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

// Last definitive failure (NO_SSID / AUTH_FAIL), latched for statusText().
// The retry loop bounces the raw WiFi.status() between a failure code and
// "idle/disconnected" every cycle, which reads as flickering text on the
// panel — latching keeps the label steady until the state truly changes.
inline wl_status_t latchedFailure = WL_IDLE_STATUS;

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

// Several networks can be remembered — home, studio, a friend's place, the
// venue — so moving the device does not mean re-provisioning it over USB.
//
// Stored as ssid0..ssidN / pass0..passN plus "count". Slot order is priority
// order: whatever connected (or was provisioned) most recently sits at 0.
constexpr int MAX_NETWORKS = 5;

inline String savedSsids[MAX_NETWORKS];
inline String savedPasses[MAX_NETWORKS];
inline int savedCountValue = 0;
// Which slot the next join attempt uses. tick() walks this forward so a boot
// in any remembered location eventually lands, without scanning.
inline int attemptIdx = 0;
// Which saved slot to try FIRST on power-up (0..count-1), set from /wifi and
// persisted. Slot order is recency, which is the right default and the wrong
// answer when a panel lives at a venue and was last provisioned at home: it
// then spends every boot failing on a network that is not there before it
// wraps around. This pins the starting point; the walk still covers the rest.
// Takes effect on the next boot — switching the live join would drop the
// session that asked for it.
inline int bootIdx = 0;

inline int savedCount() { return savedCountValue; }
inline const String& savedSsid(int i) { return savedSsids[i]; }

inline void clampBootIdx() {
  if (savedCountValue <= 0) {
    bootIdx = 0;
    return;
  }
  if (bootIdx < 0 || bootIdx >= savedCountValue) bootIdx = 0;
}

// The list reorders under the preference (addNetwork moves an entry to the
// front), so the slot the user picked has to be followed through the shuffle
// rather than left pointing at whatever lands in its index.
inline void adjustBootIdxOnInsertAtFront(int from) {
  if (from <= 0) return;
  if (bootIdx == from) bootIdx = 0;
  else if (bootIdx < from) bootIdx++;
  clampBootIdx();
}

inline void writeNetworks() {
  Preferences p;
  if (!p.begin(WIFI_NVS_NS, /*readOnly=*/false)) return;
  p.putInt("count", savedCountValue);
  char key[8];
  for (int i = 0; i < savedCountValue; i++) {
    snprintf(key, sizeof(key), "ssid%d", i);
    p.putString(key, savedSsids[i]);
    snprintf(key, sizeof(key), "pass%d", i);
    p.putString(key, savedPasses[i]);
  }
  p.putInt("bootIdx", bootIdx);
  // Keep the legacy single-slot keys pointing at the top network, so a
  // downgrade to an older firmware still finds a usable network.
  if (savedCountValue > 0) {
    p.putString("ssid", savedSsids[0]);
    p.putString("pass", savedPasses[0]);
  }
  p.end();
}

// Pull stored networks out of NVS, falling back to the compile-time
// placeholder when nothing has been provisioned yet.
inline void loadCredentials() {
  savedCountValue = 0;
  Preferences p;
  if (p.begin(WIFI_NVS_NS, /*readOnly=*/true)) {
    int count = p.getInt("count", -1);
    if (count >= 0) {
      char key[8];
      for (int i = 0; i < count && i < MAX_NETWORKS; i++) {
        snprintf(key, sizeof(key), "ssid%d", i);
        String ssid = p.getString(key, "");
        if (ssid.length() == 0) continue;
        // Heal duplicates the pre-fix aliasing bug wrote into NVS: the same
        // SSID twice reads as one network shown twice on /wifi, and makes
        // the retry walk burn slots re-trying a network that just failed.
        bool duplicate = false;
        for (int j = 0; j < savedCountValue; j++) {
          if (savedSsids[j] == ssid) { duplicate = true; break; }
        }
        if (duplicate) continue;
        snprintf(key, sizeof(key), "pass%d", i);
        savedSsids[savedCountValue] = ssid;
        savedPasses[savedCountValue] = p.getString(key, "");
        savedCountValue++;
      }
      bootIdx = p.getInt("bootIdx", 0);
    } else {
      // Migration: firmware before multi-network stored one ssid/pass pair.
      String ssid = p.getString("ssid", "");
      if (ssid.length() > 0) {
        savedSsids[0] = ssid;
        savedPasses[0] = p.getString("pass", "");
        savedCountValue = 1;
      }
    }
    p.end();
  }

  if (savedCountValue > 0) {
    if (p.begin(WIFI_NVS_NS, /*readOnly=*/true)) {
      int stored = p.getInt("count", -1);
      p.end();
      // Rewrite once when the layout changed on the way in: legacy
      // single-slot migration, or duplicate slots healed above.
      if (stored != savedCountValue) writeNetworks();
    }
    clampBootIdx();
    attemptIdx = bootIdx;
    activeSsid = savedSsids[bootIdx];
    activePass = savedPasses[bootIdx];
    credsFromNvs = true;
  } else {
    activeSsid = PF_WIFI_SSID;
    activePass = PF_WIFI_PASS;
    credsFromNvs = false;
  }
}

// Add a network, or move an already-known one to the front. Returns false only
// when the SSID is empty or the list is full of other networks.
inline bool addNetwork(const String& ssidRef, const String& passRef) {
  // Copy FIRST. The reconnect path calls this with savedSsids[i] /
  // savedPasses[i] themselves, and the shift loop below overwrites what
  // those references point at mid-move. That exact aliasing turned
  // [PatternflowLocal, wifiiii] into [PatternflowLocal, PatternflowLocal]
  // the moment the second network connected — deleting the network that
  // had just WORKED and duplicating the one that hadn't.
  const String ssid = ssidRef;
  const String pass = passRef;
  if (ssid.length() == 0) return false;

  int existing = -1;
  for (int i = 0; i < savedCountValue; i++) {
    if (savedSsids[i] == ssid) { existing = i; break; }
  }

  if (existing < 0 && savedCountValue >= MAX_NETWORKS) {
    // Full: drop the least recently used (last) entry to make room.
    existing = MAX_NETWORKS - 1;
    savedCountValue = MAX_NETWORKS - 1;
  }
  if (existing < 0 && savedCountValue > 0) {
    // Brand-new network goes in at the front, so everything shifts down one.
    bootIdx = min(bootIdx + 1, MAX_NETWORKS - 1);
  }

  int from = existing >= 0 ? existing : savedCountValue;
  if (from >= savedCountValue) savedCountValue = min(savedCountValue + 1, MAX_NETWORKS);
  for (int i = min(from, MAX_NETWORKS - 1); i > 0; i--) {
    savedSsids[i] = savedSsids[i - 1];
    savedPasses[i] = savedPasses[i - 1];
  }
  savedSsids[0] = ssid;
  savedPasses[0] = pass;
  if (existing >= 0) adjustBootIdxOnInsertAtFront(from);
  clampBootIdx();
  writeNetworks();
  return true;
}

// Forget one network by SSID. The device may be connected to it right now; the
// join is left alone so nobody loses their session mid-request, and the entry
// simply is not tried again after the next drop.
inline bool removeNetwork(const String& ssid) {
  for (int i = 0; i < savedCountValue; i++) {
    if (savedSsids[i] != ssid) continue;
    for (int j = i; j < savedCountValue - 1; j++) {
      savedSsids[j] = savedSsids[j + 1];
      savedPasses[j] = savedPasses[j + 1];
    }
    savedCountValue--;
    savedSsids[savedCountValue] = "";
    savedPasses[savedCountValue] = "";
    // Follow the preference through the gap the removal left.
    if (i < bootIdx) bootIdx--;
    else if (i == bootIdx) bootIdx = min(bootIdx, max(savedCountValue - 1, 0));
    clampBootIdx();
    if (attemptIdx >= savedCountValue) attemptIdx = bootIdx;
    writeNetworks();
    return true;
  }
  return false;
}

// Pick which saved slot the NEXT boot tries first. Deliberately does not
// reconnect: the request arrives over the very connection it would drop.
inline bool setBootIndex(int idx) {
  if (savedCountValue <= 0) return false;
  if (idx < 0 || idx >= savedCountValue) return false;
  bootIdx = idx;
  writeNetworks();
  return true;
}

inline int getBootIndex() {
  clampBootIdx();
  return bootIdx;
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

  // Cap transmit power (PF_WIFI_TX_POWER in net_config.h). Must come after
  // begin() — setTxPower() refuses while neither STA nor AP is started. The
  // cap lives in the driver, so the retry path's disconnect()/begin() cycle
  // keeps it; only a full driver stop would clear it. Logged as a readback
  // rather than the requested value because the IDF clamps to what the radio
  // can actually do, and an RF test wants the achieved number.
  if (WiFi.setTxPower(PF_WIFI_TX_POWER)) {
    Serial.printf("[WiFi] max TX power set — radio reports %.1f dBm\n",
                  WiFi.getTxPower() / 4.0f);
  } else {
    Serial.println("[WiFi] WARNING: TX power cap rejected; radio is at default");
  }

  Serial.printf("[WiFi] connecting to \"%s\" (%s creds, non-blocking)...\n",
                activeSsid.c_str(), credsFromNvs ? "provisioned" : "built-in");
}

// Store new credentials (handed over by Improv-Serial) and restart the join
// immediately so the next tick() reflects the new network. Persisted to NVS
// so they survive reboot and win over the built-in placeholders.
inline void applyCredentials(const String& ssid, const String& pass) {
  // Adds rather than replaces: provisioning at a second location keeps the
  // first one working, and this network becomes the one tried first.
  addNetwork(ssid, pass);
  attemptIdx = 0;
  activeSsid = ssid;
  activePass = pass;
  credsFromNvs = true;
  started = true;

  // Force a clean reconnect with the new creds (mirrors the retry path).
  connectedNow = false;
  justConnectedEdge = false;
  latchedFailure = WL_IDLE_STATUS;  // stale failure was for the old creds
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
      // Whatever just worked becomes the first thing tried next boot, so a
      // device that lives in one place stops cycling after the first join.
      if (attemptIdx > 0 && attemptIdx < savedCountValue) {
        addNetwork(savedSsids[attemptIdx], savedPasses[attemptIdx]);
        attemptIdx = 0;
      }
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

    // With more than one network remembered, each retry tries the next one.
    // A present network normally authenticates well inside one 5 s window, and
    // an absent one reports NO_SSID_AVAIL quickly, so cycling finds whichever
    // is in range. Deliberately no WiFi.scanNetworks() here: a scan allocates
    // internal RAM, and on this board that is the resource the web console is
    // already short of (see /status).
    if (savedCountValue > 1) {
      attemptIdx = (attemptIdx + 1) % savedCountValue;
      activeSsid = savedSsids[attemptIdx];
      activePass = savedPasses[attemptIdx];
    }

    WiFi.disconnect();  // clear any half-finished attempt (avoids the
                        // "sta is connecting, cannot set config" error)
    WiFi.begin(activeSsid.c_str(), activePass.c_str());
    if (savedCountValue > 1) {
      Serial.printf("[WiFi] retry connect (%d/%d: \"%s\")...\n", attemptIdx + 1,
                    savedCountValue, activeSsid.c_str());
    } else {
      Serial.println("[WiFi] retry connect...");
    }
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

// Short status word for the on-device info screen. Failure labels stay
// latched across retry cycles (see latchedFailure above).
inline const char* statusText() {
  wl_status_t s = WiFi.status();
  if (s == WL_CONNECTED) {
    latchedFailure = WL_IDLE_STATUS;
    return "CONNECTED";
  }
  if (s == WL_NO_SSID_AVAIL || s == WL_CONNECT_FAILED) latchedFailure = s;
  switch (latchedFailure) {
    case WL_NO_SSID_AVAIL:  return "NO SSID";
    case WL_CONNECT_FAILED: return "AUTH FAIL";
    default:                return "CONNECTING";
  }
}

// ASCII only: the GFX default font renders each byte of a multi-byte
// UTF-8 char (like an em dash) as its own garbage glyph.
inline String ipString() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return String("-");
}

#else  // !PF_WIFI_NEEDED — all network features compiled out

inline void begin() {}
inline void tick() {}
inline void applyCredentials(const String&, const String&) {}
inline bool hasStoredCredentials() { return false; }
inline const String& currentSsid() { static String s; return s; }
inline int savedCount() { return 0; }
inline const String& savedSsid(int) { static String s; return s; }
inline bool addNetwork(const String&, const String&) { return false; }
inline bool removeNetwork(const String&) { return false; }
inline bool setBootIndex(int) { return false; }
inline int getBootIndex() { return 0; }
inline bool isConnected() { return false; }
inline bool consumeJustConnected() { return false; }
inline const char* statusText() { return "OFF"; }
inline String ipString() { return String("-"); }

#endif

} // namespace PatternflowWifi
