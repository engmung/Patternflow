// ═══════════════════════════════════════════════════════════
// PatternFlow - Device status page
//
//   GET /status       human page, refreshes itself
//   GET /api/status   the same numbers as JSON
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
#include <WebServer.h>
#include <WiFi.h>
#include <esp_heap_caps.h>

#if PF_AUDIO_ENABLED
#include "core_audio_ws.h"
#endif
#include "core_canvas.h"   // presentUs
#include "status_index.h"
#endif

// Smoothed frame time, owned by the sketch's loop().
extern uint32_t renderFrameUs;

namespace PatternflowStatusHttp {

#if PF_STATUS_HTTP_ENABLED

#if PF_AUDIO_ENABLED
inline WebServer& server() { return PatternflowAudio::httpServer; }
#else
inline WebServer statusServer(80);
inline WebServer& server() { return statusServer; }
#endif

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
  json += "}}";

  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", json);
}

inline void handleIndex() {
  server().sendHeader("Cache-Control", "no-store");
  if (PatternflowPatternsHttp::noteConsolePageOpened()) {
    PatternflowPatternsHttp::sendConsoleWakePage();
    return;
  }
  server().send_P(200, "text/html", STATUS_INDEX_HTML);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/status", HTTP_GET, handleIndex);
  server().on("/api/status", HTTP_GET, handleStatus);

#if !PF_AUDIO_ENABLED
  server().begin();
#endif

  initialized = true;
  Serial.printf("[STATUS] Ready - http://%s.local/status\n", PF_OTA_HOSTNAME);
}

#else   // PF_STATUS_HTTP_ENABLED

inline void begin() {}

#endif  // PF_STATUS_HTTP_ENABLED

}  // namespace PatternflowStatusHttp
