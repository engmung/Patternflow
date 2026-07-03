// ═══════════════════════════════════════════════════════════
// PatternFlow - Precomputed per-pixel coordinate tables
//
// For every pixel: distance (rT) and angle (thetaT) from the panel
// center, filled once at init. Patterns with fixed-center radial or
// angular structure (rings, spirals, vortices, kaleidoscopes) read
// these instead of calling sqrtf/atan2f per pixel — the two most
// expensive common per-pixel operations become free array reads.
//
// Units match the usual pattern convention: coordinates are centered
// and divided by PANEL_RES_H, so rT is in "screen heights" (0 at the
// center, 0.5 at the top/bottom edge) and thetaT is atan2f's -π..π.
//
// Memory: 2 × 32 KB float tables. Allocated from PSRAM when present
// (the reference R16N8 board has 8 MB); access is sequential in the
// pixel loop, so PSRAM's cache prefetch keeps it fast. Falls back to
// internal heap when PSRAM is absent.
//
// Usage — call PFTables::init() once from setup() (idempotent, cheap
// to call from every pattern, like PFMath::buildSinLUT):
//
//   void setup() { PFTables::init(); }
//   void draw() {
//     for (int y = 0; y < PANEL_RES_H; y++) {
//       const int row = y * PANEL_RES_W;
//       for (int x = 0; x < PANEL_RES_W; x++) {
//         const float r  = PFTables::rT[row + x];
//         const float th = PFTables::thetaT[row + x];
//         ...
//       }
//     }
//   }
//
// If a pattern needs a MOVING center, these tables do not apply —
// use sqrtf / PFMath::fastAtan2 with per-pixel deltas instead.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <math.h>
#include "config.h"

namespace PFTables {

inline float* rT = nullptr;      // distance from panel center, height units
inline float* thetaT = nullptr;  // angle from panel center, -π..π
inline bool ready = false;

inline int idx(int x, int y) {
  return y * PANEL_RES_W + x;
}

inline float* allocFloats(int count) {
  void* p = nullptr;
#if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)
  if (psramFound()) p = ps_malloc((size_t)count * sizeof(float));
#endif
  if (!p) p = malloc((size_t)count * sizeof(float));
  return (float*)p;
}

inline void init() {
  if (ready) return;
  const int N = PANEL_RES_W * PANEL_RES_H;
  rT = allocFloats(N);
  thetaT = allocFloats(N);
  if (!rT || !thetaT) {
    // Allocation failed (no PSRAM and internal heap exhausted). Leave the
    // tables unavailable rather than half-initialized.
    free(rT);
    free(thetaT);
    rT = nullptr;
    thetaT = nullptr;
    return;
  }

  const float halfW = PANEL_RES_W * 0.5f;
  const float halfH = PANEL_RES_H * 0.5f;
  const float invH = 1.0f / (float)PANEL_RES_H;
  for (int y = 0; y < PANEL_RES_H; y++) {
    const float ny = ((float)y - halfH) * invH;
    const int row = y * PANEL_RES_W;
    for (int x = 0; x < PANEL_RES_W; x++) {
      const float nx = ((float)x - halfW) * invH;
      rT[row + x] = sqrtf(nx * nx + ny * ny);
      thetaT[row + x] = atan2f(ny, nx);
    }
  }
  ready = true;
}

} // namespace PFTables
