#include <Arduino.h>
#include <Preferences.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_ui_text.h"
#include "src/core_encoders.h"
#include "src/core_wifi.h"
#include "src/core_improv.h"
#include "src/core_osc.h"
#include "src/core_ota.h"
#include "src/core_audio_ws.h"
#include "src/core_web_update.h"
// Reads the demand the display driver measured while blitting, so it comes
// after core_display.h and before anything that sets brightness.
#include "src/core_power.h"
// Drives the panel and the CPU down for sleep mode. Needs core_display.h only,
// so it sits here rather than tangling with anything on the network side.
#include "src/core_sleep.h"
#include "pattern_registry.h"
// After the registry: the pattern manager serves and mutates that list.
#include "src/core_patterns_http.h"
#include "src/core_status_http.h"
#include "src/core_display_http.h"
#include "src/core_wifi_http.h"
// Also after the registry: MQTT resolves inbound pattern names against it.
#include "src/core_mqtt.h"
#include "src/core_mqtt_http.h"

MatrixPanel_I2S_DMA *dma_display = nullptr;

int currentPatternIdx = 0;

enum AppMode {
  MODE_RUNNING,
  MODE_SELECTING
};

AppMode currentMode = MODE_RUNNING;
unsigned long lastMs = 0;
// Smoothed time to render one pattern frame, in microseconds. Read by /status;
// 0 until the first frame lands.
uint32_t renderFrameUs = 0;
float contentNoticeTimer = 0.0f;

// Global brightness: K1 longpress enters brightness mode, K1 rotation
// adjusts. Exits on a K1 click (instant), a second longpress, or 5s idle.
// The BRIGHTNESS notice stays on screen for the whole time the mode is
// active — the moment it disappears you're out. (It used to flash for
// 1.2s while the mode silently lived on for 5s, so you could never tell
// which state you were in.) Value persists in NVS.
Preferences prefs;
uint8_t currentBrightness = DEFAULT_BRIGHTNESS;
// What the panel is actually running at. Equal to currentBrightness unless the
// power clamp is holding it down (core_power.h) — kept separately so the
// clamp never rewrites the person's own setting.
uint8_t appliedBrightness = DEFAULT_BRIGHTNESS;
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

// SLEEP: panel off, board idle, still on the network (src/core_sleep.h).
// Entered by turning K1 on the NETWORK screen, by <prefix>/sleep over MQTT, or
// by GET /api/display?sleep=1. Woken by any PHYSICAL knob turn or button press
// — sleepKnobSnapshot is the reference the turn is measured against, because
// input.knobDeltas has remote deltas merged into it by then and a show still
// streaming knob values must not switch the lights back on.
long sleepKnobSnapshot[4] = {0, 0, 0, 0};

// The selected pattern, remembered across sleep and across power-off. Stored as
// a SLUG rather than an index: installing or deleting one .pfm renumbers the
// list, so an index would come back as somebody else's pattern. Written on a
// debounce for the same reason brightness is — spinning K4 through fifty
// patterns should not be fifty NVS writes.
bool patternDirty = false;
uint32_t patternChangedAtMs = 0;
const uint32_t PATTERN_SAVE_DELAY_MS = 3000;

// Restoring a module at boot is not the same risk as picking one by hand.
// Loading any .pfm drops internal heap from ~14 KB to ~5 KB (measured), which
// is under what the console needs to send a page and low enough that a printf
// can fail to allocate its lock and abort() — so a pattern that is merely
// marginal can take the board down a few seconds after it starts. Picked by
// hand that is a crash you reboot out of; remembered, the reboot restores the
// same pattern and does it again, every 4 seconds, with the console alive too
// briefly to fix anything. Only a full NVS erase gets out of that, which no
// owner can do.
//
// So the restore arms a latch first and disarms it once the pattern has run
// long enough to be trusted. A boot that finds the latch still armed knows the
// previous boot did not survive its own remembered pattern, and forgets it.
// Origin is compiled in and cannot fail this way, so remembering it costs no
// NVS traffic at all.
bool patternLatchArmed = false;
const uint32_t PATTERN_LATCH_CLEAR_MS = 15000;

// Shown whenever no pattern is resident: the web console paused it, or a module
// refused to load. Before this the render loop simply drew nothing and flipped
// the buffer anyway, so the panel showed a torn, flickering leftover frame —
// which read as "the pattern is broken" even when the cause was just an open
// browser tab.
uint32_t pausedDrawnAtMs = 0;
bool pausedDirty = true;

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

// ── Remembering the selected pattern ─────────────────────────────────
// Mark on every path that moves currentPatternIdx (knob, OSC, MQTT, HTTP); the
// write itself happens later, from loop(), once the choice has settled.
void notePatternChanged() {
  patternDirty = true;
  patternChangedAtMs = millis();
}

void savePatternIfSettled() {
  if (!patternDirty) return;
  // Not while browsing: in SELECT mode the highlighted pattern is a question,
  // not an answer.
  if (currentMode == MODE_SELECTING) return;
  if ((millis() - patternChangedAtMs) < PATTERN_SAVE_DELAY_MS) return;

  char slug[MODULE_NAME_BYTES];
  patternSlugAt(currentPatternIdx, slug, sizeof(slug));
  patternDirty = false;
  if (!slug[0]) return;
  prefs.putString("pattern", slug);
  Serial.printf("[NVS] pattern saved: %s\n", slug);
}

// Resolve the remembered slug back to a position in the list built this boot.
// Returns 0 (Origin) whenever that cannot be done — a module the owner deleted
// since, a pack that was replaced, a first boot. Origin is compiled in
// precisely so there is always something to fall back to.
int restoreSavedPatternIdx() {
  char slug[MODULE_NAME_BYTES] = {};
  prefs.getString("pattern", slug, sizeof(slug));
  if (!slug[0]) return 0;

  // findPatternByName matches display name AND slug, so a pattern that was
  // saved before it had a sidecar name still resolves.
  int idx = findPatternByName(slug);
  if (idx < 0) {
    Serial.printf("[NVS] saved pattern \"%s\" is gone - starting at %s\n",
                  slug, patterns[0].name);
    return 0;
  }

  // Presets cannot exhaust the heap the way a module can, so pattern 0 skips
  // the latch entirely and a default board never writes NVS on boot.
  if (idx != 0) {
    if (prefs.getBool("pat_trying", false)) {
      // Armed from the previous boot and never disarmed: that boot died with
      // this pattern resident. Forget it rather than repeat the crash — the
      // owner can pick it again, and if it was a one-off nothing is lost but
      // the memory of it.
      prefs.remove("pattern");
      prefs.putBool("pat_trying", false);
      Serial.printf("[NVS] \"%s\" did not survive the last boot - forgetting it, "
                    "starting at %s\n",
                    slug, patterns[0].name);
      return 0;
    }
    prefs.putBool("pat_trying", true);
    patternLatchArmed = true;
  }

  Serial.printf("[NVS] restoring pattern: %s\n", patterns[idx].name);
  return idx;
}

// Disarm once the restored pattern has run long enough that the crash this
// guards against would already have happened. Runs from loop(); costs one NVS
// write per boot, and only on a board that remembers a module.
void clearPatternLatchIfStable() {
  if (!patternLatchArmed) return;
  if (millis() < PATTERN_LATCH_CLEAR_MS) return;
  patternLatchArmed = false;
  prefs.putBool("pat_trying", false);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Patternflow OS Booting... ===");

  reportHeap("boot");
  initEncoders();
  initDisplay();
  reportHeap("after display");

  prefs.begin("patternflow", false);
  currentBrightness = prefs.getUChar("brightness", DEFAULT_BRIGHTNESS);
  dma_display->setBrightness8(currentBrightness);
  // The clamp needs a frame's demand before it can say anything, so it starts
  // out of the way and takes over from the first present().
  PatternflowPower::load();

  // OSC + audio-react runtime flags, restored from NVS so the device boots
  // into whatever the K2 info screen was last set to.
  PatternflowOsc::setRuntimeEnabled(prefs.getBool("osc_runtime", true));
  PatternflowAudio::setRuntimeEnabled(prefs.getBool("audio_runtime", true));
  // MQTT channel + role from /mqtt. loadConfig first (broker + prefix +
  // channel), then apply the saved role under the channel's constraints
  // (Ch1–4 force Subscriber). Defaults stay Off, so a device that has never
  // been told otherwise never dials a broker.
  PatternflowMqtt::loadConfig();
  {
    auto savedRole = (PatternflowMqtt::Role)prefs.getUChar(
        "mqtt_role", PatternflowMqtt::ROLE_OFF);
    auto ch = PatternflowMqtt::currentChannel();
    if (savedRole == PatternflowMqtt::ROLE_OFF ||
        ch == PatternflowMqtt::CHANNEL_OFF) {
      PatternflowMqtt::applyChannel(PatternflowMqtt::CHANNEL_OFF,
                                    PatternflowMqtt::ROLE_OFF);
    } else {
      PatternflowMqtt::applyChannel(ch, savedRole);
    }
    // Director mode (local authoring broker) survives reboots the same way
    // the normal broker does.
    PatternflowMqtt::applySavedMode();
  }

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

  buildPatternList();   // presets first (pattern 1 = Origin), FATFS modules appended
  // Presets only. A module's setup() runs inside the loader when it is
  // activated, because its code is not resident until then.
  //
  // Note: the fork this came from stopped HUB75 DMA around module loads to keep
  // its ISR from tripping the interrupt watchdog mid-relocation. This library
  // version has stopDMAoutput() but no way back, so that trick is unavailable —
  // the loader's yield() every 64 relocations is the mitigation. Revisit if a
  // watchdog reset actually shows up on hardware.
  for (int i = 0; i < NUM_PATTERNS; i++) {
    if (!patterns[i].modulePath) patterns[i].setup();
  }
  // The calibration test card lives outside the pattern list (it is an overlay
  // summoned by /api/display, not art) but still bakes its tables once here.
  CalibPattern::setup();

  // Back to whatever was running before the power went away. Only meaningful
  // once the list exists, hence after buildPatternList().
  currentPatternIdx = restoreSavedPatternIdx();
  if (!activatePattern(currentPatternIdx) && currentPatternIdx != 0) {
    // A remembered module that no longer loads (corrupt upload, half-finished
    // write). The PATTERN FAILED screen is the right answer for a pattern
    // somebody just picked, and the wrong one for a boot — nobody asked for
    // this pattern in this session, so fall back rather than greet them with
    // an error.
    Serial.printf("[NVS] saved pattern failed to load (%s) - falling back\n",
                  PFModuleLoader::error());
    currentPatternIdx = 0;
    activatePattern(currentPatternIdx);
  }

  Serial.printf("Current Pattern: %s\n", patterns[currentPatternIdx].name);
  lastMs = millis();
}

const char* currentContentName() {
  return patterns[currentPatternIdx].name;
}

// Pattern names are UTF-8 — a community pattern is as likely to be called
// "Dynamic Moiré" as "Origin" — but the panel's font is a 5x7 ASCII table.
// Handed the raw bytes it draws one wrong glyph per byte, so "Moiré" came out
// as "MoirÃ©". Fold the Latin-1 letters onto their base character and reduce
// anything else to one '?', so a name is always readable and never explodes
// into noise. The JSON APIs keep the real UTF-8 name; this is display only.
void asciiFold(const char* source, char* out, size_t capacity) {
  static const char* const LATIN1 =
      "AAAAAAACEEEEIIII"   // C0-CF
      "DNOOOOOxOUUUUYPs"   // D0-DF
      "aaaaaaaceeeeiiii"   // E0-EF
      "dnooooo/ouuuuypy";  // F0-FF
  size_t w = 0;
  for (const uint8_t* p = (const uint8_t*)source; *p && w + 1 < capacity; ) {
    uint8_t c = *p;
    if (c >= 0x20 && c <= 0x7e) {
      out[w++] = (char)c;
      p++;
    } else if ((c == 0xc3) && p[1]) {
      // Two-byte Latin-1 supplement: 0xC3 0x80..0xBF maps to U+00C0..U+00FF.
      out[w++] = LATIN1[p[1] & 0x3f];
      p += 2;
    } else {
      out[w++] = '?';
      // Skip the whole multi-byte sequence so one character yields one '?'.
      p++;
      while ((*p & 0xc0) == 0x80) p++;
    }
  }
  out[w] = '\0';
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

// ── Panel palette + shared chrome for the info screens ──────────────
// The on-device screens borrow the patternflow.work design system's motifs
// at 64×128 scale: one LED-orange accent (#E8552E), hairline rules, and a
// glowing-dot-plus-title header (the web's version tag). Green/red stay
// reserved for live state (on/off, ok/error); orange is brand + progress.
uint16_t pfLedC()   { return dma_display->color565(232, 85, 46); }
uint16_t pfWhiteC() { return dma_display->color565(255, 255, 255); }
uint16_t pfGrayC()  { return dma_display->color565(140, 140, 140); }
uint16_t pfDimC()   { return dma_display->color565(90, 90, 90); }
uint16_t pfRuleC()  { return dma_display->color565(60, 60, 60); }
uint16_t pfGreenC() { return dma_display->color565(80, 220, 130); }
uint16_t pfRedC()   { return dma_display->color565(255, 80, 80); }
uint16_t pfBlueC()  { return dma_display->color565(120, 180, 255); }

// LED dot + centered title + hairline rule at the top of a portrait info
// screen (NETWORK / UPDATE). Content starts below y=15.
void drawScreenHeader(const char* title) {
  int16_t x1, y1;
  uint16_t tw, th;
  dma_display->setTextSize(1);
  dma_display->getTextBounds(title, 0, 0, &x1, &y1, &tw, &th);
  int x = (dma_display->width() - (int)(tw + 6)) / 2;
  dma_display->fillRect(x, 7, 2, 2, pfLedC());
  dma_display->setTextColor(pfWhiteC());
  dma_display->setCursor(x + 6, 4);
  dma_display->print(title);
  dma_display->drawFastHLine(4, 15, dma_display->width() - 8, pfRuleC());
}

// Notices sit on the same tight scrim the SELECT overlay uses (text bounds
// + 2px) instead of a full-width black band — less of the live pattern is
// blotted out and every overlay text now shares one look.
void drawContentNotice() {
  drawCenteredTextScrim(currentContentName(), 30, dma_display->color565(255, 255, 255), 1);
}

// Label plus a thin LED-orange level bar on one shared scrim — the bar
// makes the level readable at a glance mid-turn, without watching digits.
void drawBrightnessNotice() {
  char buf[24];
  int pct = (int)((currentBrightness * 100 + 127) / 255);
  snprintf(buf, sizeof(buf), "BRIGHTNESS %d%%", pct);

  int16_t x1, y1;
  uint16_t w, h;
  dma_display->setTextSize(1);
  dma_display->getTextBounds(buf, 0, 0, &x1, &y1, &w, &h);
  int x = (dma_display->width() - (int)w) / 2;
  int y = dma_display->height() - 16;
  dma_display->fillRect(x - 2, y - 2, w + 4, h + 9, 0);
  dma_display->setTextColor(pfWhiteC());
  dma_display->setCursor(x, y);
  dma_display->print(buf);

  int by = y + (int)h + 3;
  dma_display->drawFastHLine(x, by, w, pfDimC());
  int fw = ((int)w * pct) / 100;
  if (fw > 0) dma_display->drawFastHLine(x, by, fw, pfLedC());

  // While the power clamp is holding brightness down, turning the knob up
  // moves this bar and changes nothing on the panel. Say so, or it reads as
  // a broken control: the dim segment is the part the clamp is withholding.
  if (PatternflowPower::limiting) {
    int allowedPct = (int)((PatternflowPower::allowedBrightness * 100 + 127) / 255);
    int aw = ((int)w * allowedPct) / 100;
    if (aw < fw) dma_display->drawFastHLine(x + aw, by, fw - aw, pfDimC());
    char lim[20];
    snprintf(lim, sizeof(lim), "PWR %umA", (unsigned)PatternflowPower::estimateMa);
    uint16_t lw, lh;
    dma_display->getTextBounds(lim, 0, 0, &x1, &y1, &lw, &lh);
    int lx = (dma_display->width() - (int)lw) / 2;
    int ly = y - (int)lh - 3;
    dma_display->fillRect(lx - 2, ly - 2, lw + 4, lh + 4, 0);
    dma_display->setTextColor(pfLedC());
    dma_display->setCursor(lx, ly);
    dma_display->print(lim);
  }
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

  int w = dma_display->width();   // 64 in portrait

  drawScreenHeader("NETWORK");

  // Feature rows: status dot + name on the left, state right-aligned in
  // the state's color — reads like the web console's tag pills.
  struct FeatureRow { const char* name; bool compiled; bool on; };
  const FeatureRow rows[2] = {
    { "OSC", PatternflowOsc::isCompiledIn(),   PatternflowOsc::isRuntimeEnabled() },
    { "AUD", PatternflowAudio::isCompiledIn(), PatternflowAudio::isRuntimeEnabled() },
  };
  dma_display->setTextSize(1);
  for (int i = 0; i < 2; i++) {
    int y = 22 + i * 11;
    bool on = rows[i].compiled && rows[i].on;
    uint16_t st = rows[i].compiled ? (on ? pfGreenC() : pfRedC()) : pfDimC();
    dma_display->fillRect(8, y + 2, 2, 2, st);
    dma_display->setTextColor(pfWhiteC());
    dma_display->setCursor(14, y);
    dma_display->print(rows[i].name);
    const char* val = rows[i].compiled ? (on ? "ON" : "OFF") : "N/A";
    int16_t x1, y1;
    uint16_t tw, th;
    dma_display->getTextBounds(val, 0, 0, &x1, &y1, &tw, &th);
    dma_display->setTextColor(st);
    dma_display->setCursor(w - 8 - (int)tw, y);
    dma_display->print(val);
  }

  // Wi-Fi status + IP. A full IPv4 (up to 15 chars) doesn't fit one
  // portrait line — split after the second octet's dot.
  bool wifiUp = PatternflowWifi::isConnected();
  drawCenteredText(PatternflowWifi::statusText(), 50, wifiUp ? pfGreenC() : pfBlueC(), 1);
  String ip = PatternflowWifi::ipString();
  if (ip.length() <= 10) {
    drawCenteredText(ip.c_str(), 62, pfGrayC(), 1);
  } else {
    int cut = ip.indexOf('.', ip.indexOf('.') + 1) + 1;
    drawCenteredText(ip.substring(0, cut).c_str(), 62, pfGrayC(), 1);
    drawCenteredText(ip.substring(cut).c_str(), 72, pfGrayC(), 1);
  }

  // Hints under a hairline rule — turn to toggle, K1 to sleep, K4 for the
  // update screen, click (or hold) K2 to leave. Five lines at 9px pitch
  // instead of the old four at 10: adding SLEEP is what made it tight.
  dma_display->drawFastHLine(4, 82, w - 8, pfRuleC());
  drawCenteredText("TURN K2/K3", 86, pfDimC(), 1);
  drawCenteredText("OSC / AUD", 95, pfDimC(), 1);
  if (PatternflowSleep::isCompiledIn()) {
    drawCenteredText("K1 = SLEEP", 105, pfLedC(), 1);
  }
  if (PatternflowWebUpdate::isCompiledIn()) {
    drawCenteredText("K4=UPDATE", 114, pfDimC(), 1);
  }
  drawCenteredText("K2 = EXIT", 123, pfDimC(), 1);

  dma_display->setRotation(0);
}

// Shown when no pattern is resident. Two causes, and the difference matters to
// whoever is standing in front of the panel:
//
//   CONSOLE MODE   a browser has a console page open, so the pattern module was
//                  evicted to give the web server the RAM it needs (see
//                  core_patterns_http.h). Resumes on its own.
//   PATTERN FAILED a module refused to load. The loader's reason is printed,
//                  because "it just doesn't work" is the least useful bug report
//                  and this turns it into a specific one.
//
// Drawn PORTRAIT like the other info screens.
void drawPausedScreen() {
  dma_display->setRotation(1);
  dma_display->fillScreen(0);

  const int w = dma_display->width();
  const int h = dma_display->height();
  const bool consolePaused = PatternflowPatternsHttp::isConsolePaused();
  const char* reason = PFModuleLoader::error();

  drawScreenHeader(consolePaused ? "CONSOLE" : "PATTERN");

  if (consolePaused) {
    drawCenteredText("PAUSED", 26, pfWhiteC(), 1);
    drawCenteredText("web console", 42, pfDimC(), 1);
    drawCenteredText("is open", 52, pfDimC(), 1);
    dma_display->drawFastHLine(4, h - 28, w - 8, pfRuleC());
    drawCenteredText("RESUMES", h - 23, pfDimC(), 1);
    drawCenteredText("WHEN DONE", h - 13, pfDimC(), 1);
  } else {
    drawCenteredText("FAILED", 26, pfRedC(), 1);
    // The reason can be long (a missing symbol name); wrap it across the
    // 64px-wide portrait screen rather than clipping it to nothing.
    if (reason && reason[0]) {
      char line[12];
      int y = 44;
      for (size_t i = 0; reason[i] && y < h - 26; i += 10, y += 10) {
        size_t n = 0;
        while (n < 10 && reason[i + n]) { line[n] = reason[i + n]; n++; }
        line[n] = '\0';
        drawCenteredText(line, y, pfGrayC(), 1);
      }
    }
    dma_display->drawFastHLine(4, h - 18, w - 8, pfRuleC());
    drawCenteredText("TURN K4", h - 13, pfDimC(), 1);
  }

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

  int w = dma_display->width();   // 64 in portrait
  int h = dma_display->height();  // 128 in portrait

  drawScreenHeader("UPDATE");

  if (uploadPct >= 0 || PatternflowWebUpdate::isUploading()) {
    int pct = (uploadPct >= 0) ? uploadPct
                               : (int)PatternflowWebUpdate::progressPercent();
    drawCenteredText("FLASHING", 26, pfGrayC(), 1);
    char buf[8];
    snprintf(buf, sizeof(buf), "%d%%", pct);
    drawCenteredText(buf, 44, pfWhiteC(), 2);
    // LED-orange fill on a hairline frame — same accent as the web page's
    // progress bar.
    int bx = 8, by = 70, bw = w - 16;
    dma_display->drawRect(bx, by, bw, 7, pfRuleC());
    int fill = ((bw - 4) * constrain(pct, 0, 100)) / 100;
    if (fill > 0) dma_display->fillRect(bx + 2, by + 2, fill, 3, pfLedC());
    dma_display->drawFastHLine(4, h - 26, w - 8, pfRuleC());
    drawCenteredText("KEEP POWER", h - 21, pfDimC(), 1);
    drawCenteredText("ON", h - 11, pfDimC(), 1);
  } else if (PatternflowWebUpdate::isRebootPending()) {
    drawCenteredText("DONE", 46, pfGreenC(), 1);
    drawCenteredText("REBOOTING", 60, pfWhiteC(), 1);
  } else {
    bool wifiUp = PatternflowWifi::isConnected();
    if (PatternflowWebUpdate::hasError()) {
      drawCenteredText("FAILED", 21, pfRedC(), 1);  // details went to the browser
    } else {
      drawCenteredText(wifiUp ? "READY" : "NO WIFI", 21, wifiUp ? pfGreenC() : pfRedC(), 1);
    }
    if (wifiUp) {
      drawCenteredText("DROP .BIN:", 36, pfDimC(), 1);
      drawCenteredText(PF_OTA_HOSTNAME, 48, pfWhiteC(), 1);
      drawCenteredText(".local", 58, pfWhiteC(), 1);
      drawCenteredText("/update", 68, pfWhiteC(), 1);
      // Raw IP as the mDNS fallback, split like the NETWORK screen.
      String ip = PatternflowWifi::ipString();
      if (ip.length() <= 10) {
        drawCenteredText(ip.c_str(), 82, pfGrayC(), 1);
      } else {
        int cut = ip.indexOf('.', ip.indexOf('.') + 1) + 1;
        drawCenteredText(ip.substring(0, cut).c_str(), 82, pfGrayC(), 1);
        drawCenteredText(ip.substring(cut).c_str(), 92, pfGrayC(), 1);
      }
    } else {
      drawCenteredText(PatternflowWifi::statusText(), 52, pfBlueC(), 1);
    }
    dma_display->drawFastHLine(4, h - 16, w - 8, pfRuleC());
    drawCenteredText("K4 = EXIT", h - 11, pfDimC(), 1);
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

  int w = dma_display->width();   // 64 in portrait
  int h = dma_display->height();  // 128 in portrait

  // Center lockup: LED dot + title (the top header strip would collide
  // with the corner circles, so the lockup sits mid-screen instead).
  {
    const char* title = "KNOB MAP";
    int16_t x1, y1;
    uint16_t tw, th;
    dma_display->setTextSize(1);
    dma_display->getTextBounds(title, 0, 0, &x1, &y1, &tw, &th);
    int x = (w - (int)(tw + 6)) / 2;
    int y = (h / 2) - 10;
    dma_display->fillRect(x, y + 3, 2, 2, pfLedC());
    dma_display->setTextColor(pfWhiteC());
    dma_display->setCursor(x + 6, y);
    dma_display->print(title);
  }
  drawCenteredText("TURN = SHOW", (h / 2) + 2, pfDimC(), 1);
  drawCenteredText("K3 = EXIT", (h / 2) + 12, pfDimC(), 1);

  // Front-view corners: K1 top-right, K2 top-left, K3 bottom-right,
  // K4 bottom-left (indices are logical = physical after the identity map).
  const int cx[4] = { w - 13, 13, w - 13, 13 };
  const int cy[4] = { 14, 14, h - 14, h - 14 };

  uint32_t now = millis();
  for (int i = 0; i < 4; i++) {
    bool active = knobMapActiveAtMs[i] != 0 &&
                  (now - knobMapActiveAtMs[i]) < KNOB_MAP_HILITE_MS;
    // Active knob lights LED-orange (brand accent) with a soft fill; the
    // digit stays white for contrast either way.
    if (active) dma_display->fillCircle(cx[i], cy[i], 10, dma_display->color565(74, 27, 15));
    dma_display->drawCircle(cx[i], cy[i], 10, active ? pfLedC() : pfWhiteC());
    dma_display->setTextSize(1);
    dma_display->setTextColor(pfWhiteC());
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

  // Position track under the page indicator: a hairline with an LED-orange
  // marker at the highlighted pattern's place in the list — browsing with
  // K4 reads as sliding along the line. Drawn on its own small scrim so it
  // stays legible over the live preview.
  {
    int trackW = 40;
    int tx = (dma_display->width() - trackW) / 2;
    int ty = 23;
    dma_display->fillRect(tx - 2, ty - 2, trackW + 4, 5, 0);
    dma_display->drawFastHLine(tx, ty, trackW, pfDimC());
    int mx = (NUM_PATTERNS > 1)
             ? tx + ((trackW - 3) * currentPatternIdx) / (NUM_PATTERNS - 1)
             : tx;
    dma_display->fillRect(mx, ty - 1, 3, 3, pfLedC());
  }

  // The name is the whole point of this screen, and with patterns arriving
  // from a community it is as likely to be "Chromatic Aberration Vortex" as
  // "Origin". The stock font puts ~10 characters on this 64px-wide portrait
  // line, so both used to run off the edges — the old size-2 branch was 12px
  // per character, clipped from six characters on. Org_01 plus word wrap
  // fits the long ones and still reads.
  char name[MODULE_NAME_BYTES];
  asciiFold(patterns[currentPatternIdx].name, name, sizeof(name));
  PatternflowUiText::drawWrappedName(name, screenH / 2,
                                     dma_display->color565(255, 255, 255));

  PatternflowUiText::drawChromeLine("HOLD TO SELECT", screenH - 22,
                                    dma_display->color565(200, 200, 200));

  // Every later draw — the brightness notice, the next frame's pattern —
  // assumes the built-in font's top-left placement.
  PatternflowUiText::useDefaultFont();
}

// A banner from <prefix>/message, over whatever is running.
//
// Contributed by @SimonePDA. Drawn on top rather than instead of the pattern:
// the pattern keeps animating underneath, so a message is an interruption you
// can read and wait out, not a mode you have to leave.
//
// Uses the same wrapped-name helper the SELECT screen does, so a long message
// breaks the same way a long pattern name does — the panel is 64 px wide in
// portrait, which is about ten characters a line.
void drawMqttMessageOverlay() {
#if PF_MQTT_ENABLED
  if (!PatternflowMqtt::overlayActive()) return;

  char text[PatternflowMqtt::MESSAGE_BYTES];
  asciiFold(PatternflowMqtt::overlayMessage(), text, sizeof(text));
  if (!text[0]) return;

  // Portrait, like every other overlay; the caller is drawing in landscape.
  dma_display->setRotation(1);
  const int screenW = dma_display->width();
  const int screenH = dma_display->height();

  // A dim plate behind the words. Without it the message sits on top of a
  // bright pattern and is unreadable exactly when it matters most.
  int16_t x1, y1;
  uint16_t tw, th;
  PatternflowUiText::boundsWith(PatternflowUiText::useMessageFont, text, &x1, &y1, &tw, &th);
  const int plateH = th + 24;
  const int plateY = (screenH - plateH) / 2;
  dma_display->fillRect(0, plateY, screenW, plateH, dma_display->color565(0, 0, 0));
  dma_display->drawRect(0, plateY, screenW, plateH, pfLedC());

  PatternflowUiText::drawWrappedMessage(text, screenH / 2,
                                       dma_display->color565(255, 255, 255));
  PatternflowUiText::useDefaultFont();
  dma_display->setRotation(0);
#endif
}

void readInputFrame(InputFrame& input) {
  static long prevKnobs[4] = {0, 0, 0, 0};

  input.now = (uint32_t)millis();

  for (int i = 0; i < 4; i++) {
    input.knobs[i] = getClicks(LOGICAL_TO_PHYSICAL_KNOB[i]);
  }

  // One detent, one step. There used to be a fast-spin multiplier here (x2 to
  // x5 as the gap between detents shrank) so a knob could sweep a wide range
  // quickly — but it made the knobs unpredictable on exactly the parameter
  // that needs landing on a value: Origin's Mode knob picks a discrete preset,
  // and a quick turn skipped five of them at a time. Tested against a
  // no-acceleration build and the linear one won on feel.
  //
  // If some pattern's range now feels slow to cross, raise THAT pattern's step
  // constant (d * 10 -> d * 25). Linear and predictable beats a curve that
  // guesses at intent. Note OSC already bypassed the multiplier for the same
  // reason — see below.
  for (int i = 0; i < 4; i++) {
    input.knobDeltas[i] = (int)(input.knobs[i] - prevKnobs[i]);
    prevKnobs[i] = input.knobs[i];
  }

  // Physical encoder motion releases an absolute MQTT hold on that channel
  // (Director / Show manager yield to hands-on control). Checked here, before
  // OSC/MQTT/audio deltas are merged in, so only real knobs release — and
  // core_mqtt's grace window ignores chatter right after an absolute set.
  for (int i = 0; i < 4; i++) {
    if (input.knobDeltas[i] != 0) PatternflowMqtt::releaseAbsolute(i);
  }

  for (int i = 0; i < 4; i++) {
    Button* button = logicalButton(i);
    input.btnPressed[i] = button->pressed();
    input.btnHeld[i] = button->isDown();
  }

  // Remote-driven virtual knob motion (each a no-op when its feature is
  // compiled out). Added after acceleration so external automation moves at
  // the raw 1×-per-detent rate, not amplified by the fast-spin curve.
  for (int i = 0; i < 4; i++) {
    input.knobDeltas[i] += PatternflowOsc::consumeKnobDelta(i);
    input.knobDeltas[i] += PatternflowMqtt::consumeKnobDelta(i);
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

  // Absolute MQTT bus last, so it outranks everything above: held channels
  // get their 0..1000 value and their deltas / audio flags cleared, which is
  // what lets PFParams::apply pin the mapped parameter deterministically.
  PatternflowMqtt::fillAbsolute(input);
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
  // Above the sleep block on purpose: a board that is asleep still has to be
  // able to disarm the latch, or a device told to sleep within the first few
  // seconds of boot would forget a pattern that never misbehaved.
  clearPatternLatchIfStable();

  // Maintain Wi-Fi (non-blocking): retries while down, and on each fresh
  // (re)connection starts the network services. begin() is idempotent.
  PatternflowWifi::tick();
  if (PatternflowWifi::consumeJustConnected()) {
    PatternflowOsc::begin();
    PatternflowOta::begin();
    PatternflowAudio::begin();
    PatternflowWebUpdate::begin();
    PatternflowPatternsHttp::begin();
    PatternflowStatusHttp::begin();
    PatternflowDisplayHttp::begin();
    PatternflowWifiHttp::begin();
    PatternflowMqttHttp::begin();
    PatternflowMqtt::begin();
    Serial.println("[NET] services started");
    reportHeap("services up");
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

  // Deferred module-list rebuilds requested by uploads/deletes — run here,
  // outside any HTTP transaction.
  PatternflowPatternsHttp::tick();

  // MQTT keepalive + inbound delivery. Reconnects are paced internally, so
  // an unreachable broker costs one comparison per loop, not a stall.
  PatternflowMqtt::handle();

  // Browser self-update housekeeping: boot-valid marking and the deferred
  // post-flash reboot. (Upload traffic itself arrives through the shared
  // HTTP server serviced just above.)
  PatternflowWebUpdate::handle();

  unsigned long now = millis();
  float dt = (now - lastMs) / 1000.0f;
  lastMs = now;
  const uint32_t frameStartedUs = micros();

  InputFrame input;
  readInputFrame(input);

  // One-shot click events for the mode buttons, consumed every frame so a
  // click that lands outside its mode can't stay latched and fire later.
  bool k1Clicked = logicalButton(0)->clicked();
  bool k2Clicked = logicalButton(1)->clicked();
  bool k3Clicked = logicalButton(2)->clicked();
  bool k4Clicked = logicalButton(3)->clicked();

  // ── SLEEP ──────────────────────────────────────────────────────────
  // Remote requests land here, not in the MQTT callback that produced them:
  // stopping a DMA engine and reclocking the CPU inside client.loop() is the
  // kind of thing this file's history warns about.
  {
    bool wantSleep;
    if (PatternflowMqtt::consumeSleepRequest(wantSleep)) {
      PatternflowSleep::request(wantSleep);
    }
  }
  // Flashing beats sleeping, in both directions: a device that is being
  // reflashed does not fall asleep underneath the upload, and one that is
  // already asleep when an image starts arriving wakes up for it. Sleep stops
  // the DMA engine, drops the CPU to 80 MHz and paces the loop — none of which
  // an image being written to flash should have to put up with, and whoever is
  // flashing wants the UPDATE screen anyway.
  const bool flashInFlight = PatternflowWebUpdate::isUploading() ||
                             PatternflowWebUpdate::isRebootPending() ||
                             PatternflowOta::isInProgress();
  if (!flashInFlight && PatternflowSleep::applyPending() &&
      PatternflowSleep::isSleeping()) {
    // Whatever the knobs read at this moment is "not touched since".
    for (int i = 0; i < 4; i++) sleepKnobSnapshot[i] = input.knobs[i];
  }
  PatternflowMqtt::noteSleep(PatternflowSleep::isSleeping());

  if (PatternflowSleep::isSleeping()) {
    // input.knobs is the raw physical click count — the one field readInputFrame
    // never merges OSC/MQTT/audio into. Comparing against the snapshot is what
    // makes "a hand on the knob wakes it, a show streaming knob values does
    // not" true rather than approximately true.
    bool woke = flashInFlight;
    if (PatternflowSleep::wakeableByInput()) {
      for (int i = 0; i < 4; i++) {
        if (input.knobs[i] != sleepKnobSnapshot[i] || input.btnPressed[i]) woke = true;
      }
    } else if (!woke) {
      // Still inside the guard window: keep the snapshot moving with the hand,
      // so the rest of the K1 turn that asked for sleep doesn't undo it.
      for (int i = 0; i < 4; i++) sleepKnobSnapshot[i] = input.knobs[i];
    }
    if (woke) {
      PatternflowSleep::wake();
      // wake() put the panel back to currentBrightness, so the clamp's idea of
      // what the panel is running at has to agree — otherwise the comparison
      // below ("allowed != appliedBrightness") sees no change and the panel
      // sits at full brightness while the clamp believes it is holding it down.
      appliedBrightness = currentBrightness;
      // Waking with a press means a button is still down, and it will cross the
      // long-press threshold about a second from now — opening BRIGHTNESS or
      // NETWORK on the way out of sleep. Retire the gesture: whatever is held
      // has already been spent on waking up.
      for (int i = 0; i < 4; i++) {
        Button* b = logicalButton(i);
        if (b->isDown()) b->longPressFired = true;
        b->clicked();
      }
      // A console tab open somewhere has the resident module evicted, and with
      // Origin the only compiled-in preset that is the ordinary case, not an
      // exotic one. Left alone, waking would land on the CONSOLE PAUSED card
      // until the 25 s idle timer fired — so a wake, from any of the three
      // sources, counts as "give me the panel back". Same request the Play Now
      // path makes: tick() does the reload from loop(), never from inside an
      // HTTP transaction.
      if (PatternflowPatternsHttp::isConsolePaused()) {
        PatternflowPatternsHttp::requestReload();
      }
      // Every throttled screen redraws from scratch on the next frame; their
      // "drawn at" timestamps are from before the sleep.
      pausedDirty = true;
      netInfoDirty = true;
      knobMapDirty = true;
      updateDirty = true;
    }
    // Asleep: no render, no flip, no power clamp. Everything above this point
    // — Wi-Fi, OTA, HTTP, MQTT, web update — has already run, which is what
    // keeps the device reachable while it sleeps.
    //
    // The delay is not politeness, it is most of the ESP-side saving: without
    // it this becomes a busy loop polling sockets flat out at 80 MHz and the
    // core never idles, so neither modem sleep nor the IDF's clock gating gets
    // a chance to do anything. Yielding hands the time to the idle task
    // instead. It costs up to SLEEP_LOOP_DELAY_MS of wake latency on a knob,
    // which is well under what a hand can notice, and nothing at all on a
    // flash — that wakes the device outright, just above.
    if (!woke) delay(PatternflowSleep::LOOP_DELAY_MS);
    return;
  }

  // Deferred NVS write for the selected pattern; no-op until the choice settles.
  savePatternIfSettled();

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
    // Turn K1 → sleep. Either direction: the screen is about to go dark, so
    // "turn right for on" has nothing to mean here, and a person reaching for
    // the wrong direction should still get what they asked for. Waking is any
    // knob or button, handled at the top of the loop.
    if (input.knobDeltas[0] != 0 && PatternflowSleep::isCompiledIn()) {
      oscInfoShowing = false;
      PatternflowSleep::request(true);
      Serial.println(">>> SLEEP requested (K1 on NETWORK screen)");
    }

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
      // Physical escape hatch for the calibration overlay: whoever is at the
      // device outranks a browser tab that may no longer exist.
      CalibPattern::overrideOn = false;
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

  // MQTT mirrors the same frame: knob values as they move, and the pattern
  // name only when it actually changes (notePattern dedupes, so this does
  // not republish every frame).
  PatternflowMqtt::update(input, currentContentName());
  PatternflowMqtt::notePattern(currentContentName());

  // Apply OSC-driven pattern / content changes from the most recent
  // received packet. Knob deltas were already merged into the input
  // frame inside readInputFrame().
  int oscPatternIdx;
  if (PatternflowOsc::consumePatternIdx(oscPatternIdx) &&
      oscPatternIdx >= 0 && oscPatternIdx < NUM_PATTERNS &&
      activatePattern(oscPatternIdx)) {
    currentPatternIdx = oscPatternIdx;
    currentMode = MODE_RUNNING;
    contentNoticeTimer = CONTENT_NOTICE_SECONDS;
    CalibPattern::overrideOn = false;  // picking a pattern dismisses the test card
    notePatternChanged();
    Serial.printf(">>> OSC pattern → %s\n", patterns[currentPatternIdx].name);
  }

  // Same contract again, fed by a retained <prefix>/pattern message. The
  // name was already resolved to an index inside core_mqtt.h, so a rename
  // on the broker side cannot select the wrong slot here.
  int mqttPatternIdx;
  if (PatternflowMqtt::consumePatternIdx(mqttPatternIdx) &&
      mqttPatternIdx >= 0 && mqttPatternIdx < NUM_PATTERNS &&
      activatePattern(mqttPatternIdx)) {
    currentPatternIdx = mqttPatternIdx;
    currentMode = MODE_RUNNING;
    contentNoticeTimer = CONTENT_NOTICE_SECONDS;
    CalibPattern::overrideOn = false;
    notePatternChanged();
    Serial.printf(">>> MQTT pattern → %s\n", patterns[currentPatternIdx].name);
  }

  // Same contract as the OSC path above, fed by GET /api/patterns/select.
  int httpPatternIdx;
  if (PatternflowPatternsHttp::consumeSelectIdx(httpPatternIdx) &&
      httpPatternIdx >= 0 && httpPatternIdx < NUM_PATTERNS &&
      activatePattern(httpPatternIdx)) {
    currentPatternIdx = httpPatternIdx;
    currentMode = MODE_RUNNING;
    contentNoticeTimer = CONTENT_NOTICE_SECONDS;
    CalibPattern::overrideOn = false;  // picking a pattern dismisses the test card
    notePatternChanged();
    Serial.printf(">>> HTTP pattern → %s\n", patterns[currentPatternIdx].name);
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
  } else if (currentMode == MODE_RUNNING && CalibPattern::overrideOn) {
    // Calibration overlay: the test card draws instead of the pattern, which
    // freezes underneath (not updated) and resumes exactly where it was once
    // the tuner dismisses the card. Runs even while the console has the module
    // evicted — the card is compiled in and needs none of the module's RAM.
    // K1/K2 still work on the card for whoever is standing at the panel.
    pausedDirty = true;
    CalibPattern::update(dt, input);
    CalibPattern::draw();
    if (brightnessAdjusting) {
      drawBrightnessNotice();
    }
  } else if (currentMode == MODE_RUNNING && activePatternIdx < 0) {
    // Same throttled-redraw scheme as the info screens: this is static text and
    // repainting it every loop races the panel scanout.
    if (pausedDirty || (now - pausedDrawnAtMs) >= NET_INFO_REDRAW_MS) {
      drawPausedScreen();
      pausedDrawnAtMs = now;
      pausedDirty = false;
    } else {
      frameDrawn = false;
    }
  } else if (currentMode == MODE_RUNNING) {
    pausedDirty = true;
    updateActivePattern(dt, input);
    drawActivePattern();
    drawMqttMessageOverlay();

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
      // Presets are already resident so this returns immediately; landing on a
      // module costs a read + relocate + setup(). Measure that before deciding
      // whether browsing needs to defer the load until the knob settles.
      activatePattern(currentPatternIdx);
      // Marked, not written: savePatternIfSettled() holds off until SELECT is
      // left and the choice has stopped moving.
      notePatternChanged();
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
    updateActivePattern(dt, preview);
    drawActivePattern();

    dma_display->setRotation(1);
    drawSelectingMode();
    if (brightnessAdjusting) {
      drawBrightnessNotice();  // mode indicator, same as in RUNNING
    }
    dma_display->setRotation(0);  // back to landscape for the next frame
  }

  // Frame rate, sampled only on frames that actually rendered a pattern — the
  // info screens deliberately skip drawing, and counting those would report a
  // rate the panel never showed. Exponential average so /status reads steady
  // instead of jittering with every frame.
  if (frameDrawn) {
    dma_display->flipDMABuffer();
    uint32_t frameUs = micros() - frameStartedUs;
    renderFrameUs = renderFrameUs ? (renderFrameUs * 7 + frameUs) / 8 : frameUs;

    // Total power clamp. The frame that just went out is the one whose demand
    // was measured, so the answer lands on the next one — invisible at this
    // frame rate, and it costs no second pass over the pixels.
    //
    // currentBrightness stays exactly what the person chose: only the value
    // handed to the panel is capped, so turning the clamp off (or pointing a
    // pattern at something darker) restores their setting with no further
    // input from them.
    uint8_t allowed = PatternflowPower::allow(currentBrightness);
    if (allowed != appliedBrightness) {
      appliedBrightness = allowed;
      dma_display->setBrightness8(allowed);
    }
  }
}
