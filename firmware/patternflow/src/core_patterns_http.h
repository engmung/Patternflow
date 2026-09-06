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
//   GET    /api/patterns/pending  Director-marked slugs for ZIP export
//   GET    /api/patterns/file?slug=&ext=pfm|json
//   POST   /api/patterns      multipart upload of a .pfm / .json
//   DELETE /api/patterns?slug=<slug>
//   POST   /api/patterns/delete   body: one slug per line, or "*" for all
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
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <WiFi.h>
#include <esp_heap_caps.h>

#include "core_http.h"
#include "core_loop_sync.h"  // handlers run on the network core; the module and the list are the frame's
#include "core_send.h"     // low-heap page sender — pages serve WITHOUT pausing the pattern
#include "core_pack_select.h"
#include "patterns_index.h"
#include "fflate_js.h"
#include "core_thumbs.h"
#endif

namespace PatternflowPatternsHttp {

#if PF_PATTERNS_HTTP_ENABLED

// The console server belongs to the core (core_http.h), not to any one
// feature - this used to fork on PF_AUDIO_ENABLED and borrow audio's.
constexpr uint16_t HTTP_PORT = PatternflowHttp::HTTP_PORT;
inline WebServer& server() { return PatternflowHttp::server(); }

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

inline void evictResidentModule() {
  if (!PFModuleLoader::active) return;
  PFModuleLoader::unload();
  if (activePatternIdx >= 0 && patterns && patterns[activePatternIdx].modulePath) {
    activePatternIdx = -1;
  }
}

// Evicting the module and rebuilding the list are the frame's business:
// draw() may be inside the module, and it indexes the list. The handlers
// that call these run on the network core (core_net_task.h), so the bodies
// are handed to the loop task and run at the frame boundary. From loop()
// itself — tick() below — they run inline.
inline void captureSelectionOnceNow() {
  if (restorePending) {
    // Show / night schedule / MQTT may reload a module while the console
    // still holds the pause. Evict again or the wake page loops forever.
    evictResidentModule();
    return;
  }
  restorePending = true;
  restorePath[0] = '\0';
  restorePresetIdx = -1;
  if (activePatternIdx >= 0 && patterns) {
    if (patterns[activePatternIdx].modulePath) {
      snprintf(restorePath, sizeof(restorePath), "%s", patterns[activePatternIdx].modulePath);
      // Free the module's executable+data RAM before any body bytes arrive.
      evictResidentModule();
    } else {
      // Compiled-in presets (Origin, Weather, …) keep running — the console
      // pause exists to reclaim module DRAM, which they do not use.
      restorePresetIdx = activePatternIdx;
    }
  } else {
    evictResidentModule();
  }
}

inline void captureSelectionOnce() {
  PFLoopSync::run([] { captureSelectionOnceNow(); });
}

inline void restoreSelectionNow() {
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

inline void restoreSelection() {
  PFLoopSync::run([] { restoreSelectionNow(); });
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

// True while a console page or an upload batch has the pattern module
// evicted. The sketch draws a PAUSED screen instead of a torn frame.
inline bool isConsolePaused() { return restorePending; }

// Play Now / wake alarm owns the panel. Do not snap back to whatever was
// running before the console opened.
inline void releaseConsolePause() {
  restorePending = false;
  lastConsoleActivityMs = 0;
}

// A resident module and the web console cannot both have the RAM they need.
// Opening a console page evicts the module (pausing the pattern); tick()
// restores it once the console has been idle. This was removed for one day
// — Origin-only freed enough DRAM that a stall-tolerant sender could deliver
// whole pages at module-resident heap in sequential tests — and put back the
// same day: under a real browser's PARALLEL requests on this one-connection
// server, page loads at ~7 KB heap captured the render loop back-to-back and
// the device locked up within seconds. Sequential benchmarks passed; browsing
// killed it. The pause is the honest price of the console.
// Returns true when this call is what evicted the module — the caller then
// serves the interstitial below rather than the real page.
inline bool noteConsolePageOpened() {
  // Eviction retired 2026-08-25. The pause existed for the core-3 builds'
  // ~15 KB of post-services heap, where a real browser's parallel page loads
  // at module-resident heap captured the render loop and locked the device
  // (sequential benchmarks passed; browsing killed it — see the note above).
  // The core-2 build ships ~95 KB free after services, so pages and a
  // resident module coexist: the console no longer pauses the pattern, and
  // the panel never shows the CONSOLE card. If a heap regression ever brings
  // the lockup back, this is the function that used to evict.
  lastConsoleActivityMs = millis();
  return false;
}

// Deliberately tiny — it has to fit through the starved send that triggered
// the eviction in the first place.
inline void sendConsoleWakePage() {
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "text/html",
                F("<!doctype html><meta charset=utf-8>"
                  "<meta name=viewport content='width=device-width,initial-scale=1'>"
                  "<title>Patternflow</title>"
                  "<style>body{background:#0C0B09;color:#8A8272;font:14px/1.5 "
                  "ui-sans-serif,system-ui,sans-serif;display:flex;height:100vh;"
                  "margin:0;align-items:center;justify-content:center;text-align:center}"
                  "b{color:#EDE7DB;font-weight:600}</style>"
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
  PFThumbs::forgetAll();   // the files went with the volume
  requestReload();
  sendJson(ok ? 200 : 500, ok ? "{\"ok\":true}"
                              : "{\"ok\":false,\"error\":\"format failed\"}");
}

inline void handleIndex() {
  if (noteConsolePageOpened()) { sendConsoleWakePage(); return; }
  PFSend::gz(server(), PATTERNS_INDEX_HTML_GZ, PATTERNS_INDEX_HTML_GZ_LEN);
}

// The unzip library for dropping a whole pattern pack on the page (see the
// ZIP note in patterns_index.h). Served from flash rather than a CDN so a
// device on a LAN with no internet still unpacks; the page only asks for it
// when a .zip is actually dropped, so the library costs nothing otherwise.
inline void handleFflateJs() {
  noteConsoleApiCall();
  PFSend::gz(server(), FFLATE_JS_GZ, FFLATE_JS_GZ_LEN, "application/javascript",
             "public, max-age=86400");
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
  // The list is rebuilt by tick() on the loop task after an upload; walk it
  // there, not underneath that.
  PFLoopSync::run([&] {
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
  });
  json += "],\"pendingRev\":";
  json += PatternflowPackSelect::rev;
  json += ",\"pending\":[";
  for (uint8_t i = 0; i < PatternflowPackSelect::count; i++) {
    if (i) json += ',';
    json += '"';
    json += PatternflowPackSelect::slugs[i];
    json += '"';
  }
  json += "]}";
  sendJson(200, json);
}

inline void handlePendingSelect() {
  noteConsoleApiCall();
  String json = "{\"rev\":";
  json += PatternflowPackSelect::rev;
  json += ",\"slugs\":[";
  for (uint8_t i = 0; i < PatternflowPackSelect::count; i++) {
    if (i) json += ',';
    json += '"';
    json += PatternflowPackSelect::slugs[i];
    json += '"';
  }
  json += "]}";
  sendJson(200, json);
}

// Browser ZIP export fetches one file at a time (this server is
// one-connection). Slug is sanitized the same way uploads are.
inline void handleFile() {
  noteConsoleApiCall();
  if (!moduleStorageMounted) {
    sendJson(409, "{\"ok\":false,\"error\":\"storage not mounted\"}");
    return;
  }
  if (!server().hasArg("slug")) {
    sendJson(400, "{\"ok\":false,\"error\":\"missing slug\"}");
    return;
  }
  char slug[MODULE_NAME_BYTES];
  if (!slugFromFilename(server().arg("slug") + ".pfm", slug, sizeof(slug))) {
    sendJson(400, "{\"ok\":false,\"error\":\"invalid slug\"}");
    return;
  }
  String ext = server().hasArg("ext") ? server().arg("ext") : String("pfm");
  ext.toLowerCase();
  // thumb: the panel's own picture of the pattern (src/core_thumbs.h), for a
  // console or a site that wants to show what a pattern looks like without
  // running it. 404 until the pattern has been played once.
  if (ext != "pfm" && ext != "json" && ext != "thumb") {
    sendJson(400, "{\"ok\":false,\"error\":\"ext must be pfm, json or thumb\"}");
    return;
  }
  char path[MODULE_PATH_BYTES];
  snprintf(path, sizeof(path), "%s/%s.%s", MODULE_DIR, slug, ext.c_str());
  if (!FFat.exists(path)) {
    sendJson(404, "{\"ok\":false,\"error\":\"not found\"}");
    return;
  }
  File file = FFat.open(path, "r");
  if (!file) {
    sendJson(500, "{\"ok\":false,\"error\":\"cannot open\"}");
    return;
  }
  char disposition[80];
  snprintf(disposition, sizeof(disposition),
           "attachment; filename=\"%s.%s\"", slug, ext.c_str());
  server().sendHeader("Content-Disposition", disposition);
  server().sendHeader("Cache-Control", "no-store");
  const char* ctype =
      ext == "json" ? "application/json" : "application/octet-stream";
  server().streamFile(file, ctype);
  file.close();
}

// Remove one module's files. Shared by the single and the batch delete; the
// caller owns the eviction and the rescan, because doing either per file is
// what made clearing a library take a minute.
inline bool removeModuleFiles(const char* slug) {
  char path[MODULE_PATH_BYTES];
  snprintf(path, sizeof(path), "%s/%s.pfm", MODULE_DIR, slug);
  if (!FFat.exists(path)) return false;
  FFat.remove(path);

  char sidecar[MODULE_PATH_BYTES];
  snprintf(sidecar, sizeof(sidecar), "%s/%s.json", MODULE_DIR, slug);
  if (FFat.exists(sidecar)) FFat.remove(sidecar);
  sidecarForgetSlug(slug);
  PFThumbs::forget(slug);
  return true;
}

// POST /api/patterns/delete — body is one slug per line, or a single "*" to
// clear every module.
//
// Exists because the per-slug DELETE below rescans FATFS and reloads the
// active module on EVERY call: fine for one, and about a minute of watching a
// list redraw for fifty. Here the eviction happens once, the files go in one
// pass, and the rescan is requested once at the end through tick() — the same
// deferral uploads use, so no filesystem work happens inside the transaction.
//
// Not folded into DELETE with a comma-separated query: fifty slugs is over a
// kilobyte of URI, and this server's query parsing is the part of the stack
// with the longest history of quietly mangling long inputs.
inline void handleDeleteMany() {
  if (!moduleStorageMounted) {
    sendJson(409, "{\"ok\":false,\"error\":\"storage not mounted\"}");
    return;
  }
  String body = server().hasArg("plain") ? server().arg("plain") : String();
  body.trim();
  if (body.length() == 0) {
    sendJson(400, "{\"ok\":false,\"error\":\"no slugs given\"}");
    return;
  }

  captureSelectionOnce();

  int removed = 0;
  int missing = 0;

  if (body == "*") {
    // Whatever is on disk, not whatever the registry currently lists — a
    // module the loader rejected at boot is exactly the one worth clearing.
    //
    // One name at a time, re-opening the directory each pass. Collecting all
    // of them first would be the obvious loop, but the array has to be sized
    // for MAX_MODULE_PATTERNS (128) and this runs in an HTTP handler with a
    // module resident, where there is no 5 KB of stack to spend on a list.
    // Removing entries while holding the directory handle open is the other
    // obvious shortcut, and it makes FAT skip files.
    for (int pass = 0; pass < MAX_MODULE_PATTERNS; pass++) {
      char victim[MODULE_PATH_BYTES] = {};
      File directory = FFat.open(MODULE_DIR);
      if (directory && directory.isDirectory()) {
        File entry = directory.openNextFile();
        while (entry) {
          String name = entry.path();
          if (!entry.isDirectory() && name.endsWith(".pfm")) {
            snprintf(victim, sizeof(victim), "%s", name.c_str());
            break;
          }
          entry = directory.openNextFile();
        }
      }
      if (directory) directory.close();
      if (!victim[0]) break;

      char slug[MODULE_NAME_BYTES];
      if (slugFromFilename(victim, slug, sizeof(slug)) && removeModuleFiles(slug)) {
        removed++;
      } else {
        break;  // cannot name it, so the next pass would find it again
      }
      yield();
    }
  } else {
    int start = 0;
    while (start < (int)body.length()) {
      int cut = body.indexOf('\n', start);
      String line = cut < 0 ? body.substring(start) : body.substring(start, cut);
      start = cut < 0 ? body.length() : cut + 1;
      line.trim();
      if (line.length() == 0) continue;

      char slug[MODULE_NAME_BYTES];
      if (!slugFromFilename(line + ".pfm", slug, sizeof(slug))) { missing++; continue; }
      removeModuleFiles(slug) ? removed++ : missing++;
      // Fifty file removals in one handler is long enough to starve the
      // watchdog and the network stack if nothing yields.
      yield();
    }
  }

  requestReload();
  String json = "{\"ok\":true,\"removed\":";
  json += removed;
  json += ",\"missing\":";
  json += missing;
  json += "}";
  Serial.printf("[PATTERNS-HTTP] batch delete — %d removed, %d missing\n", removed, missing);
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

  if (!moduleStorageMounted) {
    sendJson(404, "{\"ok\":false,\"error\":\"no such module\"}");
    return;
  }

  // Drop it out of executable RAM before the file goes, in case it is running.
  captureSelectionOnce();
  if (!removeModuleFiles(slug)) {
    restoreSelection();
    sendJson(404, "{\"ok\":false,\"error\":\"no such module\"}");
    return;
  }

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
    // catalog.txt is the running order (see pattern_registry.h) — a deck pack
    // ships it beside the modules so the deck's order survives the trip.
    bool isCatalog = name.equals("catalog.txt");
    if (!isJson && !isCatalog && !name.endsWith(".pfm")) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "only .pfm, .json or catalog.txt accepted");
      return;
    }
    if (isCatalog) {
      snprintf(uploadSlug, sizeof(uploadSlug), "catalog");
    } else if (!slugFromFilename(upload.filename, uploadSlug, sizeof(uploadSlug))) {
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
    if (isCatalog) {
      snprintf(uploadPath, sizeof(uploadPath), "%s/catalog.txt", MODULE_DIR);
    } else {
      snprintf(uploadPath, sizeof(uploadPath), "%s/%s.%s", MODULE_DIR, uploadSlug,
               isJson ? "json" : "pfm");
    }

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
    bool isCatalog = lowered.equals("catalog.txt");  // running order, see above
    if (!isJson && !isCatalog && !lowered.endsWith(".pfm")) {
      uploadFailed = true;
      snprintf(uploadError, sizeof(uploadError), "only .pfm, .json or catalog.txt accepted");
      return;
    }
    if (isCatalog) {
      snprintf(uploadSlug, sizeof(uploadSlug), "catalog");
    } else if (!slugFromFilename(name, uploadSlug, sizeof(uploadSlug))) {
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
    if (isCatalog) {
      snprintf(uploadPath, sizeof(uploadPath), "%s/catalog.txt", MODULE_DIR);
    } else {
      snprintf(uploadPath, sizeof(uploadPath), "%s/%s.%s", MODULE_DIR, uploadSlug,
               isJson ? "json" : "pfm");
    }

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

  // A new .pfm or a new .json under this slug: whatever the cache remembered
  // about it is stale.
  sidecarForgetSlug(uploadSlug);
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
  // Read the request here; resolve it against the list on the loop task,
  // which is the only place the list is guaranteed whole.
  const bool byStep = server().hasArg("step");
  const int step = byStep ? server().arg("step").toInt() : 0;
  const bool byIndex = server().hasArg("index");
  const int wantIndex = byIndex ? server().arg("index").toInt() : -1;
  const String wantName = server().hasArg("name") ? server().arg("name") : String();

  int index = -1;
  String name;
  PFLoopSync::run([&] {
    if (byStep) {
      // ?step=+1|-1: the next (or previous) pattern that is not hidden,
      // wrapping, from wherever the panel is now.
      int dir = (step >= 0) ? 1 : -1;
      int candidate = (activePatternIdx >= 0) ? activePatternIdx : 0;
      for (int guard = 0; guard < NUM_PATTERNS; guard++) {
        candidate = ((candidate + dir) % NUM_PATTERNS + NUM_PATTERNS) % NUM_PATTERNS;
        if (!patterns[candidate].hidden) {
          index = candidate;
          break;
        }
      }
    } else if (byIndex) {
      index = wantIndex;
    } else if (wantName.length()) {
      for (int i = 0; i < NUM_PATTERNS; i++) {
        if (wantName.equals(patterns[i].name)) {
          index = i;
          break;
        }
      }
    }
    if (index < 0 || index >= NUM_PATTERNS) {
      index = -1;
      return;
    }
    name = patterns[index].name;
    pendingSelectIdx = index;
    // An explicit pick supersedes a pending console restore: without this,
    // the pattern chosen from the page ran until the console went idle and
    // then snapped back to whatever was playing before the page was opened.
    // Left alone only while an upload batch still owns the eviction.
    if (restorePending &&
        (!lastUploadActivityMs || millis() - lastUploadActivityMs > 3000)) {
      restorePending = false;
    }
  });

  server().sendHeader("Cache-Control", "no-store");
  server().sendHeader("Access-Control-Allow-Origin", "*");
  if (index < 0) {
    server().send(404, "application/json", "{\"ok\":false,\"error\":\"no such pattern\"}");
    return;
  }
  String body = "{\"ok\":true,\"index\":";
  body += index;
  body += ",\"name\":\"";
  body += name;
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
  server().on("/patterns/fflate.js", HTTP_GET, handleFflateJs);
  // NOTE deliberately absent: a device-streamed frame preview (/api/frame,
  // 24 KB per poll) was built, shipped, and REMOVED the same day. Polling it
  // from the console at module-resident heap captured the render loop for
  // seconds at a time and piled requests up on this single-connection server
  // until the device read as dead. If a live preview returns, it renders in
  // the browser from the pattern's JS (shipped inside packs) — the device
  // never streams pixels. (/remote and /api/knob went with it — unused.)
  server().on("/api/patterns/select", HTTP_GET, handleSelect);
  server().on("/api/patterns/pending", HTTP_GET, handlePendingSelect);
  server().on("/api/patterns/file", HTTP_GET, handleFile);
  server().on("/api/patterns", HTTP_GET, handleList);
  server().on("/api/patterns", HTTP_POST, handleUploadDone, handleUpload);
  // Raw-body PUT is what the page actually uses: the WebServer's multipart
  // parser is the flakiest part of this stack (query-string quirk, dead
  // replies on multi-chunk bodies), and a raw octet stream sidesteps ALL of
  // its boundary handling. Filename travels in X-PF-Name. The multipart POST
  // above stays for curl and older pages.
  server().on("/api/patterns", HTTP_PUT, handleUploadDone, handlePutBody);
  server().on("/api/patterns", HTTP_DELETE, handleDelete);
  server().on("/api/patterns/delete", HTTP_POST, handleDeleteMany);
  server().on("/api/patterns/format", HTTP_POST, handleFormat);

  PatternflowHttp::begin();  // idempotent; whoever is first starts it

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
