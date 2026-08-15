// ═══════════════════════════════════════════════════════════
// PatternFlow - on-device show player (PFST v1 table)
//
// Director encodes the performance JSON into a packed little-endian file
// (.pfs). This walks that table on Play Now — no nested JSON parser.
// MQTT is not required; pattern/param/message reuse the existing apply
// helpers so absolute-ready modules behave as they do under Director.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <FFat.h>
#include "../pattern_registry.h"
#include "core_mem.h"
#include "core_mqtt.h"

namespace PatternflowShow {

constexpr const char* SHOW_DIR = "/shows";
constexpr uint8_t VERSION = 1;
constexpr uint16_t HEADER_BYTES = 76;
constexpr uint16_t CUE_BYTES = 16;
constexpr uint16_t MAX_CUES = 256;
constexpr uint16_t MAX_POOL = 4096;
constexpr uint16_t OFF_NONE = 0xFFFF;
constexpr uint8_t FLAG_PATTERN = 1;
constexpr uint8_t FLAG_PARAM1 = 2;
constexpr uint8_t FLAG_PARAM2 = 4;
constexpr uint8_t FLAG_PARAM3 = 8;
constexpr uint8_t FLAG_PARAM4 = 16;
constexpr uint8_t FLAG_MESSAGE = 32;
constexpr uint8_t MAX_MISSING = 8;
constexpr size_t SLUG_BYTES = 40;

struct ShowHeader {
  char magic[4];
  uint8_t version;
  uint8_t flags;
  uint16_t length;
  uint16_t cueCount;
  uint16_t poolBytes;
  char title[32];
  char id[32];
} __attribute__((packed));

struct ShowCue {
  uint16_t t;
  uint8_t flags;
  uint8_t reserved;
  uint16_t patternOff;
  uint16_t param[4];
  uint16_t messageOff;
} __attribute__((packed));

static_assert(sizeof(ShowHeader) == 76, "PFST header");
static_assert(sizeof(ShowCue) == 16, "PFST cue");

inline ShowHeader header = {};

// The string pool and cue table are 8 KB together, and they must NOT be
// static arrays. Internal DRAM is what the web console runs on, and there is
// about 15 KB of it left once the panel, Wi-Fi and the HTTP services are up:
// a build that held these in .bss booted as far as starting the services and
// then aborted inside mDNS registration, because the next small allocation —
// a newlib lock inside a log call — had nowhere to come from. Same rule the
// pattern registry's PSRAM pools follow, for the same reason.
//
// Allocated on first load, so a device that never plays a sequence pays
// nothing, and PSRAM's latency is free here: these are read on cue changes,
// never per pixel.
inline uint8_t* pool = nullptr;
inline ShowCue* cueTable = nullptr;

inline bool ensureBuffers() {
  if (!pool) pool = (uint8_t*)PFMem::alloc(MAX_POOL);
  if (!cueTable) cueTable = (ShowCue*)PFMem::alloc(sizeof(ShowCue) * MAX_CUES);
  return pool != nullptr && cueTable != nullptr;
}

inline uint16_t cueCount = 0;
inline uint16_t poolBytes = 0;
inline bool loaded = false;
inline bool playing = false;
inline bool loopFlag = false;
inline uint32_t startedAtMs = 0;
inline uint16_t lastElapsed = 0;
inline uint16_t nextCue = 0;
inline char loadedSlug[SLUG_BYTES] = {};
inline char lastPattern[48] = {};
inline int pendingPatternIdx = -1;
inline bool finishedPending = false;
inline uint8_t missingCount = 0;
inline char missingNames[MAX_MISSING][48] = {};

inline uint16_t rd16(const uint8_t* p) {
  return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

inline int findPattern(const char* name) {
  if (!name || !name[0] || !patterns) return -1;
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (patterns[i].name && strcmp(patterns[i].name, name) == 0) return i;
  }
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (patterns[i].name && strcasecmp(patterns[i].name, name) == 0) return i;
  }
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (!patterns[i].modulePath) continue;
    const char* file = strrchr(patterns[i].modulePath, '/');
    const char* base = file ? file + 1 : patterns[i].modulePath;
    char slug[40];
    snprintf(slug, sizeof(slug), "%s", base);
    char* dot = strrchr(slug, '.');
    if (dot) *dot = '\0';
    if (strcasecmp(slug, name) == 0) return i;
  }
  return -1;
}

inline const char* poolString(uint16_t off) {
  if (!pool || off == OFF_NONE || off >= poolBytes) return "";
  return (const char*)(pool + off);
}

inline bool poolOkIn(const uint8_t* poolPtr, uint16_t nPool, uint16_t off) {
  if (off == OFF_NONE) return true;
  if (!poolPtr || off >= nPool) return false;
  for (uint16_t i = off; i < nPool; i++) {
    if (poolPtr[i] == 0) return true;
  }
  return false;
}

inline bool poolOk(uint16_t off) {
  return poolOkIn(pool, poolBytes, off);
}

inline void noteMissing(const char* name) {
  if (!name || !name[0] || missingCount >= MAX_MISSING) return;
  for (uint8_t i = 0; i < missingCount; i++) {
    if (strcasecmp(missingNames[i], name) == 0) return;
  }
  snprintf(missingNames[missingCount], sizeof(missingNames[0]), "%s", name);
  missingCount++;
}

inline void scanMissing() {
  missingCount = 0;
  if (!cueTable) return;
  for (uint16_t i = 0; i < cueCount; i++) {
    if (!(cueTable[i].flags & FLAG_PATTERN)) continue;
    const char* name = poolString(cueTable[i].patternOff);
    if (!name[0]) continue;
    if (findPattern(name) < 0) noteMissing(name);
  }
}

inline void queuePattern(const char* name) {
  int idx = findPattern(name);
  if (idx < 0) return;
  pendingPatternIdx = idx;
  if (name) snprintf(lastPattern, sizeof(lastPattern), "%s", name);
}

inline void unload() {
  playing = false;
  loaded = false;
  cueCount = 0;
  poolBytes = 0;
  nextCue = 0;
  lastElapsed = 0;
  loadedSlug[0] = '\0';
  lastPattern[0] = '\0';
  missingCount = 0;
  memset(&header, 0, sizeof(header));
}

inline bool validateBuffer(const uint8_t* data, size_t len, const char** error) {
  if (len < HEADER_BYTES) {
    if (error) *error = "file too small";
    return false;
  }
  if (memcmp(data, "PFST", 4) != 0) {
    if (error) *error = "not a PFST table";
    return false;
  }
  if (data[4] != VERSION) {
    if (error) *error = "unsupported PFST version";
    return false;
  }
  uint16_t nCues = rd16(data + 8);
  uint16_t nPool = rd16(data + 10);
  if (nCues > MAX_CUES || nPool > MAX_POOL) {
    if (error) *error = "table too large";
    return false;
  }
  size_t need = (size_t)HEADER_BYTES + nPool + (size_t)nCues * CUE_BYTES;
  if (len < need) {
    if (error) *error = "truncated table";
    return false;
  }
  const uint8_t* poolPtr = data + HEADER_BYTES;
  const uint8_t* src = poolPtr + nPool;
  for (uint16_t i = 0; i < nCues; i++) {
    const uint8_t* c = src + (size_t)i * CUE_BYTES;
    if (!poolOkIn(poolPtr, nPool, rd16(c + 4)) ||
        !poolOkIn(poolPtr, nPool, rd16(c + 14))) {
      if (error) *error = "bad string offset";
      return false;
    }
  }
  if (error) *error = "";
  return true;
}

inline bool loadFile(const char* slug, const char** error) {
  unload();
  if (!slug || !slug[0]) {
    if (error) *error = "missing slug";
    return false;
  }
  if (!ensureBuffers()) {
    if (error) *error = "no memory for the cue table";
    return false;
  }
  char path[72];
  snprintf(path, sizeof(path), "%s/%s.pfs", SHOW_DIR, slug);
  File file = FFat.open(path, "r");
  if (!file) {
    if (error) *error = "not found";
    return false;
  }
  uint8_t hdr[HEADER_BYTES];
  if (file.read(hdr, HEADER_BYTES) != HEADER_BYTES) {
    file.close();
    if (error) *error = "truncated header";
    return false;
  }
  memcpy(&header, hdr, HEADER_BYTES);
  if (memcmp(header.magic, "PFST", 4) != 0) {
    file.close();
    if (error) *error = "not a PFST table";
    return false;
  }
  if (header.version != VERSION) {
    file.close();
    if (error) *error = "unsupported PFST version";
    return false;
  }
  if (header.cueCount > MAX_CUES || header.poolBytes > MAX_POOL) {
    file.close();
    if (error) *error = "table too large";
    return false;
  }
  poolBytes = header.poolBytes;
  if (poolBytes && file.read(pool, poolBytes) != poolBytes) {
    file.close();
    unload();
    if (error) *error = "truncated pool";
    return false;
  }
  if (poolBytes < MAX_POOL) pool[poolBytes] = 0;
  cueCount = header.cueCount;
  uint8_t raw[CUE_BYTES];
  for (uint16_t i = 0; i < cueCount; i++) {
    if (file.read(raw, CUE_BYTES) != CUE_BYTES) {
      file.close();
      unload();
      if (error) *error = "truncated cues";
      return false;
    }
    cueTable[i].t = rd16(raw);
    cueTable[i].flags = raw[2];
    cueTable[i].reserved = raw[3];
    cueTable[i].patternOff = rd16(raw + 4);
    cueTable[i].param[0] = rd16(raw + 6);
    cueTable[i].param[1] = rd16(raw + 8);
    cueTable[i].param[2] = rd16(raw + 10);
    cueTable[i].param[3] = rd16(raw + 12);
    cueTable[i].messageOff = rd16(raw + 14);
    if (!poolOk(cueTable[i].patternOff) || !poolOk(cueTable[i].messageOff)) {
      file.close();
      unload();
      if (error) *error = "bad string offset";
      return false;
    }
  }
  file.close();
  header.title[31] = '\0';
  header.id[31] = '\0';
  loopFlag = (header.flags & 1) != 0;
  scanMissing();
  loaded = true;
  snprintf(loadedSlug, sizeof(loadedSlug), "%s", slug);
  if (error) *error = "";
  return true;
}

inline void applyCue(const ShowCue& cue) {
  if (cue.flags & FLAG_PATTERN) {
    const char* name = poolString(cue.patternOff);
    if (name[0]) {
      int idx = findPattern(name);
      if (idx < 0) {
        noteMissing(name);
        Serial.printf("[SHOW] pattern not on device: %s\n", name);
      } else {
        bool running = (activePatternIdx == idx);
        if (patterns[idx].modulePath && PFModuleLoader::active == nullptr) {
          running = false;
        }
        if (!running || strcmp(lastPattern, name) != 0) {
          pendingPatternIdx = idx;
          snprintf(lastPattern, sizeof(lastPattern), "%s", name);
        }
      }
    }
  }
  for (int i = 0; i < 4; i++) {
    if (cue.flags & (FLAG_PARAM1 << i)) {
      PatternflowMqtt::applyRemoteParam(i, cue.param[i]);
    }
  }
  if (cue.flags & FLAG_MESSAGE) {
    PatternflowMqtt::applyHeldMessage(poolString(cue.messageOff));
  }
}

inline void applyFromStart(uint16_t elapsed) {
  nextCue = 0;
  lastPattern[0] = '\0';
  while (nextCue < cueCount && cueTable[nextCue].t <= elapsed) {
    applyCue(cueTable[nextCue]);
    nextCue++;
  }
}

inline void stop() {
  playing = false;
  // A local show that ends — or is stopped — must hand the knobs back. The
  // MQTT channel flow clears its holds with the end-of-show retained sweep;
  // this player has no broker, so the release lives here. Without it the
  // final cue's absolute values keep pinning the pattern (and zeroing those
  // channels' knob deltas) until something else releases them.
  PatternflowMqtt::clearAbsoluteAll();
}

inline bool playLoaded() {
  if (!loaded || cueCount == 0) return false;
  finishedPending = false;
  playing = true;
  startedAtMs = millis();
  lastElapsed = 0;
  applyFromStart(0);
  return true;
}

inline bool playSlug(const char* slug, const char** error) {
  stop();
  if (!loadFile(slug, error)) return false;
  return playLoaded();
}

inline void tick() {
  if (!playing || !loaded) return;
  uint32_t elapsedMs = millis() - startedAtMs;
  uint32_t lengthMs = (uint32_t)header.length * 1000UL;
  if (header.length == 0) lengthMs = 1000;
  uint16_t elapsed;
  if (loopFlag && lengthMs) {
    uint32_t mod = elapsedMs % lengthMs;
    elapsed = (uint16_t)(mod / 1000UL);
    if (elapsed < lastElapsed) applyFromStart(elapsed);
  } else {
    elapsed = (uint16_t)(elapsedMs / 1000UL);
    if (elapsed >= header.length) {
      while (nextCue < cueCount) {
        applyCue(cueTable[nextCue]);
        nextCue++;
      }
      lastElapsed = header.length;
      finishedPending = true;
      stop();
      return;
    }
  }
  lastElapsed = elapsed;
  while (nextCue < cueCount && cueTable[nextCue].t <= elapsed) {
    applyCue(cueTable[nextCue]);
    nextCue++;
  }
}

inline bool consumePatternIdx(int& outIdx) {
  if (pendingPatternIdx < 0) return false;
  outIdx = pendingPatternIdx;
  pendingPatternIdx = -1;
  return true;
}

inline bool consumeFinished() {
  bool v = finishedPending;
  finishedPending = false;
  return v;
}

inline uint16_t playheadSeconds() { return lastElapsed; }
inline bool isPlaying() { return playing; }
inline bool isLoaded() { return loaded; }
inline bool loops() { return loopFlag; }
inline void setLoop(bool on) { loopFlag = on; }
inline const char* title() { return header.title; }
inline const char* id() { return header.id; }
inline const char* slug() { return loadedSlug; }
inline uint16_t length() { return header.length; }
inline uint16_t numCues() { return cueCount; }
inline uint8_t missing() { return missingCount; }
inline const char* missingAt(uint8_t i) {
  return i < missingCount ? missingNames[i] : "";
}

}  // namespace PatternflowShow
