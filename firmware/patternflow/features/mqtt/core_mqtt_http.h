// ═══════════════════════════════════════════════════════════
// PatternFlow - MQTT role + channel page (/mqtt)
//
//   GET  /mqtt        channel picker + role + broker form
//   GET  /api/mqtt    status JSON
//   POST /api/mqtt    role=… and/or channel=…
//   POST /api/mqtt/config   broker fields (Normal mode)
//   POST /api/mqtt/director host=LAN-IP  (Director mode overlay)
//   POST /api/mqtt/mode     mode=normal|director
//   POST /api/mqtt/forget
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "mqtt_config.h"

#include "../../net_config.h"
#include "../../src/core_patterns_http.h"
#include "../../src/core_loop_sync.h"

#ifndef PF_MQTT_HTTP_ENABLED
#define PF_MQTT_HTTP_ENABLED PF_MQTT_ENABLED
#endif

#if PF_MQTT_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED
#include <Preferences.h>
#include "../../src/webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
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

inline void persistChannelAndRole() {
  PatternflowMqtt::persistChannelAndRole();
}

// Escaped, because not every value here is ours. Pattern names come from a
// community and nothing stops one containing a quote — unescaped it would end
// the JSON string early and hand the page a parse error that looks like the
// device being broken.
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
  uint16_t params[4];
  bool paramActive[4];
  PatternflowMqtt::lastParamsCopy(params, paramActive);

  String json = "{\"ok\":true,";
  appendJsonString(json, "role",
                   PatternflowMqtt::roleName(PatternflowMqtt::currentRole()));
  appendJsonString(json, "channel",
                   PatternflowMqtt::channelName(PatternflowMqtt::currentChannel()));
  appendJsonString(json, "state", PatternflowMqtt::stateText());
  appendJsonString(json, "host", PatternflowMqtt::host());
  appendJsonString(json, "user", PatternflowMqtt::user());
  appendJsonString(json, "prefix", PatternflowMqtt::prefix());
  appendJsonString(json, "pattern", PatternflowMqtt::lastPatternName());
  appendJsonString(json, "error", PatternflowMqtt::error());
  appendJsonString(json, "mode", PatternflowMqtt::modeName());
  appendJsonString(json, "directorHost", PatternflowMqtt::directorHost());
  appendJsonString(json, "flowLocalHost", PatternflowMqtt::flowLocalHost());
  appendJsonString(json, "normalHost", PatternflowMqtt::normalHost());
  appendJsonString(json, "normalUser", PatternflowMqtt::normalUser());
  appendJsonString(json, "normalPrefix", PatternflowMqtt::normalPrefix());
  json += "\"normalPort\":";
  json += PatternflowMqtt::normalPort();
  json += ",\"normalHasPassword\":";
  json += PatternflowMqtt::normalHasPassword() ? "true" : "false";
  json += ",\"port\":";
  json += PatternflowMqtt::port();
  json += ",\"connected\":";
  json += PatternflowMqtt::isConnected() ? "true" : "false";
  json += ",\"configured\":";
  json += PatternflowMqtt::hasBroker() ? "true" : "false";
  json += ",\"hasPassword\":";
  json += PatternflowMqtt::hasPassword() ? "true" : "false";
  json += ",\"forcesSub\":";
  json += PatternflowMqtt::channelForcesSubscriber(PatternflowMqtt::currentChannel())
              ? "true"
              : "false";
  json += ",\"knobs\":[";
  for (int i = 0; i < 4; ++i) {
    if (i) json += ',';
    json += knobs[i];
  }
  json += "],\"params\":[";
  for (int i = 0; i < 4; ++i) {
    if (i) json += ',';
    json += params[i];
  }
  json += "],\"paramActive\":[";
  for (int i = 0; i < 4; ++i) {
    if (i) json += ',';
    json += paramActive[i] ? "true" : "false";
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

inline void postOnLoop() {
  PatternflowPatternsHttp::noteConsoleApiCall();

  if (PatternflowMqtt::isDirectorMode() || PatternflowMqtt::isFlowLocalMode()) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"leave Director/FlowLocal mode to change channel or role\"}");
    return;
  }

  const bool hasChannel = server().hasArg("channel");
  const bool hasRole = server().hasArg("role");

  if (!hasChannel && !hasRole) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"channel or role required\"}");
    return;
  }

  if (hasChannel) {
    String chArg = server().arg("channel");
    chArg.toLowerCase();
    PatternflowMqtt::Channel ch = PatternflowMqtt::channelFromName(chArg.c_str());
    PatternflowMqtt::Role preferred = PatternflowMqtt::currentRole();
    if (hasRole) {
      String roleArg = server().arg("role");
      roleArg.toLowerCase();
      if (roleArg == "publisher" || roleArg == "pub") {
        preferred = PatternflowMqtt::ROLE_PUBLISHER;
      } else if (roleArg == "subscriber" || roleArg == "sub") {
        preferred = PatternflowMqtt::ROLE_SUBSCRIBER;
      } else if (roleArg == "off" || roleArg == "none") {
        preferred = PatternflowMqtt::ROLE_OFF;
      }
    }
    if (ch == PatternflowMqtt::CHANNEL_CUSTOM && preferred == PatternflowMqtt::ROLE_OFF) {
      preferred = PatternflowMqtt::ROLE_SUBSCRIBER;
    }
    PatternflowMqtt::applyChannel(ch, preferred);
    persistChannelAndRole();
    sendStatus(200);
    return;
  }

  String roleArg = server().arg("role");
  roleArg.toLowerCase();
  PatternflowMqtt::Role next;
  if (roleArg == "publisher" || roleArg == "pub") {
    next = PatternflowMqtt::ROLE_PUBLISHER;
  } else if (roleArg == "subscriber" || roleArg == "sub") {
    next = PatternflowMqtt::ROLE_SUBSCRIBER;
  } else if (roleArg == "off" || roleArg == "none" || roleArg.length() == 0) {
    PatternflowMqtt::applyChannel(PatternflowMqtt::CHANNEL_OFF, PatternflowMqtt::ROLE_OFF);
    persistChannelAndRole();
    sendStatus(200);
    return;
  } else {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"role must be off, publisher, or subscriber\"}");
    return;
  }

  PatternflowMqtt::Channel ch = PatternflowMqtt::currentChannel();
  if (ch == PatternflowMqtt::CHANNEL_OFF) ch = PatternflowMqtt::CHANNEL_BROADCAST;
  PatternflowMqtt::applyChannel(ch, next);
  persistChannelAndRole();
  sendStatus(200);
}

inline void configOnLoop() {
  PatternflowPatternsHttp::noteConsoleApiCall();

  if (PatternflowMqtt::isDirectorMode() || PatternflowMqtt::isFlowLocalMode()) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"leave Director/FlowLocal mode to edit the Normal broker\"}");
    return;
  }

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
  persistChannelAndRole();
  sendStatus(200);
}

inline void directorOnLoop() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  String host = server().hasArg("host") ? server().arg("host") : String();
  host.trim();
  if (!host.length()) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"Director PC IP is required\"}");
    return;
  }
  PatternflowMqtt::setDirectorHost(host.c_str());
  PatternflowMqtt::setMqttMode(PatternflowMqtt::MQTT_MODE_DIRECTOR);
  sendStatus(200);
}

inline void flowLocalOnLoop() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  String host = server().hasArg("host") ? server().arg("host") : String();
  host.trim();
  if (host.length() == 0) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"host required\"}");
    return;
  }
  PatternflowMqtt::setFlowLocalHost(host.c_str());
  PatternflowMqtt::setMqttMode(PatternflowMqtt::MQTT_MODE_FLOWLOCAL);
  sendStatus(200);
}

inline void modeOnLoop() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  String mode = server().hasArg("mode") ? server().arg("mode") : String();
  mode.toLowerCase();
  if (mode == "flowlocal") {
    PatternflowMqtt::setMqttMode(PatternflowMqtt::MQTT_MODE_FLOWLOCAL);
    sendStatus(200);
    return;
  }
  if (mode == "director") {
    PatternflowMqtt::setMqttMode(PatternflowMqtt::MQTT_MODE_DIRECTOR);
    sendStatus(200);
    return;
  }
  if (mode == "normal") {
    PatternflowMqtt::setMqttMode(PatternflowMqtt::MQTT_MODE_NORMAL);
    sendStatus(200);
    return;
  }
  server().send(400, "application/json",
                "{\"ok\":false,\"error\":\"mode must be director, flowlocal, or normal\"}");
}

inline void forgetOnLoop() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  PatternflowMqtt::clearConfig();
  PatternflowMqtt::applyChannel(PatternflowMqtt::CHANNEL_OFF, PatternflowMqtt::ROLE_OFF);
  persistChannelAndRole();
  sendStatus(200);
}

// PubSubClient is not thread-safe, and the feature loop on the render core
// calls client.loop() every frame. Anything here that reconnects, changes
// mode or clears the config runs on the loop task (core_loop_sync.h).
inline void handlePost() { PFLoopSync::run([] { postOnLoop(); }); }
inline void handleConfig() { PFLoopSync::run([] { configOnLoop(); }); }
inline void handleDirector() { PFLoopSync::run([] { directorOnLoop(); }); }
inline void handleFlowLocal() { PFLoopSync::run([] { flowLocalOnLoop(); }); }
inline void handleMode() { PFLoopSync::run([] { modeOnLoop(); }); }
inline void handleForget() { PFLoopSync::run([] { forgetOnLoop(); }); }

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/mqtt", HTTP_GET, handleIndex);
  server().on("/api/mqtt", HTTP_GET, handleGet);
  server().on("/api/mqtt", HTTP_POST, handlePost);
  server().on("/api/mqtt/config", HTTP_POST, handleConfig);
  server().on("/api/mqtt/director", HTTP_POST, handleDirector);
  server().on("/api/mqtt/flowlocal", HTTP_POST, handleFlowLocal);
  server().on("/api/mqtt/mode", HTTP_POST, handleMode);
  server().on("/api/mqtt/forget", HTTP_POST, handleForget);

  initialized = true;
  Serial.printf("[MQTT-HTTP] role picker http://%s/mqtt\n",
                WiFi.localIP().toString().c_str());
}

#else

inline void begin() {}

#endif

}  // namespace PatternflowMqttHttp
