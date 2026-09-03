// ═══════════════════════════════════════════════════════════
// PatternFlow - Device status page
//
//   GET  /status       human page, refreshes itself
//   GET  /api/status   the same numbers as JSON
//   POST /api/sleep    on=1|0|toggle — the console's panel switch
//
// Sleep control lives here rather than on /api/display, where the plumbing
// first landed, for two reasons: it is a power state and not a display
// calibration, and /api/display is independently compile-out-able
// (-DPF_DISPLAY_HTTP_ENABLED=0), which would leave the console's switch dead in
// a build that otherwise has a complete console. This endpoint is gated by the
// same flag as the server that serves that console.
//
// Exists because these are the numbers that actually explain the device when
// something is off. Internal heap in particular: HUB75's DMA buffers take most
// of it, and once it drops near zero the web console starts answering with
// headers and no body while Wi-Fi and OSC carry on looking healthy — an
// unpleasant thing to diagnose blind. Worth showing rather than hiding.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"

#ifndef PF_STATUS_HTTP_ENABLED
#define PF_STATUS_HTTP_ENABLED 1
#endif

#if PF_STATUS_HTTP_ENABLED
#include <FFat.h>
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <WiFi.h>
#include <esp_heap_caps.h>
#include "core_names.h"

#include "core_http.h"
#include "core_bus.h"
#include "core_canvas.h"   // presentUs
#include "core_send.h"
#include "core_sleep.h"    // panel-off state

#include "status_index.h"
#endif

// Smoothed frame time, owned by the sketch's loop().
extern uint32_t renderFrameUs;

namespace PatternflowStatusHttp {

#if PF_STATUS_HTTP_ENABLED

// One core-owned server (core_http.h); this used to borrow audio's.
inline WebServer& server() { return PatternflowHttp::server(); }

// Extra /api/status fields, supplied from outside the core. The sketch
// points this at the feature dispatcher at boot; a build with no features
// leaves it null and the endpoint is unchanged. Declared here rather
// than including features/, because dependencies point one way: the core
// never reaches into what attaches to it.
inline void (*extraStatus)(String&) = nullptr;

// Extra capability strings, same arrangement: the sketch points this at
// the feature dispatcher, and each feature that declares a `cap` adds it.
// Appends `,"name"` per cap — the core always emits at least two, so a
// leading comma is always correct here.
inline void (*extraCaps)(String&) = nullptr;
// Console-header nav entries contributed by features: `["/path","Label"]`
// pairs. The header's own pages stay in the header; this is how a page the
// core has never heard of gets linked without the core naming it.
inline void (*extraNav)(String&) = nullptr;

inline bool initialized = false;

inline void appendKb(String& json, const char* key, uint32_t bytes) {
  json += "\"";
  json += key;
  json += "\":";
  json += bytes;
  json += ',';
}

inline void handleStatus() {
  String json = "{";

  json += "\"version\":\"" PF_IMPROV_FW_VERSION "\",";
  // Which firmware this is, and what it can do. `variant` is for humans and
  // for the site's variant list; `caps` is what the lab and the console
  // probe instead of assuming a feature exists (RFC §2.2).
  json += "\"variant\":\"" PF_VARIANT "\",";
  json += "\"variantVersion\":\"" PF_VARIANT_VERSION "\",";
  json += "\"caps\":[";
  {
    bool first = true;
    auto cap = [&](const char* name) {
      if (!first) json += ',';
      first = false;
      json += '"';
      json += name;
      json += '"';
    };
    cap("patterns");   // the .pfm loader and its volume - always core
    cap("params");     // the absolute bus + POST /api/params - always core
    // "osc" is no longer emitted here: OSC is a feature and declares its own
    // cap, and leaving this behind reported it twice on a build that has it
    // and once on a build that does not.
#if PF_SLEEP_ENABLED
    cap("sleep");
#endif
    // Everything else is a feature saying what it is. Built from the
    // features actually loaded, not from compile flags: a build with the
    // show code present but no show feature registered does not play
    // shows, and a client probing caps must not be told otherwise.
    (void)cap;  // the core's own entries above use it
    if (extraCaps) extraCaps(json);
  }
  json += "],";
  // Pages the loaded features serve. Empty on a build with no features, which
  // is the default, and the console header then draws only its own.
  json += "\"featureNav\":[";
  if (extraNav) extraNav(json);
  json += "],";
  json += "\"uptime\":";
  json += (uint32_t)(millis() / 1000);
  json += ',';
  json += "\"panel\":\"";
  json += PANEL_RES_W;
  json += 'x';
  json += PANEL_RES_H;
  json += "\",";

  // Network
  bool up = WiFi.status() == WL_CONNECTED;
  json += "\"wifi\":";
  json += up ? "true" : "false";
  json += ",\"ssid\":\"";
  json += up ? WiFi.SSID() : String("");
  json += "\",\"ip\":\"";
  json += up ? WiFi.localIP().toString() : String("");
  json += "\",\"rssi\":";
  json += up ? WiFi.RSSI() : 0;
  json += ",\"host\":\"" PF_OTA_HOSTNAME "\",";
  json += "\"hostAlias\":\"";
  json += PatternflowNames::alias();
  json += "\",";
  // Actual transmit power, in dBm. Core sets 13 as a conformance fix and a
  // variant may override it, so the number a panel is really running at
  // stopped being knowable from the firmware version alone — and the panel
  // is the only thing that can answer honestly. The radio reports quarter
  // dBm; a join must have happened or this reads garbage, hence the guard.
  json += "\"txDbm\":";
  json += up ? String((float)WiFi.getTxPower() / 4.0f, 1) : String("null");
  json += ',';

  // Memory. Internal is the scarce one; PSRAM is where the cold data lives.
  appendKb(json, "heapInternal", heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
  appendKb(json, "heapLargest", heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
  appendKb(json, "heapPsram", heap_caps_get_free_size(MALLOC_CAP_SPIRAM));

  // Storage
  json += "\"fsMounted\":";
  json += moduleStorageMounted ? "true" : "false";
  json += ',';
  appendKb(json, "fsTotal", moduleStorageMounted ? (uint32_t)FFat.totalBytes() : 0);
  appendKb(json, "fsUsed", moduleStorageMounted ? (uint32_t)FFat.usedBytes() : 0);

  // Patterns
  json += "\"patterns\":";
  json += NUM_PATTERNS;
  json += ",\"presets\":";
  json += NUM_PRESETS;
  json += ",\"modules\":";
  json += numModules;
  json += ",\"active\":\"";
  json += (activePatternIdx >= 0 && patterns) ? patterns[activePatternIdx].name : "-";
  json += "\",\"activeIsModule\":";
  json += (activePatternIdx >= 0 && patterns && patterns[activePatternIdx].modulePath)
              ? "true" : "false";
  json += ',';

  // Sleep. Worth a field of its own rather than leaving it to be inferred: a
  // sleeping device answers every other question here looking perfectly
  // healthy, and "the panel is dark" is the one thing the page can't show.
  json += "\"sleep\":";
  json += PatternflowSleep::isSleeping() ? "true" : "false";
  json += ',';

  // The other reason the panel can be dark while everything here reads fine:
  // this very page is what paused it. The console has always had a branch for
  // this state — it just never received the field to trigger it.
  // Knob positions and the absolute-parameter bus. These lived only in
  // GET /api/mqtt, which is a feature — so a build without MQTT could be
  // written to but not read, and an HTTP-only integration (Home
  // Assistant) would have lost knob state the day MQTT left. They belong
  // in core, next to everything else a client polls for.
  json += "\"knobs\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += PatternflowBus::knobAt(i);
  }
  json += "],\"params\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += PatternflowBus::heldValue(i);
  }
  json += "],\"laneActive\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += PatternflowBus::laneIsActive(i) ? "true" : "false";
  }
  json += "],\"lanes\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += String(PatternflowBus::laneAt(i), 3);
  }
  json += "],\"paramActive\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += PatternflowBus::isHeld(i) ? "true" : "false";
  }
  json += "],";
  json += "\"consolePaused\":";
  json += PatternflowPatternsHttp::isConsolePaused() ? "true" : "false";
  json += ',';

  // Render + last module load
  json += "\"frameUs\":";
  json += renderFrameUs;
  // How the frame splits, which core the render loop is on, and what the
  // driver settled on for depth/refresh. The last two are not fixed: the
  // library trades colour depth against the requested min_refresh_rate, so
  // reading them back is the only way to know what the panel is really doing.
  json += ",\"presentUs\":";
  json += PFCanvas::presentUs;
  json += ",\"loopCore\":";
  json += xPortGetCoreID();
  json += ",\"colorBits\":";
  json += dma_display->getCfg().getPixelColorDepthBits();
  json += ",\"refreshHz\":";
  json += dma_display->calculated_refresh_rate;
  // Why the last module load failed, if it did. Without it a refusal is
  // invisible from the network: the panel just stops and nothing says why.
  json += ",\"loadError\":\"";
  json += PFModuleLoader::error();
  json += "\"";
  json += ",\"load\":{\"total\":";
  json += PFModuleLoader::lastTotalUs;
  json += ",\"read\":";
  json += PFModuleLoader::lastReadUs;
  json += ",\"relocate\":";
  json += PFModuleLoader::lastRelocateUs;
  json += ",\"setup\":";
  json += PFModuleLoader::lastSetupUs;
  json += "}";

  // Whoever registered extraStatus appends its fields — an MQTT bridge
  // reports its role and connection there, so this file never has to
  // know what MQTT is.
  if (extraStatus) extraStatus(json);
  json += "}";

  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", json);
}

inline void handleIndex() {
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  PFSend::progmem(server(), STATUS_INDEX_HTML);
}

// POST /api/sleep  on=1|0|toggle
//
// The reply reports the state BEFORE the transition, because request() only
// queues it — the actual work (stopping the DMA engine, reclocking the CPU)
// belongs in loop(), not inside an open HTTP response. That is a deliberate
// property, not a rough edge: the console sets its switch optimistically and
// lets the next poll confirm.
// POST /api/params?p1=..&p2=..&p3=..&p4=..  (0..1000, any subset)
//
// Writing the absolute bus over plain HTTP. Until now the only way in was
// MQTT, which made "turn a knob remotely" require a broker — so the bus,
// which is module-ABI ground, had an optional feature as its only door.
// This is that door in the core (RFC §2.2), and it is what lets MQTT leave
// without taking a capability with it.
//
// One shot per request, by contract: this server takes a single connection
// and pauses drawing while it answers, so a slider must debounce rather
// than stream. Physical encoder motion releases a channel exactly as it
// does for any other writer.
inline void handleParams() {
  PatternflowPatternsHttp::noteConsoleApiCall();

  int written = 0;
  String error;
  for (int i = 0; i < 4; i++) {
    // Built without character escapes on purpose: a literal NUL once
    // landed here through the editing path, and this cannot repeat.
    char key[3];
    key[0] = 0x70;             // p
    key[1] = (char)(0x31 + i); // 1..4
    key[2] = 0;
    if (!server().hasArg(key)) continue;
    String raw = server().arg(key);
    raw.trim();
    long value = raw.toInt();
    if (raw.length() == 0 || value < 0 || value > PF_BUS_MAX) {
      error = String(key) + " must be 0.." + String(PF_BUS_MAX);
      break;
    }
    PatternflowBus::applyRemoteParam(i, value);
    written++;
  }

  server().sendHeader("Cache-Control", "no-store");
  if (error.length()) {
    server().send(400, "application/json",
                  String("{\"ok\":false,\"error\":\"") + error + "\"}");
    return;
  }
  if (written == 0) {
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"send at least one of p1..p4\"}");
    return;
  }

  String body = "{\"ok\":true,\"params\":[";
  for (int i = 0; i < 4; i++) {
    if (i) body += ',';
    body += PatternflowBus::heldValue(i);
  }
  body += "],\"active\":[";
  for (int i = 0; i < 4; i++) {
    if (i) body += ',';
    body += PatternflowBus::isHeld(i) ? "true" : "false";
  }
  body += "]}";
  server().send(200, "application/json", body);
}

inline void handleSleep() {
  PatternflowPatternsHttp::noteConsoleApiCall();

  String on = server().hasArg("on") ? server().arg("on") : String("1");
  on.toLowerCase();
  on.trim();

  bool wanted;
  if (on == "toggle") {
    wanted = !PatternflowSleep::isSleeping();
  } else if (on == "1" || on == "true" || on == "sleep") {
    wanted = true;
  } else if (on == "0" || on == "false" || on == "wake") {
    wanted = false;
  } else {
    server().sendHeader("Cache-Control", "no-store");
    server().send(400, "application/json",
                  "{\"ok\":false,\"error\":\"on must be 1, 0, or toggle\"}");
    return;
  }
  PatternflowSleep::request(wanted);

  String body = "{\"ok\":true,\"requested\":";
  body += wanted ? "true" : "false";
  body += ",\"sleep\":";
  body += PatternflowSleep::isSleeping() ? "true" : "false";
  body += "}";
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", body);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/status", HTTP_GET, handleIndex);
  server().on("/api/status", HTTP_GET, handleStatus);
  server().on("/api/sleep", HTTP_POST, handleSleep);
  server().on("/api/params", HTTP_POST, handleParams);

  PatternflowHttp::begin();  // idempotent; whoever is first starts it

  initialized = true;
  Serial.printf("[STATUS] Ready - http://%s.local/status\n", PF_OTA_HOSTNAME);
}

#else   // PF_STATUS_HTTP_ENABLED

inline void begin() {}

#endif  // PF_STATUS_HTTP_ENABLED

}  // namespace PatternflowStatusHttp
