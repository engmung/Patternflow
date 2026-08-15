#pragma once

// ===== Patternflow pattern =====
// Title:   260719_MagVortex
// Author:  Seunghun LEE
// Date:    2026-07-19
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_mem.h"
#include "../src/core_params.h"

namespace MagVortex {

const char* NAME = "MagVortex";
const char* const KNOB_LABELS[4] = {
    "TrailDecay",
    "Velocity",
    "SpinPull",
    "InflowPitch"
};
constexpr bool ABSOLUTE_READY = true;

// Parameter state
static float trailDecay = 0.924f;
static float velocity    = 2.013f;
static float spin        = 0.746f;
static float pitch       = -2.203f;

// Density map (0..1 trails). 128×64 floats (32 KB) — as a static array this
// sat in internal DRAM from boot for every build; allocated from PSRAM in
// setup() instead (PFMem).
static float* densityMap = nullptr;

// Particle structure
struct Charge {
    float r;
    float angle;
    float speedProfile;
    float brightness;
    float prevX;
    float prevY;
};

static const int NUM_CHARGES = 48;
static Charge charges[NUM_CHARGES];

// Helper for random float 0..1
static float randf() {
    return (float)random(0x7FFFFFFF) / (float)0x7FFFFFFF;
}

// Pre-baked color ramp LUT (verbatim)
static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{43,39,47},{80,61,100},{107,61,153},{123,40,205},{128,0,255},{132,0,255},{136,0,255},
  {141,0,255},{145,0,255},{149,0,255},{153,0,255},{157,0,255},{161,0,255},{165,0,255},{169,0,255},
  {174,0,255},{178,0,255},{182,0,255},{186,0,255},{190,0,255},{194,0,255},{198,0,255},{202,0,255},
  {206,0,255},{211,0,255},{215,0,255},{219,0,255},{223,0,255},{228,0,255},{232,0,255},{236,0,255},
  {240,0,255},{245,0,255},{249,0,255},{253,0,255},{255,0,253},{255,0,248},{255,0,244},{255,0,240},
  {255,0,236},{255,0,231},{255,0,227},{255,0,223},{255,0,219},{255,0,214},{255,0,210},{255,0,206},
  {255,0,202},{255,0,197},{255,0,193},{255,0,189},{255,0,185},{255,0,180},{255,0,176},{255,0,172},
  {255,0,168},{255,0,163},{255,0,159},{255,0,155},{255,0,151},{255,0,146},{255,0,142},{255,0,138},
  {255,0,134},{255,0,129},{255,0,125},{255,0,121},{255,0,117},{255,0,112},{255,0,108},{255,0,104},
  {255,0,100},{255,0,95},{255,0,91},{255,0,87},{255,0,83},{255,0,78},{255,0,74},{255,0,70},
  {255,0,66},{255,0,61},{255,0,57},{255,0,53},{255,0,49},{255,0,44},{255,0,40},{255,0,36},
  {255,0,32},{255,0,27},{255,0,23},{255,0,19},{255,0,15},{255,0,10},{255,0,6},{255,0,2},
  {255,13,13},{255,38,38},{255,63,63},{255,88,88},{255,113,113},{255,138,138},{255,163,163},{255,188,188},
  {255,213,213},{255,238,238},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
};

void setup() {
    // Seed randomness
    randomSeed(esp_random());

    // Density map lives in PSRAM; PFMem zeroes fresh allocations.
    if (!densityMap) {
        densityMap = PFMem::allocFloats(PANEL_RES_W * PANEL_RES_H);
    } else {
        for (int i = 0; i < PANEL_RES_W * PANEL_RES_H; i++) {
            densityMap[i] = 0.0f;
        }
    }

    // Initialize particles
    const float cx = PANEL_RES_W / 2.0f;
    const float cy = PANEL_RES_H / 2.0f;
    for (int i = 0; i < NUM_CHARGES; i++) {
        float r = 10.0f + randf() * 60.0f;
        float angle = randf() * TWO_PI;
        float xPos = cx + cosf(angle) * r;
        float yPos = cy + sinf(angle) * r;

        charges[i].r = r;
        charges[i].angle = angle;
        charges[i].speedProfile = 0.8f + randf() * 1.4f;
        charges[i].brightness = 0.4f + randf() * 0.6f;
        charges[i].prevX = xPos;
        charges[i].prevY = yPos;
    }
}

void update(float dt, const InputFrame& input) {
    if (!densityMap) return;  // allocation failed — degrade to a blank pattern

    // Knob 0: TrailDecay
    PFParams::apply(input, 0, &trailDecay, 0.5f, 0.98f, 0.05f);

    // Knob 1: Velocity
    PFParams::apply(input, 1, &velocity, -3.0f, 5.0f, 0.1f);

    // Knob 2: SpinPull
    PFParams::apply(input, 2, &spin, 0.0f, 3.0f, 0.05f);

    // Knob 3: InflowPitch
    PFParams::apply(input, 3, &pitch, -20.0f, 20.0f, 0.05f);

    // Button resets
    if (input.btnPressed[0] && !input.paramAbsoluteActive[0] && !input.knobAudioActive[0]) trailDecay = 0.924f;
    if (input.btnPressed[1] && !input.paramAbsoluteActive[1] && !input.knobAudioActive[1]) velocity = 2.013f;
    if (input.btnPressed[2] && !input.paramAbsoluteActive[2] && !input.knobAudioActive[2]) spin = 0.746f;
    if (input.btnPressed[3] && !input.paramAbsoluteActive[3] && !input.knobAudioActive[3]) pitch = -2.203f;

    // Decay the density map
    for (int i = 0; i < PANEL_RES_W * PANEL_RES_H; i++) {
        densityMap[i] *= trailDecay;
    }

    float tStep = velocity * dt * 4.0f;
    const float cx = PANEL_RES_W / 2.0f;
    const float cy = PANEL_RES_H / 2.0f;

    for (int i = 0; i < NUM_CHARGES; i++) {
        Charge& c = charges[i];

        // Save previous position
        c.prevX = cx + cosf(c.angle) * c.r;
        c.prevY = cy + sinf(c.angle) * c.r;

        // Update orbit
        c.angle += spin * 0.4f * c.speedProfile * tStep;
        c.r -= pitch * 6.0f * tStep;

        // Reset logic depending on flow direction
        if (pitch > 0.01f) {
            // Inward flow
            if (c.r < 3.0f) {
                c.r = 55.0f + randf() * 35.0f;
                c.angle = randf() * TWO_PI;
                c.prevX = cx + cosf(c.angle) * c.r;
                c.prevY = cy + sinf(c.angle) * c.r;
            }
        } else if (pitch < -0.01f) {
            // Outward flow
            if (c.r > 90.0f) {
                c.r = 2.0f + randf() * 5.0f;
                c.angle = randf() * TWO_PI;
                c.prevX = cx + cosf(c.angle) * c.r;
                c.prevY = cy + sinf(c.angle) * c.r;
            }
        } else {
            // Neutral
            if (c.r < 3.0f || c.r > 90.0f) {
                c.r = 30.0f + randf() * 40.0f;
                c.angle = randf() * TWO_PI;
                c.prevX = cx + cosf(c.angle) * c.r;
                c.prevY = cy + sinf(c.angle) * c.r;
            }
        }

        // Current position
        float curX = cx + cosf(c.angle) * c.r;
        float curY = cy + sinf(c.angle) * c.r;

        // Interpolate trail between previous and current
        float dx = curX - c.prevX;
        float dy = curY - c.prevY;
        float dist = sqrtf(dx * dx + dy * dy);
        int steps = (int)ceilf(dist);
        if (steps < 1) steps = 1;

        float addVal = c.brightness * 0.7f;
        for (int s = 0; s <= steps; s++) {
            float frac = (float)s / (float)steps;
            float px = c.prevX + dx * frac;
            float py = c.prevY + dy * frac;
            int ix = (int)floorf(px);
            int iy = (int)floorf(py);

            if (ix >= 0 && ix < PANEL_RES_W && iy >= 0 && iy < PANEL_RES_H) {
                int idx = iy * PANEL_RES_W + ix;
                float newVal = densityMap[idx] + addVal;
                if (newVal > 1.0f) newVal = 1.0f;
                densityMap[idx] = newVal;
            }
        }
    }
}

void draw() {
    if (!densityMap) {  // allocation failed — show nothing rather than crash
        PFCanvas::present();
        return;
    }
    for (int y = 0; y < PANEL_RES_H; y++) {
        for (int x = 0; x < PANEL_RES_W; x++) {
            int idx = y * PANEL_RES_W + x;
            float val = densityMap[idx];
            float v;

            if (val > 0.001f) {
                if (val < 0.15f) {
                    v = 0.06f + val * 0.6f;
                } else if (val < 0.45f) {
                    v = 0.2f + (val - 0.15f) * 1.3f;
                } else if (val < 0.75f) {
                    v = 0.55f + (val - 0.45f) * 1.5f;
                } else {
                    v = 0.85f + (val - 0.75f) * 2.0f;
                }
                if (v > 1.0f) v = 1.0f;
                if (v < 0.0f) v = 0.0f;
            } else {
                v = 0.02f;
            }

            int li = (int)(v * 255.0f + 0.5f);
            if (li < 0) li = 0;
            if (li > 255) li = 255;
            PFCanvas::setPixel(x, y,
                RAMP_LUT[li][0],
                RAMP_LUT[li][1],
                RAMP_LUT[li][2]);
        }
    }
    PFCanvas::present();
}

} // namespace MagVortex

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
