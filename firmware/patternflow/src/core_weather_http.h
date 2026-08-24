// ═══════════════════════════════════════════════════════════
// PatternFlow - /weather page (OpenWeather config + live reading)
//
//   GET  /weather
//   GET  /api/weather
//   POST /api/weather/config   enable, key, query/lat/lon, units
//   POST /api/weather/fetch    force refresh now
//   POST /api/weather/forget   clear key + location
//   POST /api/weather/activate select the compiled-in Weather pattern
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"
#include "core_patterns_http.h"

#ifndef PF_WEATHER_HTTP_ENABLED
#define PF_WEATHER_HTTP_ENABLED PF_WEATHER_ENABLED
#endif

#if PF_WEATHER_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED && PF_WEATHER_ENABLED
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <WiFi.h>
#include "core_weather.h"
#include "weather_index.h"
#include "../pattern_registry.h"
#endif

namespace PatternflowWeatherHttp {

#if PF_WEATHER_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED && PF_WEATHER_ENABLED

inline WebServer& server() { return PatternflowPatternsHttp::server(); }
inline bool initialized = false;

inline void appendJsonString(String& json, const char* key, const char* value) {
  json += "\"";
  json += key;
  json += "\":\"";
  if (value) {
    for (const char* p = value; *p; ++p) {
      char c = *p;
      if (c == '"' || c == '\\') json += '\\';
      if (c >= 32) json += c;
    }
  }
  json += "\",";
}

inline void sendStatus(int code) {
  // Pre-size to avoid Arduino String realloc churn every poll (was a suspect
  // for panel white-flashes while /weather is open in a browser).
  String json;
  json.reserve(768);
  json = "{\"ok\":true,";
  appendJsonString(json, "query", PatternflowWeather::query);
  appendJsonString(json, "condition", PatternflowWeather::conditionMain());
  appendJsonString(json, "description", PatternflowWeather::conditionDesc());
  appendJsonString(json, "error", PatternflowWeather::error());
  json += "\"enabled\":";
  json += PatternflowWeather::isEnabled() ? "true" : "false";
  json += ",\"metric\":";
  json += PatternflowWeather::unitsMetric ? "true" : "false";
  json += ",\"configured\":";
  json += PatternflowWeather::configured() ? "true" : "false";
  json += ",\"hasKey\":";
  json += PatternflowWeather::hasApiKey() ? "true" : "false";
  json += ",\"hasData\":";
  json += PatternflowWeather::hasData() ? "true" : "false";
  json += ",\"weatherId\":";
  json += PatternflowWeather::conditionId();
  json += ",\"tempC\":";
  json += String(PatternflowWeather::temperatureC(), 2);
  json += ",\"feelsC\":";
  json += String(PatternflowWeather::feelsLikeC(), 2);
  json += ",\"humidity\":";
  json += String(PatternflowWeather::humidityPct(), 1);
  json += ",\"pressure\":";
  json += String(PatternflowWeather::pressure(), 1);
  json += ",\"windMs\":";
  json += String(PatternflowWeather::windMs(), 2);
  json += ",\"windKmh\":";
  json += String(PatternflowWeather::windKmh(), 2);
  json += ",\"windMph\":";
  json += String(PatternflowWeather::windMph(), 2);
  json += ",\"windDeg\":";
  json += String(PatternflowWeather::windDirectionDeg(), 0);
  json += ",";
  appendJsonString(json, "windDir", PatternflowWeather::windCompass());
  json += "\"clouds\":";
  json += String(PatternflowWeather::cloudCoverPct(), 0);
  json += ",\"uv\":";
  if (PatternflowWeather::hasUv()) json += String(PatternflowWeather::uv(), 2);
  else json += "null";
  json += ",\"ageMs\":";
  json += PatternflowWeather::ageMs();
  json += ",\"lat\":";
  if (isfinite(PatternflowWeather::lat)) json += String(PatternflowWeather::lat, 4);
  else json += "null";
  json += ",\"lon\":";
  if (isfinite(PatternflowWeather::lon)) json += String(PatternflowWeather::lon, 4);
  else json += "null";
  json += ",\"tzOffsetMin\":";
  json += (int)PatternflowWeather::timezoneOffsetMin();
  json += ",\"clockOverlay\":";
  json += PatternflowWeather::clockOverlayEnabled() ? "true" : "false";
  json += ",\"layoutExtended\":";
  json += PatternflowWeather::isLayoutExtended() ? "true" : "false";
  json += ",\"timeSynced\":";
  json += PatternflowWeather::timeSynced() ? "true" : "false";
  json += ",\"localTime\":\"";
  if (PatternflowWeather::timeSynced()) {
    char tbuf[12];
    snprintf(tbuf, sizeof(tbuf), "%02d:%02d:%02d",
             PatternflowWeather::localHour(), PatternflowWeather::localMinute(),
             PatternflowWeather::localSecond());
    json += tbuf;
  }
  json += "\",\"knobs\":[";
  for (int i = 0; i < 4; ++i) {
    if (i) json += ',';
    json += String(PatternflowWeather::value(i), 3);
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
  PFSend::progmem(server(), WEATHER_INDEX_HTML);
}

inline void handleGet() {
  PatternflowPatternsHttp::noteConsoleApiCall();
  sendStatus(200);
}

inline void handleConfig() {
  bool en = server().hasArg("enabled") &&
            (server().arg("enabled") == "1" || server().arg("enabled") == "true");
  bool metric = !server().hasArg("metric") ||
                server().arg("metric") == "1" || server().arg("metric") == "true";
  String q = server().hasArg("query") ? server().arg("query") : String(PatternflowWeather::query);
  q.trim();
  float la = NAN, lo = NAN;
  if (server().hasArg("lat") && server().arg("lat").length()) {
    la = server().arg("lat").toFloat();
  } else {
    la = PatternflowWeather::lat;
  }
  if (server().hasArg("lon") && server().arg("lon").length()) {
    lo = server().arg("lon").toFloat();
  } else {
    lo = PatternflowWeather::lon;
  }
  String key = server().hasArg("key") ? server().arg("key") : "";
  bool newKey = key.length() > 0;
  int16_t tz = PatternflowWeather::timezoneOffsetMin();
  if (server().hasArg("tz")) tz = (int16_t)server().arg("tz").toInt();
  bool showClock = server().hasArg("clock") &&
                   (server().arg("clock") == "1" || server().arg("clock") == "true");
  bool extended = server().hasArg("layout") &&
                  (server().arg("layout") == "extended" ||
                   server().arg("layout") == "1" ||
                   server().arg("layout") == "true");

  PatternflowWeather::saveConfig(en, key.c_str(), q.c_str(), la, lo, metric, tz,
                                 showClock, extended, newKey);
  sendStatus(200);
}

inline void handleFetch() {
  if (!PatternflowWeather::configured()) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"not configured\"}");
    return;
  }
  bool ok = PatternflowWeather::fetchOnce();
  sendStatus(ok ? 200 : 502);
}

inline void handleForget() {
  PatternflowWeather::forget();
  sendStatus(200);
}

inline void handleActivate() {
  int index = -1;
  for (int i = 0; i < NUM_PATTERNS; i++) {
    if (patterns[i].name && strcmp(patterns[i].name, "Weather") == 0) {
      index = i;
      break;
    }
  }
  if (index < 0) {
    server().send(404, "application/json",
                  "{\"ok\":false,\"error\":\"Weather pattern not in firmware\"}");
    return;
  }
  PatternflowPatternsHttp::pendingSelectIdx = index;
  if (PatternflowPatternsHttp::restorePending &&
      (!PatternflowPatternsHttp::lastUploadActivityMs ||
       millis() - PatternflowPatternsHttp::lastUploadActivityMs > 3000)) {
    PatternflowPatternsHttp::restorePending = false;
  }
  // Ensure fetching is on when showing the pattern.
  if (!PatternflowWeather::isEnabled() && PatternflowWeather::configured()) {
    PatternflowWeather::saveConfig(true, nullptr, PatternflowWeather::query,
                                   PatternflowWeather::lat, PatternflowWeather::lon,
                                   PatternflowWeather::unitsMetric,
                                   PatternflowWeather::timezoneOffsetMin(),
                                   PatternflowWeather::clockOverlayEnabled(),
                                   PatternflowWeather::isLayoutExtended(), false);
  }
  String body = "{\"ok\":true,\"index\":";
  body += index;
  body += ",\"name\":\"Weather\"}";
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", body);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/weather", HTTP_GET, handleIndex);
  server().on("/api/weather", HTTP_GET, handleGet);
  server().on("/api/weather/config", HTTP_POST, handleConfig);
  server().on("/api/weather/fetch", HTTP_POST, handleFetch);
  server().on("/api/weather/forget", HTTP_POST, handleForget);
  server().on("/api/weather/activate", HTTP_POST, handleActivate);

  initialized = true;
  Serial.println("[WEATHER] /weather ready");
}

#else

inline void begin() {}

#endif

}  // namespace PatternflowWeatherHttp
