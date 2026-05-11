#pragma once
#include <math.h>
#include "core_display.h"

namespace Origin {
  const char* NAME = "Origin";
  const char* KNOB_LABELS[4] = {"hue", "speed", "mode", "freq"};

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

  // LUT & Color 상태
  const int SIN_LUT_SIZE = 256;
  float sinLUT[SIN_LUT_SIZE];

  struct ColorStop { float position; uint8_t r, g, b; };
  const int NUM_STOPS = 5;
  ColorStop colorRamp[NUM_STOPS];

  // 노브 변화량 추적을 위한 내부 변수
  float phase = 0.0f;

  // --- 내부 헬퍼 함수 ---
  void buildSinLUT() {
    for (int i = 0; i < SIN_LUT_SIZE; i++)
      sinLUT[i] = sinf((float)i / SIN_LUT_SIZE * 2.0f * PI);
  }

  inline float fastSin(float x) {
    float norm = x / (2.0f * PI);
    norm -= floorf(norm);
    if (norm < 0) norm += 1.0f;
    return sinLUT[(int)(norm * SIN_LUT_SIZE) & (SIN_LUT_SIZE - 1)];
  }

  void hsvToRgb(float h, float s, float v, uint8_t &r, uint8_t &g, uint8_t &b) {
    float c = v * s;
    float x = c * (1.0f - fabsf(fmodf(h * 6.0f, 2.0f) - 1.0f));
    float m = v - c;
    float rf, gf, bf;
    switch ((int)(h * 6.0f) % 6) {
      case 0: rf=c; gf=x; bf=0; break;
      case 1: rf=x; gf=c; bf=0; break;
      case 2: rf=0; gf=c; bf=x; break;
      case 3: rf=0; gf=x; bf=c; break;
      case 4: rf=x; gf=0; bf=c; break;
      default: rf=c; gf=0; bf=x; break;
    }
    r = (uint8_t)((rf + m) * 255.0f);
    g = (uint8_t)((gf + m) * 255.0f);
    b = (uint8_t)((bf + m) * 255.0f);
  }

  void updateColorRamp(float hue) {
    uint8_t hr, hg, hb;
    hsvToRgb(hue, 1.0f, 1.0f, hr, hg, hb);
    colorRamp[0] = {0.000f, 0, 0, 0};
    colorRamp[1] = {0.154f, 40, 40, 40};
    colorRamp[2] = {0.556f, hr, hg, hb};
    colorRamp[3] = {0.816f, 255, 255, 255};
    colorRamp[4] = {1.000f, 255, 255, 255};
  }

  void sampleColorRamp(float val, uint8_t &r, uint8_t &g, uint8_t &b) {
    float t = (val + 1.0f) * 0.5f;
    t = constrain(t, 0.0f, 1.0f);
    r = colorRamp[0].r; g = colorRamp[0].g; b = colorRamp[0].b;
    for (int i = 0; i < NUM_STOPS; i++) {
      if (t >= colorRamp[i].position) {
        r = colorRamp[i].r; g = colorRamp[i].g; b = colorRamp[i].b;
      }
    }
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
    buildSinLUT();
    applyPreset(0);
    updateColorRamp(0.0f);
    phase = 0.0f;
  }

  void update(float dt, const InputFrame& input) {
    // Enc1: Hue
    int d0 = input.knobDeltas[0];
    if (d0 != 0) {
      params.hueDeg = (params.hueDeg + (int)(d0 * 10)) % 360; 
      if (params.hueDeg < 0) params.hueDeg += 360;
    }
    if (input.btnPressed[0]) { params.hueDeg = 0; Serial.println("[Origin] Hue → 0°"); }

    // Enc2: Speed
    int d1 = input.knobDeltas[1];
    if (d1 != 0) {
      params.speed = constrain(params.speed + d1 * 0.1f, 0.0f, 5.0f);
    }
    if (input.btnPressed[1]) { params.speed = 0.0f; Serial.println("[Origin] Speed → 0"); }

    // Enc3: Mode
    int d2 = input.knobDeltas[2];
    if (d2 != 0) {
      params.mode = ((params.mode + (int)d2) % NUM_PRESETS + NUM_PRESETS) % NUM_PRESETS;
    }
    if (input.btnPressed[2]) { params.mode = 0; Serial.println("[Origin] Mode → 0"); }

    // Enc4: Freq
    int d3 = input.knobDeltas[3];
    if (d3 != 0) {
      params.freq = constrain(params.freq + (d3 * 10.0f), 0.1f, 1000.0f);
    }
    if (input.btnPressed[3]) { params.freq = 0.1f; Serial.println("[Origin] Freq → 0.1"); }

    // Apply Mode Change
    if (params.mode != curMode) {
      applyPreset(params.mode);
      Serial.printf("[Origin] Mode %d: %dx%d\n", params.mode, presets[params.mode].cols, presets[params.mode].rows);
    }

    phase += dt * params.speed * 2.0f;
    updateColorRamp(params.hueDeg / 360.0f);
  }

  void draw() {
    const PatternPreset &p = presets[curMode];
    float br = 80.0f / 100.0f;
    int cellW = p.tileSize + p.gap;
    int cellH = p.tileSize + p.gap;
    float curFreqBase = (float)params.freq;
    float curFreqVar  = (float)params.freq * 0.9f;

    for (int y = 0; y < PANEL_RES_H; y++) {
      for (int x = 0; x < PANEL_RES_W; x++) {
        int lx = x - offsetX;
        int ly = y - offsetY;
        int ti = (lx - p.gap) / cellW;
        int tj = (ly - p.gap) / cellH;

        if (ti < 0 || ti >= p.cols || tj < 0 || tj >= p.rows) {
          dma_display->drawPixelRGB888(x, y, 0, 0, 0);
          continue;
        }

        int localX = lx - (p.gap + ti * cellW);
        int localY = ly - (p.gap + tj * cellH);

        if (localX < 0 || localX >= p.tileSize || localY < 0 || localY >= p.tileSize) {
          dma_display->drawPixelRGB888(x, y, 0, 0, 0);
          continue;
        }

        int gx = localX / p.gridStep;
        int gy = localY / p.gridStep;
        if (gx >= p.gridCells) gx = p.gridCells - 1;
        if (gy >= p.gridCells) gy = p.gridCells - 1;

        float dist = distLUT[gy][gx];
        float tileFreq = curFreqBase + (tj * p.cols + ti) * curFreqVar * 0.15f;
        float wave = fastSin(dist * tileFreq * 2.0f + phase);

        uint8_t r, g, b;
        sampleColorRamp(wave * br, r, g, b);
        dma_display->drawPixelRGB888(x, y, r, g, b);
      }
    }
  }
}