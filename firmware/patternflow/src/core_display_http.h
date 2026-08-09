// ═══════════════════════════════════════════════════════════
// PatternFlow - Runtime display calibration API
//
//   GET /api/display                          current values as JSON
//   GET /api/display?wb_g=0.72&sat=0.9&...    set any subset, then JSON
//
// Params: wb_r wb_g wb_b (0..1.5) · gamma_r gamma_g gamma_b (0.2..5) ·
//         sat (0..4) · screen (0..3 summons the test-card overlay, -1
//         dismisses it) · level (8..255, WHITE screen drive).
//         Color values land in PFCanvas's runtime calibration
//         state; present() rebuilds its LUT lazily, so the handler does no
//         per-pixel work. Values are session-only — reboot restores the
//         config.h defaults. The point is the tuning loop: put a white/test
//         card on the panel, drag sliders until it looks right, then copy the
//         converged numbers into config.h as the new shipped defaults.
//
// GET on purpose (not POST): tunable from a browser address bar, and the
// local tuning page can fire simple no-preflight requests. CORS is open —
// the endpoint mutates nothing persistent and carries no secrets.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"

// Same default as core_status_http.h, so this header works whatever the
// include order — the API rides that module's WebServer.
#ifndef PF_STATUS_HTTP_ENABLED
#define PF_STATUS_HTTP_ENABLED 1
#endif

// The calibration API is a keeper (panels vary; every owner tunes their own
// numbers), but it is also optional tooling: compile it out with
// -DPF_DISPLAY_HTTP_ENABLED=0 and the sketch builds with no other change.
#ifndef PF_DISPLAY_HTTP_ENABLED
#define PF_DISPLAY_HTTP_ENABLED 1
#endif

#if PF_STATUS_HTTP_ENABLED && PF_DISPLAY_HTTP_ENABLED
#include "core_canvas.h"
#include "core_status_http.h"       // shared WebServer
#include "../presets/preset_calib.h"  // absolute screen/level control
#endif

// Global brightness lives in the sketch (K1 longpress UI + NVS); shown here
// read-only for context while tuning.
extern uint8_t currentBrightness;

namespace PatternflowDisplayHttp {

#if PF_STATUS_HTTP_ENABLED

inline WebServer& server() { return PatternflowStatusHttp::server(); }

inline bool initialized = false;

inline float clampf(float v, float lo, float hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// Reads one float query param into `target` if present. Returns true when the
// LUT has to be rebuilt (any gamma/WB change).
inline bool applyArg(const char* name, float& target, float lo, float hi) {
  if (!server().hasArg(name)) return false;
  target = clampf(server().arg(name).toFloat(), lo, hi);
  return true;
}

inline void handleDisplay() {
  bool lutDirty = false;
  lutDirty |= applyArg("wb_r", PFCanvas::wbR, 0.0f, 1.5f);
  lutDirty |= applyArg("wb_g", PFCanvas::wbG, 0.0f, 1.5f);
  lutDirty |= applyArg("wb_b", PFCanvas::wbB, 0.0f, 1.5f);
  lutDirty |= applyArg("gamma_r", PFCanvas::gammaR, 0.2f, 5.0f);
  lutDirty |= applyArg("gamma_g", PFCanvas::gammaG, 0.2f, 5.0f);
  lutDirty |= applyArg("gamma_b", PFCanvas::gammaB, 0.2f, 5.0f);
  if (lutDirty) PFCanvas::gammaLUTReady = false;

  if (server().hasArg("sat")) {
    PFCanvas::setSatBoost(clampf(server().arg("sat").toFloat(), 0.0f, 4.0f));
  }

  // Test-card overlay control. ?screen=N (0..3) summons the card over the
  // running pattern and shows that screen; ?screen=-1 dismisses it and the
  // pattern underneath resumes. ?level= sets the WHITE screen's drive.
  if (server().hasArg("screen")) {
    int requested = (int)server().arg("screen").toInt();
    if (requested >= 0) {
      CalibPattern::requestedScreen = requested;
      CalibPattern::overrideOn = true;
    } else {
      CalibPattern::overrideOn = false;
    }
  }
  if (server().hasArg("level")) {
    CalibPattern::requestedLevel = (int)server().arg("level").toInt();
  }

  // snprintf, not String: this endpoint is hit continuously while somebody
  // drags a slider, and the shared heap is the scarcest thing on the board.
  char json[256];
  snprintf(json, sizeof(json),
           "{\"wb_r\":%.3f,\"wb_g\":%.3f,\"wb_b\":%.3f,"
           "\"gamma_r\":%.3f,\"gamma_g\":%.3f,\"gamma_b\":%.3f,"
           "\"sat\":%.3f,\"brightness\":%u,\"calib\":%d,\"screen\":%d,\"level\":%d}",
           PFCanvas::wbR, PFCanvas::wbG, PFCanvas::wbB,
           PFCanvas::gammaR, PFCanvas::gammaG, PFCanvas::gammaB,
           PFCanvas::satBoost, (unsigned)currentBrightness,
           CalibPattern::overrideOn ? 1 : 0,
           CalibPattern::screen, CalibPattern::whiteLevel);

  server().sendHeader("Cache-Control", "no-store");
  server().sendHeader("Access-Control-Allow-Origin", "*");
  server().send(200, "application/json", json);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/api/display", HTTP_GET, handleDisplay);

  initialized = true;
  Serial.printf("[DISPLAY] Ready - http://%s.local/api/display\n", PF_OTA_HOSTNAME);
}

#else   // PF_STATUS_HTTP_ENABLED && PF_DISPLAY_HTTP_ENABLED

inline void begin() {}

#endif  // PF_STATUS_HTTP_ENABLED && PF_DISPLAY_HTTP_ENABLED

}  // namespace PatternflowDisplayHttp
