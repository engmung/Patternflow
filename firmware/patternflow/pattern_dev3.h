#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace CrimsonTargetLockoutPattern {

const char* NAME = "Crimson Target Lockout";
const char* const KNOB_LABELS[4] = {"Radar Swath", "Sweep Speed", "Target Cell Block", "Thermal Mask"};

const float CRIMSON_SWATH_MIN = 0.0f;
const float CRIMSON_SWATH_MAX = 1.0f;
const float CRIMSON_SWATH_STEP = 0.05f;

const float CRIMSON_SWEEP_MIN = 0.1f;
const float CRIMSON_SWEEP_MAX = 10.0f;
const float CRIMSON_SWEEP_STEP = 0.10f;

const float CRIMSON_CELL_BLOCK_MIN = 0.0f;
const float CRIMSON_CELL_BLOCK_MAX = 4.9f;
const float CRIMSON_CELL_BLOCK_STEP = 0.05f;

const float CRIMSON_INTERF_MIN = 0.0f;
const float CRIMSON_INTERF_MAX = 1.0f;
const float CRIMSON_INTERF_STEP = 0.05f;

struct Params {
    float swath;
    float sweep;
    float cellBlock;
    float interf;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.swath = 0.5f;
    params.sweep = 2.0f;
    params.cellBlock = 2.5f;
    params.interf = 0.06f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.swath += input.knobDeltas[0] * CRIMSON_SWATH_STEP;
    if (params.swath > CRIMSON_SWATH_MAX) params.swath -= (CRIMSON_SWATH_MAX - CRIMSON_SWATH_MIN);
    if (params.swath < CRIMSON_SWATH_MIN) params.swath += (CRIMSON_SWATH_MAX - CRIMSON_SWATH_MIN);

    params.sweep = constrain(params.sweep + input.knobDeltas[1] * CRIMSON_SWEEP_STEP, CRIMSON_SWEEP_MIN, CRIMSON_SWEEP_MAX);
    params.cellBlock = constrain(params.cellBlock + input.knobDeltas[2] * CRIMSON_CELL_BLOCK_STEP, CRIMSON_CELL_BLOCK_MIN, CRIMSON_CELL_BLOCK_MAX);

    params.interf += input.knobDeltas[3] * CRIMSON_INTERF_STEP;
    if (params.interf > CRIMSON_INTERF_MAX) params.interf -= (CRIMSON_INTERF_MAX - CRIMSON_INTERF_MIN);
    if (params.interf < CRIMSON_INTERF_MIN) params.interf += (CRIMSON_INTERF_MAX - CRIMSON_INTERF_MIN);

    params.timeAcc += dt * params.sweep * 1.4f;
}

void draw() {
    uint16_t w = PANEL_RES_W;
    uint16_t h = PANEL_RES_H;
    float t = params.timeAcc;

    const float dotMatrix[16] = {
        0.9f, 0.2f, 0.7f, 0.4f,
        0.4f, 0.6f, 0.1f, 0.8f,
        0.7f, 0.1f, 0.8f, 0.3f,
        0.3f, 0.9f, 0.2f, 0.6f
    };

    int pSize = (int)(1.0f + params.cellBlock * 4.0f);
    if (pSize < 1) pSize = 1;

    int bitMask = (int)(params.interf * 31.0f);
    float pulseThresh = 0.6f - params.swath * 0.5f;
    float swathAmt = params.swath * 20.0f;
    float centerW = w * 0.5f;
    float centerH = h * 0.5f;

    float radarPulseY[PANEL_RES_H];
    int swathShiftY[PANEL_RES_H];
    for (uint16_t y = 0; y < h; y++) {
        radarPulseY[y] = PFMath::fastSin((y - t * 14.0f) * 0.1f) * PFMath::fastCos(y * 0.05f + t);
        swathShiftY[y] = 0;
        if (radarPulseY[y] > pulseThresh) {
            swathShiftY[y] = (int)(floorf(PFMath::fastSin(y * 0.4f + t * 4.0f) * swathAmt));
        }
    }

    for (uint16_t y = 0; y < h; y++) {
        int swathShift = swathShiftY[y];
        int sy = (y / pSize) * pSize;
        float cy = (float)sy - centerH;

        for (uint16_t x = 0; x < w; x++) {
            int shiftedX = (int)x + swathShift;
            int remX = shiftedX % (int)w;
            if (remX < 0) remX += w;
            int sx = (remX / pSize) * pSize;

            float radarSeed = PFMath::fastSin((float)(sx / 12) * 54.32f) * 0.5f + 0.5f;
            int echoDrop = ((sy / 4) - (int)(floorf(t * (0.6f + radarSeed * 0.4f)))) % 16;
            if (echoDrop < 0) echoDrop += 16;
            float radarMass = (echoDrop < 6) ? 1.0f : 0.0f;

            float bitField = (((sx / pSize) & (sy / pSize)) ^ bitMask) == 0 ? 0.55f : 0.0f;

            float totalSignal = radarMass * 0.5f + bitField;

            float cx = (float)sx - centerW;
            float targetCenterDist = PFMath::approxLength(cx, cy);
            totalSignal += PFMath::fastSin(targetCenterDist * 0.16f - t) * 0.25f;

            uint16_t mx = x % 4;
            uint16_t my = y % 4;
            float ditherThresh = dotMatrix[my * 4 + mx];

            uint8_t r = 0, g = 0, b = 0;

            if (radarMass > 0.0f && echoDrop == 0 && targetCenterDist > 14.0f && targetCenterDist < 24.0f) {
                r = 255; g = 0; b = 0;
            } else if (totalSignal > ditherThresh) {
                if (radarMass > 0.0f && echoDrop == 1 && targetCenterDist > 13.0f && targetCenterDist < 25.0f) {
                    r = 0; g = 0; b = 0;
                } else {
                    r = 255; g = 255; b = 255;
                }
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace CrimsonTargetLockoutPattern