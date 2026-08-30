// Patternflow host <-> loadable pattern module ABI.
//
// Included by BOTH sides:
//   - firmware  (src/core_module_api.h fills PFHostAPI)
//   - modules   (abi/pf_module.h wraps it in the familiar PF* namespaces)
//
// Versioning, two numbers with different jobs:
//
//   PF_ABI_VERSION          the HOST API generation, passed to the module in
//                           PFHostAPI.abi_version. Frozen at 1: every module
//                           ever shipped checks it with `!=`, so raising it
//                           would refuse the entire installed catalog.
//   PF_ABI_MODULE_VERSION   what a freshly built module stamps into its
//                           descriptor. Raised to 2 when the absolute-param
//                           fields were APPENDED to PFInputFrame — the layout
//                           prefix is unchanged, so the new host still runs
//                           v1 modules, but a v2 module on a pre-absolute
//                           host would read past the host's InputFrame and
//                           see garbage in paramAbsoluteActive[]. The old
//                           loader's exact-match check (`!= 1`) is what turns
//                           that silent corruption into a clean refusal.
//
// The loader accepts descriptor versions PF_ABI_VERSION..PF_ABI_MODULE_VERSION.
// Only ever APPEND fields to these structs; reordering or resizing existing
// members breaks the v1 prefix contract and needs a real generation bump.
#pragma once

#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>

#define PF_ABI_VERSION 1
// Overridable per build (-DPF_ABI_MODULE_VERSION=1): a module whose source
// never touches the absolute-param fields does not need the newer host, so
// build_module.py stamps it 1 and it keeps installing on pre-absolute
// firmware. Only converted patterns claim 2 and accept being refused there.
#ifndef PF_ABI_MODULE_VERSION
#define PF_ABI_MODULE_VERSION 2
#endif

// Mirrors src/core_encoders.h::InputFrame exactly. Both sides are built with
// the same GCC for the same target, so layout matches field-for-field and
// pattern bodies can keep using `input.knobDeltas[i]` unchanged.
typedef struct PFInputFrame {
  long knobs[4];
  int knobDeltas[4];
  bool btnPressed[4];
  bool btnHeld[4];
  uint32_t now;
  // THE NAME IS A FOSSIL AND IT IS FROZEN. These are the generic LANES: an
  // absolute continuous reading, 0..1, that any source can put on a knob -
  // weather drives them from a temperature, the Chrome extension from a
  // browser tab, the microphone from the room. "Audio" is only who got here
  // first. Do not rename them: this struct is the ABI that compiled .pfm
  // modules read, so the name is frozen the way a wire format is - a rename
  // is a silent field-offset change inside every module already installed
  // on somebody's panel.
  bool knobAudioActive[4];
  float knobAudioValue[4];
  // Absolute bus 0..1000 (Director / Show manager). Appended — older
  // modules that never read these fields keep working without a rebuild.
  // Modules that DO read them must be built as PF_ABI_MODULE_VERSION 2.
  bool paramAbsoluteActive[4];
  uint16_t paramAbsolute[4];
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
