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
inline bool servicesUp = false;
inline bool notFoundInstalled = false;
inline bool graceArmed = false;
inline uint32_t apStartMs = 0;
inline uint32_t graceStartMs = 0;
inline uint32_t lastUpMs = 0;
inline char apName[33] = {0};

// softAP() returns before the AP interface actually exists — the netif comes
// up on the Wi-Fi task, an event later. A DNS socket opened in that gap binds
// into nothing and then FAILS EVERY REPLY forever ("could not send data: 12"
// once per query, measured on hardware): the phone joins, its captive probe
// queries arrive, and no answer ever leaves, so no sign-in sheet. One beat of
// patience before opening sockets is the whole fix.
constexpr uint32_t AP_SETTLE_MS = 700;

// A public image on a never-provisioned board: no saved networks, and the
// compile-time fallback is the placeholder every published binary carries
// (build.sh refuses to publish an image without it). Joining can never
// succeed, so there is nothing to wait for.
inline bool hopeless() {
  return PatternflowWifi::savedCount() == 0 &&
         strcmp(PF_WIFI_SSID, "YOUR_WIFI_SSID") == 0;
}

// The page the portal actually lands people on. Not the full /wifi manager:
// that page delivers fine over the AP (serial said so, twice per attempt)
// and still came up white inside a Samsung captive webview — so the portal
// page carries NOTHING a webview can choke on. No script, no external
// fetch, no theme chrome; one form, plain POST, ~1.5 KB. The /wifi manager
// stays reachable for later, from a real browser on a real network.
inline const char SETUP_HTML[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow setup</title>
<style>body{background:#0C0B09;color:#EDE7DB;font:16px/1.6 system-ui,sans-serif;
margin:0;padding:32px 22px}h1{font-size:18px;margin:0 0 4px}
p{color:#8A8272;font-size:13px;margin:6px 0 20px}
label{display:block;font-size:13px;color:#8A8272;margin:16px 0 5px}
input{width:100%;box-sizing:border-box;font:inherit;padding:11px;
background:#131110;color:#EDE7DB;border:1px solid #242118;border-radius:4px}
button{margin-top:22px;width:100%;font:inherit;padding:13px;background:#EDE7DB;
color:#0C0B09;border:0;border-radius:4px;font-weight:600}</style></head><body>
<h1>Patternflow</h1>
<p>Tell this panel your Wi-Fi. It joins, and this setup network closes itself.</p>
<form method="POST" action="/setup">
<label>Network name (SSID)</label>
<input name="ssid" maxlength="32" required autocomplete="off" autocapitalize="off">
<label>Password</label>
<input name="pass" type="password" maxlength="63" autocomplete="off">
<button>Save &amp; connect</button></form></body></html>)HTML";

inline void handleSetupPage() {
  Serial.println("[PORTAL] serving /setup");
  PatternflowHttp::server().sendHeader("Cache-Control", "no-store");
  PatternflowHttp::server().send_P(200, "text/html", SETUP_HTML);
}

inline void handleSetupSave() {
  WebServer& sv = PatternflowHttp::server();
  const String ssid = sv.arg("ssid");
  const String pass = sv.arg("pass");
  if (ssid.length() == 0 || ssid.length() > 32 || pass.length() > 63) {
    sv.send(400, "text/html",
            F("<!doctype html><meta charset=utf-8><body style='background:#0C0B09;"
              "color:#EDE7DB;font:16px system-ui;padding:32px 22px'>"
              "That name did not fit (1-32 chars). Go back and retry."));
    return;
  }
  Serial.printf("[PORTAL] /setup save \"%s\"\n", ssid.c_str());
  String body =
      F("<!doctype html><html><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Patternflow setup</title></head>"
        "<body style=\"background:#0C0B09;color:#EDE7DB;font:16px/1.6 system-ui;"
        "padding:32px 22px\"><h1 style=\"font-size:18px\">Saved</h1>"
        "<p style=\"color:#8A8272;font-size:14px\">The panel is joining \"");
  body += ssid;
  body += F("\" now. Its NETWORK screen (hold K2) shows the new address; this "
            "setup network disappears once it connects. You can close this.</p>"
            "</body></html>");
  sv.sendHeader("Cache-Control", "no-store");
  sv.send(200, "text/html", body);
  // Reply first, join after — applyCredentials tears radio state around,
  // and the phone deserves to hear "saved" before the ground moves.
  PatternflowWifi::applyCredentials(ssid, pass);
}

inline void open() {
  apUp = true;
  servicesUp = false;
  graceArmed = false;

  // Last two MAC octets — stable per board, distinct per bench.
  const uint16_t suffix = (uint16_t)(ESP.getEfuseMac() >> 32);
  snprintf(apName, sizeof(apName), "%s-%04X", PF_WIFI_PORTAL_NAME, suffix);

  if (hopeless()) {
    // The retry loop would re-begin() the placeholder every few seconds
    // forever; each cycle pokes the radio and stutters the AP for whoever
    // is mid-setup on it. Nothing is lost by stopping: applyCredentials()
    // lifts the suppression the moment real creds arrive. disconnect(true)
    // also cancels the join attempt already in flight — mode(WIFI_AP) on
    // top of a mid-join STA leaves the supplicant wedged half-scanning.
    PatternflowWifi::retrySuppressed = true;
    WiFi.disconnect(true);
    WiFi.mode(WIFI_AP);
  } else {
    WiFi.mode(WIFI_AP_STA);
  }
  // NOT 192.168.4.1. Samsung phones connect, probe, and then never raise
  // their sign-in sheet when the portal answers from a private IP range —
  // "connected, no internet", and that is the end of it (measured here on
  // a Galaxy through seven fruitless rounds, and documented across seven
  // years in tonyp7/esp32-wifi-manager#57). An address that LOOKS public
  // makes the same phones raise the sheet; 200.200.200.1 is the value with
  // multi-device confirmations there (Samsung, iPhone, Motorola). The
  // range belongs to someone on the real internet, which does not matter
  // here: clients of this AP have no internet, and the lease lasts only
  // until the panel joins a network. Everything downstream — DNS answers,
  // redirect targets, the NETWORK screen — reads WiFi.softAPIP(), so this
  // one line is the whole change.
  WiFi.softAPConfig(IPAddress(200, 200, 200, 1), IPAddress(200, 200, 200, 1),
                    IPAddress(255, 255, 255, 0));
  WiFi.softAP(apName);  // open AP
  apStartMs = millis();

  PatternflowWifi::portalOpen = true;  // NETWORK screen: "SETUP AP" + AP IP
  Serial.printf("[PORTAL] setup AP \"%s\" opening (%s)\n", apName,
                hopeless() ? "nothing provisioned" : "join keeps failing");
  // Sockets wait for AP_SETTLE_MS — see startServices().
}

// The half of bring-up that opens sockets, run one settle-beat after
// softAP() so the AP netif exists underneath them.
inline void startServices() {
  servicesUp = true;

  // Every DNS name resolves to us, which is what makes phones pop their
  // "sign in to network" sheet instead of showing a dead spinner.
  dnsServer.start(53, "*", WiFi.softAPIP());

  // The /wifi page and its API, on the core server, without waiting for the
  // connect edge that will never come while we are needed — plus the
  // script-free /setup form above, which is where the redirect lands.
  PatternflowWifiHttp::registerRoutes();
  PatternflowHttp::server().on("/setup", HTTP_GET, handleSetupPage);
  PatternflowHttp::server().on("/setup", HTTP_POST, handleSetupSave);
  PatternflowHttp::begin();

  // Android's connectivity probes deliberately fall through to the wildcard
  // 302 below: the redirect is what raises the phone's sign-in sheet, and
  // on the Samsung this was debugged against, that sheet is the ONLY
  // rendering surface that reliably reaches this AP - the visible browser
  // never arrives (typed addresses get silently upgraded to https, which a
  // device without TLS cannot answer). One experiment here answered the
  // probe 204 ("internet is fine") to stop the phone from drifting home to
  // its saved network - it did stop the drift, and it also removed the
  // sheet, leaving no window at all. Keep the sheet; it must land on a page
  // this webview can actually draw (the script-free /setup above - the full
  // /wifi page delivered twice per attempt and still rendered white there).

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
                      String("http://") + WiFi.softAPIP().toString() + "/setup",
                      true);
        sv.send(302, "text/plain", "");
      } else {
        sv.send(404, "text/plain", "Not found");
      }
    });
  }

  Serial.printf("[PORTAL] setup AP \"%s\" up — http://%s/wifi\n", apName,
                WiFi.softAPIP().toString().c_str());
}

inline void close() {
  if (servicesUp) dnsServer.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  apUp = false;
  servicesUp = false;
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

  if (!servicesUp) {
    if (now - apStartMs < AP_SETTLE_MS) return;
    startServices();
  }

  // The DNS socket goes quietly bad after minutes of AP life - replies start
  // failing ENOMEM ("could not send data: 12"), observed on hardware ~5 min
  // in, likely replies queued toward a client that left without ARP. A
  // periodic re-open is a one-packet blip and keeps the resolver honest for
  // however long someone leaves the portal waiting.
  static uint32_t dnsCycleMs = 0;
  if (now - dnsCycleMs >= 120000) {
    dnsCycleMs = now;
    dnsServer.stop();
    dnsServer.start(53, "*", WiFi.softAPIP());
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
