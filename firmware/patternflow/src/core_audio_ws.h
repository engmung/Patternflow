// ═══════════════════════════════════════════════════════════
// PatternFlow - Audio-react WebSocket server (async)
//
// Hosts a small browser UI at http://<device>/ and a WebSocket
// endpoint at /ws on the same port. Browsers connect, send normalized
// 0..1 knob values per frame (typically from Web Audio FFT band
// analysis), and the device exposes those values through
// InputFrame::knobAudioActive / knobAudioValue so patterns can react.
//
// Implemented with ESPAsyncWebServer + AsyncTCP because the previous
// synchronous WebServer + WebSocketsServer approach starved the
// pattern render loop on core 1 the moment a client started sending
// data: every text frame was parsed inside loop()'s thread. Async
// libraries dispatch HTTP and WS callbacks from the lwIP task on
// core 0, so the pattern loop on core 1 stays at 60 fps regardless
// of WebSocket traffic.
//
// Wi-Fi is shared with OSC and OTA — whichever module brings it up
// first, the others reuse it.
//
// Message protocol (text frames, no quoting):
//   k=N,v=F   set knob N (0..3) to value F (clamped to 0..1)
//   off=N     release knob N back to encoder control
//   off       release all four knobs
//
// Auto-release: if no message updates a knob for AUDIO_TIMEOUT_MS the
// knob deactivates so the physical encoder regains control if the
// browser tab closes mid-track.
//
// Library dependencies (Arduino Library Manager):
//   - AsyncTCP by ESP32Async
//   - ESPAsyncWebServer by ESP32Async
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"

#if PF_AUDIO_ENABLED
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "audio_index.h"
#endif

namespace PatternflowAudio {

#if PF_AUDIO_ENABLED

constexpr uint32_t AUDIO_TIMEOUT_MS = 500;

inline AsyncWebServer server(PF_AUDIO_HTTP_PORT);
inline AsyncWebSocket ws("/ws");

inline bool initialized = false;
// Touched from the AsyncTCP task on core 0 (WS event callbacks) and
// read from the main loop on core 1. Single-aligned 32-bit reads /
// writes on Xtensa are atomic, so float/bool/uint32 access here is
// safe without a mutex; readers may see one frame of staleness which
// is invisible at 30 Hz update rates.
inline volatile bool     active[4]        = { false, false, false, false };
inline volatile float    values[4]        = { 0.0f, 0.0f, 0.0f, 0.0f };
inline volatile uint32_t lastUpdateMs[4]  = { 0, 0, 0, 0 };
inline volatile uint32_t connectedClients = 0;

inline void parseTextFrame(const char* data, size_t len) {
  if (len < 3 || len > 63) return;
  char buf[64];
  memcpy(buf, data, len);
  buf[len] = '\0';

  if (strncmp(buf, "k=", 2) == 0) {
    int k = -1;
    float v = 0.0f;
    if (sscanf(buf, "k=%d,v=%f", &k, &v) == 2 && k >= 0 && k < 4) {
      if (v < 0.0f) v = 0.0f;
      else if (v > 1.0f) v = 1.0f;
      values[k] = v;
      active[k] = true;
      lastUpdateMs[k] = millis();
    }
  } else if (strncmp(buf, "off=", 4) == 0) {
    int k = -1;
    if (sscanf(buf, "off=%d", &k) == 1 && k >= 0 && k < 4) {
      active[k] = false;
    }
  } else if (strcmp(buf, "off") == 0) {
    for (int i = 0; i < 4; i++) active[i] = false;
  }
}

inline void onWsEvent(AsyncWebSocket* /*srv*/, AsyncWebSocketClient* client,
                      AwsEventType type, void* arg, uint8_t* data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      connectedClients++;
      Serial.printf("[AUDIO] client %u from %s (%u connected)\n",
                    client->id(), client->remoteIP().toString().c_str(),
                    (unsigned)connectedClients);
      break;
    case WS_EVT_DISCONNECT:
      if (connectedClients > 0) connectedClients--;
      Serial.printf("[AUDIO] client %u disconnected (%u connected)\n",
                    client->id(), (unsigned)connectedClients);
      if (connectedClients == 0) {
        for (int i = 0; i < 4; i++) active[i] = false;
      }
      break;
    case WS_EVT_DATA: {
      AwsFrameInfo* info = (AwsFrameInfo*)arg;
      // Only handle single-fragment text frames; control sliders fit
      // easily under the default 1.4 KB frame limit, so multi-part
      // text frames would indicate a bug rather than legitimate data.
      if (info->final && info->index == 0 && info->len == len &&
          info->opcode == WS_TEXT) {
        parseTextFrame((const char*)data, len);
      }
      break;
    }
    default:
      break;
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

inline uint32_t clientCount() {
#if PF_AUDIO_ENABLED
  return connectedClients;
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

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
    AsyncWebServerResponse* resp =
      request->beginResponse_P(200, "text/html", AUDIO_INDEX_HTML);
    request->send(resp);
  });

  server.onNotFound([](AsyncWebServerRequest* request) {
    request->send(404, "text/plain", "Not found");
  });

  server.begin();
  initialized = true;

  String ip = WiFi.localIP().toString();
  Serial.printf("[AUDIO] Ready — UI http://%s:%d  WS ws://%s:%d/ws\n",
                ip.c_str(), PF_AUDIO_HTTP_PORT,
                ip.c_str(), PF_AUDIO_HTTP_PORT);
#endif
}

inline void handle() {
#if PF_AUDIO_ENABLED
  if (!initialized) return;
  // Async server does its own I/O on core 0; nothing to poll here.
  // We only auto-release knobs that stopped receiving updates, so a
  // dropped browser tab doesn't leave the device stuck.
  uint32_t now = millis();
  for (int i = 0; i < 4; i++) {
    if (active[i] && (now - lastUpdateMs[i]) > AUDIO_TIMEOUT_MS) {
      active[i] = false;
    }
  }
#endif
}

} // namespace PatternflowAudio
