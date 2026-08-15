#pragma once

// ===== Patternflow pattern =====
// Title:   260707
// Author:  Seunghun LEE
// Date:    2026-07-07
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_params.h"

namespace UntitledPattern {

const char* NAME = "Untitled pattern";
const char* const KNOB_LABELS[4] = {"Glitch", "Speed", "Freq", "Quantize"};
constexpr bool ABSOLUTE_READY = true;

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
}

void update(float dt, const InputFrame& input) {
    PFParams::apply(input, 0, &glitch, 0.0f, 2.0f, UNTITLED_GLITCH_STEP);
    PFParams::apply(input, 1, &speed, 0.05f, 2.0f, UNTITLED_SPEED_STEP);
    PFParams::apply(input, 2, &freq, 2.0f, 10.0f, UNTITLED_FREQ_STEP);
    PFParams::apply(input, 3, &quantize, 2.0f, 10.0f, UNTITLED_QUANTIZE_STEP);

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

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
