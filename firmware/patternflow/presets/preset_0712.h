#pragma once

// ===== Patternflow pattern =====
// Title:   260712_Midsummer Sea
// Author:  Seunghun LEE
// Date:    2026-07-12
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_noise.h"
#include "../src/core_params.h"

namespace MidsummerSea {

const char* NAME = "Midsummer Sea";
const char* const KNOB_LABELS[4] = {"Waves", "Speed", "Sun", "Glitter"};
constexpr bool ABSOLUTE_READY = true;

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{1,0,7},
  {3,0,17},{5,0,27},{6,0,37},{8,0,47},{10,0,57},{11,0,67},{13,0,77},{15,0,87},
  {16,0,97},{18,0,107},{20,0,117},{21,0,127},{23,0,137},{25,0,147},{26,0,157},{28,0,167},
  {30,0,177},{32,0,187},{33,0,197},{35,0,207},{37,0,217},{38,0,227},{40,0,237},{42,0,247},
  {45,1,253},{53,3,244},{60,5,234},{68,8,225},{76,10,215},{84,12,206},{92,15,196},{100,17,187},
  {107,19,177},{115,22,168},{123,24,159},{131,27,149},{139,29,140},{147,31,130},{154,34,121},{162,36,111},
  {170,38,102},{178,41,93},{186,43,83},{194,45,74},{202,48,64},{209,50,55},{217,53,45},{225,55,36},
  {233,57,27},{241,60,17},{249,62,8},{255,65,2},{255,71,10},{255,78,18},{255,84,27},{255,90,35},
  {255,97,44},{255,103,52},{255,109,60},{255,116,69},{255,122,77},{255,128,86},{255,134,94},{255,141,102},
  {255,147,111},{255,153,119},{255,160,128},{255,166,136},{255,172,144},{255,178,153},{255,185,161},{255,191,170},
  {255,197,178},{255,204,186},{255,210,195},{255,216,203},{255,223,212},{255,229,220},{255,235,228},{255,241,237},
  {255,248,245},{255,254,254},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
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

static float waves   = 0.374f;
static float speed   = 1.954f;
static float sun     = 0.683f;
static float glit    = 0.311f;
static float t       = 0.0f;

void setup() {
    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    PFParams::apply(input, 0, &waves, 0.0f, 1.0f, 0.05f);

    PFParams::apply(input, 1, &speed, 0.1f, 3.0f, 0.1f);

    PFParams::apply(input, 2, &sun, 0.0f, 1.0f, 0.05f);

    PFParams::apply(input, 3, &glit, 0.0f, 1.0f, 0.05f);

    t += dt * speed;
    // common period for all sine multipliers: 2000π
    if (t > 2000.0f * TWO_PI) {
        t -= 2000.0f * TWO_PI;
    }
}

void draw() {
    const int W = PANEL_RES_W; // 128
    const int H = PANEL_RES_H; // 64
    const float vh = (float)(W); // portrait logic: vh = max(W,H) = 128
    const float vw = (float)(H); // 64
    const float horizon   = floorf(vh * 0.34f);  // 43
    const float beachTop  = vh - floorf(vh * 0.14f); // 111
    const float sunU      = vw * 0.5f;          // 32.0
    const float sunV      = horizon - 3.0f - sun * (horizon - 8.0f); // 40 - sun*35
    const float invHorizon = 1.0f / horizon;
    const float beachRange = vh - beachTop; // 17

    for (int y = 0; y < H; ++y) {
        const float u = (float)y;                // 0..63

        for (int x = 0; x < W; ++x) {
            // coordinate remap for vertical panel (landscape physical)
            const float v = (float)(W - 1 - x); // 127..0

            float val;

            if (v < horizon) {
                // --- Sky ---
                const float g = v * invHorizon;
                val = 0.12f + 0.38f * g;

                const float du = u - sunU;
                const float dv = (v - sunV) * 1.2f;
                const float d = sqrtf(du * du + dv * dv);
                if (d < 4.5f) {
                    val = 1.0f;
                } else {
                    val += 0.7f * expf(-d * 0.18f);
                }

                const float cl = PFMath::fastSin(u * 0.11f + v * 0.9f + t * 0.25f)
                               + PFMath::fastSin(u * 0.05f - v * 0.5f + 2.0f);
                if (cl > 1.2f && v < horizon * 0.8f) {
                    val += 0.12f;
                }
            }
            else if (v < beachTop) {
                // --- Sea ---
                const float depth = (v - horizon) / (beachTop - horizon);
                const float persp = 1.0f / (depth + 0.09f);
                const float wob   = PFMath::fastSin(u * 0.25f + t * 1.3f) * 0.5f * waves;
                const float band  = PFMath::fastSin(persp * 2.6f + wob + t * (1.5f + depth * 2.0f));

                val = 0.42f - 0.22f * depth
                    + band * (0.06f + 0.14f * waves) * (0.4f + depth);

                const float pathW  = 2.5f + depth * 9.0f;
                const float sway   = PFMath::fastSin(v * 0.5f + t) * waves * 2.0f;
                const bool  inPath = fabsf(u - sunU + sway) < pathW;
                if (inPath) {
                    val += 0.12f + 0.1f * (1.0f - depth);
                }

                // glitter sparkle
                const int gx   = (int)(u * 7.3f);
                const int gy   = (int)(v * 13.1f);
                const int seed = (int)(floorf(t * 7.0f) * 17.7f);
                const float sp = PFNoise::cellHash(gx, gy, seed);
                const float thr = 1.0f - glit * (inPath ? 0.10f : 0.03f);
                if (sp > thr && band > 0.2f) {
                    val = 1.0f;
                }
            }
            else {
                // --- Beach ---
                const float s = (v - beachTop) / beachRange;
                const int bx = (int)(u * 3.7f);
                const int by = (int)(v * 5.1f);
                const float sandHash = PFNoise::cellHash(bx, by);
                val = 0.5f + 0.15f * s + 0.06f * sandHash;

                const float surge = PFMath::fastSin(t * 1.8f) * 0.5f + 0.5f;
                const float edge  = beachTop + 2.0f
                                  + surge * beachRange * 0.55f * (0.4f + waves)
                                  + PFMath::fastSin(u * 0.35f + t * 2.2f) * 2.5f * waves;

                if (v < edge) {
                    const float waterDepth = (edge - v) / beachRange;
                    val = 0.34f - 0.1f * waterDepth;
                    if (edge - v < 1.5f) {
                        val = 0.95f;
                    }
                }
            }

            // clamp and map through baked ramp
            val = fmaxf(0.0f, fminf(1.0f, val));
            int li = (int)(val * 255.0f + 0.5f);
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

} // namespace MidsummerSea

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
