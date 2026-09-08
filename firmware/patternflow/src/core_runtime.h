// Small permanent diagnostics for the time the render loop actually occupies.
#pragma once
#include <Arduino.h>

namespace PFRuntime {
struct Snapshot {
  uint32_t loops = 0, lastUs = 0, maxUs = 0, over50ms = 0;
  uint32_t housekeepingMaxUs = 0, syncMaxUs = 0;
};
inline Snapshot counters;
inline portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
inline uint32_t epoch = 0;
inline Snapshot snapshot(bool reset = false) {
  portENTER_CRITICAL(&mux);
  Snapshot result = counters;
  if (reset) { counters = {}; ++epoch; }
  portEXIT_CRITICAL(&mux);
  return result;
}
inline void noteSync(uint32_t us) {
  portENTER_CRITICAL(&mux);
  if (us > counters.syncMaxUs) counters.syncMaxUs = us;
  portEXIT_CRITICAL(&mux);
}
struct LoopScope {
  uint32_t start = micros(), generation;
  bool (*loading)();
  explicit LoopScope(bool (*isLoading)()) : loading(isLoading) {
    portENTER_CRITICAL(&mux); generation = epoch; portEXIT_CRITICAL(&mux);
  }
  void housekeepingDone() {
    uint32_t us = micros() - start;
    portENTER_CRITICAL(&mux);
    if (generation == epoch && us > counters.housekeepingMaxUs) counters.housekeepingMaxUs = us;
    portEXIT_CRITICAL(&mux);
  }
  ~LoopScope() {
    // Loading has no animation deadline. Keep input/hooks at ~125 Hz rather
    // than busy-polling after skipping a static preview. Normal render is uncapped.
    uint32_t us = micros() - start;
    if (loading() && us < 8000) delay((8000 - us + 999) / 1000);
    us = micros() - start;
    portENTER_CRITICAL(&mux);
    if (generation == epoch) {
      ++counters.loops; counters.lastUs = us;
      if (us > counters.maxUs) counters.maxUs = us;
      if (us > 50000) ++counters.over50ms;
    }
    portEXIT_CRITICAL(&mux);
  }
};
} // namespace PFRuntime
