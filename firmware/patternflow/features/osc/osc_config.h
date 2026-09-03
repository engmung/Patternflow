// ═══════════════════════════════════════════════════════════
// PatternFlow - OSC feature: compile-time defaults
//
// Read only when a composition carries features/osc/. Every value is
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

// Sends knob/button/state out and accepts knob/pattern/content commands back.
//
// On by default so that a build from a clean checkout matches the firmware we
// release. It used to be opt-in from patternflow_secrets.h, but that file is
// gitignored — so anyone building without one (a fresh clone, CI, the web
// build service) silently got firmware with OSC missing, showing "OSC n/a" on
// the knob-2 status screen while everything else looked right.
//
// Costs nothing when unused: with no remote configured it only listens, and
// sends nothing until something talks to it first. Set to 0 in
// patternflow_secrets.h to compile it out of an edition that carries it.
#ifndef PF_OSC_ENABLED
#define PF_OSC_ENABLED 1
#endif
// Where outgoing OSC goes. Leave EMPTY (the default) to auto-learn: the
// device locks onto whoever sends it the first valid OSC packet — the M4L
// bridge's Connect button (/patternflow/ping) does exactly that. Set a
// static IP here only if the host side can't send ("send-only" setups).
#ifndef PF_OSC_REMOTE_HOST
#define PF_OSC_REMOTE_HOST ""
#endif
#ifndef PF_OSC_REMOTE_PORT
#define PF_OSC_REMOTE_PORT 9000
#endif
#ifndef PF_OSC_LOCAL_PORT
#define PF_OSC_LOCAL_PORT 9001
#endif
