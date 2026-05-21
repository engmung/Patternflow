#pragma once
#include <math.h>
#include "src/core_display.h"
#include "src/core_math.h"
#include "src/core_noise.h"
#include "src/core_canvas.h"

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

  // --- Color Ramp (Constant, 3단) ---
  inline void colorRampConstant(float t, uint8_t &r, uint8_t &g, uint8_t &b) {
    if      (t < 0.14f) { r = 255; g = 255; b = 255; }  // White
    else if (t < 0.40f) { r = 255; g = 0;   b = 0;   }  // Red
    else                { r = 0;   g = 0;   b = 255; }  // Blue
  }

  // --- 인터페이스 ---
  void setup() {
    PFMath::buildSinLUT();
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
    float cosA = PFMath::fastCos(angle);
    float sinA = PFMath::fastSin(angle);
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
          float nz = PFNoise::fractal2D(xr * dScale, yr * dScale, DETAIL_OCTAVES, DETAIL_ROUGHNESS);
          n += dist * nz;
        }

        // Saw profile: n/(2π) - floor -> 0..1
        float t = n * INV_TWO_PI;
        t -= floorf(t);

        uint8_t r, g, b;
        colorRampConstant(t, r, g, b);
        PFCanvas::setPixel(x, y, r, g, b);
      }
    }

    PFCanvas::present();
  }
}