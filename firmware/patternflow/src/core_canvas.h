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

// Per-channel gamma LUTs applied in present(). HUB75 panels are PWM-
// driven, so a linear 0–255 range crushes dark values into invisibility;
// gamma reshapes input so low values get more PWM time. Each channel
// gets its own curve because LED R/G/B have different luminance per PWM
// duty (red is brightest, blue is dimmest). The per-channel WB gain is
// pre-multiplied into the LUT so the inner loop costs the same as one
// LUT lookup — no extra runtime work for the calibration.
inline uint8_t gammaLUT_R[256];
inline uint8_t gammaLUT_G[256];
inline uint8_t gammaLUT_B[256];
inline bool gammaLUTReady = false;

// Saturation boost as 8.8 fixed-point. 256 = identity (no boost). Built
// once from LED_SAT_BOOST so present()'s inner loop avoids floats.
inline int satBoostQ8 = (int)(LED_SAT_BOOST * 256.0f + 0.5f);

inline void buildGammaLUT() {
  for (int i = 0; i < 256; i++) {
    float n = i / 255.0f;
    float rOut = powf(n, LED_GAMMA_R) * 255.0f * LED_WB_R + 0.5f;
    float gOut = powf(n, LED_GAMMA_G) * 255.0f * LED_WB_G + 0.5f;
    float bOut = powf(n, LED_GAMMA_B) * 255.0f * LED_WB_B + 0.5f;
    gammaLUT_R[i] = (uint8_t)(rOut > 255.0f ? 255.0f : (rOut < 0.0f ? 0.0f : rOut));
    gammaLUT_G[i] = (uint8_t)(gOut > 255.0f ? 255.0f : (gOut < 0.0f ? 0.0f : gOut));
    gammaLUT_B[i] = (uint8_t)(bOut > 255.0f ? 255.0f : (bOut < 0.0f ? 0.0f : bOut));
  }
  gammaLUTReady = true;
}

inline void clear() {
  memset(buffer, 0, BUFFER_BYTES);
}

// ── Logical frame ────────────────────────────────────────────────────
// A pattern is composed for some pixel grid, which is not always the
// panel's. A 64×128 pattern on a 128×64 panel is simply the device
// stood on its end — the pattern's "up" runs along the panel's x axis.
//
// draw() declares its grid with setFrame(); setPixel() then takes
// LOGICAL coordinates and this is the ONE place that maps them onto the
// panel. Patterns never do the rotation math themselves, which is what
// used to make them come out cropped or turned by 90°.
//
// The mapping is derived, not configured — there is no rotation setting
// to get out of sync with the pattern:
//
//   grid == panel            draw straight through (the default)
//   grid == panel swapped    rotate 90°, filling the panel exactly
//   anything else            centre it and letterbox the remainder
//
// present() restores the panel frame, so a pattern that never calls
// setFrame() is completely unaffected and can never inherit another
// pattern's grid. Every pattern written before this existed keeps
// writing the same pixels it always did.
inline int frameW = W;
inline int frameH = H;
inline int frameOffX = 0;
inline int frameOffY = 0;
inline bool frameRotate = false;
// Fast-path flag: true when logical == physical, which is the case for
// every stock pattern. Keeps the per-pixel cost at one predictable
// branch instead of the offset/rotate arithmetic.
inline bool frameDirect = true;

inline void resetFrame() {
  frameW = W;
  frameH = H;
  frameOffX = 0;
  frameOffY = 0;
  frameRotate = false;
  frameDirect = true;
}

inline void setFrame(int w, int h) {
  if (w <= 0 || h <= 0) { resetFrame(); return; }
  frameW = w;
  frameH = h;

  if (w == W && h == H) {
    frameOffX = 0;
    frameOffY = 0;
    frameRotate = false;
    frameDirect = true;
    return;
  }

  frameDirect = false;
  frameRotate = (w == H && h == W);
  if (frameRotate) {
    // An exact swap covers the panel with no leftover pixels.
    frameOffX = 0;
    frameOffY = 0;
  } else {
    frameOffX = (W - w) / 2;
    frameOffY = (H - h) / 2;
  }
  // Letterboxed and rotated frames leave panel pixels the pattern never
  // writes; without this they would hold the previous frame's image.
  clear();
}

inline void setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  if (frameDirect) {
    if ((unsigned)x >= (unsigned)W || (unsigned)y >= (unsigned)H) return;
    size_t i = ((size_t)y * W + x) * 3;
    buffer[i]     = r;
    buffer[i + 1] = g;
    buffer[i + 2] = b;
    return;
  }

  if ((unsigned)x >= (unsigned)frameW || (unsigned)y >= (unsigned)frameH) return;
  int px, py;
  if (frameRotate) {
    px = W - 1 - y;
    py = x;
  } else {
    px = x + frameOffX;
    py = y + frameOffY;
  }
  if ((unsigned)px >= (unsigned)W || (unsigned)py >= (unsigned)H) return;
  size_t i = ((size_t)py * W + px) * 3;
  buffer[i]     = r;
  buffer[i + 1] = g;
  buffer[i + 2] = b;
}

// Push the canvas to the LED matrix. The single point of contact
// between the rendering pipeline and dma_display.
//
// Per-pixel pipeline: saturation boost (8.8 fixed-point, pulls R/G/B
// away from gray luma) → per-channel gamma+WB LUT → dma_display. The
// saturation pass is mathematically a no-op for gray pixels and only
// adds ~6 int ops + 3 clamps per pixel, so the cost is well under a
// millisecond per frame.
inline void present() {
  if (!gammaLUTReady) buildGammaLUT();
  // Rec.601 luma weights scaled into 8-bit (77+150+29 = 256). Cheaper
  // than the standard /3 average and closer to perceptual gray, which
  // matters for the saturation pivot.
  const int sb = satBoostQ8;
  for (int y = 0; y < H; y++) {
    const uint8_t* row = buffer + (size_t)y * W * 3;
    for (int x = 0; x < W; x++) {
      int r = row[x * 3];
      int g = row[x * 3 + 1];
      int b = row[x * 3 + 2];

      int gray = (r * 77 + g * 150 + b * 29) >> 8;
      int dr = ((r - gray) * sb) >> 8;
      int dg = ((g - gray) * sb) >> 8;
      int db = ((b - gray) * sb) >> 8;
      r = gray + dr;
      g = gray + dg;
      b = gray + db;
      if (r < 0) r = 0; else if (r > 255) r = 255;
      if (g < 0) g = 0; else if (g > 255) g = 255;
      if (b < 0) b = 0; else if (b > 255) b = 255;

      dma_display->drawPixelRGB888(x, y,
        gammaLUT_R[r],
        gammaLUT_G[g],
        gammaLUT_B[b]);
    }
  }

  // Hand the next pattern a clean panel-sized frame. Every draw() ends
  // here, so a pattern's setFrame() can never leak into another one.
  resetFrame();
}

} // namespace PFCanvas
