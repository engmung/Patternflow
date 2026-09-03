// ═══════════════════════════════════════════════════════════
// PatternFlow - the absolute parameter bus
//
// The four channels a pattern reads as absolute set-points (0..1000),
// alongside the physical encoders. A channel is HELD once something writes
// it, and released the moment a human turns that knob — so an automated
// source can pin a look and hands always win it back.
//
// This is not a feature: it is part of the module ABI. A pattern that
// declares ABSOLUTE_READY reads paramAbsolute/paramAbsoluteActive out of
// its InputFrame (abi/pf_params.h), so every build that loads modules has
// to carry the bus, whatever else it does or does not include.
//
// It lived inside core_mqtt.h because MQTT was the first thing to drive it,
// which made contract ground the property of one optional feature — the
// show player had to call PatternflowMqtt:: to move a knob. Whoever DRIVES
// the bus (MQTT, a show player, an HTTP route) is free to come and go; the
// bus itself stays here.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "core_encoders.h"  // InputFrame

// The wire scale of an absolute channel: 0..PF_BUS_MAX, integer. Everything
// that writes the bus — MQTT param/1..4, POST /api/params, a .pfs cue, a MIDI
// CC — speaks this scale, and the site's Director bakes to it
// (BUS_WIRE_MAX in web/src/lib/pattern/controls.ts). abi/pf_params.h clamps
// to the same literal and cannot be changed to this name: the ABI is frozen.
#define PF_BUS_MAX 1000

namespace PatternflowBus {

// Held until physical encoder motion releases a channel.
inline bool paramHeld[4] = {false, false, false, false};
inline uint16_t paramValue[4] = {500, 500, 500, 500};
inline uint32_t paramHeldAtMs[4] = {0, 0, 0, 0};
inline int16_t pendingDelta[4] = {0, 0, 0, 0};

// Last finished frame's knob positions, kept so the core can answer
// "where are the knobs" over HTTP. Absolute accumulated clicks, the
// same numbers a pattern sees and the same ones MQTT publishes.
inline long knobValue[4] = {0, 0, 0, 0};

// Ignore encoder chatter briefly after an absolute set (Director spam / noise).
constexpr uint32_t ABSOLUTE_RELEASE_GRACE_MS = 250;

inline void applyRemoteDelta(int index, int delta) {
  if (index < 0 || index > 3) return;
  pendingDelta[index] += delta;
}

// Write one channel and hold it. The only way a value enters the bus.
inline void applyRemoteParam(int index, long value) {
  if (index < 0 || index > 3) return;
  if (value < 0) value = 0;
  if (value > PF_BUS_MAX) value = PF_BUS_MAX;

  // Track delta for legacy patterns that only read knobDeltas:
  if (paramHeld[index]) {
    int diff = (int)value - (int)paramValue[index];
    if (diff != 0) {
      int d = diff / 10;
      if (d == 0) d = (diff > 0) ? 1 : -1;
      pendingDelta[index] += d;
    }
  }

  paramHeld[index] = true;
  paramValue[index] = (uint16_t)value;
  paramHeldAtMs[index] = millis();
}

inline void releaseAbsolute(int index) {
  if (index < 0 || index > 3) return;
  // Physical release only after grace — avoids encoder noise dropping holds.
  if (paramHeld[index] &&
      (millis() - paramHeldAtMs[index]) < ABSOLUTE_RELEASE_GRACE_MS) {
    return;
  }
  paramHeld[index] = false;
  pendingDelta[index] = 0;
}

inline void clearAbsoluteAll() {
  for (int i = 0; i < 4; ++i) {
    paramHeld[i] = false;
    paramHeldAtMs[i] = 0;
    pendingDelta[i] = 0;
  }
}

inline bool isHeld(int index) {
  return index >= 0 && index <= 3 && paramHeld[index];
}

// What the pattern actually sees on the absolute lanes, snapshotted once a
// frame after every source has been merged and every override applied.
//
// Not the same as asking a source whether it is sending: audio can be pushing
// a lane while the absolute bus holds it, or while a hand is on the encoder,
// and in both cases the pattern sees nothing. Reporting the source's intent
// instead of the arbitrated frame is how three separate measurements went
// wrong in one afternoon.
inline bool laneActive[4] = {false, false, false, false};
inline float laneValue[4] = {0.0f, 0.0f, 0.0f, 0.0f};

inline void noteFinalFrame(const InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    laneActive[i] = input.knobAudioActive[i];
    laneValue[i] = input.knobAudioValue[i];
  }
}

inline bool laneIsActive(int index) {
  return index >= 0 && index < 4 && laneActive[index];
}

inline float laneAt(int index) {
  return (index >= 0 && index < 4) ? laneValue[index] : 0.0f;
}

inline long knobAt(int index) {
  return (index >= 0 && index < 4) ? knobValue[index] : 0;
}

inline uint16_t heldValue(int index) {
  return (index >= 0 && index <= 3) ? paramValue[index] : 0;
}

// Copy held absolute values into the frame. Call after physical release.
// When absolute is active, clear deltas / audio flags on that channel so
// legacy paths cannot fight the set-point.
// Called once per frame with the finished input, which makes it the one
// place that sees the final knob values without adding a call site.
inline void fillAbsolute(InputFrame& input) {
  for (int i = 0; i < 4; i++) knobValue[i] = input.knobs[i];
  for (int i = 0; i < 4; ++i) {
    input.paramAbsoluteActive[i] = paramHeld[i];
    input.paramAbsolute[i] = paramValue[i];
    if (paramHeld[i]) {
      // If there is pending remote delta, inject it into knobDeltas
      // so legacy patterns that don't read paramAbsolute still respond!
      if (pendingDelta[i] != 0) {
        input.knobDeltas[i] += pendingDelta[i];
        pendingDelta[i] = 0;
      } else {
        input.knobDeltas[i] = 0;
      }
      input.knobAudioActive[i] = false;
    }
  }
}

}  // namespace PatternflowBus
