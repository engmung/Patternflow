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
#include <esp_heap_caps.h>

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

// What was playing before an upload/delete started, so it can be put back
// afterwards. Presets keep their index (the preset half of the list never
// reorders); modules are remembered by path, because rebuilding the list
// renumbers them.
//
// Split into capture/restore instead of one reload function for a heap reason:
// a resident module owns ~5-8 KB of internal RAM, and internal RAM is exactly
// what a multipart upload needs to parse its body. Measured earlier today:
// with a 22 KB module resident (heap ~4-6 KB) uploads fail outright. So the
// module is evicted when a batch of uploads BEGINS, and only reloaded once at
// the END — not re-loaded between the .json and the .pfm of every pattern,
// which is what made the fourth file of a cart install fail.
inline char restorePath[MODULE_PATH_BYTES] = {};
inline int restorePresetIdx = -1;
inline bool restorePending = false;

inline void captureSelectionOnce() {
  if (restorePending) return;
  restorePending = true;
  restorePath[0] = '\0';
  restorePresetIdx = -1;
  if (activePatternIdx >= 0 && patterns) {
    if (patterns[activePatternIdx].modulePath) {
      snprintf(restorePath, sizeof(restorePath), "%s", patterns[activePatternIdx].modulePath);
    } else {
      restorePresetIdx = activePatternIdx;
    }
  }
  // Free the module's executable+data RAM before any body bytes arrive.
  PFModuleLoader::unload();
  activePatternIdx = -1;
}

inline void restoreSelection() {
  restorePending = false;
  buildPatternList();
  if (restorePath[0]) {
    for (int i = 0; i < NUM_PATTERNS; i++) {
      if (patterns[i].modulePath && strcmp(patterns[i].modulePath, restorePath) == 0) {
        activatePattern(i);
        return;
      }
    }
  }
  activatePattern(restorePresetIdx >= 0 ? restorePresetIdx : 0);
}

// The rescan-and-reload above touches FATFS and the ELF loader — tens of
// milliseconds of filesystem work. Doing that INSIDE an upload's HTTP handler
// is what crashed the device mid-batch (and a crash mid-FAT-write is how the
// volume got corrupted). So handlers only *request* it, and tick() — called
// from loop(), outside any HTTP transaction — performs it.
inline uint32_t reloadRequestedAtMs = 0;
inline uint32_t lastUploadActivityMs = 0;
inline uint32_t lastConsoleActivityMs = 0;

// How long the console has to go quiet before the paused pattern comes back.
// Long enough to read a page and click something, short enough that walking
// away restores the panel on its own.
constexpr uint32_t CONSOLE_IDLE_RESTORE_MS = 25000;

inline void requestReload() { reloadRequestedAtMs = millis(); }

// True while a console page has the pattern module evicted. The sketch draws a
// CONSOLE PAUSED screen instead of a torn frame when this is set.
inline bool isConsolePaused() { return restorePending; }

// A resident module and the web console cannot both have the RAM they need.
//
// Measured on a 128x64 board: with a module loaded, internal heap sits at
// ~4.9 KB and the server can only push ~5.6 KB of a response — /patterns
// (15.9 KB) arrives truncated, its script cut mid-statement, and the page
// renders blank while every API underneath answers fine. Unload the module and
// the same page arrives whole in 0.47 s at ~11.9 KB free.
//
// So opening a console page pauses the pattern: the module is evicted, the
// panel falls back to a preset, and tick() brings the module back once the
// console has been idle. Loading a module costs 6-11 ms, so the churn is
// invisible. Tried and rejected first: spilling module data to PSRAM (reboots
// the device) and chunked page sends (delivers less, not more).
// Returns true when this call is what evicted the module — the caller should
// then serve the interstitial below rather than the real page.
//
// Freeing the module's RAM does not help the request that triggered it: that
// connection's send path is already constrained and still truncates. One tiny
// page and one reload later, the heap is back and everything serves normally.
inline bool noteConsolePageOpened() {
  lastConsoleActivityMs = millis();
  const bool hadModule = PFModuleLoader::active != nullptr;
  captureSelectionOnce();
  return hadModule;
}

// Deliberately tiny — it has to fit in the ~5.6 KB a starved send can manage.
inline void sendConsoleWakePage() {
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "text/html",
                F("<!doctype html><meta charset=utf-8>"
                  "<meta name=viewport content='width=device-width,initial-scale=1'>"
                  "<title>Patternflow</title>"
                  "<style>body{background:#F4EFE6;color:#6B655A;font:14px/1.5 "
                  "ui-sans-serif,system-ui,sans-serif;display:flex;height:100vh;"
                  "margin:0;align-items:center;justify-content:center;text-align:center}"
                  "b{color:#141414;font-weight:600}</style>"
                  "<div><b>Pausing the pattern&hellip;</b><br>"
                  "freeing memory for the console<br>"
                  "<small>the pattern resumes when you are done</small></div>"
                  "<script>setTimeout(function(){location.reload()},400)</script>"));
}

// API calls are small enough to serve with a module loaded, so they only keep
// the console "in use" — they never evict anything themselves.
inline void noteConsoleApiCall() {
  if (restorePending) lastConsoleActivityMs = millis();
}

inline void tick() {
  if (reloadRequestedAtMs && millis() - reloadRequestedAtMs >= 150) {
    reloadRequestedAtMs = 0;
    restoreSelection();
    return;
  }
  // A batch that dies partway (page closed, network drop) has evicted the
  // running module and never sent its final file. Put the panel back rather
  // than leaving it dark until the next successful upload.
  if (restorePending && !reloadRequestedAtMs && lastUploadActivityMs &&
      millis() - lastUploadActivityMs > 5000) {
    lastUploadActivityMs = 0;
    Serial.println("[PATTERNS-HTTP] batch abandoned - restoring");
    restoreSelection();
    return;
  }
  // Console finished with: give the pattern back.
  if (restorePending && !reloadRequestedAtMs && !lastUploadActivityMs &&
      lastConsoleActivityMs &&
      millis() - lastConsoleActivityMs > CONSOLE_IDLE_RESTORE_MS) {
    lastConsoleActivityMs = 0;
    Serial.println("[PATTERNS-HTTP] console idle - resuming pattern");
    restoreSelection();
  }
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

// NOTE: an earlier revision force-closed the connection after each upload
// (sendHeader Connection:close + client().stop()) to defeat browser keep-alive
// reuse. That "fix" made things progressively worse: every server-initiated
// close parked a TCP pcb in TIME_WAIT, and after a couple of batches all
// multi-chunk uploads died with empty replies until reboot. With the reload
// deferred out of the handler (tick above) the transaction is fast enough that
// plain keep-alive behaves — so this is now just sendJson under its old name.
inline void sendJsonAndClose(int code, const String& body) {
  sendJson(code, body);
}

// Explicit, destructive, button-initiated. See formatModuleStorage.
inline void handleFormat() {
  captureSelectionOnce();
  bool ok = formatModuleStorage();
  requestReload();
  sendJson(ok ? 200 : 500, ok ? "{\"ok\":true}"
                              : "{\"ok\":false,\"error\":\"format failed\"}");
}

inline void handleIndex() {
  if (noteConsolePageOpened()) { sendConsoleWakePage(); return; }
  server().sendHeader("Cache-Control", "no-store");
  server().send_P(200, "text/html", PATTERNS_INDEX_HTML);
}

inline void handleList() {
  noteConsoleApiCall();
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
  captureSelectionOnce();
  FFat.remove(path);

  char sidecar[MODULE_PATH_BYTES];
  snprintf(sidecar, sizeof(sidecar), "%s/%s.json", MODULE_DIR, slug);
  if (FFat.exists(sidecar)) FFat.remove(sidecar);

  restoreSelection();
  Serial.printf("[PATTERNS-HTTP] deleted %s (%d patterns)\n", slug, NUM_PATTERNS);
  sendJson(200, "{\"ok\":true}");
}

// Per-chunk body handler. Runs several times per upload.
inline void handleUpload() {
  HTTPUpload& upload = server().upload();

  lastUploadActivityMs = millis();
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

    // Evict the resident module for the whole batch — see captureSelectionOnce.
    captureSelectionOnce();

    uploadFile = FFat.open(uploadPath, FILE_WRITE);
    if (!uploadFile) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "cannot open destination (heap %u)",
               (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
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
      snprintf(uploadError, sizeof(uploadError), "write failed (heap %u)",
               (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
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

// Raw PUT body: same file lifecycle as the multipart handler, none of the
// multipart parsing. Chunks arrive straight off the socket.
inline void handlePutBody() {
  HTTPRaw& raw = server().raw();
  lastUploadActivityMs = millis();

  if (raw.status == RAW_START) {
    uploadFailed = false;
    uploadError[0] = '\0';
    uploadBytes = 0;
    uploadPath[0] = '\0';
    uploadSlug[0] = '\0';
    if (uploadFile) uploadFile.close();

    String name = server().header("X-PF-Name");
    String lowered = name;
    lowered.toLowerCase();
    bool isJson = lowered.endsWith(".json");
    if (!isJson && !lowered.endsWith(".pfm")) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "only .pfm or .json accepted");
      return;
    }
    if (!slugFromFilename(name, uploadSlug, sizeof(uploadSlug))) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "invalid X-PF-Name");
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

    captureSelectionOnce();

    uploadFile = FFat.open(uploadPath, FILE_WRITE);
    if (!uploadFile) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "cannot open destination (heap %u)",
               (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
      return;
    }
    Serial.printf("[PATTERNS-HTTP] put start %s\n", uploadPath);
    return;
  }

  if (uploadFailed) return;

  if (raw.status == RAW_WRITE) {
    if (!uploadFile) return;
    if (uploadFile.write(raw.buf, raw.currentSize) != raw.currentSize) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "write failed (heap %u)",
               (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
      uploadFile.close();
      return;
    }
    uploadBytes += raw.currentSize;
    return;
  }

  if (raw.status == RAW_END || raw.status == RAW_ABORTED) {
    if (uploadFile) uploadFile.close();
    if (raw.status == RAW_ABORTED) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "upload aborted");
    }
  }
}

// Runs once the whole body has been consumed.
inline void handleUploadDone() {
  // Batched install (the /patterns page, or its ?src= one-click flow) marks
  // every file but the final one as last=0, so the rescan-and-reload runs
  // once per batch instead of once per file. Multipart carries it as a form
  // field, raw PUT as the X-PF-Last header. Anything sending neither (curl,
  // scripts) is treated as a batch of one.
  bool lastInBatch = true;
  if (server().hasArg("last")) lastInBatch = server().arg("last") != "0";
  else if (server().hasHeader("X-PF-Last")) lastInBatch = server().header("X-PF-Last") != "0";

  if (uploadFailed) {
    if (uploadPath[0] && FFat.exists(uploadPath)) FFat.remove(uploadPath);
    Serial.printf("[PATTERNS-HTTP] upload failed: %s (heap %u)\n", uploadError,
                  (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
    if (lastInBatch && restorePending) requestReload();
    String body = "{\"ok\":false,\"error\":\"";
    body += uploadError[0] ? uploadError : "upload failed";
    body += "\"}";
    sendJsonAndClose(400, body);
    return;
  }
  if (!uploadPath[0] || uploadBytes == 0) {
    if (lastInBatch && restorePending) requestReload();
    sendJsonAndClose(400, "{\"ok\":false,\"error\":\"empty upload\"}");
    return;
  }

  // "The bytes arrived" is not "the module is good". Re-read what was written
  // and check it is structurally a module before answering ok — otherwise a
  // truncated or corrupted upload reports success and only reveals itself when
  // somebody turns the knob to it.
  bool isModule = strstr(uploadPath, ".pfm") != nullptr;
  if (isModule) {
    char why[80];
    if (!PFModuleLoader::looksLikeModule(FFat, uploadPath, why, sizeof(why))) {
      FFat.remove(uploadPath);
      Serial.printf("[PATTERNS-HTTP] rejected %s: %s\n", uploadPath, why);
      if (lastInBatch && restorePending) requestReload();
      String body = "{\"ok\":false,\"error\":\"";
      body += why;
      body += "\"}";
      sendJsonAndClose(400, body);
      return;
    }
  }

  if (lastInBatch) requestReload();
  Serial.printf("[PATTERNS-HTTP] uploaded %s (%u bytes, %d patterns)\n", uploadPath,
                (unsigned)uploadBytes, NUM_PATTERNS);

  String body = "{\"ok\":true,\"slug\":\"";
  body += uploadSlug;
  body += "\",\"bytes\":";
  body += (uint32_t)uploadBytes;
  body += ",\"patterns\":";
  body += NUM_PATTERNS;
  body += "}";
  sendJsonAndClose(200, body);
}

// ── Remote pattern selection ─────────────────────────────────────────
// GET /api/patterns/select?index=N  (or ?name=<display name>) queues a switch;
// the sketch's loop() consumes it exactly like an OSC pattern-index command.
// Deferred on principle rather than measured need: a module activation reads
// FATFS and runs the relocator, and this file's own history says never to do
// filesystem work inside an HTTP transaction.
inline int pendingSelectIdx = -1;

inline bool consumeSelectIdx(int& out) {
  if (pendingSelectIdx < 0) return false;
  out = pendingSelectIdx;
  pendingSelectIdx = -1;
  return true;
}

inline void handleSelect() {
  int index = -1;
  if (server().hasArg("index")) {
    index = server().arg("index").toInt();
  } else if (server().hasArg("name")) {
    String name = server().arg("name");
    for (int i = 0; i < NUM_PATTERNS; i++) {
      if (name.equals(patterns[i].name)) {
        index = i;
        break;
      }
    }
  }

  server().sendHeader("Cache-Control", "no-store");
  server().sendHeader("Access-Control-Allow-Origin", "*");
  if (index < 0 || index >= NUM_PATTERNS) {
    server().send(404, "application/json", "{\"ok\":false,\"error\":\"no such pattern\"}");
    return;
  }

  pendingSelectIdx = index;
  String body = "{\"ok\":true,\"index\":";
  body += index;
  body += ",\"name\":\"";
  body += patterns[index].name;
  body += "\"}";
  server().send(200, "application/json", body);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  // Custom headers are only readable when collected up front. Nothing else on
  // the shared server collects any, so this list is the whole set.
  static const char* headerKeys[] = {"X-PF-Name", "X-PF-Last"};
  server().collectHeaders(headerKeys, 2);

  server().on("/patterns", HTTP_GET, handleIndex);
  server().on("/api/patterns/select", HTTP_GET, handleSelect);
  server().on("/api/patterns", HTTP_GET, handleList);
  server().on("/api/patterns", HTTP_POST, handleUploadDone, handleUpload);
  // Raw-body PUT is what the page actually uses: the WebServer's multipart
  // parser is the flakiest part of this stack (query-string quirk, dead
  // replies on multi-chunk bodies), and a raw octet stream sidesteps ALL of
  // its boundary handling. Filename travels in X-PF-Name. The multipart POST
  // above stays for curl and older pages.
  server().on("/api/patterns", HTTP_PUT, handleUploadDone, handlePutBody);
  server().on("/api/patterns", HTTP_DELETE, handleDelete);
  server().on("/api/patterns/format", HTTP_POST, handleFormat);

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
inline void tick() {}
inline bool consumeSelectIdx(int&) { return false; }

#endif  // PF_PATTERNS_HTTP_ENABLED

}  // namespace PatternflowPatternsHttp
