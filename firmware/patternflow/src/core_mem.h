// ═══════════════════════════════════════════════════════════
// PatternFlow - Big-buffer allocation for patterns
//
// Every pattern's namespace statics live in internal DRAM from the
// moment the chip boots, whether or not that pattern is active — all
// preset headers are compiled into one image. A single framebuffer-
// sized array (128×64 floats = 32 KB) is a fifth of the DRAM the
// Wi-Fi stack and the HUB75 DMA driver have to share, and two of
// them were enough to boot-loop the device.
//
// So: framebuffer-sized state (trail maps, glow accumulators, per-
// pixel scratch) must NOT be a static array. Declare a pointer and
// allocate it once from setup():
//
//   static float* trail = nullptr;
//   void setup() {
//     if (!trail) trail = PFMem::allocFloats(PANEL_RES_W * PANEL_RES_H);
//   }
//
// Allocation prefers PSRAM (8 MB on the reference R16N8 board) and
// falls back to internal heap when PSRAM is absent. Returned memory
// is zeroed. Pattern setup() runs once at boot and never again, so
// there is no free() path — treat the buffer as owned for the life
// of the firmware. Guard update()/draw() with `if (!trail) return;`
// so an allocation failure degrades to a blank pattern, not a crash.
//
// Small fixed state (a few dozen particles, knob values) is fine as
// plain statics — this is only for the big per-pixel buffers.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <string.h>

namespace PFMem {

inline void* alloc(size_t bytes) {
  void* p = nullptr;
#if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)
  if (psramFound()) p = ps_malloc(bytes);
#endif
  if (!p) p = malloc(bytes);
  if (p) memset(p, 0, bytes);
  return p;
}

inline float* allocFloats(int count) {
  return (float*)alloc((size_t)count * sizeof(float));
}

} // namespace PFMem
