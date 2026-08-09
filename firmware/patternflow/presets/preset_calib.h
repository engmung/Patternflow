// SPDX-License-Identifier: MIT
// Calibration test card — a measuring instrument, NOT a pattern.
//
// Deliberately absent from the pattern registry: browsing the knob list is a
// curated art experience, and a white test field in slot 35 is not art. The
// card is an OVERLAY the tuner summons — /api/display?screen=N draws it over
// whatever pattern is running (the pattern freezes underneath and resumes
// untouched), ?screen=-1 dismisses it. Entering SELECT mode (K4 hold) or
// switching patterns also dismisses it, so a dead tuner tab can never leave
// the panel stuck on a test card.
//
// Used together with /api/display's wb/gamma/sat params and the reference
// view in web/public/panel-tuner.html to tune the output stage by eye.
//
//   K1 turn  switch screen (works physically while the overlay is up):
//     0 WHITE   full field at K2's level — the white-balance screen. Tune
//               wb_* until it reads as neutral white, then drop the level
//               and check the tint holds at low drive.
//     1 GRAYS   16-step staircase over a smooth gradient — banding and the
//               dark end of the curve.
//     2 COLORS  R G B C M Y W K bars, full drive over half drive — channel
//               sanity and the saturation control.
//     3 RAMPS   blue→yellow and red→blue, each as an sRGB lerp band directly
//               above its OKLab lerp band — the web lab's new ramp math,
//               shown on the actual LEDs.
//   K2 turn  WHITE level (8..255, one detent = 8)
#pragma once
#include <Arduino.h>
#include <math.h>
#include "../config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"

namespace CalibPattern {
  const char* NAME = "Calibration";
  const char* const KNOB_LABELS[4] = {"Screen", "White Lv", "-", "-"};

  constexpr int NUM_SCREENS = 4;
  int screen = 0;
  int whiteLevel = 255;
  float indicatorTimer = 0.0f;

  // True while the test card is drawn over the running pattern. Flipped by
  // /api/display (?screen=N on, ?screen=-1 off) and cleared by the sketch on
  // any pattern switch or SELECT-mode entry.
  bool overrideOn = false;

  // Absolute remote control, written by /api/display?screen=&level= (see
  // core_display_http.h — it is included after the registry, so it can reach
  // this namespace) and consumed in update(). Knob deltas are relative, which
  // is fine in front of the device but useless for keeping a browser-side
  // reference view in sync: the page needs to SET screen 2, not nudge by one.
  int requestedScreen = -1;
  int requestedLevel = -1;

  // ── OKLab, setup-time only ──────────────────────────────────────────
  // Same math as web/src/lib/patternHarness.ts, reduced to what a baked ramp
  // needs. Runs once per boot to fill the RAMPS tables — never per frame.
  inline float srgbToLin(float c) {
    return c <= 0.04045f ? c / 12.92f : powf((c + 0.055f) / 1.055f, 2.4f);
  }
  inline float linToSrgb(float c) {
    float v = c <= 0.0031308f ? c * 12.92f : 1.055f * powf(c, 1.0f / 2.4f) - 0.055f;
    return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
  }
  inline void srgbToOklab(float r, float g, float b, float out[3]) {
    float lr = srgbToLin(r), lg = srgbToLin(g), lb = srgbToLin(b);
    float l = cbrtf(0.4122214708f * lr + 0.5363325363f * lg + 0.0514459929f * lb);
    float m = cbrtf(0.2119034982f * lr + 0.6806995451f * lg + 0.1073969566f * lb);
    float s = cbrtf(0.0883024619f * lr + 0.2817188376f * lg + 0.6299787005f * lb);
    out[0] = 0.2104542553f * l + 0.793617785f * m - 0.0040720468f * s;
    out[1] = 1.9779984951f * l - 2.428592205f * m + 0.4505937099f * s;
    out[2] = 0.0259040371f * l + 0.7827717662f * m - 0.808675766f * s;
  }
  inline void oklabToSrgb(const float lab[3], uint8_t out[3]) {
    float l_ = lab[0] + 0.3963377774f * lab[1] + 0.2158037573f * lab[2];
    float m_ = lab[0] - 0.1055613458f * lab[1] - 0.0638541728f * lab[2];
    float s_ = lab[0] - 0.0894841775f * lab[1] - 1.291485548f * lab[2];
    float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    float r = 4.0767416621f * l - 3.3077115913f * m + 0.2309699292f * s;
    float g = -1.2684380046f * l + 2.6097574011f * m - 0.3413193965f * s;
    float b = -0.0041960863f * l - 0.7034186147f * m + 1.707614701f * s;
    out[0] = (uint8_t)(linToSrgb(r) * 255.0f + 0.5f);
    out[1] = (uint8_t)(linToSrgb(g) * 255.0f + 0.5f);
    out[2] = (uint8_t)(linToSrgb(b) * 255.0f + 0.5f);
  }

  // RAMPS screen tables: [0] b→y sRGB, [1] b→y OKLab, [2] r→b sRGB,
  // [3] r→b OKLab. 1.5 KB of DRAM, filled once in setup().
  uint8_t ramps[4][PANEL_RES_W][3];

  inline void bakeRampPair(int srgbRow, int oklabRow,
                           uint8_t r0, uint8_t g0, uint8_t b0,
                           uint8_t r1, uint8_t g1, uint8_t b1) {
    float labA[3], labB[3];
    srgbToOklab(r0 / 255.0f, g0 / 255.0f, b0 / 255.0f, labA);
    srgbToOklab(r1 / 255.0f, g1 / 255.0f, b1 / 255.0f, labB);
    for (int x = 0; x < PANEL_RES_W; x++) {
      float t = (float)x / (float)(PANEL_RES_W - 1);
      ramps[srgbRow][x][0] = (uint8_t)(r0 + (r1 - r0) * t + 0.5f);
      ramps[srgbRow][x][1] = (uint8_t)(g0 + (g1 - g0) * t + 0.5f);
      ramps[srgbRow][x][2] = (uint8_t)(b0 + (b1 - b0) * t + 0.5f);
      float lab[3] = {
        labA[0] + (labB[0] - labA[0]) * t,
        labA[1] + (labB[1] - labA[1]) * t,
        labA[2] + (labB[2] - labA[2]) * t,
      };
      oklabToSrgb(lab, ramps[oklabRow][x]);
    }
  }

  void setup() {
    bakeRampPair(0, 1, 0, 0, 255, 255, 255, 0);   // blue → yellow
    bakeRampPair(2, 3, 255, 0, 0, 0, 0, 255);     // red → blue
  }

  void update(float dt, const InputFrame& input) {
    if (requestedScreen >= 0) {
      screen = requestedScreen % NUM_SCREENS;
      requestedScreen = -1;
      indicatorTimer = 1.5f;
    }
    if (requestedLevel >= 0) {
      whiteLevel = requestedLevel < 8 ? 8 : (requestedLevel > 255 ? 255 : requestedLevel);
      requestedLevel = -1;
    }
    if (input.knobDeltas[0] != 0) {
      screen = ((screen + input.knobDeltas[0]) % NUM_SCREENS + NUM_SCREENS) % NUM_SCREENS;
      indicatorTimer = 1.5f;
    }
    if (input.knobDeltas[1] != 0) {
      whiteLevel += input.knobDeltas[1] * 8;
      if (whiteLevel < 8) whiteLevel = 8;
      if (whiteLevel > 255) whiteLevel = 255;
    }
    if (indicatorTimer > 0.0f) indicatorTimer -= dt;
  }

  inline void drawWhite() {
    uint8_t v = (uint8_t)whiteLevel;
    for (int y = 0; y < PANEL_RES_H; y++)
      for (int x = 0; x < PANEL_RES_W; x++)
        PFCanvas::setPixel(x, y, v, v, v);
  }

  inline void drawGrays() {
    for (int y = 0; y < PANEL_RES_H; y++) {
      for (int x = 0; x < PANEL_RES_W; x++) {
        uint8_t v;
        if (y < PANEL_RES_H / 2) {
          v = (uint8_t)((x / 8) * 17);              // 16 steps, 0..255
        } else {
          v = (uint8_t)((x * 255) / (PANEL_RES_W - 1));  // smooth
        }
        PFCanvas::setPixel(x, y, v, v, v);
      }
    }
  }

  inline void drawColors() {
    static const uint8_t BARS[8][3] = {
      {255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {0, 255, 255},
      {255, 0, 255}, {255, 255, 0}, {255, 255, 255}, {0, 0, 0},
    };
    for (int y = 0; y < PANEL_RES_H; y++) {
      bool half = y >= PANEL_RES_H / 2;
      for (int x = 0; x < PANEL_RES_W; x++) {
        const uint8_t* c = BARS[(x / 16) & 7];
        if (half) PFCanvas::setPixel(x, y, c[0] >> 1, c[1] >> 1, c[2] >> 1);
        else PFCanvas::setPixel(x, y, c[0], c[1], c[2]);
      }
    }
  }

  inline void drawRamps() {
    for (int y = 0; y < PANEL_RES_H; y++) {
      int band = y / (PANEL_RES_H / 4);
      if (band > 3) band = 3;
      // 1px black rule between bands so the pairs read as separate strips.
      bool rule = (y % (PANEL_RES_H / 4)) == 0 && y != 0;
      for (int x = 0; x < PANEL_RES_W; x++) {
        if (rule) PFCanvas::setPixel(x, y, 0, 0, 0);
        else PFCanvas::setPixel(x, y, ramps[band][x][0], ramps[band][x][1], ramps[band][x][2]);
      }
    }
  }

  void draw() {
    switch (screen) {
      case 0: drawWhite(); break;
      case 1: drawGrays(); break;
      case 2: drawColors(); break;
      default: drawRamps(); break;
    }

    // Screen indicator, shown briefly after a switch so it never pollutes the
    // measurement: one 2×2 dot per screen along the bottom-left, current lit.
    if (indicatorTimer > 0.0f) {
      for (int i = 0; i < NUM_SCREENS; i++) {
        uint8_t v = (i == screen) ? 255 : 60;
        for (int dy = 0; dy < 2; dy++)
          for (int dx = 0; dx < 2; dx++)
            PFCanvas::setPixel(2 + i * 4 + dx, PANEL_RES_H - 4 + dy, v, i == screen ? 90 : 60, 30);
      }
    }

    PFCanvas::present();
  }
} // namespace CalibPattern
