#pragma once

// ===== Patternflow pattern =====
// Title:   Poincaré Sphere
// Author:  Seunghun LEE
// Date:    2026-07-15
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"

namespace PoincareSphere {

const char* NAME = "Poincaré Sphere";
const char* const KNOB_LABELS[4] = {"Color Tone", "Speed", "Grid Density", "Curvature"};

static float hueParam   = 1.0f;          // Knob 1, range 0..1
static float speed      = 8.62f;         // Knob 2, range 0.1..10
static float density    = 2.50677966f;   // Knob 3, range 0..5
static float curve      = 2.601f;        // Knob 4, range 0..5
static float t          = 0.0f;

void setup() {
    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    // Knob 1: color tone
    hueParam += input.knobDeltas[0] * 0.05f;
    hueParam = fmaxf(0.0f, fminf(1.0f, hueParam));

    // Knob 2: rotation speed
    speed += input.knobDeltas[1] * 0.1f;
    speed = fmaxf(0.1f, fminf(10.0f, speed));

    // Knob 3: grid density
    density += input.knobDeltas[2] * 0.05f;
    density = fmaxf(0.0f, fminf(5.0f, density));

    // Knob 4: projection curvature
    curve += input.knobDeltas[3] * 0.05f;
    curve = fmaxf(0.0f, fminf(5.0f, curve));

    t += dt * speed;
    // Wrap at common period 20π to avoid float precision loss over days.
    const float period = 20.0f * PI;
    if (t > period) t -= period;
}

void draw() {
    float gridCount  = 2.0f + density * 3.0f;
    float curvature  = 0.1f + curve * 2.0f;

    float cx = PANEL_RES_W * 0.5f;
    float cy = PANEL_RES_H * 0.5f;

    for (int y = 0; y < PANEL_RES_H; ++y) {
        float dy = (y - cy) / cy;                     // -1 .. 1

        for (int x = 0; x < PANEL_RES_W; ++x) {
            float dx = (x - cx) / cy;                 // -W/H .. W/H

            float r2 = dx * dx + dy * dy;
            float projScale = 1.0f / (1.0f + r2 * curvature);
            float sphereX = dx * projScale;
            float sphereY = dy * projScale;

            float waveU = PFMath::fastSin(sphereX * gridCount * TWO_PI + t);
            float waveV = PFMath::fastSin(sphereY * gridCount * TWO_PI - t * 0.7f);

            float line = fabsf(waveU) * fabsf(waveV);
            uint8_t r = 0, g = 0, b = 0;

            if (line < 0.15f) {
                float intensity = 1.0f - line / 0.15f;
                float fr = intensity * 128.0f * hueParam;
                float fg = intensity * 255.0f * (1.0f - hueParam);
                float fb = intensity * 255.0f;

                if (line < 0.03f) {
                    fr = 255.0f; fg = 255.0f; fb = 255.0f;
                }

                r = (uint8_t)fminf(fmaxf(fr, 0.0f), 255.0f);
                g = (uint8_t)fminf(fmaxf(fg, 0.0f), 255.0f);
                b = (uint8_t)fminf(fmaxf(fb, 0.0f), 255.0f);
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace PoincareSphere

// ── Made with Patternflow Live Editor · https://patternflow.work/pattern ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
