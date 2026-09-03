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

namespace PFLoopSync {

inline TaskHandle_t loopTask = nullptr;           // captured by attach()
inline void (*volatile pendingFn)(void*) = nullptr;
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
  void (*fn)(void*) = pendingFn;
  if (!fn) return;
  fn(pendingArg);
  pendingFn = nullptr;
  xSemaphoreGive(doneSignal);
}

// Run fn(arg) on the loop task and wait for it. Inline when already there.
inline void runRaw(void (*fn)(void*), void* arg) {
  if (onLoopTask()) {
    fn(arg);
    return;
  }
  xSemaphoreTake(callerLock, portMAX_DELAY);
  const uint32_t t0 = micros();
  pendingArg = arg;
  pendingFn = fn;  // written last: service() keys on it
  // Wait in slices so a loop that has stopped servicing is visible on
  // Serial rather than a silent hang of the console.
  while (xSemaphoreTake(doneSignal, pdMS_TO_TICKS(2000)) != pdTRUE) {
    Serial.println("[LOOP-SYNC] still waiting for the loop task");
  }
  const uint32_t waited = micros() - t0;
  if (waited > maxWaitUs) maxWaitUs = waited;
  served++;
  xSemaphoreGive(callerLock);
}

// Any callable, captures included:  PFLoopSync::run([&] { ... });
template <class F>
inline void run(F&& f) {
  using Fn = typename std::remove_reference<F>::type;
  runRaw([](void* p) { (*static_cast<Fn*>(p))(); }, (void*)&f);
}

}  // namespace PFLoopSync
