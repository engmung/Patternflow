// Cooperative maintenance while a synchronous HTTP transaction owns its worker.
// No HTTP re-entry, extra task or stack. Only the owning task invokes the hook.
#pragma once
#include <Arduino.h>
namespace PFNetMaintenance {
inline TaskHandle_t owner = nullptr;
inline void (*hook)() = nullptr;
inline uint32_t lastMs = 0;
inline uint32_t calls = 0, maxGapMs = 0;
inline bool inside = false;
inline void attach(void (*fn)()) {
  owner = xTaskGetCurrentTaskHandle();
  lastMs = millis();
  __atomic_store_n(&hook, fn, __ATOMIC_RELEASE);
}
inline void poll() {
  auto fn = __atomic_load_n(&hook, __ATOMIC_ACQUIRE);
  if (!fn || owner != xTaskGetCurrentTaskHandle() || inside) return;
  const uint32_t now = millis(), gap = now - lastMs;
  if (gap < 25) return;
  lastMs = now;
  if (gap > maxGapMs) maxGapMs = gap;
  ++calls;
  inside = true;
  fn();
  inside = false;
}
} // namespace PFNetMaintenance
