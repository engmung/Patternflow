#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "src/core_color.h"

namespace FractalHoles {

const char* NAME = "Fractal Holes";
const char* const KNOB_LABELS[4] = {"Flow", "Cutoff", "HueShift", "Zoom"};

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},
  {0,0,0},{0,0,0},{0,0,0},{1,1,1},{7,7,7},{13,12,13},{19,18,18},{25,23,23},
  {31,28,27},{37,33,32},{43,39,36},{50,45,40},{56,52,44},{62,59,47},{68,67,50},{72,74,53},
  {74,80,55},{75,86,57},{74,92,59},{73,98,60},{69,104,62},{64,111,63},{63,117,69},{64,123,79},
  {64,129,90},{64,135,102},{63,141,116},{62,147,132},{61,153,150},{60,148,159},{58,138,165},{56,125,172},
  {54,110,178},{51,93,184},{49,72,190},{45,49,196},{61,42,202},{83,38,208},{107,34,214},{134,30,220},
  {164,25,226},{198,21,233},{234,15,239},{245,10,216},{251,4,185},{255,0,156},{255,0,135},{255,0,115},
  {255,0,94},{255,0,74},{255,0,54},{255,0,33},{255,0,13},{255,8,0},{255,28,0},{255,48,0},
  {255,69,0},{255,89,0},{255,109,0},{255,130,0},{255,150,0},{255,171,0},{255,191,0},{255,211,0},
  {255,232,0},{255,252,0},{237,255,0},{217,255,0},{197,255,0},{176,255,0},{156,255,0},{135,255,0},
  {115,255,0},{95,255,0},{74,255,0},{54,255,0},{33,255,0},{13,255,0},{0,255,7},{0,255,28},
  {0,255,48},{0,255,69},{0,255,89},{0,255,109},{0,255,130},{0,255,150},{0,255,171},{0,255,191},
  {0,255,211},{0,255,232},{0,255,252},{0,237,255},{0,217,255},{0,197,255},{0,176,255},{0,156,255},
  {0,135,255},{0,115,255},{0,95,255},{0,74,255},{0,54,255},{0,33,255},{0,13,255},{7,0,255},
  {28,0,255},{48,0,255},{69,0,255},{89,0,255},{109,0,255},{130,0,255},{150,0,255},{171,0,255},
  {191,0,255},{211,0,255},{224,0,254},{237,0,253},{249,0,252},{252,0,242},{251,0,228},{250,0,215},
  {249,0,201},{248,0,187},{247,0,174},{247,0,160},{246,0,147},{245,0,134},{244,0,121},{243,0,108},
  {242,0,95},{242,0,82},{241,0,69},{240,0,56},{239,0,44},{238,0,31},{237,0,19},{237,0,7},
  {236,6,0},{235,18,0},{234,30,0},{233,42,0},{232,54,0},{231,66,0},{231,77,0},{230,89,0},
  {229,101,0},{228,112,0},{227,124,0},{226,135,0},{226,146,0},{225,157,0},{224,168,0},{223,179,0},
  {222,190,0},{221,201,0},{221,211,0},{217,220,0},{205,219,0},{193,218,0},{181,217,0},{169,216,0},
  {157,215,0},{145,215,0},{134,214,0},{122,213,0},{111,212,0},{99,211,0},{88,210,0},{77,210,0},
  {65,209,0},{54,208,0},{43,207,0},{33,206,0},{22,205,0},{11,205,0},{0,204,0},{0,203,10},
  {0,202,21},{0,201,31},{0,200,41},{0,199,51},{0,199,61},{0,198,71},{0,197,81},{0,196,91},
  {0,195,101},{0,194,111},{0,194,120},{0,193,130},{0,192,139},{0,191,148},{0,190,158},{0,189,167},
  {0,189,176},{0,188,185},{0,180,187},{0,170,186},{0,159,185},{0,149,184},{0,139,183},{0,129,183},
  {0,118,182},{0,109,181},{0,99,180},{0,89,179},{4,68,180},{9,43,183},{14,19,185},{43,19,187},
  {76,25,189},{107,31,191},{138,36,193},{167,42,195},{195,48,198},{200,54,178},{202,60,157},{204,67,137},
  {206,73,119},{208,80,103},{210,87,88},{212,112,93},{215,138,100},{217,161,107},{219,184,115},{221,204,122},
  {223,223,129},{210,225,137},{200,227,145},{191,229,152},{184,232,160},{179,234,168},{176,236,177},{185,238,194},
  {193,240,209},{202,242,222},{210,244,233},{219,246,242},{228,248,249},{237,248,251},{246,250,253},{255,255,255},
};

static float flowParam    = 0.038f;
static float cutoffParam  = 1.608f;
static float hueShiftParam = 0.79f;
static float zoomParam    = 1.743f;

static constexpr float FRACTAL_FLOW_STEP     = 0.05f;
static constexpr float FRACTAL_CUTOFF_STEP   = 0.1f;
static constexpr float FRACTAL_HUESHIFT_STEP = 0.05f;
static constexpr float FRACTAL_ZOOM_STEP     = 0.05f;

static constexpr float FRACTAL_FLOW_MIN     = 0.0f;
static constexpr float FRACTAL_FLOW_MAX     = 0.4f;
static constexpr float FRACTAL_CUTOFF_MIN   = 0.0f;
static constexpr float FRACTAL_CUTOFF_MAX   = 2.0f;
static constexpr float FRACTAL_HUESHIFT_MIN = 0.0f;
static constexpr float FRACTAL_HUESHIFT_MAX = 1.0f;
static constexpr float FRACTAL_ZOOM_MIN     = 0.5f;
static constexpr float FRACTAL_ZOOM_MAX     = 4.0f;

static constexpr int   FRACTAL_DEPTH = 5;
static constexpr float FRACTAL_SPEED = 1.0f;

// powf exponent LUT for hueShift-dependent power: exponent = 0.3 + hueShift * 2.5, range ~0.3..2.8
static uint8_t FRACTAL_POW_LUT[256];
static float t = 0.0f;

void setup() {
  PFMath::buildSinLUT();
  // Initialize power LUT with default hueShift value
  float exp = 0.3f + hueShiftParam * 2.5f;
  PFColor::buildPowLUT(exp, FRACTAL_POW_LUT);
}

void update(float dt, const InputFrame& input) {
  flowParam    += input.knobDeltas[0] * FRACTAL_FLOW_STEP;
  if (flowParam < FRACTAL_FLOW_MIN) flowParam = FRACTAL_FLOW_MIN;
  if (flowParam > FRACTAL_FLOW_MAX) flowParam = FRACTAL_FLOW_MAX;

  cutoffParam  += input.knobDeltas[1] * FRACTAL_CUTOFF_STEP;
  if (cutoffParam < FRACTAL_CUTOFF_MIN) cutoffParam = FRACTAL_CUTOFF_MIN;
  if (cutoffParam > FRACTAL_CUTOFF_MAX) cutoffParam = FRACTAL_CUTOFF_MAX;

  hueShiftParam += input.knobDeltas[2] * FRACTAL_HUESHIFT_STEP;
  if (hueShiftParam < FRACTAL_HUESHIFT_MIN) hueShiftParam = FRACTAL_HUESHIFT_MIN;
  if (hueShiftParam > FRACTAL_HUESHIFT_MAX) hueShiftParam = FRACTAL_HUESHIFT_MAX;

  zoomParam    += input.knobDeltas[3] * FRACTAL_ZOOM_STEP;
  if (zoomParam < FRACTAL_ZOOM_MIN) zoomParam = FRACTAL_ZOOM_MIN;
  if (zoomParam > FRACTAL_ZOOM_MAX) zoomParam = FRACTAL_ZOOM_MAX;

  // Rebuild power LUT when hueShift changes
  float exp = 0.3f + hueShiftParam * 2.5f;
  PFColor::buildPowLUT(exp, FRACTAL_POW_LUT);

  t += dt * FRACTAL_SPEED;
  // t feeds sin/cos with 0.15 multiplier and wraps modulo 3 after, so fract is fine.
  // Also drives slow scroll ox/oy. Wrap at large period for both.
  if (t > 1000.0f * TWO_PI) t -= 1000.0f * TWO_PI;
}

void draw() {
  const float t_local = t;
  const float cutoff = cutoffParam;
  const float zoom = zoomParam;
  const float flow = flowParam;
  const int depth = FRACTAL_DEPTH;

  const float range = 3.0f / fmaxf(0.3f, zoom);
  const float offset = (3.0f - range) * 0.5f;

  const float ox = t_local * flow * 0.5f;
  const float oy = t_local * flow * 0.35f;

  const float invW = 1.0f / (float)PANEL_RES_W;
  const float invH = 1.0f / (float)PANEL_RES_H;

  const float angle = t_local * 0.15f;
  const float cosA = PFMath::fastCos(angle);
  const float sinA = PFMath::fastSin(angle);

  const float halfHole = cutoff * 0.5f;
  const float holeLo = 1.5f - halfHole;
  const float holeHi = 1.5f + halfHole;

  for (int y = 0; y < PANEL_RES_H; y++) {
    for (int x = 0; x < PANEL_RES_W; x++) {
      float px = ((float)x * invW) * range + offset + ox;
      float py = ((float)y * invH) * range + offset + oy;

      float cx = px - 1.5f;
      float cy = py - 1.5f;
      float rx = cx * cosA - cy * sinA;
      float ry = cx * sinA + cy * cosA;
      px = rx + 1.5f;
      py = ry + 1.5f;

      // Modulo 3 with positive result
      px = fmodf(fmodf(px, 3.0f) + 3.0f, 3.0f);
      py = fmodf(fmodf(py, 3.0f) + 3.0f, 3.0f);

      float isInside = 0.0f;
      for (int i = 0; i < depth; i++) {
        float fx = fmodf(px * 3.0f, 3.0f);
        float fy = fmodf(py * 3.0f, 3.0f);
        if (fx > holeLo && fx < holeHi && fy > holeLo && fy < holeHi) {
          isInside = 1.0f - (float)i / (float)depth;
          break;
        }
        px = fx;
        py = fy;
      }

      // Apply power via LUT: val = isInside ^ (0.3 + hueShift * 2.5)
      int li = (int)(isInside * 255.0f + 0.5f);
      uint8_t pv = FRACTAL_POW_LUT[li];
      float val = pv / 255.0f;

      if (val < 0.0f) val = 0.0f;
      if (val > 1.0f) val = 1.0f;

      int ri = (int)(val * 255.0f + 0.5f);
      PFCanvas::setPixel(x, y, RAMP_LUT[ri][0], RAMP_LUT[ri][1], RAMP_LUT[ri][2]);
    }
  }

  PFCanvas::present();
}

} // namespace FractalHoles