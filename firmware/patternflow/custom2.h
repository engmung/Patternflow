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

namespace FluidFlowPattern {

const char* NAME = "Fluid Flow";
const char* const KNOB_LABELS[4] = {"Color", "Speed", "Turb", "Density"};

// Knob ranges and steps
const float COLOR_SHIFT_MIN = 0.0f;
const float COLOR_SHIFT_MAX = 1.0f;
const float COLOR_SHIFT_STEP = 0.05f;

const float SPEED_MIN = 0.1f;
const float SPEED_MAX = 10.0f;
const float CUSTOM2_SPEED_STEP = 0.10f;

const float TURBULENCE_MIN = 0.0f;
const float TURBULENCE_MAX = 4.9f;
const float TURBULENCE_STEP = 0.05f;

const float DENSITY_MIN = 0.0f;
const float DENSITY_MAX = 1.0f;
const float DENSITY_STEP = 0.05f;

struct Params {
    float colorShift = 0.0f;
    float speed = 1.5f;
    float turbulence = 2.0f;
    float density = 0.5f;
    float timeAcc = 0.0f;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    // Initialize parameters to defaults
    params.colorShift = 0.0f;
    params.speed = 1.5f;
    params.turbulence = 2.0f;
    params.density = 0.5f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    // Knob 1: color shift (wrap)
    params.colorShift += input.knobDeltas[0] * COLOR_SHIFT_STEP;
    if (params.colorShift > COLOR_SHIFT_MAX) {
        params.colorShift -= (COLOR_SHIFT_MAX - COLOR_SHIFT_MIN);
    } else if (params.colorShift < COLOR_SHIFT_MIN) {
        params.colorShift += (COLOR_SHIFT_MAX - COLOR_SHIFT_MIN);
    }

    // Knob 2: speed (clamp)
    params.speed += input.knobDeltas[1] * CUSTOM2_SPEED_STEP;
    params.speed = constrain(params.speed, SPEED_MIN, SPEED_MAX);

    // Knob 3: turbulence (clamp)
    params.turbulence += input.knobDeltas[2] * TURBULENCE_STEP;
    params.turbulence = constrain(params.turbulence, TURBULENCE_MIN, TURBULENCE_MAX);

    // Knob 4: density (wrap)
    params.density += input.knobDeltas[3] * DENSITY_STEP;
    if (params.density > DENSITY_MAX) {
        params.density -= (DENSITY_MAX - DENSITY_MIN);
    } else if (params.density < DENSITY_MIN) {
        params.density += (DENSITY_MAX - DENSITY_MIN);
    }

    // Button presses reset to defaults
    if (input.btnPressed[0]) params.colorShift = 0.0f;
    if (input.btnPressed[1]) params.speed = 1.5f;
    if (input.btnPressed[2]) params.turbulence = 2.0f;
    if (input.btnPressed[3]) params.density = 0.5f;

    params.timeAcc += dt * params.speed;
}

void draw() {
    int w = PANEL_RES_W;
    int h = PANEL_RES_H;

    float t = params.timeAcc;
    float turb = params.turbulence * 0.3f + 0.5f;
    float density = params.density * 2.0f + 0.5f;
    float colorShift = params.colorShift;

    // Precompute row/column dependent terms
    float rowSinY[h];
    float baseY[h];
    float colCosX[w];
    float baseX[w];

    for (int y = 0; y < h; y++) {
        float ny = (float)y / h;
        rowSinY[y] = PFMath::fastSin(ny * 8.0f + t * 0.6f);
        baseY[y] = ny * 10.0f + t * 0.7f;
    }
    for (int x = 0; x < w; x++) {
        float nx = (float)x / w;
        colCosX[x] = PFMath::fastCos(nx * 6.0f + t * 0.5f);
        baseX[x] = nx * 12.0f + t * 0.8f;
    }

    for (int y = 0; y < h; y++) {
        float ny = (float)y / h;
        float dy = ny - 0.5f;
        for (int x = 0; x < w; x++) {
            float nx = (float)x / w;
            float dx = nx - 0.5f;

            float phase1 = PFMath::fastSin(baseX[x] + turb * rowSinY[y]);
            float phase2 = PFMath::fastCos(baseY[y] + turb * colCosX[x]);
            float flow = (phase1 + phase2) * 0.5f;

            float dist = PFMath::approxLength(dx, dy);
            float spiral = PFMath::fastSin(dist * 20.0f - t * 0.3f + turb * 0.5f);

            float value = (flow * 0.7f + spiral * 0.3f) * density;
            value = constrain(value, 0.0f, 1.0f);

            float hue = colorShift + value * 0.6f + dist * 0.3f + t * 0.02f;
            hue = hue - floorf(hue); // fractional part in [0,1)
            float sat = 0.6f + 0.4f * (1.0f - dist);
            float bright = 0.3f + 0.7f * (value * value);

            uint8_t r, g, b;
            PFColor::hsvToRgb(hue, sat, bright, r, g, b);

            if (value > 0.85f) {
                r = constrain(r + 50, 0, 255);
                g = constrain(g + 25, 0, 255);
                b = constrain(b + 15, 0, 255);
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace FluidFlowPattern