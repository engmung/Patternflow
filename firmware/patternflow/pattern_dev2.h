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

namespace LayeredVorticityFieldPattern {

const float LAYERED_VORTICITY_FIELD_RADIUS_MIN = 0.0f;
const float LAYERED_VORTICITY_FIELD_RADIUS_MAX = 1.0f;
const float LAYERED_VORTICITY_FIELD_RADIUS_STEP = 0.05f;

const float LAYERED_VORTICITY_FIELD_SPEED_MIN = 0.1f;
const float LAYERED_VORTICITY_FIELD_SPEED_MAX = 10.0f;
const float LAYERED_VORTICITY_FIELD_SPEED_STEP = 0.10f;

const float LAYERED_VORTICITY_FIELD_VORTICES_MIN = 0.0f;
const float LAYERED_VORTICITY_FIELD_VORTICES_MAX = 4.9f;
const float LAYERED_VORTICITY_FIELD_VORTICES_STEP = 0.05f;

const float LAYERED_VORTICITY_FIELD_SPREAD_MIN = 0.0f;
const float LAYERED_VORTICITY_FIELD_SPREAD_MAX = 1.0f;
const float LAYERED_VORTICITY_FIELD_SPREAD_STEP = 0.05f;

const char* NAME = "Layered Vorticity Field";
const char* const KNOB_LABELS[4] = {"Swirl Radius", "Flow Speed", "Vortex Count", "Color Phase Spread"};

struct Params {
    float radius;
    float speed;
    float vortices;
    float colorSpread;
    float timeAcc;
};

Params params;

void setup() {
    params.radius = 0.5f;
    params.speed = 1.0f;
    params.vortices = 2.0f;
    params.colorSpread = 0.5f;
    params.timeAcc = 0.0f;
    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    params.radius += input.knobDeltas[0] * LAYERED_VORTICITY_FIELD_RADIUS_STEP;
    while (params.radius < LAYERED_VORTICITY_FIELD_RADIUS_MIN) params.radius += 1.0f;
    while (params.radius > LAYERED_VORTICITY_FIELD_RADIUS_MAX) params.radius -= 1.0f;

    params.speed = constrain(params.speed + input.knobDeltas[1] * LAYERED_VORTICITY_FIELD_SPEED_STEP, LAYERED_VORTICITY_FIELD_SPEED_MIN, LAYERED_VORTICITY_FIELD_SPEED_MAX);

    params.vortices = constrain(params.vortices + input.knobDeltas[2] * LAYERED_VORTICITY_FIELD_VORTICES_STEP, LAYERED_VORTICITY_FIELD_VORTICES_MIN, LAYERED_VORTICITY_FIELD_VORTICES_MAX);

    params.colorSpread += input.knobDeltas[3] * LAYERED_VORTICITY_FIELD_SPREAD_STEP;
    while (params.colorSpread < LAYERED_VORTICITY_FIELD_SPREAD_MIN) params.colorSpread += 1.0f;
    while (params.colorSpread > LAYERED_VORTICITY_FIELD_SPREAD_MAX) params.colorSpread -= 1.0f;

    params.timeAcc += dt * params.speed * 0.5f;
}

void draw() {
    float t = params.timeAcc;
    
    // Cap at 4 vortices on ESP32: each vortex adds ~7 trig ops per pixel,
    // and 5–6 vortices push this pattern past the 60 FPS budget. Visually
    // adjacent vortices overlap and obscure each other past 4 anyway.
    int maxV = (int)(1.0f + floorf(params.vortices));
    if (maxV > 4) maxV = 4;
    if (maxV < 1) maxV = 1;

    float cx[4];
    float cy[4];
    for (int i = 0; i < maxV; i++) {
        float arg1 = t * (0.8f + i * 0.3f) + i * 1.5f;
        float arg2 = t * (0.6f + i * 0.4f) + i * 2.0f;
        cx[i] = 0.5f * PFMath::fastSin(arg1);
        cy[i] = 0.3f * PFMath::fastCos(arg2);
    }

    float invW = 1.0f / (float)PANEL_RES_W;
    float invH = 1.0f / (float)PANEL_RES_H;
    float aspect = (float)PANEL_RES_W / (float)PANEL_RES_H;

    for (int y = 0; y < PANEL_RES_H; y++) {
        float ny = (y * invH) * 2.0f - 1.0f;
        for (int x = 0; x < PANEL_RES_W; x++) {
            float nx = ((x * invW) * 2.0f - 1.0f) * aspect;

            float wx = nx;
            float wy = ny;

            for (int i = 0; i < maxV; i++) {
                float dx = wx - cx[i];
                float dy = wy - cy[i];
                // Real sqrt: swirl uses 1/dist, so approxLength's octagonal
                // contour gets amplified near vortex cores into visible facets.
                float dist = sqrtf(dx * dx + dy * dy) + 0.1f;

                float swirlArg = dist * 3.0f - t;
                float swirl = PFMath::fastSin(swirlArg) * params.radius / dist;
                float cosS = PFMath::fastCos(swirl);
                float sinS = PFMath::fastSin(swirl);

                wx = dx * cosS - dy * sinS + cx[i];
                wy = dx * sinS + dy * cosS + cy[i];
            }

            float fluidSignal = PFMath::fastSin(wx * 4.0f) * PFMath::fastCos(wy * 4.0f) + PFMath::fastSin(wx * 2.0f + t);
            float normalized = (fluidSignal + 2.0f) / 4.0f;

            uint8_t r = 0, g = 0, b = 0;

            if (normalized > 0.1f) {
                float localHue = 0.6f + normalized * 0.3f + params.colorSpread * PFMath::fastSin(wx * wy + t);
                float brightness = (normalized * 1.5f > 1.0f) ? 1.0f : normalized * 1.5f;
                float saturation = 0.9f - (1.0f - brightness) * 0.4f;

                PFColor::hsvToRgb(localHue, saturation, brightness, r, g, b);

                if (normalized > 0.75f) {
                    int newR = r + 150;
                    int newG = g + 150;
                    r = (newR > 255) ? 255 : newR;
                    g = (newG > 255) ? 255 : newG;
                    b = 255;
                }
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace LayeredVorticityFieldPattern