// ═══════════════════════════════════════════════════════════
// PatternFlow - Audio-react WebSocket server
//
// Hosts a small browser UI on port 80 (audio_index.h) and a WebSocket
// endpoint on port 81. Browsers connect, send normalized 0..1 knob
// values per frame (typically from Web Audio FFT band analysis), and
// the device exposes those values through InputFrame::knobAudioActive /
// knobAudioValue so patterns can react in real time.
//
// Wi-Fi is shared with OSC and OTA: whichever module brings the
// connection up first, the others reuse it. When PF_AUDIO_ENABLED is 0
// the entire module compiles to no-ops and the WebSockets library is
// not pulled in.
//
// Message protocol (text frames, no quoting):
//   k=N,v=F   set knob N (0..3) to value F (clamped to 0..1)
//   off=N     release knob N back to encoder control
//   off       release all four knobs
//
// Auto-release: if no message updates a knob for AUDIO_TIMEOUT_MS the
// knob deactivates automatically. Protects against a browser tab that
// closes mid-track and leaves the device stuck on the last value.
//
// Library dependency: WebSockets by Markus Sattler (Links2004) —
// install via Arduino Library Manager. WebServer is part of the ESP32
// Arduino core and needs no extra install.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
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

// 500 ms quiet window — if no update arrives, the knob deactivates so
// the physical encoder regains control. Long enough to ride out a few
// dropped WS frames at 30–60 Hz, short enough that closing the browser
// tab releases the knob almost instantly.
constexpr uint32_t AUDIO_TIMEOUT_MS = 500;

inline WebServer httpServer(PF_AUDIO_HTTP_PORT);
inline WebSocketsServer wsServer(PF_AUDIO_WS_PORT);

inline bool initialized = false;
inline volatile bool active[4]      = { false, false, false, false };
inline volatile float values[4]     = { 0.0f, 0.0f, 0.0f, 0.0f };
inline uint32_t lastUpdateMs[4]     = { 0, 0, 0, 0 };
inline uint32_t connectedClients    = 0;

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

inline void onEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      connectedClients++;
      IPAddress ip = wsServer.remoteIP(num);
      Serial.printf("[AUDIO] client %u from %s (%u connected)\n",
                    num, ip.toString().c_str(), connectedClients);
      break;
    }
    case WStype_DISCONNECTED:
      if (connectedClients > 0) connectedClients--;
      Serial.printf("[AUDIO] client %u disconnected (%u connected)\n",
                    num, connectedClients);
      // Last client out — drop any held overrides so the device doesn't
      // get stuck on whatever the browser was sending at disconnect.
      if (connectedClients == 0) {
        for (int i = 0; i < 4; i++) active[i] = false;
      }
      break;
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
                ip.c_str(), PF_AUDIO_HTTP_PORT,
                ip.c_str(), PF_AUDIO_WS_PORT);
#endif
}

inline void handle() {
#if PF_AUDIO_ENABLED
  if (!initialized) return;
  httpServer.handleClient();
  wsServer.loop();

  // Auto-release knobs that haven't been refreshed recently.
  uint32_t now = millis();
  for (int i = 0; i < 4; i++) {
    if (active[i] && (now - lastUpdateMs[i]) > AUDIO_TIMEOUT_MS) {
      active[i] = false;
    }
  }
#endif
}

} // namespace PatternflowAudio
