#pragma once

// ===== Patternflow pattern =====
// Title:   260716_TriMarch
// Author:  Seunghun LEE
// Date:    2026-07-16
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_color.h"

namespace TriMarch {

const char* NAME = "Tri March";
const char* const KNOB_LABELS[4] = {"Triangle size", "Speed", "March angle", "Color palette"};

static float tsize   = 0.0f;
static float speed   = 3.931f;
static float angle   = 3.122f;
static float palette = 2.607f;
static float t       = 0.0f;

void setup() {
    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    tsize += input.knobDeltas[0] * 0.05f;
    if (tsize < 0.0f) tsize = 0.0f;
    if (tsize > 1.0f) tsize = 1.0f;

    speed += input.knobDeltas[1] * 0.1f;
    if (speed < -3.0f) speed = -3.0f;
    if (speed > 4.0f)  speed = 4.0f;

    angle += input.knobDeltas[2] * 0.05f;
    if (angle < -0.001f) angle = -0.001f;
    if (angle > 5.0f)    angle = 5.0f;

    palette += input.knobDeltas[3] * 0.05f;
    if (palette < 0.0f) palette = 0.0f;
    if (palette > 4.0f) palette = 4.0f;

    t += dt * speed;
    // Period needed for multipliers 10, 2, 0.05 = 40π = 20*TWO_PI
    const float kWrapPeriod = 20.0f * TWO_PI;
    while (t >  kWrapPeriod) t -= kWrapPeriod;
    while (t < -kWrapPeriod) t += kWrapPeriod;
}

void draw() {
    const float triH = 6.0f + tsize * 25.0f;
    const float triW = triH * 0.8660254f;  // sqrt(3)/2

    const float moveX = PFMath::fastCos(angle * PI) * t * 10.0f;
    const float moveY = PFMath::fastSin(angle * PI) * t * 10.0f;

    for (int y = 0; y < PANEL_RES_H; ++y) {
        for (int x = 0; x < PANEL_RES_W; ++x) {
            float fx = ((float)x - moveX) / triW;
            float fy = ((float)y - moveY) / triH;
            int col = (int)floorf(fx);
            int row = (int)floorf(fy);
            float lx = fx - (float)col - 0.5f;
            float ly = fy - (float)row - 0.5f;
            int flip = (col + row) & 1;

            bool inTri = false;
            if (flip == 0) {
                inTri = (ly < 0.3f && fabsf(lx) * 1.8f + ly < 0.45f);
            } else {
                inTri = (ly > -0.3f && fabsf(lx) * 1.8f - ly < 0.45f);
            }

            if (inTri) {
                float seed = (float)(col * 11 + row * 17);
                float brightness = PFMath::fastSin(seed * 0.5f + t * 2.0f) * 0.4f + 0.6f;
                if (brightness < 0.0f) brightness = 0.0f;
                if (brightness > 1.0f) brightness = 1.0f;

                float hue = seed * 0.03f * palette + brightness * 0.2f + t * 0.05f;
                hue = PFMath::fract(hue);

                uint8_t r, g, b;
                PFColor::hsvToRgb(hue, 1.0f, brightness, r, g, b);
                PFCanvas::setPixel(x, y, r, g, b);
            } else {
                PFCanvas::setPixel(x, y, 0, 0, 0);
            }
        }
    }

    PFCanvas::present();
}

} // namespace TriMarch

// ── Made with Patternflow Live Editor · https://patternflow.work/pattern ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
