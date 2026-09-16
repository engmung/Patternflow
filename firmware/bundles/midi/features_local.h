// ═══════════════════════════════════════════════════════════
// Patternflow MIDI — which features this edition compiles in
//
// The MIDI feature alone: the map, the page, RTP-MIDI over Wi-Fi - and, in
// this edition, the DevKit's USB port as a class-compliant MIDI device. The
// USB transport is not a second feature but a part of this one that compiles
// in when the build's USB port is the OTG stack, which is what the
// firmware_midi env sets (see `env` next to this file, and platformio.ini):
// whether that port is a serial console or any device class is a compile-time
// choice of the Arduino core, not a setting.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "midi/feature_midi.h"

#define PF_FEATURE_LIST &PFFeatureMidi::descriptor
