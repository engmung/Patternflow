#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace CrystalCascade {

const char* NAME = "Crystal Cascade";
const char* const KNOB_LABELS[4] = {"CellSize", "DownSpeed", "PhaseWarp", "EdgeGlow"};

constexpr int FRAME_W = 64;
constexpr int FRAME_H = 128;

static float knobCellSize = 4.0f;
static float knobDownSpeed = 0.96f;
static float knobPhaseWarp = 4.096f;
static float knobEdgeGlow = 2.0f;

static float patternTime = 0.0f;

static const uint8_t RAMP_LUT[256][3] = {
  {0,0,0},{0,0,3},{0,1,5},{0,1,8},{0,2,11},{0,2,14},{0,3,16},{0,3,19},
  {0,4,22},{0,4,25},{0,5,27},{0,5,30},{0,5,33},{0,6,36},{0,6,38},{0,7,41},
  {0,7,44},{0,8,47},{0,8,49},{0,9,52},{0,9,55},{0,10,58},{0,10,60},{0,10,63},
  {0,11,66},{0,11,69},{0,12,71},{0,12,74},{0,13,77},{0,13,80},{0,14,82},{0,14,85},
  {0,14,88},{0,15,91},{0,15,93},{0,16,96},{0,16,99},{0,17,102},{0,17,104},{0,18,107},
  {0,18,110},{0,19,113},{0,19,115},{0,19,118},{0,20,121},{0,20,124},{0,21,126},{0,21,129},
  {0,22,132},{0,22,135},{0,23,137},{0,23,140},{0,24,143},{0,24,146},{0,24,148},{0,25,151},
  {0,25,154},{0,26,157},{0,26,159},{0,27,162},{0,27,165},{0,28,168},{0,28,170},{0,29,173},
  {0,29,176},{0,29,179},{0,30,181},{0,30,184},{0,31,187},{0,31,190},{0,32,192},{0,32,195},
  {0,33,198},{0,33,201},{0,33,203},{0,34,206},{0,34,209},{0,35,212},{0,35,214},{0,36,217},
  {0,36,220},{0,37,223},{0,37,225},{0,38,228},{0,38,231},{0,38,234},{0,39,236},{0,39,239},
  {0,40,242},{0,40,245},{0,41,247},{0,41,250},{0,42,253},{1,42,255},{3,44,253},{6,46,251},
  {9,48,249},{12,49,247},{15,51,246},{17,53,244},{20,55,242},{23,57,240},{26,58,238},{29,60,237},
  {32,62,235},{34,64,233},{37,66,231},{40,67,229},{43,69,228},{46,71,226},{49,73,224},{51,74,222},
  {54,76,220},{57,78,219},{60,80,217},{63,82,215},{65,83,213},{68,85,211},{71,87,210},{74,89,208},
  {77,90,206},{80,92,204},{82,94,202},{85,96,201},{88,98,199},{91,99,197},{94,101,195},{97,103,193},
  {99,105,191},{102,107,190},{105,108,188},{108,110,186},{111,112,184},{114,114,182},{116,115,181},{119,117,179},
  {122,119,177},{125,121,175},{128,123,173},{130,124,172},{133,126,170},{136,128,168},{139,130,166},{142,131,164},
  {145,133,163},{147,135,161},{150,137,159},{153,139,157},{156,140,155},{159,142,154},{162,144,152},{164,146,150},
  {167,148,148},{170,149,146},{173,151,145},{176,153,143},{178,155,141},{181,156,139},{184,158,137},{187,160,135},
  {190,162,134},{193,164,132},{195,165,130},{198,167,128},{201,169,126},{204,171,125},{207,173,123},{210,174,121},
  {212,176,119},{215,178,117},{218,180,116},{221,181,114},{224,183,112},{226,185,110},{229,187,108},{232,189,107},
  {235,190,105},{238,192,103},{241,194,101},{243,196,99},{246,197,98},{249,199,96},{252,201,94},{255,203,92},
  {255,210,115},{255,219,141},{255,227,166},{255,235,192},{255,243,218},{255,251,243},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
  {255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},{255,255,255},
};

void setup() {
  PFMath::buildSinLUT();
  patternTime = 0.0f;
}

void update(float dt, const InputFrame& input) {
  knobCellSize += input.knobDeltas[0] * 0.05f;
  knobCellSize = fminf(16.0f, fmaxf(4.0f, knobCellSize));

  knobDownSpeed += input.knobDeltas[1] * 0.1f;
  knobDownSpeed = fminf(3.0f, fmaxf(0.2f, knobDownSpeed));

  knobPhaseWarp += input.knobDeltas[2] * 0.05f;
  knobPhaseWarp = fminf(6.0f, fmaxf(0.5f, knobPhaseWarp));

  knobEdgeGlow += input.knobDeltas[3] * 0.05f;
  knobEdgeGlow = fminf(2.0f, fmaxf(0.0f, knobEdgeGlow));

  patternTime += dt * knobDownSpeed;

  constexpr float WRAP_PERIOD = TWO_PI * 1000.0f;
  if (patternTime > WRAP_PERIOD) {
    patternTime -= WRAP_PERIOD;
  }
}

void draw() {
  PFCanvas::setFrame(FRAME_W, FRAME_H);

  const float size = knobCellSize;
  const float warp = knobPhaseWarp;
  const float glow = fmaxf(0.001f, knobEdgeGlow);
  const float invSize = 1.0f / size;
  const float halfSize = size * 0.5f;
  const float invGlowDiv = 1.0f / (glow * 0.4f);
  const float t20 = patternTime * 20.0f;
  const float tWarp = patternTime * warp;
  const float frameWf = (float)FRAME_W;

  for (int y = 0; y < FRAME_H; y++) {
    const float yShift = (float)y + t20;
    const int row = (int)floorf(yShift * invSize);
    const int rowMod2 = row % 2;
    const float rowOffset = (float)rowMod2 * halfSize;
    const float cy = (float)row * size + halfSize;
    const float dy = fabsf(yShift - cy);
    const float rowPhase = (float)row * 0.5f + tWarp;

    for (int x = 0; x < FRAME_W; x++) {
      const int col = (int)floorf(((float)x + rowOffset) * invSize);
      const float cx = (float)col * size + rowOffset + halfSize;

      float cxMod = fmodf(cx, frameWf);
      if (cxMod < 0.0f) cxMod += frameWf;

      const float dx = fabsf((float)x - cxMod);
      const float edgeDist = fmaxf(dx, dy) / halfSize;

      const float angle = (float)col * 0.7f + rowPhase;
      const float phase = PFMath::fastSin(angle);

      float v = expf(-fabsf(edgeDist - 0.8f) * invGlowDiv);
      v *= (0.5f + 0.5f * phase);

      v = fminf(1.0f, fmaxf(0.0f, v));

      int li = (int)(v * 255.0f + 0.5f);
      if (li < 0) li = 0;
      if (li > 255) li = 255;

      PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
    }
  }

  PFCanvas::present();
}

} // namespace CrystalCascade