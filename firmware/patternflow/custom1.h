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

namespace VoronoiCrystalsPattern {

const char* NAME = "Voronoi Crystals";
const char* const KNOB_LABELS[4] = {"Hue", "Speed", "Density", "Sharp"};

// Knob ranges and steps - prefixed with pattern name to avoid macro collisions
const float VORONOI_CRYSTALS_CRYSTAL_HUE_MIN = 0.0f;
const float VORONOI_CRYSTALS_CRYSTAL_HUE_MAX = 1.0f;
const float VORONOI_CRYSTALS_CRYSTAL_HUE_STEP = 0.05f;

const float VORONOI_CRYSTALS_SPEED_MIN = 0.1f;
const float VORONOI_CRYSTALS_SPEED_MAX = 10.0f;
const float VORONOI_CRYSTALS_SPEED_STEP = 0.10f;

const float VORONOI_CRYSTALS_DENSITY_MIN = 0.0f;
const float VORONOI_CRYSTALS_DENSITY_MAX = 4.9f;
const float VORONOI_CRYSTALS_DENSITY_STEP = 0.05f;

const float VORONOI_CRYSTALS_SHARPNESS_MIN = 0.0f;
const float VORONOI_CRYSTALS_SHARPNESS_MAX = 1.0f;
const float VORONOI_CRYSTALS_SHARPNESS_STEP = 0.05f;

struct Params {
    float crystalHue = 0.0f;
    float speed = 1.0f;
    float density = 2.0f;
    float sharpness = 0.5f;
    float timeAcc = 0.0f;
};

Params params;

// Seed structure and storage
struct Seed {
    float x, y;
    float size;
    float hue;
    float phase;
};

static const int MAX_SEEDS = 100;
static Seed seeds[MAX_SEEDS];
static int seedCount = 0;
static bool seedsReady = false;

// Simple PRNG for random values
static uint32_t rngState = 2463534242u;

static float frand() {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return (float)(rngState & 0x7FFFFFFFu) / 0x7FFFFFFFu;
}

static void generateSeeds(int numSeeds, int w, int h) {
    seedCount = numSeeds;
    for (int i = 0; i < numSeeds; i++) {
        float seedVal = i * 273.14f;
        seeds[i].x = (sinf(seedVal * 1.7f) * 0.5f + 0.5f) * w;
        seeds[i].y = (cosf(seedVal * 2.3f) * 0.5f + 0.5f) * h;
        seeds[i].size = 0.5f + frand() * 0.5f;
        seeds[i].hue = sinf(seedVal) * 0.3f + 0.5f;
        seeds[i].phase = frand() * 2.0f * 3.1415926535f;
    }
    seedsReady = true;
}

void setup() {
    PFMath::buildSinLUT();
    // Seeds will be generated on first draw with default density
}

void update(float dt, const InputFrame& input) {
    // Knob 1: crystal hue (wrap)
    params.crystalHue += input.knobDeltas[0] * VORONOI_CRYSTALS_CRYSTAL_HUE_STEP;
    if (params.crystalHue > VORONOI_CRYSTALS_CRYSTAL_HUE_MAX) {
        params.crystalHue -= (VORONOI_CRYSTALS_CRYSTAL_HUE_MAX - VORONOI_CRYSTALS_CRYSTAL_HUE_MIN);
    } else if (params.crystalHue < VORONOI_CRYSTALS_CRYSTAL_HUE_MIN) {
        params.crystalHue += (VORONOI_CRYSTALS_CRYSTAL_HUE_MAX - VORONOI_CRYSTALS_CRYSTAL_HUE_MIN);
    }

    // Knob 2: speed (clamp)
    params.speed += input.knobDeltas[1] * VORONOI_CRYSTALS_SPEED_STEP;
    params.speed = constrain(params.speed, VORONOI_CRYSTALS_SPEED_MIN, VORONOI_CRYSTALS_SPEED_MAX);

    // Knob 3: density (clamp)
    params.density += input.knobDeltas[2] * VORONOI_CRYSTALS_DENSITY_STEP;
    params.density = constrain(params.density, VORONOI_CRYSTALS_DENSITY_MIN, VORONOI_CRYSTALS_DENSITY_MAX);

    // Knob 4: sharpness (wrap)
    params.sharpness += input.knobDeltas[3] * VORONOI_CRYSTALS_SHARPNESS_STEP;
    if (params.sharpness > VORONOI_CRYSTALS_SHARPNESS_MAX) {
        params.sharpness -= (VORONOI_CRYSTALS_SHARPNESS_MAX - VORONOI_CRYSTALS_SHARPNESS_MIN);
    } else if (params.sharpness < VORONOI_CRYSTALS_SHARPNESS_MIN) {
        params.sharpness += (VORONOI_CRYSTALS_SHARPNESS_MAX - VORONOI_CRYSTALS_SHARPNESS_MIN);
    }

    // Button presses reset to defaults
    if (input.btnPressed[0]) params.crystalHue = 0.0f;
    if (input.btnPressed[1]) params.speed = 1.0f;
    if (input.btnPressed[2]) params.density = 2.0f;
    if (input.btnPressed[3]) params.sharpness = 0.5f;

    params.timeAcc += dt * params.speed;
}

void draw() {
    int w = PANEL_RES_W;
    int h = PANEL_RES_H;

    float t = params.timeAcc;
    int numSeeds = (int)(params.density * 15.0f + 10.0f);
    if (numSeeds < 1) numSeeds = 1;
    if (numSeeds > MAX_SEEDS) numSeeds = MAX_SEEDS;

    // Regenerate seeds if count changed or not ready
    if (!seedsReady || seedCount != numSeeds) {
        generateSeeds(numSeeds, w, h);
    }

    float sharpness = params.sharpness * 2.0f + 1.0f;

    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            float minDistSq = INFINITY;
            int minIdx = 0;
            float secondDistSq = INFINITY;

            // Find nearest and second nearest seed
            for (int i = 0; i < seedCount; i++) {
                float dx = (float)x - seeds[i].x;
                float dy = (float)y - seeds[i].y;
                float dSq = dx * dx + dy * dy;
                if (dSq < minDistSq) {
                    secondDistSq = minDistSq;
                    minDistSq = dSq;
                    minIdx = i;
                } else if (dSq < secondDistSq) {
                    secondDistSq = dSq;
                }
            }

            const Seed& s = seeds[minIdx];
            float dist = sqrtf(minDistSq);
            float edge = sqrtf(secondDistSq) - dist;

            float growth = PFMath::fastSin(s.phase + t * s.size * 0.5f);
            float brightness = (dist / (w * 0.2f) + growth * 0.3f);
            brightness = constrain(brightness, 0.0f, 1.0f);

            float exponent = -edge * sharpness * 0.2f;
            float expVal = expf(exponent);
            float facet = 1.0f - expVal;
            // facet = pow(facet, 1.5f) - compute as x^1.5 = x * sqrt(x)
            facet = facet * facet * sqrtf(facet);

            float hue = params.crystalHue + s.hue * 0.2f + edge * 0.02f + t * 0.01f;
            hue = hue - floorf(hue); // fractional part
            float sat = 0.3f + 0.7f * (1.0f - brightness * 0.5f);
            float val = 0.1f + 0.9f * (1.0f - brightness * 0.7f) + facet * 0.3f;
            val = constrain(val, 0.0f, 1.0f);

            uint8_t r, g, b;
            PFColor::hsvToRgb(hue, sat, val, r, g, b);

            if (facet > 0.6f) {
                int highlight = (int)((facet - 0.6f) * 200.0f);
                r = constrain(r + highlight, 0, 255);
                g = constrain(g + highlight, 0, 255);
                b = constrain(b + highlight, 0, 255);
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace VoronoiCrystalsPattern