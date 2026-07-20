#pragma once
#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_noise.h"

namespace BinaryCascade {

const char* NAME = "Binary Cascade";
const char* const KNOB_LABELS[4] = {"Color Shift", "Speed", "Block Length", "Lane Chaos"};

static float s_colorShift = 0.2f;
static float s_speed = 3.0f;
static float s_blockLength = 2.0f;
static float s_chaos = 0.3f;
static float s_timeAcc = 0.0f;

// Per-lane random data (128 lanes for 256-pixel max width with laneWidth=2)
static constexpr int MAX_LANES = (PANEL_RES_W + 1) / 2;
static float s_laneOffsets[MAX_LANES];
static float s_laneSpeedMults[MAX_LANES];
static bool s_laneDataInit = false;

void setup() {
    PFMath::buildSinLUT();
    // Initialize lane data once
    if (!s_laneDataInit) {
        for (int i = 0; i < MAX_LANES; ++i) {
            s_laneOffsets[i]    = PFNoise::cellHash(i, 0, 42) * 100.0f;
            s_laneSpeedMults[i] = 0.5f + PFNoise::cellHash(i, 1, 137) * 1.5f;
        }
        s_laneDataInit = true;
    }
}

void update(float dt, const InputFrame& input) {
    s_colorShift += input.knobDeltas[0] * 0.05f;
    s_speed      += input.knobDeltas[1] * 0.1f;
    s_blockLength += input.knobDeltas[2] * 0.05f;
    s_chaos      += input.knobDeltas[3] * 0.05f;

    s_colorShift = fmaxf(0.0f, fminf(1.0f, s_colorShift));
    s_speed      = fmaxf(-5.0f, fminf(5.0f, s_speed));
    s_blockLength = fmaxf(0.1f, fminf(6.0f, s_blockLength));
    s_chaos      = fmaxf(0.0f, fminf(1.0f, s_chaos));

    // No buttons used in JS → no reset logic

    s_timeAcc += dt * s_speed;
    // Time feeds laneSpeed * 20 (float multiplier, not integer). Common period: TWO_PI works if all multipliers are integer,
    // but here multiplier is 20.0 * (1.0 + (speedMult-1)*chaos) — not integer. Wrap at a large common period.
    // Use 1000π as a safe wrap period (all multiples divide evenly enough for visual continuity).
    const float PERIOD = 1000.0f * PI;
    if (s_timeAcc > PERIOD)  s_timeAcc -= PERIOD;
    if (s_timeAcc < 0.0f)    s_timeAcc += PERIOD;
}

void draw() {
    const float t = s_timeAcc;
    const float blockLen = 4.0f + s_blockLength * 8.0f;
    const float blockLen2 = blockLen * 2.0f;
    const int laneWidth = 2;

    for (int x = 0; x < PANEL_RES_W; ++x) {
        const int laneIdx = x / laneWidth;
        if (laneIdx >= MAX_LANES) continue;

        const float speedMult = s_laneSpeedMults[laneIdx];
        const float laneSpeed = t * (1.0f + (speedMult - 1.0f) * s_chaos);
        const float yOffset = s_laneOffsets[laneIdx] + laneSpeed * 20.0f;

        const bool isDivider = (x % laneWidth) == (laneWidth - 1);

        for (int y = 0; y < PANEL_RES_H; ++y) {
            if (isDivider) {
                PFCanvas::setPixel(x, y, 10, 10, 15);
                continue;
            }

            const float activeY = fmodf((float)y + yOffset, blockLen2);
            const bool isBlock = (activeY < blockLen);

            uint8_t r = 0, g = 0, b = 0;

            if (isBlock) {
                const float normY = activeY / blockLen; // 0..1 within block

                if (s_colorShift < 0.2f) {
                    // Monochrome
                    const uint8_t br = (uint8_t)(150.0f + normY * 105.0f);
                    r = br; g = br; b = br;
                } else if (s_colorShift < 0.6f) {
                    // Matrix Green
                    r = 0;
                    g = (uint8_t)(180.0f + normY * 75.0f);
                    b = (uint8_t)(50.0f + (1.0f - normY) * 100.0f);
                } else {
                    // Vaporwave
                    if (speedMult > 1.0f) {
                        r = 255; g = 50; b = 200;
                    } else {
                        r = 50; g = 200; b = 255;
                    }
                }

                // Hard-edge sparkle/glitch at block edges
                if (activeY < 1.0f || activeY > blockLen - 1.0f) {
                    r = 255; g = 255; b = 255;
                }
            } else {
                r = 0; g = 0; b = 0;
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }

    PFCanvas::present();
}

} // namespace BinaryCascade