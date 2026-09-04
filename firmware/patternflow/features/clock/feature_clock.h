// ═══════════════════════════════════════════════════════════
// PatternFlow - a clock, as a feature
//
// The time, cut out of whatever pattern is running: huge digits that the
// pattern shows through, or solid ones on it, in a choice of faces; the
// time zone as a real zone with its DST rule rather than an offset.
//
// Two ports before this one drew a clock - weather's corner HH:MM:SS and
// the show scheduler's face on Black - and the core already keeps the time
// (src/core_clock.h) precisely because "what time is it" was never a weather
// question. This is the other half of that observation: neither is showing
// it. So the clock is its own feature, in any composition that wants one,
// with nothing else attached.
//
// It is also the first feature on the composeFrame hook: it draws on the
// frame's way to the panel, with alpha, rather than over the panel after
// the fact. Hooks: setup, onNetwork, loop, appendStatus, composeFrame, nav.
// Core edits: the POSIX-zone entry points in core_clock.h, and that hook.
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

inline void loop(const PFFeatureFrame& frame) {
  PatternflowClockFace::noteFrame(frame);
  PatternflowClockFace::assertZone();
}

inline void appendStatus(String& json) {
  json += ",\"clock\":{\"on\":";
  json += PatternflowClockFace::enabled ? "true" : "false";
  json += ",\"synced\":";
  json += PatternflowClockFace::synced() ? "true" : "false";
  json += ",\"face\":";
  json += (int)PatternflowClockFace::face;
  json += ",\"tz\":\"";
  for (const char* p = PatternflowClockFace::tz; *p; ++p) {
    if (*p == '"' || *p == '\\') json += '\\';
    json += *p;
  }
  json += "\"}";
}

inline const uint8_t* composeFrame(const uint8_t* frame, int w, int h) {
  return PatternflowClockFace::compose(frame, w, h);
}

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
    nullptr,       // drawOverlay - this feature composes instead
    "/clock",      // navPath - the console header link
    "Clock",       // navLabel
    "The time cut out of the running pattern: the face, the zone, what "
    "fills the digits and what surrounds them.",
    composeFrame,
};

}  // namespace PFFeatureClock
