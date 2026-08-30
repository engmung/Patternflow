// ═══════════════════════════════════════════════════════════
// Patternflow Audio — what this firmware is, in one file.
//
// The core's features/features.h includes this if it is present and steps aside
// if it is not. Nothing in the core tree is edited, which is why build.sh is
// three lines of `cp` and taking a core update is `cd core && git checkout
// <newer tag>`.
//
// Sound in, sound out, and nothing else:
//
//   osc       Max, TouchDesigner, Ableton. Knob and pattern control both
//             directions over UDP. Was core until it was pointed out that
//             "needs no infrastructure" is not a test anyone can apply
//             evenly — OSC is sound integration and belongs here.
//   audio     The browser path: /audio in the device console, plus the
//             websocket the Chrome extension speaks. Four FFT bands off a
//             tab or a mic, driving the four knobs.
//   audio_in  On-board sound. A PDM microphone on the panel itself, so the
//             thing works with no computer in the room at all. Six of seven
//             people asked for this and it was the single most-wanted item
//             in the survey — more than every other option combined.
//
// Deliberately absent: the show player, weather, MQTT. This firmware is for
// people who point sound at a panel. If you want sequences or a broker, that
// is a different firmware and it is not this one.
//
// Order is dispatch order. OSC comes first because it only ASKS for a
// pattern; anything that CLAIMS one would starve it if it came earlier.
// ═══════════════════════════════════════════════════════════
#pragma once

#include "osc/feature_osc.h"
#include "audio/feature_audio.h"
#include "audio_in/feature_audio_in.h"

#define PF_FEATURE_LIST              \
  &PFFeatureOsc::descriptor,         \
      &PFFeatureAudio::descriptor,   \
      &PFFeatureAudioIn::descriptor
