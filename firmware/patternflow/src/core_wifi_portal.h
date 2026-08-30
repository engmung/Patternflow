// ═══════════════════════════════════════════════════════════
// Patternflow — Wi-Fi setup portal (SoftAP fallback)
//
// When the device cannot join any network, it becomes one. A phone that
// connects to the "Patternflow-Setup-XXXX" access point gets captive-portal
// routed to the /wifi page, saves a network there, and the device joins it
// and closes the portal. No USB cable, no desktop, no app.
//
// This exists because of a real bricking: a clean public image (which
// rightly carries nobody's Wi-Fi password) was installed onto a board whose
// credentials lived only inside the previous firmware, and the board fell
// off the network with no wireless way back. The /wifi page could have
// fixed it — but every HTTP service only starts on the connect edge, which
// never comes. The portal is that page, made reachable from zero.
//
// Two ways in, both handled in tick():
//   · hopeless — nothing provisioned in NVS and the built-in SSID is the
//     "YOUR_WIFI_SSID" placeholder (a public image on a fresh board).
//     Nothing can ever connect; the portal opens a few seconds after boot,
//     and the pointless placeholder retry loop is suppressed so it stops
//     hiccuping the AP.
//   · timed — real credentials that keep failing (password changed, panel
//     moved to a new home, router gone). The portal opens after
//     PF_WIFI_PORTAL_AFTER_MS in AP+STA mode and the normal retry walk
//     keeps running: if the old network comes back, the device joins it
//     and the portal folds up on its own.
//
// Closing mirrors opening: once STA connects (portal save, USB Improv, or
// the old network reappearing), the AP lingers for a short grace period so
// the phone still gets its "saved — joining" reply, then shuts down and the
// radio returns to plain STA. If Wi-Fi later drops for good, the timer
// starts over and the portal comes back.
//
// The AP is open (no password) like every setup AP of this kind: the
// credentials it collects travel over it in plain HTTP. Same trust model as
// WLED/Tasmota first-run setup, and the window only exists while the device
// has no network at all.
//
// The AP name ends in four hex digits of the chip MAC so two unprovisioned
// panels in one room are two distinct networks.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"
#include "core_wifi.h"

#if PF_WIFI_ENABLED && PF_WIFI_PORTAL_ENABLED
#include <WiFi.h>
#include <DNSServer.h>
#include "core_http.h"
#include "core_wifi_http.h"
#endif

namespace PatternflowWifiPortal {

#if PF_WIFI_ENABLED && PF_WIFI_PORTAL_ENABLED

// A board that can never connect should not sit dark for the full timed
// window — placeholder creds are decidable at boot, so the portal opens
// almost immediately. The few seconds keep boot logs readable and give the
// browser-flasher's Improv provisioning (which runs over USB right after
// flashing) a head start on the common first-run path.
constexpr uint32_t HOPELESS_AFTER_MS = 4000;

// How long the AP stays up after STA connects. The phone that just saved a
// network is still on the AP and polling /api/wifi for the verdict; tearing
// down instantly would eat the "saved — joining" it is waiting to render.
constexpr uint32_t CLOSE_GRACE_MS = 20000;

inline DNSServer dnsServer;
inline bool apUp = false;
inline bool notFoundInstalled = false;
inline bool graceArmed = false;
inline uint32_t graceStartMs = 0;
inline uint32_t lastUpMs = 0;
inline char apName[33] = {0};

// A public image on a never-provisioned board: no saved networks, and the
// compile-time fallback is the placeholder every published binary carries
// (build.sh refuses to publish an image without it). Joining can never
// succeed, so there is nothing to wait for.
inline bool hopeless() {
  return PatternflowWifi::savedCount() == 0 &&
         strcmp(PF_WIFI_SSID, "YOUR_WIFI_SSID") == 0;
}

inline void open() {
  apUp = true;
  graceArmed = false;

  // Last two MAC octets — stable per board, distinct per bench.
  const uint16_t suffix = (uint16_t)(ESP.getEfuseMac() >> 32);
  snprintf(apName, sizeof(apName), "%s-%04X", PF_WIFI_PORTAL_NAME, suffix);

  if (hopeless()) {
    // The retry loop would re-begin() the placeholder every few seconds
    // forever; each cycle pokes the radio and stutters the AP for whoever
    // is mid-setup on it. Nothing is lost by stopping: applyCredentials()
    // lifts the suppression the moment real creds arrive.
    PatternflowWifi::retrySuppressed = true;
    WiFi.mode(WIFI_AP);
  } else {
    WiFi.mode(WIFI_AP_STA);
  }
  WiFi.softAP(apName);  // open AP, default 192.168.4.1

  // Every DNS name resolves to us, which is what makes phones pop their
  // "sign in to network" sheet instead of showing a dead spinner.
  dnsServer.start(53, "*", WiFi.softAPIP());

  // The /wifi page and its API, on the core server, without waiting for the
  // connect edge that will never come while we are needed.
  PatternflowWifiHttp::registerRoutes();
  PatternflowHttp::begin();

  // Captive catch-all, installed once and portal-aware forever after: any
  // URL we do not serve (a phone's connectivity probe, the unregistered
  // home page) redirects into the setup page while the portal is up, and
  // falls back to the stock 404 once it is not. Location must be absolute —
  // captive mini-browsers do not resolve relative redirects reliably.
  if (!notFoundInstalled) {
    notFoundInstalled = true;
    PatternflowHttp::server().onNotFound([]() {
      WebServer& sv = PatternflowHttp::server();
      if (apUp) {
        sv.sendHeader("Location",
                      String("http://") + WiFi.softAPIP().toString() + "/wifi",
                      true);
        sv.send(302, "text/plain", "");
      } else {
        sv.send(404, "text/plain", "Not found");
      }
    });
  }

  PatternflowWifi::portalOpen = true;  // NETWORK screen: "SETUP AP" + AP IP
  Serial.printf("[PORTAL] setup AP \"%s\" up — http://%s/wifi (%s)\n", apName,
                WiFi.softAPIP().toString().c_str(),
                hopeless() ? "nothing provisioned" : "join keeps failing");
}

inline void close() {
  dnsServer.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  apUp = false;
  graceArmed = false;
  PatternflowWifi::portalOpen = false;
  Serial.println("[PORTAL] connected — setup AP closed");
}

// Call once per loop, right after PatternflowWifi::tick().
inline void tick() {
  const uint32_t now = millis();
  const bool up = PatternflowWifi::isConnected();

  if (!apUp) {
    if (up) {
      lastUpMs = now;
      return;
    }
    const uint32_t due = hopeless() ? HOPELESS_AFTER_MS
                                    : (uint32_t)PF_WIFI_PORTAL_AFTER_MS;
    if (now - lastUpMs >= due) open();
    return;
  }

  dnsServer.processNextRequest();

  if (up) {
    if (!graceArmed) {
      graceArmed = true;
      graceStartMs = now;
    } else if (now - graceStartMs >= CLOSE_GRACE_MS) {
      close();
      lastUpMs = now;
    }
  } else {
    graceArmed = false;  // the join flickered; keep the portal up
  }
}

#else  // portal compiled out

inline void tick() {}

#endif

}  // namespace PatternflowWifiPortal
