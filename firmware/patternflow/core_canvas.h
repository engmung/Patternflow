// ═══════════════════════════════════════════════════════════
// PatternFlow - Off-screen canvas (decouples patterns from the LED driver)
//
// Patterns draw into a 128×64 RGB888 buffer instead of touching
// dma_display directly. Renderer::present() is the single place that
// pushes the buffer to the HUB75 panel and flips the DMA buffer.
//
// Why: with patterns writing pixels directly, every pattern had to
// know about dma_display, gamma, brightness, and DMA double-buffer
// timing. The canvas makes "rendering" a separate concern from
// "pattern logic" — output post-processing (gamma, color temperature,
// global brightness) lives here, in one place, not duplicated in
// every pattern.
//
// Cost: 24 KB of RAM for the RGB888 buffer + one extra pixel copy
// per frame.
//
// Status: the canvas is opt-in for now. Patterns that have been
// migrated call PFCanvas::setPixel(); legacy patterns still call
// dma_display->drawPixelRGB888() and bypass the canvas. Main loop
// calls PFCanvas::present() after pattern->draw() runs.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "config.h"

extern MatrixPanel_I2S_DMA *dma_display;

namespace PFCanvas {

constexpr int W = PANEL_RES_W;
constexpr int H = PANEL_RES_H;
constexpr size_t BUFFER_BYTES = (size_t)W * H * 3;

inline uint8_t buffer[BUFFER_BYTES];

inline void clear() {
  memset(buffer, 0, BUFFER_BYTES);
}

inline void setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  if ((unsigned)x >= (unsigned)W || (unsigned)y >= (unsigned)H) return;
  size_t i = ((size_t)y * W + x) * 3;
  buffer[i]     = r;
  buffer[i + 1] = g;
  buffer[i + 2] = b;
}

// Push the canvas to the LED matrix. The single point of contact
// between the rendering pipeline and dma_display.
inline void present() {
  for (int y = 0; y < H; y++) {
    const uint8_t* row = buffer + (size_t)y * W * 3;
    for (int x = 0; x < W; x++) {
      dma_display->drawPixelRGB888(x, y, row[x * 3], row[x * 3 + 1], row[x * 3 + 2]);
    }
  }
}

} // namespace PFCanvas
