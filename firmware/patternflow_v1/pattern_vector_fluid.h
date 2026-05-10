#pragma once
#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "core_display.h"
#include "core_encoders.h"

namespace LiquidPlasmaPattern {

const char* NAME = "Liquid Plasma";
const char* const KNOB_LABELS[4] = {"HUE", "SPEED", "SCALE", "CHAOS"};

const float LIQUID_PLASMA_HUE_STEP = 0.05f;
const float LIQUID_PLASMA_SPEED_STEP = 0.05f;
const float LIQUID_PLASMA_SCALE_STEP = 0.01f;
const float LIQUID_PLASMA_CHAOS_STEP = 0.1f;

struct Params {
    float hueBase;
    float speed;
    float scale;
    float chaos;
    float timeAcc;
};

Params params;

struct RGB {
    uint8_t r, g, b;
};

RGB hsvToRgb(float h, float s, float v) {
    h = fmodf(h, 1.0f);
    if (h < 0.0f) h += 1.0f;
    
    int i = (int)floorf(h * 6.0f);
    float f = h * 6.0f - (float)i;
    float p = v * (1.0f - s);
    float q = v * (1.0f - f * s);
    float t = v * (1.0f - (1.0f - f) * s);
    
    float r = 0, g = 0, b = 0;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
    }
    
    return {
        (uint8_t)roundf(r * 255.0f),
        (uint8_t)roundf(g * 255.0f),
        (uint8_t)roundf(b * 255.0f)
    };
}

void setup() {
    params.hueBase = 0.5f;
    params.speed = 1.0f;
    params.scale = 0.1f;
    params.chaos = 1.0f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.hueBase = fmodf(params.hueBase + (float)input.knobDeltas[0] * LIQUID_PLASMA_HUE_STEP, 1.0f);
    if (params.hueBase < 0.0f) params.hueBase += 1.0f;
    
    params.speed = params.speed + (float)input.knobDeltas[1] * LIQUID_PLASMA_SPEED_STEP;
    if (params.speed < 0.0f) params.speed = 0.0f;
    
    params.scale = constrain(params.scale + (float)input.knobDeltas[2] * LIQUID_PLASMA_SCALE_STEP, 0.02f, 0.2f);
    params.chaos = constrain(params.chaos + (float)input.knobDeltas[3] * LIQUID_PLASMA_CHAOS_STEP, 0.0f, 3.0f);
    
    params.timeAcc += dt * params.speed;
}

void draw() {
    float t = params.timeAcc;
    float s = params.scale;
    float c = params.chaos;

    // ESP32 Optimization: Precompute row and column values to eliminate all 
    // inner-loop trigonometric functions.
    // Using angle addition identities: 
    // sin(A + B) = sin(A)cos(B) + cos(A)sin(B)
    // cos(C + D) = cos(C)cos(D) - sin(C)sin(D)
    
    float v1_arr[PANEL_RES_W];
    float nx_arr[PANEL_RES_W];
    float sinA_arr[PANEL_RES_W];
    float cosA_arr[PANEL_RES_W];
    float sinD_arr[PANEL_RES_W];
    float cosD_arr[PANEL_RES_W];

    for (int x = 0; x < PANEL_RES_W; x++) {
        float nx = (float)x * s;
        nx_arr[x] = nx;
        v1_arr[x] = sinf(nx + t);
        
        float warpY = cosf(nx * 2.0f - t * 1.2f) * c;
        float A = nx * 1.5f + t * 1.5f;
        sinA_arr[x] = sinf(A);
        cosA_arr[x] = cosf(A);
        
        float D = warpY * 1.5f;
        sinD_arr[x] = sinf(D);
        cosD_arr[x] = cosf(D);
    }

    float v2_arr[PANEL_RES_H];
    float ny_arr[PANEL_RES_H];
    float sinB_arr[PANEL_RES_H];
    float cosB_arr[PANEL_RES_H];
    float sinC_arr[PANEL_RES_H];
    float cosC_arr[PANEL_RES_H];

    for (int y = 0; y < PANEL_RES_H; y++) {
        float ny = (float)y * s;
        ny_arr[y] = ny;
        v2_arr[y] = cosf(ny - t * 0.8f);
        
        float warpX = sinf(ny * 2.0f + t) * c;
        float B = warpX * 1.5f;
        sinB_arr[y] = sinf(B);
        cosB_arr[y] = cosf(B);
        
        float C = ny * 1.5f - t;
        sinC_arr[y] = sinf(C);
        cosC_arr[y] = cosf(C);
    }

    for (int y = 0; y < PANEL_RES_H; y++) {
        float v2 = v2_arr[y];
        float sinB = sinB_arr[y];
        float cosB = cosB_arr[y];
        float sinC = sinC_arr[y];
        float cosC = cosC_arr[y];
        float ny = ny_arr[y];

        for (int x = 0; x < PANEL_RES_W; x++) {
            float v1 = v1_arr[x];
            
            // Reconstruct nested sine/cosine without inner-loop trig function calls
            float v3 = sinA_arr[x] * cosB + cosA_arr[x] * sinB;
            float v4 = cosC * cosD_arr[x] - sinC * sinD_arr[x];
            
            float field = fabsf(v1 + v2 + v3 + v4);
            
            float val = 1.0f - (field * 0.5f);
            val = constrain(val, 0.0f, 1.0f);
            
            // Replace expensive pow(..., 3.0) with fast multiplication
            val = val * val * val; 
            
            val = constrain(val * 2.5f, 0.0f, 1.0f);

            float hue = params.hueBase + nx_arr[x] * 0.1f + ny * 0.1f + field * 0.05f;
            
            RGB rgb = hsvToRgb(hue, 1.0f - val * 0.2f, val);
            dma_display->drawPixelRGB888(x, y, rgb.r, rgb.g, rgb.b);
        }
    }
}

} // namespace LiquidPlasmaPattern