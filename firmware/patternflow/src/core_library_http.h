// ═══════════════════════════════════════════════════════════
// PatternFlow — pull content from a FlowLocal library host
//
//   POST /api/library/pull
//     host=192.168.66.1   (optional, default FL host)
//     kind=shows|patterns
//     names=a.pfs,b.pfs   (comma or newline separated)
//
// Downloads each file from FlowLocal over HTTP and stores it
// on the panel FFat volume with the same validators as local upload.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"
#include "core_patterns_http.h"
#include "core_mqtt.h"

#ifndef PF_LIBRARY_HTTP_ENABLED
#define PF_LIBRARY_HTTP_ENABLED 1
#endif

#if PF_LIBRARY_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED
#include <FFat.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include "core_module_loader.h"
#include "core_show.h"
#endif

namespace PatternflowLibraryHttp {

#if PF_LIBRARY_HTTP_ENABLED && PF_PATTERNS_HTTP_ENABLED

inline WebServer& server() { return PatternflowPatternsHttp::server(); }
inline bool initialized = false;

constexpr const char* DEFAULT_HOST = "192.168.66.1";
constexpr size_t PULL_BUF = 1024;
constexpr size_t MAX_SHOW_BYTES =
    PatternflowShow::HEADER_BYTES + PatternflowShow::MAX_POOL +
    (size_t)PatternflowShow::MAX_CUES * PatternflowShow::CUE_BYTES;

inline void sendJson(int code, const String& body) {
  server().sendHeader("Cache-Control", "no-store");
  server().sendHeader("Access-Control-Allow-Origin", "*");
  server().sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server().sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server().send(code, "application/json", body);
}

inline void handleOptions() {
  server().sendHeader("Access-Control-Allow-Origin", "*");
  server().sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server().sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server().send(204);
}

inline bool safeName(const String& name) {
  if (name.length() == 0 || name.length() > 96) return false;
  if (name.indexOf("..") >= 0 || name.indexOf('\\') >= 0) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  int slash = name.indexOf('/');
  if (slash >= 0 && name.indexOf('/', slash + 1) >= 0) return false;
  for (size_t i = 0; i < name.length(); i++) {
    char c = name[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.' ||
              c == '/';
    if (!ok) return false;
  }
  return true;
}

inline String urlEncodeName(const String& name) {
  String out;
  out.reserve(name.length() + 8);
  for (size_t i = 0; i < name.length(); i++) {
    char c = name[i];
    if (c == '/') out += "%2F";
    else out += c;
  }
  return out;
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

inline bool downloadToFile(const String& url, const char* destPath, String& err) {
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, url)) {
    err = "http begin failed";
    return false;
  }
  http.setTimeout(20000);
  int code = http.GET();
  if (code != 200) {
    err = String("HTTP ") + code;
    http.end();
    return false;
  }
  WiFiClient* stream = http.getStreamPtr();
  if (!stream) {
    err = "no stream";
    http.end();
    return false;
  }
  File out = FFat.open(destPath, FILE_WRITE);
  if (!out) {
    err = "cannot open destination";
    http.end();
    return false;
  }
  uint8_t buf[PULL_BUF];
  int remaining = http.getSize();
  uint32_t lastByteMs = millis();
  while (http.connected() && (remaining > 0 || remaining == -1)) {
    size_t avail = stream->available();
    if (!avail) {
      if ((int32_t)(millis() - lastByteMs) > 8000) break;
      delay(1);
      continue;
    }
    lastByteMs = millis();
    size_t n = stream->readBytes(buf, avail > sizeof(buf) ? sizeof(buf) : avail);
    if (n == 0) break;
    if (out.write(buf, n) != n) {
      out.close();
      FFat.remove(destPath);
      http.end();
      err = "write failed";
      return false;
    }
    if (remaining > 0) remaining -= (int)n;
    yield();
  }
  out.close();
  http.end();
  return true;
}

inline bool pullShow(const String& host, const String& name, String& detail) {
  if (!safeName(name) || !name.endsWith(".pfs")) {
    detail = "invalid show name";
    return false;
  }
  char slug[PatternflowShow::SLUG_BYTES];
  if (!slugFromName(name, slug, sizeof(slug))) {
    detail = "bad slug";
    return false;
  }
  if (!FFat.exists(PatternflowShow::SHOW_DIR) && !FFat.mkdir(PatternflowShow::SHOW_DIR)) {
    detail = "cannot create /shows";
    return false;
  }
  char tmp[80], dest[80];
  snprintf(tmp, sizeof(tmp), "%s/%s.pfs.tmp", PatternflowShow::SHOW_DIR, slug);
  snprintf(dest, sizeof(dest), "%s/%s.pfs", PatternflowShow::SHOW_DIR, slug);
  String url = "http://" + host + "/api/library/shows/file?name=" + urlEncodeName(name);
  String err;
  if (!downloadToFile(url, tmp, err)) {
    detail = err;
    return false;
  }
  File f = FFat.open(tmp, "r");
  if (!f) {
    detail = "cannot reopen temp";
    return false;
  }
  size_t sz = f.size();
  if (sz < PatternflowShow::HEADER_BYTES || sz > MAX_SHOW_BYTES) {
    f.close();
    FFat.remove(tmp);
    detail = "not a valid .pfs";
    return false;
  }
  uint8_t* bytes = (uint8_t*)malloc(sz);
  if (!bytes) {
    f.close();
    FFat.remove(tmp);
    detail = "no memory to validate";
    return false;
  }
  size_t got = f.read(bytes, sz);
  f.close();
  const char* why = "";
  bool valid = got == sz && PatternflowShow::validateBuffer(bytes, sz, &why);
  free(bytes);
  if (!valid) {
    FFat.remove(tmp);
    detail = why && why[0] ? why : "not a valid .pfs";
    return false;
  }
  if (FFat.exists(dest)) FFat.remove(dest);
  // rename may not exist — copy
  File src = FFat.open(tmp, "r");
  File dst = FFat.open(dest, FILE_WRITE);
  bool ok = src && dst;
  uint8_t buf[PULL_BUF];
  while (ok && src.available()) {
    size_t n = src.read(buf, sizeof(buf));
    if (dst.write(buf, n) != n) ok = false;
  }
  if (src) src.close();
  if (dst) dst.close();
  FFat.remove(tmp);
  if (!ok) {
    detail = "finalize failed";
    return false;
  }
  detail = dest;
  return true;
}

inline bool pullPattern(const String& host, const String& name, String& detail) {
  if (!safeName(name)) {
    detail = "invalid name";
    return false;
  }
  String lower = name;
  lower.toLowerCase();
  bool isJson = lower.endsWith(".json");
  bool isPfm = lower.endsWith(".pfm");
  if (!isJson && !isPfm) {
    detail = "only .pfm/.json";
    return false;
  }
  char slug[MODULE_NAME_BYTES];
  if (!slugFromName(name, slug, sizeof(slug))) {
    detail = "bad slug";
    return false;
  }
  if (!mountModuleStorage()) {
    detail = "filesystem not mounted";
    return false;
  }
  if (!FFat.exists(MODULE_DIR) && !FFat.mkdir(MODULE_DIR)) {
    detail = "cannot create /patterns";
    return false;
  }
  char tmp[96], dest[96];
  snprintf(tmp, sizeof(tmp), "%s/%s.%s.tmp", MODULE_DIR, slug, isJson ? "json" : "pfm");
  snprintf(dest, sizeof(dest), "%s/%s.%s", MODULE_DIR, slug, isJson ? "json" : "pfm");
  String url = "http://" + host + "/api/library/patterns/file?name=" + urlEncodeName(name);
  String err;
  if (!downloadToFile(url, tmp, err)) {
    detail = err;
    return false;
  }
  if (isPfm) {
    char why[96];
    if (!PFModuleLoader::looksLikeModule(FFat, tmp, why, sizeof(why))) {
      FFat.remove(tmp);
      detail = why;
      return false;
    }
  }
  if (FFat.exists(dest)) FFat.remove(dest);
  File src = FFat.open(tmp, "r");
  File dst = FFat.open(dest, FILE_WRITE);
  bool ok = src && dst;
  uint8_t buf[PULL_BUF];
  while (ok && src.available()) {
    size_t n = src.read(buf, sizeof(buf));
    if (dst.write(buf, n) != n) ok = false;
  }
  if (src) src.close();
  if (dst) dst.close();
  FFat.remove(tmp);
  if (!ok) {
    detail = "finalize failed";
    return false;
  }
  detail = dest;
  return true;
}

inline void handlePull() {
  if (WiFi.status() != WL_CONNECTED) {
    sendJson(503, "{\"ok\":false,\"error\":\"wifi down\"}");
    return;
  }
  String host = server().hasArg("host") ? server().arg("host") : String();
  if (host.length() == 0 && PatternflowMqtt::isFlowLocalMode()) {
    host = PatternflowMqtt::flowLocalHost();
  }
  if (host.length() == 0) host = DEFAULT_HOST;
  String kind = server().hasArg("kind") ? server().arg("kind") : String("shows");
  String names = server().hasArg("names") ? server().arg("names") : String();
  kind.toLowerCase();
  host.trim();
  if (host.startsWith("http://")) host = host.substring(7);
  if (host.startsWith("https://")) host = host.substring(8);
  int slash = host.indexOf('/');
  if (slash >= 0) host = host.substring(0, slash);
  if (host.length() == 0) host = DEFAULT_HOST;
  if (kind != "shows" && kind != "patterns") {
    sendJson(400, "{\"ok\":false,\"error\":\"kind must be shows or patterns\"}");
    return;
  }
  if (names.length() == 0) {
    sendJson(400, "{\"ok\":false,\"error\":\"missing names\"}");
    return;
  }

  String json = "{\"ok\":true,\"kind\":\"";
  json += kind;
  json += "\",\"host\":\"";
  jsonEscape(json, host.c_str());
  json += "\",\"results\":[";

  int installed = 0, failed = 0;
  bool first = true;
  int start = 0;
  while (start < (int)names.length()) {
    int end = names.length();
    for (int i = start; i < (int)names.length(); i++) {
      char c = names[i];
      if (c == ',' || c == '\n' || c == '\r') {
        end = i;
        break;
      }
    }
    String name = names.substring(start, end);
    name.trim();
    start = end + 1;
    if (name.length() == 0) continue;

    String detail;
    bool ok = false;
    if (kind == "shows") ok = pullShow(host, name, detail);
    else if (kind == "patterns") ok = pullPattern(host, name, detail);
    else {
      detail = "unknown kind";
      ok = false;
    }

    if (!first) json += ',';
    first = false;
    json += "{\"name\":\"";
    jsonEscape(json, name.c_str());
    json += "\",\"ok\":";
    json += ok ? "true" : "false";
    json += ",\"detail\":\"";
    jsonEscape(json, detail.c_str());
    json += "\"}";
    if (ok) installed++;
    else failed++;
    yield();
  }

  if (kind == "patterns" && installed > 0) {
    PatternflowPatternsHttp::requestReload();
  }

  json += "],\"installed\":";
  json += installed;
  json += ",\"failed\":";
  json += failed;
  json += '}';
  sendJson(200, json);
  Serial.printf("[LIBRARY] pull kind=%s installed=%d failed=%d\n", kind.c_str(),
                installed, failed);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;
  server().on("/api/library/pull", HTTP_OPTIONS, handleOptions);
  server().on("/api/library/pull", HTTP_POST, handlePull);
  initialized = true;
  Serial.println("[LIBRARY] Ready - POST /api/library/pull");
}

#else

inline void begin() {}

#endif

}  // namespace PatternflowLibraryHttp
