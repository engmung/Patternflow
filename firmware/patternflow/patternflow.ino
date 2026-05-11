#include <Arduino.h>
#include "config.h"
#include "core_display.h"
#include "core_encoders.h"
#include "pattern_registry.h"

MatrixPanel_I2S_DMA *dma_display = nullptr;

int currentPatternIdx = 0;

enum AppMode {
  MODE_RUNNING,
  MODE_SELECTING
};

AppMode currentMode = MODE_RUNNING;
unsigned long lastMs = 0;

// Front-panel logical order after left-right mirroring by original knob pairs:
// K1 <-> K2 and K3 <-> K4.
const int LOGICAL_TO_PHYSICAL_KNOB[4] = {1, 0, 2, 3};

Button* logicalButton(int logicalIdx) {
  switch (LOGICAL_TO_PHYSICAL_KNOB[logicalIdx]) {
    case 0: return &btn1;
    case 1: return &btn2;
    case 2: return &btn3;
    default: return &btn4;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Patternflow OS Booting... ===");

  initEncoders();
  initDisplay();

  for (int i = 0; i < NUM_PATTERNS; i++) {
    patterns[i].setup();
  }

  Serial.printf("Current Pattern: %s\n", patterns[currentPatternIdx].name);
  lastMs = millis();
}

void drawSelectingMode() {
  dma_display->fillScreen(0);

  uint16_t screenW = dma_display->width();
  uint16_t screenH = dma_display->height();

  char pageStr[16];
  snprintf(pageStr, sizeof(pageStr), "%d / %d", currentPatternIdx + 1, NUM_PATTERNS);

  int16_t x1, y1;
  uint16_t w, h;
  dma_display->setTextSize(1);
  dma_display->setTextColor(dma_display->color565(100, 100, 100));
  dma_display->getTextBounds(pageStr, 0, 0, &x1, &y1, &w, &h);
  dma_display->setCursor((screenW - w) / 2, 10);
  dma_display->print(pageStr);

  const char* name = patterns[currentPatternIdx].name;
  dma_display->setTextSize(strlen(name) > 8 ? 1 : 2);
  dma_display->setTextColor(dma_display->color565(255, 255, 255));
  dma_display->getTextBounds(name, 0, 0, &x1, &y1, &w, &h);
  dma_display->setCursor((screenW - w) / 2, (screenH / 2) - (h / 2));
  dma_display->print(name);

  const char* hint = "HOLD TO SELECT";
  dma_display->setTextSize(1);
  dma_display->setTextColor(dma_display->color565(150, 150, 150));
  dma_display->getTextBounds(hint, 0, 0, &x1, &y1, &w, &h);
  dma_display->setCursor((screenW - w) / 2, screenH - h - 15);
  dma_display->print(hint);
}

void readInputFrame(InputFrame& input) {
  static long prevKnobs[4] = {0, 0, 0, 0};

  input.now = (uint32_t)millis();

  for (int i = 0; i < 4; i++) {
    input.knobs[i] = getClicks(LOGICAL_TO_PHYSICAL_KNOB[i]);
  }

  for (int i = 0; i < 4; i++) {
    input.knobDeltas[i] = (int)(input.knobs[i] - prevKnobs[i]);
    prevKnobs[i] = input.knobs[i];
  }

  for (int i = 0; i < 4; i++) {
    Button* button = logicalButton(i);
    input.btnPressed[i] = button->pressed();
    input.btnHeld[i] = button->isDown();
  }
}

void loop() {
  unsigned long now = millis();
  float dt = (now - lastMs) / 1000.0f;
  lastMs = now;

  InputFrame input;
  readInputFrame(input);

  if (logicalButton(3)->longPressed(1000)) {
    if (currentMode == MODE_RUNNING) {
      currentMode = MODE_SELECTING;
      dma_display->setRotation(1);
      Serial.printf(">>> SELECT MODE ENTERED: %s\n", patterns[currentPatternIdx].name);
    } else {
      currentMode = MODE_RUNNING;
      dma_display->setRotation(0);
      Serial.printf(">>> RUNNING MODE: %s\n", patterns[currentPatternIdx].name);
    }
  }

  if (currentMode == MODE_RUNNING) {
    patterns[currentPatternIdx].update(dt, input);
    patterns[currentPatternIdx].draw();
  } else {
    if (input.knobDeltas[3] != 0) {
      currentPatternIdx += input.knobDeltas[3];
      if (currentPatternIdx < 0) currentPatternIdx += NUM_PATTERNS;
      currentPatternIdx %= NUM_PATTERNS;
      Serial.printf("SELECTING: %s\n", patterns[currentPatternIdx].name);
    }

    drawSelectingMode();
  }

  dma_display->flipDMABuffer();
}
