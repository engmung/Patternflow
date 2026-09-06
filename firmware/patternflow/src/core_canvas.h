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
#include "core_loop_sync.h"   // onLoopTask(): present() belongs to the frame
// Vendored HUB75 driver (src/hub75/), not the Library Manager copy: it
// carries one addition, blitRGB888(), that upstream has no equivalent for.
// See src/hub75/VENDORED.md.
#include "hub75/ESP32-HUB75-MatrixPanel-I2S-DMA.h"
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

// Runtime copies of the config.h calibration constants. /api/display (see
// core_display_http.h) edits these live so white balance and saturation can be
// tuned by eye against the physical panel instead of by reflashing per guess;
// the converged numbers then become the config.h defaults. Setters only clear
// gammaLUTReady — present() already rebuilds the LUT lazily, so a handler
// never does the powf work itself. Values reset to config.h on reboot.
inline float gammaR = LED_GAMMA_R;
inline float gammaG = LED_GAMMA_G;
inline float gammaB = LED_GAMMA_B;
inline float wbR = LED_WB_R;
inline float wbG = LED_WB_G;
inline float wbB = LED_WB_B;
inline float satBoost = LED_SAT_BOOST;

// Saturation boost as 8.8 fixed-point. 256 = identity; below 256 desaturates
// toward luma (the blit's math is y + (c - y) * q8 >> 8, so both directions
// work). Built once from LED_SAT_BOOST so present()'s inner loop avoids floats.
inline int satBoostQ8 = (int)(LED_SAT_BOOST * 256.0f + 0.5f);

inline void setSatBoost(float boost) {
  satBoost = boost;
  satBoostQ8 = (int)(boost * 256.0f + 0.5f);
}

inline void buildGammaLUT() {
  for (int i = 0; i < 256; i++) {
    float n = i / 255.0f;
    float rOut = powf(n, gammaR) * 255.0f * wbR + 0.5f;
    float gOut = powf(n, gammaG) * 255.0f * wbG + 0.5f;
    float bOut = powf(n, gammaB) * 255.0f * wbB + 0.5f;
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
// Share of a frame spent pushing the canvas to the panel, smoothed, in µs.
// Reported by /status next to frameUs, because "this pattern is slow" has two
// very different causes and this is what tells them apart: heavy per-pixel
// maths in the pattern, or the fixed cost of getting a frame out.
inline uint32_t presentUs = 0;

// A frame filter, run once per present() before the blit. Whoever is
// registered here is handed the finished canvas and may answer with a
// different buffer to show instead - its own scratch with something composed
// over the pattern - or null to show the canvas as it is. The canvas itself
// is never touched on this path: patterns that accumulate across frames
// (trails, feedback) own its contents, and post-processing them in place
// would compound every frame. The sketch wires this to the feature
// dispatcher; the core does not know who answers.
typedef const uint8_t* (*ComposeFn)(const uint8_t* canvas, int w, int h);
inline ComposeFn composeHook = nullptr;

inline void present() {
  // The panel is the loop task's. A module's setup() now runs on a loader
  // task (pattern_registry.h) while the loop keeps drawing, and a setup()
  // that presents from there would blit into a frame the loop is flipping.
  // Before attach() there is no loop task yet and this is a no-op.
  if (!PFLoopSync::onLoopTask()) return;
  uint32_t presentStartedUs = micros();
  if (!gammaLUTReady) buildGammaLUT();

  const uint8_t* shown = buffer;
  if (composeHook) {
    const uint8_t* alt = composeHook(buffer, W, H);
    if (alt) shown = alt;
  }

  // One call for the whole frame instead of 8,192 per-pixel calls.
  //
  // The driver's per-pixel entry point cannot do this: it is handed one (x, y)
  // at a time, so it re-derives the row pointer for every colour-depth plane
  // and read-modify-writes each plane twice per word — the top and bottom
  // halves of a two-scan panel share a uint16_t but arrive as separate calls.
  // Blitting a whole frame knows both halves at once and knows the row pointers
  // are constant across a row. Measured on this panel: 12.3 ms per-pixel,
  // 9.9 ms with the row pointers hoisted, 7.0 ms since the bitplane
  // transpose became two table reads per channel (3.9.2) -> see /status.
  //
  // Saturation boost and the gamma/WB LUTs are applied inside the blit, so the
  // canvas buffer keeps the pattern's raw values. Post-processing in place here
  // would compound gamma every frame for any pattern that does not rewrite
  // every pixel.
  dma_display->blitRGB888(shown, gammaLUT_R, gammaLUT_G, gammaLUT_B, satBoostQ8);

  uint32_t us = micros() - presentStartedUs;
  presentUs = presentUs ? (presentUs * 7 + us) / 8 : us;

  // Hand the next pattern a clean panel-sized frame. Every draw() ends
  // here, so a pattern's setFrame() can never leak into another one.
  resetFrame();
}

} // namespace PFCanvas
