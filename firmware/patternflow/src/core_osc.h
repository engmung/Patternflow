#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_encoders.h"
#include "core_wifi.h"

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

// Runtime enable flag (separate from PF_OSC_ENABLED compile-time flag).
// When false, send and receive both skip — WiFi stays connected, but the
// device behaves like OSC is off. Toggle from the device via K2 longpress;
// persisted in NVS so it survives reboot.
bool runtimeEnabled = true;

// Incoming OSC: external host (Ableton/Max) can drive the device.
// Receivers stash actions here; main loop pulls them out at safe points.
int32_t pendingKnobDelta[4] = {0, 0, 0, 0};
int pendingPatternIdx = -1;
bool pendingContentToggle = false;
uint8_t rxBuf[256];

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

// --- OSC receive helpers ---
// OSC strings: null-terminated, padded to 4-byte boundary. Returns the
// next read offset, or 0 on malformed input (offset 0 is never valid
// for "after a string").
inline size_t readPaddedString(const uint8_t* buf, size_t len, size_t off,
                               const char*& out) {
  if (off >= len) return 0;
  out = (const char*)(buf + off);
  size_t end = off;
  while (end < len && buf[end] != 0) end++;
  if (end >= len) return 0;
  size_t after = end + 1;
  while ((after % 4) != 0) after++;
  return after;
}

inline int32_t readInt32BE(const uint8_t* buf, size_t off) {
  return ((int32_t)buf[off] << 24) | ((int32_t)buf[off + 1] << 16) |
         ((int32_t)buf[off + 2] << 8) | (int32_t)buf[off + 3];
}

inline void handleIncomingMessage(const char* addr, const char* types,
                                  const uint8_t* buf, size_t len, size_t argOff) {
  // /patternflow/knob/N/delta i
  if (strncmp(addr, "/patternflow/knob/", 18) == 0) {
    int n = addr[18] - '1';
    if (n < 0 || n > 3) return;
    const char* suffix = addr + 19;
    if (strcmp(suffix, "/delta") == 0 && types[0] == 'i' && argOff + 4 <= len) {
      pendingKnobDelta[n] += readInt32BE(buf, argOff);
    }
    return;
  }
  // /patternflow/pattern/index i
  if (strcmp(addr, "/patternflow/pattern/index") == 0 &&
      types[0] == 'i' && argOff + 4 <= len) {
    pendingPatternIdx = readInt32BE(buf, argOff);
    return;
  }
  // /patternflow/content/toggle (no args needed)
  if (strcmp(addr, "/patternflow/content/toggle") == 0) {
    pendingContentToggle = true;
    return;
  }
}

inline void pollReceive() {
  if (!ready) return;
  int size = udp.parsePacket();
  if (size <= 0) return;
  if (size > (int)sizeof(rxBuf)) { udp.flush(); return; }

  int n = udp.read(rxBuf, sizeof(rxBuf));
  if (n <= 0) return;

  const char* addr = nullptr;
  size_t off = readPaddedString(rxBuf, n, 0, addr);
  if (off == 0 || !addr) return;

  const char* types = nullptr;
  off = readPaddedString(rxBuf, n, off, types);
  if (off == 0 || !types || types[0] != ',') return;

  handleIncomingMessage(addr, types + 1, rxBuf, n, off);
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
  if (!runtimeEnabled) return "OFF (runtime)";
  if (status == STATUS_BAD_HOST) return "BAD HOST";
  if (WiFi.status() != WL_CONNECTED) return PatternflowWifi::statusText();
  if (!ready) return "WIFI OK";
  return "READY";
#else
  return "OFF (compile-time)";
#endif
}

inline bool isReady() {
#if PF_OSC_ENABLED
  return runtimeEnabled && ready && WiFi.status() == WL_CONNECTED;
#else
  return false;
#endif
}

inline bool isCompiledIn() {
#if PF_OSC_ENABLED
  return true;
#else
  return false;
#endif
}

inline bool isRuntimeEnabled() {
#if PF_OSC_ENABLED
  return runtimeEnabled;
#else
  return false;
#endif
}

inline void setRuntimeEnabled(bool on) {
#if PF_OSC_ENABLED
  runtimeEnabled = on;
#else
  (void)on;
#endif
}

// Best-effort local IP string for the info screen. Returns "—" if WiFi
// is not connected (or OSC isn't compiled in).
inline String localIpString() {
#if PF_OSC_ENABLED
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return String("—");
#else
  return String("—");
#endif
}

inline const char* remoteHost() {
#if PF_OSC_ENABLED
  return PF_OSC_REMOTE_HOST;
#else
  return "—";
#endif
}

inline int remotePort() {
#if PF_OSC_ENABLED
  return PF_OSC_REMOTE_PORT;
#else
  return 0;
#endif
}

// Start the OSC UDP service. Wi-Fi is owned by PatternflowWifi, so this is
// called from the connect edge in loop() (and again on every reconnect —
// safe, it just re-announces). Returns quietly if Wi-Fi isn't up yet.
inline void begin() {
#if PF_OSC_ENABLED
  if (WiFi.status() != WL_CONNECTED) return;

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

// Drain any pending knob delta sent over OSC for one knob.
// Main loop calls this once per knob per frame after computing the
// hardware-accelerated knobDeltas, so OSC-driven motion is added on
// top without going through the acceleration curve.
inline int32_t consumeKnobDelta(int idx) {
#if PF_OSC_ENABLED
  if (idx < 0 || idx > 3) return 0;
  int32_t d = pendingKnobDelta[idx];
  pendingKnobDelta[idx] = 0;
  return d;
#else
  (void)idx;
  return 0;
#endif
}

inline bool consumePatternIdx(int& outIdx) {
#if PF_OSC_ENABLED
  if (pendingPatternIdx < 0) return false;
  outIdx = pendingPatternIdx;
  pendingPatternIdx = -1;
  return true;
#else
  (void)outIdx;
  return false;
#endif
}

inline bool consumeContentToggle() {
#if PF_OSC_ENABLED
  if (!pendingContentToggle) return false;
  pendingContentToggle = false;
  return true;
#else
  return false;
#endif
}

inline void update(const InputFrame& input, const char* contentName, int patternIdx, int contentMode, int appMode) {
#if PF_OSC_ENABLED
  if (!ready) return;
  if (!runtimeEnabled) return;  // toggled off from the device
  if (WiFi.status() != WL_CONNECTED) {
    status = STATUS_WIFI_LOST;
    return;
  }

  // Drain any incoming OSC messages first so the main loop sees them
  // on this frame. Returns immediately if no packet is waiting.
  pollReceive();

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
