#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace AsymmetricBitwiseGlitchCascadePattern {

const char* NAME = "Glitch Cascade";
const char* const KNOB_LABELS[4] = {"Tear Severity", "Cascade Velocity", "Pixel Block Size", "Bitwise Threshold"};

const float GLITCH_TEAR_MIN = 0.0f;
const float GLITCH_TEAR_MAX = 1.0f;
const float GLITCH_TEAR_STEP = 0.05f;

const float GLITCH_VELOCITY_MIN = 0.1f;
const float GLITCH_VELOCITY_MAX = 10.0f;
const float GLITCH_VELOCITY_STEP = 0.10f;

const float GLITCH_BLOCK_SIZE_MIN = 0.0f;
const float GLITCH_BLOCK_SIZE_MAX = 4.9f;
const float GLITCH_BLOCK_SIZE_STEP = 0.05f;

const float GLITCH_BIT_THRESH_MIN = 0.0f;
const float GLITCH_BIT_THRESH_MAX = 1.0f;
const float GLITCH_BIT_THRESH_STEP = 0.05f;

struct Params {
    float tear;
    float velocity;
    float blockSize;
    float bitThresh;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.tear = 0.5f;
    params.velocity = 2.0f;
    params.blockSize = 2.5f;
    params.bitThresh = 0.06f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.tear += input.knobDeltas[0] * GLITCH_TEAR_STEP;
    if (params.tear > GLITCH_TEAR_MAX) params.tear -= (GLITCH_TEAR_MAX - GLITCH_TEAR_MIN);
    if (params.tear < GLITCH_TEAR_MIN) params.tear += (GLITCH_TEAR_MAX - GLITCH_TEAR_MIN);

    params.velocity = constrain(params.velocity + input.knobDeltas[1] * GLITCH_VELOCITY_STEP, GLITCH_VELOCITY_MIN, GLITCH_VELOCITY_MAX);
    params.blockSize = constrain(params.blockSize + input.knobDeltas[2] * GLITCH_BLOCK_SIZE_STEP, GLITCH_BLOCK_SIZE_MIN, GLITCH_BLOCK_SIZE_MAX);

    params.bitThresh += input.knobDeltas[3] * GLITCH_BIT_THRESH_STEP;
    if (params.bitThresh > GLITCH_BIT_THRESH_MAX) params.bitThresh -= (GLITCH_BIT_THRESH_MAX - GLITCH_BIT_THRESH_MIN);
    if (params.bitThresh < GLITCH_BIT_THRESH_MIN) params.bitThresh += (GLITCH_BIT_THRESH_MAX - GLITCH_BIT_THRESH_MIN);

    params.timeAcc += dt * params.velocity * 3.0f;
}

void draw() {
    uint16_t w = PANEL_RES_W;
    uint16_t h = PANEL_RES_H;
    float t = params.timeAcc;

    const uint8_t ditherPattern[16] = {0, 12, 3, 15, 8, 4, 11, 7, 2, 14, 1, 13, 10, 6, 9, 5};
    int pSize = (int)(1.0f + params.blockSize * 4.0f);
    if (pSize < 1) pSize = 1;

    int maskVal = (int)(params.bitThresh * 31.0f);
    float tearThreshold = 0.9f - params.tear * 0.7f;
    float tearMultiplier = params.tear * 15.0f;

    float centerW = w * 0.5f;
    float centerH = h * 0.5f;

    for (uint16_t y = 0; y < h; y++) {
        float faultLine = PFMath::fastSin(y * 0.08f + t * 0.4f) * PFMath::fastCos(y * 0.03f);
        int hShift = 0;
        if (faultLine > tearThreshold) {
            float tanVal = tanf(y * 0.05f + t);
            if (tanVal > 100.0f) tanVal = 100.0f;
            else if (tanVal < -100.0f) tanVal = -100.0f;
            hShift = (int)(floorf(tanVal * tearMultiplier));
        }

        int sy = (y / pSize) * pSize;

        for (uint16_t x = 0; x < w; x++) {
            int shiftedX = (int)x + hShift;
            int rem = shiftedX % (int)w;
            if (rem < 0) rem += w;
            int sx = (rem / pSize) * pSize;

            float streamSeed = PFMath::fastSin((float)(sx / 8) * 54.12f) * 0.5f + 0.5f;
            int drop = ((sy / 4) - (int)(floorf(t * (0.6f + streamSeed * 0.4f)))) % 16;
            if (drop < 0) drop += 16;
            float rainMass = (drop < 6) ? 1.0f : 0.0f;

            float bitField = (((sx / pSize) ^ (sy / pSize)) & maskVal) == 0 ? 0.5f : 0.0f;

            float totalSignal = rainMass * 0.6f + bitField;

            float cx = (float)sx - centerW;
            float cy = (float)sy - centerH;
            float bgWave = PFMath::fastSin(PFMath::approxLength(cx, cy) * 0.15f - t) * 0.25f;
            totalSignal += bgWave;

            uint16_t mx = x % 4;
            uint16_t my = y % 4;
            float thresh = ditherPattern[my * 4 + mx] / 16.0f;

            uint8_t r = 0, g = 0, b = 0;
            if (totalSignal > thresh) {
                if (rainMass > 0.0f && drop == 0) {
                    r = 255; g = 0; b = 150;
                } else {
                    r = 255; g = 255; b = 255;
                }
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace AsymmetricBitwiseGlitchCascadePattern