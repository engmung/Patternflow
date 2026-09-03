// ═══════════════════════════════════════════════════════════
// PatternFlow - weather feature: compile-time defaults
//
// Read only when a composition carries features/weather/. Every value is
// #ifndef-guarded: patternflow_secrets.h (per device) and a composition's
// overrides.h (per edition) are included before this through config.h, so
// whatever they define wins and the lines below fill in the rest.
//
// These lived in net_config.h until 2026-09; a feature's settings belong next
// to the feature that reads them.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "../../config.h"

// OpenWeather current conditions / the FlowLocal island. Fetched over HTTPS;
// /weather stores API key + location in NVS. The clock overlay and the
// night/wake schedule read local time from here; knob channels 1..4 can
// carry condition / temp / humidity / feels-like.
#ifndef PF_WEATHER_ENABLED
#define PF_WEATHER_ENABLED 1
#endif
#ifndef PF_WEATHER_HTTP_ENABLED
#define PF_WEATHER_HTTP_ENABLED PF_WEATHER_ENABLED
#endif
#ifndef PF_WEATHER_POLL_MS
#define PF_WEATHER_POLL_MS (30UL * 60UL * 1000UL)  // every 30 minutes
#endif
// Linear map for temp / feels-like -> knob 0..1 (metric C).
#ifndef PF_WEATHER_TEMP_MIN_C
#define PF_WEATHER_TEMP_MIN_C (-20.0f)
#endif
#ifndef PF_WEATHER_TEMP_MAX_C
#define PF_WEATHER_TEMP_MAX_C (40.0f)
#endif
