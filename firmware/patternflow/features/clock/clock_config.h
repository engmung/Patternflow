// ═══════════════════════════════════════════════════════════
// PatternFlow - clock feature: compile-time defaults
//
// Read only when a composition carries features/clock/. Every value is
// #ifndef-guarded: patternflow_secrets.h (per device) and a composition's
// overrides.h (per edition) are included before this through config.h, so
// whatever they define wins and the lines below fill in the rest.
//
// Settings TUNE the feature; a person changes the rest on /clock and it lives
// in NVS (namespace "pfclock").
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "../../config.h"

#ifndef PF_CLOCK_ENABLED
#define PF_CLOCK_ENABLED 1
#endif
#ifndef PF_CLOCK_HTTP_ENABLED
#define PF_CLOCK_HTTP_ENABLED PF_CLOCK_ENABLED
#endif

// The time zone a fresh panel starts in, as a POSIX TZ string — the form
// the C library reads, DST rules included ("CET-1CEST,M3.5.0,M10.5.0/3").
// Note the inverted sign: UTC+9 is "KST-9". /clock offers a picker; this is
// only what stands before anyone has picked.
#ifndef PF_CLOCK_DEFAULT_TZ
#define PF_CLOCK_DEFAULT_TZ "UTC0"
#endif

// How often the loop hook re-asserts the zone. Another feature may set the
// C library's TZ from its own setting (weather's UTC-offset field does, on
// save); the clock is the zone's owner and puts it back within this long.
#ifndef PF_CLOCK_ASSERT_MS
#define PF_CLOCK_ASSERT_MS 1000
#endif
