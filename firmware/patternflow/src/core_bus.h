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
// Relative clicks waiting for the next frame — what a legacy pattern that
// only reads knobDeltas gets while a lane is held. Written by the network
// core (POST /api/params), drained by the frame: atomics, or a click can
// vanish between the two.
inline int32_t pendingDelta[4] = {0, 0, 0, 0};

// The sub-click remainder of an absolute move. Without it, how far a legacy
// pattern travels depends on how finely the writer chopped the move: the rule
// below is "ten bus units per click, never fewer than one for a change", so a
// ten-second ease sent once per frame at 83 fps emitted 830 clicks for a
// thousand units of travel that means 100. The same ease at 41 fps emitted
// half that. Keeping the remainder makes the total trunc(travel / 10) however
// it arrives, and takes the frame rate out of it - which is what core_show.h
// already claims of itself.
inline int32_t clickResidual[4] = {0, 0, 0, 0};


// Last finished frame's knob positions, kept so the core can answer
// "where are the knobs" over HTTP. Absolute accumulated clicks, the
// same numbers a pattern sees and the same ones MQTT publishes.
inline long knobValue[4] = {0, 0, 0, 0};

// Ignore encoder chatter briefly after an absolute set (Director spam / noise).
constexpr uint32_t ABSOLUTE_RELEASE_GRACE_MS = 250;

inline void applyRemoteDelta(int index, int delta) {
  if (index < 0 || index > 3) return;
  __atomic_fetch_add(&pendingDelta[index], (int32_t)delta, __ATOMIC_RELAXED);
}

// Write one channel and hold it. The only way a value enters the bus.
inline void applyRemoteParam(int index, long value) {
  if (index < 0 || index > 3) return;
  if (value < 0) value = 0;
  if (value > PF_BUS_MAX) value = PF_BUS_MAX;

  // A legacy pattern reads knobDeltas and nothing else, so a held value has
  // to reach it as clicks: ten bus units per click. Derived here, from the
  // change in the held value, so every absolute writer — the console's
  // sliders, OSC, a show — moves such a pattern the same way. A client must
  // not also send the clicks as dX for the same move; that counted every step
  // twice, once.
  //
  // The remainder is carried rather than rounded up to one click. Rounding up
  // is what made travel a function of the writer's update rate.
  if (paramHeld[index]) {
    const int diff = (int)value - (int)paramValue[index];
    if (diff != 0) {
      const int32_t acc =
          __atomic_add_fetch(&clickResidual[index], (int32_t)diff, __ATOMIC_RELAXED);
      const int32_t d = acc / 10;  // truncates toward zero, both signs
      if (d != 0) {
        __atomic_fetch_sub(&clickResidual[index], d * 10, __ATOMIC_RELAXED);
        __atomic_fetch_add(&pendingDelta[index], d, __ATOMIC_RELAXED);
      }
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
  __atomic_store_n(&pendingDelta[index], 0, __ATOMIC_RELAXED);
  __atomic_store_n(&clickResidual[index], 0, __ATOMIC_RELAXED);
}

inline void clearAbsoluteAll() {
  for (int i = 0; i < 4; ++i) {
    paramHeld[i] = false;
    paramHeldAtMs[i] = 0;
    __atomic_store_n(&pendingDelta[i], 0, __ATOMIC_RELAXED);
    __atomic_store_n(&clickResidual[i], 0, __ATOMIC_RELAXED);
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
      // Held: the remote owns the lane, so the only clicks a legacy pattern
      // sees are the ones the held value produced — not the encoder's.
      input.knobDeltas[i] =
          (int)__atomic_exchange_n(&pendingDelta[i], 0, __ATOMIC_RELAXED);
      input.knobAudioActive[i] = false;
    } else {
      // Unheld, and this branch did not exist. applyRemoteDelta() accepts a
      // click on any channel, but only the held branch drained the queue, so
      // a dN sent to a channel nobody is holding did nothing visible and then
      // arrived in full the moment something held it - or was wiped by the
      // next release. Added to the encoder's own clicks, because that is what
      // both of them are.
      const int pending =
          (int)__atomic_exchange_n(&pendingDelta[i], 0, __ATOMIC_RELAXED);
      if (pending != 0) input.knobDeltas[i] += pending;
    }
  }
}

}  // namespace PatternflowBus
