#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace SpectralCausticWebsPattern {

const char* NAME = "Spectral Caustics";
const char* const KNOB_LABELS[4] = {"DISPERSION", "KINETIC FREQ", "DENSITY", "GLOW SAT"};

const float SPECTRAL_CAUSTIC_K1_MIN = 0.0f;
const float SPECTRAL_CAUSTIC_K1_MAX = 1.0f;
const float SPECTRAL_CAUSTIC_K1_STEP = 0.05f;

const float SPECTRAL_CAUSTIC_K2_MIN = 0.1f;
const float SPECTRAL_CAUSTIC_K2_MAX = 10.0f;
const float SPECTRAL_CAUSTIC_K2_STEP = 0.10f;

const float SPECTRAL_CAUSTIC_K3_MIN = 0.0f;
const float SPECTRAL_CAUSTIC_K3_MAX = 4.9f;
const float SPECTRAL_CAUSTIC_K3_STEP = 0.05f;

const float SPECTRAL_CAUSTIC_K4_MIN = 0.0f;
const float SPECTRAL_CAUSTIC_K4_MAX = 1.0f;
const float SPECTRAL_CAUSTIC_K4_STEP = 0.05f;

struct Params {
  float disperse = 0.4f;
  float speed = 2.2f;
  float density = 0.5f;
  float glow = 0.7f;
  float timeAcc = 0.0f;
};

Params params;

void setup() {
  PFMath::buildSinLUT();
  params.disperse = 0.4f;
  params.speed = 2.2f;
  params.density = 0.5f;
  params.glow = 0.7f;
  params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
  // Knob 1: Wrap configuration
  params.disperse += input.knobDeltas[0] * SPECTRAL_CAUSTIC_K1_STEP;
  if (params.disperse < SPECTRAL_CAUSTIC_K1_MIN) params.disperse += (SPECTRAL_CAUSTIC_K1_MAX - SPECTRAL_CAUSTIC_K1_MIN);
  if (params.disperse > SPECTRAL_CAUSTIC_K1_MAX) params.disperse -= (SPECTRAL_CAUSTIC_K1_MAX - SPECTRAL_CAUSTIC_K1_MIN);

  // Knob 2: Clamp configuration
  params.speed = constrain(params.speed + input.knobDeltas[1] * SPECTRAL_CAUSTIC_K2_STEP, SPECTRAL_CAUSTIC_K2_MIN, SPECTRAL_CAUSTIC_K2_MAX);

  // Knob 3: Clamp configuration
  params.density = constrain(params.density + input.knobDeltas[2] * SPECTRAL_CAUSTIC_K3_STEP, SPECTRAL_CAUSTIC_K3_MIN, SPECTRAL_CAUSTIC_K3_MAX);

  // Knob 4: Wrap configuration
  params.glow += input.knobDeltas[3] * SPECTRAL_CAUSTIC_K4_STEP;
  if (params.glow < SPECTRAL_CAUSTIC_K4_MIN) params.glow += (SPECTRAL_CAUSTIC_K4_MAX - SPECTRAL_CAUSTIC_K4_MIN);
  if (params.glow > SPECTRAL_CAUSTIC_K4_MAX) params.glow -= (SPECTRAL_CAUSTIC_K4_MAX - SPECTRAL_CAUSTIC_K4_MIN);

  params.timeAcc += dt * params.speed;
}

void draw() {
  uint16_t w = PANEL_RES_W;
  uint16_t h = PANEL_RES_H;
  float t = params.timeAcc;

  float disp = params.disperse * 15.0f;
  float freq = 0.03f + params.density * 0.05f;
  float satGain = 1.2f + params.glow * 2.0f;
  // 2 iterations instead of JS reference's 3 — third iter contributes
  // a 0.6×0.6 = 0.36-attenuated detail layer that is visually marginal
  // on a 128×64 panel but costs another 9 trig ops per pixel.
  float iterInv = 0.5f;

  for (uint16_t y = 0; y < h; y++) {
    float y_float = (float)y;
    for (uint16_t x = 0; x < w; x++) {
      float x_float = (float)x;

      float rSum = 0.0f;
      float gSum = 0.0f;
      float bSum = 0.0f;

      // Red Channel: Top-Left offset distortion
      float rx = (x_float - disp) * freq;
      float ry = (y_float - disp) * freq;
      for (int i = 0; i < 2; i++) {
        float nX = rx + PFMath::fastCos(ry + t) * 3.5f;
        float nY = ry + PFMath::fastSin(rx - t) * 3.5f;
        rSum += 1.0f - fabsf(PFMath::fastSin(nX + nY));
        rx = nX * 0.6f;
        ry = nY * 0.6f;
      }

      // Green Channel: Standard position distortion
      float gx = x_float * freq;
      float gy = y_float * freq;
      for (int i = 0; i < 2; i++) {
        float nX = gx + PFMath::fastCos(gy + t + 0.5f) * 3.5f;
        float nY = gy + PFMath::fastSin(gx - t + 0.5f) * 3.5f;
        gSum += 1.0f - fabsf(PFMath::fastSin(nX + nY));
        gx = nX * 0.6f;
        gy = nY * 0.6f;
      }

      // Blue Channel: Bottom-Right offset distortion
      float bx = (x_float + disp) * freq;
      float by = (y_float + disp) * freq;
      for (int i = 0; i < 2; i++) {
        float nX = bx + PFMath::fastCos(by + t + 1.0f) * 3.5f;
        float nY = by + PFMath::fastSin(bx - t + 1.0f) * 3.5f;
        bSum += 1.0f - fabsf(PFMath::fastSin(nX + nY));
        bx = nX * 0.6f;
        by = nY * 0.6f;
      }

      float rRatio = rSum * iterInv;
      float gRatio = gSum * iterInv;
      float bRatio = bSum * iterInv;

      if (rRatio < 0.0f) rRatio = 0.0f;
      if (gRatio < 0.0f) gRatio = 0.0f;
      if (bRatio < 0.0f) bRatio = 0.0f;

      // Optimizing math.pow(v, 2.5) into v * v * sqrt(v) for ESP32 hardware FPU performance
      float rSig = (rRatio * rRatio * sqrtf(rRatio)) * satGain;
      float gSig = (gRatio * gRatio * sqrtf(gRatio)) * satGain;
      float bSig = (bRatio * bRatio * sqrtf(bRatio)) * satGain;

      int16_t r = (int16_t)(rSig * 255.0f + 40.0f);
      int16_t g = (int16_t)(gSig * 255.0f);
      int16_t b = (int16_t)(bSig * 255.0f + 80.0f);

      // White hot core alignment rule
      if (rSig > 0.5f && gSig > 0.5f && bSig > 0.5f) {
        r = 255;
        g = 255;
        b = 255;
      }

      uint8_t finalR = (uint8_t)constrain(r, 0, 255);
      uint8_t finalG = (uint8_t)constrain(g, 0, 255);
      uint8_t finalB = (uint8_t)constrain(b, 0, 255);

      PFCanvas::setPixel(x, y, finalR, finalG, finalB);
    }
  }

  PFCanvas::present();
}

} // namespace SpectralCausticWebsPattern