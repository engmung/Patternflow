// ═══════════════════════════════════════════════════════════
// PatternFlow - Browser self-update (drop a .bin onto patternflow.local/update)
//
// Wireless upload without TLS (issue #232). The device already serves plain
// HTTP on the LAN (the audio-react UI on port 80); this module adds /update
// to that same server: a GET page with a drop zone, and a POST handler that
// streams the multipart body straight into Update.h (U_FLASH). The artifact
// is the application image the web build service already emits — the browser
// downloads it over HTTPS from wherever it likes, and the device only ever
// sees a same-origin LAN upload, so there is no certificate to get wrong and
// no mixed-content wall to hit.
//
// Access: by default (PF_WEBUPDATE_ALWAYS_ARMED 1) the POST endpoint accepts
// firmware at any time — drop-a-.bin-whenever is the UX the project chose,
// accepting that anyone on the LAN can flash the device (ArduinoOTA's
// no-password default has the same exposure). Builds for shared networks set
// the flag to 0, and then uploads are only accepted while the device is
// ARMED — the UPDATE screen physically opened from an encoder (hold K2 →
// NETWORK, turn K4). The GET page itself is always served (harmless, and it
// tells you how to arm when arming is required).
//
// Rollback, honestly: once the app has been up for a few seconds, handle()
// calls esp_ota_mark_app_valid_cancel_rollback(). With a bootloader built
// with CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE that makes a crash-looping
// image fall back to the previous slot; the stock Arduino core's bootloader
// does not enable it, so there the call is a harmless no-op and the real
// protection is Update.h's own checks (magic byte, complete write) rejecting
// truncated or wrong files before the boot partition ever changes.
//
// Progress display: the entire POST is consumed inside ONE handleClient()
// call, so the main loop cannot redraw the panel while the image streams in.
// The sketch installs progressCallback to draw from inside the upload
// handler instead (same task, so touching the DMA display is safe).
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_wifi.h"

#if PF_WEBUPDATE_ENABLED
#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <ESPmDNS.h>
#include <esp_ota_ops.h>
#include "web_update_index.h"
#if PF_AUDIO_ENABLED
#include "core_audio_ws.h"
#endif
#endif

namespace PatternflowWebUpdate {

#if PF_WEBUPDATE_ENABLED

// Rides on the audio-react server when that is compiled in (one port-80
// server total); otherwise owns a WebServer of its own.
#if PF_AUDIO_ENABLED
constexpr uint16_t HTTP_PORT = PF_AUDIO_HTTP_PORT;
inline WebServer& server() { return PatternflowAudio::httpServer; }
#else
constexpr uint16_t HTTP_PORT = 80;
inline WebServer ownServer(HTTP_PORT);
inline WebServer& server() { return ownServer; }
#endif

// How long the app must stay up before this image is declared good (see the
// rollback note in the header comment). Reaching the main loop and staying
// there for this long is the "successful boot" signal.
constexpr uint32_t BOOT_VALID_AFTER_MS = 8000;

inline bool initialized = false;
inline bool armed = false;        // set only from the on-device UPDATE screen
inline bool uploading = false;
inline bool rejected = false;     // this POST arrived while not armed
inline bool completedOk = false;
inline bool bootMarkedValid = false;
inline unsigned progressPct = 0;
inline size_t expectedBytes = 0;
inline size_t receivedBytes = 0;
// Counts POSTs the upload handler actually saw. Distinguishes "the device
// never received the request" from "it received it and got nowhere", which
// look identical from the browser.
inline unsigned uploadAttempts = 0;
inline uint32_t rebootAtMs = 0;   // nonzero = flash landed, reboot scheduled
inline String lastError;

// Installed by the sketch: draws upload progress on the panel from inside
// the upload handler (see header comment). pct is 0..100, or -1 when the
// client sent no ?size= and the total is unknown.
inline void (*progressCallback)(int pct) = nullptr;

inline void arm() {
  armed = true;
  lastError = "";
  Serial.println("[UPDATE] armed — /update accepts firmware");
}

inline void disarm() {
  armed = false;
  Serial.println("[UPDATE] disarmed");
}

// Effective gate: the physical UPDATE screen, or the opt-in always-armed
// build flag (see net_config.h for what that trades away).
inline bool isArmed()         { return armed || PF_WEBUPDATE_ALWAYS_ARMED != 0; }
inline bool isUploading()     { return uploading; }
inline bool isRebootPending() { return rebootAtMs != 0; }
inline bool hasError()        { return lastError.length() > 0; }
inline unsigned progressPercent() { return progressPct; }

inline void failUpload(const char* stage) {
  lastError = String(stage) + ": " + Update.errorString();
  Update.abort();
  uploading = false;
  Serial.printf("[UPDATE] failed — %s\n", lastError.c_str());
}

// Upload body handler — called per multipart chunk by WebServer.
inline void handleUpload() {
  HTTPUpload& up = server().upload();
  switch (up.status) {
    case UPLOAD_FILE_START: {
      uploadAttempts++;
      rejected = !isArmed() || uploading || rebootAtMs != 0;
      if (rejected) {
        Serial.println("[UPDATE] upload refused (not armed)");
        break;
      }
      lastError = "";
      completedOk = false;
      receivedBytes = 0;
      progressPct = 0;
      // The page sends the file size as ?size= because HTTPUpload has no
      // total; with it Update erases exactly what it needs, and the panel
      // can show a real percentage.
      expectedBytes = server().hasArg("size")
                      ? (size_t)strtoul(server().arg("size").c_str(), nullptr, 10)
                      : 0;
      uploading = true;
      if (!Update.begin(expectedBytes ? expectedBytes : UPDATE_SIZE_UNKNOWN,
                        U_FLASH)) {
        failUpload("begin");
        break;
      }
      Serial.printf("[UPDATE] receiving \"%s\" (%u bytes)\n",
                    up.filename.c_str(), (unsigned)expectedBytes);
      if (progressCallback) progressCallback(expectedBytes ? 0 : -1);
      break;
    }
    case UPLOAD_FILE_WRITE: {
      if (!uploading) break;  // refused or already failed — drain silently
      if (Update.write(up.buf, up.currentSize) != up.currentSize) {
        failUpload("write");
        break;
      }
      receivedBytes += up.currentSize;
      if (expectedBytes) {
        unsigned pct = (unsigned)((uint64_t)receivedBytes * 100 / expectedBytes);
        if (pct > 100) pct = 100;
        if (pct != progressPct) {
          progressPct = pct;
          if (progressCallback) progressCallback((int)pct);
        }
      }
      break;
    }
    case UPLOAD_FILE_END: {
      if (!uploading) break;
      if (Update.end(true)) {
        completedOk = true;
        progressPct = 100;
        uploading = false;
        Serial.printf("[UPDATE] flashed %u bytes OK\n", (unsigned)receivedBytes);
        if (progressCallback) progressCallback(100);
      } else {
        failUpload("end");
      }
      break;
    }
    case UPLOAD_FILE_ABORTED: {
      if (uploading) {
        Update.abort();
        uploading = false;
        lastError = "upload aborted";
        Serial.println("[UPDATE] upload aborted by client");
      }
      break;
    }
  }
}

// Completion handler — runs after the whole POST body is consumed.
inline void handleUploadDone() {
  if (rejected) {
    server().send(403, "application/json",
        "{\"error\":\"locked - on the device: hold K2 for NETWORK, then turn K4 for UPDATE\"}");
    return;
  }
  if (completedOk) {
    server().send(200, "application/json", "{\"ok\":true}");
    rebootAtMs = millis() + 1200;  // let the response flush before restarting
    return;
  }
  server().send(500, "application/json",
                "{\"error\":\"" + lastError + "\"}");
}

// Reports what the LAST upload attempt actually did, not just whether one is
// running. "Connection lost during upload" is what the browser says for every
// network-level failure, and without these fields there is no way to tell a
// device that never saw a byte from one that took 900 KB and then had the
// client vanish from one that failed the flash write. The counters are only
// cleared when the next upload starts, so they can be read after the fact —
// the same reason /api/status carries loadError.
inline void handleStatus() {
  char buf[224];
  String error = lastError;
  error.replace("\"", "'");
  snprintf(buf, sizeof(buf),
           "{\"armed\":%s,\"busy\":%s,\"version\":\"%s\","
           "\"lastError\":\"%s\",\"lastRejected\":%s,\"lastOk\":%s,"
           "\"received\":%u,\"expected\":%u,\"attempts\":%u}",
           isArmed() ? "true" : "false",
           (uploading || rebootAtMs != 0) ? "true" : "false",
           PF_IMPROV_FW_VERSION,
           error.c_str(),
           rejected ? "true" : "false",
           completedOk ? "true" : "false",
           (unsigned)receivedBytes, (unsigned)expectedBytes, uploadAttempts);
  server().send(200, "application/json", buf);
}

#endif  // PF_WEBUPDATE_ENABLED

inline bool isCompiledIn() {
#if PF_WEBUPDATE_ENABLED
  return true;
#else
  return false;
#endif
}

// Register routes (and, standalone, start the server). Wi-Fi is owned by
// PatternflowWifi; this runs on the connect edge. Idempotent.
inline void begin() {
#if PF_WEBUPDATE_ENABLED
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

#if !PF_OTA_ENABLED
  // ArduinoOTA normally brings up mDNS; with OTA compiled out, start it
  // here so patternflow.local still resolves.
  MDNS.begin(PF_OTA_HOSTNAME);
#endif
  MDNS.addService("http", "tcp", HTTP_PORT);

  server().on("/update", HTTP_GET, []() {
    // no-store: the page ships inside the firmware and changes with it; a
    // cached (or reboot-truncated) copy must never stick in the browser.
    server().sendHeader("Cache-Control", "no-store");
    server().send_P(200, "text/html", WEB_UPDATE_HTML);
  });
  server().on("/update", HTTP_POST, handleUploadDone, handleUpload);
  server().on("/update/status", HTTP_GET, handleStatus);

#if !PF_AUDIO_ENABLED
  // Standalone server: everything else redirects to the update page.
  server().onNotFound([]() {
    server().sendHeader("Location", "/update");
    server().send(302, "text/plain", "");
  });
  server().begin();
#endif

  initialized = true;
  Serial.printf("[UPDATE] Ready — http://%s.local/update (IP %s)\n",
                PF_OTA_HOSTNAME, WiFi.localIP().toString().c_str());
#endif
}

// Called every main loop: services the standalone server (shared-server
// traffic is pumped by PatternflowAudio::handle()), marks the running image
// valid after a healthy stretch of uptime, and fires the deferred reboot.
inline void handle() {
#if PF_WEBUPDATE_ENABLED
#if !PF_AUDIO_ENABLED
  if (initialized) server().handleClient();
#endif

  if (!bootMarkedValid && millis() > BOOT_VALID_AFTER_MS) {
    bootMarkedValid = true;
    // No-op unless the bootloader has rollback enabled — see header comment.
    esp_ota_mark_app_valid_cancel_rollback();
  }

  if (rebootAtMs != 0 && (int32_t)(millis() - rebootAtMs) >= 0) {
    Serial.println("[UPDATE] rebooting into new firmware");
    Serial.flush();
    ESP.restart();
  }
#endif
}

#if !PF_WEBUPDATE_ENABLED
// Stubs so the sketch compiles unchanged with the feature off.
inline void (*progressCallback)(int) = nullptr;
inline void arm() {}
inline void disarm() {}
inline bool isArmed()         { return false; }
inline bool isUploading()     { return false; }
inline bool isRebootPending() { return false; }
inline bool hasError()        { return false; }
inline unsigned progressPercent() { return 0; }
#endif

} // namespace PatternflowWebUpdate
