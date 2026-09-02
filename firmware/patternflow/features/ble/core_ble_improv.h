// ═══════════════════════════════════════════════════════════
// PatternFlow - Wi-Fi provisioning over Bluetooth LE (Improv-BLE)
//
// A phone hands the panel a network with no USB, no desktop, no app: the
// browser flasher already speaks Improv-Serial (src/core_improv.h), and
// Improv has a BLE variant with the SAME RPC payloads carried over five GATT
// characteristics instead of a serial frame. Chrome on Android drives it from
// improv-wifi.com (or from our own site) through Web Bluetooth.
//
// This is the successor to the setup-portal attempt (PR #375, reverted in
// #381): a SoftAP captive portal never reached the phone's screen - Samsung
// does not raise a login sheet for a private-range portal, and the core-2.x
// DNSServer stopped answering after minutes. BLE has none of those parts:
// one GATT write, no DNS, no captive webview.
//
// ── Why it is not always on ─────────────────────────────────────────────
//
// The BLE controller and host take internal DRAM, and internal DRAM is what
// caps a loadable module's .text. So this feature runs the radio only while
// it is useful:
//
//   - a panel with nothing provisioned advertises from boot;
//   - a panel whose remembered networks keep failing advertises after a
//     grace period (a returning router still wins);
//   - once Wi-Fi is up, it lingers long enough for the phone to read its
//     answer, then STOPS the stack and hands the controller's memory back
//     (esp_bt_controller_mem_release). That release is one-way until reboot,
//     which is fine for provisioning and is the whole point: steady-state
//     cost is zero.
//
// An edition that keeps BLE alive for something else (BLE MIDI) sets
// PF_BLE_RELEASE_ON_CONNECT 0 in its overrides.h.
//
// ── Threading ───────────────────────────────────────────────────────────
//
// NimBLE callbacks run on the host task (core 0). They only copy bytes into
// a mailbox; every decision, every Wi-Fi call and every notify happens from
// the feature's loop hook on the render core. Same shape as OSC's pending
// actions.
//
// Spec: https://www.improv-wifi.com/ble/
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <esp_bt.h>
#include <esp_heap_caps.h>

#include "config.h"
#include "../../src/core_banner.h"
#include "../../src/core_wifi.h"

// ── Settings (all #ifndef, so an edition's overrides.h can set them) ─────

// After Wi-Fi comes up, keep advertising this long, then release the radio.
// 0 keeps BLE alive for the life of the boot (an edition with BLE MIDI).
#ifndef PF_BLE_RELEASE_ON_CONNECT
#define PF_BLE_RELEASE_ON_CONNECT 1
#endif

// How long remembered credentials may keep failing before the panel offers
// BLE setup. Long enough for a router that is still booting.
#ifndef PF_BLE_JOIN_GRACE_MS
#define PF_BLE_JOIN_GRACE_MS 45000
#endif

// After a connect, how long to stay reachable so the phone can read the
// PROVISIONED state and the device URL before the stack goes away.
#ifndef PF_BLE_LINGER_MS
#define PF_BLE_LINGER_MS 15000
#endif

// Require a touch on the panel (any knob, any button) before accepting
// credentials. Improv calls this "authorization"; the phone UI shows
// "press the button on the device". 0 accepts from anyone in range.
#ifndef PF_BLE_REQUIRE_TOUCH
#define PF_BLE_REQUIRE_TOUCH 1
#endif

// A touch authorizes for this long, or for as long as a phone stays connected.
#ifndef PF_BLE_AUTH_WINDOW_MS
#define PF_BLE_AUTH_WINDOW_MS 120000
#endif

// How long a provisioning attempt may take before the phone is told
// "unable to connect". Matches core_improv.h.
#ifndef PF_BLE_PROVISION_TIMEOUT_MS
#define PF_BLE_PROVISION_TIMEOUT_MS 30000
#endif

namespace PatternflowBle {

// ── Improv-BLE constants ─────────────────────────────────────────────────
constexpr const char* UUID_SERVICE      = "00467768-6228-2272-4663-277478268000";
constexpr const char* UUID_STATE        = "00467768-6228-2272-4663-277478268001";
constexpr const char* UUID_ERROR        = "00467768-6228-2272-4663-277478268002";
constexpr const char* UUID_RPC_COMMAND  = "00467768-6228-2272-4663-277478268003";
constexpr const char* UUID_RPC_RESULT   = "00467768-6228-2272-4663-277478268004";
constexpr const char* UUID_CAPABILITIES = "00467768-6228-2272-4663-277478268005";
constexpr uint16_t    ADV_SERVICE_DATA_UUID = 0x4677;

enum : uint8_t {
  STATE_AUTH_REQUIRED = 0x01,
  STATE_AUTHORIZED    = 0x02,
  STATE_PROVISIONING  = 0x03,
  STATE_PROVISIONED   = 0x04,
};

enum : uint8_t {
  ERR_NONE              = 0x00,
  ERR_INVALID_PACKET    = 0x01,
  ERR_UNKNOWN_CMD       = 0x02,
  ERR_UNABLE_TO_CONNECT = 0x03,
  ERR_NOT_AUTHORIZED    = 0x04,
  ERR_UNKNOWN           = 0xFF,
};

enum : uint8_t {
  CMD_WIFI_SETTINGS = 0x01,
  CMD_IDENTIFY      = 0x02,
};

constexpr uint8_t CAP_IDENTIFY = 0x01;

// ── State ────────────────────────────────────────────────────────────────
// Lifecycle of the radio, as reported on /api/status and the NETWORK screen.
enum Phase : uint8_t {
  PHASE_OFF,        // stack not started (yet)
  PHASE_ACTIVE,     // advertising / connected
  PHASE_RELEASED,   // stopped and memory returned; cannot restart until reboot
};

inline bool  runtimeEnabled = true;   // the NETWORK screen row, persisted
inline Phase phase = PHASE_OFF;
inline bool  manualHold = false;      // started over HTTP: do not auto-stop
inline uint8_t improvState = STATE_AUTH_REQUIRED;
inline uint8_t lastError = ERR_NONE;

inline uint32_t authorizedAtMs = 0;
inline uint32_t wifiUpSinceMs = 0;    // when Wi-Fi came up while BLE was active
inline bool     provisioning = false;
inline uint32_t provisionStartMs = 0;
inline bool     bootDecided = false;
inline uint32_t bootMs = 0;

inline NimBLEServer*         server = nullptr;
inline NimBLECharacteristic* chState = nullptr;
inline NimBLECharacteristic* chError = nullptr;
inline NimBLECharacteristic* chResult = nullptr;
inline NimBLECharacteristic* chCommand = nullptr;
inline NimBLECharacteristic* chCapabilities_ = nullptr;

// Host-task → loop mailbox. One packet at a time: a second write while the
// first is unconsumed is dropped (the phone waits for a result anyway).
constexpr size_t MAX_RPC = 200;
inline volatile bool    rpcPending = false;
inline uint8_t          rpcBuf[MAX_RPC];
inline volatile size_t  rpcLen = 0;
inline volatile int     clientCount = 0;
inline volatile bool    clientEdge = false;   // a phone connected since last loop

inline char deviceName[24] = "Patternflow";

inline const char* phaseText() {
  switch (phase) {
    case PHASE_ACTIVE:   return clientCount > 0 ? "connected" : "advertising";
    case PHASE_RELEASED: return "released";
    default:             return "off";
  }
}

inline void logHeap(const char* label) {
  Serial.printf("[BLE] %-18s internal=%u largest=%u\n", label,
                (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
}

// ── Advertising ──────────────────────────────────────────────────────────
// The advertisement carries the 128-bit service (what the browser filters
// on) and the 0x4677 service data (state + capabilities, what the phone
// shows before connecting). That is 31 bytes exactly, so the name goes in
// the scan response.
inline void refreshAdvertising() {
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  if (!adv) return;
  bool was = adv->isAdvertising();
  if (was) adv->stop();

  NimBLEAdvertisementData data;
  data.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  data.addServiceUUID(NimBLEUUID(UUID_SERVICE));
  uint8_t sd[6] = {improvState, CAP_IDENTIFY, 0, 0, 0, 0};
  data.setServiceData(NimBLEUUID(ADV_SERVICE_DATA_UUID), sd, sizeof(sd));
  adv->setAdvertisementData(data);

  NimBLEAdvertisementData scan;
  scan.setName(deviceName);
  adv->setScanResponseData(scan);

  // Only ever one phone at a time; the loop restarts advertising on
  // disconnect, NimBLE would also do it but explicit is easier to reason about.
  adv->start();
}

inline void setState(uint8_t s) {
  if (improvState == s) return;
  improvState = s;
  if (chState) {
    chState->setValue(&improvState, 1);
    if (clientCount > 0) chState->notify();
  }
  if (phase == PHASE_ACTIVE) refreshAdvertising();
}

inline void setError(uint8_t e) {
  lastError = e;
  if (chError) {
    chError->setValue(&lastError, 1);
    if (clientCount > 0) chError->notify();
  }
}

// RPC result: [cmd][len][strings: len+bytes ...][checksum]
inline void sendResult(uint8_t cmd, const String* strings, uint8_t count) {
  uint8_t out[MAX_RPC];
  size_t n = 0;
  out[n++] = cmd;
  size_t lenPos = n++;
  size_t start = n;
  for (uint8_t i = 0; i < count; i++) {
    uint8_t slen = (uint8_t)strings[i].length();
    if (n + 1 + slen + 1 > MAX_RPC) break;
    out[n++] = slen;
    memcpy(&out[n], strings[i].c_str(), slen);
    n += slen;
  }
  out[lenPos] = (uint8_t)(n - start);
  uint32_t sum = 0;
  for (size_t i = 0; i < n; i++) sum += out[i];
  out[n++] = (uint8_t)(sum & 0xFF);
  if (chResult) {
    chResult->setValue(out, n);
    if (clientCount > 0) chResult->notify();
  }
}

// ── GATT callbacks (host task: copy and leave) ───────────────────────────
class CommandCallbacks : public NimBLECharacteristicCallbacks {
 public:
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    if (rpcPending) return;
    NimBLEAttValue v = c->getValue();
    size_t n = v.size();
    if (n > MAX_RPC) n = MAX_RPC;
    memcpy(rpcBuf, v.data(), n);
    rpcLen = n;
    rpcPending = true;
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
 public:
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override {
    clientCount = clientCount + 1;
    clientEdge = true;
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    if (clientCount > 0) clientCount = clientCount - 1;
    clientEdge = true;
  }
};

// Heap-allocated on purpose: NimBLE 2.x takes ownership of callback objects
// and deletes them when the server is torn down. A static object here is a
// free() of non-heap memory at release time - found the hard way.

// ── Lifecycle ────────────────────────────────────────────────────────────
inline bool start() {
  if (phase != PHASE_OFF) return phase == PHASE_ACTIVE;
  logHeap("before init");

  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_BT);
  snprintf(deviceName, sizeof(deviceName), "Patternflow-%02X%02X", mac[4], mac[5]);

  // The coexistence module refuses to bring Bluetooth up while Wi-Fi power
  // save is off - coex_enable() aborts outright (esp-idf #9595). The core
  // runs the radio at WIFI_PS_NONE for OSC/websocket latency, so modem sleep
  // goes on for as long as BLE is alive and off again when it is released.
  // Wi-Fi latency is a little worse in between; provisioning does not care,
  // and an edition that keeps BLE up permanently is choosing this knowingly.
  WiFi.setSleep(true);

  NimBLEDevice::init(deviceName);
  NimBLEDevice::setPower(3);   // dBm - a room, not a building
  NimBLEDevice::setMTU(247);

  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  // Advertising is restarted by the loop on disconnect; NimBLE's own
  // auto-restart is fine too but doubles up with refreshAdvertising().
  server->advertiseOnDisconnect(false);

  NimBLEService* svc = server->createService(UUID_SERVICE);
  chCapabilities_ = svc->createCharacteristic(UUID_CAPABILITIES, NIMBLE_PROPERTY::READ);
  uint8_t caps = CAP_IDENTIFY;
  chCapabilities_->setValue(&caps, 1);

  chState = svc->createCharacteristic(UUID_STATE, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  chError = svc->createCharacteristic(UUID_ERROR, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  chCommand = svc->createCharacteristic(UUID_RPC_COMMAND, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  chCommand->setCallbacks(new CommandCallbacks());
  chResult = svc->createCharacteristic(UUID_RPC_RESULT, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);

  improvState = PF_BLE_REQUIRE_TOUCH ? STATE_AUTH_REQUIRED : STATE_AUTHORIZED;
  if (PatternflowWifi::isConnected()) improvState = STATE_PROVISIONED;
  chState->setValue(&improvState, 1);
  lastError = ERR_NONE;
  chError->setValue(&lastError, 1);
  uint8_t empty = 0;
  chResult->setValue(&empty, 0);

  svc->start();
  phase = PHASE_ACTIVE;
  refreshAdvertising();
  logHeap("advertising");
  Serial.printf("[BLE] setup advertising as \"%s\" (state %u)\n", deviceName, improvState);
  return true;
}

// Stop the stack and give the controller's memory back. One-way: after
// esp_bt_controller_mem_release the controller cannot be initialised again
// until reboot. Blocks for the stop (~100 ms) - it runs once per boot.
inline void stopAndRelease() {
  if (phase != PHASE_ACTIVE) return;
  logHeap("before release");
  NimBLEDevice::deinit(true);
  server = nullptr;
  chState = chError = chResult = chCommand = nullptr;
  chCapabilities_ = nullptr;
  clientCount = 0;
  esp_err_t rc = esp_bt_controller_mem_release(ESP_BT_MODE_BLE);
  WiFi.setSleep(false);   // back to the core's low-latency setting
  phase = PHASE_RELEASED;
  Serial.printf("[BLE] stopped, controller memory %s\n",
                rc == ESP_OK ? "released" : "NOT released");
  logHeap("after release");
}

inline void loadSettings() {
  Preferences p;
  if (p.begin("pf_ble", true)) {
    runtimeEnabled = p.getBool("on", true);
    p.end();
  }
}

inline void setRuntimeEnabled(bool on) {
  runtimeEnabled = on;
  Preferences p;
  if (p.begin("pf_ble", false)) {
    p.putBool("on", on);
    p.end();
  }
  if (!on && phase == PHASE_ACTIVE) stopAndRelease();
}

// A human touched the panel: that is the authorization.
inline void onUserInput() {
  if (phase != PHASE_ACTIVE) return;
  authorizedAtMs = millis();
  if (improvState == STATE_AUTH_REQUIRED) setState(STATE_AUTHORIZED);
}

// ── RPC handling (loop task) ─────────────────────────────────────────────
inline void handleRpc() {
  size_t n = rpcLen;
  const uint8_t* b = rpcBuf;
  // [cmd][len][data...][checksum]
  if (n < 3) { setError(ERR_INVALID_PACKET); return; }
  uint8_t cmd = b[0], len = b[1];
  if ((size_t)len + 3 != n) { setError(ERR_INVALID_PACKET); return; }
  uint32_t sum = 0;
  for (size_t i = 0; i + 1 < n; i++) sum += b[i];
  if ((uint8_t)(sum & 0xFF) != b[n - 1]) { setError(ERR_INVALID_PACKET); return; }
  const uint8_t* d = b + 2;

  switch (cmd) {
    case CMD_IDENTIFY:
      setError(ERR_NONE);
      PatternflowBanner::show("BLE SETUP", 3000);
      break;

    case CMD_WIFI_SETTINGS: {
      if (improvState == STATE_AUTH_REQUIRED) { setError(ERR_NOT_AUTHORIZED); return; }
      if (len < 2) { setError(ERR_INVALID_PACKET); return; }
      uint8_t sl = d[0];
      if ((size_t)1 + sl + 1 > len) { setError(ERR_INVALID_PACKET); return; }
      uint8_t pl = d[1 + sl];
      if ((size_t)1 + sl + 1 + pl > len) { setError(ERR_INVALID_PACKET); return; }
      String ssid; ssid.reserve(sl);
      for (uint8_t i = 0; i < sl; i++) ssid += (char)d[1 + i];
      String pass; pass.reserve(pl);
      for (uint8_t i = 0; i < pl; i++) pass += (char)d[2 + sl + i];
      setError(ERR_NONE);
      setState(STATE_PROVISIONING);
      provisioning = true;
      provisionStartMs = millis();
      wifiUpSinceMs = 0;
      Serial.printf("[BLE] credentials for \"%s\" received\n", ssid.c_str());
      PatternflowWifi::applyCredentials(ssid, pass);
      break;
    }

    default:
      setError(ERR_UNKNOWN_CMD);
      break;
  }
}

inline void sendProvisionedResult() {
  String urls[1];
  uint8_t count = 0;
  if (PatternflowWifi::isConnected()) {
    urls[0] = "http://" + WiFi.localIP().toString();
    count = 1;
  }
  sendResult(CMD_WIFI_SETTINGS, urls, count);
}

// ── Per-frame ────────────────────────────────────────────────────────────
inline void tick() {
  if (!runtimeEnabled || phase == PHASE_RELEASED) return;
  uint32_t now = millis();
  bool wifiUp = PatternflowWifi::isConnected();

  // When to switch the radio on.
  if (phase == PHASE_OFF) {
    if (!bootDecided) {
      bootDecided = true;
      bootMs = now;
      // Nothing to join: advertise from the start. (hasStoredCredentials is
      // valid here - PatternflowWifi::begin() ran before the first frame.)
      if (!PatternflowWifi::hasStoredCredentials() && !wifiUp) start();
      return;
    }
    if (!wifiUp && now - bootMs >= PF_BLE_JOIN_GRACE_MS) start();
    return;
  }

  // Active. Drain the mailbox first.
  if (rpcPending) {
    handleRpc();
    rpcPending = false;
  }

  if (clientEdge) {
    clientEdge = false;
    if (clientCount == 0) {
      // Phone left: advertise again so the next one can find us.
      refreshAdvertising();
    }
  }

  // Authorization expires unless a phone is connected.
  if (improvState == STATE_AUTHORIZED && clientCount == 0 && PF_BLE_REQUIRE_TOUCH &&
      now - authorizedAtMs >= PF_BLE_AUTH_WINDOW_MS) {
    setState(STATE_AUTH_REQUIRED);
  }

  // A provisioning attempt in flight.
  if (provisioning) {
    if (wifiUp) {
      provisioning = false;
      setState(STATE_PROVISIONED);
      sendProvisionedResult();
      wifiUpSinceMs = now;
      Serial.println("[BLE] provisioned - phone told the device URL");
    } else if (now - provisionStartMs >= PF_BLE_PROVISION_TIMEOUT_MS) {
      provisioning = false;
      setError(ERR_UNABLE_TO_CONNECT);
      setState(PF_BLE_REQUIRE_TOUCH ? STATE_AUTH_REQUIRED : STATE_AUTHORIZED);
      Serial.println("[BLE] provisioning failed - unable to connect");
    }
    return;
  }

  // Wi-Fi came up on its own (router back, or credentials from elsewhere).
  if (wifiUp && improvState != STATE_PROVISIONED) {
    setState(STATE_PROVISIONED);
    sendProvisionedResult();
    wifiUpSinceMs = now;
  }
  if (!wifiUp && improvState == STATE_PROVISIONED) {
    // Lost it again: back to accepting credentials.
    setState(PF_BLE_REQUIRE_TOUCH ? STATE_AUTH_REQUIRED : STATE_AUTHORIZED);
    wifiUpSinceMs = 0;
  }

  // Done: linger so the phone reads its answer, then hand the memory back.
#if PF_BLE_RELEASE_ON_CONNECT
  if (wifiUp && !manualHold && wifiUpSinceMs != 0 &&
      now - wifiUpSinceMs >= PF_BLE_LINGER_MS &&
      (clientCount == 0 || now - wifiUpSinceMs >= 4 * PF_BLE_LINGER_MS)) {
    stopAndRelease();
  }
#endif
}

// HTTP / test entry points.
inline bool manualStart() {
  if (!runtimeEnabled) return false;
  manualHold = true;
  bootDecided = true;
  return start();
}
inline void manualStop() {
  manualHold = false;
  stopAndRelease();
}

inline void appendStatus(String& json) {
  json += ",\"ble\":{\"state\":\"";
  json += phaseText();
  json += "\",\"improv\":";
  json += (int)improvState;
  json += ",\"error\":";
  json += (int)lastError;
  json += ",\"name\":\"";
  json += deviceName;
  json += "\",\"runtime\":";
  json += runtimeEnabled ? "true" : "false";
  json += "}";
}

}  // namespace PatternflowBle
