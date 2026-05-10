#pragma once
#include <math.h>
#include "core_display.h"

namespace WaveSaw {
  const char* NAME = "Wave Saw";
  const char* KNOB_LABELS[4] = {"angle", "scale", "dist", "dscale"};

  // --- Wave / 매핑 상수 ---
  const float DETAIL_ROUGHNESS = 0.22f;
  const int   DETAIL_OCTAVES   = 2;
  const float PHASE_PER_SEC    = 2.4f;

  // 파라미터 한계값
  const float SCALE_MIN  = 0.5f,  SCALE_MAX  = 6.0f;
  const float DIST_MIN   = 0.0f,  DIST_MAX   = 4.0f;
  const float DSCALE_MIN = 0.3f,  DSCALE_MAX = 5.0f;

  // --- 상태 변수 ---
  float angle  = 0.0f;  // 0 ~ 2PI
  float scale  = 3.0f;
  float dist   = 0.0f;
  float dScale = 1.0f;
  float phase  = 0.0f;

  // --- Sin/Cos LUT ---
  const int SIN_LUT_SIZE = 512;
  float sinLUT[SIN_LUT_SIZE];

  void buildSinLUT() {
    for (int i = 0; i < SIN_LUT_SIZE; i++)
      sinLUT[i] = sinf((float)i / SIN_LUT_SIZE * 2.0f * PI);
  }
  
  inline float fastSin(float x) {
    float n = x * (1.0f / (2.0f * PI));
    n -= floorf(n);
    if (n < 0) n += 1.0f;
    return sinLUT[(int)(n * SIN_LUT_SIZE) & (SIN_LUT_SIZE - 1)];
  }
  inline float fastCos(float x) { return fastSin(x + PI * 0.5f); }

  // --- Perlin 2D (네임스페이스 안으로 격리) ---
  static const uint8_t perm[512] = {
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,
    226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,
    17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,
    155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,
    104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,
    235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,
    45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,
    215,61,156,180,
    // 256번 반복
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,
    226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,
    17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,
    155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,
    104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,
    235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,
    45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,
    215,61,156,180
  };

  inline float fade(float t) { return t*t*t*(t*(t*6.0f-15.0f)+10.0f); }
  inline float lerpF(float a, float b, float t) { return a + t*(b-a); }
  inline float grad2(int hash, float x, float y) {
    int h = hash & 7;
    float u = (h < 4) ? x : y;
    float v = (h < 4) ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0f*v : 2.0f*v);
  }

  float perlin2D(float x, float y) {
    int X = (int)floorf(x) & 255;
    int Y = (int)floorf(y) & 255;
    x -= floorf(x);
    y -= floorf(y);
    float u = fade(x), v = fade(y);
    int A = perm[X] + Y;
    int B = perm[X + 1] + Y;
    float n00 = grad2(perm[A],     x,        y);
    float n10 = grad2(perm[B],     x - 1.0f, y);
    float n01 = grad2(perm[A + 1], x,        y - 1.0f);
    float n11 = grad2(perm[B + 1], x - 1.0f, y - 1.0f);
    return lerpF(lerpF(n00, n10, u), lerpF(n01, n11, u), v);
  }

  float fractalNoise(float x, float y, int octaves, float roughness) {
    float sum = 0.0f, amp = 1.0f, maxAmp = 0.0f, freq = 1.0f;
    for (int i = 0; i < octaves; i++) {
      sum    += perlin2D(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp    *= roughness;
      freq   *= 2.0f;
    }
    return sum / maxAmp; 
  }

  // --- Color Ramp (Constant, 3단) ---
  inline void colorRampConstant(float t, uint8_t &r, uint8_t &g, uint8_t &b) {
    if      (t < 0.14f) { r = 255; g = 255; b = 255; }  // White
    else if (t < 0.40f) { r = 255; g = 0;   b = 0;   }  // Red
    else                { r = 0;   g = 0;   b = 255; }  // Blue
  }

  // --- 인터페이스 ---
  void setup() {
    buildSinLUT();
    angle = 0.0f;
    scale = 3.0f;
    dist = 0.0f;
    dScale = 1.0f;
    phase = 0.0f;
  }

  void update(float dt, const InputFrame& input) {
    // Enc1: Angle (방향)
    int d0 = input.knobDeltas[0];
    if (d0 != 0) {
      angle += d0 * 0.1f; // 회전 속도 조절 
      if (angle > PI * 2) angle -= PI * 2;
      if (angle < 0) angle += PI * 2;
    }
    if (input.btnPressed[0]) { angle = 0.0f; Serial.println("[WaveSaw] Angle -> 0"); }

    // Enc2: Scale (밀도)
    int d1 = input.knobDeltas[1];
    if (d1 != 0) {
      scale = constrain(scale + d1 * 0.2f, SCALE_MIN, SCALE_MAX);
    }
    if (input.btnPressed[1]) { scale = 3.0f; Serial.println("[WaveSaw] Scale -> 3.0"); }

    // Enc3: Distortion (왜곡 정도)
    int d2 = input.knobDeltas[2];
    if (d2 != 0) {
      dist = constrain(dist + d2 * 0.1f, DIST_MIN, DIST_MAX);
    }
    if (input.btnPressed[2]) { dist = 0.0f; Serial.println("[WaveSaw] Dist -> 0.0"); }

    // Enc4: Detail Scale (노이즈 디테일 크기)
    int d3 = input.knobDeltas[3];
    if (d3 != 0) {
      dScale = constrain(dScale + d3 * 0.2f, DSCALE_MIN, DSCALE_MAX);
    }
    if (input.btnPressed[3]) { dScale = 1.0f; Serial.println("[WaveSaw] DScale -> 1.0"); }

    // 애니메이션 페이즈 업데이트
    phase += dt * PHASE_PER_SEC;
  }

  void draw() {
    float cosA = fastCos(angle);
    float sinA = fastSin(angle);
    const float INV_TWO_PI = 1.0f / (2.0f * PI);

    // PANEL_RES_W, PANEL_RES_H는 config.h 기준
    for (int y = 0; y < PANEL_RES_H; y++) {
      // y: -0.5 ~ +0.5 (비율 보정)
      float v = (y - (PANEL_RES_H / 2.0f)) / (float)PANEL_RES_H;
      
      for (int x = 0; x < PANEL_RES_W; x++) {
        // x: -1 ~ +1
        float u = (x - (PANEL_RES_W / 2.0f)) / (float)(PANEL_RES_W / 2);

        // Vector Rotate (Z axis)
        float xr = u * cosA - v * sinA;
        float yr = u * sinA + v * cosA;

        // Wave Texture: Bands X
        float n = xr * scale * 20.0f + phase;

        // Distortion (노이즈 기반 왜곡)
        if (dist > 0.01f) {
          float nz = fractalNoise(xr * dScale, yr * dScale, DETAIL_OCTAVES, DETAIL_ROUGHNESS);
          n += dist * nz;
        }

        // Saw profile: n/(2π) - floor -> 0..1
        float t = n * INV_TWO_PI;
        t -= floorf(t);

        uint8_t r, g, b;
        colorRampConstant(t, r, g, b);
        dma_display->drawPixelRGB888(x, y, r, g, b);
      }
    }
  }
}