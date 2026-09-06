#pragma once
#include "osc_config.h"

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
  STATUS_READY,
  STATUS_WIFI_LOST
};

#if PF_OSC_ENABLED
WiFiUDP udp;
IPAddress remoteIp;
// True once we have somewhere to send: either PF_OSC_REMOTE_HOST parsed as
// a static IP, or the sender of the first valid incoming OSC packet was
// learned. Until then outgoing messages are dropped silently.
bool remoteValid = false;
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
// Set by /patternflow/ping (and whenever the learned remote changes):
// update() answers with a full announce (hello/version/ip + status) so a
// host that starts AFTER the device still gets the current state.
bool pendingAnnounce = false;
uint8_t rxBuf[256];

// How many datagrams pollReceive() drains per frame. Ableton automation
// can easily send hundreds of messages per second; handling only one per
// frame would let the socket queue grow and the device lag seconds behind.
#ifndef PF_OSC_RX_BUDGET
#define PF_OSC_RX_BUDGET 8
#endif

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

// Read one numeric OSC argument as an int. Max/M4L patches frequently emit
// floats where the spec says int ('f' instead of 'i'); silently dropping
// those was a debugging trap, so both tags are accepted and floats are
// rounded to the nearest integer.
inline bool readNumericArg(char type, const uint8_t* buf, size_t len,
                           size_t off, int32_t& out) {
  if (off + 4 > (size_t)len) return false;
  if (type == 'i') {
    out = readInt32BE(buf, off);
    return true;
  }
  if (type == 'f') {
    union {
      float f;
      uint32_t u;
    } packed;
    packed.u = (uint32_t)readInt32BE(buf, off);
    out = (int32_t)lroundf(packed.f);
    return true;
  }
  return false;
}

inline void handleIncomingMessage(const char* addr, const char* types,
                                  const uint8_t* buf, size_t len, size_t argOff) {
  int32_t arg = 0;
  // /patternflow/knob/N/delta (int or float)
  if (strncmp(addr, "/patternflow/knob/", 18) == 0) {
    int n = addr[18] - '1';
    if (n < 0 || n > 3) return;
    const char* suffix = addr + 19;
    if (strcmp(suffix, "/delta") == 0 &&
        readNumericArg(types[0], buf, len, argOff, arg)) {
      pendingKnobDelta[n] += arg;
    }
    return;
  }
  // /patternflow/pattern/index (int or float)
  if (strcmp(addr, "/patternflow/pattern/index") == 0 &&
      readNumericArg(types[0], buf, len, argOff, arg)) {
    pendingPatternIdx = arg;
    return;
  }
  // /patternflow/content/toggle (no args needed)
  if (strcmp(addr, "/patternflow/content/toggle") == 0) {
    pendingContentToggle = true;
    return;
  }
  // /patternflow/ping (no args needed) — host asks for a full announce.
  // Sending this on host startup solves the "Ableton opened after the
  // device booted and never learns the current pattern" problem, and is
  // also the handshake that lets the device learn the host's IP.
  if (strcmp(addr, "/patternflow/ping") == 0) {
    pendingAnnounce = true;
    return;
  }
}

// Parse and dispatch one datagram already read into rxBuf. Returns true if
// it looked like a valid OSC message (used to decide whether the sender is
// worth learning as the remote host).
inline bool handleDatagram(int n) {
  const char* addr = nullptr;
  size_t off = readPaddedString(rxBuf, n, 0, addr);
  if (off == 0 || !addr || addr[0] != '/') return false;

  const char* types = nullptr;
  off = readPaddedString(rxBuf, n, off, types);
  if (off == 0 || !types || types[0] != ',') return false;

  handleIncomingMessage(addr, types + 1, rxBuf, n, off);
  return true;
}

inline void pollReceive() {
  if (!ready) return;
  // Drain up to PF_OSC_RX_BUDGET datagrams per frame so a fast sender
  // (Live automation, LFO devices) can't build up queue latency. The
  // budget caps worst-case frame cost when someone floods the port.
  for (int i = 0; i < PF_OSC_RX_BUDGET; i++) {
    int size = udp.parsePacket();
    if (size <= 0) return;
    if (size > (int)sizeof(rxBuf)) { udp.flush(); continue; }

    int n = udp.read(rxBuf, sizeof(rxBuf));
    if (n <= 0) continue;

    if (!handleDatagram(n)) continue;

    // Learn (or follow) the remote host from any valid OSC sender. This
    // removes the need to hardcode the laptop's IP in the secrets file:
    // the M4L device just sends /patternflow/ping and the reply goes back
    // to wherever the ping came from. A changed sender re-announces so the
    // new host gets the hello/status it missed.
    IPAddress sender = udp.remoteIP();
    if (!remoteValid || sender != remoteIp) {
      remoteIp = sender;
      remoteValid = true;
      pendingAnnounce = true;
      Serial.printf("[OSC] Remote host learned: %s\n", sender.toString().c_str());
    }
  }
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
  if (!ready || !remoteValid || packetLen == 0) return;
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

// Identity messages: who we are, which firmware, where to reach us.
// Sent on connect and as the first half of a /patternflow/ping reply.
inline void sendHello() {
  sendString("/patternflow/hello", "Patternflow");
  sendString("/patternflow/version", PF_IMPROV_FW_VERSION);
  sendString("/patternflow/ip", WiFi.localIP().toString().c_str());
}
#endif

inline const char* statusText() {
#if PF_OSC_ENABLED
  if (!runtimeEnabled) return "OFF (runtime)";
  if (WiFi.status() != WL_CONNECTED) return PatternflowWifi::statusText();
  if (!ready) return "WIFI OK";
  // Listening, but nobody to send to yet: no static PF_OSC_REMOTE_HOST and
  // no incoming packet to learn a sender from. Send /patternflow/ping from
  // the host (the M4L bridge's Connect button does this) to pair.
  if (!remoteValid) return "WAIT HOST";
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

// Current remote host for the info screen: the learned sender IP once a
// host has pinged us, the static PF_OSC_REMOTE_HOST before that, or "—".
inline String remoteHostString() {
#if PF_OSC_ENABLED
  if (remoteValid) return remoteIp.toString();
  if (PF_OSC_REMOTE_HOST[0] != '\0') return String(PF_OSC_REMOTE_HOST);
  return String("—");
#else
  return String("—");
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

  udp.begin(PF_OSC_LOCAL_PORT);
  ready = true;
  status = STATUS_READY;
  Serial.printf("[OSC] Local IP: %s, listening on :%d\n",
                WiFi.localIP().toString().c_str(), PF_OSC_LOCAL_PORT);

  // A static remote host is optional. Leave PF_OSC_REMOTE_HOST empty (the
  // default) and the device instead learns the host from the first valid
  // OSC packet it receives — typically the M4L bridge's /patternflow/ping.
  if (remoteIp.fromString(PF_OSC_REMOTE_HOST)) {
    remoteValid = true;
    Serial.printf("[OSC] Sending to %s:%d (static)\n", PF_OSC_REMOTE_HOST, PF_OSC_REMOTE_PORT);
    sendHello();
  } else if (!remoteValid) {
    Serial.println("[OSC] No static remote host; waiting for /patternflow/ping to learn one");
  }
#endif
}

// Drain any pending knob delta sent over OSC for one knob.
// Main loop calls this once per knob per frame after the physical deltas are
// read, so OSC-driven motion adds on top of whatever the encoders did.
// (There used to be a fast-spin multiplier applied to the physical deltas that
// this deliberately bypassed. It was removed — both paths are 1:1 now.)
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

  // Answer /patternflow/ping (or a newly learned host) with the full
  // identity + current state, so a host that connects mid-session doesn't
  // have to wait for the next pattern change to know where things stand.
  if (pendingAnnounce) {
    pendingAnnounce = false;
    sendHello();
    sendStatus(contentName, patternIdx, contentMode, appMode);
    lastPatternIdx = patternIdx;
    lastContentMode = contentMode;
    lastAppMode = appMode;
  }

  for (int i = 0; i < 4; i++) {
    // A knob a lane is moving still carries a delta here; whether that goes
    // to the host is PF_OSC_OUT_LANE_MOTION's call (osc_config.h says why
    // it is off by default).
    const bool laneMotion = PF_OSC_OUT_LANE_MOTION ? false : input.knobAudioActive[i];
    if (input.knobDeltas[i] != 0 && !laneMotion) {
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
