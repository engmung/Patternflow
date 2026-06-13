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

namespace AttractorParticleFlowPattern {
    const char* NAME = "Attractor Flow";
    const char* const KNOB_LABELS[4] = {"Curl Force", "Velocity", "Gravity", "Stream Depth"};

    const float ATTRACTOR_FLOW_CURL_MIN = 0.0f;
    const float ATTRACTOR_FLOW_CURL_MAX = 1.0f;
    const float ATTRACTOR_FLOW_CURL_STEP = 0.05f;

    const float ATTRACTOR_FLOW_SPEED_MIN = 0.1f;
    const float ATTRACTOR_FLOW_SPEED_MAX = 10.0f;
    const float ATTRACTOR_FLOW_SPEED_STEP = 0.10f;

    const float ATTRACTOR_FLOW_GRAVITY_MIN = 0.0f;
    const float ATTRACTOR_FLOW_GRAVITY_MAX = 4.9f;
    const float ATTRACTOR_FLOW_GRAVITY_STEP = 0.05f;

    const float ATTRACTOR_FLOW_COLOR_MIN = 0.0f;
    const float ATTRACTOR_FLOW_COLOR_MAX = 1.0f;
    const float ATTRACTOR_FLOW_COLOR_STEP = 0.05f;

    struct Params {
        float curl;
        float speed;
        float gravity;
        float colorDepth;
        float timeAcc;
    };

    Params params;

    void setup() {
        PFMath::buildSinLUT();
        params.curl = 0.2f;
        params.speed = 1.0f;
        params.gravity = 1.5f;
        params.colorDepth = 0.5f;
        params.timeAcc = 0.0f;
    }

    void update(float dt, const InputFrame& input) {
        // Knob 1: Vortex Curl Force (Wrap)
        params.curl += input.knobDeltas[0] * ATTRACTOR_FLOW_CURL_STEP;
        while (params.curl < ATTRACTOR_FLOW_CURL_MIN) params.curl += 1.0f;
        while (params.curl > ATTRACTOR_FLOW_CURL_MAX) params.curl -= 1.0f;

        // Knob 2: Velocity Multiplier (Clamp)
        params.speed = constrain(params.speed + input.knobDeltas[1] * ATTRACTOR_FLOW_SPEED_STEP, ATTRACTOR_FLOW_SPEED_MIN, ATTRACTOR_FLOW_SPEED_MAX);

        // Knob 3: Gravity Field Clumping (Clamp)
        params.gravity = constrain(params.gravity + input.knobDeltas[2] * ATTRACTOR_FLOW_GRAVITY_STEP, ATTRACTOR_FLOW_GRAVITY_MIN, ATTRACTOR_FLOW_GRAVITY_MAX);

        // Knob 4: Color Stream Depth (Wrap)
        params.colorDepth += input.knobDeltas[3] * ATTRACTOR_FLOW_COLOR_STEP;
        while (params.colorDepth < ATTRACTOR_FLOW_COLOR_MIN) params.colorDepth += 1.0f;
        while (params.colorDepth > ATTRACTOR_FLOW_COLOR_MAX) params.colorDepth -= 1.0f;

        params.timeAcc += dt * params.speed;
    }

    void draw() {
        float t = params.timeAcc;
        float cx = PANEL_RES_W / 2.0f;
        float cy = PANEL_RES_H / 2.0f;
        const int stepSize = 4;

        // Optimize execution by evaluating block coordinates directly in steps of 4
        for (int by = 0; by < PANEL_RES_H; by += stepSize) {
            float dy = (float)by - cy;

            for (int bx = 0; bx < PANEL_RES_W; bx += stepSize) {
                float dx = (float)bx - cx;

                float r = PFMath::approxLength(dx, dy) + 0.1f;
                float angleBase = atan2f(dy, dx);
                
                float forceField = PFMath::fastSin(r * 0.1f - t) * params.gravity;
                float rotationalCurl = angleBase + (params.curl * 8.0f) * PFMath::fastCos(r * 0.05f - t * 0.5f);

                float streamX = (float)bx + PFMath::fastCos(rotationalCurl) * forceField * 10.0f;
                float streamY = (float)by + PFMath::fastSin(rotationalCurl) * forceField * 10.0f;

                float noiseVal = PFMath::fastSin(streamX * 0.08f) * PFMath::fastCos(streamY * 0.12f + t);
                float finalVal = (noiseVal + 1.0f) * 0.5f;

                uint8_t baseRed = 0, baseGreen = 0, baseBlue = 0;

                if (finalVal > 0.4f) {
                    float streamHue = fmodf(fabsf(streamX + streamY) * 0.002f + params.colorDepth + t * 0.02f, 1.0f);
                    if (streamHue < 0.0f) streamHue += 1.0f;
                    
                    float v_val = finalVal * finalVal;
                    PFColor::hsvToRgb(streamHue, 0.9f, v_val, baseRed, baseGreen, baseBlue);
                }

                if (finalVal > 0.85f) {
                    baseRed = 255; 
                    baseGreen = 255; 
                    baseBlue = 255;
                }

                // Fill the 4x4 matrix block with cached calculation
                for (int ty = 0; ty < stepSize && (by + ty) < PANEL_RES_H; ty++) {
                    int y = by + ty;
                    uint8_t red = baseRed;
                    uint8_t green = baseGreen;
                    uint8_t blue = baseBlue;

                    if (ty == 0 && finalVal > 0.3f) {
                        red = (uint8_t)constrain(red + 40, 0, 255);
                        green = (uint8_t)constrain(green + 40, 0, 255);
                    }

                    for (int tx = 0; tx < stepSize && (bx + tx) < PANEL_RES_W; tx++) {
                        int x = bx + tx;
                        PFCanvas::setPixel(x, y, red, green, blue);
                    }
                }
            }
        }

        PFCanvas::present();
    }
} // namespace AttractorParticleFlowPattern