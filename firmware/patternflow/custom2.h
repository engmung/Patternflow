#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_tables.h"

namespace KaleidoscopeBlocks {

const char* NAME = "KaleidoBlocks";
const char* const KNOB_LABELS[4] = {"Segments", "Speed", "Rings", "Morph"};

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
static float segmentsState = 20.0f;
static float speedState = 3.693f;
static float ringsState = 12.659f;
static float morphState = 1.642f;

// Calibrated steps per detent
static const float SEGMENTS_STEP = 0.05f;
static const float SPEED_STEP1 = 0.1f;
static const float RINGS_STEP = 0.05f;
static const float MORPH_STEP = 0.05f;

// Range limits
static const float SEGMENTS_MIN = 2.0f;
static const float SEGMENTS_MAX = 20.0f;
static const float SPEED_MIN = -9.9f;
static const float SPEED_MAX = 10.0f;
static const float RINGS_MIN = 3.0f;
static const float RINGS_MAX = 20.0f;
static const float MORPH_MIN = 0.0f;
static const float MORPH_MAX = 3.0f;

static float timeAcc = 0.0f;

void setup() {
    PFMath::buildSinLUT();
    PFTables::init();
}

void update(float dt, const InputFrame& input) {
    segmentsState += input.knobDeltas[0] * SEGMENTS_STEP;
    if (segmentsState < SEGMENTS_MIN) segmentsState = SEGMENTS_MIN;
    if (segmentsState > SEGMENTS_MAX) segmentsState = SEGMENTS_MAX;

    speedState += input.knobDeltas[1] * SPEED_STEP1;
    if (speedState < SPEED_MIN) speedState = SPEED_MIN;
    if (speedState > SPEED_MAX) speedState = SPEED_MAX;

    ringsState += input.knobDeltas[2] * RINGS_STEP;
    if (ringsState < RINGS_MIN) ringsState = RINGS_MIN;
    if (ringsState > RINGS_MAX) ringsState = RINGS_MAX;

    morphState += input.knobDeltas[3] * MORPH_STEP;
    if (morphState < MORPH_MIN) morphState = MORPH_MIN;
    if (morphState > MORPH_MAX) morphState = MORPH_MAX;

    timeAcc += dt * speedState;
    // Wrap timeAcc at TWO_PI. Since morphFactor uses 0.5 multiplier, and wave uses integer
    // multipliers (phase is integer multiples of PI), wrapping at TWO_PI is safe for all
    // uses: fastSin/cos of timeAcc and timeAcc*0.5 both wrap cleanly at 2π.
    if (timeAcc > TWO_PI) {
        timeAcc -= TWO_PI;
    } else if (timeAcc < -TWO_PI) {
        timeAcc += TWO_PI;
    }
}

void draw() {
    float t = timeAcc;
    float segments = segmentsState;
    float rings = ringsState;
    float morph = morphState;

    float angleStep = TWO_PI / segments;
    float angularMult = segments * 2.0f;
    float invAngularMult = 1.0f / angularMult;

    for (int y = 0; y < PANEL_RES_H; y++) {
        int rowBase = y * PANEL_RES_W;
        for (int x = 0; x < PANEL_RES_W; x++) {
            int i = rowBase + x;
            float r = PFTables::rT[i];          // 0 at center, 0.5 at top/bottom edge
            float angle = PFTables::thetaT[i] + PI;  // shift to 0..TWO_PI

            // Kaleidoscopic segment mirroring
            float segFrac = angle / angleStep;
            int segment = (int)segFrac;
            float localAngle = angle - segment * angleStep;
            if (segment & 1) {
                localAngle = angleStep - localAngle;
            }

            // Structural quantization
            float radialStep = floorf(r * 2.0f * rings) / rings;  // r is 0..0.5, so scale by 2 to get 0..1
            float angularStep = floorf(localAngle * angularMult) * invAngularMult;

            // Concentric wave phase
            float phase = radialStep * PI * 6.0f + t;
            float morphFactor = PFMath::fastSin(angularStep * 4.0f + t * 0.5f) * morph;
            float wave = PFMath::fastSin(phase + morphFactor * PI);

            // 0..1 value with contrast
            float val = (wave + 1.0f) * 0.5f;
            // pow(val, 1.5) — use fastPow
            if (val > 0.0f) {
                val = PFMath::fastPow(val, 1.5f);
            }

            // Grid line borders
            float borderR = PFMath::fract(r * 2.0f * rings);
            float borderA = PFMath::fract(localAngle * angularMult);
            if (borderR < 0.1f || borderA < 0.1f) {
                val *= 0.2f;
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

} // namespace KaleidoscopeBlocks