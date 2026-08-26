// ═══════════════════════════════════════════════════════════
// PatternFlow - weather, as an addon
//
// The second port onto the addon seam, and the one that grew it: the show
// player needed six hooks, weather needed two more.
//
//   fillInput  - a live reading drives the four knob lanes, so a pattern
//                animates from the weather without knowing what weather is.
//   chromeVisible (on PFAddonFrame) - the corner clock has to stay off the
//                panel while the device's own UI is up. In the sketch that
//                was four separate globals; an addon cannot see those, and
//                should not have to.
//
// The clock itself moved here whole. It used to be drawClockOverlay() in
// the sketch — 30 lines of the core knowing what a clock is.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_addon.h"
#include "../../src/core_ui_text.h"
#include "core_weather.h"
#include "core_weather_http.h"

namespace PFAddonWeather {

inline void setup() {
  PatternflowWeather::loadConfig();
}

inline void onNetwork() {
  PatternflowWeatherHttp::begin();
}

inline void loop(const PFAddonFrame&) {
  PatternflowWeather::refreshLocalTime();
  PatternflowWeather::handle();
}

// A live reading overrides the audio lane; the absolute bus still outranks
// this, because fillAbsolute runs after every addon has had its say.
inline void fillInput(InputFrame& input) {
  if (!PatternflowWeather::driving()) return;
  for (int i = 0; i < 4; i++) {
    input.knobAudioActive[i] = true;
    input.knobAudioValue[i] = PatternflowWeather::value(i);
  }
}

// Optional HH:MM:SS corner clock (NTP + /weather UTC offset). Drawn after
// the pattern: white glyphs with a 1px black outline so the pattern shows
// through. Portrait, top-right (panel stood on end).
inline void drawOverlay(const PFAddonFrame& frame) {
  if (!PatternflowWeather::clockOverlayEnabled()) return;
  if (!PatternflowWeather::timeSynced()) return;
  if (frame.chromeVisible) return;
  // The Weather pattern draws its own clock, and Black owns the panel when
  // it is showing a face.
  if (frame.patternName && strcmp(frame.patternName, "Weather") == 0) return;

  char buf[12];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d",
           PatternflowWeather::localHour(), PatternflowWeather::localMinute(),
           PatternflowWeather::localSecond());

  uint8_t prevRot = dma_display->getRotation();
  dma_display->setRotation(1);  // portrait — matches how the panel is stood
  int16_t x1, y1;
  uint16_t w, h;
  uiTextBounds(buf, &x1, &y1, &w, &h);
  int x = dma_display->width() - (int)w - 3;
  int y = 2;
  const uint16_t ink = dma_display->color565(245, 245, 245);
  // Two-pass pixel outline — not 8x print() (that flickered the digits).
  uiDrawOutlinedAtBaseline(buf, x - x1, y - y1, ink);
  uiUseDefaultFont();
  dma_display->setRotation(prevRot);
}

inline const PFAddon descriptor = {
    "weather",
    "weather",
    setup,
    onNetwork,
    loop,
    fillInput,
    nullptr,       // onUserInput  - nothing to reset
    nullptr,       // claimsPattern - never drives the pattern
    nullptr,       // takePattern
    drawOverlay,
};

}  // namespace PFAddonWeather
