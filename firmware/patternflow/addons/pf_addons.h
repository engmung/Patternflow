// ═══════════════════════════════════════════════════════════
// PatternFlow - addon dispatch
//
// Walks the list in addons/addons.h and fans each moment out. The sketch
// calls these; it never names an addon.
//
// Cost is a null check per addon per hook — a handful of comparisons per
// frame against a multi-million-cycle budget.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "pf_addon.h"
#include "addons.h"   // defines PF_ADDONS[] and PF_ADDON_COUNT

namespace PFAddons {

inline void setup() {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->setup) PF_ADDONS[i]->setup();
  }
}

inline void onNetwork() {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->onNetwork) PF_ADDONS[i]->onNetwork();
  }
}

inline void loop(const PFAddonFrame& frame) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->loop) PF_ADDONS[i]->loop(frame);
  }
}

inline void fillInput(InputFrame& input) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->fillInput) PF_ADDONS[i]->fillInput(input);
  }
}

inline void observeFrame(const InputFrame& input, const char* patternName) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->observeFrame) PF_ADDONS[i]->observeFrame(input, patternName);
  }
}

inline void onSleep(bool sleeping) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->onSleep) PF_ADDONS[i]->onSleep(sleeping);
  }
}

// First request wins the frame; the next is served on the frame after.
inline bool requestSleep(bool* sleeping) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->requestSleep && PF_ADDONS[i]->requestSleep(sleeping)) return true;
  }
  return false;
}

inline void appendStatus(String& json) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->appendStatus) PF_ADDONS[i]->appendStatus(json);
  }
}

inline void onUserInput() {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->onUserInput) PF_ADDONS[i]->onUserInput();
  }
}

// True while any addon is driving the pattern, so remote pattern pickers
// stand down instead of fighting it.
inline bool patternClaimed() {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->claimsPattern && PF_ADDONS[i]->claimsPattern()) return true;
  }
  return false;
}

// First addon with a pending pattern request wins the frame; the next one
// is served on the frame after. Requests are edges, not levels, so nothing
// is lost by taking them one at a time.
inline bool takePattern(int* idx) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->takePattern && PF_ADDONS[i]->takePattern(idx)) return true;
  }
  return false;
}

inline void drawOverlay(const PFAddonFrame& frame) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->drawOverlay) PF_ADDONS[i]->drawOverlay(frame);
  }
}

// Feeds /api/status caps. Returns the addon's cap string or null.
inline const char* capAt(size_t i) {
  return i < PF_ADDON_COUNT ? PF_ADDONS[i]->cap : nullptr;
}
inline size_t count() { return PF_ADDON_COUNT; }

}  // namespace PFAddons
