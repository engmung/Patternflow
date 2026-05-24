#pragma once
#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_color.h"

namespace LiquidRipplePattern {

const char* NAME = "Liquid Ripple";
const char* const KNOB_LABELS[4] = {"WARP DEPTH", "RIPPLE SPEED", "WAVE COUNT", "SPECULAR ANG"};

const float LIQUID_RIPPLE_WARP_MIN = 0.0f;
const float LIQUID_RIPPLE_WARP_MAX = 1.0f;
const float LIQUID_RIPPLE_WARP_STEP = 0.05f;

const float LIQUID_RIPPLE_SPEED_MIN = 0.1f;
const float LIQUID_RIPPLE_SPEED_MAX = 10.0f;
const float LIQUID_RIPPLE_SPEED_STEP = 0.10f;

const float LIQUID_RIPPLE_WAVES_MIN = 0.0f;
const float LIQUID_RIPPLE_WAVES_MAX = 4.9f;
const float LIQUID_RIPPLE_WAVES_STEP = 0.05f;

const float LIQUID_RIPPLE_SPECULAR_MIN = 0.0f;
const float LIQUID_RIPPLE_SPECULAR_MAX = 1.0f;
const float LIQUID_RIPPLE_SPECULAR_STEP = 0.05f;

struct Params {
    float warp;
    float speed;
    float waves;
    float specular;
    float timeAcc;
};

Params params;

// Fast coordinate look-up cache to minimize inner loop division operations
float nx_cached[PANEL_RES_W];
float ny_cached[PANEL_RES_H];

void setup() {
    PFMath::buildSinLUT();

    params.warp = 0.4f;
    params.speed = 2.0f;
    params.waves = 2.5f;
    params.specular = 0.2f;
    params.timeAcc = 0.0f;

    // Precompute invariant rendering aspect ratios and grids
    float aspect = (float)PANEL_RES_W / (float)PANEL_RES_H;
    for (int x = 0; x < PANEL_RES_W; x++) {
        nx_cached[x] = (((float)x / (float)PANEL_RES_W) * 2.0f - 1.0f) * aspect;
    }
    for (int y = 0; y < PANEL_RES_H; y++) {
        ny_cached[y] = ((float)y / (float)PANEL_RES_H) * 2.0f - 1.0f;
    }
}

void update(float dt, const InputFrame& input) {
    // Process rotational encoder steps and apply parameter constraints
    params.warp += input.knobDeltas[0] * LIQUID_RIPPLE_WARP_STEP;
    if (params.warp < LIQUID_RIPPLE_WARP_MIN) params.warp += 1.0f;
    if (params.warp > LIQUID_RIPPLE_WARP_MAX) params.warp -= 1.0f;

    params.speed = constrain(params.speed + input.knobDeltas[1] * LIQUID_RIPPLE_SPEED_STEP, LIQUID_RIPPLE_SPEED_MIN, LIQUID_RIPPLE_SPEED_MAX);
    params.waves = constrain(params.waves + input.knobDeltas[2] * LIQUID_RIPPLE_WAVES_STEP, LIQUID_RIPPLE_WAVES_MIN, LIQUID_RIPPLE_WAVES_MAX);

    params.specular += input.knobDeltas[3] * LIQUID_RIPPLE_SPECULAR_STEP;
    if (params.specular < LIQUID_RIPPLE_SPECULAR_MIN) params.specular += 1.0f;
    if (params.specular > LIQUID_RIPPLE_SPECULAR_MAX) params.specular -= 1.0f;

    params.timeAcc += dt * params.speed * 1.5f;
}

void draw() {
    float t = params.timeAcc;
    float waveFreq = 4.0f + params.waves * 4.0f;
    float warpFactor = params.warp * 0.3f;

    // Precompute temporal trigonometric terms outside the nested loop matrices
    float specAngleRad = params.specular * 2.0f * M_PI;
    float specCos = PFMath::fastCos(specAngleRad);
    float specSin = PFMath::fastSin(specAngleRad);
    float d1_x_offset = 0.3f * PFMath::fastSin(t * 0.4f);

    for (int y = 0; y < PANEL_RES_H; y++) {
        float ny = ny_cached[y];
        float dy2 = ny - 0.2f;

        for (int x = 0; x < PANEL_RES_W; x++) {
            float nx = nx_cached[x];

            // Real sqrt here — ripple isodistance lines are the visual signal,
            // and approxLength's octagonal contour shows up as polygonal rings.
            // ESP32-S3 FPU sqrtf is cheap enough for 2 calls per pixel.
            float dx1 = nx - d1_x_offset;
            float d1 = sqrtf(dx1 * dx1 + ny * ny);

            float dx2 = nx + 0.4f;
            float d2 = sqrtf(dx2 * dx2 + dy2 * dy2);

            float rippleField = PFMath::fastSin(d1 * waveFreq - t) * 0.6f + PFMath::fastSin(d2 * (waveFreq * 0.7f) - t * 1.3f) * 0.4f;

            // Apply spatial lensing transformations
            float wx = nx + rippleField * warpFactor;
            float wy = ny + rippleField * warpFactor;

            float liquidBase = PFMath::fastSin(wx * 3.0f + t * 0.5f) * PFMath::fastCos(wy * 3.0f - t * 0.4f);
            float nLiquid = (liquidBase + 1.0f) * 0.5f;

            // Map orientation reflections 
            float specularAngle = (wx * specCos + wy * specSin);
            float specTrigger = PFMath::fastSin(specularAngle * 8.0f + rippleField * 4.0f);

            float hue = 0.5f + nLiquid * 0.25f + rippleField * 0.1f;
            float sat = 0.95f - (specTrigger > 0.0f ? specTrigger * 0.3f : 0.0f);
            float val = 0.2f + nLiquid * 0.6f + (rippleField > 0.0f ? rippleField * 0.2f : 0.0f);

            // Apply balanced boost modifier to output values
            val = constrain(0.05f + val * 1.15f, 0.0f, 1.0f);

            uint8_t r, g, b;
            PFColor::hsvToRgb(hue, sat, val, r, g, b);

            // Overlay specular glistening highlights over ridges
            if (specTrigger > 0.88f && rippleField > 0.2f) {
                r = constrain(r + 180, 0, 255);
                g = constrain(g + 180, 0, 255);
                b = 255;
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace LiquidRipplePattern