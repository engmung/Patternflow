// ═══════════════════════════════════════════════════════════
// PatternFlow - /show sequences (PFST tables on FatFS)
//
//   GET    /show
//   GET    /api/shows
//   GET    /api/shows/status   playhead / mode only (no FatFS catalog scan)
//   PUT    /api/shows          raw .pfs, filename in X-PF-Name
//   POST   /api/shows/control  op=play|stop|loop  slug=  loop=0|1
//   POST   /api/shows/schedule night/wake fields
//   DELETE /api/shows?slug=
//
// This page is deliberately served WITHOUT pausing the running pattern —
// it is a player, not a library editor.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"
#include "core_patterns_http.h"

#ifndef PF_SHOW_HTTP_ENABLED
#define PF_SHOW_HTTP_ENABLED 1
#endif

#if PF_SHOW_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED
#include <FFat.h>
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <WiFi.h>
#include "core_mem.h"
#include "core_send.h"
#include "core_show.h"
#include "core_show_schedule.h"
#include "show_index.h"
#endif

namespace PatternflowShowHttp {

#if PF_SHOW_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED

inline WebServer& server() { return PatternflowPatternsHttp::server(); }
inline bool initialized = false;

constexpr size_t PUT_MAX =
    PatternflowShow::HEADER_BYTES + PatternflowShow::MAX_POOL +
    (size_t)PatternflowShow::MAX_CUES * PatternflowShow::CUE_BYTES;

inline uint8_t* putBuf = nullptr;
inline size_t putLen = 0;

inline bool ensurePutBuf() {
  if (!putBuf) putBuf = (uint8_t*)PFMem::alloc(PUT_MAX);
  return putBuf != nullptr;
}
inline bool putFailed = false;
inline char putError[80] = {};
inline char putSlug[PatternflowShow::SLUG_BYTES] = {};

inline void sendJson(int code, const String& body) {
  server().sendHeader("Cache-Control", "no-store");
  server().send(code, "application/json", body);
}

inline bool slugFromName(const String& filename, char* slug, size_t slugSize) {
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

inline void jsonEscape(String& out, const char* in) {
  for (const char* p = in ? in : ""; *p; ++p) {
    if (*p == '"' || *p == '\\') out += '\\';
    if ((uint8_t)*p >= 32) out += *p;
  }
}

inline bool ensureDir() {
  if (!FFat.exists(PatternflowShow::SHOW_DIR) &&
      !FFat.mkdir(PatternflowShow::SHOW_DIR)) {
    return false;
  }
  return true;
}

inline void appendStatus(String& json) {
  json += "\"playing\":";
  json += PatternflowShow::isPlaying() ? "true" : "false";
  json += ",\"paused\":";
  json += PatternflowShow::isPaused() ? "true" : "false";
  json += ",\"loaded\":";
  json += PatternflowShow::isLoaded() ? "true" : "false";
  json += ",\"loop\":";
  json += PatternflowShow::loops() ? "true" : "false";
  json += ",\"t\":";
  json += PatternflowShow::playheadSeconds();
  json += ",\"length\":";
  json += PatternflowShow::length();
  json += ",\"cues\":";
  json += PatternflowShow::numCues();
  json += ",\"slug\":\"";
  jsonEscape(json, PatternflowShow::slug());
  json += "\",\"title\":\"";
  jsonEscape(json, PatternflowShow::title());
  json += "\",\"missing\":[";
  for (uint8_t i = 0; i < PatternflowShow::missing(); i++) {
    if (i) json += ',';
    json += '"';
    jsonEscape(json, PatternflowShow::missingAt(i));
    json += '"';
  }
  json += "]";
  json += ",\"playlist\":";
  json += PatternflowShow::isPlaylist() ? "true" : "false";
  json += ",\"playlistLoop\":";
  json += PatternflowShow::playlistLoops() ? "true" : "false";
  json += ",\"playlistIndex\":";
  json += (int)PatternflowShow::playlistPos();
  json += ",\"playlistCount\":";
  json += (int)PatternflowShow::playlistSize();
  json += ",\"playlistSlugs\":[";
  for (uint8_t i = 0; i < PatternflowShow::playlistSize(); i++) {
    if (i) json += ',';
    json += '"';
    jsonEscape(json, PatternflowShow::playlistSlugAt(i));
    json += '"';
  }
  json += "]";
  json += ",\"sequenceMode\":";
  json += PatternflowShow::isSequenceMode() ? "true" : "false";
  json += ",\"storedCount\":";
  json += (int)PatternflowShow::storedSize();
  json += ",\"storedLoop\":";
  json += PatternflowShow::storedLoops() ? "true" : "false";
  json += ",\"storedSlugs\":[";
  for (uint8_t i = 0; i < PatternflowShow::storedSize(); i++) {
    if (i) json += ',';
    json += '"';
    jsonEscape(json, PatternflowShow::storedSlugAt(i));
    json += '"';
  }
  json += "]";
  json += ",\"variance\":";
  json += PatternflowShow::varianceOn() ? "true" : "false";
  json += ",\"varianceCue\":";
  json += (int)PatternflowShow::varianceCueIdx();
  json += ",\"varianceParam\":";
  json += (int)PatternflowShow::varianceParamIdx();
  if (PatternflowShow::varianceRolledOk()) {
    json += ",\"varianceValue\":";
    json += (int)PatternflowShow::varianceValue();
  }  json += ",\"schedEnabled\":";
  json += PatternflowShowSchedule::enabled ? "true" : "false";
  json += ",\"nightAt\":\"";
  {
    char hm[8];
    PatternflowShowSchedule::formatHm(hm, sizeof(hm),
                                      PatternflowShowSchedule::nightHour,
                                      PatternflowShowSchedule::nightMin);
    json += hm;
  }
  json += "\",\"wakeAt\":\"";
  {
    char hm[8];
    PatternflowShowSchedule::formatHm(hm, sizeof(hm),
                                      PatternflowShowSchedule::wakeHour,
                                      PatternflowShowSchedule::wakeMin);
    json += hm;
  }
  json += "\",\"wakeSlug\":\"";
  jsonEscape(json, PatternflowShowSchedule::wakeSlug);
  json += "\",\"repeat\":";
  json += PatternflowShowSchedule::repeatUntilInteract ? "true" : "false";
  json += ",\"nightClock\":";
  json += PatternflowShowSchedule::nightClock ? "true" : "false";
  json += ",\"nightDim\":";
  json += (int)PatternflowShowSchedule::nightDimPct;
  json += ",\"phase\":\"";
  json += PatternflowShowSchedule::phaseName();
  json += "\",\"timeSynced\":";
  json += PatternflowWeather::timeSynced() ? "true" : "false";
  json += ",\"localTime\":\"";
  if (PatternflowWeather::timeSynced()) {
    char tbuf[12];
    snprintf(tbuf, sizeof(tbuf), "%02d:%02d:%02d",
             PatternflowWeather::localHour(), PatternflowWeather::localMinute(),
             PatternflowWeather::localSecond());
    json += tbuf;
  }
  json += "\",\"snoozeMs\":";
  json += PatternflowShowSchedule::snoozeRemainingMs();
}

inline void handleIndex() {
  PFSend::progmem(server(), SHOW_INDEX_HTML);
}

inline bool isPfsPath(const char* path) {
  if (!path || !path[0]) return false;
  size_t n = strlen(path);
  if (n < 4) return false;
  const char* ext = path + n - 4;
  return (ext[0] == '.') &&
         (ext[1] == 'p' || ext[1] == 'P') &&
         (ext[2] == 'f' || ext[2] == 'F') &&
         (ext[3] == 's' || ext[3] == 'S');
}

// Catalog cache: /show used to re-open every .pfs header on each 1 Hz poll,
// which stuttered playback with ~24 demos. Invalidate only on put/delete.
constexpr uint8_t SHOW_CACHE_MAX = 48;
struct ShowCacheEntry {
  char slug[PatternflowShow::SLUG_BYTES];
  char title[32];
  uint16_t length;
  uint16_t cues;
  bool loop;
};
inline ShowCacheEntry showCache[SHOW_CACHE_MAX] = {};
inline uint8_t showCacheCount = 0;
inline bool showCacheValid = false;

inline void invalidateShowCache() { showCacheValid = false; }

inline void rebuildShowCache() {
  showCacheCount = 0;
  File dir = FFat.open(PatternflowShow::SHOW_DIR);
  if (dir && dir.isDirectory()) {
    File entry = dir.openNextFile();
    while (entry) {
      const char* path = entry.path();
      char stored[72] = {};
      bool take = path && !entry.isDirectory() && isPfsPath(path);
      if (take) snprintf(stored, sizeof(stored), "%s", path);
      entry.close();
      if (take && showCacheCount < SHOW_CACHE_MAX) {
        char slug[PatternflowShow::SLUG_BYTES];
        if (slugFromName(stored, slug, sizeof(slug))) {
          ShowCacheEntry& e = showCache[showCacheCount];
          snprintf(e.slug, sizeof(e.slug), "%s", slug);
          e.title[0] = '\0';
          e.length = 0;
          e.cues = 0;
          e.loop = false;
          File file = FFat.open(stored, "r");
          if (file) {
            PatternflowShow::ShowHeader hdr = {};
            if (file.read((uint8_t*)&hdr, sizeof(hdr)) == sizeof(hdr) &&
                memcmp(hdr.magic, "PFST", 4) == 0) {
              hdr.title[31] = '\0';
              snprintf(e.title, sizeof(e.title), "%s",
                       hdr.title[0] ? hdr.title : slug);
              // Seconds regardless of table version — v2 headers count
              // deciseconds (see core_show.h).
              e.length = (hdr.version == PatternflowShow::VERSION2)
                             ? (uint16_t)(hdr.length / 10)
                             : hdr.length;
              e.cues = hdr.cueCount;
              e.loop = (hdr.flags & 1) != 0;
            }
            file.close();
          }
          if (!e.title[0]) snprintf(e.title, sizeof(e.title), "%s", slug);
          showCacheCount++;
        }
      }
      yield();
      entry = dir.openNextFile();
    }
  }
  if (dir) dir.close();
  showCacheValid = true;
}

inline void appendShowsArray(String& json) {
  if (!showCacheValid) rebuildShowCache();
  for (uint8_t i = 0; i < showCacheCount; i++) {
    if (i) json += ',';
    const ShowCacheEntry& e = showCache[i];
    json += "{\"slug\":\"";
    jsonEscape(json, e.slug);
    json += "\",\"title\":\"";
    jsonEscape(json, e.title);
    json += "\",\"length\":";
    json += e.length;
    json += ",\"cues\":";
    json += e.cues;
    json += ",\"loop\":";
    json += e.loop ? "true" : "false";
    json += '}';
  }
}

inline void handleStatus() {
  String json;
  json.reserve(768);
  json = "{";
  appendStatus(json);
  json += '}';
  sendJson(200, json);
}

inline void handleList() {
  if (!showCacheValid) rebuildShowCache();
  String json;
  json.reserve(512 + (size_t)showCacheCount * 96);
  json = "{";
  appendStatus(json);
  json += ",\"shows\":[";
  appendShowsArray(json);
  json += "]}";
  sendJson(200, json);
}

inline void handleControl() {
  String op = server().hasArg("op") ? server().arg("op") : String();
  op.toLowerCase();
  if (op == "stop") {
    PatternflowShowSchedule::noteInteraction();
    PatternflowShow::enterNormalMode(true);
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  if (op == "pause" || op == "resume") {
    PatternflowShowSchedule::noteInteraction();
    bool ok = op == "pause" ? PatternflowShow::pauseShow()
                            : PatternflowShow::resumeShow();
    if (!ok) {
      sendJson(400, op == "pause"
                        ? "{\"ok\":false,\"error\":\"nothing is playing\"}"
                        : "{\"ok\":false,\"error\":\"nothing is paused\"}");
      return;
    }
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  if (op == "loop") {
    // Single-sequence loop only when not in a multi-.pfs playlist.
    if (!PatternflowShow::isPlaylist()) {
      PatternflowShow::setLoop(server().arg("loop") == "1");
    } else {
      bool on = server().arg("loop") == "1";
      PatternflowShow::playlistLoop = on;
      PatternflowShow::storedLoop = on;
      PatternflowShow::savePrefs();
    }
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  if (op == "variance") {
    bool en = server().hasArg("en") ? server().arg("en") == "1" : false;
    int cue = server().hasArg("cue") ? server().arg("cue").toInt() : 2;
    int param = server().hasArg("param") ? server().arg("param").toInt() : 0;
    if (cue < 0) cue = 0;
    if (cue > (int)PatternflowShow::VARIANCE_CUE_MAX)
      cue = PatternflowShow::VARIANCE_CUE_MAX;
    if (param < 0) param = 0;
    if (param > 3) param = 3;
    PatternflowShow::setVariance(en, (uint8_t)cue, (uint8_t)param, true);
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  if (op == "playlist") {
    PatternflowShowSchedule::noteInteraction();
    PatternflowPatternsHttp::releaseConsolePause();
    PatternflowShow::clearPlaylist();
    String slugs = server().hasArg("slugs") ? server().arg("slugs") : String();
    int start = 0;
    while (start < (int)slugs.length()) {
      int end = slugs.length();
      for (int i = start; i < (int)slugs.length(); i++) {
        char c = slugs[i];
        if (c == ',' || c == '\n' || c == '\r' || c == ' ') {
          end = i;
          break;
        }
      }
      String one = slugs.substring(start, end);
      one.trim();
      start = end + 1;
      if (one.length() == 0) continue;
      char slug[PatternflowShow::SLUG_BYTES];
      if (!slugFromName(one, slug, sizeof(slug))) continue;
      PatternflowShow::addPlaylistSlug(slug);
    }
    bool loopList = server().hasArg("loop") ? server().arg("loop") == "1" : true;
    if (PatternflowShow::playlistSize() == 0) {
      sendJson(400, "{\"ok\":false,\"error\":\"no sequences selected\"}");
      return;
    }
    if (!PatternflowShow::startFromSelection(loopList)) {
      sendJson(400, "{\"ok\":false,\"error\":\"none of the selected files could play\"}");
      return;
    }
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  if (op == "play") {
    PatternflowShowSchedule::noteInteraction();
    PatternflowPatternsHttp::releaseConsolePause();
    char slug[PatternflowShow::SLUG_BYTES];
    if (!slugFromName(server().arg("slug"), slug, sizeof(slug))) {
      sendJson(400, "{\"ok\":false,\"error\":\"missing slug\"}");
      return;
    }
    if (server().hasArg("loop")) {
      PatternflowShow::setLoop(server().arg("loop") == "1");
    }
    const char* err = "";
    bool ok = PatternflowShow::playSlug(slug, &err);
    if (ok && server().hasArg("loop")) {
      PatternflowShow::setLoop(server().arg("loop") == "1");
    }
    if (!ok) {
      String body = "{\"ok\":false,\"error\":\"";
      jsonEscape(body, err && err[0] ? err : "play failed");
      body += "\"}";
      sendJson(400, body);
      return;
    }
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  sendJson(400, "{\"ok\":false,\"error\":\"op must be play, playlist, pause, resume, stop, loop or variance\"}");
}

inline void handleSchedule() {
  bool en = server().arg("enabled") == "1";
  bool repeat = server().arg("repeat") == "1";
  bool clock = server().arg("nightClock") == "1";
  int dim = server().hasArg("nightDim") ? server().arg("nightDim").toInt() : 15;
  String nightAt = server().hasArg("night") ? server().arg("night") : "";
  String wakeAt = server().hasArg("wake") ? server().arg("wake") : "";
  String slug = server().hasArg("slug") ? server().arg("slug") : "";
  if (!PatternflowShowSchedule::applyConfig(en, nightAt.c_str(), wakeAt.c_str(),
                                            slug.c_str(), repeat, clock, dim)) {
    sendJson(400, "{\"ok\":false,\"error\":\"invalid time\"}");
    return;
  }
  String json = "{\"ok\":true,";
  appendStatus(json);
  json += '}';
  sendJson(200, json);
}

inline void handleDelete() {
  char slug[PatternflowShow::SLUG_BYTES];
  if (!slugFromName(server().arg("slug"), slug, sizeof(slug))) {
    sendJson(400, "{\"ok\":false,\"error\":\"missing slug\"}");
    return;
  }
  if (PatternflowShow::isPlaying() &&
      strcasecmp(PatternflowShow::slug(), slug) == 0) {
    PatternflowShowSchedule::noteInteraction();
    PatternflowShow::stopAll();
  }
  char path[72];
  snprintf(path, sizeof(path), "%s/%s.pfs", PatternflowShow::SHOW_DIR, slug);
  if (!FFat.exists(path)) {
    sendJson(404, "{\"ok\":false,\"error\":\"not found\"}");
    return;
  }
  FFat.remove(path);
  if (PatternflowShow::isLoaded() &&
      strcasecmp(PatternflowShow::slug(), slug) == 0) {
    PatternflowShow::unload();
  }
  invalidateShowCache();
  sendJson(200, "{\"ok\":true}");
}

inline void handlePutBody() {
  HTTPRaw& raw = server().raw();
  if (raw.status == RAW_START) {
    putFailed = false;
    putError[0] = '\0';
    putLen = 0;
    putSlug[0] = '\0';
    if (!ensurePutBuf()) {
      putFailed = true;
      snprintf(putError, sizeof(putError), "no memory for upload");
      return;
    }
    String name = server().header("X-PF-Name");
    String lowered = name;
    lowered.toLowerCase();
    if (!lowered.endsWith(".pfs")) {
      putFailed = true;
      snprintf(putError, sizeof(putError), "only .pfs tables accepted");
      return;
    }
    if (!slugFromName(name, putSlug, sizeof(putSlug))) {
      putFailed = true;
      snprintf(putError, sizeof(putError), "invalid X-PF-Name");
      return;
    }
    return;
  }
  if (putFailed) return;
  if (raw.status == RAW_WRITE) {
    if (putLen + raw.currentSize > PUT_MAX) {
      putFailed = true;
      snprintf(putError, sizeof(putError), "file too large");
      return;
    }
    memcpy(putBuf + putLen, raw.buf, raw.currentSize);
    putLen += raw.currentSize;
    return;
  }
  if (raw.status == RAW_END || raw.status == RAW_ABORTED) {
    if (raw.status == RAW_ABORTED) {
      putFailed = true;
      snprintf(putError, sizeof(putError), "upload aborted");
    }
  }
}

inline void handlePutDone() {
  if (putFailed) {
    String body = "{\"ok\":false,\"error\":\"";
    jsonEscape(body, putError);
    body += "\"}";
    sendJson(400, body);
    return;
  }
  const char* err = "";
  if (!putBuf || !PatternflowShow::validateBuffer(putBuf, putLen, &err)) {
    String body = "{\"ok\":false,\"error\":\"";
    jsonEscape(body, err && err[0] ? err : "invalid table");
    body += "\"}";
    sendJson(400, body);
    return;
  }
  if (!ensureDir()) {
    sendJson(500, "{\"ok\":false,\"error\":\"cannot create /shows\"}");
    return;
  }
  char path[72];
  snprintf(path, sizeof(path), "%s/%s.pfs", PatternflowShow::SHOW_DIR, putSlug);
  File file = FFat.open(path, FILE_WRITE);
  if (!file) {
    sendJson(500, "{\"ok\":false,\"error\":\"cannot write\"}");
    return;
  }
  size_t wrote = file.write(putBuf, putLen);
  file.close();
  if (wrote != putLen) {
    FFat.remove(path);
    sendJson(500, "{\"ok\":false,\"error\":\"short write\"}");
    return;
  }
  invalidateShowCache();
  String json = "{\"ok\":true,\"slug\":\"";
  jsonEscape(json, putSlug);
  json += "\",\"bytes\":";
  json += (uint32_t)putLen;
  json += '}';
  sendJson(200, json);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/show", HTTP_GET, handleIndex);
  server().on("/api/shows", HTTP_GET, handleList);
  server().on("/api/shows/status", HTTP_GET, handleStatus);
  server().on("/api/shows", HTTP_PUT, handlePutDone, handlePutBody);
  server().on("/api/shows", HTTP_DELETE, handleDelete);
  server().on("/api/shows/control", HTTP_POST, handleControl);
  server().on("/api/shows/schedule", HTTP_POST, handleSchedule);

  initialized = true;
  Serial.printf("[SHOW] sequences http://%s/show\n",
                WiFi.localIP().toString().c_str());
}

#else

inline void begin() {}

#endif

}  // namespace PatternflowShowHttp
