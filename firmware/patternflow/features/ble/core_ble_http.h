// ═══════════════════════════════════════════════════════════
// PatternFlow - /api/ble: the BLE setup radio, from the console
//
//   GET  /api/ble          state, advertised name, last Improv error
//   POST /api/ble?on=1     start advertising now (Wi-Fi is up, so this is
//                          "I am about to move the panel somewhere else" -
//                          and the measurement hook: heap with BLE alive)
//   POST /api/ble?on=0     stop and release the controller memory (one-way
//                          until reboot)
//
// Deliberately tiny and page-less: the moment this matters most, the
// console is unreachable, and a phone is talking to the panel over GATT.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

#include "../../src/core_http.h"
#include "core_ble_improv.h"

namespace PatternflowBleHttp {

inline bool initialized = false;

inline void sendState() {
  WebServer& s = PatternflowHttp::server();
  String json = "{\"state\":\"";
  json += PatternflowBle::phaseText();
  json += "\",\"improv\":";
  json += (int)PatternflowBle::improvState;
  json += ",\"error\":";
  json += (int)PatternflowBle::lastError;
  json += ",\"name\":\"";
  json += PatternflowBle::deviceName;
  json += "\",\"runtime\":";
  json += PatternflowBle::runtimeEnabled ? "true" : "false";
  json += "}";
  s.send(200, "application/json", json);
}

inline void begin() {
  if (initialized) return;
  initialized = true;
  WebServer& s = PatternflowHttp::server();
  s.on("/api/ble", HTTP_GET, []() { sendState(); });
  s.on("/api/ble", HTTP_POST, []() {
    WebServer& s = PatternflowHttp::server();
    if (s.hasArg("on")) {
      if (s.arg("on") == "1") PatternflowBle::manualStart();
      else PatternflowBle::manualStop();
    }
    sendState();
  });
  PatternflowHttp::begin();
}

}  // namespace PatternflowBleHttp
