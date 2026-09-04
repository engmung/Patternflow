// ═══════════════════════════════════════════════════════════
// Patternflow Clock — which features this edition carries
//
// A panel that tells the time: the hours and minutes cut out of whatever
// pattern is running, in a choice of faces. Nothing else — no broker, no
// sequences, no sound, no weather — because a clock on a shelf should not
// have to carry a control surface to exist.
//
//   clock     the time composed into the frame on its way to the panel;
//             the zone with its DST rule; /clock with a live preview
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "clock/feature_clock.h"

#define PF_FEATURE_LIST &PFFeatureClock::descriptor
