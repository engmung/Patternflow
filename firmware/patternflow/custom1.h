#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_tables.h"

namespace UntitledPattern {

const char* NAME = "Untitled pattern";
const char* const KNOB_LABELS[4] = {"Glitch", "Speed", "Freq", "Quantize"};

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},{43,0,255},
  {43,0,255},{43,0,255},{43,0,255},{43,0,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},
  {0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},
  {0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},
  {0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},
  {0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},
  {0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{0,157,255},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
};

static float glitch = 0.597f;
static float speed = 2.0f;
static float freq = 7.631555555555555f;
static float quantize = 10.0f;
static float timeAcc = 0.0f;

static const float UNTITLED_GLITCH_STEP = 0.05f;
static const float UNTITLED_SPEED_STEP = 0.1f;
static const float UNTITLED_FREQ_STEP = 0.05f;
static const float UNTITLED_QUANTIZE_STEP = 0.05f;

void setup() {
    PFMath::buildSinLUT();
    PFTables::init();
}

void update(float dt, const InputFrame& input) {
    if (input.knobDeltas[0] != 0) {
        glitch += input.knobDeltas[0] * UNTITLED_GLITCH_STEP;
        if (glitch < 0.0f) glitch = 0.0f;
        if (glitch > 2.0f) glitch = 2.0f;
    }
    if (input.knobDeltas[1] != 0) {
        speed += input.knobDeltas[1] * UNTITLED_SPEED_STEP;
        if (speed < 0.05f) speed = 0.05f;
        if (speed > 2.0f) speed = 2.0f;
    }
    if (input.knobDeltas[2] != 0) {
        freq += input.knobDeltas[2] * UNTITLED_FREQ_STEP;
        if (freq < 2.0f) freq = 2.0f;
        if (freq > 10.0f) freq = 10.0f;
    }
    if (input.knobDeltas[3] != 0) {
        quantize += input.knobDeltas[3] * UNTITLED_QUANTIZE_STEP;
        if (quantize < 2.0f) quantize = 2.0f;
        if (quantize > 10.0f) quantize = 10.0f;
    }

    timeAcc += dt * speed;
    if (timeAcc > TWO_PI) timeAcc -= TWO_PI;
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float t = timeAcc;

    const float halfW = w * 0.5f;
    const float halfH = h * 0.5f;
    const float invHalfW = 1.0f / halfW;
    const float invHalfH = 1.0f / halfH;

    const float freqParam = freq;
    const float glitchParam = glitch;
    const int steps = (int)quantize;
    const float stepsMinusOne = (float)(steps - 1);

    for (int y = 0; y < h; y++) {
        float rowShift = 0.0f;
        if (glitchParam > 0.02f) {
            float ny0 = y * 0.5f;
            float ny1 = y * 0.1f;
            float noise = PFMath::fastSin(ny0 + t * 10.0f) * PFMath::fastCos(ny1 - t * 4.0f);
            if (noise > 1.0f - glitchParam) {
                rowShift = PFMath::fastSin(t * 30.0f) * glitchParam * 30.0f;
            }
        }

        for (int x = 0; x < w; x++) {
            float nx = (x + rowShift - halfW) * invHalfW;
            float ny = (y - halfH) * invHalfH;
            float d = sqrtf(nx * nx + ny * ny);

            float waveValue = PFMath::fastSin(d * freqParam - t * 4.0f + PFMath::fastSin(nx * 4.0f + t) * glitchParam * 5.0f);
            float rawV = (waveValue + 1.0f) * 0.5f;

            float v = floorf(rawV * steps) / stepsMinusOne;
            if (v < 0.0f) v = 0.0f;
            if (v > 1.0f) v = 1.0f;

            int li = (int)(v * 255.0f + 0.5f);
            PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
        }
    }

    PFCanvas::present();
}

} // namespace UntitledPattern