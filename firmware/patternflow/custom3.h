#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace KineticRipplePattern {

const char* NAME = "Kinetic Ripple";
const char* const KNOB_LABELS[4] = {"CENTERS", "SPEED", "TIME WARP", "DENSITY"};

const float KINETIC_RIPPLE_WAVES_MIN = 1.0f;
const float KINETIC_RIPPLE_WAVES_MAX = 6.0f;
const float KINETIC_RIPPLE_WAVES_STEP = 0.05f;

const float KINETIC_RIPPLE_SPEED_MIN = 0.1f;
const float KINETIC_RIPPLE_SPEED_MAX = 8.0f;
const float KINETIC_RIPPLE_SPEED_STEP = 0.10f;

const float KINETIC_RIPPLE_WARP_MIN = 0.2f;
const float KINETIC_RIPPLE_WARP_MAX = 3.0f;
const float KINETIC_RIPPLE_WARP_STEP = 0.05f;

const float KINETIC_RIPPLE_COMPLEXITY_MIN = 1.0f;
const float KINETIC_RIPPLE_COMPLEXITY_MAX = 5.0f;
const float KINETIC_RIPPLE_COMPLEXITY_STEP = 0.05f;

struct Params {
    float waves;
    float speed;
    float timeWarp;
    float complexity;
    float timeAcc;
};

Params params;

void setup() {
    params.waves = 3.0f;
    params.speed = 1.5f;
    params.timeWarp = 1.0f;
    params.complexity = 2.0f;
    params.timeAcc = 0.0f;

    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    params.waves = constrain(params.waves + input.knobDeltas[0] * KINETIC_RIPPLE_WAVES_STEP, KINETIC_RIPPLE_WAVES_MIN, KINETIC_RIPPLE_WAVES_MAX);
    params.speed = constrain(params.speed + input.knobDeltas[1] * KINETIC_RIPPLE_SPEED_STEP, KINETIC_RIPPLE_SPEED_MIN, KINETIC_RIPPLE_SPEED_MAX);
    params.timeWarp = constrain(params.timeWarp + input.knobDeltas[2] * KINETIC_RIPPLE_WARP_STEP, KINETIC_RIPPLE_WARP_MIN, KINETIC_RIPPLE_WARP_MAX);
    params.complexity = constrain(params.complexity + input.knobDeltas[3] * KINETIC_RIPPLE_COMPLEXITY_STEP, KINETIC_RIPPLE_COMPLEXITY_MIN, KINETIC_RIPPLE_COMPLEXITY_MAX);

    params.timeAcc += dt * params.speed;
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float t = params.timeAcc;

    const int centers = (int)floorf(params.waves);
    const float warp = params.timeWarp;
    const float dens = params.complexity;

    const float cx1 = (float)w * 0.5f + PFMath::fastCos(t * 0.7f) * ((float)w * 0.25f);
    const float cy1 = (float)h * 0.5f + PFMath::fastSin(t * 1.1f) * ((float)h * 0.25f);
    const float cx2 = (float)w * 0.5f - PFMath::fastSin(t * 0.9f) * ((float)w * 0.3f);
    const float cy2 = (float)h * 0.5f + PFMath::fastCos(t * 0.6f) * ((float)h * 0.2f);

    const float d1_freq = 0.1f * dens;
    const float d2_freq = 0.08f * dens;
    const float t_offset1 = -t * 2.5f;
    const float t_offset2 = -t * 1.8f;

    for (int y = 0; y < h; y++) {
        const float dy1 = (float)y - cy1;
        const float dy2 = (float)y - cy2;

        for (int x = 0; x < w; x++) {
            const float dx1 = (float)x - cx1;
            const float dist1 = PFMath::approxLength(dx1, dy1);
            
            float tWarp1;
            if (warp == 1.0f) {
                tWarp1 = (dist1 * 0.02f) + t_offset1;
            } else if (warp == 2.0f) {
                float d1_scaled = dist1 * 0.02f;
                tWarp1 = (d1_scaled * d1_scaled) + t_offset1;
            } else {
                tWarp1 = powf(dist1 * 0.02f, warp) + t_offset1;
            }
            const float v1 = PFMath::fastSin(dist1 * d1_freq + tWarp1);

            float finalWave = v1;

            if (centers > 1) {
                const float dx2 = (float)x - cx2;
                const float dist2 = PFMath::approxLength(dx2, dy2);
                
                float tWarp2;
                if (warp == 1.0f) {
                    tWarp2 = (dist2 * 0.02f) + t_offset2;
                } else if (warp == 2.0f) {
                    float d2_scaled = dist2 * 0.02f;
                    tWarp2 = (d2_scaled * d2_scaled) + t_offset2;
                } else {
                    tWarp2 = powf(dist2 * 0.02f, warp) + t_offset2;
                }
                const float v2 = PFMath::fastCos(dist2 * d2_freq + tWarp2);

                if (centers == 2) {
                    finalWave = (v1 + v2) * 0.5f;
                } else {
                    finalWave = fabsf(v1 * v2);
                }
            }

            float v = (finalWave + 1.0f) * 0.5f;
            
            float bright;
            if (v > 0.8f)       bright = 1.0f;
            else if (v > 0.5f)  bright = 0.6f;
            else if (v > 0.2f)  bright = 0.25f;
            else                bright = 0.05f;

            // Amplify brightness dynamically to reach near-full intensity on a HUB75 LED Matrix
            float amplified = constrain(bright * 1.15f, 0.0f, 1.0f);
            uint8_t c = (uint8_t)(amplified * 255.0f);

            PFCanvas::setPixel(x, y, c, c, c);
        }
    }

    PFCanvas::present();
}

} // namespace KineticRipplePattern