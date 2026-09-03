// ═══════════════════════════════════════════════════════════
// PatternFlow - the network task (Core 0)
//
// Wi-Fi maintenance, the console's HTTP server, Improv-Serial, ArduinoOTA
// and the browser self-update's housekeeping run on a task pinned to
// Core 0, so a Wi-Fi reconnect or a page load never costs the render on
// Core 1 a frame. Core 1 is loop(): input, features, draw, present.
//
// Two things make this safe rather than merely fast:
//   - A handler that touches what the frame is using — the resident module,
//     the pattern list, a feature's client — goes through PFLoopSync
//     (core_loop_sync.h) and executes on the loop task at the frame
//     boundary. Reads of a word or two, and writes the next frame picks
//     up (the bus, a brightness), need nothing.
//   - The HTTP server is not serviced until loop() has registered every
//     route (servicesReady), so a request cannot walk a half-built table.
//
// Stack: 8 KB. The 3 KB this began with had 944 bytes left after nothing
// but status polls (`netStackMin` in /api/status), before one upload or one
// firmware image had gone through the handlers that used to run on the loop
// task's 8 KB. Internal RAM has the room — ~60 KB free after services on
// the audio edition.
//
// If the task cannot be created, loop() services everything itself, as it
// did before 3.9.1; isDualCoreActive() tells it so.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "core_loop_sync.h"
#include "core_wifi.h"
#include "core_http.h"
#include "core_improv.h"
#include "core_ota.h"
#include "core_web_update.h"

namespace PatternflowNetTask {

constexpr uint32_t STACK_BYTES = 8192;

inline TaskHandle_t taskHandle = nullptr;
inline volatile bool running = false;
// Set by loop() once the console's routes are all registered; until then
// the server is not serviced. Never cleared: routes persist across
// reconnects, and every begin() behind them is idempotent.
inline volatile bool servicesReady = false;
inline volatile uint32_t stackMinFree = 0;
inline volatile uint32_t iterations = 0;

inline void netWorker(void*) {
  while (running) {
    // Wi-Fi: retries while down, notes each (re)connection for loop().
    PatternflowWifi::tick();
    // Improv-Serial: the browser flasher's Wi-Fi setup over USB.
    PatternflowImprov::handle();
    // The console and every /api/* route — once loop() says they exist.
    if (servicesReady) PatternflowHttp::handle();
    // ArduinoOTA, and the self-update's boot-valid mark + deferred reboot.
    PatternflowOta::handle();
    PatternflowWebUpdate::handle();

    iterations++;
    if ((iterations & 0x7F) == 0) {
      stackMinFree = uxTaskGetStackHighWaterMark(nullptr);
    }
    // Let IDLE0 feed its watchdog and lwIP move packets.
    vTaskDelay(pdMS_TO_TICKS(1));
  }
  taskHandle = nullptr;
  vTaskDelete(nullptr);
}

// From setup(), on the loop task.
inline bool begin(uint32_t stackSize = STACK_BYTES, UBaseType_t priority = 1) {
  if (taskHandle != nullptr) return true;
  PFLoopSync::attach();
  running = true;
  BaseType_t ret = xTaskCreatePinnedToCore(netWorker, "pf-net", stackSize,
                                           nullptr, priority, &taskHandle,
                                           0 /* Core 0 */);
  if (ret == pdPASS) {
    Serial.printf("[NET-TASK] on Core 0 (stack %u, prio %u)\n",
                  (unsigned)stackSize, (unsigned)priority);
    return true;
  }
  Serial.println("[NET-TASK] could not create the task - loop() serves the network");
  running = false;
  taskHandle = nullptr;
  return false;
}

inline bool isDualCoreActive() { return taskHandle != nullptr && running; }

inline void stop() { running = false; }

}  // namespace PatternflowNetTask
