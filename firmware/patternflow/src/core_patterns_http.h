// ═══════════════════════════════════════════════════════════
// PatternFlow - Pattern module manager over HTTP
//
// Uploading a .pfm here is the whole point of loadable modules: a pattern
// from the community site arrives as a ~6 KB file over Wi-Fi and shows up in
// the list, instead of a 1 MB firmware rebuild and a full reflash.
//
// Routes (shares the audio-react server, so one port-80 server total):
//   GET    /patterns          management page
//   GET    /api/patterns      JSON list (presets + modules)
//   POST   /api/patterns      multipart upload of a .pfm / .json
//   DELETE /api/patterns?slug=<slug>
//
// Presets are listed but never deletable — they live in firmware.bin.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"

#ifndef PF_PATTERNS_HTTP_ENABLED
#define PF_PATTERNS_HTTP_ENABLED 1
#endif

#if PF_PATTERNS_HTTP_ENABLED
#include <FFat.h>
#include <WebServer.h>
#include <WiFi.h>

#if PF_AUDIO_ENABLED
#include "core_audio_ws.h"
#endif
#include "patterns_index.h"
#endif

namespace PatternflowPatternsHttp {

#if PF_PATTERNS_HTTP_ENABLED

// Same arrangement as core_web_update.h: ride on the audio server when it is
// compiled in, otherwise own one.
#if PF_AUDIO_ENABLED
constexpr uint16_t HTTP_PORT = PF_AUDIO_HTTP_PORT;
inline WebServer& server() { return PatternflowAudio::httpServer; }
#else
constexpr uint16_t HTTP_PORT = 80;
inline WebServer patternsServer(HTTP_PORT);
inline WebServer& server() { return patternsServer; }
#endif

inline bool initialized = false;

// Upload state. WebServer hands the body over in chunks across several
// callbacks, so this has to live between them.
inline File uploadFile;
inline char uploadSlug[MODULE_NAME_BYTES] = {};
inline char uploadPath[MODULE_PATH_BYTES] = {};
inline char uploadError[96] = {};
inline bool uploadFailed = false;
inline size_t uploadBytes = 0;

inline bool isCompiledIn() { return true; }

// Rebuilding the list renumbers everything, so re-point the running pattern at
// the same file rather than at the same index.
inline void reloadKeepingSelection() {
  char previous[MODULE_PATH_BYTES] = {};
  bool wasModule = activePatternIdx >= 0 && patterns[activePatternIdx].modulePath;
  if (wasModule) snprintf(previous, sizeof(previous), "%s", patterns[activePatternIdx].modulePath);

  PFModuleLoader::unload();
  activePatternIdx = -1;
  buildPatternList();

  if (wasModule) {
    for (int i = 0; i < NUM_PATTERNS; i++) {
      if (patterns[i].modulePath && strcmp(patterns[i].modulePath, previous) == 0) {
        activatePattern(i);
        return;
      }
    }
  }
  activatePattern(0);  // deleted out from under us, or was a preset
}

// Filenames arrive from a browser, so treat them as hostile: keep only
// [A-Za-z0-9_-] and refuse anything that would escape /patterns.
inline bool slugFromFilename(const String& filename, char* slug, size_t slugSize) {
  int slash = filename.lastIndexOf('/');
  int backslash = filename.lastIndexOf('\\');
  int cut = slash > backslash ? slash : backslash;
  String base = cut >= 0 ? filename.substring(cut + 1) : filename;
  int dot = base.lastIndexOf('.');
  if (dot > 0) base = base.substring(0, dot);

  size_t n = 0;
  for (size_t i = 0; i < base.length() && n + 1 < slugSize; i++) {
    char c = base[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '_' || c == '-';
    if (ok) slug[n++] = c;
  }
  slug[n] = '\0';
  return n > 0;
}

inline void sendJson(int code, const String& body) {
  server().sendHeader("Cache-Control", "no-store");
  server().send(code, "application/json", body);
}

inline void handleIndex() {
  server().sendHeader("Cache-Control", "no-store");
  server().send_P(200, "text/html", PATTERNS_INDEX_HTML);
}

inline void handleList() {
  String json = "{\"active\":";
  json += activePatternIdx;
  json += ",\"presets\":";
  json += NUM_PRESETS;
  json += ",\"mounted\":";
  json += moduleStorageMounted ? "true" : "false";
  json += ",\"free\":";
  json += moduleStorageMounted ? (uint32_t)(FFat.totalBytes() - FFat.usedBytes()) : 0;
  json += ",\"patterns\":[";
  for (int i = 0; i < NUM_PATTERNS; i++) {
    if (i) json += ',';
    json += "{\"index\":";
    json += i;
    json += ",\"name\":\"";
    json += patterns[i].name;
    json += "\",\"module\":";
    if (patterns[i].modulePath) {
      char slug[MODULE_NAME_BYTES];
      const char* file = strrchr(patterns[i].modulePath, '/');
      snprintf(slug, sizeof(slug), "%s", file ? file + 1 : patterns[i].modulePath);
      char* dot = strrchr(slug, '.');
      if (dot) *dot = '\0';
      json += '"';
      json += slug;
      json += '"';
    } else {
      json += "null";
    }
    json += '}';
  }
  json += "]}";
  sendJson(200, json);
}

inline void handleDelete() {
  if (!server().hasArg("slug")) {
    sendJson(400, "{\"ok\":false,\"error\":\"missing slug\"}");
    return;
  }
  char slug[MODULE_NAME_BYTES];
  if (!slugFromFilename(server().arg("slug") + ".pfm", slug, sizeof(slug))) {
    sendJson(400, "{\"ok\":false,\"error\":\"invalid slug\"}");
    return;
  }

  char path[MODULE_PATH_BYTES];
  snprintf(path, sizeof(path), "%s/%s.pfm", MODULE_DIR, slug);
  if (!moduleStorageMounted || !FFat.exists(path)) {
    sendJson(404, "{\"ok\":false,\"error\":\"no such module\"}");
    return;
  }

  // Drop it out of executable RAM before the file goes, in case it is running.
  PFModuleLoader::unload();
  activePatternIdx = -1;
  FFat.remove(path);

  char sidecar[MODULE_PATH_BYTES];
  snprintf(sidecar, sizeof(sidecar), "%s/%s.json", MODULE_DIR, slug);
  if (FFat.exists(sidecar)) FFat.remove(sidecar);

  reloadKeepingSelection();
  Serial.printf("[PATTERNS-HTTP] deleted %s (%d patterns)\n", slug, NUM_PATTERNS);
  sendJson(200, "{\"ok\":true}");
}

// Per-chunk body handler. Runs several times per upload.
inline void handleUpload() {
  HTTPUpload& upload = server().upload();

  if (upload.status == UPLOAD_FILE_START) {
    uploadFailed = false;
    uploadError[0] = '\0';
    uploadBytes = 0;
    uploadPath[0] = '\0';
    uploadSlug[0] = '\0';
    if (uploadFile) uploadFile.close();

    String name = upload.filename;
    name.toLowerCase();
    bool isJson = name.endsWith(".json");
    if (!isJson && !name.endsWith(".pfm")) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "only .pfm or .json accepted");
      return;
    }
    if (!slugFromFilename(upload.filename, uploadSlug, sizeof(uploadSlug))) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "invalid filename");
      return;
    }
    if (!mountModuleStorage()) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "filesystem not mounted");
      return;
    }
    if (!FFat.exists(MODULE_DIR) && !FFat.mkdir(MODULE_DIR)) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "cannot create %s", MODULE_DIR);
      return;
    }
    snprintf(uploadPath, sizeof(uploadPath), "%s/%s.%s", MODULE_DIR, uploadSlug,
             isJson ? "json" : "pfm");

    // Overwriting the running module would pull code out from under the
    // renderer, so unload first.
    if (activePatternIdx >= 0 && patterns[activePatternIdx].modulePath &&
        strcmp(patterns[activePatternIdx].modulePath, uploadPath) == 0) {
      PFModuleLoader::unload();
      activePatternIdx = -1;
    }

    uploadFile = FFat.open(uploadPath, FILE_WRITE);
    if (!uploadFile) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "cannot open destination");
      return;
    }
    Serial.printf("[PATTERNS-HTTP] upload start %s\n", uploadPath);
    return;
  }

  if (uploadFailed) return;

  if (upload.status == UPLOAD_FILE_WRITE) {
    if (!uploadFile) return;
    if (uploadFile.write(upload.buf, upload.currentSize) != upload.currentSize) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "write failed (disk full?)");
      uploadFile.close();
      return;
    }
    uploadBytes += upload.currentSize;
    return;
  }

  if (upload.status == UPLOAD_FILE_END || upload.status == UPLOAD_FILE_ABORTED) {
    if (uploadFile) uploadFile.close();
    if (upload.status == UPLOAD_FILE_ABORTED) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "upload aborted");
    }
  }
}

// Runs once the whole body has been consumed.
inline void handleUploadDone() {
  if (uploadFailed) {
    if (uploadPath[0] && FFat.exists(uploadPath)) FFat.remove(uploadPath);
    String body = "{\"ok\":false,\"error\":\"";
    body += uploadError[0] ? uploadError : "upload failed";
    body += "\"}";
    sendJson(400, body);
    return;
  }
  if (!uploadPath[0] || uploadBytes == 0) {
    sendJson(400, "{\"ok\":false,\"error\":\"empty upload\"}");
    return;
  }

  reloadKeepingSelection();
  Serial.printf("[PATTERNS-HTTP] uploaded %s (%u bytes, %d patterns)\n", uploadPath,
                (unsigned)uploadBytes, NUM_PATTERNS);

  String body = "{\"ok\":true,\"slug\":\"";
  body += uploadSlug;
  body += "\",\"bytes\":";
  body += (uint32_t)uploadBytes;
  body += ",\"patterns\":";
  body += NUM_PATTERNS;
  body += "}";
  sendJson(200, body);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/patterns", HTTP_GET, handleIndex);
  server().on("/api/patterns", HTTP_GET, handleList);
  server().on("/api/patterns", HTTP_POST, handleUploadDone, handleUpload);
  server().on("/api/patterns", HTTP_DELETE, handleDelete);

#if !PF_AUDIO_ENABLED
  server().begin();
#endif

  initialized = true;
  Serial.printf("[PATTERNS] Ready - http://%s.local/patterns (IP %s)\n", PF_OTA_HOSTNAME,
                WiFi.localIP().toString().c_str());
}

#else   // PF_PATTERNS_HTTP_ENABLED

inline bool isCompiledIn() { return false; }
inline void begin() {}

#endif  // PF_PATTERNS_HTTP_ENABLED

}  // namespace PatternflowPatternsHttp
