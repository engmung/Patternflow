// ═══════════════════════════════════════════════════════════
// PatternFlow - audio-react feature: compile-time defaults
//
// Read only when a composition carries features/audio/. Every value is
// #ifndef-guarded: patternflow_secrets.h (per device) and a composition's
// overrides.h (per edition) are included before this through config.h, so
// whatever they define wins and the lines below fill in the rest.
//
// These lived in net_config.h until 2026-09; a feature's settings belong next
// to the feature that reads them. The lane scale (PF_LANE_MOTION_SCALE) is
// NOT here: it is the core's, because weather and shows drive the same lanes.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "../../config.h"

// Hosts a tiny UI on the device. A browser (or the phone app) captures audio,
// runs an FFT, and pushes each band's energy as a normalized 0..1 value over
// WebSocket. The core's input layer turns that into virtual knob deltas, so
// EVERY encoder-driven pattern reacts to audio with no per-pattern code.
#ifndef PF_AUDIO_ENABLED
#define PF_AUDIO_ENABLED 1
#endif
// The same port 80 the console lives on (PatternflowHttp::HTTP_PORT); this is
// the audio module's own alias for it and nothing else should need it.
#ifndef PF_AUDIO_HTTP_PORT
#define PF_AUDIO_HTTP_PORT 80
#endif
#ifndef PF_AUDIO_WS_PORT
#define PF_AUDIO_WS_PORT 81
#endif
