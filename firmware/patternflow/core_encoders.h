#pragma once
#include <Arduino.h>
#include "config.h"

volatile long encPos[4]      = {0, 0, 0, 0};
volatile uint8_t encState[4] = {0, 0, 0, 0};

static inline void IRAM_ATTR handleEncoder(int idx, int pinA, int pinB) {
  uint8_t s = (digitalRead(pinA) << 1) | digitalRead(pinB);
  uint8_t combined = (encState[idx] << 2) | s;
  switch (combined) {
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
  }
  encState[idx] = s;
}

void IRAM_ATTR isr1() { handleEncoder(0, ENC1_A, ENC1_B); }
void IRAM_ATTR isr2() { handleEncoder(1, ENC2_A, ENC2_B); }
void IRAM_ATTR isr3() { handleEncoder(2, ENC3_A, ENC3_B); }
void IRAM_ATTR isr4() { handleEncoder(3, ENC4_A, ENC4_B); }

inline long getClicks(int idx) { return encPos[idx] / 4; }

struct Button {
  int pin;
  bool lastState = HIGH;
  uint32_t lastChangeMs = 0;
  uint32_t pressStartMs = 0;
  bool longPressFired = false;

  void begin(int p) { pin = p; pinMode(pin, INPUT_PULLUP); }
  
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
    }
    return false;
  }
  
  bool isDown() { return digitalRead(pin) == LOW; }

  bool longPressed(uint32_t threshold = 1000) {
    if (!isDown()) {
      longPressFired = false;
      return false;
    }
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
}