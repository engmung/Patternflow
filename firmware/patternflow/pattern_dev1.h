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

namespace ElectricNebulaAuroraPattern {

const char* NAME = "Electric Nebula Aurora";
const char* const KNOB_LABELS[4] = {"Aurora Span", "Particle Speed", "Plasma Density", "Palette Interp"};

const float AURORA_SPAN_MIN = 0.0f;
const float AURORA_SPAN_MAX = 1.0f;
const float AURORA_SPAN_STEP = 0.05f;

const float AURORA_SPEED_MIN = 0.1f;
const float AURORA_SPEED_MAX = 10.0f;
const float AURORA_SPEED_STEP = 0.10f;

const float AURORA_DENSITY_MIN = 0.0f;
const float AURORA_DENSITY_MAX = 4.9f;
const float AURORA_DENSITY_STEP = 0.05f;

const float AURORA_PALETTE_MIN = 0.0f;
const float AURORA_PALETTE_MAX = 1.0f;
const float AURORA_PALETTE_STEP = 0.05f;

struct Params {
    float span;
    float speed;
    float density;
    float palette;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.span = 0.5f;
    params.speed = 1.0f;
    params.density = 0.5f;
    params.palette = 0.5f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.span += input.knobDeltas[0] * AURORA_SPAN_STEP;
    if (params.span > AURORA_SPAN_MAX) params.span -= (AURORA_SPAN_MAX - AURORA_SPAN_MIN);
    if (params.span < AURORA_SPAN_MIN) params.span += (AURORA_SPAN_MAX - AURORA_SPAN_MIN);

    params.speed = constrain(params.speed + input.knobDeltas[1] * AURORA_SPEED_STEP, AURORA_SPEED_MIN, AURORA_SPEED_MAX);
    params.density = constrain(params.density + input.knobDeltas[2] * AURORA_DENSITY_STEP, AURORA_DENSITY_MIN, AURORA_DENSITY_MAX);

    params.palette += input.knobDeltas[3] * AURORA_PALETTE_STEP;
    if (params.palette > AURORA_PALETTE_MAX) params.palette -= (AURORA_PALETTE_MAX - AURORA_PALETTE_MIN);
    if (params.palette < AURORA_PALETTE_MIN) params.palette += (AURORA_PALETTE_MAX - AURORA_PALETTE_MIN);

    params.timeAcc += dt * params.speed;
}

void draw() {
    float t = params.timeAcc;
    uint16_t w = PANEL_RES_W;
    uint16_t h = PANEL_RES_H;

    float xFreq = 0.02f + params.span * 0.06f;
    float dScale = 0.5f + params.density * 2.5f;

    float driftX_by_y[PANEL_RES_H];
    for (uint16_t y = 0; y < h; y++) {
        float ny = y * 0.05f;
        driftX_by_y[y] = PFMath::fastSin(ny + t * 0.3f) * dScale;
    }

    float driftY_by_x[PANEL_RES_W];
    for (uint16_t x = 0; x < w; x++) {
        float nx = x * xFreq;
        driftY_by_x[x] = PFMath::fastCos(nx - t * 0.5f) * dScale;
    }

    for (uint16_t y = 0; y < h; y++) {
        float ny = y * 0.05f;
        float driftX = driftX_by_y[y];

        for (uint16_t x = 0; x < w; x++) {
            float nx = x * xFreq;
            float driftY = driftY_by_x[x];

            float noiseField = PFMath::fastSin((nx + driftX) * 1.5f + t) * PFMath::fastCos((ny + driftY) * 1.2f - t);

            float intensity = 1.0f - fabsf(noiseField);
            intensity = constrain(intensity, 0.0f, 1.0f);

            float intensitySq = intensity * intensity;
            intensity = intensitySq * intensitySq;

            float val = intensity * 1.5f + (noiseField * 0.5f + 0.5f) * 0.2f;
            val = constrain(val, 0.0f, 1.0f);

            float baseHue = params.palette * 0.5f + (driftY * 0.05f);
            float hue = fmodf(baseHue + intensity * 0.15f, 1.0f);
            if (hue < 0.0f) hue += 1.0f;

            float sat = constrain(1.0f - intensity * 0.7f, 0.1f, 1.0f);
            float bright = constrain(val * 2.5f, 0.0f, 1.0f);

            uint8_t r, g, b;
            PFColor::hsvToRgb(hue, sat, bright, r, g, b);
            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace ElectricNebulaAuroraPattern
