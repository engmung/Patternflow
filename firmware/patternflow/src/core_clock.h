// ═══════════════════════════════════════════════════════════
// PatternFlow - local wall time
//
// What time it is, in the user's timezone. NTP fills the libc clock; this
// caches a reading of it and hands out the fields anyone needs.
//
// It lived inside core_weather.h because weather was the first feature to
// want a clock — the same accident that put the web server inside audio and
// the parameter bus inside MQTT. But "what time is it" is not a weather
// question: a night/wake scheduler needs it, a corner clock needs it, and a
// build with no weather in it still has a timezone. So it sits in the core
// and features read from it.
//
// It costs nothing when unused. Until something calls beginSync() — the
// weather feature does, from its timezone setting; an IoT or alarm feature
// would too — every reader short-circuits on `started` and no clock code
// runs at all. A build with no time-aware feature in it pays zero.
//
// The caching is not an optimization, it is a correctness fix: getLocalTime()
// fails intermittently under Wi-Fi/CPU load, and a text path that asks for
// the time several times per frame produced flickering digits (often :00).
// One snapshot per 500 ms, read as often as you like.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

namespace PatternflowClock {

// False until a feature asks for time to exist. Every accessor below
// returns its fallback immediately while this is false.
inline bool started = false;

inline struct tm cachedTm = {};
inline bool cachedOk = false;
inline uint32_t cachedAtMs = 0;
constexpr uint32_t REFRESH_MS = 500;

// Start SNTP for a timezone given as minutes east of UTC. Whoever owns the
// timezone setting calls this — the core does not care where it came from.
inline void beginSync(int tzOffsetMinutes) {
  started = true;
  configTime((long)tzOffsetMinutes * 60L, 0, "pool.ntp.org", "time.google.com");
}

// The same, for a zone given as a POSIX TZ string ("KST-9",
// "CET-1CEST,M3.5.0,M10.5.0/3") - the form the C library reads, and the only
// one that carries a DST rule. A minutes offset cannot say when summer time
// starts.
inline void beginSyncTz(const char* posixTz) {
  if (!posixTz || !posixTz[0]) return;
  started = true;
  configTzTime(posixTz, "pool.ntp.org", "time.google.com");
  cachedOk = false;  // the caller's next read is already in the new zone
}

// Put TZ back if something else has set it, without touching SNTP. Two
// features may each hold a zone setting; whichever owns it calls this from
// its loop. The check is a strcmp, so calling it often costs nothing.
inline void assertTz(const char* posixTz) {
  if (!posixTz || !posixTz[0]) return;
  const char* cur = getenv("TZ");
  if (cur && strcmp(cur, posixTz) == 0) return;
  setenv("TZ", posixTz, 1);
  tzset();
  cachedOk = false;  // the next reader re-derives local time in the new zone
}

inline void refresh() {
  if (!started) return;
  time_t n = time(nullptr);
  // Before SNTP settles, time() can be 1970 — treat as unsynced.
  if (n < 1609459200LL) {  // 2021-01-01 UTC
    cachedOk = false;
    return;
  }
  cachedOk = (localtime_r(&n, &cachedTm) != nullptr);
}

// Readers call this; it is what makes the clock lazy. One snapshot per
// REFRESH_MS however many times a frame asks, and nothing at all before
// beginSync().
inline void ensure() {
  if (!started) return;
  uint32_t now = millis();
  if (cachedOk && (now - cachedAtMs) < REFRESH_MS) return;
  refresh();
  cachedAtMs = now;
}

inline bool localTime(struct tm* out) {
  if (!out) return false;
  ensure();
  if (!cachedOk) return false;
  *out = cachedTm;
  return true;
}

inline bool synced() {
  ensure();
  return cachedOk && cachedTm.tm_year >= (2020 - 1900);
}

inline int hour() {
  ensure();
  return cachedOk ? cachedTm.tm_hour : 12;
}

inline int minute() {
  ensure();
  return cachedOk ? cachedTm.tm_min : 0;
}

inline int second() {
  ensure();
  return cachedOk ? cachedTm.tm_sec : 0;
}

inline int minutesOfDay() { return hour() * 60 + minute(); }

// Stable per-calendar-day key, for "has this already fired today".
inline int dayKey() {
  ensure();
  if (!cachedOk) return -1;
  return cachedTm.tm_year * 400 + cachedTm.tm_yday;
}

}  // namespace PatternflowClock
