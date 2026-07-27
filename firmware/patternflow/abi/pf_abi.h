// Patternflow host <-> loadable pattern module ABI.
//
// Included by BOTH sides:
//   - firmware  (src/core_module_api.h fills PFHostAPI)
//   - modules   (abi/pf_module.h wraps it in the familiar PF* namespaces)
//
// Bump PF_ABI_VERSION whenever any struct layout, field order, or calling
// convention below changes. The loader refuses modules whose version differs.
#pragma once

#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>

#define PF_ABI_VERSION 1

// Mirrors src/core_encoders.h::InputFrame exactly. Both sides are built with
// the same GCC for the same target, so layout matches field-for-field and
// pattern bodies can keep using `input.knobDeltas[i]` unchanged.
typedef struct PFInputFrame {
  long knobs[4];
  int knobDeltas[4];
  bool btnPressed[4];
  bool btnHeld[4];
  uint32_t now;
  bool knobAudioActive[4];
  float knobAudioValue[4];
} PFInputFrame;

// Services the firmware provides to a loaded module.
//
// Deliberately small: per-pixel work happens inside the module writing
// straight into `framebuffer`, so the only per-frame host call is present().
// Anything requiring hardware, shared panel-sized tables, or the heap lives
// here.
typedef struct PFHostAPI {
  uint32_t abi_version;

  // Panel geometry and the shared RGB888 canvas (row-major, 3 bytes/pixel,
  // panel_w * panel_h * 3 bytes). Owned by the host; valid for the lifetime
  // of the module.
  int32_t panel_w;
  int32_t panel_h;
  uint8_t* framebuffer;

  // Push framebuffer to the LED matrix (gamma / white balance / saturation
  // are applied host-side). Must be the last call of draw().
  void (*present)(void);

  // Zero the framebuffer.
  void (*clear)(void);

  // PSRAM-preferred zeroed allocation for framebuffer-sized module state.
  // Never freed — a module owns its buffers until reboot.
  void* (*alloc)(size_t bytes);

  // Serial diagnostics. vlogf backs the module-side Serial.printf shim.
  void (*log)(const char* msg);
  void (*vlogf)(const char* fmt, va_list ap);

  uint32_t (*millis)(void);
  uint32_t (*rand32)(void);

  // Panel-space polar lookup tables (radius / angle from panel centre),
  // indexed y * panel_w + x. Built on first use. Return NULL if allocation
  // failed, so callers must check.
  const float* (*tables_r)(void);
  const float* (*tables_theta)(void);
} PFHostAPI;

// What every .pfm exports.
typedef struct PFPatternModule {
  uint32_t abi_version;

  // Panel size the module was compiled for. The loader rejects a mismatch,
  // because patterns bake PANEL_RES_W/H into array sizes and loop bounds.
  int32_t panel_w;
  int32_t panel_h;

  const char* name;
  const char* const* knob_labels;  // exactly 4

  void (*setup)(void);
  void (*update)(float dt, const PFInputFrame* input);
  void (*draw)(void);
} PFPatternModule;

// The single symbol the loader resolves in a module image. The host calls it
// once after relocation; the module stores `api` and returns its descriptor.
// Returning NULL means "refuse to load".
#define PF_MODULE_ENTRY_SYMBOL "pf_module_entry"

#ifdef __cplusplus
extern "C" {
#endif
const PFPatternModule* pf_module_entry(const PFHostAPI* api);
#ifdef __cplusplus
}
#endif
