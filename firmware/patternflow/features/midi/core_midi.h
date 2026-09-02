// ═══════════════════════════════════════════════════════════
// PatternFlow - MIDI, the mapping
//
// What MIDI means on this device, independent of how the bytes arrive. A
// transport (RTP-MIDI over Wi-Fi in core_midi_rtp.h; USB or BLE if somebody
// builds them) parses its wire format and calls the four handlers below;
// outward, it registers a sink and receives the three-byte messages the
// device emits. Nothing in here knows a socket.
//
// ── The map ─────────────────────────────────────────────────────────────
//
//   in   CC 20..23   absolute knob 1..4   0..127 → 0..1000 on the absolute
//                    bus. Same controllers the Director's .mid export writes,
//                    so a Live clip made from a show drives the panel with the
//                    identical automation - the DAW→device path that
//                    docs/director-midi.md said did not exist.
//   in   CC 24..27   relative knob 1..4   64 = still, 65 = +1 detent, 63 = -1.
//                    Endless encoders on a controller; merged with the hand's
//                    motion at 1x per step, exactly like OSC's /knob/N/delta.
//   in   note 60..63 button 1..4          on = press, held while the note is
//                    held. Pads.
//   in   Program Change                   pattern index (0-based). A person's
//                    choice: it persists across reboots like a knob pick.
//
//   out  CC 24..27   the encoders, relative (64 ± detents this frame)
//   out  note 60..63 the buttons (velocity 127 on press, note-off on release)
//   out  Program Change                   the pattern changed
//
// Channel: PF_MIDI_CHANNEL (1..16; 0 listens on all and sends on 1).
//
// Precedence is the device's, not MIDI's: an absolute CC holds the bus until
// a hand turns that knob; relative CCs and notes are just more input. The
// wire scale on the bus is 0..1000 and MIDI's is 0..127 - 1000 is not a
// multiple of 127, so the conversion rounds and 127 lands exactly on 1000.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <Preferences.h>

#include "../../src/core_bus.h"
#include "../../src/core_encoders.h"

#ifndef PF_MIDI_CHANNEL
#define PF_MIDI_CHANNEL 1
#endif
#ifndef PF_MIDI_CC_ABS_BASE
#define PF_MIDI_CC_ABS_BASE 20
#endif
#ifndef PF_MIDI_CC_REL_BASE
#define PF_MIDI_CC_REL_BASE 24
#endif
#ifndef PF_MIDI_NOTE_BASE
#define PF_MIDI_NOTE_BASE 60
#endif

namespace PatternflowMidi {

// The device's NETWORK screen row; persisted in the feature's own namespace.
inline bool runtimeEnabled = true;

// Outbound sensitivity: detents per relative-CC step. A DAW moves a mapped
// parameter a fixed amount per step, and one detent per step turned out to be
// a lot of parameter per wrist on the first Live session - the panel's
// encoders have 20 detents a turn, so at 1 a full turn is 20 steps and at 4
// it is 5. Remainders accumulate, so slow turns still arrive. Runtime, via
// POST /api/midi?outDiv=N, persisted; PF_MIDI_OUT_DIVISOR is the default.
#ifndef PF_MIDI_OUT_DIVISOR
#define PF_MIDI_OUT_DIVISOR 1
#endif
constexpr int OUT_DIVISOR_MAX = 16;
inline int outDivisor = PF_MIDI_OUT_DIVISOR;
inline int outAccum[4] = {0, 0, 0, 0};

inline void loadSettings() {
  Preferences p;
  if (p.begin("pf_midi", true)) {
    runtimeEnabled = p.getBool("on", true);
    outDivisor = p.getInt("outDiv", PF_MIDI_OUT_DIVISOR);
    p.end();
  }
  if (outDivisor < 1) outDivisor = 1;
  if (outDivisor > OUT_DIVISOR_MAX) outDivisor = OUT_DIVISOR_MAX;
}

inline bool setOutDivisor(int div) {
  if (div < 1 || div > OUT_DIVISOR_MAX) return false;
  outDivisor = div;
  for (auto& a : outAccum) a = 0;
  Preferences p;
  if (p.begin("pf_midi", false)) {
    p.putInt("outDiv", div);
    p.end();
  }
  return true;
}

inline void setRuntimeEnabled(bool on) {
  runtimeEnabled = on;
  Preferences p;
  if (p.begin("pf_midi", false)) {
    p.putBool("on", on);
    p.end();
  }
}

// ── Inbound state, consumed by fillInput / takePattern ───────────────────
inline int  pendingDelta[4] = {0, 0, 0, 0};
inline bool notePress[4] = {false, false, false, false};   // edge, one frame
inline bool noteHeld[4] = {false, false, false, false};    // level
inline int  pendingPattern = -1;
inline uint32_t rxCount = 0;
inline uint32_t txCount = 0;

inline bool channelMatches(uint8_t ch) {
  return PF_MIDI_CHANNEL == 0 || ch == PF_MIDI_CHANNEL;
}

inline uint8_t outChannel() { return PF_MIDI_CHANNEL == 0 ? 1 : PF_MIDI_CHANNEL; }

// 0..127 → 0..1000, rounded, 127 → 1000 exactly.
inline long midiToBus(uint8_t v) { return ((long)v * 1000 + 63) / 127; }

// ── Handlers a transport calls (from the render task) ────────────────────
inline void onControlChange(uint8_t ch, uint8_t cc, uint8_t value) {
  if (!runtimeEnabled || !channelMatches(ch)) return;
  rxCount++;
  if (cc >= PF_MIDI_CC_ABS_BASE && cc < PF_MIDI_CC_ABS_BASE + 4) {
    PatternflowBus::applyRemoteParam(cc - PF_MIDI_CC_ABS_BASE, midiToBus(value));
    return;
  }
  if (cc >= PF_MIDI_CC_REL_BASE && cc < PF_MIDI_CC_REL_BASE + 4) {
    pendingDelta[cc - PF_MIDI_CC_REL_BASE] += (int)value - 64;
    return;
  }
}

inline void onProgramChange(uint8_t ch, uint8_t program) {
  if (!runtimeEnabled || !channelMatches(ch)) return;
  rxCount++;
  pendingPattern = program;
}

inline void onNoteOn(uint8_t ch, uint8_t note, uint8_t velocity) {
  if (!runtimeEnabled || !channelMatches(ch)) return;
  rxCount++;
  if (note < PF_MIDI_NOTE_BASE || note >= PF_MIDI_NOTE_BASE + 4) return;
  int i = note - PF_MIDI_NOTE_BASE;
  if (velocity == 0) {   // running-status note-off
    noteHeld[i] = false;
    return;
  }
  notePress[i] = true;
  noteHeld[i] = true;
}

inline void onNoteOff(uint8_t ch, uint8_t note, uint8_t) {
  if (!runtimeEnabled || !channelMatches(ch)) return;
  rxCount++;
  if (note < PF_MIDI_NOTE_BASE || note >= PF_MIDI_NOTE_BASE + 4) return;
  noteHeld[note - PF_MIDI_NOTE_BASE] = false;
}

// ── Into the frame ───────────────────────────────────────────────────────
// What this frame's input owes to MIDI, remembered so observeFrame does not
// send it straight back out. A DAW that receives its own control changes as
// device events records everything twice; the first probe run did exactly
// that with a note.
inline int  injectedDelta[4] = {0, 0, 0, 0};
inline bool injectedPress[4] = {false, false, false, false};

inline void fillInput(InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    injectedDelta[i] = pendingDelta[i];
    input.knobDeltas[i] += pendingDelta[i];
    pendingDelta[i] = 0;
    injectedPress[i] = notePress[i];
    if (notePress[i]) {
      input.btnPressed[i] = true;
      notePress[i] = false;
    }
    if (noteHeld[i]) input.btnHeld[i] = true;
  }
}

inline bool takePattern(int* idx) {
  if (pendingPattern < 0) return false;
  *idx = pendingPattern;
  pendingPattern = -1;
  return true;
}

// ── Outbound ─────────────────────────────────────────────────────────────
// A sink is a transport's "send these three bytes". Two is enough for any
// composition anyone has proposed (one network, one local).
typedef void (*Sink)(uint8_t status, uint8_t data1, uint8_t data2);
inline Sink sinks[2] = {nullptr, nullptr};

inline void registerSink(Sink s) {
  for (auto& slot : sinks) {
    if (slot == s) return;
    if (!slot) { slot = s; return; }
  }
}

inline void emit(uint8_t status, uint8_t d1, uint8_t d2) {
  txCount++;
  for (auto s : sinks) {
    if (s) s(status, d1, d2);
  }
}

inline bool lastHeld[4] = {false, false, false, false};
inline int  lastPatternIdx = -1;

// The finished frame: what the pattern saw is what the host hears.
inline void observeFrame(const InputFrame& input, int patternIdx) {
  if (!runtimeEnabled) return;
  const uint8_t ch = outChannel() - 1;   // status nibble is 0-based
  for (int i = 0; i < 4; i++) {
    // The hand's share only: what MIDI put in this frame is not news to MIDI.
    // A lane the core silenced (held by the absolute bus, or a menu owning
    // the knob) reads zero here even though we injected into it; zero means
    // nothing to report, not "minus what we sent" - the first probe run got a
    // CC 61 back for a CC 67 it sent, on a knob CC 20 was holding.
    int d = input.knobDeltas[i];
    if (d != 0) d -= injectedDelta[i];
    injectedDelta[i] = 0;
    if (d != 0) {
      // Sensitivity: whole steps go out, the remainder waits for the next
      // detent. Division truncates toward zero, so the remainder keeps the
      // sign of the motion and a change of direction cancels it naturally.
      outAccum[i] += d;
      int steps = outAccum[i] / outDivisor;
      outAccum[i] -= steps * outDivisor;
      if (steps > 63) steps = 63;
      if (steps < -63) steps = -63;
      if (steps != 0) emit(0xB0 | ch, PF_MIDI_CC_REL_BASE + i, (uint8_t)(64 + steps));
    }
    if (input.btnPressed[i] && !injectedPress[i]) emit(0x90 | ch, PF_MIDI_NOTE_BASE + i, 127);
    injectedPress[i] = false;
    // Held minus the note we are holding ourselves: a physical release.
    const bool physHeld = input.btnHeld[i] && !noteHeld[i];
    if (physHeld != lastHeld[i]) {
      lastHeld[i] = physHeld;
      if (!physHeld) emit(0x80 | ch, PF_MIDI_NOTE_BASE + i, 0);
    }
  }
  if (patternIdx != lastPatternIdx) {
    lastPatternIdx = patternIdx;
    if (patternIdx >= 0 && patternIdx <= 127) emit(0xC0 | ch, (uint8_t)patternIdx, 0);
  }
}

}  // namespace PatternflowMidi
