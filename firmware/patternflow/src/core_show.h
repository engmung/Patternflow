// ═══════════════════════════════════════════════════════════
// PatternFlow - on-device show player (PFST v1 table)
//
// Director encodes the timeline into a packed little-endian file
// (.pfs). This walks that table on Play Now — no nested JSON parser.
// MQTT is not required; pattern/param/message reuse the existing apply
// helpers so absolute-ready modules behave as they do under Director.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <FFat.h>
#include <Preferences.h>
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
constexpr uint8_t FLAG_EASE = 64;  // v2 only
// PFST v2 (docs/pfst-v2-proposal.md): same layout, times in DECISECONDS,
// and FLAG_EASE lerps the cue's set channels toward each channel's next cue.
constexpr uint8_t VERSION2 = 2;
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
inline uint8_t* pool = nullptr;
inline ShowCue* cueTable = nullptr;
inline uint16_t cueCount = 0;
inline uint16_t poolBytes = 0;
inline bool loaded = false;
inline bool playing = false;
// Paused = the wall clock frozen in place. Elapsed-so-far is banked and
// re-based into startedAtMs on resume, so cues — and a v2 EASE mid-ramp —
// continue exactly where they stopped. Absolute holds stay applied: a
// paused show keeps its look instead of snapping back to the knobs.
inline bool paused = false;
inline uint32_t pausedAtElapsedMs = 0;
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

// Multi-sequence playlist (loop applies to the list, not each .pfs).
constexpr uint8_t PLAYLIST_MAX = 24;
inline char playlist[PLAYLIST_MAX][SLUG_BYTES] = {};
inline uint8_t playlistCount = 0;
inline uint8_t playlistIndex = 0;
inline bool playlistActive = false;
inline bool playlistLoop = false;

// Persisted local playlist + panel run mode (Normal vs Sequence).
inline char stored[PLAYLIST_MAX][SLUG_BYTES] = {};
inline uint8_t storedCount = 0;
inline bool storedLoop = true;
inline bool sequenceMode = false;

// Variance: each playthrough randomizes one param on one cue (0..1000).
inline bool varianceEnabled = false;
inline uint8_t varianceCue = 2;    // demo change index 0..4 (UI 1..5)
inline uint8_t varianceParam = 0;  // P1..P4 → 0..3
inline uint16_t varianceRolled = 0;
inline bool varianceHasRoll = false;

// Milliseconds per time unit: 1000 for a v1 table (seconds), 100 for v2
// (deciseconds). One wall clock, two tick sizes.
inline uint16_t tickMs = 1000;
// v2 eased channels — armed when an EASE cue fires; the per-frame value is
// a pure function of millis(), so playback is frame-rate independent.
inline bool easeActive[4] = {};
inline uint16_t easeFromV[4] = {};
inline uint16_t easeToV[4] = {};
inline uint16_t easeFromT[4] = {};
inline uint16_t easeToT[4] = {};

inline void clearEase() {
  for (int i = 0; i < 4; i++) easeActive[i] = false;
}
inline constexpr uint8_t VARIANCE_CUE_MAX = 4;  // five demo changes

inline bool ensureBuffers() {
  if (!pool) pool = (uint8_t*)PFMem::alloc(MAX_POOL);
  if (!cueTable) cueTable = (ShowCue*)PFMem::alloc(sizeof(ShowCue) * MAX_CUES);
  return pool != nullptr && cueTable != nullptr;
}

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
  if (!cueTable || !pool) return;
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
  if (playing) PatternflowMqtt::clearAbsoluteAll();
  playing = false;
  paused = false;
  loaded = false;
  cueCount = 0;
  poolBytes = 0;
  nextCue = 0;
  lastElapsed = 0;
  tickMs = 1000;
  clearEase();
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
  if (data[4] != VERSION && data[4] != VERSION2) {
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
  if (header.version != VERSION && header.version != VERSION2) {
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
  tickMs = (header.version == VERSION2) ? 100 : 1000;
  clearEase();
  scanMissing();
  loaded = true;
  snprintf(loadedSlug, sizeof(loadedSlug), "%s", slug);
  if (error) *error = "";
  return true;
}

inline void rollVariance() {
  varianceHasRoll = false;
  varianceRolled = 0;
  if (!varianceEnabled || !cueTable || cueCount == 0) return;
  if (varianceCue >= cueCount || varianceParam > 3) return;
  if (!(cueTable[varianceCue].flags & (FLAG_PARAM1 << varianceParam))) return;
  varianceRolled = (uint16_t)random(0, 1001);
  varianceHasRoll = true;
  Serial.printf("[SHOW] variance cue%u P%u → %u\n", (unsigned)varianceCue,
                (unsigned)(varianceParam + 1), (unsigned)varianceRolled);
}

inline void applyCue(uint16_t cueIdx) {
  if (!cueTable || cueIdx >= cueCount) return;
  const ShowCue& cue = cueTable[cueIdx];
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
    if (!(cue.flags & (FLAG_PARAM1 << i))) continue;
    uint16_t v = cue.param[i];
    if (varianceHasRoll && cueIdx == varianceCue &&
        (uint8_t)i == varianceParam) {
      v = varianceRolled;
    }
    PatternflowMqtt::applyRemoteParam(i, v);
    // Any cue that sets a channel ends its running ease; an EASE cue re-arms
    // it toward the channel's next value (one <=256-entry scan per fired cue).
    easeActive[i] = false;
    if (header.version != VERSION2 || !(cue.flags & FLAG_EASE)) continue;
    for (uint16_t j = cueIdx + 1; j < cueCount; j++) {
      if (!(cueTable[j].flags & (FLAG_PARAM1 << i))) continue;
      if (cueTable[j].t > cue.t) {
        easeActive[i] = true;
        easeFromV[i] = v;
        easeToV[i] = cueTable[j].param[i];
        easeFromT[i] = cue.t;
        easeToT[i] = cueTable[j].t;
      }
      break;
    }
  }
  if (cue.flags & FLAG_MESSAGE) {
    PatternflowMqtt::applyHeldMessage(poolString(cue.messageOff));
  }
}

inline void applyFromStart(uint16_t elapsed) {
  if (!cueTable) return;
  rollVariance();
  nextCue = 0;
  clearEase();
  lastPattern[0] = '\0';
  while (nextCue < cueCount && cueTable[nextCue].t <= elapsed) {
    applyCue(nextCue);
    nextCue++;
  }
}

inline void stop() {
  playing = false;
  paused = false;
  clearEase();
  PatternflowMqtt::clearAbsoluteAll();
}

inline void clearRuntimePlaylist() {
  playlistCount = 0;
  playlistIndex = 0;
  playlistActive = false;
  playlistLoop = false;
}

inline void clearPlaylist() { clearRuntimePlaylist(); }

inline void savePrefs() {
  Preferences prefs;
  if (!prefs.begin("pfshow", false)) return;
  char blob[PLAYLIST_MAX * SLUG_BYTES + 8] = {};
  size_t n = 0;
  for (uint8_t i = 0; i < storedCount; i++) {
    if (i && n + 1 < sizeof(blob)) blob[n++] = ',';
    size_t len = strlen(stored[i]);
    if (n + len >= sizeof(blob)) break;
    memcpy(blob + n, stored[i], len);
    n += len;
  }
  blob[n] = '\0';
  prefs.putString("pl", blob);
  prefs.putBool("pl_loop", storedLoop);
  prefs.putBool("seq", sequenceMode);
  prefs.putBool("var_en", varianceEnabled);
  prefs.putUChar("var_cue", varianceCue);
  prefs.putUChar("var_p", varianceParam);
  prefs.end();
}

inline void loadPrefs() {
  Preferences prefs;
  if (!prefs.begin("pfshow", true)) return;
  storedCount = 0;
  String pl = prefs.getString("pl", "");
  int start = 0;
  while (start < (int)pl.length() && storedCount < PLAYLIST_MAX) {
    int end = pl.indexOf(',', start);
    if (end < 0) end = pl.length();
    String one = pl.substring(start, end);
    one.trim();
    start = end + 1;
    if (one.length() == 0) continue;
    snprintf(stored[storedCount], SLUG_BYTES, "%s", one.c_str());
    storedCount++;
  }
  storedLoop = prefs.getBool("pl_loop", true);
  sequenceMode = prefs.getBool("seq", false);
  varianceEnabled = prefs.getBool("var_en", false);
  varianceCue = prefs.getUChar("var_cue", 2);
  varianceParam = prefs.getUChar("var_p", 0);
  if (varianceCue > VARIANCE_CUE_MAX) varianceCue = VARIANCE_CUE_MAX;
  if (varianceParam > 3) varianceParam = 0;
  prefs.end();
}

inline void copyStoredToPlaylist() {
  clearRuntimePlaylist();
  for (uint8_t i = 0; i < storedCount; i++) {
    snprintf(playlist[playlistCount], SLUG_BYTES, "%s", stored[i]);
    playlistCount++;
  }
  playlistLoop = storedLoop;
}

inline void commitPlaylistToStored(bool loopList) {
  storedCount = 0;
  for (uint8_t i = 0; i < playlistCount && storedCount < PLAYLIST_MAX; i++) {
    snprintf(stored[storedCount], SLUG_BYTES, "%s", playlist[i]);
    storedCount++;
  }
  storedLoop = loopList;
  playlistLoop = loopList;
  savePrefs();
}

inline void stopAll() {
  clearRuntimePlaylist();
  stop();
}

// Director MQTT takes over a live show without wiping the params that
// arrived on the same MQTT burst (stop() would clearAbsoluteAll()).
inline void haltPlayback() { playing = false; }

inline bool playLoaded() {
  if (!loaded || cueCount == 0 || !cueTable) return false;
  finishedPending = false;
  playing = true;
  paused = false;
  startedAtMs = millis();
  lastElapsed = 0;
  applyFromStart(0);
  return true;
}

// Freeze / continue in place. Pause only banks the clock — the show stays
// "playing" as far as mode and playlist state go, so Stop remains the only
// thing that tears the session down.
inline bool pauseShow() {
  if (!playing || paused) return false;
  pausedAtElapsedMs = millis() - startedAtMs;
  paused = true;
  return true;
}

inline bool resumeShow() {
  if (!playing || !paused) return false;
  startedAtMs = millis() - pausedAtElapsedMs;
  paused = false;
  return true;
}

inline bool isPaused() { return paused; }

inline bool addPlaylistSlug(const char* slug) {
  if (!slug || !slug[0] || playlistCount >= PLAYLIST_MAX) return false;
  for (uint8_t i = 0; i < playlistCount; i++) {
    if (strcasecmp(playlist[i], slug) == 0) return true;
  }
  snprintf(playlist[playlistCount], SLUG_BYTES, "%s", slug);
  playlistCount++;
  return true;
}

// Try to start playlist[index], skipping missing/unreadable .pfs files.
inline bool startPlaylistAt(uint8_t index) {
  if (playlistCount == 0) return false;
  for (uint8_t n = 0; n < playlistCount; n++) {
    uint8_t i = (uint8_t)((index + n) % playlistCount);
    const char* err = "";
    stop();
    if (!loadFile(playlist[i], &err)) {
      Serial.printf("[SHOW] playlist skip %s (%s)\n", playlist[i],
                    err && err[0] ? err : "load failed");
      continue;
    }
    // List loop owns repetition — disable per-file loop while playlist runs.
    loopFlag = false;
    if (!playLoaded()) continue;
    playlistIndex = i;
    playlistActive = true;
    finishedPending = false;
    Serial.printf("[SHOW] playlist %u/%u %s\n", (unsigned)(i + 1),
                  (unsigned)playlistCount, playlist[i]);
    return true;
  }
  playlistActive = false;
  return false;
}

inline bool playPlaylist(bool loopList) {
  if (playlistCount == 0) return false;
  playlistLoop = loopList;
  return startPlaylistAt(0);
}

inline bool enterSequenceMode(bool persist = true) {
  if (storedCount == 0) {
    sequenceMode = false;
    if (persist) savePrefs();
    return false;
  }
  sequenceMode = true;
  if (persist) savePrefs();
  copyStoredToPlaylist();
  return playPlaylist(storedLoop);
}

inline void enterNormalMode(bool persist = true) {
  sequenceMode = false;
  if (persist) savePrefs();
  stopAll();
}

inline bool toggleSequenceMode() {
  if (sequenceMode) {
    enterNormalMode(true);
    return false;
  }
  return enterSequenceMode(true);
}

inline bool startFromSelection(bool loopList) {
  if (playlistCount == 0) return false;
  commitPlaylistToStored(loopList);
  sequenceMode = true;
  savePrefs();
  return playPlaylist(loopList);
}

inline void setVariance(bool en, uint8_t cue, uint8_t param, bool persist = true) {
  varianceEnabled = en;
  varianceCue = cue > VARIANCE_CUE_MAX ? VARIANCE_CUE_MAX : cue;
  varianceParam = param > 3 ? 0 : param;
  if (persist) savePrefs();
}

inline void begin() {
  loadPrefs();
  if (sequenceMode && storedCount > 0) {
    copyStoredToPlaylist();
    playPlaylist(storedLoop);
  } else {
    sequenceMode = false;
  }
}

inline void advancePlaylist() {
  if (!playlistActive || playlistCount == 0) {
    playlistActive = false;
    return;
  }
  uint8_t next = (uint8_t)(playlistIndex + 1);
  if (next >= playlistCount) {
    if (!playlistLoop) {
      playlistActive = false;
      Serial.println("[SHOW] playlist finished");
      return;
    }
    next = 0;
  }
  if (!startPlaylistAt(next)) {
    playlistActive = false;
    Serial.println("[SHOW] playlist stalled (no playable item)");
  }
}

inline bool playSlug(const char* slug, const char** error) {
  sequenceMode = false;
  savePrefs();
  clearPlaylist();
  stop();
  if (!loadFile(slug, error)) return false;
  return playLoaded();
}

inline void tick() {
  if (!playing || paused || !loaded || !cueTable) return;
  // One wall clock, two tick sizes (v1 seconds, v2 deciseconds). Cue firing
  // AND the eased values below are functions of millis(), so playback is
  // frame-rate independent by construction.
  uint32_t elapsedMs = millis() - startedAtMs;
  uint32_t lengthMs = (uint32_t)header.length * (uint32_t)tickMs;
  if (header.length == 0) lengthMs = tickMs;
  uint32_t nowMs;
  uint16_t elapsed;
  if (loopFlag && lengthMs) {
    nowMs = elapsedMs % lengthMs;
    elapsed = (uint16_t)(nowMs / tickMs);
    if (elapsed < lastElapsed) applyFromStart(elapsed);
  } else {
    nowMs = elapsedMs;
    uint32_t elapsedTicks = elapsedMs / tickMs;
    elapsed = elapsedTicks > 65535 ? 65535 : (uint16_t)elapsedTicks;
    if (elapsedTicks >= header.length) {
      while (nextCue < cueCount) {
        applyCue(nextCue);
        nextCue++;
      }
      lastElapsed = header.length;
      finishedPending = true;
      stop();
      if (playlistActive) {
        finishedPending = false;  // advancing, not a terminal finish yet
        advancePlaylist();
        if (!playlistActive) finishedPending = true;
      }
      return;
    }
  }
  lastElapsed = elapsed;
  while (nextCue < cueCount && cueTable[nextCue].t <= elapsed) {
    applyCue(nextCue);
    nextCue++;
  }

  // v2 eased channels: one lerp per active channel per frame — a handful of
  // FPU ops against a multi-million-cycle frame budget. The terminating cue
  // fires the exact end value; past it the ease disarms itself.
  if (header.version == VERSION2) {
    for (int i = 0; i < 4; i++) {
      if (!easeActive[i]) continue;
      uint32_t t0 = (uint32_t)easeFromT[i] * (uint32_t)tickMs;
      uint32_t t1 = (uint32_t)easeToT[i] * (uint32_t)tickMs;
      if (t1 <= t0 || nowMs >= t1) {
        easeActive[i] = false;
        continue;
      }
      if (nowMs <= t0) continue;
      float u = (float)(nowMs - t0) / (float)(t1 - t0);
      long v = (long)((float)easeFromV[i] +
                      ((float)easeToV[i] - (float)easeFromV[i]) * u + 0.5f);
      PatternflowMqtt::applyRemoteParam(i, v);
    }
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

inline uint16_t playheadSeconds() {
  return (uint16_t)(((uint32_t)lastElapsed * tickMs) / 1000UL);
}
inline bool isPlaying() { return playing; }
inline bool isLoaded() { return loaded; }
inline bool loops() { return loopFlag; }
inline void setLoop(bool on) { loopFlag = on; }
inline const char* title() { return header.title; }
inline const char* id() { return header.id; }
inline const char* slug() { return loadedSlug; }
inline uint16_t length() {
  // Seconds regardless of table version — UI and JSON consumers read this.
  return (uint16_t)(((uint32_t)header.length * tickMs) / 1000UL);
}
inline uint16_t numCues() { return cueCount; }
inline uint8_t missing() { return missingCount; }
inline const char* missingAt(uint8_t i) {
  return i < missingCount ? missingNames[i] : "";
}
inline bool isPlaylist() { return playlistActive; }
inline bool playlistLoops() { return playlistLoop; }
inline uint8_t playlistSize() { return playlistCount; }
inline uint8_t playlistPos() { return playlistIndex; }
inline const char* playlistSlugAt(uint8_t i) {
  return i < playlistCount ? playlist[i] : "";
}
inline bool isSequenceMode() { return sequenceMode; }
inline uint8_t storedSize() { return storedCount; }
inline bool storedLoops() { return storedLoop; }
inline const char* storedSlugAt(uint8_t i) {
  return i < storedCount ? stored[i] : "";
}
inline bool varianceOn() { return varianceEnabled; }
inline uint8_t varianceCueIdx() { return varianceCue; }
inline uint8_t varianceParamIdx() { return varianceParam; }
inline bool varianceRolledOk() { return varianceHasRoll; }
inline uint16_t varianceValue() { return varianceRolled; }

}  // namespace PatternflowShow
