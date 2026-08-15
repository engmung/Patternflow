// Patternflow module SDK — the ONLY header a loadable pattern includes.
//
// It provides the firmware's familiar surface (PFCanvas, PFMath, PFColor,
// PFNoise, PFTables, PFMem, PANEL_RES_*, InputFrame, the Arduino min/max
// helpers) so an existing preset body compiles unchanged after its include
// block is swapped for this one file. The pure-math parts are the firmware's
// own headers, included below rather than copied.
//
// Design note — the host boundary is deliberately thin: setPixel runs 8192x per
// frame, so the module writes straight into the host's framebuffer and only
// present() crosses per frame. Calling setPixel through a function pointer
// instead would be far worse.
//
// It is still NOT free. Measured on a 128x64 panel, the Origin pattern runs at
// 53 fps compiled in and 43 fps as a module — about 20% slower for identical
// source. That gap is not memory placement (it holds with every section in
// internal RAM), not optimisation level (-O2 buys ~2%), and not the framebuffer
// indirection (caching it in a module global made things worse). It is the cost
// of the relocatable code model itself, chiefly -mlongcalls. Budget for it.
//
// Panel size is baked in at build time (-DPF_PANEL_W / -DPF_PANEL_H) because
// patterns use PANEL_RES_W/H as array bounds. The loader rejects a module
// whose panel size differs from the running firmware's.
#pragma once

#include <math.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "pf_abi.h"
#include "pf_params.h"

#ifndef PF_PANEL_W
#error "PF_PANEL_W not defined - build modules with -DPF_PANEL_W=<panel width>"
#endif
#ifndef PF_PANEL_H
#error "PF_PANEL_H not defined - build modules with -DPF_PANEL_H=<panel height>"
#endif

#define PANEL_RES_W PF_PANEL_W
#define PANEL_RES_H PF_PANEL_H

// Same treatment config.h applies: typed constants instead of Arduino's
// object-like macros, so a pattern may shadow them with its own definitions.
#ifdef PI
#undef PI
#endif
#ifdef TWO_PI
#undef TWO_PI
#endif
#ifdef HALF_PI
#undef HALF_PI
#endif
#ifdef DEG_TO_RAD
#undef DEG_TO_RAD
#endif
#ifdef RAD_TO_DEG
#undef RAD_TO_DEG
#endif
#ifdef EULER
#undef EULER
#endif
constexpr float PI         = 3.14159265358979323846f;
constexpr float TWO_PI     = 6.28318530717958647693f;
constexpr float HALF_PI    = 1.57079632679489661923f;
constexpr float DEG_TO_RAD = 0.01745329251994329577f;
constexpr float RAD_TO_DEG = 57.29577951308232087680f;
constexpr float EULER      = 2.71828182845904523536f;

#ifndef min
#define min(a, b) ((a) < (b) ? (a) : (b))
#endif
#ifndef max
#define max(a, b) ((a) > (b) ? (a) : (b))
#endif
#ifndef abs
#define abs(x) ((x) > 0 ? (x) : -(x))
#endif
#ifndef constrain
#define constrain(amt, low, high) ((amt) < (low) ? (low) : ((amt) > (high) ? (high) : (amt)))
#endif

// Patterns declare update(float, const InputFrame&).
typedef PFInputFrame InputFrame;

// ── Host handle ──────────────────────────────────────────────────────
// Set by PF_REGISTER_PATTERN's entry point before setup() runs.
namespace PFHost {
inline const PFHostAPI* api = nullptr;
}

// ── Arduino compatibility shims ──────────────────────────────────────
inline uint32_t millis() { return PFHost::api->millis(); }
inline uint32_t esp_random() { return PFHost::api->rand32(); }
inline long random(long howbig) {
  if (howbig <= 0) return 0;
  return (long)(PFHost::api->rand32() % (uint32_t)howbig);
}
inline long random(long howsmall, long howbig) {
  if (howbig <= howsmall) return howsmall;
  return howsmall + random(howbig - howsmall);
}
inline void randomSeed(unsigned long) {}  // host RNG is already seeded

struct PFSerialShim {
  void print(const char* s) const { PFHost::api->log(s); }
  void println(const char* s) const {
    PFHost::api->log(s);
    PFHost::api->log("\n");
  }
  void println() const { PFHost::api->log("\n"); }
  void printf(const char* fmt, ...) const {
    va_list ap;
    va_start(ap, fmt);
    PFHost::api->vlogf(fmt, ap);
    va_end(ap);
  }
};
inline PFSerialShim Serial;

// ── PFMem ────────────────────────────────────────────────────────────
namespace PFMem {
inline void* alloc(size_t bytes) { return PFHost::api->alloc(bytes); }
inline float* allocFloats(int count) {
  return (float*)PFHost::api->alloc((size_t)count * sizeof(float));
}
}  // namespace PFMem

// A couple of patterns allocate with `new float[...]` and never free. Route
// that through the host allocator so modules never touch a libc heap that a
// freestanding link does not provide.
inline void* operator new(size_t bytes) { return PFHost::api->alloc(bytes); }
inline void* operator new[](size_t bytes) { return PFHost::api->alloc(bytes); }
inline void operator delete(void*) noexcept {}
inline void operator delete[](void*) noexcept {}
inline void operator delete(void*, size_t) noexcept {}
inline void operator delete[](void*, size_t) noexcept {}

// ── PFCanvas ─────────────────────────────────────────────────────────
// Mirrors src/core_canvas.h's logical-frame behaviour, but writes into the
// host framebuffer. present() delegates the gamma/WB/push work to the host.
namespace PFCanvas {

constexpr int W = PANEL_RES_W;
constexpr int H = PANEL_RES_H;


inline int frameW = W;
inline int frameH = H;
inline int frameOffX = 0;
inline int frameOffY = 0;
inline bool frameRotate = false;
inline bool frameDirect = true;

inline void clear() { PFHost::api->clear(); }

inline void resetFrame() {
  frameW = W;
  frameH = H;
  frameOffX = 0;
  frameOffY = 0;
  frameRotate = false;
  frameDirect = true;
}

inline void setFrame(int w, int h) {
  if (w <= 0 || h <= 0) {
    resetFrame();
    return;
  }
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
    frameOffX = 0;
    frameOffY = 0;
  } else {
    frameOffX = (W - w) / 2;
    frameOffY = (H - h) / 2;
  }
  clear();
}

inline void setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  // Read through the const api pointer rather than caching the framebuffer in
  // a module global: because PFHostAPI is const, GCC hoists this load out of
  // the pixel loop, whereas stores through a non-const global pointer force it
  // to reload that pointer after every write. Measured: caching it cost ~4%.
  uint8_t* fb = PFHost::api->framebuffer;
  if (frameDirect) {
    if ((unsigned)x >= (unsigned)W || (unsigned)y >= (unsigned)H) return;
    size_t i = ((size_t)y * W + x) * 3;
    fb[i] = r;
    fb[i + 1] = g;
    fb[i + 2] = b;
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
  fb[i] = r;
  fb[i + 1] = g;
  fb[i + 2] = b;
}

inline void present() {
  PFHost::api->present();
  resetFrame();
}

}  // namespace PFCanvas

// ── PFMath / PFColor / PFNoise ────────────────────────────────────
// Not reimplemented here. These three firmware headers are pure math with no
// Arduino or hardware dependency, so a module includes the SAME files the
// compiled-in presets use (PF_MODULE_BUILD drops their vestigial Arduino.h).
// A second copy would silently drift the moment one side is edited, and a
// module that computed noise differently from a preset would be a miserable
// bug to chase.
#include "core_color.h"
#include "core_math.h"
#include "core_noise.h"


// ── PFTables ─────────────────────────────────────────────────────────
// Panel-space polar tables are 32 KB each, so the host owns them and every
// module borrows the same allocation.
namespace PFTables {

inline const float* rT = nullptr;
inline const float* thetaT = nullptr;
inline bool ready = false;

inline int idx(int x, int y) { return y * PANEL_RES_W + x; }

inline void init() {
  if (ready) return;
  rT = PFHost::api->tables_r();
  thetaT = PFHost::api->tables_theta();
  ready = (rT != nullptr && thetaT != nullptr);
}

}  // namespace PFTables

// ── Module entry point ───────────────────────────────────────────────
// One line at the bottom of a pattern file:
//     PF_REGISTER_PATTERN(Pattern0510)
// It captures the host API and exposes the namespace's NAME / KNOB_LABELS /
// setup / update / draw through the ABI struct the loader expects.
#define PF_REGISTER_PATTERN(ns)                                              \
  namespace {                                                                \
  void pf__update_thunk(float dt, const PFInputFrame* input) {               \
    ns::update(dt, *input);                                                  \
  }                                                                          \
  /* Descriptor carries PF_ABI_MODULE_VERSION: this build reads the appended \
     absolute-param fields, and stamping 2 is what makes a pre-absolute      \
     loader (exact-match on 1) refuse it instead of feeding it garbage. */   \
  PFPatternModule pf__descriptor = {                                         \
      PF_ABI_MODULE_VERSION, PF_PANEL_W, PF_PANEL_H, nullptr, nullptr,       \
      nullptr,               nullptr,    nullptr,                            \
  };                                                                         \
  }                                                                          \
  extern "C" const PFPatternModule* pf_module_entry(const PFHostAPI* api) {  \
    if (!api || api->abi_version < PF_ABI_VERSION) return nullptr;           \
    if (api->panel_w != PF_PANEL_W || api->panel_h != PF_PANEL_H) return nullptr; \
    PFHost::api = api;                                                       \
    pf__descriptor.name = ns::NAME;                                          \
    pf__descriptor.knob_labels = ns::KNOB_LABELS;                            \
    pf__descriptor.setup = ns::setup;                                        \
    pf__descriptor.update = pf__update_thunk;                                \
    pf__descriptor.draw = ns::draw;                                          \
    return &pf__descriptor;                                                  \
  }
