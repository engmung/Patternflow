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
//   out  CC 24..27   the encoders: a virtual position, or 64 ± steps since
//                    the last message. Paced - see "Pacing" below.
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
inline int outAccum[4] = {0, 0, 0, 0};

// ...and the other direction: steps per detent, for a hand that wants a
// parameter to sweep in a quarter turn. 1..8; only one of the two is ever
// above 1 (setting one resets the other), so the page shows a single scale
// from x8 through 1:1 to 1/16.
#ifndef PF_MIDI_OUT_MULTIPLIER
#define PF_MIDI_OUT_MULTIPLIER 1
#endif
constexpr int OUT_MULTIPLIER_MAX = 8;

// Per knob. A knob on a filter cutoff and a knob on a pattern's speed do not
// want the same ratio, so each carries its own; the page moves them together
// unless told otherwise.
inline int outDivisor[4]    = {PF_MIDI_OUT_DIVISOR, PF_MIDI_OUT_DIVISOR, PF_MIDI_OUT_DIVISOR, PF_MIDI_OUT_DIVISOR};
inline int outMultiplier[4] = {PF_MIDI_OUT_MULTIPLIER, PF_MIDI_OUT_MULTIPLIER, PF_MIDI_OUT_MULTIPLIER, PF_MIDI_OUT_MULTIPLIER};

inline int clampDiv(int v) { return v < 1 ? 1 : (v > OUT_DIVISOR_MAX ? OUT_DIVISOR_MAX : v); }
inline int clampMul(int v) { return v < 1 ? 1 : (v > OUT_MULTIPLIER_MAX ? OUT_MULTIPLIER_MAX : v); }

inline void saveGains() {
  Preferences p;
  if (!p.begin("pf_midi", false)) return;
  char key[8];
  for (int i = 0; i < 4; i++) {
    snprintf(key, sizeof(key), "div%d", i);
    p.putInt(key, outDivisor[i]);
    snprintf(key, sizeof(key), "mul%d", i);
    p.putInt(key, outMultiplier[i]);
  }
  p.end();
}

// Outbound encoding for the knobs. The encoders are endless, so the honest
// message is relative (64 ± steps) - and Live guesses what a CC means from
// the first values it sees while mapping, and guessed wrong three different
// ways in one session: signed-bit (one direction jumps 63), absolute (the
// parameter sits at 63..65 and barely moves). So the default is ABSOLUTE: the
// panel keeps a virtual 0..127 position per knob, moves it by the divided
// steps, clamps, and sends the position. Every DAW reads that as an ordinary
// knob with nothing to detect; the DAW's takeover mode handles pickup. `rel`
// stays for hosts that map relative encoders properly (Max, TouchDesigner).
#ifndef PF_MIDI_OUT_ABSOLUTE
#define PF_MIDI_OUT_ABSOLUTE 1
#endif
inline bool outAbsolute = PF_MIDI_OUT_ABSOLUTE;
inline int  outPos[4] = {64, 64, 64, 64};

// ── Pacing ──────────────────────────────────────────────────────────────
// One CC per knob per frame was the natural rate when only a hand turned
// the encoders: a wrist makes a few detents a frame at most, and only while
// it moves. The audio edition changed who turns them. The microphone drives
// the knobs through lanes, applyLaneMotion turns a lane into knobDeltas, and
// by the time the frame reaches us that motion is indistinguishable from a
// hand - so a lane that wanders 1/127 of its travel every frame is a CC
// every frame, per knob, at 60 fps. Measured on a panel in a QUIET room
// (rawPeak 0.0025): 26..43 messages a second, each one a UDP packet through
// AppleMIDI. The Wi-Fi driver has eight static TX buffers, shared with
// everything else the panel sends; that rate kept them full, the serial log
// became a wall of `endPacket(): could not send data: 12` (ENOMEM), and the
// console's TCP traffic starved behind it - a 26 KB page took 5..7 s and
// arrived truncated.
//
// So the knobs are paced: at most one CC per knob per
// PF_MIDI_OUT_MIN_INTERVAL_MS, trailing-edge - the last value always goes
// out, it just may wait up to one interval. In absolute mode the virtual
// position still moves every frame; what is sent is where it IS when the
// interval is up, if that differs from what the host last heard, so a lane
// that jitters back to where it started sends nothing at all. In relative
// mode the steps sum between messages and go out as one 64 ± sum; a sum
// that would leave ±63 goes out at once rather than lose motion. 50 ms is
// 20 messages a second per knob - more than a hand produces, and the
// trailing value lands within three frames of the hand stopping. Notes and
// Program Change are not paced: they are events, one per press or pick,
// and a press must not queue behind a knob.
#ifndef PF_MIDI_OUT_MIN_INTERVAL_MS
#define PF_MIDI_OUT_MIN_INTERVAL_MS 50
#endif
// A lane is not a hand. The row in docs/midi-spec.md reads "encoder turned
// by a hand", and a knob the microphone (or the browser audio path, or a
// weather value) is moving through a lane is not that: the DAW would record
// the room's noise floor as automation, and on the audio edition that stream
// is what filled the Wi-Fi transmit queue in the first place. After
// applyLaneMotion a frame whose knobAudioActive[i] is still set got that
// knob's delta from the lane and nothing else - a hand on the encoder clears
// the flag for five seconds - so this is one check. Set to 1 to echo lane
// motion anyway; the pacing above still applies.
#ifndef PF_MIDI_OUT_LANE_MOTION
#define PF_MIDI_OUT_LANE_MOTION 0
#endif
inline uint32_t outLastSentMs[4] = {0, 0, 0, 0};     // when each knob last went out
inline int      outSentPos[4]    = {64, 64, 64, 64}; // abs: the position the host has
inline int      outRelPending[4] = {0, 0, 0, 0};     // rel: steps not yet sent

inline void loadSettings() {
  Preferences p;
  if (p.begin("pf_midi", true)) {
    runtimeEnabled = p.getBool("on", true);
    // The per-knob keys, falling back to the single values an earlier build
    // wrote, so a panel that had one sensitivity keeps it on all four.
    int legacyDiv = p.getInt("outDiv", PF_MIDI_OUT_DIVISOR);
    int legacyMul = p.getInt("outMul", PF_MIDI_OUT_MULTIPLIER);
    char key[8];
    for (int i = 0; i < 4; i++) {
      snprintf(key, sizeof(key), "div%d", i);
      outDivisor[i] = clampDiv(p.getInt(key, legacyDiv));
      snprintf(key, sizeof(key), "mul%d", i);
      outMultiplier[i] = clampMul(p.getInt(key, legacyMul));
    }
    outAbsolute = p.getBool("outAbs", PF_MIDI_OUT_ABSOLUTE);
    p.end();
  }
}

// knob = 0..3, or -1 for all four. Setting either side resets the other, so a
// knob is always exactly one of xN, 1:1 or 1/N - and 1:1 is reachable from
// either parameter.
inline bool setOutMultiplier(int knob, int mul) {
  if (mul < 1 || mul > OUT_MULTIPLIER_MAX || knob < -1 || knob > 3) return false;
  for (int i = 0; i < 4; i++) {
    if (knob != -1 && i != knob) continue;
    outMultiplier[i] = mul;
    outDivisor[i] = 1;   // a gain is one number: xN, 1:1 or 1/N
    outAccum[i] = 0;
  }
  saveGains();
  return true;
}

inline void setOutAbsolute(bool abs) {
  outAbsolute = abs;
  for (auto& a : outAccum) a = 0;
  for (auto& r : outRelPending) r = 0;   // steps summed for one encoding mean nothing in the other
  Preferences p;
  if (p.begin("pf_midi", false)) {
    p.putBool("outAbs", abs);
    p.end();
  }
}

inline bool setOutDivisor(int knob, int div) {
  if (div < 1 || div > OUT_DIVISOR_MAX || knob < -1 || knob > 3) return false;
  for (int i = 0; i < 4; i++) {
    if (knob != -1 && i != knob) continue;
    outDivisor[i] = div;
    outMultiplier[i] = 1;
    outAccum[i] = 0;
  }
  saveGains();
  return true;
}

inline void setRuntimeEnabled(bool on) {
  runtimeEnabled = on;
  // Switching MIDI off must not leave up to one interval of steps waiting
  // to go out the moment it comes back on.
  if (!on) for (auto& r : outRelPending) r = 0;
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

// 0..127 → 0..PF_BUS_MAX, rounded, 127 → PF_BUS_MAX exactly.
inline long midiToBus(uint8_t v) { return ((long)v * PF_BUS_MAX + 63) / 127; }

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
  const uint32_t now = input.now;        // the frame's millis(): one clock for all four knobs
  for (int i = 0; i < 4; i++) {
    // The hand's share only: what MIDI put in this frame is not news to MIDI.
    // A lane the core silenced (held by the absolute bus, or a menu owning
    // the knob) reads zero here even though we injected into it; zero means
    // nothing to report, not "minus what we sent" - the first probe run got a
    // CC 61 back for a CC 67 it sent, on a knob CC 20 was holding.
    int d = input.knobDeltas[i];
    if (d != 0) d -= injectedDelta[i];
    injectedDelta[i] = 0;
#if !PF_MIDI_OUT_LANE_MOTION
    if (input.knobAudioActive[i]) d = 0;   // a lane's motion, not a hand's
#endif
    if (d != 0) {
      // Sensitivity: whole steps go out, the remainder waits for the next
      // detent. Division truncates toward zero, so the remainder keeps the
      // sign of the motion and a change of direction cancels it naturally.
      outAccum[i] += d;
      int steps = outAccum[i] / outDivisor[i];
      outAccum[i] -= steps * outDivisor[i];
      steps *= outMultiplier[i];
      if (steps > 63) steps = 63;
      if (steps < -63) steps = -63;
      if (steps != 0) {
        if (outAbsolute) {
          // The position moves every frame; whether it is sent is the
          // pacer's call, below.
          int pos = outPos[i] + steps;
          if (pos < 0) pos = 0;
          if (pos > 127) pos = 127;
          outPos[i] = pos;
        } else {
          outRelPending[i] += steps;
        }
      }
    }
    // The pacer runs every frame, motion or not: a frame with no motion is
    // the one that flushes the trailing value. Unsigned subtraction, so the
    // millis() wrap at 49 days is a non-event.
    const bool due = (uint32_t)(now - outLastSentMs[i]) >= (uint32_t)PF_MIDI_OUT_MIN_INTERVAL_MS;
    if (outAbsolute) {
      if (due && outPos[i] != outSentPos[i]) {
        outSentPos[i] = outPos[i];
        outLastSentMs[i] = now;
        emit(0xB0 | ch, PF_MIDI_CC_REL_BASE + i, (uint8_t)outPos[i]);
      }
    } else {
      // A sum outside ±63 cannot wait: one message carries 63 steps at
      // most, and what does not fit stays pending rather than being lost.
      const int sum = outRelPending[i];
      if (sum != 0 && (due || sum > 63 || sum < -63)) {
        const int send = sum > 63 ? 63 : (sum < -63 ? -63 : sum);
        outRelPending[i] = sum - send;
        outLastSentMs[i] = now;
        emit(0xB0 | ch, PF_MIDI_CC_REL_BASE + i, (uint8_t)(64 + send));
      }
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
