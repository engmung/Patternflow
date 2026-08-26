// ═══════════════════════════════════════════════════════════
// PatternFlow - OpenWeather One Call API 3.0 client
//
// Resolves city → lat/lon via Geocoding 1.0 when needed, then polls
//   https://api.openweathermap.org/data/3.0/onecall
// every 30 minutes (or on demand from /weather). Caches current
// conditions plus forecast slots (now / +3h / +6h / +24h) for the
// Weather pattern; maps condition/temp/humidity/feels onto knobs 0..1.
//
// API key + location live in NVS (never in a .pfm). License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <string.h>
#include <time.h>
#include <sys/time.h>

#include "../../net_config.h"
#include "../../src/core_clock.h"

#ifndef PF_WEATHER_ENABLED
#define PF_WEATHER_ENABLED 1
#endif

namespace PatternflowWeather {

// Forecast glance slots for the Weather pattern upper half.
struct ForecastSlot {
  bool valid = false;
  bool isMinMax = false;  // true → tempA=min, tempB=max; else real/feel
  int weatherId = 0;
  char icon[8] = {};
  float tempA = 0.0f;  // °C real or min
  float tempB = 0.0f;  // °C feel or max
};

#if PF_WEATHER_ENABLED

constexpr size_t KEY_BYTES = 48;
constexpr size_t QUERY_BYTES = 64;
constexpr size_t COND_BYTES = 32;
constexpr size_t ERR_BYTES = 64;

inline bool enabled = false;
inline bool unitsMetric = true;  // false = imperial
inline char apiKey[KEY_BYTES] = {};
inline char query[QUERY_BYTES] = {};  // city name, e.g. "Milan,IT"
inline float lat = NAN;
inline float lon = NAN;
inline int16_t tzOffsetMin = 0;  // local = UTC + this many minutes
inline bool clockOverlay = false;  // HH:MM corner on every pattern
inline bool layoutExtended = false;  // false=compact 128×64, true=portrait 64×128

inline bool haveData = false;
inline int weatherId = 0;
inline char condition[COND_BYTES] = {};   // weather[0].main
inline char description[COND_BYTES] = {}; // weather[0].description
inline char iconCode[8] = {};             // e.g. "01d" / "10n"
inline float tempC = 0.0f;
inline float feelsC = 0.0f;
inline float humidity = 0.0f;
inline float pressureHpa = 0.0f;
inline float windSpeedMs = 0.0f;   // always SI m/s internally
inline float windDeg = 0.0f;
inline float cloudsPct = 0.0f;
inline float uvIndex = NAN;
inline bool haveUv = false;
inline float coordLat = NAN;      // from last successful fetch
inline float coordLon = NAN;
inline uint32_t fetchedAtMs = 0;
inline uint32_t nextFetchDueMs = 0;
inline char lastError[ERR_BYTES] = {};
inline bool fetchInFlight = false;
inline bool ntpStarted = false;

inline float knobVals[4] = {0, 0, 0, 0};

inline ForecastSlot forecastNow;
inline ForecastSlot forecastPlus3;
inline ForecastSlot forecastPlus6;
inline ForecastSlot forecastPlus24;
inline int8_t pressureTrend = 0;  // -1 falling, 0 stable, +1 rising (vs +3h)

inline void clearForecast() {
  forecastNow = ForecastSlot{};
  forecastPlus3 = ForecastSlot{};
  forecastPlus6 = ForecastSlot{};
  forecastPlus24 = ForecastSlot{};
  pressureTrend = 0;
}

inline void setError(const char* msg) {
  snprintf(lastError, sizeof(lastError), "%s", msg ? msg : "");
}

inline bool hasApiKey() { return apiKey[0] != '\0'; }
inline bool hasLocation() {
  return query[0] != '\0' || (isfinite(lat) && isfinite(lon));
}
inline bool configured() { return hasApiKey() && hasLocation(); }
inline bool isEnabled() { return enabled; }
inline bool hasData() { return haveData; }
inline const char* error() { return lastError; }
inline const char* conditionMain() { return condition; }
inline const char* conditionDesc() { return description; }
inline const char* owmIcon() { return iconCode; }
inline float temperatureC() { return tempC; }
inline float feelsLikeC() { return feelsC; }
inline float humidityPct() { return humidity; }
inline float pressure() { return pressureHpa; }
inline float windMs() { return windSpeedMs; }
inline float windKmh() { return windSpeedMs * 3.6f; }
inline float windMph() { return windSpeedMs * 2.23693629f; }
inline float windDirectionDeg() { return windDeg; }
inline float cloudCoverPct() { return cloudsPct; }
inline float uv() { return uvIndex; }
inline bool hasUv() { return haveUv && isfinite(uvIndex); }
inline int conditionId() { return weatherId; }
inline int16_t timezoneOffsetMin() { return tzOffsetMin; }
inline bool clockOverlayEnabled() { return clockOverlay; }
inline bool isLayoutExtended() { return layoutExtended; }
inline int8_t pressureTrendArrow() { return pressureTrend; }  // -1/0/+1
inline const ForecastSlot& forecastSlot(int i) {
  switch (i) {
    case 1: return forecastPlus3;
    case 2: return forecastPlus6;
    case 3: return forecastPlus24;
    default: return forecastNow;
  }
}
inline uint32_t ageMs() {
  if (!haveData || !fetchedAtMs) return 0;
  return millis() - fetchedAtMs;
}

inline void beginNtp() {
  // Offset is minutes east of UTC (e.g. Dubai +240, Rome +60 / +120 DST).
  PatternflowClock::beginSync(tzOffsetMin);
  ntpStarted = true;
  Serial.printf("[WEATHER] NTP started (UTC%+d min)\n", (int)tzOffsetMin);
}

inline bool upstreamFlowLocal = false;
inline char upstreamHost[64] = "192.168.66.1";
// Pace FlowLocal HTTP so a down/slow appliance cannot stall the web console
// (handle() runs from loop; blocking GET without backoff made UI unusable).
inline uint32_t nextFlTimeDueMs = 0;
constexpr uint32_t FL_HTTP_TIMEOUT_MS = 400;
constexpr uint32_t FL_TIME_RETRY_MS = 60000;
constexpr uint32_t FL_WEATHER_RETRY_MS = 60000;

inline void setFlowLocalUpstream(const char* host) {
  if (!upstreamFlowLocal) {
    // Entering island mode: stop relying on internet NTP/OpenWeather path.
    nextFetchDueMs = 0;
    nextFlTimeDueMs = 0;
    // Prefer appliance clock; clear "SNTP already started" so we pull /api/time.
    ntpStarted = false;
  }
  upstreamFlowLocal = true;
  if (host && host[0]) {
    snprintf(upstreamHost, sizeof(upstreamHost), "%s", host);
  } else {
    snprintf(upstreamHost, sizeof(upstreamHost), "192.168.66.1");
  }
}

inline void clearFlowLocalUpstream() {
  if (upstreamFlowLocal) {
    upstreamFlowLocal = false;
    nextFlTimeDueMs = 0;
    // Leave island mode → internet NTP when Wi‑Fi has a route.
    ntpStarted = false;
    if (WiFi.status() == WL_CONNECTED) beginNtp();
  } else {
    upstreamFlowLocal = false;
  }
}

// FlowLocal island: pull cached weather over HTTP (panel has no internet).
inline bool fetchFromFlowLocal() {
  if (!upstreamFlowLocal || !upstreamHost[0]) return false;
  if (WiFi.status() != WL_CONNECTED) {
    setError("wifi down");
    nextFetchDueMs = millis() + FL_WEATHER_RETRY_MS;
    return false;
  }
  char url[96];
  snprintf(url, sizeof(url), "http://%s/api/weather", upstreamHost);
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(FL_HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) {
    setError("fl begin");
    nextFetchDueMs = millis() + FL_WEATHER_RETRY_MS;
    return false;
  }
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    snprintf(lastError, sizeof(lastError), "fl http %d", code);
    http.end();
    nextFetchDueMs = millis() + FL_WEATHER_RETRY_MS;
    return false;
  }
  String body = http.getString();
  http.end();

  auto findNum = [&](const char* key, float* out) {
    int i = body.indexOf(key);
    if (i < 0) return false;
    i = body.indexOf(':', i);
    if (i < 0) return false;
    *out = body.substring(i + 1).toFloat();
    return true;
  };
  auto findStr = [&](const char* key, char* out, size_t outLen) {
    int i = body.indexOf(key);
    if (i < 0) return false;
    i = body.indexOf('"', i + (int)strlen(key));
    if (i < 0) return false;
    int j = body.indexOf('"', i + 1);
    if (j < 0) return false;
    String s = body.substring(i + 1, j);
    snprintf(out, outLen, "%s", s.c_str());
    return true;
  };

  float idf = 0;
  findNum("\"weatherId\"", &idf);
  weatherId = (int)idf;
  findNum("\"tempC\"", &tempC);
  findNum("\"feelsC\"", &feelsC);
  findNum("\"humidity\"", &humidity);
  findStr("\"condition\"", condition, sizeof(condition));
  findStr("\"description\"", description, sizeof(description));
  findStr("\"icon\"", iconCode, sizeof(iconCode));
  haveData = true;
  fetchedAtMs = millis();
  lastError[0] = '\0';
  nextFetchDueMs = millis() + PF_WEATHER_POLL_MS;
  Serial.printf("[WEATHER] FlowLocal %s %.1fC id=%d\n", condition, tempC, weatherId);
  return true;
}

inline bool syncTimeFromFlowLocal() {
  if (!upstreamFlowLocal || !upstreamHost[0]) return false;
  char url[96];
  snprintf(url, sizeof(url), "http://%s/api/time", upstreamHost);
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(FL_HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) {
    nextFlTimeDueMs = millis() + FL_TIME_RETRY_MS;
    return false;
  }
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    http.end();
    nextFlTimeDueMs = millis() + FL_TIME_RETRY_MS;
    return false;
  }
  String body = http.getString();
  http.end();
  int i = body.indexOf("\"time_unix\"");
  if (i < 0) {
    nextFlTimeDueMs = millis() + FL_TIME_RETRY_MS;
    return false;
  }
  i = body.indexOf(':', i);
  if (i < 0) {
    nextFlTimeDueMs = millis() + FL_TIME_RETRY_MS;
    return false;
  }
  time_t unixNow = (time_t)body.substring(i + 1).toInt();
  if (unixNow < 1609459200LL) {
    // Appliance clock not ready yet — back off, do not retry every loop.
    nextFlTimeDueMs = millis() + FL_TIME_RETRY_MS;
    return false;
  }
  int j = body.indexOf("\"tz_offset_min\"");
  if (j >= 0) {
    j = body.indexOf(':', j);
    if (j >= 0) tzOffsetMin = (int16_t)body.substring(j + 1).toInt();
  }
  timeval tv = {};
  tv.tv_sec = unixNow;
  settimeofday(&tv, nullptr);
  ntpStarted = true;
  nextFlTimeDueMs = 0;
  Serial.printf("[WEATHER] time from FlowLocal unix=%ld tz=%d\n", (long)unixNow,
                (int)tzOffsetMin);
  return true;
}

// The clock itself lives in core_clock.h — a night/wake scheduler and a
// corner clock both need one, and neither is a weather feature. These
// stay as the names the rest of the weather code already uses.
inline void refreshLocalTime() { PatternflowClock::refresh(); }
inline bool localTime(struct tm* out) { return PatternflowClock::localTime(out); }
inline bool timeSynced() { return PatternflowClock::synced(); }
inline int localHour() { return PatternflowClock::hour(); }
inline int localMinute() { return PatternflowClock::minute(); }
inline int localSecond() { return PatternflowClock::second(); }
inline int localMinutes() { return PatternflowClock::minutesOfDay(); }
inline int localDayKey() { return PatternflowClock::dayKey(); }

// Prefer OpenWeather icon day/night letter; else local clock.
inline bool isNight() {
  if (iconCode[0] && iconCode[2] == 'n') return true;
  if (iconCode[0] && iconCode[2] == 'd') return false;
  int h = localHour();
  return h < 6 || h >= 20;
}

// 8-point compass from degrees (0 = N).
inline const char* windCompass() {
  static const char* const DIRS[] = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"};
  float d = fmodf(windDeg, 360.0f);
  if (d < 0) d += 360.0f;
  int i = (int)floorf((d + 22.5f) / 45.0f) % 8;
  return DIRS[i];
}

// OpenWeather condition id → 0..1 band for K1.
inline float conditionToKnob(int id) {
  if (id <= 0) return 0.0f;
  if (id >= 200 && id < 300) return 5.0f / 6.0f;  // Thunderstorm
  if (id >= 300 && id < 400) return 2.0f / 6.0f;  // Drizzle
  if (id >= 500 && id < 600) return 3.0f / 6.0f;  // Rain
  if (id >= 600 && id < 700) return 4.0f / 6.0f;  // Snow
  if (id >= 700 && id < 800) return 1.0f;         // Atmosphere / fog
  if (id == 800) return 0.0f;                     // Clear
  if (id > 800 && id < 900) return 1.0f / 6.0f;   // Clouds
  return 0.0f;
}

inline float tempToKnob(float c) {
  float t = (c - PF_WEATHER_TEMP_MIN_C) /
            (PF_WEATHER_TEMP_MAX_C - PF_WEATHER_TEMP_MIN_C);
  if (t < 0.0f) t = 0.0f;
  if (t > 1.0f) t = 1.0f;
  return t;
}

inline void recomputeKnobs() {
  knobVals[0] = conditionToKnob(weatherId);
  knobVals[1] = tempToKnob(tempC);
  knobVals[2] = constrain(humidity, 0.0f, 100.0f) / 100.0f;
  knobVals[3] = tempToKnob(feelsC);
}

// When enabled and we have a reading, patterns may treat these like audio
// absolute knobs (0..1). Physical encoders still work; weather wins when
// driving() is true.
inline bool driving() { return enabled && haveData; }
inline bool isActive(int idx) {
  return driving() && idx >= 0 && idx < 4;
}
inline float value(int idx) {
  if (idx < 0 || idx > 3) return 0.0f;
  return knobVals[idx];
}

inline bool jsonFindString(const String& body, const char* key, char* out, size_t outLen) {
  String needle = String("\"") + key + "\":\"";
  int i = body.indexOf(needle);
  if (i < 0) return false;
  i += needle.length();
  int j = body.indexOf('"', i);
  if (j <= i) return false;
  size_t n = (size_t)(j - i);
  if (n >= outLen) n = outLen - 1;
  memcpy(out, body.c_str() + i, n);
  out[n] = '\0';
  return true;
}

inline bool jsonFindNumber(const String& body, const char* key, float* out) {
  String needle = String("\"") + key + "\":";
  int i = body.indexOf(needle);
  if (i < 0) return false;
  i += needle.length();
  while (i < (int)body.length() && (body[i] == ' ' || body[i] == '\t')) i++;
  *out = body.substring(i).toFloat();
  return true;
}

inline int jsonMatchBracket(const String& s, int openPos) {
  if (openPos < 0 || openPos >= (int)s.length()) return -1;
  char open = s[openPos];
  char close = (open == '[') ? ']' : '}';
  if (open != '[' && open != '{') return -1;
  int depth = 0;
  bool inStr = false;
  for (int i = openPos; i < (int)s.length(); i++) {
    char c = s[i];
    if (inStr) {
      if (c == '\\' && i + 1 < (int)s.length()) { i++; continue; }
      if (c == '"') inStr = false;
      continue;
    }
    if (c == '"') { inStr = true; continue; }
    if (c == open) depth++;
    else if (c == close) {
      depth--;
      if (depth == 0) return i;
    }
  }
  return -1;
}

inline bool jsonArrayBounds(const String& body, const char* key, int* innerStart, int* innerEnd) {
  String needle = String("\"") + key + "\":";
  int i = body.indexOf(needle);
  if (i < 0) return false;
  i += needle.length();
  while (i < (int)body.length() && (body[i] == ' ' || body[i] == '\t')) i++;
  if (i >= (int)body.length() || body[i] != '[') return false;
  int close = jsonMatchBracket(body, i);
  if (close < 0) return false;
  *innerStart = i + 1;
  *innerEnd = close;
  return true;
}

inline bool jsonNthObjectRange(const String& body, int innerStart, int innerEnd,
                               int index, String& out) {
  int depth = 0;
  int start = -1;
  int seen = -1;
  bool inStr = false;
  for (int i = innerStart; i < innerEnd; i++) {
    char c = body[i];
    if (inStr) {
      if (c == '\\' && i + 1 < innerEnd) { i++; continue; }
      if (c == '"') inStr = false;
      continue;
    }
    if (c == '"') { inStr = true; continue; }
    if (c == '{') {
      if (depth == 0) start = i;
      depth++;
    } else if (c == '}') {
      depth--;
      if (depth == 0 && start >= 0) {
        seen++;
        if (seen == index) {
          out = body.substring(start, i + 1);
          return true;
        }
      }
    }
  }
  return false;
}

inline void fillSlotFromTemps(ForecastSlot& slot, float t, float fl, int id,
                              const char* icon, bool minMax) {
  if (unitsMetric) {
    slot.tempA = t;
    slot.tempB = fl;
  } else {
    slot.tempA = (t - 32.0f) * (5.0f / 9.0f);
    slot.tempB = (fl - 32.0f) * (5.0f / 9.0f);
  }
  slot.weatherId = id;
  slot.isMinMax = minMax;
  slot.icon[0] = '\0';
  if (icon && icon[0]) {
    snprintf(slot.icon, sizeof(slot.icon), "%s", icon);
  }
  slot.valid = true;
}

inline void parseWeatherMeta(const String& obj, int* idOut, char* iconOut, size_t iconLen) {
  if (idOut) *idOut = 0;
  if (iconOut && iconLen) iconOut[0] = '\0';
  int w = obj.indexOf("\"weather\"");
  if (w < 0) return;
  if (idOut) {
    int idPos = obj.indexOf("\"id\":", w);
    if (idPos >= 0) *idOut = (int)obj.substring(idPos + 5).toFloat();
  }
  if (iconOut && iconLen) {
    int iconPos = obj.indexOf("\"icon\":\"", w);
    if (iconPos >= 0) {
      int s = iconPos + 8;
      int e = obj.indexOf('"', s);
      if (e > s) {
        size_t n = (size_t)(e - s);
        if (n >= iconLen) n = iconLen - 1;
        memcpy(iconOut, obj.c_str() + s, n);
        iconOut[n] = '\0';
      }
    }
  }
}

inline bool parseHourlySlot(const String& body, int index, ForecastSlot& slot) {
  int a0, a1;
  if (!jsonArrayBounds(body, "hourly", &a0, &a1)) return false;
  String obj;
  if (!jsonNthObjectRange(body, a0, a1, index, obj)) return false;
  float t = 0, fl = 0;
  if (!jsonFindNumber(obj, "temp", &t)) return false;
  jsonFindNumber(obj, "feels_like", &fl);
  int id = 0;
  char icon[8] = {};
  parseWeatherMeta(obj, &id, icon, sizeof(icon));
  fillSlotFromTemps(slot, t, fl, id, icon, false);
  return true;
}

inline float hourlyPressureAt(const String& body, int index) {
  int a0, a1;
  if (!jsonArrayBounds(body, "hourly", &a0, &a1)) return NAN;
  String obj;
  if (!jsonNthObjectRange(body, a0, a1, index, obj)) return NAN;
  float p = NAN;
  jsonFindNumber(obj, "pressure", &p);
  return p;
}

inline bool parseDailyMinMax(const String& body, int index, ForecastSlot& slot) {
  int a0, a1;
  if (!jsonArrayBounds(body, "daily", &a0, &a1)) return false;
  String obj;
  if (!jsonNthObjectRange(body, a0, a1, index, obj)) return false;
  int tKey = obj.indexOf("\"temp\":");
  if (tKey < 0) return false;
  int brace = obj.indexOf('{', tKey);
  if (brace < 0) return false;
  int end = jsonMatchBracket(obj, brace);
  if (end < 0) return false;
  String tempObj = obj.substring(brace, end + 1);
  float tmin = 0, tmax = 0;
  if (!jsonFindNumber(tempObj, "min", &tmin)) return false;
  if (!jsonFindNumber(tempObj, "max", &tmax)) return false;
  int id = 0;
  char icon[8] = {};
  parseWeatherMeta(obj, &id, icon, sizeof(icon));
  fillSlotFromTemps(slot, tmin, tmax, id, icon, true);
  return true;
}

inline void applyForecast(const String& body) {
  clearForecast();

  forecastNow.valid = true;
  forecastNow.isMinMax = false;
  forecastNow.weatherId = weatherId;
  forecastNow.tempA = tempC;
  forecastNow.tempB = feelsC;
  snprintf(forecastNow.icon, sizeof(forecastNow.icon), "%s", iconCode);

  parseHourlySlot(body, 3, forecastPlus3);
  parseHourlySlot(body, 6, forecastPlus6);
  if (!parseDailyMinMax(body, 1, forecastPlus24)) {
    parseHourlySlot(body, 24, forecastPlus24);
  }
  float p3 = hourlyPressureAt(body, 3);
  if (isfinite(p3) && isfinite(pressureHpa)) {
    float d = p3 - pressureHpa;
    if (d > 1.0f) pressureTrend = 1;
    else if (d < -1.0f) pressureTrend = -1;
    else pressureTrend = 0;
  }
}

inline void applyPayload(const String& body) {
  // One Call 3.0: values live under "current":{ ... }.
  int curKey = body.indexOf("\"current\":{");
  if (curKey < 0) curKey = body.indexOf("\"current\": {");
  if (curKey < 0) {
    setError("parse: no current");
    return;
  }
  int brace = body.indexOf('{', curKey);
  int braceEnd = jsonMatchBracket(body, brace);
  if (brace < 0 || braceEnd < 0) {
    setError("parse: bad current");
    return;
  }
  String current = body.substring(brace, braceEnd + 1);

  char mainBuf[COND_BYTES] = {};
  char descBuf[COND_BYTES] = {};
  float t = 0, fl = 0, h = 0, idf = 0;
  float p = 0, ws = 0, wd = 0, cl = 0, uvi = NAN;
  float clat = NAN, clon = NAN;
  iconCode[0] = '\0';

  jsonFindNumber(body, "lat", &clat);
  jsonFindNumber(body, "lon", &clon);

  jsonFindNumber(current, "temp", &t);
  jsonFindNumber(current, "feels_like", &fl);
  jsonFindNumber(current, "humidity", &h);
  jsonFindNumber(current, "pressure", &p);
  jsonFindNumber(current, "wind_speed", &ws);
  jsonFindNumber(current, "wind_deg", &wd);
  jsonFindNumber(current, "clouds", &cl);
  jsonFindNumber(current, "uvi", &uvi);

  int w = current.indexOf("\"weather\"");
  if (w >= 0) {
    int idPos = current.indexOf("\"id\":", w);
    if (idPos >= 0) idf = current.substring(idPos + 5).toFloat();
    int mainPos = current.indexOf("\"main\":\"", w);
    if (mainPos >= 0) {
      int s = mainPos + 8;
      int e = current.indexOf('"', s);
      if (e > s) {
        size_t n = (size_t)(e - s);
        if (n >= sizeof(mainBuf)) n = sizeof(mainBuf) - 1;
        memcpy(mainBuf, current.c_str() + s, n);
        mainBuf[n] = '\0';
      }
    }
    jsonFindString(current, "description", descBuf, sizeof(descBuf));
    jsonFindString(current, "icon", iconCode, sizeof(iconCode));
  }

  if (!mainBuf[0] && !descBuf[0]) {
    setError("parse: no condition");
    return;
  }

  weatherId = (int)idf;
  snprintf(condition, sizeof(condition), "%s", mainBuf[0] ? mainBuf : "?");
  snprintf(description, sizeof(description), "%s", descBuf[0] ? descBuf : condition);
  if (!iconCode[0]) jsonFindString(current, "icon", iconCode, sizeof(iconCode));

  if (unitsMetric) {
    tempC = t;
    feelsC = fl;
    windSpeedMs = ws;
  } else {
    tempC = (t - 32.0f) * (5.0f / 9.0f);
    feelsC = (fl - 32.0f) * (5.0f / 9.0f);
    windSpeedMs = ws * 0.44704f;
  }
  humidity = h;
  pressureHpa = p;
  windDeg = wd;
  cloudsPct = cl;
  if (isfinite(uvi)) {
    uvIndex = uvi;
    haveUv = true;
  } else {
    uvIndex = NAN;
    haveUv = false;
  }
  if (isfinite(clat) && isfinite(clon)) {
    coordLat = clat;
    coordLon = clon;
  } else if (isfinite(lat) && isfinite(lon)) {
    coordLat = lat;
    coordLon = lon;
  }
  haveData = true;
  fetchedAtMs = millis();
  lastError[0] = '\0';
  applyForecast(body);
  recomputeKnobs();
}

inline bool httpGet(const char* url, String& bodyOut, int* httpCodeOut) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(client, url)) {
    if (httpCodeOut) *httpCodeOut = -1;
    return false;
  }
  int code = http.GET();
  if (httpCodeOut) *httpCodeOut = code;
  if (code != HTTP_CODE_OK) {
    http.end();
    return false;
  }
  bodyOut = http.getString();
  http.end();
  return true;
}

// Geocoding API 1.0 — city → lat/lon (One Call 3.0 requires coordinates).
inline bool geocodeQuery(float* outLat, float* outLon) {
  if (!query[0] || !outLat || !outLon) return false;
  char qenc[QUERY_BYTES * 3];
  size_t o = 0;
  for (size_t i = 0; query[i] && o + 3 < sizeof(qenc); i++) {
    char c = query[i];
    if (c == ' ') {
      qenc[o++] = '%';
      qenc[o++] = '2';
      qenc[o++] = '0';
    } else if (c == ',') {
      qenc[o++] = '%';
      qenc[o++] = '2';
      qenc[o++] = 'C';
    } else {
      qenc[o++] = c;
    }
  }
  qenc[o] = '\0';

  char url[256];
  snprintf(url, sizeof(url),
           "https://api.openweathermap.org/geo/1.0/direct?q=%s&limit=1&appid=%s",
           qenc, apiKey);

  String body;
  int code = 0;
  if (!httpGet(url, body, &code)) {
    snprintf(lastError, sizeof(lastError), "geo http %d", code);
    return false;
  }
  if (body.indexOf('[') < 0 || body.indexOf('{') < 0) {
    setError("geo: city not found");
    return false;
  }
  float la = NAN, lo = NAN;
  jsonFindNumber(body, "lat", &la);
  jsonFindNumber(body, "lon", &lo);
  if (!isfinite(la) || !isfinite(lo)) {
    setError("geo: no coords");
    return false;
  }
  *outLat = la;
  *outLon = lo;
  return true;
}

inline bool fetchOnce() {
  if (fetchInFlight) return false;
  if (WiFi.status() != WL_CONNECTED) {
    setError("wifi down");
    return false;
  }
  if (!configured()) {
    setError("not configured");
    return false;
  }

  fetchInFlight = true;

  float la = lat;
  float lo = lon;
  if ((!isfinite(la) || !isfinite(lo)) && query[0]) {
    if (!geocodeQuery(&la, &lo)) {
      fetchInFlight = false;
      nextFetchDueMs = millis() + 60000;
      return false;
    }
  }
  if (!isfinite(la) || !isfinite(lo)) {
    setError("need city or lat/lon");
    fetchInFlight = false;
    return false;
  }

  const char* units = unitsMetric ? "metric" : "imperial";
  char url[320];
  // Keep hourly + daily for forecast slots; drop minutely/alerts.
  snprintf(url, sizeof(url),
           "https://api.openweathermap.org/data/3.0/onecall?lat=%.4f&lon=%.4f"
           "&exclude=minutely,alerts&units=%s&appid=%s",
           la, lo, units, apiKey);

  String body;
  int code = 0;
  if (!httpGet(url, body, &code)) {
    snprintf(lastError, sizeof(lastError), "http %d", code);
    fetchInFlight = false;
    nextFetchDueMs = millis() + 60000;
    return false;
  }
  fetchInFlight = false;

  applyPayload(body);
  if (!haveData) return false;

  nextFetchDueMs = millis() + PF_WEATHER_POLL_MS;
  char uvBuf[16] = "-";
  if (haveUv) snprintf(uvBuf, sizeof(uvBuf), "%.2f", uvIndex);
  Serial.printf("[WEATHER] 3.0 %s  %.1fC feel %.1f hum %.0f  %.0fhPa  "
                "wind %.1fm/s %.0fdeg  cld %.0f%%  UV %s\n",
                condition, tempC, feelsC, humidity, pressureHpa,
                windSpeedMs, windDeg, cloudsPct, uvBuf);
  return true;
}

inline void requestFetch() {
  nextFetchDueMs = 0;  // due immediately on next handle()
}

inline void handle() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (upstreamFlowLocal) {
    uint32_t now = millis();
    // Island path only — never OpenWeather/SNTP here.
    // At most one blocking HTTP per handle() so the web console can breathe.
    if (!ntpStarted &&
        (nextFlTimeDueMs == 0 || (int32_t)(now - nextFlTimeDueMs) >= 0)) {
      syncTimeFromFlowLocal();
      return;
    }
    if (nextFetchDueMs != 0 && (int32_t)(now - nextFetchDueMs) < 0) return;
    nextFetchDueMs = now + FL_WEATHER_RETRY_MS;
    if (fetchFromFlowLocal()) recomputeKnobs();
    return;
  }
  // Normal / Director: internet NTP + optional OpenWeather only.
  if (!ntpStarted) beginNtp();
  if (!enabled) return;
  if (!configured()) return;
  uint32_t now = millis();
  if (nextFetchDueMs != 0 && (int32_t)(now - nextFetchDueMs) < 0) return;
  fetchOnce();
}

inline void loadConfig() {
  Preferences prefs;
  if (!prefs.begin("patternflow", true)) return;
  enabled = prefs.getBool("wx_en", false);
  unitsMetric = prefs.getBool("wx_metric", true);
  tzOffsetMin = (int16_t)prefs.getInt("wx_tz", 0);
  clockOverlay = prefs.getBool("wx_clock", false);
  layoutExtended = prefs.getBool("wx_ext", false);
  if (prefs.isKey("wx_key")) prefs.getString("wx_key", apiKey, sizeof(apiKey));
  if (prefs.isKey("wx_q")) prefs.getString("wx_q", query, sizeof(query));
  if (prefs.isKey("wx_lat")) lat = prefs.getFloat("wx_lat", NAN);
  if (prefs.isKey("wx_lon")) lon = prefs.getFloat("wx_lon", NAN);
  prefs.end();
  if (enabled && configured()) requestFetch();
}

inline void saveConfig(bool en, const char* key, const char* q,
                       float la, float lo, bool metric, int16_t tzMin,
                       bool showClock, bool extended, bool newKey) {
  enabled = en;
  unitsMetric = metric;
  tzOffsetMin = tzMin;
  clockOverlay = showClock;
  layoutExtended = extended;
  if (q) {
    snprintf(query, sizeof(query), "%s", q);
  }
  lat = la;
  lon = lo;
  if (newKey && key) {
    snprintf(apiKey, sizeof(apiKey), "%s", key);
  }

  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.putBool("wx_en", enabled);
    prefs.putBool("wx_metric", unitsMetric);
    prefs.putBool("wx_clock", clockOverlay);
    prefs.putBool("wx_ext", layoutExtended);
    prefs.putInt("wx_tz", (int32_t)tzOffsetMin);
    prefs.putString("wx_q", query);
    prefs.putFloat("wx_lat", lat);
    prefs.putFloat("wx_lon", lon);
    if (newKey && key) prefs.putString("wx_key", apiKey);
    prefs.end();
  }
  // Re-apply NTP with the new offset (safe to call repeatedly).
  if (WiFi.status() == WL_CONNECTED) beginNtp();
  if (enabled) requestFetch();
}

inline void forget() {
  enabled = false;
  apiKey[0] = '\0';
  query[0] = '\0';
  lat = NAN;
  lon = NAN;
  tzOffsetMin = 0;
  haveData = false;
  condition[0] = '\0';
  description[0] = '\0';
  iconCode[0] = '\0';
  lastError[0] = '\0';
  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.putBool("wx_en", false);
    prefs.putInt("wx_tz", 0);
    prefs.remove("wx_key");
    prefs.remove("wx_q");
    prefs.remove("wx_lat");
    prefs.remove("wx_lon");
    prefs.end();
  }
}

#else  // !PF_WEATHER_ENABLED

inline void loadConfig() {}
inline void handle() {}
inline void beginNtp() {}
inline bool fetchOnce() { return false; }
inline void requestFetch() {}
inline void setFlowLocalUpstream(const char*) {}
inline void clearFlowLocalUpstream() {}
inline bool driving() { return false; }
inline bool isActive(int) { return false; }
inline float value(int) { return 0.0f; }
inline bool isEnabled() { return false; }
inline bool hasData() { return false; }
inline bool configured() { return false; }
inline bool hasApiKey() { return false; }
inline const char* error() { return ""; }
inline const char* conditionMain() { return ""; }
inline const char* conditionDesc() { return ""; }
inline const char* owmIcon() { return ""; }
inline float temperatureC() { return 0; }
inline float feelsLikeC() { return 0; }
inline float humidityPct() { return 0; }
inline float pressure() { return 0; }
inline float windMs() { return 0; }
inline float windKmh() { return 0; }
inline float windMph() { return 0; }
inline float windDirectionDeg() { return 0; }
inline float cloudCoverPct() { return 0; }
inline float uv() { return NAN; }
inline bool hasUv() { return false; }
inline const char* windCompass() { return "N"; }
inline int conditionId() { return 0; }
inline int16_t timezoneOffsetMin() { return 0; }
inline bool clockOverlayEnabled() { return false; }
inline bool isLayoutExtended() { return false; }
inline int8_t pressureTrendArrow() { return 0; }
inline const ForecastSlot& forecastSlot(int) {
  static ForecastSlot empty;
  return empty;
}
inline uint32_t ageMs() { return 0; }
inline void refreshLocalTime() {}
inline bool timeSynced() { return false; }
inline bool isNight() { return false; }
inline int localHour() { return 12; }
inline int localMinute() { return 0; }
inline int localSecond() { return 0; }
inline int localMinutes() { return 12 * 60; }
inline int localDayKey() { return -1; }

#endif

}  // namespace PatternflowWeather
