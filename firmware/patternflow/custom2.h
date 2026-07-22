#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_tables.h"

namespace RippleCellGrid {

const char* NAME = "Cell Ripple";
const char* const KNOB_LABELS[4] = {"Speed", "Size", "Ripple", "Density"};

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{3,3,3},{24,22,22},{45,37,37},{67,49,49},{88,58,58},
  {109,62,62},{130,64,64},{152,61,61},{173,56,56},{194,46,46},{216,33,33},{237,17,17},{255,0,1},
  {255,0,10},{255,0,19},{255,0,27},{255,0,36},{255,0,45},{255,0,53},{255,0,62},{255,0,71},
  {255,0,79},{255,0,88},{255,0,96},{255,0,105},{255,0,114},{255,0,122},{255,0,131},{255,0,140},
  {255,0,148},{255,0,157},{255,0,166},{255,0,174},{255,0,183},{255,0,192},{255,0,200},{255,0,209},
  {255,0,218},{255,0,226},{255,0,235},{255,0,244},{255,0,252},{249,0,255},{240,0,255},{232,0,255},
  {223,0,255},{214,0,255},{206,0,255},{197,0,255},{188,0,255},{180,0,255},{171,0,255},{163,0,255},
  {154,0,255},{145,0,255},{137,0,255},{128,0,255},{119,0,255},{111,0,255},{102,0,255},{93,0,255},
  {85,0,255},{76,0,255},{67,0,255},{59,0,255},{50,0,255},{41,0,255},{33,0,255},{24,0,255},
  {15,0,255},{7,0,255},{0,2,255},{0,11,255},{0,19,255},{0,28,255},{0,37,255},{0,45,255},
  {0,54,255},{0,63,255},{0,71,255},{0,80,255},{0,88,255},{0,97,255},{0,106,255},{0,114,255},
  {0,123,255},{0,132,255},{0,140,255},{0,149,255},{0,158,255},{0,166,255},{0,175,255},{0,184,255},
  {0,192,255},{0,201,255},{0,210,255},{0,218,255},{0,225,255},{0,223,253},{0,221,252},{0,219,251},
  {0,217,249},{0,215,248},{0,213,247},{0,211,246},{0,209,244},{0,207,243},{0,205,242},{0,204,240},
  {0,202,239},{0,200,238},{0,198,236},{0,196,235},{0,194,234},{0,193,232},{0,191,231},{0,189,230},
  {0,187,228},{0,185,227},{0,184,226},{0,182,225},{0,180,223},{0,178,222},{0,177,221},{0,175,219},
  {0,173,218},{0,171,217},{0,170,215},{0,168,214},{0,166,213},{0,165,211},{0,163,210},{0,161,209},
  {0,160,207},{0,158,206},{0,156,205},{0,155,204},{0,153,202},{0,151,201},{0,150,200},{0,148,198},
  {0,147,197},{0,145,196},{0,143,194},{0,142,193},{0,140,192},{0,139,190},{0,137,189},{0,136,188},
  {0,134,186},{0,133,185},{0,131,184},{0,130,183},{0,128,181},{0,127,180},{0,125,179},{0,124,177},
  {0,122,176},{0,121,175},{0,119,173},{0,118,172},{0,116,171},{0,115,169},{0,114,168},{0,112,167},
  {0,111,165},{0,109,164},{0,108,163},{0,107,162},{0,105,160},{0,104,159},{0,103,158},{0,101,156},
  {0,100,155},{0,99,154},{0,97,152},{0,96,151},{0,95,150},{0,93,148},{0,92,147},{0,91,146},
  {0,89,144},{0,88,143},{0,87,142},{0,86,141},{0,84,139},{0,83,138},{0,82,137},{0,81,135},
  {0,80,134},{0,78,133},{0,77,131},{0,76,130},{0,75,129},{0,74,127},{0,73,126},{0,71,125},
  {0,70,123},{0,69,122},{0,68,121},{0,67,120},{0,66,118},{0,65,117},{0,64,116},{0,63,114},
  {0,62,113},{0,60,112},{0,59,110},{0,58,109},{0,57,108},{0,56,106},{0,55,105},{0,54,104},
  {0,53,102},{0,52,101},{0,51,100},{0,50,99},{0,49,97},{0,48,96},{0,47,95},{0,46,93},
  {0,45,92},{0,45,91},{0,44,89},{0,43,88},{0,42,87},{0,42,87},{0,42,87},{0,42,87},
  {0,42,87},{0,42,87},{0,42,87},{0,42,87},{0,42,87},{0,42,87},{0,42,87},{0,42,87},
};

static float speedParam   = 2.0f;
static float sizeParam    = 5.0f;
static float rippleParam  = 5.0f;
static float densityParam = 3.0f;

static constexpr float CELLGRID_SPEED_STEP   = 0.05f;
static constexpr float CELLGRID_SIZE_STEP    = 0.1f;
static constexpr float CELLGRID_RIPPLE_STEP  = 0.05f;
static constexpr float CELLGRID_DENSITY_STEP = 0.05f;

static constexpr float CELLGRID_SPEED_MIN    = 0.0f;
static constexpr float CELLGRID_SPEED_MAX    = 2.0f;
static constexpr float CELLGRID_SIZE_MIN     = 3.0f;
static constexpr float CELLGRID_SIZE_MAX     = 6.0f;
static constexpr float CELLGRID_RIPPLE_MIN   = 0.0f;
static constexpr float CELLGRID_RIPPLE_MAX   = 5.0f;
static constexpr float CELLGRID_DENSITY_MIN  = 0.5f;
static constexpr float CELLGRID_DENSITY_MAX  = 3.0f;

static constexpr float CELLGRID_T_WRAP = 4.0f * PI;

static float t = 0.0f;

void setup() {
  PFMath::buildSinLUT();
  PFTables::init();
}

void update(float dt, const InputFrame& input) {
  speedParam  += input.knobDeltas[0] * CELLGRID_SPEED_STEP;
  if (speedParam < CELLGRID_SPEED_MIN) speedParam = CELLGRID_SPEED_MIN;
  if (speedParam > CELLGRID_SPEED_MAX) speedParam = CELLGRID_SPEED_MAX;

  sizeParam   += input.knobDeltas[1] * CELLGRID_SIZE_STEP;
  if (sizeParam < CELLGRID_SIZE_MIN) sizeParam = CELLGRID_SIZE_MIN;
  if (sizeParam > CELLGRID_SIZE_MAX) sizeParam = CELLGRID_SIZE_MAX;

  rippleParam += input.knobDeltas[2] * CELLGRID_RIPPLE_STEP;
  if (rippleParam < CELLGRID_RIPPLE_MIN) rippleParam = CELLGRID_RIPPLE_MIN;
  if (rippleParam > CELLGRID_RIPPLE_MAX) rippleParam = CELLGRID_RIPPLE_MAX;

  densityParam += input.knobDeltas[3] * CELLGRID_DENSITY_STEP;
  if (densityParam < CELLGRID_DENSITY_MIN) densityParam = CELLGRID_DENSITY_MIN;
  if (densityParam > CELLGRID_DENSITY_MAX) densityParam = CELLGRID_DENSITY_MAX;

  t += dt * speedParam;
  if (t > CELLGRID_T_WRAP) t -= CELLGRID_T_WRAP;
}

void draw() {
  const float t_local = t;
  const float ripple = rippleParam;
  const float cellSpacing = sizeParam * 2.5f;
  const float edgeWidth = densityParam * 2.5f;
  const float edgeWidthInv = 1.0f / edgeWidth;
  const float halfSpacing = cellSpacing * 0.5f;
  const int total = PANEL_RES_W * PANEL_RES_H;

  for (int i = 0; i < total; i++) {
    // pixel distance from fixed center
    float r = PFTables::rT[i] * (float)PANEL_RES_H;
    float th = PFTables::thetaT[i];

    float rippleOffset = ripple * 4.0f * PFMath::fastSin(r * 0.08f - t_local * 1.5f);
    float rr = r + rippleOffset;

    float rx = rr * PFMath::fastCos(th);
    float ry = rr * PFMath::fastSin(th);

    // cell center snapped to grid
    float cx0 = floorf(rx / cellSpacing) * cellSpacing + halfSpacing;
    float cy0 = floorf(ry / cellSpacing) * cellSpacing + halfSpacing;

    // search 3x3 neighborhood for minimum distance (squared)
    float minDistSq = 1e12f;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        float nx = cx0 + dx * cellSpacing;
        float ny = cy0 + dy * cellSpacing;
        float ddx = rx - nx;
        float ddy = ry - ny;
        float dsq = ddx*ddx + ddy*ddy;
        if (dsq < minDistSq) minDistSq = dsq;
      }
    }

    float minDist = sqrtf(minDistSq);
    float val = (minDist < edgeWidth) ? 1.0f - (minDist * edgeWidthInv) * 0.9f : 0.05f;

    if (val < 0.0f) val = 0.0f;
    if (val > 1.0f) val = 1.0f;

    int li = (int)(val * 255.0f + 0.5f);
    int y = i / PANEL_RES_W;
    int x = i - y * PANEL_RES_W;
    PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
  }

  PFCanvas::present();
}

} // namespace RippleCellGrid