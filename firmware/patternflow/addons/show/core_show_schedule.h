// ═══════════════════════════════════════════════════════════
// PatternFlow - night / wake schedule for the on-device player
//
// Local wall clock (Weather NTP + timezone). Night start → Black;
// wake time (end of night) → play a .pfs once (loop forced off);
// natural end → Black + large clock; optional 5-minute repeat until
// a physical knob/click, Sequences Stop, or SELECT. Does not fire
// when NTP is unsynced.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <stdio.h>
#include <string.h>

#include "../../src/core_mqtt.h"
#include "core_show.h"
#include "../../src/core_ui_text.h"
#include "../../src/core_weather.h"
#include "../../pattern_registry.h"

namespace PatternflowShowSchedule {

constexpr uint32_t SNOOZE_MS = 5UL * 60UL * 1000UL;
constexpr uint8_t DIM_DEFAULT = 15;
constexpr size_t SLUG_BYTES = PatternflowShow::SLUG_BYTES;

enum Phase : uint8_t { Idle = 0, Night = 1, Wake = 2, Snooze = 3 };

inline bool enabled = false;
inline uint8_t nightHour = 23;
inline uint8_t nightMin = 0;
inline uint8_t wakeHour = 7;
inline uint8_t wakeMin = 0;
inline char wakeSlug[SLUG_BYTES] = {};
inline bool repeatUntilInteract = true;
inline bool nightClock = true;
inline uint8_t nightDimPct = DIM_DEFAULT;

inline Phase phase = Idle;
inline int lastWakeDay = -1;
inline uint32_t snoozeAtMs = 0;

inline int nightMinutes() { return (int)nightHour * 60 + (int)nightMin; }
inline int wakeMinutes() { return (int)wakeHour * 60 + (int)wakeMin; }

inline bool inNightWindow(int nowM) {
  int a = nightMinutes();
  int b = wakeMinutes();
  if (a == b) return false;
  if (a < b) return nowM >= a && nowM < b;
  return nowM >= a || nowM < b;
}

inline const char* phaseName() {
  switch (phase) {
    case Night: return "night";
    case Wake: return "wake";
    case Snooze: return "snooze";
    default: return "idle";
  }
}

inline void setFace(Black::Face f) { Black::face = f; }

inline void goBlack(Black::Face f) {
  setFace(f);
  PatternflowShow::queuePattern("Black");
}

inline void enterNight() {
  PatternflowShow::stopAll();
  PatternflowMqtt::applyHeldMessage("");
  phase = Night;
  goBlack(nightClock ? Black::Dim : Black::Off);
}

inline void enterSnooze() {
  PatternflowShow::stopAll();
  PatternflowMqtt::applyHeldMessage("");
  phase = Snooze;
  snoozeAtMs = millis();
  goBlack(Black::Big);
}

inline void startWake() {
  lastWakeDay = PatternflowWeather::localDayKey();
  setFace(Black::Off);
  phase = Wake;
  PatternflowMqtt::applyHeldMessage("");
  if (wakeSlug[0]) {
    const char* err = "";
    if (PatternflowShow::playSlug(wakeSlug, &err)) {
      PatternflowShow::setLoop(false);
      return;
    }
  }
  enterSnooze();
}

inline void noteInteraction() {
  if (phase != Wake && phase != Snooze) return;
  bool wasSnooze = (phase == Snooze);
  PatternflowShow::stopAll();
  PatternflowShow::consumeFinished();
  setFace(Black::Off);
  phase = Idle;
  if (wasSnooze) PatternflowShow::queuePattern("Origin");
}

inline bool inAlarmCycle() { return phase == Wake || phase == Snooze; }

inline void formatHm(char* out, size_t n, uint8_t h, uint8_t m) {
  snprintf(out, n, "%02u:%02u", (unsigned)h, (unsigned)m);
}

inline bool parseHm(const char* s, uint8_t& h, uint8_t& m) {
  if (!s || !s[0]) return false;
  int hh = 0, mm = 0;
  if (sscanf(s, "%d:%d", &hh, &mm) != 2) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
  h = (uint8_t)hh;
  m = (uint8_t)mm;
  return true;
}

inline void save() {
  Preferences prefs;
  if (!prefs.begin("pfshow", false)) return;
  prefs.putBool("en", enabled);
  prefs.putUShort("nstart", (uint16_t)nightMinutes());
  prefs.putUShort("wake", (uint16_t)wakeMinutes());
  prefs.putString("slug", wakeSlug);
  prefs.putBool("rpt", repeatUntilInteract);
  prefs.putBool("nclk", nightClock);
  prefs.putUChar("ndim", nightDimPct);
  prefs.end();
}

inline void load() {
  Preferences prefs;
  if (!prefs.begin("pfshow", true)) return;
  enabled = prefs.getBool("en", false);
  uint16_t ns = prefs.getUShort("nstart", 23 * 60);
  uint16_t wk = prefs.getUShort("wake", 7 * 60);
  if (ns > 23 * 60 + 59) ns = 23 * 60;
  if (wk > 23 * 60 + 59) wk = 7 * 60;
  nightHour = (uint8_t)(ns / 60);
  nightMin = (uint8_t)(ns % 60);
  wakeHour = (uint8_t)(wk / 60);
  wakeMin = (uint8_t)(wk % 60);
  if (prefs.isKey("slug")) prefs.getString("slug", wakeSlug, sizeof(wakeSlug));
  repeatUntilInteract = prefs.getBool("rpt", true);
  nightClock = prefs.getBool("nclk", true);
  nightDimPct = prefs.getUChar("ndim", DIM_DEFAULT);
  if (nightDimPct < 5) nightDimPct = 5;
  if (nightDimPct > 40) nightDimPct = 40;
  prefs.end();
}

inline void begin() { load(); }

inline bool applyConfig(bool en, const char* nightAt, const char* wakeAt,
                        const char* slug, bool repeat, bool clock,
                        int dimPct) {
  uint8_t nh = nightHour, nm = nightMin, wh = wakeHour, wm = wakeMin;
  if (nightAt && nightAt[0] && !parseHm(nightAt, nh, nm)) return false;
  if (wakeAt && wakeAt[0] && !parseHm(wakeAt, wh, wm)) return false;
  enabled = en;
  nightHour = nh;
  nightMin = nm;
  wakeHour = wh;
  wakeMin = wm;
  if (slug) {
    size_t n = 0;
    for (const char* p = slug; *p && n + 1 < sizeof(wakeSlug); ++p) {
      char c = *p;
      bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                (c >= '0' && c <= '9') || c == '_' || c == '-';
      if (ok) wakeSlug[n++] = c;
    }
    wakeSlug[n] = '\0';
  }
  repeatUntilInteract = repeat;
  nightClock = clock;
  if (dimPct < 5) dimPct = 5;
  if (dimPct > 40) dimPct = 40;
  nightDimPct = (uint8_t)dimPct;
  save();
  if (!enabled) {
    PatternflowShow::consumeFinished();
    if (phase == Wake) PatternflowShow::stopAll();
    setFace(Black::Off);
    phase = Idle;
  }
  return true;
}

inline void tick(const char* currentName, bool running) {
  bool finished = PatternflowShow::consumeFinished();
  if (!enabled) return;

  if (finished && phase == Wake) {
    enterSnooze();
  } else if (finished && phase == Night) {
    goBlack(nightClock ? Black::Dim : Black::Off);
  }

  if (phase == Wake) PatternflowShow::setLoop(false);

  if (!PatternflowWeather::timeSynced()) return;

  int nowM = PatternflowWeather::localMinutes();
  int day = PatternflowWeather::localDayKey();
  bool night = inNightWindow(nowM);
  bool playing = PatternflowShow::isPlaying();

  if (night) {
    if (phase == Idle || phase == Snooze) enterNight();
  } else if (phase == Night) {
    startWake();
    playing = PatternflowShow::isPlaying();
  } else if (phase == Idle && nowM == wakeMinutes() && day != lastWakeDay) {
    startWake();
    playing = PatternflowShow::isPlaying();
  }

  if (phase == Snooze && repeatUntilInteract &&
      (int32_t)(millis() - snoozeAtMs) >= (int32_t)SNOOZE_MS) {
    startWake();
    playing = PatternflowShow::isPlaying();
  }

  if (!running || playing) return;
  bool isBlack = currentName && strcmp(currentName, "Black") == 0;
  if (phase == Night) {
    setFace(nightClock ? Black::Dim : Black::Off);
    if (!isBlack) goBlack(nightClock ? Black::Dim : Black::Off);
  } else if (phase == Snooze) {
    setFace(Black::Big);
    if (!isBlack) goBlack(Black::Big);
  }
}

inline void drawOwnedClock() {
  if (Black::face == Black::Off) return;
  if (!PatternflowWeather::timeSynced()) return;
  if (!dma_display) return;

  char buf[12];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d",
           PatternflowWeather::localHour(), PatternflowWeather::localMinute(),
           PatternflowWeather::localSecond());

  uint8_t level = 245;
  if (Black::face == Black::Dim) {
    uint16_t v = (uint16_t)255 * nightDimPct / 100;
    if (v < 8) v = 8;
    if (v > 255) v = 255;
    level = (uint8_t)v;
  }
  const uint16_t ink = dma_display->color565(level, level, level);

  uiUseTitleFont();
  int16_t x1, y1;
  uint16_t w, h;
  uiTitleTextBounds(buf, &x1, &y1, &w, &h);
  int x = (dma_display->width() - (int)w) / 2;
  int y = (dma_display->height() - (int)h) / 2;
  uiDrawOutlinedTitleAtBaseline(buf, x - x1, y - y1, ink);
  uiUseDefaultFont();
}

inline uint32_t snoozeRemainingMs() {
  if (phase != Snooze || !repeatUntilInteract) return 0;
  int32_t left = (int32_t)SNOOZE_MS - (int32_t)(millis() - snoozeAtMs);
  if (left < 0) return 0;
  return (uint32_t)left;
}

}  // namespace PatternflowShowSchedule
