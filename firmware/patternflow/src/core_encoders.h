#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include "config.h"

volatile long     encPos[4]    = {0, 0, 0, 0};   // sub-steps; 4 per detent
volatile uint8_t  encState[4]  = {0, 0, 0, 0};   // last ACCEPTED (A<<1)|B
volatile uint32_t encLastUs[4] = {0, 0, 0, 0};   // time of last accepted edge

// Quadrature decode with two bounce guards.
//
// These are mechanical contacts and the board gives them no help — the A/B
// pull-ups are the ESP32's internal (weak) ones, and the RC filter pads v2
// carried were never populated and are gone on v3. The edges landing here are
// noisy, so the decoder has to do the filtering itself.
//
//  1. An illegal transition is DISCARDED and encState is left alone. An
//     earlier version updated encState unconditionally, which meant a bounced
//     jump (00->11, say) resynchronised the decoder at the wrong phase — and
//     that surfaces as a missed detent, or a step counted in the wrong
//     direction. Holding the last known-good state lets the next clean edge
//     carry on from where the knob actually is.
//  2. Edges closer together than ENC_BOUNCE_US are ignored (config.h).
//
// Note the guards only ever DROP input; neither can invent a step. Worst case
// on a genuinely fast spin is a lost sub-step, which the /4 in getClicks()
// mostly absorbs.
static inline void IRAM_ATTR handleEncoder(int idx, int pinA, int pinB) {
  uint8_t s = (digitalRead(pinA) << 1) | digitalRead(pinB);
  uint8_t prev = encState[idx];
  if (s == prev) return;                  // bounce that settled back where it was

#if ENC_BOUNCE_US > 0
  uint32_t now = micros();
  if ((uint32_t)(now - encLastUs[idx]) < ENC_BOUNCE_US) return;
#endif

  switch ((prev << 2) | s) {
    case 0b0001: case 0b0111: case 0b1110: case 0b1000:
#if INVERT_ENCODER
      encPos[idx]--;
#else
      encPos[idx]++;
#endif
      break;
    case 0b0010: case 0b1011: case 0b1101: case 0b0100:
#if INVERT_ENCODER
      encPos[idx]++;
#else
      encPos[idx]--;
#endif
      break;
    default:
      return;                             // illegal jump: keep prev, count nothing
  }

  encState[idx] = s;
#if ENC_BOUNCE_US > 0
  encLastUs[idx] = now;
#endif
}

void IRAM_ATTR isr1() { handleEncoder(0, ENC1_A, ENC1_B); }
void IRAM_ATTR isr2() { handleEncoder(1, ENC2_A, ENC2_B); }
void IRAM_ATTR isr3() { handleEncoder(2, ENC3_A, ENC3_B); }
void IRAM_ATTR isr4() { handleEncoder(3, ENC4_A, ENC4_B); }

// ── Knob settings a person can change at runtime (/knobs) ────────────────
// Direction and click size are properties of the encoder soldered in, not
// of the firmware: some parts count the other way round, some give two
// edges per detent instead of four. INVERT_ENCODER in config.h is the
// compile-time default; these override it per knob and persist in NVS
// (namespace "pf_knobs"), set from the /knobs page (core_knobs_http.h).
inline bool knobInvert[4] = {INVERT_ENCODER != 0, INVERT_ENCODER != 0,
                             INVERT_ENCODER != 0, INVERT_ENCODER != 0};
inline int  knobSubSteps[4] = {4, 4, 4, 4};   // edges per click: 4, 2 or 1
// A settings change must not move a knob. The click count carries on from
// where it was, counting the edges since the change in the new direction
// and at the new size, so the frame's delta stays zero across a save.
inline long knobClickBase[4] = {0, 0, 0, 0};
inline long knobPosBase[4]   = {0, 0, 0, 0};

inline long getClicks(int idx) {
  long rel = encPos[idx] - knobPosBase[idx];
  if (knobInvert[idx]) rel = -rel;
  return knobClickBase[idx] + rel / knobSubSteps[idx];
}

inline int clampSubSteps(int v) { return (v == 1 || v == 2 || v == 4) ? v : 4; }

// Call on the frame task (the frame reads the same counters).
inline void setKnobSettings(int idx, bool invert, int subSteps) {
  if (idx < 0 || idx > 3) return;
  knobClickBase[idx] = getClicks(idx);   // rebase on the settings being replaced
  knobPosBase[idx] = encPos[idx];
  knobInvert[idx] = invert;
  knobSubSteps[idx] = clampSubSteps(subSteps);
}

inline void loadKnobSettings() {
  Preferences p;
  if (!p.begin("pf_knobs", true)) return;   // nothing saved yet: the compile-time defaults
  char key[6];
  for (int i = 0; i < 4; i++) {
    snprintf(key, sizeof(key), "inv%d", i);
    knobInvert[i] = p.getBool(key, knobInvert[i]);
    snprintf(key, sizeof(key), "sub%d", i);
    knobSubSteps[i] = clampSubSteps(p.getInt(key, knobSubSteps[i]));
  }
  p.end();
}

inline bool saveKnobSettings() {
  Preferences p;
  if (!p.begin("pf_knobs", false)) return false;
  char key[6];
  for (int i = 0; i < 4; i++) {
    snprintf(key, sizeof(key), "inv%d", i);
    p.putBool(key, knobInvert[i]);
    snprintf(key, sizeof(key), "sub%d", i);
    p.putInt(key, knobSubSteps[i]);
  }
  p.end();
  return true;
}

struct Button {
  int pin;
  bool lastState = HIGH;
  uint32_t lastChangeMs = 0;
  uint32_t pressStartMs = 0;
  bool longPressFired = false;
  bool clickedFlag = false;

  void begin(int p) { pin = p; pinMode(pin, INPUT_PULLUP); }

  // Single edge scanner — call once per frame (readInputFrame does). All
  // press-state transitions live here, so clicked() / longPressed() can't
  // race each other on a release that lands between their calls.
  bool pressed() {
    bool cur = digitalRead(pin);
    uint32_t now = millis();
    if (cur != lastState && (now - lastChangeMs) > 50) {
      lastState = cur;
      lastChangeMs = now;
      if (cur == LOW) {
        pressStartMs = now;
        longPressFired = false;
        return true;
      }
      // Release edge. A hold that never crossed the long-press threshold is
      // a click; if longPressed() fired during the hold, this release is the
      // tail of that gesture, not a click.
      if (!longPressFired) clickedFlag = true;
    }
    return false;
  }

  bool isDown() { return digitalRead(pin) == LOW; }

  // One-shot: true once after a short press-and-release. Consume every
  // frame — an unread click stays latched until the next clicked() call.
  bool clicked() {
    bool c = clickedFlag;
    clickedFlag = false;
    return c;
  }

  bool longPressed(uint32_t threshold = 1000) {
    if (!isDown()) return false;
    uint32_t now = millis();
    if (!longPressFired && (now - pressStartMs) > threshold) {
      longPressFired = true;
      return true;
    }
    return false;
  }
};

struct InputFrame {
  long knobs[4];           // 절대 누적 클릭값
  int knobDeltas[4];       // 이번 프레임의 변화량 (메인 루프가 계산)
  bool btnPressed[4];      // 이번 프레임에 새로 눌림 (edge trigger)
  bool btnHeld[4];         // 현재 눌려있음 (level)
  uint32_t now;            // millis() 값

  // Audio-react source state. The main loop turns these normalized
  // 0..1 values into virtual knobDeltas, so ordinary patterns do not
  // need audio-specific code.
  bool knobAudioActive[4];
  float knobAudioValue[4];

  // Absolute Director / Show-manager bus (MQTT param/1..4). Wire scale
  // is integer 0..1000. When active, patterns that use PFParams::apply
  // set mapped params from this instead of integrating deltas.
  // Appended so older modules that only read the fields above still work
  // — this struct is mirrored byte-for-byte by abi/pf_abi.h::PFInputFrame.
  bool paramAbsoluteActive[4];
  uint16_t paramAbsolute[4];
};

Button btn1, btn2, btn3, btn4;

inline void initEncoders() {
  pinMode(ENC1_A, INPUT_PULLUP); pinMode(ENC1_B, INPUT_PULLUP);
  pinMode(ENC2_A, INPUT_PULLUP); pinMode(ENC2_B, INPUT_PULLUP);
  pinMode(ENC3_A, INPUT_PULLUP); pinMode(ENC3_B, INPUT_PULLUP);
  pinMode(ENC4_A, INPUT_PULLUP); pinMode(ENC4_B, INPUT_PULLUP);

  encState[0] = (digitalRead(ENC1_A) << 1) | digitalRead(ENC1_B);
  encState[1] = (digitalRead(ENC2_A) << 1) | digitalRead(ENC2_B);
  encState[2] = (digitalRead(ENC3_A) << 1) | digitalRead(ENC3_B);
  encState[3] = (digitalRead(ENC4_A) << 1) | digitalRead(ENC4_B);

  attachInterrupt(ENC1_A, isr1, CHANGE); attachInterrupt(ENC1_B, isr1, CHANGE);
  attachInterrupt(ENC2_A, isr2, CHANGE); attachInterrupt(ENC2_B, isr2, CHANGE);
  attachInterrupt(ENC3_A, isr3, CHANGE); attachInterrupt(ENC3_B, isr3, CHANGE);
  attachInterrupt(ENC4_A, isr4, CHANGE); attachInterrupt(ENC4_B, isr4, CHANGE);

  btn1.begin(ENC1_SW);
  btn2.begin(ENC2_SW);
  btn3.begin(ENC3_SW);
  btn4.begin(ENC4_SW);
  loadKnobSettings();   // before the first frame reads a click
}
