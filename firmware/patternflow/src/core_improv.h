// ═══════════════════════════════════════════════════════════
// PatternFlow - Improv-Serial Wi-Fi provisioning
//
// Lets the browser set Wi-Fi after a web flash instead of baking the
// credentials into the binary. ESP Web Tools — the same library behind the
// "Flash" button on the website — speaks Improv-Serial: once this firmware
// answers the protocol over USB serial, the flasher shows a "Connect to
// Wi-Fi" step, sends the SSID/password, and we store them in NVS (see
// core_wifi.h) so they survive reboots and win over the built-in placeholders.
//
// Self-contained: implements the framing + RPC of
// https://www.improv-wifi.com/serial/ directly, no external library, in the
// same single-header style as core_osc.h / core_ota.h. It shares the USB
// Serial used for debug logging — the host parser scans the byte stream for
// the "IMPROV" header and ignores our println() noise, so the two coexist.
//
//   begin()  — announce our initial state once (cheap; the flasher also polls
//              for it on connect).
//   handle() — call every loop: drains incoming serial into the packet parser
//              and drives the (non-blocking) provisioning state machine.
//
// Compiled in only when Wi-Fi is actually used (PF_WIFI_NEEDED, set by
// core_wifi.h) and PF_IMPROV_ENABLED is on; otherwise every entry point is a
// no-op and nothing is pulled in.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_wifi.h"

#if defined(PF_WIFI_NEEDED) && PF_IMPROV_ENABLED
#define PF_IMPROV_ACTIVE 1
#include <WiFi.h>
#endif

namespace PatternflowImprov {

#ifdef PF_IMPROV_ACTIVE

// ── Protocol constants (improv-wifi.com/serial) ──────────────
constexpr uint8_t IMPROV_VERSION = 1;
constexpr char    HEADER[6] = {'I', 'M', 'P', 'R', 'O', 'V'};

// Packet types
enum : uint8_t {
  TYPE_CURRENT_STATE = 0x01,
  TYPE_ERROR_STATE   = 0x02,
  TYPE_RPC_COMMAND   = 0x03,
  TYPE_RPC_RESULT    = 0x04,
};

// Device states
enum : uint8_t {
  STATE_READY        = 0x02,  // ready to accept provisioning
  STATE_PROVISIONING = 0x03,  // attempting to connect
  STATE_PROVISIONED  = 0x04,  // connected
};

// Error codes
enum : uint8_t {
  ERR_NONE              = 0x00,
  ERR_INVALID_PACKET    = 0x01,
  ERR_UNKNOWN_CMD       = 0x02,
  ERR_UNABLE_TO_CONNECT = 0x03,
  ERR_UNKNOWN           = 0xFF,
};

// RPC command ids (host → device)
enum : uint8_t {
  CMD_WIFI_SETTINGS = 0x01,
  CMD_REQUEST_STATE = 0x02,
  CMD_DEVICE_INFO   = 0x03,
  CMD_SCAN_NETWORKS = 0x04,
};

// How long to wait for the new credentials to associate before reporting
// "unable to connect" back to the flasher.
constexpr uint32_t PROVISION_TIMEOUT_MS = 30000;

// Largest data field we accept/emit. Wi-Fi settings (ssid ≤32 + pass ≤63 +
// framing) and our longest result fit comfortably under this.
constexpr size_t MAX_DATA = 256;

inline uint8_t  currentState = STATE_READY;
inline bool     provisioning = false;
inline uint32_t provisionStartMs = 0;

// Forward declarations: the parser dispatches into these.
inline void dispatchRpc();
inline void sendWifiResult();

// ── Outgoing packets ─────────────────────────────────────────
// Frame: "IMPROV" | version | type | len | data… | checksum (sum mod 256),
// followed by CRLF (reference implementations terminate each packet; the
// host parses by header+length, so it's cosmetic but matches convention).
inline void sendPacket(uint8_t type, const uint8_t* data, uint8_t len) {
  uint8_t pkt[6 + 3 + MAX_DATA + 1];
  size_t n = 0;
  for (int i = 0; i < 6; i++) pkt[n++] = (uint8_t)HEADER[i];
  pkt[n++] = IMPROV_VERSION;
  pkt[n++] = type;
  pkt[n++] = len;
  for (uint8_t i = 0; i < len; i++) pkt[n++] = data[i];
  uint32_t sum = 0;
  for (size_t i = 0; i < n; i++) sum += pkt[i];
  pkt[n++] = (uint8_t)(sum & 0xFF);
  Serial.write(pkt, n);
  Serial.write((const uint8_t*)"\r\n", 2);
  Serial.flush();
}

inline void sendCurrentState(uint8_t state) {
  sendPacket(TYPE_CURRENT_STATE, &state, 1);
}

inline void sendError(uint8_t err) {
  sendPacket(TYPE_ERROR_STATE, &err, 1);
}

// RPC result: command id, then a length-prefixed list of strings (each one
// is a 1-byte length followed by its bytes). An empty list (count 0) is a
// valid "no data / end of list" terminator.
inline void sendRpcResult(uint8_t cmd, const String* strings, uint8_t count) {
  uint8_t data[MAX_DATA];
  size_t n = 0;
  data[n++] = cmd;
  size_t lenPos = n++;            // reserve a byte for the payload length
  size_t payloadStart = n;
  for (uint8_t i = 0; i < count; i++) {
    uint8_t slen = (uint8_t)strings[i].length();
    if (n + 1 + slen > MAX_DATA) break;   // never overflow the buffer
    data[n++] = slen;
    memcpy(&data[n], strings[i].c_str(), slen);
    n += slen;
  }
  data[lenPos] = (uint8_t)(n - payloadStart);
  sendPacket(TYPE_RPC_RESULT, data, (uint8_t)n);
}

// Result for the Wi-Fi settings command: an optional redirect URL the flasher
// offers as "Visit Device". We only return one when it points at something
// real — the audio-react web UI served on the device — otherwise an empty
// list (no dead "Visit Device" button).
inline void sendWifiResult() {
  String urls[1];
  uint8_t count = 0;
#if PF_AUDIO_ENABLED
  if (PatternflowWifi::isConnected()) {
    String url = "http://" + WiFi.localIP().toString();
    if (PF_AUDIO_HTTP_PORT != 80) url += ":" + String((int)PF_AUDIO_HTTP_PORT);
    urls[0] = url;
    count = 1;
  }
#endif
  sendRpcResult(CMD_WIFI_SETTINGS, urls, count);
}

// ── Incoming packet parser (byte-at-a-time, non-blocking) ────
inline uint8_t  rxData[MAX_DATA];
inline uint8_t  rxVersion = 0;
inline uint8_t  rxType = 0;
inline uint8_t  rxLen = 0;
inline uint32_t rxSum = 0;        // running checksum over header…data
inline size_t   headerIdx = 0;
inline size_t   dataIdx = 0;

enum : uint8_t { P_HEADER, P_VERSION, P_TYPE, P_LEN, P_DATA, P_CHECKSUM };
inline uint8_t phase = P_HEADER;

inline void resetParser() {
  phase = P_HEADER;
  headerIdx = 0;
  dataIdx = 0;
  rxSum = 0;
}

inline void handleByte(uint8_t b) {
  switch (phase) {
    case P_HEADER:
      if (b == (uint8_t)HEADER[headerIdx]) {
        if (headerIdx == 0) rxSum = 0;
        rxSum += b;
        if (++headerIdx == 6) phase = P_VERSION;
      } else {
        // Mismatch: resync. This byte might itself start a fresh header.
        headerIdx = 0;
        rxSum = 0;
        if (b == (uint8_t)HEADER[0]) { rxSum += b; headerIdx = 1; }
      }
      break;
    case P_VERSION:
      rxVersion = b; rxSum += b; phase = P_TYPE;
      break;
    case P_TYPE:
      rxType = b; rxSum += b; phase = P_LEN;
      break;
    case P_LEN:
      rxLen = b; rxSum += b; dataIdx = 0;
      phase = (rxLen == 0) ? P_CHECKSUM : P_DATA;
      break;
    case P_DATA:
      if (dataIdx < MAX_DATA) rxData[dataIdx] = b;
      rxSum += b;
      if (++dataIdx >= rxLen) phase = P_CHECKSUM;
      break;
    case P_CHECKSUM: {
      bool ok = ((uint8_t)(rxSum & 0xFF) == b) && (rxLen <= MAX_DATA);
      // Only RPC commands are addressed to us; other types (and any garbage
      // that happened to start with "IMPROV") are ignored.
      if (ok && rxVersion == IMPROV_VERSION && rxType == TYPE_RPC_COMMAND) {
        dispatchRpc();
      }
      resetParser();
      break;
    }
  }
}

// ── RPC dispatch ─────────────────────────────────────────────
// rxData holds an RPC command: [cmd][cmd_len][payload…]. rxLen is the whole
// data field (cmd_len + 2).
inline void dispatchRpc() {
  if (rxLen < 2) { sendError(ERR_INVALID_PACKET); return; }
  uint8_t cmd = rxData[0];
  uint8_t cmdLen = rxData[1];
  if ((size_t)cmdLen + 2 > rxLen) { sendError(ERR_INVALID_PACKET); return; }
  const uint8_t* payload = &rxData[2];

  switch (cmd) {
    case CMD_REQUEST_STATE:
      sendCurrentState(currentState);
      // Spec: if already provisioned, follow up with the Wi-Fi result so the
      // flasher can re-offer the device URL.
      if (currentState == STATE_PROVISIONED) sendWifiResult();
      break;

    case CMD_DEVICE_INFO: {
      // [firmware name, firmware version, chip family, device name]
      String info[4] = {
        String("Patternflow"),
        String(PF_IMPROV_FW_VERSION),
        String("ESP32-S3"),
        String("Patternflow"),
      };
      sendRpcResult(CMD_DEVICE_INFO, info, 4);
      break;
    }

    case CMD_SCAN_NETWORKS:
      // We don't scan on-device; an empty terminating list tells the flasher
      // to fall back to manual SSID entry.
      sendRpcResult(CMD_SCAN_NETWORKS, nullptr, 0);
      break;

    case CMD_WIFI_SETTINGS: {
      // payload: [ssid_len][ssid…][pass_len][pass…]
      if (cmdLen < 2) { sendError(ERR_INVALID_PACKET); return; }
      uint8_t ssidLen = payload[0];
      if ((size_t)1 + ssidLen + 1 > cmdLen) { sendError(ERR_INVALID_PACKET); return; }
      uint8_t passLen = payload[1 + ssidLen];
      if ((size_t)1 + ssidLen + 1 + passLen > cmdLen) { sendError(ERR_INVALID_PACKET); return; }

      String ssid; ssid.reserve(ssidLen);
      for (uint8_t i = 0; i < ssidLen; i++) ssid += (char)payload[1 + i];
      String pass; pass.reserve(passLen);
      for (uint8_t i = 0; i < passLen; i++) pass += (char)payload[2 + ssidLen + i];

      sendError(ERR_NONE);
      currentState = STATE_PROVISIONING;
      sendCurrentState(currentState);
      provisioning = true;
      provisionStartMs = millis();
      PatternflowWifi::applyCredentials(ssid, pass);
      break;
    }

    default:
      sendError(ERR_UNKNOWN_CMD);
      break;
  }
}

// ── Lifecycle ────────────────────────────────────────────────
inline void begin() {
  // Announce that we speak Improv so a freshly-connected flasher sees us even
  // before it polls. Harmless when nobody is listening.
  sendCurrentState(currentState);
}

inline void handle() {
  while (Serial.available() > 0) {
    handleByte((uint8_t)Serial.read());
  }

  // Drive the attempt kicked off by a Wi-Fi settings command.
  if (provisioning) {
    if (PatternflowWifi::isConnected()) {
      provisioning = false;
      currentState = STATE_PROVISIONED;
      sendCurrentState(currentState);
      sendWifiResult();
    } else if (millis() - provisionStartMs >= PROVISION_TIMEOUT_MS) {
      provisioning = false;
      currentState = STATE_READY;
      sendError(ERR_UNABLE_TO_CONNECT);
      sendCurrentState(currentState);
    }
  }
}

#else  // !PF_IMPROV_ACTIVE — no Wi-Fi feature, or Improv disabled

inline void begin() {}
inline void handle() {}

#endif

} // namespace PatternflowImprov
