// ═══════════════════════════════════════════════════════════
// PatternFlow - Dual-Core FreeRTOS Network Task (Core 0)
//
// Offloads network I/O, WebServer HTTP request handling, OTA,
// and Improv-Serial polling to ESP32-S3 Core 0.
// Core 1 remains dedicated to real-time 60 FPS HUB75 LED rendering.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "core_wifi.h"
#include "core_http.h"
#include "core_improv.h"
#include "core_ota.h"
#include "core_web_update.h"

namespace PatternflowNetTask {

inline TaskHandle_t taskHandle = nullptr;
inline volatile bool running = false;
inline volatile uint32_t stackMinFree = 0;
inline volatile uint32_t iterations = 0;

inline void netWorker(void* arg) {
  while (running) {
    // 1. Maintain Wi-Fi & handle auto-reconnect on Core 0
    PatternflowWifi::tick();

    // 2. WebServer handleClient (serves console, /api/*)
    PatternflowHttp::handle();

    // 2. Improv Serial provisioning
    PatternflowImprov::handle();

    // 3. Arduino OTA
    PatternflowOta::handle();

    // 4. Web self-update
    PatternflowWebUpdate::handle();

    iterations++;
    if ((iterations & 0x7F) == 0) {
      stackMinFree = uxTaskGetStackHighWaterMark(nullptr);
    }

    // Yield to let IDLE task feed watchdog and lwIP stack process packets
    vTaskDelay(pdMS_TO_TICKS(1));
  }
  taskHandle = nullptr;
  vTaskDelete(nullptr);
}

inline bool begin(uint32_t stackSize = 3072, UBaseType_t priority = 1) {
  if (taskHandle != nullptr) return true;
  running = true;
  BaseType_t ret = xTaskCreatePinnedToCore(
      netWorker,
      "pf-net",
      stackSize,
      nullptr,
      priority,
      &taskHandle,
      0  // Pinned to Core 0
  );

  if (ret == pdPASS) {
    Serial.printf("[NET-TASK] Started on Core 0 (stack=%u, prio=%u)\n", stackSize, priority);
    return true;
  } else {
    Serial.println("[NET-TASK] FAILED to create task on Core 0");
    running = false;
    taskHandle = nullptr;
    return false;
  }
}

inline bool isDualCoreActive() {
  return taskHandle != nullptr && running;
}

inline void stop() {
  running = false;
}

}  // namespace PatternflowNetTask
