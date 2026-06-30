#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"

namespace CyberpunkCyberGridPattern {

const char* NAME = "Cyber Grid";
const char* const KNOB_LABELS[4] = {"Grid Spacing", "Velocity", "Pulse Width", "Color Split"};

const float CYBER_GRID_GRIDW_MIN = 0.0f;
const float CYBER_GRID_GRIDW_MAX = 1.0f;
const float CYBER_GRID_GRIDW_STEP = 0.05f;

const float CYBER_GRID_SPEED_MIN = 0.1f;
const float CYBER_GRID_SPEED_MAX = 10.0f;
const float CYBER_GRID_SPEED_STEP = 0.10f;

const float CYBER_GRID_PULSE_MIN = 0.0f;
const float CYBER_GRID_PULSE_MAX = 4.9f;
const float CYBER_GRID_PULSE_STEP = 0.05f;

const float CYBER_GRID_SPLIT_MIN = 0.0f;
const float CYBER_GRID_SPLIT_MAX = 1.0f;
const float CYBER_GRID_SPLIT_STEP = 0.05f;

struct Params {
    float gridW;
    float speed;
    float pulse;
    float split;
    float timeAcc;
};

Params params;

void setup() {
    params.gridW = 0.4f;
    params.speed = 2.5f;
    params.pulse = 1.5f;
    params.split = 0.5f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    // Knob 1: Grid Spacing (Wrap)
    params.gridW += input.knobDeltas[0] * CYBER_GRID_GRIDW_STEP;
    while (params.gridW < CYBER_GRID_GRIDW_MIN) params.gridW += (CYBER_GRID_GRIDW_MAX - CYBER_GRID_GRIDW_MIN);
    while (params.gridW > CYBER_GRID_GRIDW_MAX) params.gridW -= (CYBER_GRID_GRIDW_MAX - CYBER_GRID_GRIDW_MIN);

    // Knob 2: Horizon Scroll Velocity (Clamp)
    params.speed += input.knobDeltas[1] * CYBER_GRID_SPEED_STEP;
    params.speed = constrain(params.speed, CYBER_GRID_SPEED_MIN, CYBER_GRID_SPEED_MAX);

    // Knob 3: Neon Pulse Width Threshold (Clamp)
    params.pulse += input.knobDeltas[2] * CYBER_GRID_PULSE_STEP;
    params.pulse = constrain(params.pulse, CYBER_GRID_PULSE_MIN, CYBER_GRID_PULSE_MAX);

    // Knob 4: Pink-Cyan Complementary Split (Wrap)
    params.split += input.knobDeltas[3] * CYBER_GRID_SPLIT_STEP;
    while (params.split < CYBER_GRID_SPLIT_MIN) params.split += (CYBER_GRID_SPLIT_MAX - CYBER_GRID_SPLIT_MIN);
    while (params.split > CYBER_GRID_SPLIT_MAX) params.split -= (CYBER_GRID_SPLIT_MAX - CYBER_GRID_SPLIT_MIN);

    params.timeAcc += dt * params.speed * 15.0f;
}

void draw() {
    int w = PANEL_RES_W;
    int h = PANEL_RES_H;
    float t = params.timeAcc;

    int spacing = (int)floorf(params.gridW * 14.0f) + 6;
    if (spacing <= 0) spacing = 1;
    
    float pWidth = params.pulse * 0.3f + 0.1f;
    float spacing_pWidth = (float)spacing * pWidth;
    int horizon_y = (int)floorf((float)h * 0.4f);

    float w_div_2 = (float)w / 2.0f;
    float t_05 = t * 0.5f;

    uint8_t vertical_r = 0;
    uint8_t vertical_g = (uint8_t)constrain(floorf(200.0f + params.split * 55.0f), 0.0f, 255.0f);
    uint8_t vertical_b = 255;

    uint8_t horizontal_r = 255;
    uint8_t horizontal_g = 20;
    uint8_t horizontal_b = (uint8_t)constrain(floorf(150.0f + (1.0f - params.split) * 105.0f), 0.0f, 255.0f);

    for (int y = 0; y < h; y++) {
        float perspectiveScale = ((float)y / (float)h) * 3.0f + 0.2f;
        float invPerspectiveScale = 1.0f / perspectiveScale;
        
        float y_term = (float)y - t * 0.2f;
        bool gridY = fabsf(fmodf(y_term, (float)spacing)) < spacing_pWidth;

        for (int x = 0; x < w; x++) {
            float skewX = ((float)x - w_div_2) * invPerspectiveScale + w_div_2;
            float x_term = skewX + t_05;
            bool gridX = fabsf(fmodf(x_term, (float)spacing)) < spacing_pWidth;

            uint8_t r = 0, g = 0, b = 0;

            if (gridX && gridY) {
                r = 255; g = 255; b = 255;
            } else if (gridX) {
                r = vertical_r; g = vertical_g; b = vertical_b;
            } else if (gridY) {
                r = horizontal_r; g = horizontal_g; b = horizontal_b;
            } else if (y == horizon_y) {
                r = 255; g = 255; b = 0;
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace CyberpunkCyberGridPattern