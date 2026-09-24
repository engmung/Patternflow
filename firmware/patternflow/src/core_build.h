// ═══════════════════════════════════════════════════════════
// PatternFlow - which image is running, as eight hex digits
//
// The version string names a release, and two different images can carry
// the same one: a local build, an edition, a fix flashed before the bump.
// The console needs to tell images apart exactly, because its page URLs
// carry ?v=<build> and a URL naming the running build is served immutable
// (core_send.h). A browser then keeps each page until the firmware changes,
// and not a moment longer.
//
// The source is the ELF's SHA-256, which esptool writes into the app
// descriptor at build time (elf2image --elf-sha256-offset 0xb0; the
// PlatformIO and Arduino IDE builds both pass it). The first four bytes are
// plenty to tell a handful of images apart. An image built without that
// step reads all zeros, and then a hash of the compile time and the version
// stands in: still different for every build, just not for every byte.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <esp_ota_ops.h>   // esp_ota_get_app_elf_sha256 (IDF 4.4)
#include "../net_config.h" // PF_IMPROV_FW_VERSION

namespace PFBuild {

// FNV-1a, 32-bit: the fallback's hash.
inline uint32_t fnv1a32(const char* s) {
  uint32_t h = 2166136261u;
  while (*s) {
    h ^= (uint8_t)*s++;
    h *= 16777619u;
  }
  return h;
}

// Fills out[9] with eight lowercase hex digits and a NUL.
inline void compute(char* out) {
  out[0] = '\0';
  esp_ota_get_app_elf_sha256(out, 9);
  bool stamped = strlen(out) == 8;
  if (stamped) {
    stamped = false;
    for (int i = 0; i < 8; ++i) {
      if (out[i] != '0') stamped = true;
    }
  }
  if (!stamped) {
    snprintf(out, 9, "%08x",
             (unsigned)fnv1a32(__DATE__ " " __TIME__ " " PF_IMPROV_FW_VERSION));
  }
}

// Computed once, on first use. A function-local static because the first
// callers race: /api/status and a page send can both be first, and the
// guarded initialisation makes the loser wait instead of reading half a
// string.
inline const char* id() {
  static char buf[9];
  static const bool ready = (compute(buf), true);
  (void)ready;
  return buf;
}

}  // namespace PFBuild
