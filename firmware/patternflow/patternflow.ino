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
#include "src/core_web_update.h"
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
// adjusts. Exits on a K1 click (instant), a second longpress, or 5s idle.
// The BRIGHTNESS notice stays on screen for the whole time the mode is
// active — the moment it disappears you're out. (It used to flash for
// 1.2s while the mode silently lived on for 5s, so you could never tell
// which state you were in.) Value persists in NVS.
Preferences prefs;
uint8_t currentBrightness = DEFAULT_BRIGHTNESS;
bool brightnessAdjusting = false;
uint32_t brightnessIdleAtMs = 0;
bool brightnessDirty = false;

// NETWORK screen: K2 longpress enters a status view (Wi-Fi / OSC / audio).
// Inside, TURNING K2 toggles OSC and TURNING K3 toggles audio-react (right
// = on, left = off; both persist in NVS). Rotation, not clicks, so the K2
// longpress used to exit can't flip anything. Second K2 longpress or idle
// exits.
bool oscInfoShowing = false;
uint32_t oscInfoIdleAtMs = 0;

// NETWORK screen redraw pacing. The screen is static text: redrawing and
// flipping it every loop iteration (hundreds of Hz — no pattern renders in
// this mode) races the panel scanout and the text visibly flickers. Redraw
// only on entry, on a toggle, or at a slow poll so status changes still show.
uint32_t netInfoDrawnAtMs = 0;
bool netInfoDirty = false;

// KNOB MAP screen: K3 longpress shows which physical knob is which number
// (front view: K1 top-right, K2 top-left, K3 bottom-right, K4 bottom-left).
// Turning any knob lights its digit up green, so each knob can be verified
// without leaving the screen. K3 click, a second K3 longpress, or idle exits.
bool knobMapShowing = false;
uint32_t knobMapIdleAtMs = 0;
uint32_t knobMapDrawnAtMs = 0;
bool knobMapDirty = false;
uint32_t knobMapActiveAtMs[4] = {0, 0, 0, 0};

// UPDATE screen: entered from the NETWORK screen by turning K4. While it
// shows, the /update endpoint is ARMED — that is the whole security model
// (see core_web_update.h): flashing over the LAN requires someone at the
// device first. K4 click exits (disarming), except mid-flash. The idle
// timeout is long because the user is at their computer fetching a .bin.
bool updateShowing = false;
uint32_t updateIdleAtMs = 0;
uint32_t updateDrawnAtMs = 0;
bool updateDirty = false;

const uint32_t MODE_HOLD_MS = 1000;
const uint32_t BRIGHTNESS_IDLE_MS = 5000;
const uint32_t OSC_INFO_IDLE_MS = 8000;
const uint32_t NET_INFO_REDRAW_MS = 250;
const uint32_t KNOB_MAP_IDLE_MS = 8000;
const uint32_t KNOB_MAP_HILITE_MS = 600;
const uint32_t UPDATE_IDLE_MS = 600000;  // 10 min — downloading a build takes a while
const float CONTENT_NOTICE_SECONDS = 1.0f;

// Logical knob N = front-panel KN = physical encoder N. The PCB routes ENCn
// straight to the Kn position (verified on the board) — an earlier build
// mirrored K1<->K2 here, which put every K1/K2 feature on the wrong physical
// knob. Keep this an identity unless a future enclosure actually flips the
// panel.
const int LOGICAL_TO_PHYSICAL_KNOB[4] = {0, 1, 2, 3};

Button* logicalButton(int logicalIdx) {
  switch (LOGICAL_TO_PHYSICAL_KNOB[logicalIdx]) {
    case 0: return &btn1;
    case 1: return &btn2;
    case 2: return &btn3;
    default: return &btn4;
  }
}

// Defined below with the other screens; declared here because setup()
// installs it as the upload progress callback.
void drawUpdateScreen(int uploadPct);

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

  // Wireless-update progress is drawn from inside the upload handler: the
  // whole multipart POST is consumed in one handleClient() call, so the
  // main loop never runs while the image streams in. This callback keeps
  // the panel honest during those seconds (same task — drawing is safe).
  PatternflowWebUpdate::progressCallback = [](int pct) {
    drawUpdateScreen(pct);
    dma_display->flipDMABuffer();
    updateIdleAtMs = millis();
  };

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

// Centered text on a small dark scrim band, so it stays legible drawn on top
// of the live pattern the SELECT screen now previews behind the overlay.
// One fillRect + one text draw per label — cheap enough not to slow the frame
// (a per-glyph outline tripled the per-frame pixel writes and tore the
// double-buffered panel).
void drawCenteredTextScrim(const char* text, int y, uint16_t color, int textSize = 1) {
  int16_t x1, y1;
  uint16_t w, h;
  dma_display->setTextSize(textSize);
  dma_display->getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  int x = (dma_display->width() - w) / 2;
  dma_display->fillRect(x - 2, y - 2, w + 4, h + 4, 0);
  dma_display->setTextColor(color);
  dma_display->setCursor(x, y);
  dma_display->print(text);
}

// Notices sit on the same tight scrim the SELECT overlay uses (text bounds
// + 2px) instead of a full-width black band — less of the live pattern is
// blotted out and every overlay text now shares one look.
void drawContentNotice() {
  drawCenteredTextScrim(currentContentName(), 30, dma_display->color565(255, 255, 255), 1);
}

void drawBrightnessNotice() {
  char buf[24];
  int pct = (int)((currentBrightness * 100 + 127) / 255);
  snprintf(buf, sizeof(buf), "BRIGHTNESS %d%%", pct);
  drawCenteredTextScrim(buf, dma_display->height() - 10, dma_display->color565(255, 255, 255), 1);
}

// NETWORK info + toggle screen (K2 longpress). Shows Wi-Fi / OSC / audio
// state. TURN K2 to toggle OSC, TURN K3 to toggle audio-react (rotation,
// not a click — a K2 click exits). Drawn PORTRAIT (rotation 1, 64×128):
// vertical is the device's primary mounting, so this screen reads upright
// like the SELECT overlay. The 64px line width fits ~10 chars at text
// size 1, hence the stacked layout and the IP split across two lines.
void drawNetworkInfo() {
  dma_display->setRotation(1);
  dma_display->fillScreen(0);

  uint16_t white = dma_display->color565(255, 255, 255);
  uint16_t blue  = dma_display->color565(120, 180, 255);
  uint16_t gray  = dma_display->color565(140, 140, 140);
  uint16_t green = dma_display->color565(80, 220, 130);
  uint16_t red   = dma_display->color565(255, 80, 80);
  uint16_t dim   = dma_display->color565(90, 90, 90);

  dma_display->setTextSize(1);
  drawCenteredText("NETWORK", 4, white, 1);

  // OSC / AUDIO state rows.
  bool oscC = PatternflowOsc::isCompiledIn();
  bool oscOn = oscC && PatternflowOsc::isRuntimeEnabled();
  dma_display->setTextColor(white);  dma_display->setCursor(8, 20);  dma_display->print("OSC");
  dma_display->setTextColor(oscC ? (oscOn ? green : red) : dim);
  dma_display->setCursor(38, 20);    dma_display->print(oscC ? (oscOn ? "ON" : "OFF") : "N/A");

  bool audC = PatternflowAudio::isCompiledIn();
  bool audOn = audC && PatternflowAudio::isRuntimeEnabled();
  dma_display->setTextColor(white);  dma_display->setCursor(8, 30);  dma_display->print("AUD");
  dma_display->setTextColor(audC ? (audOn ? green : red) : dim);
  dma_display->setCursor(38, 30);    dma_display->print(audC ? (audOn ? "ON" : "OFF") : "N/A");

  // Wi-Fi status + IP. A full IPv4 (up to 15 chars) doesn't fit one
  // portrait line — split after the second octet's dot.
  bool wifiUp = PatternflowWifi::isConnected();
  drawCenteredText(PatternflowWifi::statusText(), 48, wifiUp ? green : blue, 1);
  String ip = PatternflowWifi::ipString();
  if (ip.length() <= 10) {
    drawCenteredText(ip.c_str(), 60, gray, 1);
  } else {
    int cut = ip.indexOf('.', ip.indexOf('.') + 1) + 1;
    drawCenteredText(ip.substring(0, cut).c_str(), 60, gray, 1);
    drawCenteredText(ip.substring(cut).c_str(), 70, gray, 1);
  }

  // Hints — turn to toggle, K4 for the update screen, click (or hold)
  // K2 to leave.
  drawCenteredText("TURN K2/K3", 86, dim, 1);
  drawCenteredText("OSC / AUD", 96, dim, 1);
  if (PatternflowWebUpdate::isCompiledIn()) {
    drawCenteredText("K4=UPDATE", 107, dim, 1);
  }
  drawCenteredText("K2 = EXIT", 118, dim, 1);

  dma_display->setRotation(0);
}

// UPDATE screen (NETWORK screen → turn K4). Drawn PORTRAIT like the other
// info screens. Idle: shows where to drop the .bin — the .local name AND
// the raw IP, because mDNS is unreliable on Android (issue #232). During
// a flash this is redrawn by the progress callback (uploadPct >= 0), since
// the main loop is blocked inside handleClient() for the whole upload;
// pass -1 when drawing from the loop.
void drawUpdateScreen(int uploadPct) {
  dma_display->setRotation(1);
  dma_display->fillScreen(0);

  uint16_t white = dma_display->color565(255, 255, 255);
  uint16_t blue  = dma_display->color565(120, 180, 255);
  uint16_t gray  = dma_display->color565(140, 140, 140);
  uint16_t green = dma_display->color565(80, 220, 130);
  uint16_t red   = dma_display->color565(255, 80, 80);
  uint16_t dim   = dma_display->color565(90, 90, 90);

  int w = dma_display->width();   // 64 in portrait
  int h = dma_display->height();  // 128 in portrait

  drawCenteredText("UPDATE", 4, white, 1);

  if (uploadPct >= 0 || PatternflowWebUpdate::isUploading()) {
    int pct = (uploadPct >= 0) ? uploadPct
                               : (int)PatternflowWebUpdate::progressPercent();
    drawCenteredText("FLASHING", 26, blue, 1);
    char buf[8];
    snprintf(buf, sizeof(buf), "%d%%", pct);
    drawCenteredText(buf, 46, white, 2);
    int bx = 6, by = 72, bw = w - 12, bh = 8;
    dma_display->drawRect(bx, by, bw, bh, gray);
    int fill = ((bw - 4) * constrain(pct, 0, 100)) / 100;
    if (fill > 0) dma_display->fillRect(bx + 2, by + 2, fill, bh - 4, green);
    drawCenteredText("KEEP POWER", h - 28, dim, 1);
    drawCenteredText("ON", h - 18, dim, 1);
  } else if (PatternflowWebUpdate::isRebootPending()) {
    drawCenteredText("DONE", 40, green, 1);
    drawCenteredText("REBOOTING", 56, white, 1);
  } else {
    bool wifiUp = PatternflowWifi::isConnected();
    if (PatternflowWebUpdate::hasError()) {
      drawCenteredText("FAILED", 16, red, 1);  // details went to the browser
    } else {
      drawCenteredText(wifiUp ? "ARMED" : "NO WIFI", 16, wifiUp ? green : red, 1);
    }
    if (wifiUp) {
      drawCenteredText("DROP .BIN:", 34, gray, 1);
      drawCenteredText(PF_OTA_HOSTNAME, 48, blue, 1);
      drawCenteredText(".local", 58, blue, 1);
      drawCenteredText("/update", 68, blue, 1);
      // Raw IP as the mDNS fallback, split like the NETWORK screen.
      String ip = PatternflowWifi::ipString();
      if (ip.length() <= 10) {
        drawCenteredText(ip.c_str(), 84, gray, 1);
      } else {
        int cut = ip.indexOf('.', ip.indexOf('.') + 1) + 1;
        drawCenteredText(ip.substring(0, cut).c_str(), 84, gray, 1);
        drawCenteredText(ip.substring(cut).c_str(), 94, gray, 1);
      }
    } else {
      drawCenteredText(PatternflowWifi::statusText(), 48, blue, 1);
    }
    drawCenteredText("K4 = EXIT", h - 10, dim, 1);
  }

  dma_display->setRotation(0);
}

// KNOB MAP screen (K3 longpress). Drawn PORTRAIT like the NETWORK screen.
// One numbered circle per knob at its front-view corner; a digit turns green
// for a moment while its knob is being turned. Same throttled-redraw scheme
// as the NETWORK screen (see netInfoDrawnAtMs).
void drawKnobMap() {
  dma_display->setRotation(1);
  dma_display->fillScreen(0);

  uint16_t white = dma_display->color565(255, 255, 255);
  uint16_t green = dma_display->color565(80, 220, 130);
  uint16_t dim   = dma_display->color565(90, 90, 90);

  int w = dma_display->width();   // 64 in portrait
  int h = dma_display->height();  // 128 in portrait

  drawCenteredText("KNOB MAP", (h / 2) - 10, white, 1);
  drawCenteredText("TURN = SHOW", (h / 2) + 2, dim, 1);
  drawCenteredText("K3 = EXIT", (h / 2) + 12, dim, 1);

  // Front-view corners: K1 top-right, K2 top-left, K3 bottom-right,
  // K4 bottom-left (indices are logical = physical after the identity map).
  const int cx[4] = { w - 13, 13, w - 13, 13 };
  const int cy[4] = { 14, 14, h - 14, h - 14 };

  uint32_t now = millis();
  for (int i = 0; i < 4; i++) {
    bool active = knobMapActiveAtMs[i] != 0 &&
                  (now - knobMapActiveAtMs[i]) < KNOB_MAP_HILITE_MS;
    uint16_t col = active ? green : white;
    if (active) dma_display->fillCircle(cx[i], cy[i], 10, dma_display->color565(15, 55, 30));
    dma_display->drawCircle(cx[i], cy[i], 10, col);
    dma_display->setTextSize(1);
    dma_display->setTextColor(col);
    dma_display->setCursor(cx[i] - 2, cy[i] - 3);
    dma_display->print((char)('1' + i));
  }

  dma_display->setRotation(0);
}

// Draws the SELECT overlay ON TOP of the live pattern preview the loop has
// already rendered into the buffer (so no fillScreen here). Each label sits on
// a small dark scrim so it stays readable over whatever pattern is behind it.
void drawSelectingMode() {
  uint16_t screenH = dma_display->height();

  char pageStr[16];
  snprintf(pageStr, sizeof(pageStr), "%d / %d", currentPatternIdx + 1, NUM_PATTERNS);
  drawCenteredTextScrim(pageStr, 10, dma_display->color565(190, 190, 190), 1);

  const char* name = patterns[currentPatternIdx].name;
  int nameSize = strlen(name) > 8 ? 1 : 2;
  int16_t x1, y1;
  uint16_t w, h;
  dma_display->setTextSize(nameSize);
  dma_display->getTextBounds(name, 0, 0, &x1, &y1, &w, &h);
  drawCenteredTextScrim(name, (screenH / 2) - (h / 2),
                        dma_display->color565(255, 255, 255), nameSize);

  drawCenteredTextScrim("HOLD TO SELECT", screenH - 22,
                        dma_display->color565(200, 200, 200), 1);
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
    PatternflowWebUpdate::begin();
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

  // Browser self-update housekeeping: boot-valid marking and the deferred
  // post-flash reboot. (Upload traffic itself arrives through the shared
  // HTTP server serviced just above.)
  PatternflowWebUpdate::handle();

  unsigned long now = millis();
  float dt = (now - lastMs) / 1000.0f;
  lastMs = now;

  InputFrame input;
  readInputFrame(input);

  // One-shot click events for the mode buttons, consumed every frame so a
  // click that lands outside its mode can't stay latched and fire later.
  bool k1Clicked = logicalButton(0)->clicked();
  bool k2Clicked = logicalButton(1)->clicked();
  bool k3Clicked = logicalButton(2)->clicked();
  bool k4Clicked = logicalButton(3)->clicked();

  if (!oscInfoShowing && !knobMapShowing && !updateShowing && logicalButton(0)->longPressed(MODE_HOLD_MS)) {
    brightnessAdjusting = !brightnessAdjusting;
    brightnessIdleAtMs = now;
    Serial.printf(">>> BRIGHTNESS MODE: %s (%u%%)\n",
                  brightnessAdjusting ? "ON" : "OFF",
                  (currentBrightness * 100 + 127) / 255);
  }

  // Click = instant exit; no need to sit through the 1s hold.
  if (brightnessAdjusting && k1Clicked) {
    brightnessAdjusting = false;
    Serial.println(">>> BRIGHTNESS MODE: OFF (click)");
  }

  if (brightnessAdjusting) {
    int d = input.knobDeltas[0];
    if (d != 0) {
      int b = constrain((int)currentBrightness + d * 5, 5, 255);
      if (b != (int)currentBrightness) {
        currentBrightness = (uint8_t)b;
        dma_display->setBrightness8(currentBrightness);
        brightnessIdleAtMs = now;
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
  // A K2 click while inside also exits, instantly (mirrors brightness mode).
  if (!knobMapShowing && !updateShowing && logicalButton(1)->longPressed(MODE_HOLD_MS)) {
    oscInfoShowing = !oscInfoShowing;
    oscInfoIdleAtMs = now;
    netInfoDirty = true;
    Serial.printf(">>> NETWORK SCREEN: %s\n", oscInfoShowing ? "ON" : "OFF");
  } else if (oscInfoShowing && k2Clicked) {
    oscInfoShowing = false;
    Serial.println(">>> NETWORK SCREEN: OFF (click)");
  }

  if (oscInfoShowing) {
    // Turn K4 → hand off to the UPDATE screen, which arms the /update
    // endpoint (see core_web_update.h — the arming IS the security model).
    if (input.knobDeltas[3] != 0 && PatternflowWebUpdate::isCompiledIn()) {
      oscInfoShowing = false;
      updateShowing = true;
      updateIdleAtMs = now;
      updateDirty = true;
      PatternflowWebUpdate::arm();
      Serial.println(">>> UPDATE SCREEN: ON");
    }

    // Toggles use knob ROTATION, not clicks — so holding K2 to exit can't
    // accidentally flip a setting. Turn right = ON, left = OFF.
    if (input.knobDeltas[1] != 0) {                  // K2 turn → OSC
      bool next = input.knobDeltas[1] > 0;
      if (next != PatternflowOsc::isRuntimeEnabled()) {
        PatternflowOsc::setRuntimeEnabled(next);
        prefs.putBool("osc_runtime", next);
        netInfoDirty = true;
        Serial.printf("[NVS] osc_runtime saved: %s\n", next ? "true" : "false");
      }
      oscInfoIdleAtMs = now;
    }
    if (input.knobDeltas[2] != 0) {                  // K3 turn → audio-react
      bool next = input.knobDeltas[2] > 0;
      if (next != PatternflowAudio::isRuntimeEnabled()) {
        PatternflowAudio::setRuntimeEnabled(next);
        prefs.putBool("audio_runtime", next);
        netInfoDirty = true;
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

  // K3 longpress → enter/exit the KNOB MAP screen. A K3 click inside exits.
  if (!oscInfoShowing && !updateShowing && logicalButton(2)->longPressed(MODE_HOLD_MS)) {
    knobMapShowing = !knobMapShowing;
    knobMapIdleAtMs = now;
    knobMapDirty = true;
    Serial.printf(">>> KNOB MAP: %s\n", knobMapShowing ? "ON" : "OFF");
  } else if (knobMapShowing && k3Clicked) {
    knobMapShowing = false;
    Serial.println(">>> KNOB MAP: OFF (click)");
  }

  if (knobMapShowing) {
    // Light the digit of any knob being turned, then swallow the input so
    // the pattern underneath (and OSC) don't see it.
    for (int i = 0; i < 4; i++) {
      if (input.knobDeltas[i] != 0) {
        knobMapActiveAtMs[i] = now;
        knobMapIdleAtMs = now;
        knobMapDirty = true;
      }
      input.knobDeltas[i] = 0;
      input.btnPressed[i] = false;
    }
    if ((now - knobMapIdleAtMs) > KNOB_MAP_IDLE_MS) {
      knobMapShowing = false;
      Serial.println(">>> KNOB MAP: OFF (idle)");
    }
  }

  if (updateShowing) {
    // Locked in while a flash is in flight or the reboot is pending — the
    // device must not disarm (or navigate away) under an active upload.
    bool busy = PatternflowWebUpdate::isUploading() ||
                PatternflowWebUpdate::isRebootPending();
    if (k4Clicked && !busy) {
      updateShowing = false;
      PatternflowWebUpdate::disarm();
      Serial.println(">>> UPDATE SCREEN: OFF (click)");
    }

    // Swallow all knob input; any activity keeps the screen alive.
    for (int i = 0; i < 4; i++) {
      if (input.knobDeltas[i] != 0) updateIdleAtMs = now;
      input.knobDeltas[i] = 0;
      input.btnPressed[i] = false;
    }

    if (updateShowing && !busy && (now - updateIdleAtMs) > UPDATE_IDLE_MS) {
      updateShowing = false;
      PatternflowWebUpdate::disarm();
      Serial.println(">>> UPDATE SCREEN: OFF (idle)");
    }
  }

  if (!oscInfoShowing && !knobMapShowing && !updateShowing && logicalButton(3)->longPressed(MODE_HOLD_MS)) {
    if (currentMode == MODE_RUNNING) {
      currentMode = MODE_SELECTING;
      contentNoticeTimer = 0.0f;
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
  bool frameDrawn = true;
  if (oscInfoShowing) {
    if (netInfoDirty || (now - netInfoDrawnAtMs) >= NET_INFO_REDRAW_MS) {
      drawNetworkInfo();
      netInfoDrawnAtMs = now;
      netInfoDirty = false;
    } else {
      // Nothing redrawn — skip the flip below so the displayed buffer
      // stays untouched (flipping to a stale back buffer flickers).
      frameDrawn = false;
    }
  } else if (knobMapShowing) {
    // Redraw on activity or at the slow poll (so highlights also fade out);
    // same anti-flicker scheme as the NETWORK screen above.
    if (knobMapDirty || (now - knobMapDrawnAtMs) >= NET_INFO_REDRAW_MS) {
      drawKnobMap();
      knobMapDrawnAtMs = now;
      knobMapDirty = false;
    } else {
      frameDrawn = false;
    }
  } else if (updateShowing || PatternflowWebUpdate::isRebootPending()) {
    // Same throttled-redraw scheme as the NETWORK screen. This only paints
    // the idle / done / failed states — during an actual flash the loop is
    // blocked inside handleClient(), and the progress callback installed in
    // setup() draws instead. The isRebootPending() arm covers always-armed
    // uploads that land while a pattern is running: the DONE / REBOOTING
    // card shows for the ~1.2 s before restart instead of snapping back to
    // the pattern.
    if (updateDirty || (now - updateDrawnAtMs) >= NET_INFO_REDRAW_MS) {
      drawUpdateScreen(-1);
      updateDrawnAtMs = now;
      updateDirty = false;
    } else {
      frameDrawn = false;
    }
  } else if (currentMode == MODE_RUNNING) {
    patterns[currentPatternIdx].update(dt, input);
    patterns[currentPatternIdx].draw();

    if (contentNoticeTimer > 0.0f) {
      drawContentNotice();
      contentNoticeTimer -= dt;
    }

    // Shown for the whole time the mode is active — this IS the mode
    // indicator; when it disappears you're back to normal knob control.
    if (brightnessAdjusting) {
      drawBrightnessNotice();
    }
  } else {
    if (input.knobDeltas[3] != 0) {
      currentPatternIdx += input.knobDeltas[3];
      // Floored modulo: OSC /knob/4/delta can deliver a delta more negative
      // than -NUM_PATTERNS in one frame, and C++'s % keeps the sign — a plain
      // "+= NUM_PATTERNS once" would leave a negative index into patterns[].
      currentPatternIdx = ((currentPatternIdx % NUM_PATTERNS) + NUM_PATTERNS) % NUM_PATTERNS;
      Serial.printf("SELECTING: %s\n", patterns[currentPatternIdx].name);
    }

    // Live preview behind the overlay so you can see what you're choosing.
    // Render the pattern in the native landscape orientation (rotation 0, same
    // as running mode) so present() fills the whole panel — then switch to the
    // device's portrait orientation (rotation 1) for the SELECT text so it
    // reads upright, exactly as before. Feed a neutral input frame (no knob
    // deltas / buttons) so browsing with K4 doesn't drive the pattern's own
    // parameters — it just animates over time.
    dma_display->setRotation(0);
    InputFrame preview = {};
    preview.now = input.now;
    for (int i = 0; i < 4; i++) preview.knobs[i] = input.knobs[i];
    patterns[currentPatternIdx].update(dt, preview);
    patterns[currentPatternIdx].draw();

    dma_display->setRotation(1);
    drawSelectingMode();
    if (brightnessAdjusting) {
      drawBrightnessNotice();  // mode indicator, same as in RUNNING
    }
    dma_display->setRotation(0);  // back to landscape for the next frame
  }

  if (frameDrawn) dma_display->flipDMABuffer();
}
