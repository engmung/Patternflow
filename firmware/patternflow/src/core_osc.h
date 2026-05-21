#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_encoders.h"

#if PF_OSC_ENABLED
#include <WiFi.h>
#include <WiFiUdp.h>
#endif

namespace PatternflowOsc {

enum Status {
  STATUS_DISABLED,
  STATUS_WIFI_CONNECTING,
  STATUS_WIFI_TIMEOUT,
  STATUS_BAD_HOST,
  STATUS_READY,
  STATUS_WIFI_LOST
};

#if PF_OSC_ENABLED
WiFiUDP udp;
IPAddress remoteIp;
bool ready = false;
Status status = STATUS_DISABLED;
uint32_t lastStatusMs = 0;
int lastPatternIdx = -1;
int lastContentMode = -1;
int lastAppMode = -1;
bool lastBtnHeld[4] = {false, false, false, false};
uint8_t packet[256];
size_t packetLen = 0;

inline void appendByte(uint8_t value) {
  if (packetLen < sizeof(packet)) packet[packetLen++] = value;
}

inline void appendPaddedString(const char* value) {
  if (!value) value = "";
  while (*value && packetLen < sizeof(packet)) appendByte((uint8_t)*value++);
  appendByte(0);
  while ((packetLen % 4) != 0) appendByte(0);
}

inline void appendUInt32(uint32_t value) {
  appendByte((uint8_t)((value >> 24) & 0xff));
  appendByte((uint8_t)((value >> 16) & 0xff));
  appendByte((uint8_t)((value >> 8) & 0xff));
  appendByte((uint8_t)(value & 0xff));
}

inline void appendInt32(int32_t value) {
  appendUInt32((uint32_t)value);
}

inline void appendFloat32(float value) {
  union {
    float f;
    uint32_t u;
  } packed;
  packed.f = value;
  appendUInt32(packed.u);
}

inline bool beginMessage(const char* address, const char* types) {
  packetLen = 0;
  appendPaddedString(address);

  char typeTag[12];
  snprintf(typeTag, sizeof(typeTag), ",%s", types);
  appendPaddedString(typeTag);

  return packetLen < sizeof(packet);
}

inline void flushMessage() {
  if (!ready || packetLen == 0) return;
  udp.beginPacket(remoteIp, PF_OSC_REMOTE_PORT);
  udp.write(packet, packetLen);
  udp.endPacket();
}

inline void sendInt(const char* address, int32_t value) {
  if (!beginMessage(address, "i")) return;
  appendInt32(value);
  flushMessage();
}

inline void sendFloat(const char* address, float value) {
  if (!beginMessage(address, "f")) return;
  appendFloat32(value);
  flushMessage();
}

inline void sendString(const char* address, const char* value) {
  if (!beginMessage(address, "s")) return;
  appendPaddedString(value);
  flushMessage();
}

inline void sendKnobEvent(int index, long clicks, int delta) {
  char address[40];
  snprintf(address, sizeof(address), "/patternflow/knob/%d/delta", index + 1);
  sendInt(address, delta);
  snprintf(address, sizeof(address), "/patternflow/knob/%d/clicks", index + 1);
  sendInt(address, (int32_t)clicks);
}

inline void sendButtonEvent(int index, const char* eventName, int value) {
  char address[40];
  snprintf(address, sizeof(address), "/patternflow/button/%d/%s", index + 1, eventName);
  sendInt(address, value);
}

inline void sendStatus(const char* contentName, int patternIdx, int contentMode, int appMode) {
  sendInt("/patternflow/pattern/index", patternIdx);
  sendString("/patternflow/pattern/name", contentName);
  sendInt("/patternflow/content/mode", contentMode);
  sendInt("/patternflow/app/mode", appMode);
}
#endif

inline const char* statusText() {
#if PF_OSC_ENABLED
  switch (status) {
    case STATUS_WIFI_CONNECTING: return "OSC WIFI...";
    case STATUS_WIFI_TIMEOUT: return "OSC WIFI FAIL";
    case STATUS_BAD_HOST: return "OSC BAD HOST";
    case STATUS_READY: return "OSC READY";
    case STATUS_WIFI_LOST: return "OSC WIFI LOST";
    default: return "OSC OFF";
  }
#else
  return "OSC OFF";
#endif
}

inline bool isReady() {
#if PF_OSC_ENABLED
  return ready && WiFi.status() == WL_CONNECTED;
#else
  return false;
#endif
}

inline void begin() {
#if PF_OSC_ENABLED
  Serial.println("[OSC] Connecting Wi-Fi...");
  status = STATUS_WIFI_CONNECTING;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(PF_WIFI_SSID, PF_WIFI_PASS);

  uint32_t startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < PF_WIFI_CONNECT_TIMEOUT_MS) {
    delay(100);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OSC] Wi-Fi connect timeout; OSC disabled for this boot");
    status = STATUS_WIFI_TIMEOUT;
    return;
  }

  if (!remoteIp.fromString(PF_OSC_REMOTE_HOST)) {
    Serial.println("[OSC] Invalid PF_OSC_REMOTE_HOST; OSC disabled");
    status = STATUS_BAD_HOST;
    return;
  }

  udp.begin(PF_OSC_LOCAL_PORT);
  ready = true;
  status = STATUS_READY;

  Serial.printf("[OSC] Local IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[OSC] Sending to %s:%d\n", PF_OSC_REMOTE_HOST, PF_OSC_REMOTE_PORT);
  sendString("/patternflow/hello", "Patternflow");
  sendString("/patternflow/ip", WiFi.localIP().toString().c_str());
#endif
}

inline void update(const InputFrame& input, const char* contentName, int patternIdx, int contentMode, int appMode) {
#if PF_OSC_ENABLED
  if (!ready) return;
  if (WiFi.status() != WL_CONNECTED) {
    status = STATUS_WIFI_LOST;
    return;
  }

  for (int i = 0; i < 4; i++) {
    if (input.knobDeltas[i] != 0) {
      sendKnobEvent(i, input.knobs[i], input.knobDeltas[i]);
    }

    if (input.btnPressed[i]) {
      sendButtonEvent(i, "press", 1);
    }

    if (input.btnHeld[i] != lastBtnHeld[i]) {
      lastBtnHeld[i] = input.btnHeld[i];
      sendButtonEvent(i, "held", input.btnHeld[i] ? 1 : 0);
    }
  }

  if (patternIdx != lastPatternIdx || contentMode != lastContentMode || appMode != lastAppMode) {
    lastPatternIdx = patternIdx;
    lastContentMode = contentMode;
    lastAppMode = appMode;
    sendStatus(contentName, patternIdx, contentMode, appMode);
  }

  uint32_t now = millis();
  if ((now - lastStatusMs) > 1000) {
    lastStatusMs = now;
    sendInt("/patternflow/heartbeat", (int32_t)(now / 1000));
  }
#else
  (void)input;
  (void)contentName;
  (void)patternIdx;
  (void)contentMode;
  (void)appMode;
#endif
}

} // namespace PatternflowOsc
