#include <Arduino.h>
#include <Preferences.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_osc.h"
#include "pattern_registry.h"
#include "pattern_video.h"

MatrixPanel_I2S_DMA *dma_display = nullptr;

int currentPatternIdx = 0;

enum ContentMode {
  CONTENT_PATTERN,
  CONTENT_VIDEO
};

enum AppMode {
  MODE_RUNNING,
  MODE_SELECTING
};

ContentMode currentContentMode = CONTENT_PATTERN;
AppMode currentMode = MODE_RUNNING;
unsigned long lastMs = 0;
float contentNoticeTimer = 0.0f;

// Global brightness: K1 longpress enters brightness mode, K1 rotation
// adjusts. Exits on second longpress or 5s idle. Value persists in NVS.
Preferences prefs;
uint8_t currentBrightness = DEFAULT_BRIGHTNESS;
bool brightnessAdjusting = false;
uint32_t brightnessIdleAtMs = 0;
bool brightnessDirty = false;
float brightnessNoticeTimer = 0.0f;

const uint32_t MODE_HOLD_MS = 1000;
const uint32_t BRIGHTNESS_IDLE_MS = 5000;
const float CONTENT_NOTICE_SECONDS = 1.0f;
const float BRIGHTNESS_NOTICE_SECONDS = 1.2f;

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

  prefs.begin("patternflow", false);
  currentBrightness = prefs.getUChar("brightness", DEFAULT_BRIGHTNESS);
  dma_display->setBrightness8(currentBrightness);

  PatternflowOsc::begin();

#if PF_OSC_ENABLED
  dma_display->fillScreen(0);
  dma_display->setTextSize(1);
  dma_display->setTextColor(dma_display->color565(180, 180, 180));
  dma_display->setCursor(2, 18);
  dma_display->print(PatternflowOsc::statusText());
  dma_display->setCursor(2, 30);
  dma_display->print(PF_OSC_REMOTE_HOST);
  dma_display->flipDMABuffer();
  delay(1200);
#endif

  for (int i = 0; i < NUM_PATTERNS; i++) {
    patterns[i].setup();
  }
  VideoPattern::setup();

  Serial.printf("Current Pattern: %s\n", patterns[currentPatternIdx].name);
  lastMs = millis();
}

const char* currentContentName() {
  return currentContentMode == CONTENT_VIDEO
    ? VideoPattern::NAME
    : patterns[currentPatternIdx].name;
}

const char* currentContentModeLabel() {
  return currentContentMode == CONTENT_VIDEO ? "VIDEO MODE" : "PATTERN MODE";
}

void toggleContentMode() {
  currentContentMode = currentContentMode == CONTENT_PATTERN ? CONTENT_VIDEO : CONTENT_PATTERN;
  currentMode = MODE_RUNNING;
  contentNoticeTimer = CONTENT_NOTICE_SECONDS;
  dma_display->setRotation(0);
  Serial.printf(">>> CONTENT MODE: %s\n", currentContentName());
}

void drawCenteredText(const char* text, int y, uint16_t color, int textSize = 1) {
  int16_t x1, y1;
  uint16_t w, h;
  dma_display->setTextSize(textSize);
  dma_display->setTextColor(color);
  dma_display->getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  dma_display->setCursor((dma_display->width() - w) / 2, y);
  dma_display->print(text);
}

void drawContentNotice() {
  dma_display->fillRect(0, 18, dma_display->width(), 28, 0);
  drawCenteredText(
    currentContentModeLabel(),
    24,
    dma_display->color565(255, 255, 255),
    1
  );
  drawCenteredText(currentContentName(), 36, dma_display->color565(120, 120, 120), 1);
}

void drawBrightnessNotice() {
  dma_display->fillRect(0, dma_display->height() - 14, dma_display->width(), 14, 0);
  char buf[24];
  int pct = (int)((currentBrightness * 100 + 127) / 255);
  snprintf(buf, sizeof(buf), "BRIGHTNESS  %d%%", pct);
  drawCenteredText(buf, dma_display->height() - 10, dma_display->color565(255, 255, 255), 1);
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
  drawCenteredText(hint, screenH - 22, dma_display->color565(150, 150, 150), 1);
}

void readInputFrame(InputFrame& input) {
  static long prevKnobs[4] = {0, 0, 0, 0};
  static uint32_t lastDeltaMs[4] = {0, 0, 0, 0};

  input.now = (uint32_t)millis();

  for (int i = 0; i < 4; i++) {
    input.knobs[i] = getClicks(LOGICAL_TO_PHYSICAL_KNOB[i]);
  }

  // Encoder acceleration: short interval since last detent → multiply delta.
  // Lets one encoder sweep a large range quickly without losing fine control
  // when turned slowly. Pattern step constants stay the same.
  for (int i = 0; i < 4; i++) {
    int raw = (int)(input.knobs[i] - prevKnobs[i]);
    if (raw != 0) {
      uint32_t gap = input.now - lastDeltaMs[i];
      int mult = 1;
      if (gap < 40)       mult = 5;
      else if (gap < 90)  mult = 3;
      else if (gap < 180) mult = 2;
      input.knobDeltas[i] = raw * mult;
      lastDeltaMs[i] = input.now;
    } else {
      input.knobDeltas[i] = 0;
    }
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

  if (logicalButton(0)->longPressed(MODE_HOLD_MS)) {
    brightnessAdjusting = !brightnessAdjusting;
    brightnessIdleAtMs = now;
    brightnessNoticeTimer = BRIGHTNESS_NOTICE_SECONDS;
    Serial.printf(">>> BRIGHTNESS MODE: %s (%u%%)\n",
                  brightnessAdjusting ? "ON" : "OFF",
                  (currentBrightness * 100 + 127) / 255);
  }

  if (brightnessAdjusting) {
    int d = input.knobDeltas[0];
    if (d != 0) {
      int b = constrain((int)currentBrightness + d * 5, 5, 255);
      if (b != (int)currentBrightness) {
        currentBrightness = (uint8_t)b;
        dma_display->setBrightness8(currentBrightness);
        brightnessIdleAtMs = now;
        brightnessNoticeTimer = BRIGHTNESS_NOTICE_SECONDS;
        brightnessDirty = true;
      }
    }
    // Consume K1 input so the active pattern doesn't also react to it.
    input.knobDeltas[0] = 0;
    input.btnPressed[0] = false;

    if ((now - brightnessIdleAtMs) > BRIGHTNESS_IDLE_MS) {
      brightnessAdjusting = false;
      Serial.println(">>> BRIGHTNESS MODE: OFF (idle)");
    }
  }

  // Persist brightness once the adjustment session ends — avoids hammering
  // NVS on every knob detent.
  if (brightnessDirty && !brightnessAdjusting) {
    prefs.putUChar("brightness", currentBrightness);
    brightnessDirty = false;
    Serial.printf("[NVS] brightness saved: %u\n", currentBrightness);
  }

  if (logicalButton(2)->longPressed(MODE_HOLD_MS)) {
    toggleContentMode();
  }

  if (currentContentMode == CONTENT_PATTERN && logicalButton(3)->longPressed(MODE_HOLD_MS)) {
    if (currentMode == MODE_RUNNING) {
      currentMode = MODE_SELECTING;
      contentNoticeTimer = 0.0f;
      dma_display->setRotation(1);
      Serial.printf(">>> SELECT MODE ENTERED: %s\n", patterns[currentPatternIdx].name);
    } else {
      currentMode = MODE_RUNNING;
      dma_display->setRotation(0);
      Serial.printf(">>> RUNNING MODE: %s\n", patterns[currentPatternIdx].name);
    }
  }

  // OSC is a sidechannel: runs in every mode when PF_OSC_ENABLED.
  // It only sends input/state to a remote host; it does not draw to the LED.
  PatternflowOsc::update(
    input,
    currentContentName(),
    currentPatternIdx,
    (int)currentContentMode,
    (int)currentMode
  );

  VideoPattern::checkSerialUpload();

  if (currentMode == MODE_RUNNING) {
    if (currentContentMode == CONTENT_VIDEO) {
      VideoPattern::update(dt, input);
      VideoPattern::draw();
    } else {
      patterns[currentPatternIdx].update(dt, input);
      patterns[currentPatternIdx].draw();
    }

    if (contentNoticeTimer > 0.0f) {
      drawContentNotice();
      contentNoticeTimer -= dt;
    }

    if (brightnessNoticeTimer > 0.0f) {
      drawBrightnessNotice();
      brightnessNoticeTimer -= dt;
    }
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
