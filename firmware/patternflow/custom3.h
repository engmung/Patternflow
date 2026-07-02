#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"   // PFMath::fastSin, PFMath::fract

namespace CellsDifferencePattern {

const char* NAME = "Cells Diff";
const char* const KNOB_LABELS[4] = {"Scale1", "Speed", "Contrast", "Scale2"};

// ---- knob ranges and step ----
static constexpr float KNOB1_MIN = 0.0f;
static constexpr float KNOB1_MAX = 20.0f;
static constexpr float KNOB1_STEP = 0.05f;
static constexpr float KNOB2_MIN = 0.1f;
static constexpr float KNOB2_MAX = 10.0f;
static constexpr float KNOB2_STEP = 0.1f;
static constexpr float KNOB3_MIN = 0.0f;
static constexpr float KNOB3_MAX = 4.9f;
static constexpr float KNOB3_STEP = 0.05f;
static constexpr float KNOB4_MIN = 1.0f;
static constexpr float KNOB4_MAX = 30.0f;
static constexpr float KNOB4_STEP = 0.05f;

// ---- state ----
float knob1 = 11.906f;
float knob2 = 1.589f;
float knob3 = 0.89f;
float knob4 = 11.964f;
float t = 0.0f;

// ---- constants for rotation ----
static constexpr float PI = 3.141592653589793f;
static constexpr float TWO_PI = 6.283185307179586f;
static constexpr float DEG_58 = 58.0f * PI / 180.0f;
float ca0, sa0;

// ---- hash2 ----
static inline float hash2(float x, float y) {
    return PFMath::fract(PFMath::fastSin(x * 127.1f + y * 311.7f) * 43758.5453f);
}

// ---- baked color ramp ----
static const uint8_t RAMP_LUT[256][3] = {
  {255,255,255},{221,221,221},{186,186,186},{152,152,152},{117,117,117},{83,83,83},{48,48,48},{14,14,14},
  {1,0,2},{2,0,6},{3,0,10},{4,0,14},{5,0,18},{6,0,22},{7,0,26},{8,0,30},
  {9,0,34},{10,0,38},{11,0,42},{12,0,46},{13,0,49},{14,0,53},{15,0,57},{16,0,61},
  {17,0,65},{18,0,69},{19,0,73},{21,0,77},{22,0,81},{23,0,85},{24,0,89},{25,0,93},
  {26,0,96},{27,0,100},{28,0,104},{29,0,108},{30,0,112},{31,0,116},{32,0,120},{33,0,124},
  {34,0,128},{35,0,132},{36,0,136},{37,0,140},{38,0,144},{39,0,147},{40,0,151},{41,0,155},
  {42,0,159},{44,0,163},{45,0,167},{46,0,171},{47,0,175},{48,0,179},{49,0,183},{50,0,187},
  {51,0,191},{52,0,195},{53,0,198},{54,0,202},{55,0,206},{56,0,210},{57,0,214},{58,0,218},
  {59,0,222},{60,0,226},{61,0,230},{62,0,234},{63,0,238},{64,0,242},{65,0,246},{67,0,249},
  {68,0,253},{71,1,252},{75,2,247},{79,3,242},{84,4,237},{88,5,232},{93,6,227},{97,7,222},
  {101,8,217},{106,9,212},{110,10,207},{114,10,202},{119,11,197},{123,12,192},{128,13,187},{132,14,182},
  {136,15,177},{141,16,172},{145,17,167},{150,18,162},{154,19,156},{158,20,151},{163,21,146},{167,22,141},
  {172,23,136},{176,24,131},{180,25,126},{185,26,121},{189,27,116},{194,28,111},{198,29,106},{202,30,101},
  {207,31,96},{211,32,91},{216,33,86},{220,34,81},{224,35,76},{229,36,71},{233,37,66},{238,38,61},
  {242,39,56},{246,40,51},{251,41,46},{254,43,43},{254,48,45},{254,52,48},{254,57,51},{254,61,53},
  {254,66,56},{254,70,59},{254,75,61},{254,79,64},{254,84,66},{254,88,69},{254,92,72},{254,97,74},
  {254,101,77},{254,106,80},{254,110,82},{254,115,85},{254,119,88},{254,124,90},{254,128,93},{254,133,96},
  {254,137,98},{250,135,96},{246,133,95},{242,131,93},{238,129,92},{235,127,91},{231,124,89},{227,122,88},
  {223,120,86},{219,118,85},{216,116,83},{212,114,82},{208,112,80},{204,110,79},{200,108,77},{196,106,76},
  {193,104,74},{189,102,73},{185,100,71},{181,98,70},{177,96,68},{174,94,67},{170,92,65},{166,89,64},
  {162,87,63},{158,85,61},{154,83,60},{151,81,58},{147,79,57},{143,77,55},{139,75,54},{135,73,52},
  {132,71,51},{128,69,49},{124,67,48},{120,65,46},{116,63,45},{112,61,43},{109,59,42},{105,57,40},
  {101,54,39},{97,52,38},{93,50,36},{90,48,35},{86,46,33},{82,44,32},{78,42,30},{74,40,29},
  {70,38,27},{67,36,26},{63,34,24},{59,32,23},{55,30,21},{51,28,20},{48,26,18},{44,24,17},
  {40,22,15},{36,19,14},{32,17,12},{29,15,11},{25,13,10},{21,11,8},{17,9,7},{13,7,5},
  {9,5,4},{6,3,2},{2,1,1},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
};

// ---- interface ----
void setup() {
    PFMath::buildSinLUT();
    ca0 = cosf(DEG_58);
    sa0 = sinf(DEG_58);
}

void update(float dt, const InputFrame& input) {
    knob1 += input.knobDeltas[0] * KNOB1_STEP;
    if (knob1 < KNOB1_MIN) knob1 = KNOB1_MIN;
    if (knob1 > KNOB1_MAX) knob1 = KNOB1_MAX;

    knob2 += input.knobDeltas[1] * KNOB2_STEP;
    if (knob2 < KNOB2_MIN) knob2 = KNOB2_MIN;
    if (knob2 > KNOB2_MAX) knob2 = KNOB2_MAX;

    knob3 += input.knobDeltas[2] * KNOB3_STEP;
    if (knob3 < KNOB3_MIN) knob3 = KNOB3_MIN;
    if (knob3 > KNOB3_MAX) knob3 = KNOB3_MAX;

    knob4 += input.knobDeltas[3] * KNOB4_STEP;
    if (knob4 < KNOB4_MIN) knob4 = KNOB4_MIN;
    if (knob4 > KNOB4_MAX) knob4 = KNOB4_MAX;

    t += dt * knob2;   // master speed
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float halfW = w * 0.5f;
    const float halfH = h * 0.5f;

    const float sh0 = knob1 * 0.5f;
    const float sh1 = knob4 * 0.5f;
    const float ph0 = t * 1.0f;
    const float ph1 = t * 0.55f;
    const float a0 = 0.83f;
    const float a1 = 0.61f;
    const float contrast = knob3;

    for (int y = 0; y < h; ++y) {
        const float ny = (y - halfH) / h;
        for (int x = 0; x < w; ++x) {
            const float nx = (x - halfW) / h;

            // ---- layer 1: rotated cells ----
            const float rx = nx * ca0 - ny * sa0;
            const float ry = nx * sa0 + ny * ca0;
            const int gx0 = (int)floorf(rx * sh0);
            const int gy0 = (int)floorf(ry * sh0);
            const float h0 = hash2((float)gx0, (float)gy0);
            const float lv0 = 0.5f + 0.5f * PFMath::fastSin(h0 * TWO_PI + ph0);

            // ---- layer 2: difference cells ----
            const int gx1 = (int)floorf(nx * sh1);
            const int gy1 = (int)floorf(ny * sh1);
            const float h1 = hash2((float)gx1, (float)gy1);
            const float lv1 = 0.5f + 0.5f * PFMath::fastSin(h1 * TWO_PI + ph1);

            // blend
            float v = lv0 * a0;
            v = v + (fabsf(v - lv1) - v) * a1;   // equivalent to (1-a1)*v + a1*abs(v-lv1)

            // contrast and clamp
            v = (v - 0.5f) * contrast + 0.5f;
            if (v < 0.0f) v = 0.0f;
            if (v > 1.0f) v = 1.0f;

            // lookup color from ramp
            const int idx = (int)(v * 255.0f + 0.5f);
            PFCanvas::setPixel(x, y,
                RAMP_LUT[idx][0],
                RAMP_LUT[idx][1],
                RAMP_LUT[idx][2]);
        }
    }

    PFCanvas::present();
}

} // namespace CellsDifferencePattern