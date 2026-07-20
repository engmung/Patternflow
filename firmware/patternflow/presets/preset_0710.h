#pragma once

// ===== Patternflow pattern =====
// Title:   260710
// Author:  Seunghun LEE
// Date:    2026-07-10
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

#include <Arduino.h>
#include "config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"

namespace TileWaves {

const char* NAME = "TileWaves";
const char* const KNOB_LABELS[4] = {"Quantize", "Speed", "PhaseShift", "Sharpness"};

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {1,0,8},{3,0,17},{4,0,25},{6,0,34},{7,0,42},{9,0,50},{10,0,59},{11,0,67},
  {13,0,76},{14,0,84},{16,0,93},{17,0,101},{19,0,110},{20,0,118},{21,0,127},{23,0,135},
  {24,0,144},{26,0,152},{27,0,161},{29,0,169},{30,0,178},{31,0,186},{33,0,195},{34,0,203},
  {36,0,211},{37,0,220},{39,0,228},{40,0,237},{41,0,245},{43,0,254},{42,2,255},{42,4,255},
  {41,7,255},{41,9,255},{40,11,255},{39,13,255},{39,16,255},{38,18,255},{37,20,255},{37,22,255},
  {36,25,255},{36,27,255},{35,29,255},{34,32,255},{34,34,255},{33,36,255},{32,38,255},{32,41,255},
  {31,43,255},{31,45,255},{30,48,255},{29,50,255},{29,52,255},{28,54,255},{27,57,255},{27,59,255},
  {26,61,255},{26,64,255},{25,66,255},{24,68,255},{24,70,255},{23,73,255},{22,75,255},{22,77,255},
  {21,80,255},{21,82,255},{20,84,255},{19,86,255},{19,89,255},{18,91,255},{17,93,255},{17,95,255},
  {16,98,255},{16,100,255},{15,102,255},{14,105,255},{14,107,255},{13,109,255},{12,111,255},{12,114,255},
  {11,116,255},{11,118,255},{10,121,255},{9,123,255},{9,125,255},{8,127,255},{7,130,255},{7,132,255},
  {6,134,255},{6,137,255},{5,139,255},{4,141,255},{4,143,255},{3,146,255},{2,148,255},{2,150,255},
  {1,152,255},{1,155,255},{0,157,255},{7,153,248},{14,148,241},{21,144,234},{28,140,227},{35,135,220},
  {42,131,213},{49,127,206},{56,122,199},{63,118,192},{70,114,185},{77,110,178},{84,105,171},{91,101,164},
  {98,97,157},{105,92,150},{112,88,143},{119,84,136},{126,79,129},{133,75,122},{140,71,115},{147,67,108},
  {154,62,101},{161,58,94},{168,54,87},{175,49,80},{182,45,73},{189,41,66},{196,36,59},{203,32,52},
  {210,28,45},{217,23,38},{224,19,31},{231,15,24},{238,11,17},{245,6,10},{252,2,3},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
  {255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},{255,0,0},
};

// Knob state initialized to Pattern Lab current values
static float quantizeState = 6.533f;
static float speedState = 7.048f;
static float phaseShiftState = 3.0f;
static float sharpnessState = 1.0f;

// Calibrated steps per detent
static const float TILE_QUANTIZE_STEP = 0.05f;
static const float TILE_SPEED_STEP = 0.1f;
static const float TILE_PHASESHIFT_STEP = 0.05f;
static const float TILE_SHARPNESS_STEP = 0.05f;

// Range limits
static const float TILE_QUANTIZE_MIN = 1.0f;
static const float TILE_QUANTIZE_MAX = 12.0f;
static const float TILE_SPEED_MIN = 0.1f;
static const float TILE_SPEED_MAX = 10.0f;
static const float TILE_PHASESHIFT_MIN = 0.0f;
static const float TILE_PHASESHIFT_MAX = 5.0f;
static const float TILE_SHARPNESS_MIN = 1.0f;
static const float TILE_SHARPNESS_MAX = 10.0f;

static float timeAcc = 0.0f;

// tileSize is fixed at 8; precompute tile centers and distances for all grid cells.
// Grid dimensions: (PANEL_RES_W/8 + 1) x (PANEL_RES_H/8 + 1) — center of panel is (w/2, h/2) in pixel coords.
// We precompute dist for each grid cell once per frame since phaseShift can change,
// but the gridX/gridY → dist mapping is parameter-dependent only via phaseShift multiplier applied later.
// Actually dist itself is parameter-independent (pure geometry), so precompute it in setup.
// gridCols = ceil(PANEL_RES_W / 8.0f), gridRows = ceil(PANEL_RES_H / 8.0f).
// We store dist for each (gridX, gridY) so we don't recalc sqrtf per pixel.

static const int TILE_SIZE = 8;
static int gridCols;
static int gridRows;
static float* gridDist; // size gridCols * gridRows; dist from tile center to panel center

static float cx, cy;

void setup() {
    PFMath::buildSinLUT();

    cx = PANEL_RES_W * 0.5f;
    cy = PANEL_RES_H * 0.5f;
    gridCols = (PANEL_RES_W + TILE_SIZE - 1) / TILE_SIZE;
    gridRows = (PANEL_RES_H + TILE_SIZE - 1) / TILE_SIZE;
    gridDist = new float[gridCols * gridRows];

    float halfTile = TILE_SIZE * 0.5f;
    for (int gy = 0; gy < gridRows; gy++) {
        float ty = gy * TILE_SIZE + halfTile;
        float dy = ty - cy;
        int rowBase = gy * gridCols;
        for (int gx = 0; gx < gridCols; gx++) {
            float tx = gx * TILE_SIZE + halfTile;
            float dx = tx - cx;
            gridDist[rowBase + gx] = sqrtf(dx * dx + dy * dy);
        }
    }
}

void update(float dt, const InputFrame& input) {
    quantizeState += input.knobDeltas[0] * TILE_QUANTIZE_STEP;
    if (quantizeState < TILE_QUANTIZE_MIN) quantizeState = TILE_QUANTIZE_MIN;
    if (quantizeState > TILE_QUANTIZE_MAX) quantizeState = TILE_QUANTIZE_MAX;

    speedState += input.knobDeltas[1] * TILE_SPEED_STEP;
    if (speedState < TILE_SPEED_MIN) speedState = TILE_SPEED_MIN;
    if (speedState > TILE_SPEED_MAX) speedState = TILE_SPEED_MAX;

    phaseShiftState += input.knobDeltas[2] * TILE_PHASESHIFT_STEP;
    if (phaseShiftState < TILE_PHASESHIFT_MIN) phaseShiftState = TILE_PHASESHIFT_MIN;
    if (phaseShiftState > TILE_PHASESHIFT_MAX) phaseShiftState = TILE_PHASESHIFT_MAX;

    sharpnessState += input.knobDeltas[3] * TILE_SHARPNESS_STEP;
    if (sharpnessState < TILE_SHARPNESS_MIN) sharpnessState = TILE_SHARPNESS_MIN;
    if (sharpnessState > TILE_SHARPNESS_MAX) sharpnessState = TILE_SHARPNESS_MAX;

    timeAcc += dt * speedState;
    // timeAcc feeds fastSin with integer multiplier (3.0) and floorf for quantization.
    // Wrap at TWO_PI for the sin use; the quantization floorf operates on the wrapped value
    // but produces the same floorf(localTime/step) since step is fractional and TWO_PI is the
    // period of the underlying sine. The phase offset (dist * phaseShift * 0.08) drifts but is
    // added before floorf. To keep floorf quantization stable we need to preserve the
    // unbounded drift in the offset, but wrapping timeAcc at 2π is correct because
    // sin(theta - 2π*k) == sin(theta) and floorf((theta - 2π*k)/step) differs from
    // floorf(theta/step) by an integer, which sin eliminates. So wrap is safe.
    if (timeAcc > TWO_PI) {
        timeAcc -= TWO_PI;
    } else if (timeAcc < -TWO_PI) {
        timeAcc += TWO_PI;
    }
}

void draw() {
    float t = timeAcc;
    float quantize = quantizeState;
    float phaseShift = phaseShiftState;
    float sharpness = sharpnessState;

    int tileSize = TILE_SIZE;
    int cols = gridCols;
    int rows = gridRows;

    float quantizeStep = 1.0f;
    float invQuantize = 1.0f;
    if (quantize > 1.0f) {
        quantizeStep = 1.0f / quantize;
        invQuantize = quantize;
    }

    for (int y = 0; y < PANEL_RES_H; y++) {
        int gridY = y / tileSize;
        int rowBase = gridY * cols;

        // tile border check: top edge of tile
        bool borderY = (y % tileSize == 0);

        for (int x = 0; x < PANEL_RES_W; x++) {
            int gridX = x / tileSize;
            float dist = gridDist[rowBase + gridX];

            // Phase-delayed, time-quantized motion
            float localTime = t - dist * phaseShift * 0.08f;
            if (quantize > 1.0f) {
                localTime = floorf(localTime * invQuantize) * quantizeStep;
            }

            // Concentric tile waves
            float wave = PFMath::fastSin(dist * 0.25f - localTime * 3.0f);
            float val = (wave + 1.0f) * 0.5f;

            // Sharpness power scaling
            if (val > 0.0f) {
                val = PFMath::fastPow(val, sharpness);
            }

            // Tile frame borders
            if (borderY || (x % tileSize == 0)) {
                val = 0.0f;
            }

            // Clamp
            if (val < 0.0f) val = 0.0f;
            if (val > 1.0f) val = 1.0f;

            int li = (int)(val * 255.0f + 0.5f);
            PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
        }
    }

    PFCanvas::present();
}

} // namespace TileWaves

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
