// Patternflow - Audio-react WebSocket server
//
// Hosts a small browser UI on port 80 (audio_index.h) and a WebSocket
// endpoint on port 81. Browsers connect, send normalized 0..1 knob
// values per frame, and patterns can read those values through
// InputFrame::knobAudioActive / knobAudioValue.
//
// The HTTP/WebSocket polling loop runs in a pinned FreeRTOS task on core 0.
// The main Arduino loop stays focused on pattern rendering.
//
// Message protocol:
//   k=N,v=F   set knob N (0..3) to value F (clamped to 0..1)
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

constexpr uint32_t AUDIO_TIMEOUT_MS = 500;
constexpr uint32_t AUDIO_TASK_DELAY_MS = 5;
constexpr uint32_t AUDIO_TASK_STACK_BYTES = 4096;
constexpr BaseType_t AUDIO_TASK_CORE = 0;

inline WebServer httpServer(PF_AUDIO_HTTP_PORT);
inline WebSocketsServer wsServer(PF_AUDIO_WS_PORT);

inline bool initialized = false;
inline TaskHandle_t audioTaskHandle = nullptr;
inline portMUX_TYPE audioMux = portMUX_INITIALIZER_UNLOCKED;
inline volatile bool active[4]  = { false, false, false, false };
inline volatile float values[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
inline uint32_t lastUpdateMs[4] = { 0, 0, 0, 0 };
inline uint32_t connectedClients = 0;

inline void setKnobValue(int idx, float value, uint32_t nowMs) {
  portENTER_CRITICAL(&audioMux);
  values[idx] = value;
  active[idx] = true;
  lastUpdateMs[idx] = nowMs;
  portEXIT_CRITICAL(&audioMux);
}

inline void releaseKnob(int idx) {
  portENTER_CRITICAL(&audioMux);
  active[idx] = false;
  portEXIT_CRITICAL(&audioMux);
}

inline void releaseAllKnobs() {
  portENTER_CRITICAL(&audioMux);
  for (int i = 0; i < 4; i++) active[i] = false;
  portEXIT_CRITICAL(&audioMux);
}

inline void parseMessage(uint8_t* payload, size_t length) {
  if (length < 3 || length > 63) return;

  char buf[64];
  memcpy(buf, payload, length);
  buf[length] = '\0';

  if (strncmp(buf, "k=", 2) == 0) {
    int k = -1;
    float v = 0.0f;
    if (sscanf(buf, "k=%d,v=%f", &k, &v) == 2 && k >= 0 && k < 4) {
      if (v < 0.0f) v = 0.0f;
      else if (v > 1.0f) v = 1.0f;
      setKnobValue(k, v, millis());
    }
  } else if (strncmp(buf, "off=", 4) == 0) {
    int k = -1;
    if (sscanf(buf, "off=%d", &k) == 1 && k >= 0 && k < 4) {
      releaseKnob(k);
    }
  } else if (strcmp(buf, "off") == 0) {
    releaseAllKnobs();
  }
}

inline void onEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      uint32_t count = 0;
      portENTER_CRITICAL(&audioMux);
      connectedClients++;
      count = connectedClients;
      portEXIT_CRITICAL(&audioMux);

      IPAddress ip = wsServer.remoteIP(num);
      Serial.printf("[AUDIO] client %u from %s (%u connected)\n",
                    num, ip.toString().c_str(), count);
      break;
    }
    case WStype_DISCONNECTED: {
      uint32_t count = 0;
      portENTER_CRITICAL(&audioMux);
      if (connectedClients > 0) connectedClients--;
      count = connectedClients;
      if (connectedClients == 0) {
        for (int i = 0; i < 4; i++) active[i] = false;
      }
      portEXIT_CRITICAL(&audioMux);

      Serial.printf("[AUDIO] client %u disconnected (%u connected)\n",
                    num, count);
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

inline void service() {
  if (!initialized) return;

  httpServer.handleClient();
  wsServer.loop();

  uint32_t now = millis();
  portENTER_CRITICAL(&audioMux);
  for (int i = 0; i < 4; i++) {
    if (active[i] && (now - lastUpdateMs[i]) > AUDIO_TIMEOUT_MS) {
      active[i] = false;
    }
  }
  portEXIT_CRITICAL(&audioMux);
}

inline void audioTask(void*) {
  for (;;) {
    service();
    vTaskDelay(pdMS_TO_TICKS(AUDIO_TASK_DELAY_MS));
  }
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

  bool result = false;
  portENTER_CRITICAL(&audioMux);
  result = active[idx];
  portEXIT_CRITICAL(&audioMux);
  return result;
#else
  (void)idx;
  return false;
#endif
}

inline float value(int idx) {
#if PF_AUDIO_ENABLED
  if (idx < 0 || idx >= 4) return 0.0f;

  float result = 0.0f;
  portENTER_CRITICAL(&audioMux);
  result = values[idx];
  portEXIT_CRITICAL(&audioMux);
  return result;
#else
  (void)idx;
  return 0.0f;
#endif
}

inline uint32_t clientCount() {
#if PF_AUDIO_ENABLED
  uint32_t result = 0;
  portENTER_CRITICAL(&audioMux);
  result = connectedClients;
  portEXIT_CRITICAL(&audioMux);
  return result;
#else
  return 0;
#endif
}

inline void begin() {
#if PF_AUDIO_ENABLED
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[AUDIO] Wi-Fi not connected; audio-react disabled this boot");
    return;
  }

  httpServer.on("/", handleRoot);
  httpServer.onNotFound([]() {
    httpServer.send(404, "text/plain", "Not found");
  });
  httpServer.begin();

  wsServer.begin();
  wsServer.onEvent(onEvent);

  initialized = true;
  BaseType_t taskOk = xTaskCreatePinnedToCore(
    audioTask,
    "pf_audio_ws",
    AUDIO_TASK_STACK_BYTES,
    nullptr,
    1,
    &audioTaskHandle,
    AUDIO_TASK_CORE
  );

  if (taskOk != pdPASS) {
    initialized = false;
    Serial.println("[AUDIO] Failed to start core 0 audio task");
    return;
  }

  String ip = WiFi.localIP().toString();
  Serial.printf("[AUDIO] Ready on core %d - UI http://%s:%d  WS ws://%s:%d\n",
                AUDIO_TASK_CORE,
                ip.c_str(), PF_AUDIO_HTTP_PORT,
                ip.c_str(), PF_AUDIO_WS_PORT);
#endif
}

inline void handle() {
#if PF_AUDIO_ENABLED
  // HTTP/WebSocket polling now runs in audioTask on core 0.
#endif
}

} // namespace PatternflowAudio
