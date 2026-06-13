#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace MoltenMagmaPattern {
    const char* NAME = "Molten Magma";
    const char* const KNOB_LABELS[4] = {"Viscosity", "Flow Speed", "Expansion", "Crust Fracture"};

    const float MOLTEN_MAGMA_VISCOSITY_MIN = 0.0f;
    const float MOLTEN_MAGMA_VISCOSITY_MAX = 1.0f;
    const float MOLTEN_MAGMA_VISCOSITY_STEP = 0.05f;

    const float MOLTEN_MAGMA_SPEED_MIN = 0.1f;
    const float MOLTEN_MAGMA_SPEED_MAX = 10.0f;
    const float MOLTEN_MAGMA_SPEED_STEP = 0.10f;

    const float MOLTEN_MAGMA_EXPANSION_MIN = 0.0f;
    const float MOLTEN_MAGMA_EXPANSION_MAX = 4.9f;
    const float MOLTEN_MAGMA_EXPANSION_STEP = 0.05f;

    const float MOLTEN_MAGMA_CRUST_MIN = 0.0f;
    const float MOLTEN_MAGMA_CRUST_MAX = 1.0f;
    const float MOLTEN_MAGMA_CRUST_STEP = 0.05f;

    struct Params {
        float viscosity;
        float speed;
        float expansion;
        float crust;
        float timeAcc;
    };

    Params params;

    void setup() {
        PFMath::buildSinLUT();
        params.viscosity = 0.5f;
        params.speed = 2.0f;
        params.expansion = 2.0f;
        params.crust = 0.4f;
        params.timeAcc = 0.0f;
    }

    void update(float dt, const InputFrame& input) {
        // Knob 1: Thermal Fluid Viscosity (Wrap)
        params.viscosity += input.knobDeltas[0] * MOLTEN_MAGMA_VISCOSITY_STEP;
        while (params.viscosity < MOLTEN_MAGMA_VISCOSITY_MIN) params.viscosity += 1.0f;
        while (params.viscosity > MOLTEN_MAGMA_VISCOSITY_MAX) params.viscosity -= 1.0f;

        // Knob 2: Boiling Flow Speed (Clamp)
        params.speed = constrain(params.speed + input.knobDeltas[1] * MOLTEN_MAGMA_SPEED_STEP, MOLTEN_MAGMA_SPEED_MIN, MOLTEN_MAGMA_SPEED_MAX);

        // Knob 3: Hotspot Core Expansion (Clamp)
        params.expansion = constrain(params.expansion + input.knobDeltas[2] * MOLTEN_MAGMA_EXPANSION_STEP, MOLTEN_MAGMA_EXPANSION_MIN, MOLTEN_MAGMA_EXPANSION_MAX);

        // Knob 4: Cool Crust Fracturing (Wrap)
        params.crust += input.knobDeltas[3] * MOLTEN_MAGMA_CRUST_STEP;
        while (params.crust < MOLTEN_MAGMA_CRUST_MIN) params.crust += 1.0f;
        while (params.crust > MOLTEN_MAGMA_CRUST_MAX) params.crust -= 1.0f;

        params.timeAcc += dt * params.speed;
    }

    void draw() {
        int w = PANEL_RES_W;
        int h = PANEL_RES_H;
        float t = params.timeAcc;

        float visc = 0.02f + params.viscosity * 0.08f;
        float coreShift = params.expansion - 2.5f;

        float hw = (float)w / 2.0f;
        float hh = (float)h / 2.0f;

        for (int y = 0; y < h; y++) {
            float dy = (float)y - hh;
            
            // Precompute row-only wave and warp components
            float cos_y_n1 = PFMath::fastCos((float)y * visc - t);
            float sin_y_n2 = PFMath::fastSin(dy * 0.05f + t * 0.6f);
            float cos_y_crack = PFMath::fastCos((float)y * 1.5f);

            for (int x = 0; x < w; x++) {
                float dx = (float)x - hw;

                // Combine wave layers utilizing fast math helpers
                float n1 = PFMath::fastSin((float)x * visc + t) * cos_y_n1;
                float n2 = PFMath::fastSin(dx * 0.05f - t * 0.4f) * sin_y_n2;
                float n3 = PFMath::fastCos(PFMath::approxLength(dx, dy) * 0.1f - t * 1.5f);

                float heatSum = (n1 + n2 * 0.7f + n3 * 0.5f) / 2.2f;
                heatSum = heatSum + coreShift * 0.3f;
                
                float temp = constrain((heatSum + 1.0f) * 0.5f, 0.0f, 1.0f);

                int r = 0, g = 0, b = 0;

                // Color mapping execution
                if (temp > 0.85f) {
                    r = 255; g = 255; b = 230;
                } else if (temp > 0.65f) {
                    r = 255; 
                    g = constrain(180 + (int)((temp - 0.65f) * 375.0f), 0, 255); 
                    b = 20;
                } else if (temp > 0.4f) {
                    r = 220; 
                    g = constrain((int)((temp - 0.4f) * 700.0f), 0, 255); 
                    b = 5;
                } else if (temp > 0.18f) {
                    r = constrain(40 + (int)((temp - 0.18f) * 800.0f), 0, 255); 
                    g = 0; b = 0;
                } else {
                    r = 10; g = 5; b = 15;
                }

                // Cool surface fractures simulation
                if (params.crust > 0.05f) {
                    float crackPattern = PFMath::fastSin((float)x * 1.5f) * cos_y_crack;
                    if (crackPattern > (1.0f - params.crust) && temp < 0.6f) {
                        r = (int)((float)r * 0.15f);
                        g = 0;
                        b = (int)((float)b * 0.1f);
                    }
                }

                PFCanvas::setPixel(x, y, (uint8_t)r, (uint8_t)g, (uint8_t)b);
            }
        }

        PFCanvas::present();
    }
} // namespace MoltenMagmaPattern