// ═══════════════════════════════════════════════════════════
// PatternFlow - wall clock (NTP + timezone), no weather attached
//
// The night/wake scheduler needs six things: "is time known", hour, minute,
// second, minutes-since-midnight, and a day key. In Simone's fork those live
// inside core_weather.h; this carves out exactly that slice so the on-device
// show scheduler works without the OpenWeather stack. If full Weather lands
// later it can include this instead of re-owning the clock — the NVS key
// (patternflow/wx_tz) is deliberately the same one his Weather page writes,
// so a timezone set by either survives the other.
//
// One fix over the fork: his cached tm refreshes only until the first
// success, which would freeze a clock face at its first reading. Here every
// accessor funnels through a 500 ms throttled refresh.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <time.h>

namespace PatternflowClock {

inline int16_t tzOffsetMin = 0;  // local = UTC + this many minutes
inline bool ntpStarted = false;

inline struct tm cachedTm = {};
inline bool cachedOk = false;
inline uint32_t cachedAtMs = 0;

inline void beginNtp() {
  if (ntpStarted) return;
  // Offset is minutes east of UTC (e.g. Seoul +540, Rome +60 / +120 DST).
  configTime((long)tzOffsetMin * 60L, 0, "pool.ntp.org", "time.google.com");
  ntpStarted = true;
  Serial.printf("[CLOCK] NTP started (UTC%+d min)\n", (int)tzOffsetMin);
}

inline void maybeRefresh() {
  uint32_t now = millis();
  if (cachedOk && (now - cachedAtMs) < 500) return;
  cachedAtMs = now;
  time_t n = time(nullptr);
  if (n < 1609459200LL) {  // pre-2021 means SNTP has not settled
    cachedOk = false;
    return;
  }
  cachedOk = (localtime_r(&n, &cachedTm) != nullptr);
}

inline bool timeSynced() {
  if (WiFi.status() == WL_CONNECTED && !ntpStarted) beginNtp();
  maybeRefresh();
  return cachedOk && cachedTm.tm_year >= (2020 - 1900);
}

inline int localHour() {
  maybeRefresh();
  return cachedOk ? cachedTm.tm_hour : 12;
}

inline int localMinute() {
  maybeRefresh();
  return cachedOk ? cachedTm.tm_min : 0;
}

inline int localSecond() {
  maybeRefresh();
  return cachedOk ? cachedTm.tm_sec : 0;
}

inline int localMinutes() { return localHour() * 60 + localMinute(); }

inline int localDayKey() {
  maybeRefresh();
  if (!cachedOk) return -1;
  return cachedTm.tm_year * 400 + cachedTm.tm_yday;
}

inline int16_t timezoneOffsetMin() { return tzOffsetMin; }

inline void setTimezoneOffsetMin(int tzMin) {
  if (tzMin < -720) tzMin = -720;
  if (tzMin > 840) tzMin = 840;
  tzOffsetMin = (int16_t)tzMin;
  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.putInt("wx_tz", (int32_t)tzOffsetMin);
    prefs.end();
  }
  // Re-apply so the running SNTP session picks the new offset up.
  if (ntpStarted) {
    configTime((long)tzOffsetMin * 60L, 0, "pool.ntp.org", "time.google.com");
  }
  cachedOk = false;
}

inline void loadConfig() {
  Preferences prefs;
  if (!prefs.begin("patternflow", true)) return;
  tzOffsetMin = (int16_t)prefs.getInt("wx_tz", 0);
  prefs.end();
}

}  // namespace PatternflowClock
