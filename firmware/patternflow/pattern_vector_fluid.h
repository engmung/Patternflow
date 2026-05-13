#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_display.h"
#include "core_encoders.h"

namespace SymmetryFoldsWarp {

const char* NAME = "Symmetry Folds";
const char* const KNOB_LABELS[4] = {
    "Folds",
    "Speed",
    "Density",
    "Rings"
};

float knob1 = 0.945f;
float knob2 = -4.289f;
float knob3 = 11.048f;
float knob4 = 1.0f;

float angleOffset = 0.0f;
float t_time = 0.0f;

void setup() {
    angleOffset = 0.0f;
    t_time = 0.0f;
}

void update(float dt, const InputFrame& input) {
    t_time += dt;

    knob1 += input.knobDeltas[0] * 0.05f;
    if (knob1 < 0.0f) knob1 = 0.0f;
    if (knob1 > 1.0f) knob1 = 1.0f;

    knob2 += input.knobDeltas[1] * 0.5f;
    if (knob2 < -5.001f) knob2 = -5.001f;
    if (knob2 > 5.0f) knob2 = 5.0f;

    knob3 += input.knobDeltas[2] * 0.6f;
    if (knob3 < 0.0f) knob3 = 0.0f;
    if (knob3 > 12.0f) knob3 = 12.0f;

    knob4 += input.knobDeltas[3] * 0.05f;
    if (knob4 < 0.0f) knob4 = 0.0f;
    if (knob4 > 1.0f) knob4 = 1.0f;

    // Map Knob 2 (-5 to 5) to the original JS speed range (-1 to 1) 
    float speed = knob2 * 0.2f;
    angleOffset += dt * speed;
}

inline void setHsv(int x, int y, float h, float s, float v) {
    h = h - floorf(h);
    if (h < 0.0f) h += 1.0f;
    
    if (s < 0.0f) s = 0.0f;
    if (s > 1.0f) s = 1.0f;
    if (v < 0.0f) v = 0.0f;

    float r = 0.0f, g = 0.0f, b = 0.0f;
    int i = (int)floorf(h * 6.0f);
    float f = h * 6.0f - (float)i;
    float p = v * (1.0f - s);
    float q = v * (1.0f - f * s);
    float t = v * (1.0f - (1.0f - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    int R = r * 255.0f;
    int G = g * 255.0f;
    int B = b * 255.0f;

    if (R > 255) R = 255;
    if (G > 255) G = 255;
    if (B > 255) B = 255;

    dma_display->drawPixelRGB888(x, y, R, G, B);
}

void draw() {
    float t = t_time;
    float cx = PANEL_RES_W * 0.5f;
    float cy = PANEL_RES_H * 0.5f;
    
    float folds = 1.0f + floorf(knob1 * 7.0f);
    float den = 0.05f + (knob3 / 12.0f) * 0.2f;
    float rings = 1.0f + knob4 * 5.0f;
    float slice = (PI * 2.0f) / folds;
    float halfSlice = slice * 0.5f;

    for (int y = 0; y < PANEL_RES_H; y++) {
        float dy = (float)y - cy;
        for (int x = 0; x < PANEL_RES_W; x++) {
            float dx = (float)x - cx;
            
            float r = sqrtf(dx * dx + dy * dy);
            float theta = atan2f(dy, dx) + angleOffset;
            
            // Apply symmetry folding
            theta = theta - floorf(theta / slice) * slice;
            if (theta < 0.0f) theta += slice;
            if (theta > halfSlice) theta = slice - theta;

            // Map back to warped coordinates
            float nx = r * cosf(theta) * den;
            float ny = r * sinf(theta) * den;

            float warpX = sinf(ny * 2.0f - t * 2.0f);
            float warpY = cosf(nx * 2.0f + t * 1.5f);
            
            float v1 = sinf((nx + warpX) + t);
            float v2 = cosf((ny + warpY) - t);
            
            float field = fabsf(v1 + v2);
            
            // Add radial rings
            float ringFactor = sinf(r * rings * 0.1f - t * 4.0f);
            field += ringFactor * 0.5f;

            float val = 1.0f - (fabsf(field) * 0.6f);
            if (val < 0.0f) val = 0.0f;
            val = val * val;
            
            // Color shifts from center outwards and pulses
            float hue = t * 0.1f + r * 0.02f + theta * 0.5f;
            hue = hue - floorf(hue);
            if (hue < 0.0f) hue += 1.0f;

            float sat = 1.0f - (val * 0.3f);
            
            setHsv(x, y, hue, sat, val * 1.5f);
        }
    }
}

} // namespace SymmetryFoldsWarp