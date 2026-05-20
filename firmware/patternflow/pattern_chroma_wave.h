// Generated with Claude using patternflow prompt

#pragma once
#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "core_display.h"
#include "core_encoders.h"

namespace ChromaWavePattern {

const char* NAME = "Chroma Wave";
const char* const KNOB_LABELS[4] = {"HUE SHIFT", "SPEED", "SPREAD", "PULSE"};

// Knob 1: hue raw range 0.0..1.0, wrap, step 0.05
// Knob 2: speed raw range 0.1..10.0, clamp, step 0.10
// Knob 3: spread raw range 0.0..4.9, clamp, step 0.05
// Knob 4: pulse raw range 0.0..1.0, wrap, step 0.05

const float CHROMA_WAVE_HUE_MIN    = 0.0f;
const float CHROMA_WAVE_HUE_MAX    = 1.0f;
const float CHROMA_WAVE_HUE_STEP   = 0.05f;

const float CHROMA_WAVE_SPEED_MIN  = 0.1f;
const float CHROMA_WAVE_SPEED_MAX  = 10.0f;
const float CHROMA_WAVE_SPEED_STEP = 0.10f;

const float CHROMA_WAVE_SPREAD_MIN  = 0.0f;
const float CHROMA_WAVE_SPREAD_MAX  = 4.9f;
const float CHROMA_WAVE_SPREAD_STEP = 0.05f;

const float CHROMA_WAVE_PULSE_MIN  = 0.0f;
const float CHROMA_WAVE_PULSE_MAX  = 1.0f;
const float CHROMA_WAVE_PULSE_STEP = 0.05f;

// Sine LUT
static const int CHROMA_WAVE_LUT_SIZE = 512;
static float sinLUT[CHROMA_WAVE_LUT_SIZE];

// Palette: 3 colors, 0-indexed as palette[0..2]
static const uint8_t PALETTE[3][3] = {
  {135, 78, 254},
  {254, 199,   0},
  {119, 187,  65}
};

// LED mask: values 1,2,3 map to palette indices 0,1,2
static const int CHROMA_WAVE_MASK_W = 32;
static const int CHROMA_WAVE_MASK_H = 16;

static const uint8_t LED_MASK[CHROMA_WAVE_MASK_H][CHROMA_WAVE_MASK_W] = {
  {1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,1,1,1,1,2,2,2,2,2,2,2,2},
  {1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,3,3,1,1,1,2,2,2,2,2,2,2,2},
  {1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,1,2,2,2,2,2,2,2,2},
  {1,1,1,1,1,1,1,3,3,3,3,3,2,2,2,2,2,3,3,3,3,3,3,1,1,1,1,1,2,2,2,2},
  {1,1,1,1,1,1,1,3,3,3,3,2,2,2,2,2,2,2,3,3,3,3,3,3,3,2,3,1,2,2,2,2},
  {1,1,1,1,1,1,3,3,3,3,3,2,2,2,2,2,2,2,2,3,3,3,3,3,2,2,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,2,2,2,2,1,1,2,2,2,3,3,3,3,3,2,2,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,2,2,2,2,2,2,2,2,2,3,3,3,3,3,2,2,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,2,2,2,2,2,2,2,2,2,3,3,3,3,3,2,2,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,3,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,3,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,2,2,2,2,2,1},
  {1,1,1,1,1,1,1,3,3,3,3,3,2,2,2,2,2,3,3,3,3,3,3,3,3,3,2,2,2,2,2,1},
  {1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,1},
  {1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,2,3,1}
};

inline float fastSin(float a) {
  a = fmodf(a, 6.28318530718f);
  if (a < 0.0f) a += 6.28318530718f;
  float idx = a * (CHROMA_WAVE_LUT_SIZE / 6.28318530718f);
  int i = (int)idx & (CHROMA_WAVE_LUT_SIZE - 1);
  return sinLUT[i];
}

inline float fastCos(float a) {
  return fastSin(a + 1.5707963268f);
}

struct Params {
  float time;
  float hueRaw;    // knob1 raw 0.0..1.0, wrap
  float speedRaw;  // knob2 raw 0.1..10.0, clamp
  float spreadRaw; // knob3 raw 0.0..4.9, clamp
  float pulseRaw;  // knob4 raw 0.0..1.0, wrap

  // Derived (computed in update)
  float hue;    // hueRaw * 360
  float speed;  // max(0.05, speedRaw)
  float spread; // 0.5 + spreadRaw * 0.75
  float pulse;  // 0.4 + pulseRaw * 1.8
};

Params params;

void setup() {
  for (int i = 0; i < CHROMA_WAVE_LUT_SIZE; i++) {
    sinLUT[i] = sinf(i * 6.28318530718f / CHROMA_WAVE_LUT_SIZE);
  }
  params.time      = 0.0f;
  params.hueRaw    = 0.5f;
  params.speedRaw  = 2.0f;
  params.spreadRaw = 1.0f;
  params.pulseRaw  = 0.6f;
  params.hue       = params.hueRaw * 360.0f;
  params.speed     = fmaxf(0.05f, params.speedRaw);
  params.spread    = 0.5f + params.spreadRaw * 0.75f;
  params.pulse     = 0.4f + params.pulseRaw  * 1.8f;
}

void update(float dt, const InputFrame& input) {
  // Knob 1: hue, wrap 0..1
  params.hueRaw += input.knobDeltas[0] * CHROMA_WAVE_HUE_STEP;
  params.hueRaw  = fmodf(params.hueRaw, CHROMA_WAVE_HUE_MAX);
  if (params.hueRaw < CHROMA_WAVE_HUE_MIN) params.hueRaw += CHROMA_WAVE_HUE_MAX;

  // Knob 2: speed, clamp 0.1..10.0
  params.speedRaw = constrain(
    params.speedRaw + input.knobDeltas[1] * CHROMA_WAVE_SPEED_STEP,
    CHROMA_WAVE_SPEED_MIN, CHROMA_WAVE_SPEED_MAX);

  // Knob 3: spread, clamp 0.0..4.9
  params.spreadRaw = constrain(
    params.spreadRaw + input.knobDeltas[2] * CHROMA_WAVE_SPREAD_STEP,
    CHROMA_WAVE_SPREAD_MIN, CHROMA_WAVE_SPREAD_MAX);

  // Knob 4: pulse, wrap 0..1
  params.pulseRaw += input.knobDeltas[3] * CHROMA_WAVE_PULSE_STEP;
  params.pulseRaw  = fmodf(params.pulseRaw, CHROMA_WAVE_PULSE_MAX);
  if (params.pulseRaw < CHROMA_WAVE_PULSE_MIN) params.pulseRaw += CHROMA_WAVE_PULSE_MAX;

  // Derive display params
  params.hue    = params.hueRaw * 360.0f;
  params.speed  = fmaxf(0.05f, params.speedRaw);
  params.spread = 0.5f + params.spreadRaw * 0.75f;
  params.pulse  = 0.4f + params.pulseRaw  * 1.8f;

  params.time += dt * params.speed;
}

void draw() {
  const float hueBase = params.hue * 0.017f;
  const float t       = params.time;
  const float t15     = t * 1.5f;
  const float spread  = params.spread;
  const float pulse   = params.pulse;

  const int scaleX = PANEL_RES_W / CHROMA_WAVE_MASK_W;
  const int scaleY = PANEL_RES_H / CHROMA_WAVE_MASK_H;
  const int scale = max(1, min(scaleX, scaleY));
  const int drawW = CHROMA_WAVE_MASK_W * scale;
  const int drawH = CHROMA_WAVE_MASK_H * scale;
  const int offsetX = max(0, (PANEL_RES_W - drawW) / 2);
  const int offsetY = max(0, (PANEL_RES_H - drawH) / 2);

  for (int y = 0; y < CHROMA_WAVE_MASK_H; y++) {
    float yTerm = y * 0.035f;
    for (int x = 0; x < CHROMA_WAVE_MASK_W; x++) {
      uint8_t maskVal = LED_MASK[y][x];

      // Palette color for this cell (maskVal 1,2,3 -> index 0,1,2)
      int pIdx = constrain((int)maskVal - 1, 0, 2);
      float pr = maskVal == 0 ? 0.0f : PALETTE[pIdx][0] / 255.0f;
      float pg = maskVal == 0 ? 0.0f : PALETTE[pIdx][1] / 255.0f;
      float pb = maskVal == 0 ? 0.0f : PALETTE[pIdx][2] / 255.0f;

      // Wave animation
      float h    = hueBase + x * 0.045f * spread + yTerm + t;
      float wave = fastSin(h * 2.0f + t15) * 0.5f + 0.5f;
      float bright = 0.35f + wave * 0.65f * pulse;
      // Lift to use full LED range
      bright = constrain(0.08f + bright * 1.15f, 0.0f, 1.0f);

      // Tint palette color with hue-cycle sine, blended toward palette
      float sinH  = fastSin(h) * 0.5f + 0.5f;
      float sinH1 = fastSin(h + 2.1f) * 0.5f + 0.5f;
      float sinH2 = fastSin(h + 4.2f) * 0.5f + 0.5f;

      // Blend: 50% palette identity, 50% JS hue-sine tint
      float fr = (pr * 0.5f + sinH  * 0.5f) * bright;
      float fg = (pg * 0.5f + sinH1 * 0.5f) * bright;
      float fb = (pb * 0.5f + sinH2 * 0.5f) * bright;

      uint8_t r = (uint8_t)(constrain(fr, 0.0f, 1.0f) * 255.0f);
      uint8_t g = (uint8_t)(constrain(fg, 0.0f, 1.0f) * 255.0f);
      uint8_t b = (uint8_t)(constrain(fb, 0.0f, 1.0f) * 255.0f);

      const int px = offsetX + x * scale;
      const int py = offsetY + y * scale;
      for (int sy = 0; sy < scale; sy++) {
        for (int sx = 0; sx < scale; sx++) {
          dma_display->drawPixelRGB888(px + sx, py + sy, r, g, b);
        }
      }
    }
  }
}

} // namespace ChromaWavePattern
