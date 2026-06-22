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

namespace CellularInterferencePattern {

const char* NAME = "Cellular Interference";
const char* const KNOB_LABELS[4] = {"Lattice Scale", "Speed", "Interfere Mode", "Pulse Width"};

const float CELL_INTERFERENCE_SCALE_MIN = 0.0f;
const float CELL_INTERFERENCE_SCALE_MAX = 1.0f;
const float CELL_INTERFERENCE_SCALE_STEP = 0.05f;

const float CELL_INTERFERENCE_SPEED_MIN = 0.1f;
const float CELL_INTERFERENCE_SPEED_MAX = 10.0f;
const float CELL_INTERFERENCE_SPEED_STEP = 0.10f;

const float CELL_INTERFERENCE_MODE_MIN = 0.0f;
const float CELL_INTERFERENCE_MODE_MAX = 4.9f;
const float CELL_INTERFERENCE_MODE_STEP = 0.05f;

const float CELL_INTERFERENCE_PULSE_MIN = 0.0f;
const float CELL_INTERFERENCE_PULSE_MAX = 1.0f;
const float CELL_INTERFERENCE_PULSE_STEP = 0.05f;

struct Params {
    float scale;
    float speed;
    float interfereMode;
    float pulseWidth;
    float timeAcc;
};

Params params;

void setup() {
    PFMath::buildSinLUT();
    params.scale = 0.5f;
    params.speed = 2.0f;
    params.interfereMode = 1.0f;
    params.pulseWidth = 0.5f;
    params.timeAcc = 0.0f;
}

void update(float dt, const InputFrame& input) {
    params.scale += input.knobDeltas[0] * CELL_INTERFERENCE_SCALE_STEP;
    if (params.scale < CELL_INTERFERENCE_SCALE_MIN) params.scale += (CELL_INTERFERENCE_SCALE_MAX - CELL_INTERFERENCE_SCALE_MIN);
    if (params.scale > CELL_INTERFERENCE_SCALE_MAX) params.scale -= (CELL_INTERFERENCE_SCALE_MAX - CELL_INTERFERENCE_SCALE_MIN);

    params.speed += input.knobDeltas[1] * CELL_INTERFERENCE_SPEED_STEP;
    params.speed = constrain(params.speed, CELL_INTERFERENCE_SPEED_MIN, CELL_INTERFERENCE_SPEED_MAX);

    params.interfereMode += input.knobDeltas[2] * CELL_INTERFERENCE_MODE_STEP;
    params.interfereMode = constrain(params.interfereMode, CELL_INTERFERENCE_MODE_MIN, CELL_INTERFERENCE_MODE_MAX);

    params.pulseWidth += input.knobDeltas[3] * CELL_INTERFERENCE_PULSE_STEP;
    if (params.pulseWidth < CELL_INTERFERENCE_PULSE_MIN) params.pulseWidth += (CELL_INTERFERENCE_PULSE_MAX - CELL_INTERFERENCE_PULSE_MIN);
    if (params.pulseWidth > CELL_INTERFERENCE_PULSE_MAX) params.pulseWidth -= (CELL_INTERFERENCE_PULSE_MAX - CELL_INTERFERENCE_PULSE_MIN);

    params.timeAcc += dt * params.speed;
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float t = params.timeAcc;

    float cellSize = 8.0f + (1.0f - params.scale) * 24.0f;
    if (cellSize < 1.0f) cellSize = 1.0f;
    const int iCellSize = (int)cellSize;
    const float halfCell = cellSize * 0.5f;
    
    const int mode = (int)floorf(params.interfereMode);
    const float pw = 0.1f + params.pulseWidth * 0.8f;
    const float invPw = 1.0f / pw;

    for (int y = 0; y < h; y++) {
        const int cellY = y / iCellSize;
        const float ly = (float)(y % iCellSize) - halfCell;
        const float absLy = ly < 0.0f ? -ly : ly;

        for (int x = 0; x < w; x++) {
            const int cellX = x / iCellSize;
            const float lx = (float)(x % iCellSize) - halfCell;
            const float absLx = lx < 0.0f ? -lx : lx;
            
            const float dist = PFMath::approxLength(lx, ly);

            const float phaseA = dist * 0.4f - t;
            float phaseB = 0.0f;

            if (mode == 0) {
                phaseB = (cellX + cellY) * 0.5f + t * 0.5f;
            } else if (mode == 1) {
                phaseB = PFMath::fastSin(cellX * 0.3f + t) * 3.0f + PFMath::fastCos(cellY * 0.3f + t);
            } else if (mode == 2) {
                const float cx = (float)(cellX - 4);
                const float cy = (float)(cellY - 2);
                phaseB = PFMath::approxLength(cx, cy) * 0.8f - t * 0.5f;
            } else {
                phaseB = ((cellX ^ cellY) & 7) * 0.6f;
            }

            const float wave = PFMath::fastSin(phaseA + phaseB);
            const float signal = (wave + 1.0f) * 0.5f;

            uint8_t r = 0, g = 0, b = 0;

            if (signal > 1.0f - pw) {
                const int cellHueInt = (cellX * 13 + cellY * 37) % 100;
                const float cellHue = (float)cellHueInt * 0.01f;
                float localHue = cellHue + wave * 0.15f + 1.0f;
                localHue = localHue - floorf(localHue);
                
                const float intensity = (signal - (1.0f - pw)) * invPw;
                if (intensity > 0.75f) {
                    r = 255; g = 255; b = 255;
                } else {
                    uint8_t cr, cg, cb;
                    PFColor::hsvToRgb(localHue, 0.9f, 1.0f, cr, cg, cb);
                    r = (uint8_t)(cr * intensity);
                    g = (uint8_t)(cg * intensity);
                    b = (uint8_t)(cb * intensity);
                }
            } else if (signal > 0.05f) {
                if (absLx < 0.8f || absLy < 0.8f) {
                    r = 20; g = 10; b = 35;
                }
            }

            PFCanvas::setPixel(x, y, r, g, b);
        }
    }
    PFCanvas::present();
}

} // namespace CellularInterferencePattern