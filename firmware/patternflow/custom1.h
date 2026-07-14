#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_noise.h"

namespace FireflyHollow {

const char* NAME = "Firefly Hollow";
const char* const KNOB_LABELS[4] = {"Flies", "Speed", "Glow", "Wind"};

// Ramp LUT – DO NOT EDIT (generated from user ramp, 256 entries)
static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {11,10,10},{26,24,24},{41,36,36},{57,47,47},{72,56,56},{87,64,64},{103,70,70},{118,75,75},
  {133,79,79},{149,81,81},{164,82,82},{179,81,81},{195,79,79},{210,75,75},{225,70,70},{241,64,64},
  {254,58,56},{254,68,47},{254,80,38},{254,94,29},{255,109,20},{255,126,11},{255,144,2},{255,165,38},
  {255,185,87},{255,206,138},{255,227,187},{255,248,238},{255,250,227},{255,243,183},{255,236,140},{255,229,96},
  {255,222,53},{255,215,9},{255,207,0},{255,200,0},{255,193,0},{255,185,0},{255,178,0},{255,171,0},
  {255,163,0},{255,156,0},{255,149,0},{255,141,0},{255,134,0},{255,127,0},{255,119,0},{255,112,0},
  {255,105,0},{255,97,0},{255,90,0},{255,83,0},{255,75,0},{255,68,0},{255,61,0},{255,53,0},
  {255,46,0},{255,39,0},{255,31,0},{255,24,0},{255,17,0},{255,9,0},{255,2,0},{255,48,39},
  {255,109,93},{255,164,147},{255,213,201},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
  {255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},{255,240,235},
};

// Knob state (initial values from Pattern Lab)
static float knobFlies = 34.0f;   // 2..34
static float knobSpeed = 2.275f;  // 0.2..5
static float knobGlow  = 1.32f;   // 0..2
static float knobWind  = 0.409f;  // 0..2

static constexpr int MAX_FLIES = 16;
static int   numFlies = 16;          // active count (capped at 16)

// Firefly motion parameters (constant per firefly, set in setup)
static float fly_s1[MAX_FLIES];
static float fly_s2[MAX_FLIES];
static float fly_hb[MAX_FLIES];

// Phase accumulators (each wraps at TWO_PI)
static float phase_fu[MAX_FLIES];      // main x-osc
static float phase_fv_main[MAX_FLIES]; // main y-osc
static float phase_fv_extra[MAX_FLIES];// secondary y-osc (freq 0.9)
static float phase_b[MAX_FLIES];       // brightness oscillation

// Output buffers used by draw()
static float fu[MAX_FLIES];
static float fv[MAX_FLIES];
static float fb[MAX_FLIES];

// Grass sway phases
static float grass_phase1 = 0.0f;   // freq 1.8
static float grass_phase2 = 0.0f;   // freq 2.6

// Cloud drift accumulator (unwrapped – feeds noise coordinates, not sin)
static float cloudT = 0.0f;

void setup() {
    PFMath::buildSinLUT();  // idempotent

    for (int i = 0; i < MAX_FLIES; ++i) {
        // deterministic per-firefly constants (replace sin‑based hash with cellHash)
        fly_s1[i] = 0.13f + 0.11f * PFNoise::cellHash(i, 0, 7);
        fly_s2[i] = 0.09f + 0.13f * PFNoise::cellHash(i, 0, 8);
        fly_hb[i] = PFNoise::cellHash(i, 0, 9);

        // random initial phases
        phase_fu[i]      = PFNoise::cellHash(i, 0, 10) * TWO_PI;
        phase_fv_main[i] = PFNoise::cellHash(i, 0, 11) * TWO_PI;
        phase_fv_extra[i]= PFNoise::cellHash(i, 0, 12) * TWO_PI;
        phase_b[i]       = PFNoise::cellHash(i, 0, 13) * TWO_PI;

        // initial values so first frame is valid
        fu[i] = 0.5f + 0.44f * PFMath::fastSin(phase_fu[i] + i * 2.39f);
        fv[i] = 0.62f
                + 0.30f * PFMath::fastSin(phase_fv_main[i] + i * 5.17f)
                + 0.05f * PFMath::fastSin(phase_fv_extra[i] + (float)i);
        float p = PFMath::fastSin(phase_b[i] + i * 1.7f);
        float pp = fmaxf(0.0f, p);
        fb[i] = pp * pp * pp;   // x^3
    }

    grass_phase1 = 0.0f;
    grass_phase2 = 0.0f;
    cloudT = 0.0f;
}

void update(float dt, const InputFrame& input) {
    // ----- knobs -----
    knobFlies += input.knobDeltas[0] * 0.05f;
    if (knobFlies < 2.0f)  knobFlies = 2.0f;
    if (knobFlies > 34.0f) knobFlies = 34.0f;

    knobSpeed += input.knobDeltas[1] * 0.1f;
    if (knobSpeed < 0.2f) knobSpeed = 0.2f;
    if (knobSpeed > 5.0f) knobSpeed = 5.0f;

    knobGlow += input.knobDeltas[2] * 0.05f;
    if (knobGlow < 0.0f) knobGlow = 0.0f;
    if (knobGlow > 2.0f) knobGlow = 2.0f;

    knobWind += input.knobDeltas[3] * 0.05f;
    if (knobWind < 0.0f) knobWind = 0.0f;
    if (knobWind > 2.0f) knobWind = 2.0f;

    int flies = (int)lroundf(knobFlies);
    if (flies < 2)  flies = 2;
    if (flies > 16) flies = 16;
    numFlies = flies;

    const float speed = knobSpeed;

    // ----- firefly phases & buffers -----
    for (int i = 0; i < MAX_FLIES; ++i) {
        phase_fu[i]       += dt * speed * fly_s1[i] * 2.0f;
        phase_fv_main[i]  += dt * speed * fly_s2[i] * 2.0f;
        phase_fv_extra[i] += dt * speed * 0.9f;
        float freqB = 0.8f + 0.5f * fly_hb[i];
        phase_b[i]        += dt * speed * freqB;

        // wrap each phase at TWO_PI
        while (phase_fu[i]       > TWO_PI) phase_fu[i]       -= TWO_PI;
        while (phase_fv_main[i]  > TWO_PI) phase_fv_main[i]  -= TWO_PI;
        while (phase_fv_extra[i] > TWO_PI) phase_fv_extra[i] -= TWO_PI;
        while (phase_b[i]        > TWO_PI) phase_b[i]        -= TWO_PI;

        fu[i] = 0.5f + 0.44f * PFMath::fastSin(phase_fu[i] + i * 2.39f);
        fv[i] = 0.62f
                + 0.30f * PFMath::fastSin(phase_fv_main[i] + i * 5.17f)
                + 0.05f * PFMath::fastSin(phase_fv_extra[i] + (float)i);
        float p = PFMath::fastSin(phase_b[i] + i * 1.7f);
        float pp = fmaxf(0.0f, p);
        fb[i] = pp * pp * pp;
    }

    // ----- grass phases -----
    grass_phase1 += dt * speed * 1.8f;
    while (grass_phase1 > TWO_PI) grass_phase1 -= TWO_PI;
    grass_phase2 += dt * speed * 2.6f;
    while (grass_phase2 > TWO_PI) grass_phase2 -= TWO_PI;

    // ----- cloud drift (offset only, no sin → precision loss negligible) -----
    cloudT += dt * speed * (0.4f + knobWind * 0.8f);
}

void draw() {
    const int W = PANEL_RES_W;
    const int H = PANEL_RES_H;

    const float vh = (float)W;  // logical vertical extent
    const float vw = (float)H;  // logical horizontal extent
    const float vh_half = vh * 0.5f;

    const float glowSq = knobGlow * knobGlow;
    const float wind   = knobWind;
    const int   n      = numFlies;

    // ----- pre‑compute per‑row data (depends only on u = y) -----
    float hillTop[H];
    float grassGh[H];
    for (int u = 0; u < H; ++u) {
        float hu = (float)u;
        hillTop[u] = vh * 0.58f
                     + PFMath::fastSin(hu * 0.09f + 2.0f) * 5.0f
                     + PFMath::fastSin(hu * 0.023f) * 8.0f;

        int gx = u / 2;
        float hh = PFNoise::cellHash(gx, 0, 91); // 0..1
        grassGh[u] = 10.0f + hh * 16.0f;
    }

    const float cloudDrift = cloudT * (0.4f + wind * 0.8f);

    for (int y = 0; y < H; ++y) {
        const int u = y;                       // logical x in JS
        const float hill = hillTop[u];
        const float gh   = grassGh[u];

        for (int x = 0; x < W; ++x) {
            const int v = W - 1 - x;           // logical y in JS
            const float g = (float)v / vh;     // normalized 0..1

            float val = 0.05f + 0.14f * g;

            // ----- clouds (only upper half of the view) -----
            if ((float)v < vh_half) {
                float cn = PFNoise::valueNoise2D(u * 0.045f + cloudDrift * 0.12f,
                                                  v * 0.09f  + cloudDrift * 0.015f) * 0.65f
                         + PFNoise::valueNoise2D(u * 0.11f  - cloudDrift * 0.07f,
                                                  v * 0.22f  + 40.0f) * 0.35f;
                cn *= 1.0f - (g / 0.5f) * 0.7f;   // g < 0.5 here
                float cd = (cn - 0.38f) / 0.18f;
                if (cd > 0.0f) {
                    float soft = (cd >= 1.0f) ? 1.0f
                                              : cd * cd * (3.0f - 2.0f * cd); // smoothstep
                    val += soft * 0.13f * 1.5f;   // lit = 1.5
                }
            }

            // ----- distant hill silhouette -----
            if (v >= hill) {
                val = 0.07f;
            }

            // ----- foreground grass (swaying) -----
            float sway = PFMath::fastSin(u * 0.3f + grass_phase1) * wind * 4.0f
                       + PFMath::fastSin(u * 0.9f - grass_phase2) * wind * 2.0f;
            float grassTop = vh - gh + sway;
            if (v >= grassTop) {
                val = 0.015f;
                if (v - grassTop < 1.2f) val = 0.11f;  // moonlit tips
            }

            // ----- fireflies (additive glow) -----
            for (int i = 0; i < n; ++i) {
                float du = (float)u - fu[i] * vw;
                float dv = (float)v - fv[i] * vh;
                float dd = du * du + dv * dv;
                if (dd < glowSq * 9.0f) {
                    val += fb[i] * expf(-dd / glowSq);
                }
            }

            // ----- clamp and map through ramp -----
            if (val < 0.0f) val = 0.0f;
            if (val > 1.0f) val = 1.0f;
            int idx = (int)(val * 255.0f + 0.5f);
            if (idx < 0)   idx = 0;
            if (idx > 255) idx = 255;

            PFCanvas::setPixel(x, y,
                               RAMP_LUT[idx][0],
                               RAMP_LUT[idx][1],
                               RAMP_LUT[idx][2]);
        }
    }

    PFCanvas::present();
}

} // namespace FireflyHollow