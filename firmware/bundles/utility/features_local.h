// ═══════════════════════════════════════════════════════════
// Patternflow Utility — which features this edition carries
//
// A panel that also tells you things: the time over whatever pattern is
// running, and the weather outside as light. Nothing that drives the
// panel from elsewhere — no broker, no sequences, no sound — because a
// clock on a shelf should not have to carry a control surface to exist.
//
//   clock     a wall clock drawn over the running pattern: zone with its
//             DST rule, a corner or the centre, three sizes, seconds, date
//   weather   OpenWeather readings on the knob lanes, and the /weather page
//
// Order is dispatch order. Weather first: it starts NTP from its own UTC
// offset when it comes up, and the clock, coming after, sets the zone last
// and keeps it — the clock owns the time zone in this edition.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "weather/feature_weather.h"
#include "clock/feature_clock.h"

#define PF_FEATURE_LIST              \
  &PFFeatureWeather::descriptor,     \
      &PFFeatureClock::descriptor
