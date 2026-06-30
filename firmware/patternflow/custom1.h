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

namespace VectorFieldParticleFlowPattern {

const char* NAME = "Vector Field Flow";
const char* const KNOB_LABELS[4] = {"Turbulence", "Velocity", "Density", "Palette"};

const float VECTOR_FIELD_TURB_MIN = 0.0f;
const float VECTOR_FIELD_TURB_MAX = 1.0f;
const float VECTOR_FIELD_TURB_STEP = 0.05f;

const float VECTOR_FIELD_SPEED_MIN = 0.1f;
const float VECTOR_FIELD_SPEED_MAX = 10.0f;
const float VECTOR_FIELD_SPEED_STEP = 0.10f;

const float VECTOR_FIELD_DENSITY_MIN = 0.0f;
const float VECTOR_FIELD_DENSITY_MAX = 4.9f;
const float VECTOR_FIELD_DENSITY_STEP = 0.05f;

const float VECTOR_FIELD_PALETTE_MIN = 0.0f;
const float VECTOR_FIELD_PALETTE_MAX = 1.0f;
const float VECTOR_FIELD_PALETTE_STEP = 0.05f;

struct Params {
    float turbulence;
    float speed;
    float density;
    float palette;
    float timeAcc;
};

Params params;

float norm_x[PANEL_RES_W];
float norm_y[PANEL_RES_H];

void setup() {
    PFMath::buildSinLUT();

    params.turbulence = 0.5f;
    params.speed = 2.0f;
    params.density = 2.5f;
    params.palette = 0.1f;
    params.timeAcc = 0.0f;

    for (int x = 0; x < PANEL_RES_W; x++) {
        norm_x[x] = (float)x / PANEL_RES_W - 0.5f;
    }
    for (int y = 0; y < PANEL_RES_H; y++) {
        norm_y[y] = (float)y / PANEL_RES_H - 0.5f;
    }
}

void update(float dt, const InputFrame& input) {
    // Knob 1: Turbulence (Wrap)
    params.turbulence += input.knobDeltas[0] * VECTOR_FIELD_TURB_STEP;
    while (params.turbulence < VECTOR_FIELD_TURB_MIN) params.turbulence += (VECTOR_FIELD_TURB_MAX - VECTOR_FIELD_TURB_MIN);
    while (params.turbulence > VECTOR_FIELD_TURB_MAX) params.turbulence -= (VECTOR_FIELD_TURB_MAX - VECTOR_FIELD_TURB_MIN);

    // Knob 2: Speed (Clamp)
    params.speed += input.knobDeltas[1] * VECTOR_FIELD_SPEED_STEP;
    params.speed = constrain(params.speed, VECTOR_FIELD_SPEED_MIN, VECTOR_FIELD_SPEED_MAX);

    // Knob 3: Density (Clamp)
    params.density += input.knobDeltas[2] * VECTOR_FIELD_DENSITY_STEP;
    params.density = constrain(params.density, VECTOR_FIELD_DENSITY_MIN, VECTOR_FIELD_DENSITY_MAX);

    // Knob 4: Palette (Wrap)
    params.palette += input.knobDeltas[3] * VECTOR_FIELD_PALETTE_STEP;
    while (params.palette < VECTOR_FIELD_PALETTE_MIN) params.palette += (VECTOR_FIELD_PALETTE_MAX - VECTOR_FIELD_PALETTE_MIN);
    while (params.palette > VECTOR_FIELD_PALETTE_MAX) params.palette -= (VECTOR_FIELD_PALETTE_MAX - VECTOR_FIELD_PALETTE_MIN);

    params.timeAcc += dt * params.speed;
}

void draw() {
    float density_4 = params.density * 4.0f;
    float t = params.timeAcc;

    float cos_ny_term[PANEL_RES_H];
    for (int y = 0; y < PANEL_RES_H; y++) {
        cos_ny_term[y] = PFMath::fastCos(norm_y[y] * density_4 - t);
    }

    float sin_nx_term[PANEL_RES_W];
    for (int x = 0; x < PANEL_RES_W; x++) {
        sin_nx_term[x] = PFMath::fastSin(norm_x[x] * density_4 + t);
    }

    for (int y = 0; y < PANEL_RES_H; y++) {
        float cy = cos_ny_term[y];
        float ny = norm_y[y];

        for (int x = 0; x < PANEL_RES_W; x++) {
            float nx = norm_x[x];
            float angle = sin_nx_term[x] + cy;

            float turb_5 = angle * params.turbulence * 5.0f;
            float forceX = PFMath::fastSin(turb_5);
            float forceY = PFMath::fastCos(turb_5);

            float value = PFMath::fastSin((nx * forceX + ny * forceY) * 10.0f + t * 2.0f);
            float intensity = value * 0.5f + 0.5f;
            if (intensity < 0.0f) intensity = 0.0f;

            uint8_t r = 0, g = 0, b = 0;
            if (intensity > 0.1f) {
                float adjusted_intensity = constrain(0.05f + intensity * 1.1f, 0.0f, 1.0f);
                float hue = params.palette + (angle * 0.159154943f) + (forceX * 0.2f);

                hue = fmodf(hue, 1.0f);
                if (hue < 0.0f) hue += 1.0f;

                PFColor::hsvToRgb(hue, 0.85f, adjusted_intensity, r, g, b);

                if (adjusted_intensity > 0.88f) {
                    r = 255;
                    g = 255;
                    b = 255;
                }
            }
            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace VectorFieldParticleFlowPattern