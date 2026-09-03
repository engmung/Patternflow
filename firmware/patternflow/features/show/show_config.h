// ═══════════════════════════════════════════════════════════
// PatternFlow - show player feature: compile-time defaults
//
// Read only when a composition carries features/show/. #ifndef-guarded like
// every feature setting: patternflow_secrets.h and a composition's
// overrides.h are included before this through config.h and win.
//
// This lived in net_config.h until 2026-09, with a note that /api/status
// needed to see it to build its `caps` list. It no longer does: capabilities
// are reported by the features that are compiled in, so a flag defined only
// inside the feature it guards is exactly right.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "../../config.h"

// The .pfs sequences page (/show) and its API.
#ifndef PF_SHOW_HTTP_ENABLED
#define PF_SHOW_HTTP_ENABLED 1
#endif
