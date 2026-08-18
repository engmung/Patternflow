// ═══════════════════════════════════════════════════════════
// PatternFlow - Wi-Fi network manager over HTTP
//
//   GET    /wifi              management page
//   GET    /api/wifi          saved SSIDs + current connection (never passwords)
//   POST   /api/wifi          add or promote a network (ssid, pass)
//   DELETE /api/wifi?ssid=…   forget one
//
// Up to PatternflowWifi::MAX_NETWORKS are remembered, tried in order. Adding
// one here does the same thing Improv-Serial provisioning does, without needing
// a USB cable and a desktop browser — which is the point, since a device on a
// wall or at a venue is exactly where re-provisioning is awkward.
//
// Passwords go out over plain HTTP on the LAN and are never sent back. Same
// trust model as /update and /patterns.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"

#ifndef PF_WIFI_HTTP_ENABLED
#define PF_WIFI_HTTP_ENABLED 1
#endif

#if PF_WIFI_HTTP_ENABLED
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <WiFi.h>

#if PF_AUDIO_ENABLED
#include "core_audio_ws.h"
#endif
#include "core_send.h"
#include "core_wifi.h"
#include "wifi_index.h"
#endif

namespace PatternflowWifiHttp {

#if PF_WIFI_HTTP_ENABLED

#if PF_AUDIO_ENABLED
inline WebServer& server() { return PatternflowAudio::httpServer; }
#else
inline WebServer wifiServer(80);
inline WebServer& server() { return wifiServer; }
#endif

inline bool initialized = false;

inline void sendJson(int code, const String& body) {
  server().sendHeader("Cache-Control", "no-store");
  server().send(code, "application/json", body);
}

// Minimal JSON string escaping — an SSID may legitimately contain a quote or a
// backslash, and emitting it raw would produce a response the page cannot parse.
inline String jsonEscape(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (c == '\n') out += "\\n";
    else if (c == '\r') out += "\\r";
    else if (c == '\t') out += "\\t";
    else if ((uint8_t)c < 0x20) continue;
    else out += c;
  }
  return out;
}

inline void handleList() {
  bool up = WiFi.status() == WL_CONNECTED;
  String json = "{\"max\":";
  json += PatternflowWifi::MAX_NETWORKS;
  json += ",\"connected\":";
  json += up ? "true" : "false";
  json += ",\"current\":\"";
  json += up ? jsonEscape(WiFi.SSID()) : String("");
  json += "\",\"ip\":\"";
  json += up ? WiFi.localIP().toString() : String("");
  json += "\",\"status\":\"";
  json += PatternflowWifi::statusText();
  json += "\",\"networks\":[";
  for (int i = 0; i < PatternflowWifi::savedCount(); i++) {
    if (i) json += ',';
    json += "{\"ssid\":\"";
    json += jsonEscape(PatternflowWifi::savedSsid(i));
    json += "\"}";
  }
  json += "]}";
  sendJson(200, json);
}

inline void handleAdd() {
  if (!server().hasArg("ssid")) {
    sendJson(400, "{\"ok\":false,\"error\":\"missing ssid\"}");
    return;
  }
  String ssid = server().arg("ssid");
  String pass = server().hasArg("pass") ? server().arg("pass") : String("");
  if (ssid.length() == 0 || ssid.length() > 32) {
    sendJson(400, "{\"ok\":false,\"error\":\"ssid must be 1-32 characters\"}");
    return;
  }
  if (pass.length() > 63) {
    sendJson(400, "{\"ok\":false,\"error\":\"password too long\"}");
    return;
  }

  // Store only, by default. The usual reason to add a network from this page is
  // to pre-register somewhere the device is *going* — so switching to it now
  // would drop the very connection serving this request and lose the reply.
  // The stored network is tried on the next drop or reboot.
  //
  // connect=1 asks to move immediately, for someone who really means it.
  bool now = server().hasArg("connect") && server().arg("connect") == "1";
  if (!PatternflowWifi::addNetwork(ssid, pass)) {
    sendJson(400, "{\"ok\":false,\"error\":\"could not store network\"}");
    return;
  }
  Serial.printf("[WIFI-HTTP] saved \"%s\" (%d saved)%s\n", ssid.c_str(),
                PatternflowWifi::savedCount(), now ? " - switching now" : "");

  String body = "{\"ok\":true,\"ssid\":\"";
  body += jsonEscape(ssid);
  body += "\",\"saved\":";
  body += PatternflowWifi::savedCount();
  body += ",\"switching\":";
  body += now ? "true" : "false";
  body += "}";
  sendJson(200, body);

  // Reply first, then tear the link down, or the caller never hears back.
  if (now) PatternflowWifi::applyCredentials(ssid, pass);
}

inline void handleDelete() {
  if (!server().hasArg("ssid")) {
    sendJson(400, "{\"ok\":false,\"error\":\"missing ssid\"}");
    return;
  }
  String ssid = server().arg("ssid");
  if (!PatternflowWifi::removeNetwork(ssid)) {
    sendJson(404, "{\"ok\":false,\"error\":\"not saved\"}");
    return;
  }
  Serial.printf("[WIFI-HTTP] forgot \"%s\" (%d saved)\n", ssid.c_str(),
                PatternflowWifi::savedCount());
  sendJson(200, "{\"ok\":true}");
}

inline void handleIndex() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  PFSend::progmem(server(), WIFI_INDEX_HTML);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/wifi", HTTP_GET, handleIndex);
  server().on("/api/wifi", HTTP_GET, handleList);
  server().on("/api/wifi", HTTP_POST, handleAdd);
  server().on("/api/wifi", HTTP_DELETE, handleDelete);

#if !PF_AUDIO_ENABLED
  server().begin();
#endif

  initialized = true;
  Serial.printf("[WIFI-HTTP] Ready - http://%s.local/wifi\n", PF_OTA_HOSTNAME);
}

#else   // PF_WIFI_HTTP_ENABLED

inline void begin() {}

#endif  // PF_WIFI_HTTP_ENABLED

}  // namespace PatternflowWifiHttp
