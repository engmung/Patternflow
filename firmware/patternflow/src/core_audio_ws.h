// Patternflow - Audio-react WebSocket server (single-threaded)
//
// Hosts a small browser UI on port 80 (audio_index.h) and a WebSocket
// endpoint on port 81. Browsers connect, send normalized 0..1 knob values
// per frame, and patterns read those through InputFrame::knobAudioActive /
// knobAudioValue.
//
// Threading: everything runs in the main Arduino loop via handle(). An
// earlier version pushed this into a pinned core-0 FreeRTOS task guarded by
// a portMUX spinlock; that shared the WiFi/lwIP core and could wedge the
// render loop (interrupt watchdog) the moment a client connected. Serving
// inline is simpler and robust — the messages are tiny, so the per-frame
// cost is negligible.
//
// Message protocol:
//   k=N,v=F   set knob N (0..3) to value F (clamped to 0..1)
//   d=N,v=F   add normalized delta F to knob N (-1..1)
//   off=N     release knob N back to encoder control
//   off       release all four knobs
//
// Library dependency: WebSockets by Markus Sattler (Links2004).
// WebServer is part of the ESP32 Arduino core.
//
// License: MIT
#pragma once

#include <Arduino.h>
#include "config.h"

#if PF_AUDIO_ENABLED
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include "audio_index.h"
#endif

namespace PatternflowAudio {

#if PF_AUDIO_ENABLED

// Quiet window: if no update arrives for a knob within this many ms, it
// deactivates so the physical encoder regains control (covers a browser
// tab closing mid-track).
constexpr uint32_t AUDIO_TIMEOUT_MS = 500;

inline WebServer httpServer(PF_AUDIO_HTTP_PORT);
inline WebSocketsServer wsServer(PF_AUDIO_WS_PORT);

inline bool initialized = false;
inline bool runtimeEnabled = true;
// Plain (not volatile / no spinlock): only ever touched from the main loop.
inline bool active[4]  = { false, false, false, false };
inline float values[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
inline float pendingDeltas[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
inline float deltaResidual[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
inline uint32_t lastUpdateMs[4] = { 0, 0, 0, 0 };
inline uint32_t connectedClients = 0;

inline void setKnobValue(int idx, float value, uint32_t nowMs) {
  values[idx] = value;
  active[idx] = true;
  lastUpdateMs[idx] = nowMs;
}

inline void addKnobDelta(int idx, float delta, uint32_t nowMs) {
  pendingDeltas[idx] += delta;
  lastUpdateMs[idx] = nowMs;
}

inline void releaseKnob(int idx) {
  active[idx] = false;
  pendingDeltas[idx] = 0.0f;
  deltaResidual[idx] = 0.0f;
}

inline void releaseAllKnobs() {
  for (int i = 0; i < 4; i++) releaseKnob(i);
}

inline void parseMessage(uint8_t* payload, size_t length) {
  if (length < 3 || length > 63) return;

  char buf[64];
  memcpy(buf, payload, length);
  buf[length] = '\0';

  // "k=N,v=F" — parsed by hand (no sscanf: its %f path is needlessly
  // heavy and this runs on every inbound frame).
  if ((buf[0] == 'k' || buf[0] == 'd') && buf[1] == '=') {
    char* end = nullptr;
    long k = strtol(buf + 2, &end, 10);
    if (end && *end == ',' && end[1] == 'v' && end[2] == '=' && k >= 0 && k < 4) {
      float v = strtof(end + 3, nullptr);
      if (buf[0] == 'k') {
        if (v < 0.0f) v = 0.0f;
        else if (v > 1.0f) v = 1.0f;
        setKnobValue((int)k, v, millis());
      } else {
        if (v < -1.0f) v = -1.0f;
        else if (v > 1.0f) v = 1.0f;
        addKnobDelta((int)k, v, millis());
      }
    }
    return;
  }
  // "off=N" — release knob N.
  if (strncmp(buf, "off=", 4) == 0) {
    long k = strtol(buf + 4, nullptr, 10);
    if (k >= 0 && k < 4) releaseKnob((int)k);
    return;
  }
  // "off" — release all four.
  if (strcmp(buf, "off") == 0) releaseAllKnobs();
}

inline void onEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      connectedClients++;
      IPAddress ip = wsServer.remoteIP(num);
      Serial.printf("[AUDIO] client %u from %s (%u connected)\n",
                    num, ip.toString().c_str(), connectedClients);
      break;
    }
    case WStype_DISCONNECTED: {
      if (connectedClients > 0) connectedClients--;
      if (connectedClients == 0) releaseAllKnobs();
      Serial.printf("[AUDIO] client %u disconnected (%u connected)\n",
                    num, connectedClients);
      break;
    }
    case WStype_TEXT:
      parseMessage(payload, length);
      break;
    default:
      break;
  }
}

inline void handleRoot() {
  httpServer.send_P(200, "text/html", AUDIO_INDEX_HTML);
}

#endif  // PF_AUDIO_ENABLED

inline bool isCompiledIn() {
#if PF_AUDIO_ENABLED
  return true;
#else
  return false;
#endif
}

inline bool isActive(int idx) {
#if PF_AUDIO_ENABLED
  if (idx < 0 || idx >= 4) return false;
  if (!runtimeEnabled) return false;
  return active[idx];
#else
  (void)idx;
  return false;
#endif
}

inline float value(int idx) {
#if PF_AUDIO_ENABLED
  if (idx < 0 || idx >= 4) return 0.0f;
  return values[idx];
#else
  (void)idx;
  return 0.0f;
#endif
}

inline int consumeKnobDelta(int idx) {
#if PF_AUDIO_ENABLED
  if (idx < 0 || idx >= 4 || !runtimeEnabled) return 0;
  float movement = pendingDeltas[idx] * PF_AUDIO_VIRTUAL_KNOB_SCALE + deltaResidual[idx];
  pendingDeltas[idx] = 0.0f;
  int delta = (int)roundf(movement);
  deltaResidual[idx] = movement - (float)delta;
  if (fabsf(deltaResidual[idx]) < 0.001f) deltaResidual[idx] = 0.0f;
  return delta;
#else
  (void)idx;
  return 0;
#endif
}

inline uint32_t clientCount() {
#if PF_AUDIO_ENABLED
  return connectedClients;
#else
  return 0;
#endif
}

inline bool isRuntimeEnabled() {
#if PF_AUDIO_ENABLED
  return runtimeEnabled;
#else
  return false;
#endif
}

inline void setRuntimeEnabled(bool on) {
#if PF_AUDIO_ENABLED
  runtimeEnabled = on;
  if (!on) releaseAllKnobs();
#else
  (void)on;
#endif
}

// Start the HTTP/WebSocket servers. Wi-Fi is owned by PatternflowWifi; this
// runs on the connect edge. Idempotent — repeat calls (on reconnect) are
// no-ops once the servers are up.
inline void begin() {
#if PF_AUDIO_ENABLED
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  httpServer.on("/", handleRoot);
  httpServer.onNotFound([]() {
    httpServer.send(404, "text/plain", "Not found");
  });
  httpServer.begin();

  wsServer.begin();
  wsServer.onEvent(onEvent);

  initialized = true;

  String ip = WiFi.localIP().toString();
  Serial.printf("[AUDIO] Ready — UI http://%s:%d  WS ws://%s:%d\n",
                ip.c_str(), PF_AUDIO_HTTP_PORT, ip.c_str(), PF_AUDIO_WS_PORT);
#endif
}

// Service the servers + auto-release stale knobs. Called every main loop.
inline void handle() {
#if PF_AUDIO_ENABLED
  if (!initialized) return;

  httpServer.handleClient();
  wsServer.loop();

  uint32_t now = millis();
  for (int i = 0; i < 4; i++) {
    if (active[i] && (now - lastUpdateMs[i]) > AUDIO_TIMEOUT_MS) {
      active[i] = false;
    }
    if (pendingDeltas[i] != 0.0f && (now - lastUpdateMs[i]) > AUDIO_TIMEOUT_MS) {
      pendingDeltas[i] = 0.0f;
      deltaResidual[i] = 0.0f;
    }
  }
#endif
}

} // namespace PatternflowAudio
