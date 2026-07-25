#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_noise.h"

namespace CyberpunkCity {

const char* NAME = "Cyber City";
const char* const KNOB_LABELS[4] = {"Buildings", "Speed", "Rain Density", "Glow"};

static float g_buildings = 6.507f;
static float g_speed = 0.939f;
static float g_rainDensity = 0.397f;
static float g_glow = 1.226f;
static float g_timeAcc = 0.0f;

static const uint8_t RAMP_LUT[256][3] = {
  {8,24,64},{10,24,64},{12,25,63},{13,25,63},{15,26,62},{17,26,62},{19,26,61},{20,27,61},
  {22,27,60},{24,27,60},{26,28,59},{27,28,59},{29,29,59},{31,29,58},{33,29,58},{34,30,57},
  {36,30,57},{38,30,56},{40,31,56},{41,31,55},{43,32,55},{45,32,54},{47,32,54},{49,33,54},
  {50,33,53},{52,33,53},{54,34,52},{56,34,52},{57,35,51},{59,35,51},{61,35,50},{63,36,50},
  {64,36,49},{66,36,49},{68,37,48},{70,37,48},{71,38,48},{73,38,47},{75,38,47},{77,39,46},
  {78,39,46},{80,39,45},{82,40,45},{84,40,44},{85,41,44},{87,41,43},{89,41,43},{91,42,43},
  {93,42,42},{94,43,42},{96,43,41},{98,43,41},{100,44,40},{101,44,40},{103,44,39},{105,45,39},
  {107,45,38},{108,46,38},{110,46,38},{112,46,37},{114,47,37},{115,47,36},{117,47,36},{119,48,35},
  {121,48,35},{122,49,34},{124,49,34},{126,49,33},{128,50,33},{130,50,33},{131,50,32},{133,51,32},
  {135,51,31},{137,52,31},{138,52,30},{140,52,30},{142,53,29},{144,53,29},{145,53,28},{147,54,28},
  {149,54,27},{151,55,27},{152,55,27},{154,55,26},{156,56,26},{158,56,25},{159,56,25},{161,57,24},
  {163,57,24},{165,58,23},{167,58,23},{168,58,22},{170,59,22},{172,59,22},{174,60,21},{175,60,21},
  {177,60,20},{179,61,20},{181,61,19},{182,61,19},{184,62,18},{186,62,18},{188,63,17},{189,63,17},
  {191,63,17},{193,64,16},{195,64,16},{196,64,15},{198,65,15},{200,65,14},{202,66,14},{203,66,13},
  {205,66,13},{207,67,12},{209,67,12},{211,67,12},{212,68,11},{214,68,11},{216,69,10},{218,69,10},
  {219,69,9},{221,70,9},{223,70,8},{225,70,8},{226,71,7},{228,71,7},{230,72,7},{232,72,6},
  {233,72,6},{235,73,5},{237,73,5},{239,74,4},{240,74,4},{242,74,3},{244,75,3},{246,75,2},
  {248,75,2},{249,76,1},{251,76,1},{253,77,1},{255,77,0},{255,78,1},{255,79,2},{255,81,4},
  {255,82,5},{255,83,6},{255,85,8},{255,86,9},{255,87,10},{255,89,12},{255,90,13},{255,92,14},
  {255,93,16},{255,94,17},{255,96,18},{255,97,20},{255,98,21},{255,100,22},{255,101,24},{255,102,25},
  {255,104,27},{255,105,28},{255,106,29},{255,108,31},{255,109,32},{255,110,33},{255,112,35},{255,113,36},
  {255,114,37},{255,116,39},{255,117,40},{255,119,41},{255,120,43},{255,121,44},{255,123,45},{255,124,47},
  {255,125,48},{255,127,49},{255,128,51},{255,129,52},{255,131,53},{255,132,55},{255,133,56},{255,135,57},
  {255,136,59},{255,137,60},{255,139,61},{255,140,63},{255,141,64},{255,143,65},{255,144,67},{255,146,68},
  {255,147,69},{255,148,71},{255,150,72},{255,151,73},{255,152,75},{255,154,76},{255,155,78},{255,156,79},
  {255,158,80},{255,159,82},{255,160,83},{255,161,84},{255,163,86},{255,164,87},{255,166,88},{255,167,90},
  {255,169,91},{255,170,92},{255,171,94},{255,173,95},{255,174,96},{255,175,98},{255,177,99},{255,178,100},
  {255,179,102},{255,181,103},{255,182,104},{255,183,106},{255,185,107},{255,186,108},{255,187,110},{255,189,111},
  {255,190,112},{255,191,114},{255,193,115},{255,194,116},{255,196,118},{255,197,119},{255,198,120},{255,200,122},
  {255,201,123},{255,202,124},{255,204,126},{255,205,127},{255,206,129},{255,208,130},{255,209,131},{255,210,133},
  {255,212,134},{255,213,135},{255,214,137},{255,216,138},{255,217,139},{255,218,141},{255,220,142},{255,221,143},
  {255,223,145},{255,224,146},{255,225,147},{255,227,149},{255,228,150},{255,229,151},{255,231,153},{255,232,154},
};

void setup() {
    PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
    g_buildings += input.knobDeltas[0] * 0.05f;
    g_buildings = fmaxf(4.0f, fminf(16.0f, g_buildings));

    g_speed += input.knobDeltas[1] * 0.1f;
    g_speed = fmaxf(0.1f, fminf(5.0f, g_speed));

    g_rainDensity += input.knobDeltas[2] * 0.05f;
    g_rainDensity = fmaxf(0.0f, fminf(1.0f, g_rainDensity));

    g_glow += input.knobDeltas[3] * 0.05f;
    g_glow = fmaxf(0.5f, fminf(3.0f, g_glow));

    g_timeAcc += dt * g_speed;
    const float maxPeriod = 10.0f * TWO_PI;
    if (g_timeAcc > maxPeriod) {
        g_timeAcc -= maxPeriod;
    }
}

void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float hInv = 1.0f / (float)h;

    const float t = g_timeAcc;
    const float searchlightPhase = PFMath::fastSin(t * 0.8f) * 4.0f;
    const float farBuildingWidth = 128.0f / g_buildings;
    const int nearWidth = (int)(100.0f / g_buildings);
    const int nearWidthHalf = nearWidth / 2;
    const float invGlow = 1.0f / g_glow;
    const float rainThreshold = g_rainDensity * 0.15f;
    const bool beaconOn = ((int)(t * 4.0f) % 2) == 0;

    for (int y = 0; y < h; y++) {
        const float normY = y * hInv;
        const int yMod4 = y % 4;
        const int yMod5 = y % 5;
        const int rainY = (int)((y + t * 40.0f) * 0.25f);

        for (int x = 0; x < w; x++) {
            float val = 0.05f;

            // 1. Sky / Searchlight layer
            if (normY < 0.7f) {
                float lightBeam = PFMath::fastSin((x * 0.04f) + searchlightPhase - normY * 3.0f);
                if (lightBeam > 0.82f) {
                    val += (lightBeam - 0.82f) * 2.0f;
                }
            }

            // 2. Far Skyline (Layer 1 - Slow Scroll)
            const int farX = (int)(x + t * 4.0f);
            const int farBuildingId = (int)(farX / farBuildingWidth);
            const float farHeight = 0.3f + (PFMath::fastSin(farBuildingId * 17.31f) * 0.5f + 0.5f) * 0.35f;

            if (normY > (1.0f - farHeight)) {
                val = 0.25f;
                if ((farX % 3 == 0) && (yMod4 == 0) && normY < 0.9f) {
                    float winFlicker = (PFMath::fastSin(farBuildingId + t * 2.0f) > 0.1f) ? 0.6f : 0.2f;
                    val = winFlicker;
                }
            }

            // 3. Near Cityscape (Layer 2 - Fast Scroll with Antennas & Signage)
            const int nearX = (int)(x + t * 12.0f);
            const int nearBuildingId = nearWidth > 0 ? (nearX / nearWidth) : 0;
            const float nearHeight = 0.2f + (PFMath::fastSin(nearBuildingId * 91.7f) * 0.5f + 0.5f) * 0.5f;
            const int relX = nearWidth > 0 ? (nearX % nearWidth) : 0;

            if (normY > (1.0f - nearHeight)) {
                if (relX == 0 || relX == nearWidth - 1) {
                    val = 0.1f;
                } else {
                    val = 0.4f;
                    int winX = relX % 4;
                    int winY = yMod5;
                    if (winX > 1 && winY > 1) {
                        float signGlow = PFMath::fastSin(nearBuildingId * 3.0f + t * 5.0f) * 0.5f + 0.5f;
                        val = 0.7f + signGlow * 0.3f;
                    }
                }
            } else if (normY > (1.0f - nearHeight - 0.1f) && relX == nearWidthHalf) {
                val = beaconOn ? 0.9f : 0.3f;
            }

            // 4. Downpouring Pixel Rain overlay
            if (g_rainDensity > 0.05f) {
                float rainSeed = PFNoise::cellHash(x, rainY);
                if (rainSeed < rainThreshold) {
                    val += 0.4f;
                }
            }

            val = fmaxf(0.0f, fminf(1.0f, val));
            val = PFMath::fastPow(val, invGlow);

            int li = (int)(val * 255.0f + 0.5f);
            if (li < 0) li = 0;
            if (li > 255) li = 255;

            PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
        }
    }

    PFCanvas::present();
}

} // namespace CyberpunkCity