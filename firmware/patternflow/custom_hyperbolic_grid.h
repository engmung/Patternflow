#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace HyperbolicGridPattern {

const char* NAME = "Hyperbolic Grid";
const char* const KNOB_LABELS[4] = {"Boundary Scale", "Speed", "Grid Subdiv", "Color Domain"};

const float HYPERBOLIC_GRID_BOUND_MIN = 0.0f;
const float HYPERBOLIC_GRID_BOUND_MAX = 1.0f;
const float HYPERBOLIC_GRID_BOUND_STEP = 0.05f;

const float HYPERBOLIC_GRID_SPEED_MIN = 0.1f;
const float HYPERBOLIC_GRID_SPEED_MAX = 10.0f;
const float HYPERBOLIC_GRID_SPEED_STEP = 0.10f;

const float HYPERBOLIC_GRID_SUBDIV_MIN = 0.0f;
const float HYPERBOLIC_GRID_SUBDIV_MAX = 4.9f;
const float HYPERBOLIC_GRID_SUBDIV_STEP = 0.05f;

const float HYPERBOLIC_GRID_COLOR_MIN = 0.0f;
const float HYPERBOLIC_GRID_COLOR_MAX = 1.0f;
const float HYPERBOLIC_GRID_COLOR_STEP = 0.05f;

struct Params {
    float boundary;
    float speed;
    float subdiv;
    float colorMap;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.boundary = 0.3f;
    params.speed = 1.5f;
    params.subdiv = 2.0f;
    params.colorMap = 0.6f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.boundary += input.knobDeltas[0] * HYPERBOLIC_GRID_BOUND_STEP;
    if (params.boundary < HYPERBOLIC_GRID_BOUND_MIN) params.boundary += (HYPERBOLIC_GRID_BOUND_MAX - HYPERBOLIC_GRID_BOUND_MIN);
    if (params.boundary > HYPERBOLIC_GRID_BOUND_MAX) params.boundary -= (HYPERBOLIC_GRID_BOUND_MAX - HYPERBOLIC_GRID_BOUND_MIN);

    params.speed += input.knobDeltas[1] * HYPERBOLIC_GRID_SPEED_STEP;
    params.speed = constrain(params.speed, HYPERBOLIC_GRID_SPEED_MIN, HYPERBOLIC_GRID_SPEED_MAX);

    params.subdiv += input.knobDeltas[2] * HYPERBOLIC_GRID_SUBDIV_STEP;
    params.subdiv = constrain(params.subdiv, HYPERBOLIC_GRID_SUBDIV_MIN, HYPERBOLIC_GRID_SUBDIV_MAX);

    params.colorMap += input.knobDeltas[3] * HYPERBOLIC_GRID_COLOR_STEP;
    if (params.colorMap < HYPERBOLIC_GRID_COLOR_MIN) params.colorMap += (HYPERBOLIC_GRID_COLOR_MAX - HYPERBOLIC_GRID_COLOR_MIN);
    if (params.colorMap > HYPERBOLIC_GRID_COLOR_MAX) params.colorMap -= (HYPERBOLIC_GRID_COLOR_MAX - HYPERBOLIC_GRID_COLOR_MIN);

    params.timeAcc += dt * params.speed;
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float t = params.timeAcc;
    const float divFactor = 1.0f + params.subdiv * 2.0f;

    const float h2 = h / 2.0f;
    const float w2 = w / 2.0f;

    for (int y = 0; y < h; y++) {
        float ny = (y - h2) / h2;
        float abs_ny = ny < 0.0f ? -ny : ny;
        float wy = ny / (1.001f - abs_ny * params.boundary * 0.9f);
        int gridY = (int)floorf((wy + 2.0f) * divFactor);
        float yTerm = gridY * 1.2f + t;

        for (int x = 0; x < w; x++) {
            float nx = (x - w2) / w2;
            float abs_nx = nx < 0.0f ? -nx : nx;
            float wx = nx / (1.001f - abs_nx * params.boundary * 0.9f);
            int gridX = (int)floorf((wx + 2.0f) * divFactor);

            float wave = PFMath::fastSin(gridX * 1.5f + yTerm);
            float sig = (wave + 1.0f) * 0.5f;

            uint8_t r = 0;
            uint8_t g = 0;
            uint8_t b = 0;

            if (sig > 0.7f) {
                r = 255;
                g = 255;
                b = 255;
            } else if (((gridX + gridY) % 2 == 0) && sig > 0.3f) {
                r = (uint8_t)constrain(floorf(40.0f + params.colorMap * 180.0f), 0.0f, 255.0f);
                g = (uint8_t)constrain(floorf(200.0f * sig), 0.0f, 255.0f);
                b = (uint8_t)constrain(floorf(20.0f + (1.0f - params.colorMap) * 200.0f), 0.0f, 255.0f);
            } else if (sig > 0.45f) {
                r = 30;
                g = 40;
                b = 100;
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace HyperbolicGridPattern