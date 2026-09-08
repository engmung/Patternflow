// ═══════════════════════════════════════════════════════════
// PatternFlow - the loop task's front door
//
// Since 3.9.1 the console's HTTP server is serviced on Core 0
// (core_net_task.h) while loop() renders on Core 1. Most handlers only read
// a few words of state, or write a value the next frame picks up, and those
// need nothing. A few do things a frame cannot survive halfway through:
// unloading the module whose draw() is executing, rebuilding the pattern
// list that draw() indexes, reconnecting the MQTT client the feature loop is
// polling, starting a show the show engine is ticking. Those come through
// here: handed to the loop task, executed at the frame boundary, the handler
// waiting for the result.
//
// The rule for a handler (feature authors: FEATURE_GUIDE.md says the same):
// if what you are about to touch is something loop() or a feature's loop()
// is using right now, wrap it in PFLoopSync::run(). When the caller is
// already the loop task — the single-core fallback, or a call from loop()
// itself — the body runs inline, so one function serves both.
//
// Not a lock, on purpose. A mutex held by loop() around the frame and taken
// by handlers would let the loop re-take it before a waiting task on the
// other core ever ran (FreeRTOS hands nothing over on give), and a handler
// holding it during a page send would stall the render exactly as it did
// before the task existed. A request executed at a known point is smaller.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <type_traits>
#include "core_runtime.h"
#include "core_net_maintenance.h"

namespace PFLoopSync {

inline TaskHandle_t loopTask = nullptr;           // captured by attach()
inline void (*volatile pendingFn)(void*) = nullptr;
inline bool (*pendingAttempt)(void*) = nullptr;
inline void* volatile pendingArg = nullptr;
inline SemaphoreHandle_t doneSignal = nullptr;    // binary: loop -> caller
inline SemaphoreHandle_t callerLock = nullptr;    // one request at a time

// For /api/status: how many requests came through, and the longest one
// waited. A frame is ~16 ms; a module load or a long page can hold one.
inline volatile uint32_t served = 0;
inline volatile uint32_t maxWaitUs = 0;

// From the loop task, once, before any other task can call run().
inline void attach() {
  loopTask = xTaskGetCurrentTaskHandle();
  if (!doneSignal) doneSignal = xSemaphoreCreateBinary();
  if (!callerLock) callerLock = xSemaphoreCreateMutex();
}

// True before attach() as well: with no loop task known there is nobody to
// hand the work to, so it runs where it is.
inline bool onLoopTask() {
  return loopTask == nullptr || xTaskGetCurrentTaskHandle() == loopTask;
}

// From loop(), at the frame boundary: run whatever is waiting.
inline void service() {
  void (*fn)(void*) = __atomic_load_n(&pendingFn, __ATOMIC_ACQUIRE);
  if (!fn) return;
  // A conditional request owns its caller's storage until it completes.
  // Not ready means another frame, never a wait inside this task.
  const uint32_t startedUs = micros();
  if (pendingAttempt && !pendingAttempt(pendingArg)) {
    PFRuntime::noteSync(micros() - startedUs);
    return;
  }
  fn(pendingArg);
  PFRuntime::noteSync(micros() - startedUs);
  pendingAttempt = nullptr;
  __atomic_store_n(&pendingFn, (void (*)(void*))nullptr, __ATOMIC_RELEASE);
  xSemaphoreGive(doneSignal);
}

// Run fn(arg) on the loop task and wait for it. Inline when already there.
inline bool runRaw(void (*fn)(void*), void* arg, bool (*attempt)(void*) = nullptr) {
  if (onLoopTask()) {
    if (attempt && !attempt(arg)) return false;
    fn(arg);
    return true;
  }
  xSemaphoreTake(callerLock, portMAX_DELAY);
  const uint32_t t0 = micros();
  pendingArg = arg;
  pendingAttempt = attempt;
  __atomic_store_n(&pendingFn, fn, __ATOMIC_RELEASE);
  // Wait in slices so a loop that has stopped servicing is visible on
  // Serial rather than a silent hang of the console.
  uint32_t lastLogUs = t0;
  while (xSemaphoreTake(doneSignal, pdMS_TO_TICKS(25)) != pdTRUE) {
    PFNetMaintenance::poll();
    if (micros() - lastLogUs >= 2000000) {
      Serial.println("[LOOP-SYNC] still waiting for the loop task");
      lastLogUs = micros();
    }
  }
  const uint32_t waited = micros() - t0;
  if (waited > maxWaitUs) maxWaitUs = waited;
  // Not served++: C++20 deprecates increment on a volatile-qualified type,
  // and CI builds the host tests as C++20 with -Werror. A separate read and
  // write is the same single-writer store this always was - only this task
  // writes it, and the reader is a status page.
  served = served + 1;
  xSemaphoreGive(callerLock);
  return true;
}

// Any callable, captures included:  PFLoopSync::run([&] { ... });
template <class F>
inline void run(F&& f) {
  using Fn = typename std::remove_reference<F>::type;
  runRaw([](void* p) { (*static_cast<Fn*>(p))(); }, (void*)&f);
}

// Retry a short, transactional attempt at each frame boundary. Returning
// false must leave the operation uncommitted. A caller already on the loop
// cannot wait for itself: it receives false and must retry later or reply busy.
template <class F>
inline bool runWhen(F&& attempt) {
  using Fn = typename std::remove_reference<F>::type;
  return runRaw([](void*) {}, (void*)&attempt,
                [](void* p) { return (*static_cast<Fn*>(p))(); });
}

}  // namespace PFLoopSync
