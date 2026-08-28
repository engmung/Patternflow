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

inline void observeFrame(const InputFrame& input, const PFAddonFrame& frame) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->observeFrame) PF_ADDONS[i]->observeFrame(input, frame);
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

// Addons the device menu can list and toggle: those that expose both
// runtime hooks and a short name.
inline bool isToggleable(size_t i) {
  return i < PF_ADDON_COUNT && PF_ADDONS[i]->shortName &&
         PF_ADDONS[i]->isRuntimeEnabled && PF_ADDONS[i]->setRuntimeEnabled;
}

inline size_t toggleableCount() {
  size_t n = 0;
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (isToggleable(i)) n++;
  }
  return n;
}

// The nth toggleable addon, by menu order. Returns PF_ADDON_COUNT when
// there is no nth one.
inline size_t toggleableAt(size_t nth) {
  size_t n = 0;
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (!isToggleable(i)) continue;
    if (n == nth) return i;
    n++;
  }
  return PF_ADDON_COUNT;
}

inline const char* shortName(size_t i) {
  return i < PF_ADDON_COUNT ? PF_ADDONS[i]->shortName : "";
}

inline bool runtimeEnabled(size_t i) {
  return i < PF_ADDON_COUNT && PF_ADDONS[i]->isRuntimeEnabled &&
         PF_ADDONS[i]->isRuntimeEnabled();
}

inline void setRuntimeEnabled(size_t i, bool on) {
  if (i < PF_ADDON_COUNT && PF_ADDONS[i]->setRuntimeEnabled) {
    PF_ADDONS[i]->setRuntimeEnabled(on);
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
// Which addon answered changes what the sketch should do afterwards. An
// addon that CLAIMS the pattern owns what is on the panel for as long as
// it runs — a show cycling through cues — so its choices are transient and
// must not be written to NVS every time. One that only ASKS is relaying a
// person: somebody picked a pattern from Ableton or a phone, and that
// should survive a reboot exactly as turning the knob does.
//
// The distinction already existed in the hook set; it just was not
// reported. OSC moving out of the core is what made it matter, because
// OSC's pattern picks used to persist and would otherwise have stopped
// silently.
inline bool takePattern(int* idx, bool* isPersonsChoice = nullptr) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->takePattern && PF_ADDONS[i]->takePattern(idx)) {
      if (isPersonsChoice)
        *isPersonsChoice =
            !(PF_ADDONS[i]->claimsPattern && PF_ADDONS[i]->claimsPattern());
      return true;
    }
  }
  return false;
}

inline void drawOverlay(const PFAddonFrame& frame) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (PF_ADDONS[i]->drawOverlay) PF_ADDONS[i]->drawOverlay(frame);
  }
}

// Feeds /api/status nav: `["/path","Label"]` pairs for addons that serve a
// page. Emitted as a whole array because the console header wants it in one
// piece, unlike caps which the core interleaves with its own.
inline void emitNav(String& json) {
  bool first = true;
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (!PF_ADDONS[i]->navPath || !PF_ADDONS[i]->navLabel) continue;
    if (!first) json += ',';
    first = false;
    json += "[\"";
    json += PF_ADDONS[i]->navPath;
    json += "\",\"";
    json += PF_ADDONS[i]->navLabel;
    json += "\"]";
  }
}

// Feeds /api/status caps: hands the emitter every declared cap string.
inline void emitCaps(String& json) {
  for (size_t i = 0; i < PF_ADDON_COUNT; i++) {
    if (!PF_ADDONS[i]->cap) continue;
    json += ",\"";
    json += PF_ADDONS[i]->cap;
    json += '"';
  }
}

// Feeds /api/status caps. Returns the addon's cap string or null.
inline const char* capAt(size_t i) {
  return i < PF_ADDON_COUNT ? PF_ADDONS[i]->cap : nullptr;
}
inline size_t count() { return PF_ADDON_COUNT; }

}  // namespace PFAddons
