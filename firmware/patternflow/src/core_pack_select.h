// ═══════════════════════════════════════════════════════════
// PatternFlow - remotely marked modules for /patterns ZIP export
//
// A list of module slugs somebody selected from OUTSIDE the panel; the
// Patterns page (core) reads it and pre-checks those rows for download.
// Whatever drives a remote selection writes it — today that is a Director
// session over MQTT, tomorrow it could be anything — which is why the list
// is core ground rather than a feature's: the reader is the core's own page.
// RAM only — send again after reboot.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "../pattern_registry.h"
#include "core_mem.h"

namespace PatternflowPackSelect {

constexpr uint8_t MAX = 64;

inline uint32_t rev = 0;
inline uint8_t count = 0;
// 2.5 KB, used only while something is marking modules — PSRAM on first
// use, never internal DRAM (PFMem, core_mem.h: internal heap is the console's).
inline char (*slugs)[MODULE_NAME_BYTES] = nullptr;

inline void bump() {
  rev++;
  if (rev == 0) rev = 1;
}

inline void clear() {
  count = 0;
  bump();
}

inline bool has(const char* slug) {
  if (!slugs || !slug || !slug[0]) return false;
  for (uint8_t i = 0; i < count; i++) {
    if (strcasecmp(slugs[i], slug) == 0) return true;
  }
  return false;
}

// True if the slug is now in the list (already present or newly added).
inline bool add(const char* slug) {
  if (!slug || !slug[0]) return false;
  if (!slugs) {
    slugs = (char(*)[MODULE_NAME_BYTES])PFMem::alloc(
        (size_t)MAX * MODULE_NAME_BYTES);
    if (!slugs) return false;
  }
  if (has(slug)) return true;
  if (count >= MAX) return false;
  snprintf(slugs[count], MODULE_NAME_BYTES, "%s", slug);
  count++;
  return true;
}

}  // namespace PatternflowPackSelect
