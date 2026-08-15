// ═══════════════════════════════════════════════════════════
// PatternFlow - /show sequences (PFST tables on FatFS)
//
//   GET    /show
//   GET    /api/shows
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
#include <WebServer.h>
#include <WiFi.h>
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

inline uint8_t putBuf[PUT_MAX];
inline size_t putLen = 0;
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
  json += ",\"schedEnabled\":";
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
  json += ",\"tzMin\":";
  json += (int)PatternflowClock::timezoneOffsetMin();
  json += ",\"phase\":\"";
  json += PatternflowShowSchedule::phaseName();
  json += "\",\"timeSynced\":";
  json += PatternflowClock::timeSynced() ? "true" : "false";
  json += ",\"localTime\":\"";
  if (PatternflowClock::timeSynced()) {
    char tbuf[12];
    snprintf(tbuf, sizeof(tbuf), "%02d:%02d:%02d",
             PatternflowClock::localHour(), PatternflowClock::localMinute(),
             PatternflowClock::localSecond());
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

inline void handleList() {
  String json;
  json.reserve(2048);
  json = "{";
  appendStatus(json);
  json += ",\"shows\":[";
  bool first = true;
  // Same listing contract as scanModules(): path() + close the iterator,
  // then reopen. Reading the PFST header from the directory File skips
  // every entry on this FatFS (openNextFile is a name, not a readable
  // stream), which is why uploads said "stored" and the list stayed empty.
  File dir = FFat.open(PatternflowShow::SHOW_DIR);
  if (dir && dir.isDirectory()) {
    File entry = dir.openNextFile();
    while (entry) {
      const char* path = entry.path();
      char stored[72] = {};
      bool take = path && !entry.isDirectory() && isPfsPath(path);
      if (take) snprintf(stored, sizeof(stored), "%s", path);
      entry.close();
      if (take) {
        char slug[PatternflowShow::SLUG_BYTES];
        if (slugFromName(stored, slug, sizeof(slug))) {
          PatternflowShow::ShowHeader hdr = {};
          bool haveHdr = false;
          File file = FFat.open(stored, "r");
          if (file) {
            haveHdr = file.read((uint8_t*)&hdr, sizeof(hdr)) == sizeof(hdr) &&
                      memcmp(hdr.magic, "PFST", 4) == 0;
            hdr.title[31] = '\0';
            hdr.id[31] = '\0';
            file.close();
          }
          if (!first) json += ',';
          first = false;
          json += "{\"slug\":\"";
          jsonEscape(json, slug);
          json += "\",\"title\":\"";
          jsonEscape(json, haveHdr && hdr.title[0] ? hdr.title : slug);
          json += "\",\"length\":";
          json += haveHdr ? hdr.length : 0;
          json += ",\"cues\":";
          json += haveHdr ? hdr.cueCount : 0;
          json += ",\"loop\":";
          json += (haveHdr && (hdr.flags & 1)) ? "true" : "false";
          json += '}';
        }
      }
      entry = dir.openNextFile();
    }
  }
  if (dir) dir.close();
  json += "]}";
  sendJson(200, json);
}

inline void handleControl() {
  String op = server().hasArg("op") ? server().arg("op") : String();
  op.toLowerCase();
  if (op == "stop") {
    PatternflowShowSchedule::noteInteraction();
    PatternflowShow::stop();
    String json = "{\"ok\":true,";
    appendStatus(json);
    json += '}';
    sendJson(200, json);
    return;
  }
  if (op == "loop") {
    PatternflowShow::setLoop(server().arg("loop") == "1");
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
  sendJson(400, "{\"ok\":false,\"error\":\"op must be play, stop or loop\"}");
}

inline void handleSchedule() {
  bool en = server().arg("enabled") == "1";
  bool repeat = server().arg("repeat") == "1";
  bool clock = server().arg("nightClock") == "1";
  int dim = server().hasArg("nightDim") ? server().arg("nightDim").toInt() : 15;
  String nightAt = server().hasArg("night") ? server().arg("night") : "";
  String wakeAt = server().hasArg("wake") ? server().arg("wake") : "";
  String slug = server().hasArg("slug") ? server().arg("slug") : "";
  // Timezone rides the same form: without Weather ported there is no other
  // page that owns it, and the alarm is the one feature that needs it.
  if (server().hasArg("tz")) {
    PatternflowClock::setTimezoneOffsetMin(server().arg("tz").toInt());
  }
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
    PatternflowShow::stop();
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
  sendJson(200, "{\"ok\":true}");
}

inline void handlePutBody() {
  HTTPRaw& raw = server().raw();
  if (raw.status == RAW_START) {
    putFailed = false;
    putError[0] = '\0';
    putLen = 0;
    putSlug[0] = '\0';
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
  if (!PatternflowShow::validateBuffer(putBuf, putLen, &err)) {
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
