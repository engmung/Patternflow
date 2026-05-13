#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "core_display.h"
#include "core_encoders.h"

namespace GlitchMatrixPattern {

const char* NAME = "Glitch Matrix";
const char* const KNOB_LABELS[4] = {"HUE", "SPEED", "MODE", "FREQ"};

const float GLITCH_MATRIX_HUE_STEP = 0.012f;
const float GLITCH_MATRIX_SPEED_STEP = 0.018f;
const float GLITCH_MATRIX_MODE_STEP = 0.018f;
const float GLITCH_MATRIX_FREQ_STEP = 0.018f;

struct Params {
    float hue, speed, mode, freq;
    float hueT, speedT, modeT, freqT;
    float timeAcc;
};

Params params;

static float wrap01(float v) {
    v = v - floorf(v);
    if (v < 0.0f) v += 1.0f;
    return v;
}

static float mix(float a, float b, float t) {
    return a + (b - a) * t;
}

static float mixHue(float a, float b, float t) {
    float d = b - a;
    if (d > 0.5f) d -= 1.0f;
    if (d < -0.5f) d += 1.0f;
    return wrap01(a + d * t);
}

static void hsvToRgb(float h, float s, float v, uint8_t& r, uint8_t& g, uint8_t& b) {
    h = wrap01(h);
    int i = (int)floorf(h * 6.0f);
    float f = h * 6.0f - (float)i;
    float p = v * (1.0f - s);
    float q = v * (1.0f - f * s);
    float t_val = v * (1.0f - (1.0f - f) * s);

    float rf = 0.0f, gf = 0.0f, bf = 0.0f;
    switch (i % 6) {
        case 0: rf = v; gf = t_val; bf = p; break;
        case 1: rf = q; gf = v; bf = p; break;
        case 2: rf = p; gf = v; bf = t_val; break;
        case 3: rf = p; gf = q; bf = v; break;
        case 4: rf = t_val; gf = p; bf = v; break;
        default: rf = v; gf = p; bf = q; break;
    }

    r = (uint8_t)constrain(rf * 255.0f, 0.0f, 255.0f);
    g = (uint8_t)constrain(gf * 255.0f, 0.0f, 255.0f);
    b = (uint8_t)constrain(bf * 255.0f, 0.0f, 255.0f);
}

void setup() {
    params.hue = 0.56f;
    params.speed = 0.42f;
    params.mode = 0.35f;
    params.freq = 0.45f;

    params.hueT = params.hue;
    params.speedT = params.speed;
    params.modeT = params.mode;
    params.freqT = params.freq;

    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    float d0 = input.knobDeltas[0];
    float d1 = input.knobDeltas[1];
    float d2 = input.knobDeltas[2];
    float d3 = input.knobDeltas[3];

    params.hueT = wrap01(params.hueT + d0 * GLITCH_MATRIX_HUE_STEP);
    params.speedT = constrain(params.speedT + d1 * GLITCH_MATRIX_SPEED_STEP, 0.0f, 1.0f);
    params.modeT = constrain(params.modeT + d2 * GLITCH_MATRIX_MODE_STEP, 0.0f, 1.0f);
    params.freqT = constrain(params.freqT + d3 * GLITCH_MATRIX_FREQ_STEP, 0.0f, 1.0f);

    float s = constrain(dt * 7.5f, 0.0f, 1.0f);
    params.hue = mixHue(params.hue, params.hueT, s);
    params.speed = mix(params.speed, params.speedT, s);
    params.mode = mix(params.mode, params.modeT, s);
    params.freq = mix(params.freq, params.freqT, s);

    params.timeAcc += dt * (0.18f + params.speed * 1.85f);
}

void draw() {
    int w = PANEL_RES_W;
    int h = PANEL_RES_H;
    float t = params.timeAcc;

    int cellSize = (int)floorf(mix(16.0f, 4.0f, params.freq));
    if (cellSize < 1) cellSize = 1;
    float invCell = 1.0f / (float)cellSize;

    uint8_t c1_r, c1_g, c1_b;
    hsvToRgb(params.hue, 0.9f, 1.0f, c1_r, c1_g, c1_b);

    float shiftIntensity = mix(0.0f, 3.0f, params.mode);

    for (int y = 0; y < h; y++) {
        // Optimized outer loop precomputations
        int gy = y / cellSize; // y is always positive
        float ny = (float)(y % cellSize) * invCell - 0.5f;
        float absNy = ny < 0.0f ? -ny : ny;

        int shiftX = (int)floorf(sinf((float)gy * 0.5f + t * 2.0f) * (float)cellSize * shiftIntensity);

        for (int x = 0; x < w; x++) {
            int effX = x + shiftX;
            
            // Integer grid logic avoids floorf() inside the fast inner loop
            int gx = effX / cellSize;
            int modX = effX % cellSize;
            if (modX < 0) {
                modX += cellSize;
                gx -= 1;
            }
            
            float nx = (float)modX * invCell - 0.5f;
            float absNx = nx < 0.0f ? -nx : nx;

            uint8_t r = 0, g = 0, b = 0;
            bool mask = ((gx + gy) % 2) == 0;
            
            if (mask) {
                if (absNx < 0.3f && absNy < 0.3f) {
                    r = c1_r; g = c1_g; b = c1_b;
                }
            } else {
                if (absNx > 0.4f || absNy > 0.4f) {
                    r = 255; g = 255; b = 255;
                }
            }

            dma_display->drawPixelRGB888(x, y, r, g, b);
        }
    }
}

} // namespace GlitchMatrixPattern
