#pragma once
#include <math.h>
#include "core_display.h"

namespace Origin {
  const char* NAME = "Origin";
  const char* KNOB_LABELS[4] = {"hue", "speed", "scale", "displace"};

  struct Params {
    float hue      = 0.0f;
    float speed    = 2.0f;
    float scale    = 1.0f;
    float displace = 0.0f;
  };
  Params params;

  // Swap this with any C++ Matrix 32x32 / 32x16 / 16x16 / 16x8
  // You can use pixelgarden.cc to convert any image to Matrix code
  const uint8_t PALETTE[2][3] = {
    {255,64,19}, {0,0,0}
  };

  const uint8_t PALETTE[2][3] = {
    {177,140,254}, {255,251,185}
  };

  const uint8_t LED[16][32] = {
    {2,2,2,2,1,1,1,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,1},
    {2,2,2,1,1,2,2,2,2,2,2,2,1,2,1,1,1,2,1,2,2,1,2,1,1,1,1,2,2,1,1,1},
    {2,2,2,1,1,2,2,2,1,2,2,2,1,1,1,1,1,1,1,2,2,1,2,2,2,1,1,2,2,1,1,1},
    {2,2,2,1,2,1,1,1,1,2,2,2,1,1,1,1,1,1,1,2,2,1,2,2,2,2,1,2,2,1,1,1},
    {2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,1,1,1,2,2,2,2,1,2},
    {2,2,2,2,1,2,2,2,2,2,2,2,2,2,1,2,2,1,2,2,2,2,2,1,1,1,2,2,2,2,2,2},
    {2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2},
    {2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2},
    {2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2},
    {2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2},
    {2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2},
    {2,2,1,1,1,2,2,2,1,1,1,1,1,2,2,1,2,2,1,1,1,1,1,2,2,2,1,2,2,2,2,2},
    {2,2,2,1,1,2,2,2,1,1,2,2,1,2,2,1,2,2,1,2,2,1,1,2,2,2,1,2,2,2,2,2},
    {2,2,2,1,2,2,2,2,1,1,2,2,1,2,2,2,1,2,2,1,2,1,1,2,2,2,1,2,2,2,2,2},
    {2,2,2,2,2,2,2,2,1,1,2,2,2,2,1,2,1,2,2,2,2,1,1,2,2,2,1,2,2,2,2,2},
    {2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2}
  };

  const int BMP_H = sizeof(LED) / sizeof(LED[0]);
  const int BMP_W = sizeof(LED[0]) / sizeof(LED[0][0]);

  float phase = 0.0f;

  const int SIN_LUT_SIZE = 256;
  float sinLUT[SIN_LUT_SIZE];

  void buildSinLUT() {
    for (int i = 0; i < SIN_LUT_SIZE; i++)
      sinLUT[i] = sinf((float)i / SIN_LUT_SIZE * 2.0f * PI);
  }

  inline float fastSin(float x) {
    float norm = x / (2.0f * PI);
    norm -= floorf(norm);
    if (norm < 0) norm += 1.0f;
    return sinLUT[(int)(norm * SIN_LUT_SIZE) & (SIN_LUT_SIZE - 1)];
  }

  void shiftColor(float r, float g, float b, float hueDeg,
                  uint8_t &or_, uint8_t &og, uint8_t &ob) {
    float t = hueDeg / 360.0f;
    float s = sinf(t * 2.0f * PI);
    float c = cosf(t * 2.0f * PI);
    float nr = r * c + g * s;
    float ng = g * c - r * s;
    float nb = b;
    or_ = (uint8_t)constrain(nr, 0.0f, 255.0f);
    og  = (uint8_t)constrain(ng, 0.0f, 255.0f);
    ob  = (uint8_t)constrain(nb, 0.0f, 255.0f);
  }

  void setup() {
    buildSinLUT();
    phase = 0.0f;
  }

  void update(float dt, const InputFrame& input) {
    int d0 = input.knobDeltas[0];
    if (d0 != 0) {
      params.hue = fmodf(params.hue + d0 * 5.0f, 360.0f);
      if (params.hue < 0) params.hue += 360.0f;
    }
    if (input.btnPressed[0]) params.hue = 0.0f;

    int d1 = input.knobDeltas[1];
    if (d1 != 0)
      params.speed = constrain(params.speed + d1 * 0.1f, 0.0f, 5.0f);
    if (input.btnPressed[1]) params.speed = 2.0f;

    int d2 = input.knobDeltas[2];
    if (d2 != 0)
      params.scale = constrain(params.scale + d2 * 0.1f, 0.25f, 4.0f);
    if (input.btnPressed[2]) params.scale = 1.0f;

    int d3 = input.knobDeltas[3];
    if (d3 != 0)
      params.displace = fmodf(params.displace + d3 * 1.0f, BMP_H * params.scale);
    if (input.btnPressed[3]) params.displace = 0.0f;

    phase += dt * params.speed;
  }

  void draw() {
    float cellW = params.scale;
    float cellH = params.scale;

    // 90° CW: sprite footprint is BMP_H wide, BMP_W tall
    float spriteW = BMP_H * cellW;
    float spriteH = BMP_W * cellH;

    int tilesX = (int)ceilf((float)PANEL_RES_W / spriteW) + 1;
    int tilesY = (int)ceilf((float)PANEL_RES_H / spriteH) + 1;

    float scrollX = fmodf(params.displace, spriteW);
    if (scrollX > 0) scrollX -= spriteW;

    for (int y = 0; y < PANEL_RES_H; y++)
      for (int x = 0; x < PANEL_RES_W; x++)
        dma_display->drawPixelRGB888(x, y, 0, 0, 0);

    for (int ty = 0; ty < tilesY; ty++) {
      for (int tx = 0; tx < tilesX; tx++) {
        float tileOriginX = scrollX + tx * spriteW;
        float tileOriginY =           ty * spriteH;

        if (tileOriginX >= PANEL_RES_W) continue;
        if (tileOriginY >= PANEL_RES_H) continue;
        if (tileOriginX + spriteW <= 0) continue;
        if (tileOriginY + spriteH <= 0) continue;

        // after 90° CW: x iterates over BMP_H, y over BMP_W
        for (int y = 0; y < BMP_W; y++) {
          for (int x = 0; x < BMP_H; x++) {
            // 90° CW mapping: new(x,y) = old(BMP_H-1-x, y)
            if (LED[BMP_H - 1 - x][y] != 1) continue;

            float wave  = fastSin(phase * 2.0f + x / 3.0f + y / 3.0f);
            float pulse = 0.5f + 0.5f * wave;

            uint8_t fr, fg, fb;
            shiftColor(PALETTE[0][0] * pulse,
                       PALETTE[0][1] * pulse,
                       PALETTE[0][2] * pulse,
                       params.hue, fr, fg, fb);

            int px0 = (int)(tileOriginX + x * cellW);
            int py0 = (int)(tileOriginY + y * cellH);
            int px1 = (int)(tileOriginX + (x + 1) * cellW);
            int py1 = (int)(tileOriginY + (y + 1) * cellH);

            if (px1 <= 0 || px0 >= PANEL_RES_W) continue;
            if (py1 <= 0 || py0 >= PANEL_RES_H) continue;

            px0 = constrain(px0, 0, PANEL_RES_W - 1);
            py0 = constrain(py0, 0, PANEL_RES_H - 1);
            px1 = constrain(px1, 0, PANEL_RES_W);
            py1 = constrain(py1, 0, PANEL_RES_H);

            for (int py = py0; py < py1; py++)
              for (int px = px0; px < px1; px++)
                dma_display->drawPixelRGB888(px, py, fr, fg, fb);
          }
        }
      }
    }
  }
}