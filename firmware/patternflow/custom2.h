#pragma once

#include <Arduino.h>
#include <math.h>
#include <stdint.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace GridFracturePattern {

const char* NAME = "Grid Fracture";
const char* const KNOB_LABELS[4] = {"ROWS", "SPEED", "GRID SIZE", "SHARPEN"};

const float GRID_FRACTURE_ROWS_MIN = 1.0f;
const float GRID_FRACTURE_ROWS_MAX = 8.0f;
const float GRID_FRACTURE_ROWS_STEP = 0.05f;

const float GRID_FRACTURE_SPEED_MIN = 0.1f;
const float GRID_FRACTURE_SPEED_MAX = 5.0f;
const float GRID_FRACTURE_SPEED_STEP = 0.10f;

const float GRID_FRACTURE_GRIDSIZE_MIN = 4.0f;
const float GRID_FRACTURE_GRIDSIZE_MAX = 24.0f;
const float GRID_FRACTURE_GRIDSIZE_STEP = 0.05f;

const float GRID_FRACTURE_SHARPEN_MIN = 1.0f;
const float GRID_FRACTURE_SHARPEN_MAX = 10.0f;
const float GRID_FRACTURE_SHARPEN_STEP = 0.05f;

struct Params {
    float rows;
    float speed;
    float gridSize;
    float sharpen;
    float timeAcc;
};

Params params;

void setup() {
    params.rows = 3.0f;
    params.speed = 2.0f;
    params.gridSize = 12.0f;
    params.sharpen = 4.0f;
    params.timeAcc = 0.0f;
    
    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    params.rows = constrain(params.rows + input.knobDeltas[0] * GRID_FRACTURE_ROWS_STEP, GRID_FRACTURE_ROWS_MIN, GRID_FRACTURE_ROWS_MAX);
    params.speed = constrain(params.speed + input.knobDeltas[1] * GRID_FRACTURE_SPEED_STEP, GRID_FRACTURE_SPEED_MIN, GRID_FRACTURE_SPEED_MAX);
    params.gridSize = constrain(params.gridSize + input.knobDeltas[2] * GRID_FRACTURE_GRIDSIZE_STEP, GRID_FRACTURE_GRIDSIZE_MIN, GRID_FRACTURE_GRIDSIZE_MAX);
    params.sharpen = constrain(params.sharpen + input.knobDeltas[3] * GRID_FRACTURE_SHARPEN_STEP, GRID_FRACTURE_SHARPEN_MIN, GRID_FRACTURE_SHARPEN_MAX);

    params.timeAcc += dt * params.speed;
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float t = params.timeAcc;

    const int rowCount = (int)floorf(params.rows);
    const int cellSize = (int)floorf(params.gridSize);
    const float sharp = params.sharpen;
    
    if (cellSize <= 0) return;

    for (int y = 0; y < h; y++) {
        const int bandIdx = (y * rowCount) / h;
        const float bandPhase = (float)bandIdx * 1.5f;
        
        const float xOffset = PFMath::fastSin(t + bandPhase) * 10.0f;

        for (int x = 0; x < w; x++) {
            float targetX = fmodf((float)x + xOffset + (float)w, (float)w);
            if (targetX < 0.0f) targetX += (float)w;

            const int blockX = (int)floorf(targetX / (float)cellSize);
            const int blockY = y / cellSize;

            const float cx = ((float)blockX + 0.5f) * (float)cellSize;
            const float cy = ((float)blockY + 0.5f) * (float)cellSize;
            const float dx = targetX - cx;
            const float dy = (float)y - cy;
            const float dist = PFMath::approxLength(dx, dy);

            const float waveFreq = 0.2f + 0.1f * PFMath::fastSin((float)blockX * 0.5f + (float)blockY * 0.3f);
            const float wave = PFMath::fastSin(dist * waveFreq - t * 3.0f + (float)(blockX + blockY));

            float v = (wave + 1.0f) * 0.5f;
            v = powf(v, sharp);

            const int borderX = (int)floorf(targetX) % cellSize;
            const int borderY = y % cellSize;
            if (borderX == 0 || borderY == 0 || borderX == cellSize - 1 || borderY == cellSize - 1) {
                v *= 0.1f;
            }

            v = constrain(0.05f + v * 1.2f, 0.0f, 1.0f);
            uint8_t c = (uint8_t)(v * 255.0f);

            PFCanvas::setPixel(x, y, c, c, c);
        }
    }

    PFCanvas::present();
}

} // namespace GridFracturePattern

