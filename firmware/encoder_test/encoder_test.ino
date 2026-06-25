// Patternflow - Rotary encoder serial test (standalone diagnostic)
//
// Prints the 4 rotary encoders' click counts and the 4 push-switch states
// over serial. No display / Wi-Fi / audio / patterns — a pure input test
// to check the PCB and wiring.
//
// How to use:
//   1. Open this folder's sketch in Arduino IDE and Upload (same board
//      settings as the main firmware).
//   2. Open Serial Monitor @ 115200.
//   3. Turn a knob  -> its Kn count changes (±1 per detent).
//      Press a knob -> its SW shows DOWN, release -> up.
//
// Reading the result:
//   - A count that moves on its own (untouched)        -> encoder A/B fault
//   - A switch that reads DOWN while untouched          -> switch short/cold joint
//   - Turning/pressing does nothing                     -> open / not connected
//   - Direction reversed: flip INVERT_ENCODER below.
//
// Pins mirror firmware/patternflow/config.h.

#include <Arduino.h>

// --- Encoder + switch pins (match config.h) ---
#define ENC1_A 4
#define ENC1_B 8
#define ENC1_SW 9
#define ENC2_A 5
#define ENC2_B 10
#define ENC2_SW 15
#define ENC3_A 6
#define ENC3_B 16
#define ENC3_SW 17
#define ENC4_A 7
#define ENC4_B 18
#define ENC4_SW 1

#define INVERT_ENCODER 0   // matches main firmware; flip if direction is wrong

const int ENC_A[4]  = { ENC1_A, ENC2_A, ENC3_A, ENC4_A };
const int ENC_B[4]  = { ENC1_B, ENC2_B, ENC3_B, ENC4_B };
const int ENC_SW[4] = { ENC1_SW, ENC2_SW, ENC3_SW, ENC4_SW };

volatile long encPos[4]      = { 0, 0, 0, 0 };
volatile uint8_t encState[4] = { 0, 0, 0, 0 };

// Quadrature decode (same state machine as the main firmware's core_encoders).
static inline void IRAM_ATTR handleEncoder(int idx) {
  uint8_t s = (digitalRead(ENC_A[idx]) << 1) | digitalRead(ENC_B[idx]);
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

void IRAM_ATTR isr0() { handleEncoder(0); }
void IRAM_ATTR isr1() { handleEncoder(1); }
void IRAM_ATTR isr2() { handleEncoder(2); }
void IRAM_ATTR isr3() { handleEncoder(3); }
void (*const ISRS[4])() = { isr0, isr1, isr2, isr3 };

long getClicks(int idx) { return encPos[idx] / 4; }  // 4 quadrature steps/detent

long lastClicks[4] = { 0, 0, 0, 0 };
int  lastSw[4]     = { HIGH, HIGH, HIGH, HIGH };

void printAll() {
  Serial.print("ENC  ");
  for (int i = 0; i < 4; i++) {
    Serial.printf("K%d=%-4ld %s   ", i + 1, getClicks(i),
                  digitalRead(ENC_SW[i]) == LOW ? "[DOWN]" : "[ up ]");
  }
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Rotary Encoder Test ===");
  Serial.println("Turn a knob -> Kn count changes. Press -> [DOWN].");
  Serial.println("Nothing should change while you are not touching it.\n");

  for (int i = 0; i < 4; i++) {
    pinMode(ENC_A[i], INPUT_PULLUP);
    pinMode(ENC_B[i], INPUT_PULLUP);
    pinMode(ENC_SW[i], INPUT_PULLUP);
    encState[i] = (digitalRead(ENC_A[i]) << 1) | digitalRead(ENC_B[i]);
    lastSw[i] = digitalRead(ENC_SW[i]);
  }
  for (int i = 0; i < 4; i++) {
    attachInterrupt(ENC_A[i], ISRS[i], CHANGE);
    attachInterrupt(ENC_B[i], ISRS[i], CHANGE);
  }

  printAll();  // baseline
}

void loop() {
  bool changed = false;
  for (int i = 0; i < 4; i++) {
    long c = getClicks(i);
    if (c != lastClicks[i]) { lastClicks[i] = c; changed = true; }
    int sw = digitalRead(ENC_SW[i]);
    if (sw != lastSw[i]) { lastSw[i] = sw; changed = true; }
  }
  if (changed) printAll();
  delay(5);
}
