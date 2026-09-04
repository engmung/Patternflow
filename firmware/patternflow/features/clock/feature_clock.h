// ═══════════════════════════════════════════════════════════
// PatternFlow - a clock, as a feature
//
// A wall clock over whatever pattern is running: a corner or the centre,
// three sizes, seconds, a date, twelve or twenty-four hours, a colour, and
// the time zone as a real zone with its DST rule rather than an offset.
//
// Two ports before this one drew a clock — weather's corner HH:MM:SS and
// the show scheduler's face on Black — and the core already keeps the time
// (src/core_clock.h) precisely because "what time is it" was never a weather
// question. This is the other half of that observation: neither is showing
// it. So the clock is its own feature, in any composition that wants one,
// with nothing else attached.
//
// Hooks: setup, onNetwork, loop, appendStatus, drawOverlay, nav. No core
// edits beyond the POSIX-zone entry point in core_clock.h.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_feature.h"
#include "core_clock_face.h"
#include "core_clock_http.h"

namespace PFFeatureClock {

inline void setup() { PatternflowClockFace::loadConfig(); }

inline void onNetwork() {
  PatternflowClockHttp::begin();
  // Every connect edge: SNTP against the zone this feature owns. Another
  // feature may also start it with its own offset; dispatch order and the
  // once-a-second re-assert below decide who is right, and it is this one.
  PatternflowClockFace::setTimezone(PatternflowClockFace::tz);
}

inline void loop(const PFFeatureFrame&) { PatternflowClockFace::assertZone(); }

inline void appendStatus(String& json) {
  json += ",\"clock\":{\"on\":";
  json += PatternflowClockFace::enabled ? "true" : "false";
  json += ",\"synced\":";
  json += PatternflowClockFace::synced() ? "true" : "false";
  json += ",\"tz\":\"";
  for (const char* p = PatternflowClockFace::tz; *p; ++p) {
    if (*p == '"' || *p == '\\') json += '\\';
    json += *p;
  }
  json += "\"}";
}

inline void drawOverlay(const PFFeatureFrame& frame) { PatternflowClockFace::draw(frame); }

inline const PFFeature descriptor = {
    "clock",
    "clock",       // cap - the site and the lab probe for this
    setup,
    onNetwork,
    loop,
    nullptr,       // observeFrame
    nullptr,       // fillInput
    nullptr,       // onUserInput
    nullptr,       // claimsPattern
    nullptr,       // takePattern
    nullptr,       // onSleep
    nullptr,       // requestSleep
    nullptr,       // shortName - not listed in the device menu
    nullptr,       // isRuntimeEnabled
    nullptr,       // setRuntimeEnabled
    appendStatus,
    drawOverlay,
    "/clock",      // navPath - the console header link
    "Clock",       // navLabel
    "A clock over any pattern: the zone, a corner or the centre, three sizes, "
    "seconds and the date.",
};

}  // namespace PFFeatureClock
