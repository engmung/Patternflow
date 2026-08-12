// ═══════════════════════════════════════════════════════════
// PatternFlow - MQTT role page (/mqtt)
//
//   GET  /mqtt        role picker + live connection state
//   GET  /api/mqtt    status JSON
//   POST /api/mqtt    role=off|publisher|subscriber   (persisted in NVS)
//
// The broker itself is compile-time (patternflow_secrets.h): this page only
// chooses what the device DOES with it. Credentials are never sent to the
// browser — the JSON reports the host and user so you can confirm which
// broker is configured, and nothing else.
//
// Rides the patterns manager's WebServer, the same way core_display_http.h
// rides the status one, so the device still runs a single server on port 80.
//
// From Simone Majocchi's (@SimonePDA) Patternflow fork — see core_mqtt.h.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"
// Pulled in BEFORE the gate below, not inside it: PF_PATTERNS_HTTP_ENABLED is
// defined by that header rather than by net_config.h, so testing it first
// would read an undefined macro as 0 and silently drop this whole page.
#include "core_patterns_http.h"  // shared WebServer + console-wake helpers

#ifndef PF_MQTT_HTTP_ENABLED
#define PF_MQTT_HTTP_ENABLED PF_MQTT_ENABLED
#endif

// No patterns manager means no server to ride and no console-wake helpers,
// so the page cannot exist on its own.
#if PF_MQTT_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include "core_mqtt.h"
#include "mqtt_index.h"
#endif

namespace PatternflowMqttHttp {

#if PF_MQTT_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED

inline WebServer& server() { return PatternflowPatternsHttp::server(); }

inline bool initialized = false;

inline void persistRole(PatternflowMqtt::Role role) {
  Preferences prefs;
  if (!prefs.begin("patternflow", false)) return;
  prefs.putUChar("mqtt_role", (uint8_t)role);
  prefs.end();
}

// Escaped, because not every value here is ours any more. The banner text
// arrives from whoever can publish to <prefix>/message, and a single quote
// character in it would otherwise end the string early and hand the console a
// JSON parse error — which looks like the device being broken rather than
// somebody having typed an apostrophe. Pattern names get the same treatment;
// they come from a community and nothing stops one containing a quote.
inline void appendJsonString(String& json, const char* key, const char* value) {
  json += "\"";
  json += key;
  json += "\":\"";
  for (const char* p = value; p && *p; ++p) {
    const unsigned char c = (unsigned char)*p;
    if (c == '"' || c == '\\') {
      json += '\\';
      json += (char)c;
    } else if (c < 0x20) {
      // Control characters are not legal raw in a JSON string. None of them
      // mean anything on a 64px panel, so they become spaces rather than
      // \u00xx escapes nobody will read.
      json += ' ';
    } else {
      json += (char)c;
    }
  }
  json += "\",";
}

inline void sendStatus(int code) {
  long knobs[4];
  PatternflowMqtt::lastKnobsCopy(knobs);

  String json = "{\"ok\":true,";
  appendJsonString(json, "role",
                   PatternflowMqtt::roleName(PatternflowMqtt::currentRole()));
  appendJsonString(json, "state", PatternflowMqtt::stateText());
  appendJsonString(json, "host", PatternflowMqtt::host());
  appendJsonString(json, "user", PatternflowMqtt::user());
  appendJsonString(json, "prefix", PatternflowMqtt::prefix());
  appendJsonString(json, "pattern", PatternflowMqtt::lastPatternName());
  appendJsonString(json, "message", PatternflowMqtt::overlayMessage());
  appendJsonString(json, "error", PatternflowMqtt::error());
  json += "\"port\":";
  json += PatternflowMqtt::port();
  json += ",\"connected\":";
  json += PatternflowMqtt::isConnected() ? "true" : "false";
  json += ",\"configured\":";
  json += PatternflowMqtt::hasBroker() ? "true" : "false";
  // Whether a password is set, never the password. The page shows an empty
  // field either way and sending it back would put a credential on the
  // network on every poll for no benefit — nothing on the page needs to
  // read it, only to replace it.
  json += ",\"hasPassword\":";
  json += PatternflowMqtt::hasPassword() ? "true" : "false";
  // The banner currently on the panel, so the page can show what a message
  // did without anyone having to be in the room.
  json += ",\"messageMs\":";
  json += PatternflowMqtt::overlayRemainingMs();
  json += ",\"knobs\":[";
  for (int i = 0; i < 4; ++i) {
    if (i) json += ',';
    json += knobs[i];
  }
  json += "]}";

  server().sendHeader("Cache-Control", "no-store");
  server().send(code, "application/json", json);
}

inline void handleIndex() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  PFSend::progmem(server(), MQTT_INDEX_HTML);
}

inline void handleGet() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  sendStatus(200);
}

inline void handlePost() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  String roleArg = server().hasArg("role") ? server().arg("role") : String();
  roleArg.toLowerCase();

  PatternflowMqtt::Role next;
  if (roleArg == "publisher" || roleArg == "pub") {
    next = PatternflowMqtt::ROLE_PUBLISHER;
  } else if (roleArg == "subscriber" || roleArg == "sub") {
    next = PatternflowMqtt::ROLE_SUBSCRIBER;
  } else if (roleArg == "off" || roleArg == "none" || roleArg.length() == 0) {
    next = PatternflowMqtt::ROLE_OFF;
  } else {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"role must be off, publisher, or subscriber\"}");
    return;
  }

  PatternflowMqtt::setRole(next);
  persistRole(next);
  sendStatus(200);
}

/**
 * Save the broker settings typed on /mqtt.
 *
 * The password is the only field with a rule of its own: it is never sent to
 * the page, so the form always posts it empty unless somebody typed a new
 * one. An empty field therefore means "unchanged", not "blank it" — clearing
 * is what the separate forget button is for. Without that, opening the page
 * and pressing Save would silently drop a working login.
 */
inline void handleConfig() {
  PatternflowPatternsHttp::noteConsoleApiCall();

  String host = server().hasArg("host") ? server().arg("host") : String();
  host.trim();

  long port = server().hasArg("port") ? server().arg("port").toInt() : 1883;
  if (port <= 0 || port > 65535) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"port must be 1-65535\"}");
    return;
  }

  String user = server().hasArg("user") ? server().arg("user") : String();
  user.trim();
  String prefix = server().hasArg("prefix") ? server().arg("prefix") : String();
  prefix.trim();
  if (prefix.length() == 0) prefix = "patternflow";

  const bool sentPassword = server().hasArg("pass") && server().arg("pass").length() > 0;
  String pass = sentPassword ? server().arg("pass") : String();

  PatternflowMqtt::saveConfig(host.c_str(), (uint16_t)port, user.c_str(),
                              sentPassword ? pass.c_str() : nullptr, prefix.c_str());
  sendStatus(200);
}

inline void handleForget() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  PatternflowMqtt::clearConfig();
  // A forgotten broker with a role still set would retry an empty host
  // forever, so the role goes back to Off with it.
  PatternflowMqtt::setRole(PatternflowMqtt::ROLE_OFF);
  persistRole(PatternflowMqtt::ROLE_OFF);
  sendStatus(200);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/mqtt", HTTP_GET, handleIndex);
  server().on("/api/mqtt", HTTP_GET, handleGet);
  server().on("/api/mqtt", HTTP_POST, handlePost);
  server().on("/api/mqtt/config", HTTP_POST, handleConfig);
  server().on("/api/mqtt/forget", HTTP_POST, handleForget);

  initialized = true;
  Serial.printf("[MQTT-HTTP] role picker http://%s/mqtt\n",
                WiFi.localIP().toString().c_str());
}

#else

inline void begin() {}

#endif

}  // namespace PatternflowMqttHttp
