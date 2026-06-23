#include <Arduino.h>
#include <Preferences.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_wifi.h"
#include "src/core_improv.h"
#include "src/core_osc.h"
#include "src/core_ota.h"
#include "src/core_audio_ws.h"
#include "pattern_registry.h"

MatrixPanel_I2S_DMA *dma_display = nullptr;

int currentPatternIdx = 0;

enum AppMode {
  MODE_RUNNING,
  MODE_SELECTING
};

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

// NETWORK screen: K2 longpress enters a status view (Wi-Fi / OSC / audio).
// Inside, TURNING K2 toggles OSC and TURNING K3 toggles audio-react (right
// = on, left = off; both persist in NVS). Rotation, not clicks, so the K2
// longpress used to exit can't flip anything. Second K2 longpress or idle
// exits.
bool oscInfoShowing = false;
uint32_t oscInfoIdleAtMs = 0;

const uint32_t MODE_HOLD_MS = 1000;
const uint32_t BRIGHTNESS_IDLE_MS = 5000;
const uint32_t OSC_INFO_IDLE_MS = 8000;
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

  // OSC + audio-react runtime flags, restored from NVS so the device boots
  // into whatever the K2 info screen was last set to.
  PatternflowOsc::setRuntimeEnabled(prefs.getBool("osc_runtime", true));
  PatternflowAudio::setRuntimeEnabled(prefs.getBool("audio_runtime", true));

  // Start Wi-Fi non-blocking: boot does NOT wait for the join. OSC, OTA,
  // and the audio-react server are started from the connect edge in loop()
  // (and re-announced on reconnect), so patterns render immediately whether
  // or not Wi-Fi is up yet.
  PatternflowWifi::begin();

  // Improv-Serial: lets the browser flasher set Wi-Fi over USB after a web
  // flash. Just listens on Serial; no Wi-Fi required to be up yet.
  PatternflowImprov::begin();

  buildPatternList();   // presets first (pattern 1 = Origin), custom appended last
  for (int i = 0; i < NUM_PATTERNS; i++) {
    patterns[i].setup();
  }

  Serial.printf("Current Pattern: %s\n", patterns[currentPatternIdx].name);
  lastMs = millis();
}

const char* currentContentName() {
  return patterns[currentPatternIdx].name;
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
  drawCenteredText(currentContentName(), 30, dma_display->color565(255, 255, 255), 1);
}

void drawBrightnessNotice() {
  dma_display->fillRect(0, dma_display->height() - 14, dma_display->width(), 14, 0);
  char buf[24];
  int pct = (int)((currentBrightness * 100 + 127) / 255);
  snprintf(buf, sizeof(buf), "BRIGHTNESS  %d%%", pct);
  drawCenteredText(buf, dma_display->height() - 10, dma_display->color565(255, 255, 255), 1);
}

// NETWORK info + toggle screen (K2 longpress). Shows Wi-Fi / OSC / audio
// state. TURN K2 to toggle OSC, TURN K3 to toggle audio-react (rotation,
// not a click — so the K2 longpress used to exit can't flip anything).
void drawNetworkInfo() {
  dma_display->fillScreen(0);

  uint16_t white = dma_display->color565(255, 255, 255);
  uint16_t blue  = dma_display->color565(120, 180, 255);
  uint16_t gray  = dma_display->color565(140, 140, 140);
  uint16_t green = dma_display->color565(80, 220, 130);
  uint16_t red   = dma_display->color565(255, 80, 80);
  uint16_t dim   = dma_display->color565(90, 90, 90);

  dma_display->setTextSize(1);
  drawCenteredText("NETWORK", 2, white, 1);

  // OSC / AUDIO state row.
  bool oscC = PatternflowOsc::isCompiledIn();
  bool oscOn = oscC && PatternflowOsc::isRuntimeEnabled();
  dma_display->setTextColor(white);  dma_display->setCursor(6, 14);  dma_display->print("OSC");
  dma_display->setTextColor(oscC ? (oscOn ? green : red) : dim);
  dma_display->setCursor(30, 14);    dma_display->print(oscC ? (oscOn ? "ON" : "OFF") : "N/A");

  bool audC = PatternflowAudio::isCompiledIn();
  bool audOn = audC && PatternflowAudio::isRuntimeEnabled();
  dma_display->setTextColor(white);  dma_display->setCursor(72, 14);  dma_display->print("AUD");
  dma_display->setTextColor(audC ? (audOn ? green : red) : dim);
  dma_display->setCursor(98, 14);    dma_display->print(audC ? (audOn ? "ON" : "OFF") : "N/A");

  // Wi-Fi status + IP.
  bool wifiUp = PatternflowWifi::isConnected();
  drawCenteredText(PatternflowWifi::statusText(), 26, wifiUp ? green : blue, 1);
  drawCenteredText(PatternflowWifi::ipString().c_str(), 36, gray, 1);

  // Hints — turn the knob (not click).
  drawCenteredText("TURN K2:OSC  K3:AUD", 50, dim, 1);
  drawCenteredText("HOLD K2 = EXIT", 57, dim, 1);
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

  // OSC-driven virtual knob motion (no-op when PF_OSC_ENABLED is 0).
  // Added after acceleration so external automation moves at the raw
  // 1×-per-detent rate, not amplified by the fast-spin curve.
  for (int i = 0; i < 4; i++) {
    input.knobDeltas[i] += PatternflowOsc::consumeKnobDelta(i);
  }

  // Audio-react direct delta messages. New browser/extension clients send
  // normalized deltas here so base/default values do not overwrite pattern
  // state; patterns still see only ordinary knobDeltas.
  for (int i = 0; i < 4; i++) {
    int audioDelta = PatternflowAudio::consumeKnobDelta(i);
    if (input.knobDeltas[i] == 0) input.knobDeltas[i] = audioDelta;
  }

  // Browser audio-react override. Patterns can read knobAudioActive[i]
  // and use knobAudioValue[i] (normalized 0..1) in place of integrating
  // knobDeltas. When inactive, the encoder/OSC path runs unchanged.
  for (int i = 0; i < 4; i++) {
    input.knobAudioActive[i] = PatternflowAudio::isActive(i);
    input.knobAudioValue[i]  = PatternflowAudio::value(i);
  }
}

// Legacy absolute audio-react path for older clients that still send k=N,v=F.
// New clients send d=N,v=F and are merged into knobDeltas in readInputFrame().
// "Physical wins": turning a knob this frame suppresses legacy audio on that knob.
void applyAudioVirtualKnobs(InputFrame& input, bool enabled) {
  static bool wasActive[4] = {false, false, false, false};
  static float prevValue[4] = {0.0f, 0.0f, 0.0f, 0.0f};
  static float residual[4] = {0.0f, 0.0f, 0.0f, 0.0f};

  for (int i = 0; i < 4; i++) {
    if (!enabled || !input.knobAudioActive[i] || input.knobDeltas[i] != 0) {
      wasActive[i] = false;
      residual[i] = 0.0f;
      input.knobAudioActive[i] = false;
      continue;
    }

    float value = constrain(input.knobAudioValue[i], 0.0f, 1.0f);
    input.knobAudioActive[i] = false;

    if (!wasActive[i]) {
      prevValue[i] = 0.5f;
      residual[i] = 0.0f;
      wasActive[i] = true;
    }

    // Full-rate: no MAX_DELTA clamp, so a fast audio swing lands this frame
    // instead of crawling at a few clicks per frame. Residual carries the
    // sub-click remainder so slow swings still move the knob.
    float movement = (value - prevValue[i]) * PF_AUDIO_VIRTUAL_KNOB_SCALE + residual[i];
    int delta = (int)roundf(movement);
    residual[i] = movement - (float)delta;
    if (fabsf(residual[i]) < 0.001f) residual[i] = 0.0f;
    prevValue[i] = value;

    input.knobDeltas[i] = delta;
  }
}

void loop() {
  // Maintain Wi-Fi (non-blocking): retries while down, and on each fresh
  // (re)connection starts the network services. begin() is idempotent.
  PatternflowWifi::tick();
  if (PatternflowWifi::consumeJustConnected()) {
    PatternflowOsc::begin();
    PatternflowOta::begin();
    PatternflowAudio::begin();
    Serial.println("[NET] services started");
  }

  // Improv-Serial provisioning: drains any browser-flasher Wi-Fi setup
  // traffic on Serial and reports connect success/failure back. Cheap when
  // idle (one Serial.available() check).
  PatternflowImprov::handle();

  // OTA must run early in the loop so a long pattern render doesn't
  // starve the upload handler. Cheap when no upload is in flight.
  PatternflowOta::handle();

  // Service the audio-react HTTP/WebSocket servers in the main loop
  // (single-threaded — no separate core-0 task). Cheap when idle.
  PatternflowAudio::handle();

  unsigned long now = millis();
  float dt = (now - lastMs) / 1000.0f;
  lastMs = now;

  InputFrame input;
  readInputFrame(input);

  if (!oscInfoShowing && logicalButton(0)->longPressed(MODE_HOLD_MS)) {
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

  // K2 longpress → enter/exit the NETWORK status + toggle screen.
  if (logicalButton(1)->longPressed(MODE_HOLD_MS)) {
    oscInfoShowing = !oscInfoShowing;
    oscInfoIdleAtMs = now;
    Serial.printf(">>> NETWORK SCREEN: %s\n", oscInfoShowing ? "ON" : "OFF");
  }

  if (oscInfoShowing) {
    // Toggles use knob ROTATION, not clicks — so holding K2 to exit can't
    // accidentally flip a setting. Turn right = ON, left = OFF.
    if (input.knobDeltas[1] != 0) {                  // K2 turn → OSC
      bool next = input.knobDeltas[1] > 0;
      if (next != PatternflowOsc::isRuntimeEnabled()) {
        PatternflowOsc::setRuntimeEnabled(next);
        prefs.putBool("osc_runtime", next);
        Serial.printf("[NVS] osc_runtime saved: %s\n", next ? "true" : "false");
      }
      oscInfoIdleAtMs = now;
    }
    if (input.knobDeltas[2] != 0) {                  // K3 turn → audio-react
      bool next = input.knobDeltas[2] > 0;
      if (next != PatternflowAudio::isRuntimeEnabled()) {
        PatternflowAudio::setRuntimeEnabled(next);
        prefs.putBool("audio_runtime", next);
        Serial.printf("[NVS] audio_runtime saved: %s\n", next ? "true" : "false");
      }
      oscInfoIdleAtMs = now;
    }

    // Swallow all knob input so the pattern underneath doesn't react.
    for (int i = 0; i < 4; i++) {
      input.knobDeltas[i] = 0;
      input.btnPressed[i] = false;
    }

    if ((now - oscInfoIdleAtMs) > OSC_INFO_IDLE_MS) {
      oscInfoShowing = false;
      Serial.println(">>> NETWORK SCREEN: OFF (idle)");
    }
  }

  if (!oscInfoShowing && logicalButton(3)->longPressed(MODE_HOLD_MS)) {
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

  applyAudioVirtualKnobs(
    input,
    currentMode == MODE_RUNNING && !brightnessAdjusting && !oscInfoShowing
  );

  // OSC is a sidechannel: runs in every mode when PF_OSC_ENABLED.
  // It sends input/state to a remote host and (since C) accepts knob,
  // pattern-index, and content-toggle commands back. Drawing is still
  // done by patterns, not by OSC.
  PatternflowOsc::update(
    input,
    currentContentName(),
    currentPatternIdx,
    0, // content mode removed (always pattern)
    (int)currentMode
  );

  // Apply OSC-driven pattern / content changes from the most recent
  // received packet. Knob deltas were already merged into the input
  // frame inside readInputFrame().
  int oscPatternIdx;
  if (PatternflowOsc::consumePatternIdx(oscPatternIdx) &&
      oscPatternIdx >= 0 && oscPatternIdx < NUM_PATTERNS) {
    currentPatternIdx = oscPatternIdx;
    currentMode = MODE_RUNNING;
    contentNoticeTimer = CONTENT_NOTICE_SECONDS;
    Serial.printf(">>> OSC pattern → %s\n", patterns[currentPatternIdx].name);
  }
  if (oscInfoShowing) {
    drawNetworkInfo();
  } else if (currentMode == MODE_RUNNING) {
    patterns[currentPatternIdx].update(dt, input);
    patterns[currentPatternIdx].draw();

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
