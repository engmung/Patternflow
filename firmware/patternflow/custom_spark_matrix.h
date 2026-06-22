#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace SparkMatrixPattern {

const char* NAME = "Spark Matrix";
const char* const KNOB_LABELS[4] = {"Seed Density", "Speed", "Warp Depth", "Thermal Pick"};

const float SPARK_MATRIX_SEED_MIN = 0.0f;
const float SPARK_MATRIX_SEED_MAX = 1.0f;
const float SPARK_MATRIX_SEED_STEP = 0.05f;

const float SPARK_MATRIX_SPEED_MIN = 0.1f;
const float SPARK_MATRIX_SPEED_MAX = 10.0f;
const float SPARK_MATRIX_SPEED_STEP = 0.10f;

const float SPARK_MATRIX_WARP_MIN = 0.0f;
const float SPARK_MATRIX_WARP_MAX = 4.9f;
const float SPARK_MATRIX_WARP_STEP = 0.05f;

const float SPARK_MATRIX_THERMAL_MIN = 0.0f;
const float SPARK_MATRIX_THERMAL_MAX = 1.0f;
const float SPARK_MATRIX_THERMAL_STEP = 0.05f;

struct Params {
    float seedDensity;
    float speed;
    float warpDepth;
    float thermalGradient;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.seedDensity = 0.4f;
    params.speed = 2.5f;
    params.warpDepth = 2.0f;
    params.thermalGradient = 0.3f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.seedDensity += input.knobDeltas[0] * SPARK_MATRIX_SEED_STEP;
    if (params.seedDensity < SPARK_MATRIX_SEED_MIN) params.seedDensity += (SPARK_MATRIX_SEED_MAX - SPARK_MATRIX_SEED_MIN);
    if (params.seedDensity > SPARK_MATRIX_SEED_MAX) params.seedDensity -= (SPARK_MATRIX_SEED_MAX - SPARK_MATRIX_SEED_MIN);

    params.speed += input.knobDeltas[1] * SPARK_MATRIX_SPEED_STEP;
    params.speed = constrain(params.speed, SPARK_MATRIX_SPEED_MIN, SPARK_MATRIX_SPEED_MAX);

    params.warpDepth += input.knobDeltas[2] * SPARK_MATRIX_WARP_STEP;
    params.warpDepth = constrain(params.warpDepth, SPARK_MATRIX_WARP_MIN, SPARK_MATRIX_WARP_MAX);

    params.thermalGradient += input.knobDeltas[3] * SPARK_MATRIX_THERMAL_STEP;
    if (params.thermalGradient < SPARK_MATRIX_THERMAL_MIN) params.thermalGradient += (SPARK_MATRIX_THERMAL_MAX - SPARK_MATRIX_THERMAL_MIN);
    if (params.thermalGradient > SPARK_MATRIX_THERMAL_MAX) params.thermalGradient -= (SPARK_MATRIX_THERMAL_MAX - SPARK_MATRIX_THERMAL_MIN);

    params.timeAcc += dt * params.speed;
}

void draw() {
    const int blockSize = 4;
    const int cols = PANEL_RES_W / blockSize;
    const int rows = PANEL_RES_H / blockSize;
    const float t = params.timeAcc;
    const float warp = params.warpDepth;
    
    const float seedThreshold = 1.0f - (params.seedDensity * 0.7f);
    float seedDivisor = params.seedDensity * 0.7f;
    if (seedDivisor < 0.001f) seedDivisor = 0.001f;

    for (int gy = 0; gy < rows; gy++) {
        float warpX = PFMath::fastSin(gy * 0.4f + t) * warp;
        
        for (int gx = 0; gx < cols; gx++) {
            float warpY = PFMath::fastCos(gx * 0.4f - t * 0.7f) * warp;

            float hashArg = gx * 12.9898f + gy * 4.1414f;
            float sinHash = PFMath::fastSin(hashArg);
            float hashVal = sinHash * 43758.5453f;
            if (hashVal < 0.0f) hashVal = -hashVal;
            float cellHash = fmodf(hashVal, 1.0f);

            float lifeCycle = PFMath::fastSin(cellHash * 10.0f + t + (gx * warpX + gy * warpY) * 0.05f);
            float intensity = (lifeCycle + 1.0f) * 0.5f;

            for (int ly = 0; ly < blockSize; ly++) {
                int y = gy * blockSize + ly;
                if (y >= PANEL_RES_H) continue;

                for (int lx = 0; lx < blockSize; lx++) {
                    int x = gx * blockSize + lx;
                    if (x >= PANEL_RES_W) continue;

                    uint8_t r = 0;
                    uint8_t g = 0;
                    uint8_t b = 0;

                    if (intensity > seedThreshold) {
                        if (lx < blockSize - 1 && ly < blockSize - 1) {
                            float stage = (intensity - seedThreshold) / seedDivisor;
                            
                            if (stage > 0.8f) {
                                r = 255; g = 255; b = 255;
                            } else {
                                if (params.thermalGradient < 0.5f) {
                                    r = 255;
                                    g = (uint8_t)constrain(floorf(stage * 180.0f), 0.0f, 255.0f);
                                    b = (uint8_t)constrain(floorf((1.0f - stage) * 50.0f), 0.0f, 255.0f);
                                } else {
                                    r = (uint8_t)constrain(floorf((1.0f - stage) * 100.0f), 0.0f, 255.0f);
                                    g = (uint8_t)constrain(floorf(stage * 120.0f), 0.0f, 255.0f);
                                    b = 255;
                                }
                            }
                        }
                    } else if (intensity > 0.2f) {
                        if (lx == ly || lx == (blockSize - 1 - ly)) {
                            r = 30; g = 15; b = 45;
                        }
                    }

                    PFCanvas::setPixel(x, y, r, g, b);
                }
            }
        }
    }
    PFCanvas::present();
}

} // namespace SparkMatrixPattern