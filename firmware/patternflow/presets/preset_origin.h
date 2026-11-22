// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: Origin
// Author:  Seunghun LEE
// Lineage: Created in Blender3D, converted to JS via AI
// Generated from web/src/lib/presets/pattern-origin.ts
//

#pragma once
#include <math.h>
#include "../src/core_display.h"
#include "../src/core_math.h"
#include "../src/core_color.h"
#include "../src/core_canvas.h"
#include "../src/core_params.h"

namespace Origin {
  const char* NAME = "Origin";
  const char* KNOB_LABELS[4] = {"hue", "speed", "mode", "freq"};
  constexpr bool ABSOLUTE_READY = true;

  // --- 상태 변수 ---
  struct Params {
    int hueDeg = 0;
    float speed = 2.0f;
    int mode = 0;
    float freq = 220.0f;
  };
  Params params;

  struct PatternPreset {
    int rows, cols, gap, tileSize, gridStep, gridCells;
  };

  const int NUM_PRESETS = 5;
  const PatternPreset presets[NUM_PRESETS] = {
    { 1, 2,  4, 56, 7, 8 },
    { 2, 4,  3, 27, 3, 9 },
    { 3, 6,  2, 18, 3, 6 },
    { 3, 6,  2, 18, 2, 9 },
    { 6, 12, 0, 10, 2, 5 },
  };

  int curMode = -1;
  int totalW, totalH, offsetX, offsetY;

  const int MAX_GRID_CELLS = 9;
  float distLUT[MAX_GRID_CELLS][MAX_GRID_CELLS];

  const int NUM_STOPS = 5;
  PFColor::ColorStop colorRamp[NUM_STOPS];

  // 노브 변화량 추적을 위한 내부 변수
  float phase = 0.0f;

  void updateColorRamp(float hue) {
    uint8_t hr, hg, hb;
    PFColor::hsvToRgb(hue, 1.0f, 1.0f, hr, hg, hb);
    colorRamp[0] = {0.000f, 0, 0, 0};
    colorRamp[1] = {0.154f, 40, 40, 40};
    colorRamp[2] = {0.556f, hr, hg, hb};
    colorRamp[3] = {0.816f, 255, 255, 255};
    colorRamp[4] = {1.000f, 255, 255, 255};
  }

  inline void sampleColorRamp(float val, uint8_t &r, uint8_t &g, uint8_t &b) {
    float t = (val + 1.0f) * 0.5f;
    PFColor::sampleRamp(colorRamp, NUM_STOPS, t, r, g, b);
  }

  void applyPreset(int idx) {
    const PatternPreset &p = presets[idx];
    totalW = p.cols * p.tileSize + (p.cols + 1) * p.gap;
    totalH = p.rows * p.tileSize + (p.rows + 1) * p.gap;
    offsetX = (PANEL_RES_W - totalW) / 2;
    offsetY = (PANEL_RES_H - totalH) / 2;

    float cx = p.tileSize / 2.0f;
    for (int gy = 0; gy < p.gridCells; gy++)
      for (int gx = 0; gx < p.gridCells; gx++) {
        float dx = gx * p.gridStep + p.gridStep / 2.0f - cx;
        float dy = gy * p.gridStep + p.gridStep / 2.0f - cx;
        distLUT[gy][gx] = sqrtf(dx * dx + dy * dy);
      }
    curMode = idx;
  }

  // --- 공통 인터페이스 (Setup, Update, Draw) ---
  void setup() {
    PFMath::buildSinLUT();
    applyPreset(0);
    updateColorRamp(0.0f);
    phase = 0.0f;
  }

  void update(float dt, const InputFrame& input) {
    // Absolute MQTT (0..1000) > Weather/audio 0..1 > encoder/OSC deltas.
    PFParams::applyInt(input, 0, &params.hueDeg, 0, 359, 10, true);
    if (input.btnPressed[0] && !input.paramAbsoluteActive[0] && !input.knobAudioActive[0]) {
      params.hueDeg = 0;
      Serial.println("[Origin] Hue → 0°");
    }

    PFParams::apply(input, 1, &params.speed, 0.0f, 5.0f, 0.1f);
    if (input.btnPressed[1] && !input.paramAbsoluteActive[1] && !input.knobAudioActive[1]) {
      params.speed = 0.0f;
      Serial.println("[Origin] Speed → 0");
    }

    PFParams::applyIndex(input, 2, &params.mode, NUM_PRESETS);
    if (input.btnPressed[2] && !input.paramAbsoluteActive[2] && !input.knobAudioActive[2]) {
      params.mode = 0;
      Serial.println("[Origin] Mode → 0");
    }

    PFParams::apply(input, 3, &params.freq, 0.1f, 1000.0f, 10.0f);
    if (input.btnPressed[3] && !input.paramAbsoluteActive[3] && !input.knobAudioActive[3]) {
      params.freq = 0.1f;
      Serial.println("[Origin] Freq → 0.1");
    }

    // Apply Mode Change
    if (params.mode != curMode) {
      applyPreset(params.mode);
      Serial.printf("[Origin] Mode %d: %dx%d\n", params.mode, presets[params.mode].cols, presets[params.mode].rows);
    }

    // The wave only ever reads phase through fastSin, so a whole turn taken
    // off changes nothing on the panel. Left to grow, a float this size stops
    // moving smoothly after some hours and stops altogether after some weeks.
    // One step is at most 1.0 (dt 0.1 s, speed 5), so one subtraction is enough.
    phase += dt * params.speed * 2.0f;
    if (phase >= PFMath::TWO_PI_F) phase -= PFMath::TWO_PI_F;
    updateColorRamp(params.hueDeg / 360.0f);
  }

  void draw() {
    const PatternPreset &p = presets[curMode];
    float br = 80.0f / 100.0f;
    int cellW = p.tileSize + p.gap;
    int cellH = p.tileSize + p.gap;
    float curFreqBase = (float)params.freq;
    float curFreqVar  = (float)params.freq * 0.9f;

    // Every pixel of a grid cell has the same distance and the same tile, so
    // the same colour. It is worked out once a cell and the cell is filled,
    // where there used to be four divisions, a sine and a ramp lookup for each
    // of 8,192 pixels: about 6 ms a frame became 1.4. The expressions are the ones
    // the per-pixel loop had, in the same order, so the picture is the same
    // to the bit. The gaps and the margin are the black clear() leaves.
    PFCanvas::clear();

    for (int tj = 0; tj < p.rows; tj++) {
      const int tileY = offsetY + p.gap + tj * cellH;
      for (int ti = 0; ti < p.cols; ti++) {
        const int tileX = offsetX + p.gap + ti * cellW;
        float tileFreq = curFreqBase + (tj * p.cols + ti) * curFreqVar * 0.15f;

        for (int gy = 0; gy < p.gridCells; gy++) {
          // The last cell of a tile takes whatever the grid does not divide,
          // as localY / gridStep clamped to gridCells - 1 did.
          int y0 = tileY + gy * p.gridStep;
          int y1 = (gy == p.gridCells - 1) ? (tileY + p.tileSize) : (y0 + p.gridStep);
          if (y1 > tileY + p.tileSize) y1 = tileY + p.tileSize;
          if (y0 < 0) y0 = 0;
          if (y1 > PANEL_RES_H) y1 = PANEL_RES_H;
          for (int gx = 0; gx < p.gridCells; gx++) {
            int x0 = tileX + gx * p.gridStep;
            int x1 = (gx == p.gridCells - 1) ? (tileX + p.tileSize) : (x0 + p.gridStep);
            if (x1 > tileX + p.tileSize) x1 = tileX + p.tileSize;
            if (x0 < 0) x0 = 0;
            if (x1 > PANEL_RES_W) x1 = PANEL_RES_W;
            if (x0 >= x1 || y0 >= y1) continue;

            float dist = distLUT[gy][gx];
            float wave = PFMath::fastSin(dist * tileFreq * 2.0f + phase);

            uint8_t r, g, b;
            sampleColorRamp(wave * br, r, g, b);

            // setPixel and not the buffer: built as a module this header has
            // no buffer to write, only the canvas calls.
            for (int y = y0; y < y1; y++) {
              for (int x = x0; x < x1; x++) {
                PFCanvas::setPixel(x, y, r, g, b);
              }
            }
          }
        }
      }
    }

    PFCanvas::present();
  }
}