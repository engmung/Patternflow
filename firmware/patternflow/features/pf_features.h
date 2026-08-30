// ═══════════════════════════════════════════════════════════
// PatternFlow - feature dispatch
//
// Walks the list in features/features.h and fans each moment out. The sketch
// calls these; it never names a feature.
//
// Cost is a null check per feature per hook — a handful of comparisons per
// frame against a multi-million-cycle budget.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "pf_feature.h"
#include "features.h"   // defines PF_FEATURES[] and PF_FEATURE_COUNT

namespace PFFeatures {

inline void setup() {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->setup) PF_FEATURES[i]->setup();
  }
}

inline void onNetwork() {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->onNetwork) PF_FEATURES[i]->onNetwork();
  }
}

inline void loop(const PFFeatureFrame& frame) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->loop) PF_FEATURES[i]->loop(frame);
  }
}

inline void fillInput(InputFrame& input) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->fillInput) PF_FEATURES[i]->fillInput(input);
  }
}

inline void observeFrame(const InputFrame& input, const PFFeatureFrame& frame) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->observeFrame) PF_FEATURES[i]->observeFrame(input, frame);
  }
}

inline void onSleep(bool sleeping) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->onSleep) PF_FEATURES[i]->onSleep(sleeping);
  }
}

// First request wins the frame; the next is served on the frame after.
inline bool requestSleep(bool* sleeping) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->requestSleep && PF_FEATURES[i]->requestSleep(sleeping)) return true;
  }
  return false;
}

inline void appendStatus(String& json) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->appendStatus) PF_FEATURES[i]->appendStatus(json);
  }
}

// Features the device menu can list and toggle: those that expose both
// runtime hooks and a short name.
inline bool isToggleable(size_t i) {
  return i < PF_FEATURE_COUNT && PF_FEATURES[i]->shortName &&
         PF_FEATURES[i]->isRuntimeEnabled && PF_FEATURES[i]->setRuntimeEnabled;
}

inline size_t toggleableCount() {
  size_t n = 0;
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (isToggleable(i)) n++;
  }
  return n;
}

// The nth toggleable feature, by menu order. Returns PF_FEATURE_COUNT when
// there is no nth one.
inline size_t toggleableAt(size_t nth) {
  size_t n = 0;
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (!isToggleable(i)) continue;
    if (n == nth) return i;
    n++;
  }
  return PF_FEATURE_COUNT;
}

inline const char* shortName(size_t i) {
  return i < PF_FEATURE_COUNT ? PF_FEATURES[i]->shortName : "";
}

inline bool runtimeEnabled(size_t i) {
  return i < PF_FEATURE_COUNT && PF_FEATURES[i]->isRuntimeEnabled &&
         PF_FEATURES[i]->isRuntimeEnabled();
}

inline void setRuntimeEnabled(size_t i, bool on) {
  if (i < PF_FEATURE_COUNT && PF_FEATURES[i]->setRuntimeEnabled) {
    PF_FEATURES[i]->setRuntimeEnabled(on);
  }
}

inline void onUserInput() {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->onUserInput) PF_FEATURES[i]->onUserInput();
  }
}

// True while any feature is driving the pattern, so remote pattern pickers
// stand down instead of fighting it.
inline bool patternClaimed() {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->claimsPattern && PF_FEATURES[i]->claimsPattern()) return true;
  }
  return false;
}

// First feature with a pending pattern request wins the frame; the next one
// is served on the frame after. Requests are edges, not levels, so nothing
// is lost by taking them one at a time.
// Which feature answered changes what the sketch should do afterwards. An
// feature that CLAIMS the pattern owns what is on the panel for as long as
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
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->takePattern && PF_FEATURES[i]->takePattern(idx)) {
      if (isPersonsChoice)
        *isPersonsChoice =
            !(PF_FEATURES[i]->claimsPattern && PF_FEATURES[i]->claimsPattern());
      return true;
    }
  }
  return false;
}

inline void drawOverlay(const PFFeatureFrame& frame) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (PF_FEATURES[i]->drawOverlay) PF_FEATURES[i]->drawOverlay(frame);
  }
}

// Feeds /api/status nav: `["/path","Label"]` pairs for features that serve a
// page. Emitted as a whole array because the console header wants it in one
// piece, unlike caps which the core interleaves with its own.
inline void emitNav(String& json) {
  bool first = true;
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (!PF_FEATURES[i]->navPath || !PF_FEATURES[i]->navLabel) continue;
    if (!first) json += ',';
    first = false;
    json += "[\"";
    json += PF_FEATURES[i]->navPath;
    json += "\",\"";
    json += PF_FEATURES[i]->navLabel;
    json += "\",\"";
    if (PF_FEATURES[i]->navDesc) json += PF_FEATURES[i]->navDesc;
    json += "\"]";
  }
}

// Feeds /api/status caps: hands the emitter every declared cap string.
inline void emitCaps(String& json) {
  for (size_t i = 0; i < PF_FEATURE_COUNT; i++) {
    if (!PF_FEATURES[i]->cap) continue;
    json += ",\"";
    json += PF_FEATURES[i]->cap;
    json += '"';
  }
}

// Feeds /api/status caps. Returns the feature's cap string or null.
inline const char* capAt(size_t i) {
  return i < PF_FEATURE_COUNT ? PF_FEATURES[i]->cap : nullptr;
}
inline size_t count() { return PF_FEATURE_COUNT; }

}  // namespace PFFeatures

// ── Legacy name shim (2026-08-30) ───────────────────────────────────────
//
// The tree was addons/ and the vocabulary was "addon" until docs/EDITIONS.md
// settled on "feature". An out-of-tree composition written against the old
// names — two files copied over a checkout, the recipe Simone's bundle uses —
// must keep building, so the old spellings are accepted here and mapped.
// Delete this block once every out-of-tree bundle has migrated.
namespace PFAddons = PFFeatures;
