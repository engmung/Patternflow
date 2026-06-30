#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace ChromaticAberrationVortexPattern {

const char* NAME = "Chromatic Vortex";
const char* const KNOB_LABELS[4] = {"Split Dist", "Swirl Speed", "Wave Density", "Color Shift"};

const float CHROMATIC_VORTEX_SPLIT_MIN = 0.0f;
const float CHROMATIC_VORTEX_SPLIT_MAX = 1.0f;
const float CHROMATIC_VORTEX_SPLIT_STEP = 0.05f;

const float CHROMATIC_VORTEX_SPEED_MIN = 0.1f;
const float CHROMATIC_VORTEX_SPEED_MAX = 10.0f;
const float CHROMATIC_VORTEX_SPEED_STEP = 0.10f;

const float CHROMATIC_VORTEX_DENSITY_MIN = 0.0f;
const float CHROMATIC_VORTEX_DENSITY_MAX = 4.9f;
const float CHROMATIC_VORTEX_DENSITY_STEP = 0.05f;

const float CHROMATIC_VORTEX_COLOR_BIAS_MIN = 0.0f;
const float CHROMATIC_VORTEX_COLOR_BIAS_MAX = 1.0f;
const float CHROMATIC_VORTEX_COLOR_BIAS_STEP = 0.05f;

struct Params {
    float split;
    float speed;
    float density;
    float colorBias;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.split = 0.4f;
    params.speed = 1.5f;
    params.density = 2.0f;
    params.colorBias = 0.5f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.split += input.knobDeltas[0] * CHROMATIC_VORTEX_SPLIT_STEP;
    params.split = fmodf(params.split, 1.0f);
    if (params.split < 0.0f) params.split += 1.0f;

    params.speed += input.knobDeltas[1] * CHROMATIC_VORTEX_SPEED_STEP;
    params.speed = constrain(params.speed, CHROMATIC_VORTEX_SPEED_MIN, CHROMATIC_VORTEX_SPEED_MAX);

    params.density += input.knobDeltas[2] * CHROMATIC_VORTEX_DENSITY_STEP;
    params.density = constrain(params.density, CHROMATIC_VORTEX_DENSITY_MIN, CHROMATIC_VORTEX_DENSITY_MAX);

    params.colorBias += input.knobDeltas[3] * CHROMATIC_VORTEX_COLOR_BIAS_STEP;
    params.colorBias = fmodf(params.colorBias, 1.0f);
    if (params.colorBias < 0.0f) params.colorBias += 1.0f;

    params.timeAcc += dt * params.speed;
}

void draw() {
    int w = PANEL_RES_W;
    int h = PANEL_RES_H;
    float t = params.timeAcc;

    float cx = w / 2.0f;
    float cy = h / 2.0f;
    float maxShift = params.split * 8.0f;
    float densityCalc = params.density * 0.1f + 0.05f;

    for (int y = 0; y < h; y++) {
        float dy = (float)y - cy;
        for (int x = 0; x < w; x++) {
            float dx = (float)x - cx;

            // 완벽한 원형을 위해 실제 sqrtf 사용 (ESP32-S3 FPU 하드웨어 연산 활용)
            float dist = sqrtf(dx * dx + dy * dy);
            float angle = atan2f(dy, dx);

            float dist005 = dist * 0.05f;
            float shiftR = PFMath::fastSin(dist005 - t) * maxShift;
            float shiftG = PFMath::fastSin(dist005 - t + 1.0f) * maxShift * 0.5f;
            float shiftB = PFMath::fastSin(dist005 - t + 2.0f) * maxShift * -0.5f;

            // Red Channel Matrix
            float rDist = dist + shiftR;
            float rWave = PFMath::fastSin(rDist * densityCalc - t * 2.0f + angle);
            float rInt = rWave * 0.5f + 0.5f;
            if (rInt < 0.0f) rInt = 0.0f;

            // Green Channel Matrix
            float gDist = dist + shiftG;
            float gWave = PFMath::fastSin(gDist * densityCalc - t * 2.0f + angle + 1.0f);
            float gInt = gWave * 0.5f + 0.5f;
            if (gInt < 0.0f) gInt = 0.0f;

            // Blue Channel Matrix
            float bDist = dist + shiftB;
            float bWave = PFMath::fastSin(bDist * densityCalc - t * 2.0f + angle + 2.0f);
            float bInt = bWave * 0.5f + 0.5f;
            if (bInt < 0.0f) bInt = 0.0f;

            // Color Bias Processing
            float rFloat = rInt * 255.0f * (params.colorBias * 0.5f + 0.5f);
            float gFloat = gInt * 255.0f * (1.0f - params.colorBias * 0.3f);
            float bFloat = bInt * 255.0f * (0.3f + params.colorBias * 0.7f);

            uint8_t r = (uint8_t)constrain(floorf(rFloat), 0.0f, 255.0f);
            uint8_t g = (uint8_t)constrain(floorf(gFloat), 0.0f, 255.0f);
            uint8_t b = (uint8_t)constrain(floorf(bFloat), 0.0f, 255.0f);

            // White Overlap Peak Correction
            if (rInt > 0.85f && gInt > 0.85f && bInt > 0.85f) {
                r = 255;
                g = 255;
                b = 255;
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace ChromaticAberrationVortexPattern