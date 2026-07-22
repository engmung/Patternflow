#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace RippleGrid {

const char* NAME = "Ripple Grid";
const char* const KNOB_LABELS[4] = {"Speed", "Size", "Ripple", "Mirror"};

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{1,1,1},{4,4,4},{7,7,8},{10,10,11},{12,13,14},{15,16,17},
  {17,18,20},{19,21,23},{21,23,26},{23,26,30},{24,28,33},{26,30,36},{27,32,39},{28,34,42},
  {29,36,45},{30,38,48},{31,40,51},{31,41,55},{32,43,58},{32,44,61},{32,46,64},{32,47,67},
  {32,48,70},{31,49,73},{31,50,77},{30,51,80},{29,52,83},{28,53,86},{27,54,89},{26,54,92},
  {24,55,95},{23,55,99},{21,56,102},{19,56,105},{17,56,108},{15,56,111},{12,56,114},{10,56,117},
  {7,56,120},{4,56,124},{1,55,127},{0,56,128},{0,57,129},{0,57,130},{0,58,130},{0,59,131},
  {0,60,132},{0,61,132},{0,62,133},{0,63,134},{0,64,134},{0,65,135},{0,66,136},{0,67,136},
  {0,68,137},{0,69,137},{0,70,138},{0,71,139},{0,72,139},{0,74,140},{0,75,141},{0,76,141},
  {0,77,142},{0,78,143},{0,79,143},{0,80,144},{0,81,145},{0,82,145},{0,83,146},{0,84,147},
  {0,86,147},{0,87,148},{0,88,149},{0,89,149},{0,90,150},{0,91,150},{0,93,151},{0,94,152},
  {0,95,152},{0,96,153},{0,97,154},{0,98,154},{0,100,155},{0,101,156},{0,102,156},{0,103,157},
  {0,105,158},{0,106,158},{0,107,159},{0,108,160},{0,110,160},{0,111,161},{0,112,162},{0,113,162},
  {0,115,163},{0,116,163},{0,117,164},{0,119,165},{0,120,165},{0,121,166},{0,123,167},{0,124,167},
  {0,125,168},{0,127,169},{0,128,169},{0,129,170},{0,131,171},{0,132,171},{0,133,172},{0,135,173},
  {0,136,173},{0,138,174},{0,139,174},{0,140,175},{0,142,176},{0,143,176},{0,145,177},{0,146,178},
  {0,148,178},{0,149,179},{3,150,180},{5,152,181},{8,153,182},{10,154,183},{13,155,184},{15,157,185},
  {18,158,186},{20,159,187},{23,161,188},{26,162,189},{28,163,190},{31,165,191},{34,166,192},{37,167,193},
  {39,168,194},{42,170,195},{45,171,196},{48,172,198},{51,174,199},{54,175,200},{57,177,201},{60,178,202},
  {63,179,203},{66,181,204},{69,182,205},{72,183,206},{75,185,207},{79,186,208},{82,187,209},{85,189,210},
  {88,190,211},{92,192,212},{95,193,213},{98,194,214},{102,196,215},{105,197,216},{108,199,217},{112,200,218},
  {115,202,219},{119,203,220},{122,205,221},{126,206,222},{129,207,223},{133,209,224},{137,210,225},{140,212,226},
  {144,213,227},{148,215,228},{152,216,229},{155,218,230},{159,219,231},{163,221,232},{167,222,233},{171,224,234},
  {175,225,235},{179,227,236},{183,228,237},{187,230,238},{191,231,239},{195,233,241},{199,234,242},{203,236,243},
  {207,237,244},{211,239,245},{215,241,246},{220,242,247},{224,244,248},{228,245,249},{232,247,250},{237,248,251},
  {241,250,252},{246,252,253},{250,253,254},{254,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
};

static float speedParam   = 8.0f;
static float sizeParam    = 2.0f;
static float rippleParam  = 0.731f;
static float mirrorParam  = 1.0f;

static constexpr float RIPPLEGRID_SPEED_STEP   = 0.05f;
static constexpr float RIPPLEGRID_SIZE_STEP    = 0.1f;
static constexpr float RIPPLEGRID_RIPPLE_STEP  = 0.05f;
static constexpr float RIPPLEGRID_MIRROR_STEP  = 0.05f;

static constexpr float RIPPLEGRID_SPEED_MIN    = 0.1f;
static constexpr float RIPPLEGRID_SPEED_MAX    = 8.0f;
static constexpr float RIPPLEGRID_SIZE_MIN     = 2.0f;
static constexpr float RIPPLEGRID_SIZE_MAX     = 6.0f;
static constexpr float RIPPLEGRID_RIPPLE_MIN   = 0.0f;
static constexpr float RIPPLEGRID_RIPPLE_MAX   = 10.0f;
static constexpr float RIPPLEGRID_MIRROR_MIN   = 1.0f;
static constexpr float RIPPLEGRID_MIRROR_MAX   = 4.0f;

static constexpr float RIPPLEGRID_T_WRAP = 4.0f * PI;

static float t = 0.0f;

void setup() {
  PFMath::buildSinLUT();
}

void update(float dt, const InputFrame& input) {
  speedParam  += input.knobDeltas[0] * RIPPLEGRID_SPEED_STEP;
  if (speedParam < RIPPLEGRID_SPEED_MIN) speedParam = RIPPLEGRID_SPEED_MIN;
  if (speedParam > RIPPLEGRID_SPEED_MAX) speedParam = RIPPLEGRID_SPEED_MAX;

  sizeParam   += input.knobDeltas[1] * RIPPLEGRID_SIZE_STEP;
  if (sizeParam < RIPPLEGRID_SIZE_MIN) sizeParam = RIPPLEGRID_SIZE_MIN;
  if (sizeParam > RIPPLEGRID_SIZE_MAX) sizeParam = RIPPLEGRID_SIZE_MAX;

  rippleParam += input.knobDeltas[2] * RIPPLEGRID_RIPPLE_STEP;
  if (rippleParam < RIPPLEGRID_RIPPLE_MIN) rippleParam = RIPPLEGRID_RIPPLE_MIN;
  if (rippleParam > RIPPLEGRID_RIPPLE_MAX) rippleParam = RIPPLEGRID_RIPPLE_MAX;

  mirrorParam += input.knobDeltas[3] * RIPPLEGRID_MIRROR_STEP;
  if (mirrorParam < RIPPLEGRID_MIRROR_MIN) mirrorParam = RIPPLEGRID_MIRROR_MIN;
  if (mirrorParam > RIPPLEGRID_MIRROR_MAX) mirrorParam = RIPPLEGRID_MIRROR_MAX;

  t += dt * speedParam;
  if (t > RIPPLEGRID_T_WRAP) t -= RIPPLEGRID_T_WRAP;
}

void draw() {
  const float cx = PANEL_RES_W * 0.5f;
  const float cy = PANEL_RES_H * 0.5f;
  const float t_local = t;
  const float ripple = rippleParam;
  const float size = sizeParam;
  const int mirror = (int)mirrorParam;

  for (int y = 0; y < PANEL_RES_H; y++) {
    for (int x = 0; x < PANEL_RES_W; x++) {
      float dx = (float)x - cx;
      float dy = (float)y - cy;

      float dist = sqrtf(dx * dx + dy * dy);
      float angle = PFMath::fastAtan2(dy, dx);
      float rippleOffset = ripple * 4.0f * PFMath::fastSin(dist * 0.08f - t_local * 1.5f);

      float rx = (dist + rippleOffset) * PFMath::fastCos(angle);
      float ry = (dist + rippleOffset) * PFMath::fastSin(angle);

      int mx = (int)fabsf(rx * (size * 0.1f));
      int my = (int)fabsf(ry * (size * 0.1f));

      float val = 0.0f;
      if (((mx & my) % mirror) == 0) {
        val = 1.0f - ((mx ^ my) % 8) / 8.0f;
      }

      if (val < 0.0f) val = 0.0f;
      if (val > 1.0f) val = 1.0f;

      int li = (int)(val * 255.0f + 0.5f);
      PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
    }
  }

  PFCanvas::present();
}

} // namespace RippleGrid