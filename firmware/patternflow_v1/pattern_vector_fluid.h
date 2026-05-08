#pragma once
#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "core_display.h"
#include "core_encoders.h"

namespace FractalOrbitPattern {

const char* NAME = "Fractal Orbit";
const char* const KNOB_LABELS[4] = {"HUE", "SPEED", "SCALE", "DETAIL"};

const float FRACTAL_ORBIT_HUE_STEP = 0.05f;
const float FRACTAL_ORBIT_SPEED_STEP = 0.1f;
const float FRACTAL_ORBIT_SCALE_STEP = 0.15f;
const float FRACTAL_ORBIT_DETAIL_STEP = 0.1f;

struct Params {
    float hue;
    float speed;
    float scale;
    float detail;
    float phase;
};

Params params;

void hsvToRgb(float h, float s, float v, uint8_t& rOut, uint8_t& gOut, uint8_t& bOut) {
    h = h - floorf(h);
    if (h < 0.0f) h += 1.0f;
    int i = (int)floorf(h * 6.0f);
    float f = h * 6.0f - (float)i;
    float p = v * (1.0f - s);
    float q = v * (1.0f - f * s);
    float t = v * (1.0f - (1.0f - f) * s);
    float r, g, b;
    
    if (i == 0) { r = v; g = t; b = p; }
    else if (i == 1) { r = q; g = v; b = p; }
    else if (i == 2) { r = p; g = v; b = t; }
    else if (i == 3) { r = p; g = q; b = v; }
    else if (i == 4) { r = t; g = p; b = v; }
    else { r = v; g = p; b = q; }
    
    rOut = (uint8_t)constrain(floorf(r * 255.0f), 0.0f, 255.0f);
    gOut = (uint8_t)constrain(floorf(g * 255.0f), 0.0f, 255.0f);
    bOut = (uint8_t)constrain(floorf(b * 255.0f), 0.0f, 255.0f);
}

void setup() {
    params.hue = 0.6f;
    params.speed = 1.0f;
    params.scale = 1.0f;
    params.detail = 0.5f;
    params.phase = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.hue += input.knobDeltas[0] * FRACTAL_ORBIT_HUE_STEP;
    params.hue = fmodf(params.hue, 1.0f);
    if (params.hue < 0.0f) params.hue += 1.0f;

    params.speed += input.knobDeltas[1] * FRACTAL_ORBIT_SPEED_STEP;
    params.speed = constrain(params.speed, 0.05f, 5.0f);

    params.scale += input.knobDeltas[2] * FRACTAL_ORBIT_SCALE_STEP;
    params.scale = constrain(params.scale, 0.2f, 5.0f);

    params.detail += input.knobDeltas[3] * FRACTAL_ORBIT_DETAIL_STEP;
    params.detail = constrain(params.detail, 0.0f, 2.0f);

    params.phase += dt * params.speed;
}

void draw() {
    float cx = (float)PANEL_RES_W * 0.5f;
    float cy = (float)PANEL_RES_H * 0.5f;

    float t = params.phase;

    float angle = t * 0.2f + params.detail * PI;
    float sa = sinf(angle);
    float ca = cosf(angle);

    float zoom = 1.5f / params.scale;
    float invCy = 1.0f / cy;
    float zoomFactor = zoom * invCy;
    float shift = 0.35f + sinf(t * 0.4f) * 0.15f;

    for (int y = 0; y < PANEL_RES_H; y++) {
        float dy = ((float)y - cy) * zoomFactor;
        for (int x = 0; x < PANEL_RES_W; x++) {
            float dx = ((float)x - cx) * zoomFactor;

            float zx = dx;
            float zy = dy;
            float minDist = 1000.0f;
            float orbitSq = 0.0f;

            for (int i = 0; i < 5; i++) {
                zx = fabsf(zx);
                zy = fabsf(zy);

                float m = zx < zy ? zx : zy;
                if (m < minDist) minDist = m;

                float nx = zx * ca - zy * sa;
                float ny = zx * sa + zy * ca;

                zx = nx * 1.35f - shift;
                zy = ny * 1.35f - shift;

                orbitSq += zx * zx + zy * zy;
            }

            float glow = 0.02f / (minDist * minDist + 0.005f);
            
            float structure = 1.0f - orbitSq * 0.04f;
            if (structure < 0.0f) structure = 0.0f;

            float val = glow + structure * 0.15f;
            if (val > 1.0f) val = 1.0f;

            float sat = 1.2f - val * 0.5f;
            if (sat < 0.0f) sat = 0.0f;
            if (sat > 1.0f) sat = 1.0f;

            float pColorHue = params.hue + orbitSq * 0.015f - t * 0.3f;

            uint8_t r, g, b;
            hsvToRgb(pColorHue, sat, val, r, g, b);
            dma_display->drawPixelRGB888(x, y, r, g, b);
        }
    }
}

} // namespace FractalOrbitPattern