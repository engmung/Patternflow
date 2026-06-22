// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: 0527
// Author:  Seunghun LEE
// Lineage: AI generated and curated
// Generated from web/src/lib/presets/pattern-0527.ts
//

#pragma once
#include <Arduino.h>
#include <math.h>
#include "../config.h"
#include "../src/core_display.h"
#include "../src/core_encoders.h"
#include "../src/core_canvas.h"
#include "../src/core_math.h"
#include "../src/core_color.h"
#include "../src/core_noise.h"

namespace Pattern0527 {
  const char* NAME = "0527";
  const char* const KNOB_LABELS[4] = {"Cluster Weight", "Rotation Rate", "Max Distance", "Normal Depth"};

  struct Params {
    float rawKnob0 = 0.4f;
    float rawKnob1 = 1.8f;
    float rawKnob2 = 0.6f;
    float rawKnob3 = 0.5f;
    float nodeCount = 4.0f;
    float speed = 1.8f;
    float linkDistance = 39.0f;
    float normalDepth = 0.5f;
    float time = 0.0f;
  };
  Params params;

  void setup() {
    PFMath::buildSinLUT();
    params.rawKnob0 = 0.4f;
    params.rawKnob1 = 1.8f;
    params.rawKnob2 = 0.6f;
    params.rawKnob3 = 0.5f;
    params.nodeCount = 4.0f;
    params.speed = 1.8f;
    params.linkDistance = 39.0f;
    params.normalDepth = 0.5f;
    params.time = 0.0f;
  }

  void update(float dt, const InputFrame& input) {
    params.rawKnob0 += input.knobDeltas[0] * 0.05f;
    if (params.rawKnob0 < 0.0f) params.rawKnob0 += 1.0f;
    params.rawKnob0 = fmodf(params.rawKnob0, 1.0f);

    params.rawKnob1 = constrain(params.rawKnob1 + input.knobDeltas[1] * 0.1f, 0.1f, 10.0f);

    params.rawKnob2 = constrain(params.rawKnob2 + input.knobDeltas[2] * 0.05f, 0.0f, 4.9f);

    params.rawKnob3 += input.knobDeltas[3] * 0.05f;
    if (params.rawKnob3 < 0.0f) params.rawKnob3 += 1.0f;
    params.rawKnob3 = fmodf(params.rawKnob3, 1.0f);

    params.nodeCount = 4 + floorf(params.rawKnob0 * 6);
    params.speed = params.rawKnob1;
    params.linkDistance = 15.0f + params.rawKnob2 * 40.0f;
    params.normalDepth = params.rawKnob3 * 1.0f;

    params.time += dt * params.speed;
  }

  struct Node { float x; float y; };

  void draw() {
    const int w = PANEL_RES_W;
    const int h = PANEL_RES_H;
    const float t = params.time;
    
    Node nodes[10];
    int nodeCount = params.nodeCount;
    if (nodeCount > 10) nodeCount = 10;

    for (int i = 0; i < nodeCount; i++) {
      float seed = PFMath::fastSin(i * 12.87f + 94.11f) * 742.12f;
      float cx = w * 0.5f + PFMath::fastCos(fmodf(seed, 1.0f) * 6.28f + t * 0.22f) * (w * 0.38f);
      float cy = h * 0.5f + PFMath::fastSin(fmodf(seed * 2.3f, 1.0f) * 6.28f + t * 0.4f) * (h * 0.35f);
      nodes[i] = { cx, cy };
    }

    // Clear background to pure black
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) PFCanvas::setPixel(x, y, 0, 0, 0);
    }

    // 1. 3D vector normal-mapped line drawing
    for (int i = 0; i < nodeCount; i++) {
      for (int j = i + 1; j < nodeCount; j++) {
        float dx = nodes[i].x - nodes[j].x;
        float dy = nodes[i].y - nodes[j].y;
        float dist = sqrtf(dx * dx + dy * dy);
        
        if (dist < params.linkDistance) {
          int xMin = max(0.0f, floorf(min(nodes[i].x, nodes[j].x)));
          int xMax = min((float)(w - 1), ceilf(max(nodes[i].x, nodes[j].x)));
          int yMin = max(0.0f, floorf(min(nodes[i].y, nodes[j].y)));
          int yMax = min((float)(h - 1), ceilf(max(nodes[i].y, nodes[j].y)));

          // Calculate line slope (direction vector) and normalize (Normal Vector)
          float nx = dx / dist;
          float ny = dy / dist;

          // Apply 3D space normal map formula (X->R, Y->G, Z->B)
          uint8_t rVal = (uint8_t)floorf((nx * 0.5f + 0.5f) * 255.0f);
          uint8_t gVal = (uint8_t)floorf((ny * 0.5f + 0.5f) * 255.0f);
          uint8_t bVal = (uint8_t)floorf(params.normalDepth * 255.0f);

          for (int ly = yMin; ly <= yMax; ly++) {
            for (int lx = xMin; lx <= xMax; lx++) {
              float cross = (lx - nodes[i].x) * (nodes[j].y - nodes[i].y) - (ly - nodes[i].y) * (nodes[j].x - nodes[i].x);
              
              if (abs(cross) / dist < 0.85f) {
                float dot = (lx - nodes[i].x) * (nodes[j].x - nodes[i].x) + (ly - nodes[i].y) * (nodes[j].y - nodes[i].y);
                float param = dot / (dist * dist);
                
                if (param >= 0.0f && param <= 1.0f) {
                  PFCanvas::setPixel(lx, ly, rVal, gVal, bVal);
                }
              }
            }
          }
        }
      }
    }

    // 2. White cross markers at node positions
    for (int n = 0; n < nodeCount; n++) {
      int cx = (int)floorf(nodes[n].x);
      int cy = (int)floorf(nodes[n].y);
      int len = 3;

      for (int k = -len; k <= len; k++) {
        if (cx + k >= 0 && cx + k < w && cy >= 0 && cy < h) PFCanvas::setPixel(cx + k, cy, 255, 255, 255);
        if (cx >= 0 && cx < w && cy + k >= 0 && cy + k < h) PFCanvas::setPixel(cx, cy + k, 255, 255, 255);
      }
    }

    PFCanvas::present();
  }
} // namespace Pattern0527
