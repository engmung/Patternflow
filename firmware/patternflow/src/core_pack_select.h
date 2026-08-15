// ═══════════════════════════════════════════════════════════
// PatternFlow - Director-marked modules for /patterns ZIP export
//
// MQTT (Director mode) writes this list; the Patterns page reads it and
// checks those rows. RAM only — send again after reboot.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "../pattern_registry.h"

namespace PatternflowPackSelect {

constexpr uint8_t MAX = 64;

inline uint32_t rev = 0;
inline uint8_t count = 0;
inline char slugs[MAX][MODULE_NAME_BYTES] = {};

inline void bump() {
  rev++;
  if (rev == 0) rev = 1;
}

inline void clear() {
  count = 0;
  bump();
}

inline bool has(const char* slug) {
  if (!slug || !slug[0]) return false;
  for (uint8_t i = 0; i < count; i++) {
    if (strcasecmp(slugs[i], slug) == 0) return true;
  }
  return false;
}

// True if the slug is now in the list (already present or newly added).
inline bool add(const char* slug) {
  if (!slug || !slug[0]) return false;
  if (has(slug)) return true;
  if (count >= MAX) return false;
  snprintf(slugs[count], MODULE_NAME_BYTES, "%s", slug);
  count++;
  return true;
}

}  // namespace PatternflowPackSelect
