#pragma once

#include <FFat.h>
#include <dirent.h>
#include <FS.h>

#include "src/core_encoders.h"
#include "src/core_module_loader.h"

// The pattern list has two halves, but they are no longer the same size.
//
//   PRESETS  compiled into firmware.bin. Origin alone, as the failsafe: it
//            runs whether or not the filesystem mounts, so a board with an
//            empty or broken FATFS still lights up instead of showing
//            nothing. Everything else moved out — see the note by the
//            includes below for why that is a memory decision.
//   MODULES  .pfm files on the FATFS partition, discovered at boot and appended
//            after the preset. This is where a pattern from the community site
//            lands — a ~6 KB upload instead of a 1 MB reflash — and where the
//            old showcase now lives, as a pack you drop on /patterns.
//
// The hand-edited custom1..3 slots are gone: uploading a module is what they
// were for, and it no longer costs a rebuild. Their patterns live on under
// firmware/modules/. An empty region further down is still reserved for the web
// build service, which needs to compile a pattern in for devices running
// firmware older than the module loader — see CUSTOM SLOTS below.

// ── PRESETS (the failsafe only) ──
// Origin alone is compiled in. The rest of the showcase moved out to .pfm
// modules on FATFS — their sources are still here under presets/ as the
// editable originals, and port_preset.py turns them back into modules.
//
// This is not a tidy-up, it is a memory decision. Every compiled-in preset
// costs internal DRAM, and the web console needs roughly 10 KB of internal
// heap free to send a page: with every preset of the time (34) compiled in, a 128x64 board sat
// at ~11 KB, so three extra modules — or any new feature — pushed /patterns
// into the truncated "starved send" state core_patterns_http.h describes.
// Shipping one preset and letting people choose the rest is what makes the
// console reliable, and it is why the pack/deck flow exists.
#include "presets/preset_origin.h"
// NOT in presetPatterns[] below on purpose: the calibration test card is an
// overlay the tuner summons via /api/display, never a knob-browsable pattern.
// See the header's own comment for the full story.
#include "presets/preset_calib.h"

struct PatternEntry {
  const char* name;
  const char* const* knobLabels;
  void (*setup)();
  void (*update)(float dt, const InputFrame& input);
  void (*draw)();
  // Path to a .pfm on FATFS, or nullptr for a preset compiled into this image.
  // The four members above are meaningless for a module: its code is not in
  // firmware.bin, so the loader dispatches instead.
  const char* modulePath;
  // Reachable by name, skipped by the knob. For patterns that are a
  // *state* something else switches to rather than something a person
  // browses to: the show scheduler's night face is the panel going dark,
  // not an entry in a carousel of things to look at.
  bool hidden;
  // Pattern maps the MQTT absolute 0..1000 bus via PFParams (Director /
  // Show manager). Presets declare it as ns::ABSOLUTE_READY; modules carry
  // it in their sidecar .json.
  bool absoluteReady;
};

#define PATTERN_ENTRY(ns) \
  { ns::NAME, ns::KNOB_LABELS, ns::setup, ns::update, ns::draw, nullptr, false, ns::ABSOLUTE_READY }

// Same, but skipped when browsing with the knob (see PatternEntry::hidden).
#define PATTERN_ENTRY_HIDDEN(ns) \
  { ns::NAME, ns::KNOB_LABELS, ns::setup, ns::update, ns::draw, nullptr, true, ns::ABSOLUTE_READY }

// Presets a feature brings with it (PF_FEATURE_PRESETS). Included after the
// macro above, because the list expands to PATTERN_ENTRY calls.
#include "features/feature_presets.h"

// To add a pattern:
// - Module (the usual way now): build a .pfm and upload it — no rebuild.
//     python firmware/toolchain/port_preset.py <pattern.h>
//     python firmware/toolchain/build_module.py firmware/modules/<slug>
// - Preset (curated showcase): copy _TEMPLATE.h to presets/preset_<name>.h
//   ("../src/..." includes) and add a PATTERN_ENTRY in presetPatterns[].
// Pattern 1 stays Origin; modules are appended after the last preset, so
// turning back from pattern 1 reaches them.

// ── PRESETS ──
// Pattern 1 is Origin, the failsafe: a board with an empty or unmountable
// FATFS still lights up. Everything else ships as modules — see the note by
// the includes above.
//
// Features may contribute presets of their own; the show feature brings Black,
// its night face. A build with no features has this list at Origin alone,
// which is the point: the core ships the failsafe and nothing else.
PatternEntry presetPatterns[] = {
  PATTERN_ENTRY(Origin),
  PF_FEATURE_PRESETS
};
const int NUM_PRESETS = sizeof(presetPatterns) / sizeof(presetPatterns[0]);

// ── CUSTOM SLOTS (legacy build-service path) ─────────────────────────
// Empty here by design, and not meant to be edited by hand — uploading a .pfm
// at /patterns is how a pattern gets on a device now.
//
// The web build service (web/src/lib/firmware/assemble.ts) rewrites everything
// between the two markers below to compile a submitted pattern into
// firmware.bin. That is the path for devices whose firmware predates the module
// loader: they cannot load a .pfm, so they still need a whole image. Keeping it
// alive costs these few lines and means a bug in the module path never leaves
// the community with no way to build at all.
//
// Leave the markers in place even when the region is empty. Removing them
// breaks "Send to build".
// PF_CUSTOM_SLOTS_BEGIN
#define PF_CUSTOM_SLOT_COUNT 0
// PF_CUSTOM_SLOTS_END

// ── MODULES (.pfm on FATFS) ──────────────────────────────────────────
// Names and paths need RAM because they come off the filesystem, unlike the
// preset entries which point straight at flash literals.
//
// The cap is a UX decision, not a memory one. A slot costs 136 bytes of PSRAM
// (PatternEntry 24 + name 40 + path 72) and the arrays are allocated at full
// capacity on boot whether or not the modules exist, so installing patterns is
// free at runtime: 128 slots is 17 KB out of 8 MB, and the /patterns partition
// holds ~1,500 modules at the measured median of 5.9 KB.
//
// What actually degrades first is scrolling the list on one knob (34 presets
// plus whatever is installed) and, further out, the per-module sidecar read in
// scanModules() at boot. 128 is roughly three times the whole community
// library as it stands, which is meant to be enough that nobody meets this
// number — if somebody does, raise it and fix the selection UI in the same
// breath.
constexpr int MAX_MODULE_PATTERNS = 128;
constexpr size_t MODULE_NAME_BYTES = 40;
constexpr size_t MODULE_PATH_BYTES = 72;
constexpr const char* MODULE_DIR = "/patterns";

// These three live in PSRAM, deliberately.
//
// Internal RAM is this board's scarce resource: HUB75's DMA buffers take ~150 KB
// of it at initDisplay(), and by the time the network services are up the stock
// firmware is down to ~15 KB. The web console needs a slice of that to send a
// response body — starve it and every endpoint answers with a status line and
// then hangs forever, which is exactly what a first cut of this file did by
// declaring these as plain statics (+7.3 KB).
//
// Nothing here is touched per-pixel or from an ISR: the pools are written at
// boot and read once per pattern switch, so PSRAM's extra latency is free, and
// there are 8 MB of it sitting idle.
char (*moduleNames)[MODULE_NAME_BYTES] = nullptr;
char (*modulePaths)[MODULE_PATH_BYTES] = nullptr;
int moduleCapacity = 0;
int numModules = 0;
bool moduleStorageMounted = false;

// ── The sidecar cache ────────────────────────────────────────────────
//
// Rebuilding the list after an install or a delete used to open every
// module's .json twice — once for the name, once for absoluteReady. With
// forty modules that was two seconds, and the render stopped for all of it
// (3.9.1's loopSyncMaxUs is what finally put a number on it). The two facts
// a sidecar holds are kept here by module path. Everything that writes a
// module file — upload, delete, format, the library pull — forgets the entry
// it touched, so a rebuild reads only what changed. Boot still reads them
// all, once. On a board with no PSRAM there is no cache and every rebuild
// reads, as before.
char (*sidecarPaths)[MODULE_PATH_BYTES] = nullptr;
char (*sidecarNames)[MODULE_NAME_BYTES] = nullptr;
bool* sidecarAbs = nullptr;
int sidecarCount = 0;

inline int sidecarFind(const char* path) {
  for (int i = 0; i < sidecarCount; i++) {
    if (strcmp(sidecarPaths[i], path) == 0) return i;
  }
  return -1;
}

inline void sidecarForgetPath(const char* path) {
  int i = sidecarFind(path);
  if (i < 0) return;
  int last = sidecarCount - 1;
  if (i != last) {
    snprintf(sidecarPaths[i], MODULE_PATH_BYTES, "%s", sidecarPaths[last]);
    snprintf(sidecarNames[i], MODULE_NAME_BYTES, "%s", sidecarNames[last]);
    sidecarAbs[i] = sidecarAbs[last];
  }
  sidecarCount = last;
}

// By slug, for the writers: they know the slug, the cache knows the path.
inline void sidecarForgetSlug(const char* slug) {
  char path[MODULE_PATH_BYTES];
  snprintf(path, sizeof(path), "%s/%s.pfm", MODULE_DIR, slug);
  sidecarForgetPath(path);
}

inline void sidecarForgetAll() { sidecarCount = 0; }

inline void sidecarRemember(const char* path, const char* name, bool absReady) {
  if (!sidecarPaths) return;
  int i = sidecarFind(path);
  if (i < 0) {
    if (sidecarCount >= MAX_MODULE_PATTERNS) return;
    i = sidecarCount++;
    snprintf(sidecarPaths[i], MODULE_PATH_BYTES, "%s", path);
  }
  snprintf(sidecarNames[i], MODULE_NAME_BYTES, "%s", name);
  sidecarAbs[i] = absReady;
}

// Modules have no compiled-in labels to show before they are loaded.
const char* const MODULE_KNOB_LABELS[4] = {"Knob 1", "Knob 2", "Knob 3", "Knob 4"};

// Runtime list the device cycles through: presets first (pattern 1 = Origin),
// modules appended. Call buildPatternList() once in setup() before using it.
PatternEntry* patterns = nullptr;
int NUM_PATTERNS = 0;
int activePatternIdx = -1;

// Presets-only fallback for a board with no usable PSRAM. Same size the list
// was before modules existed, so the device degrades to old behaviour rather
// than to a null dereference.
PatternEntry presetsOnlyList[sizeof(presetPatterns) / sizeof(presetPatterns[0]) +
                            PF_CUSTOM_SLOT_COUNT];

inline void* allocPreferSpiram(size_t bytes) {
  void* p = heap_caps_calloc(1, bytes, MALLOC_CAP_SPIRAM);
  return p;
}

// Returns false when only the presets will fit; the caller still has a usable
// (module-less) pattern list in that case.
inline bool allocPatternStorage() {
  if (patterns) return moduleCapacity > 0;

  patterns = static_cast<PatternEntry*>(
      allocPreferSpiram(sizeof(PatternEntry) *
                        (NUM_PRESETS + PF_CUSTOM_SLOT_COUNT + MAX_MODULE_PATTERNS)));
  moduleNames = static_cast<char(*)[MODULE_NAME_BYTES]>(
      allocPreferSpiram(MODULE_NAME_BYTES * MAX_MODULE_PATTERNS));
  modulePaths = static_cast<char(*)[MODULE_PATH_BYTES]>(
      allocPreferSpiram(MODULE_PATH_BYTES * MAX_MODULE_PATTERNS));
  sidecarPaths = static_cast<char(*)[MODULE_PATH_BYTES]>(
      allocPreferSpiram(MODULE_PATH_BYTES * MAX_MODULE_PATTERNS));
  sidecarNames = static_cast<char(*)[MODULE_NAME_BYTES]>(
      allocPreferSpiram(MODULE_NAME_BYTES * MAX_MODULE_PATTERNS));
  sidecarAbs = static_cast<bool*>(allocPreferSpiram(MAX_MODULE_PATTERNS));

  if (patterns && moduleNames && modulePaths && sidecarPaths && sidecarNames && sidecarAbs) {
    moduleCapacity = MAX_MODULE_PATTERNS;
    return true;
  }

  Serial.println("[PATTERNS] no PSRAM for the module list - presets only");
  free(patterns);
  free(moduleNames);
  free(modulePaths);
  free(sidecarPaths);
  free(sidecarNames);
  free(sidecarAbs);
  moduleNames = nullptr;
  modulePaths = nullptr;
  sidecarPaths = nullptr;
  sidecarNames = nullptr;
  sidecarAbs = nullptr;
  patterns = presetsOnlyList;
  moduleCapacity = 0;
  return false;
}

// "Cell Ripple" from "cell_ripple" — the fallback when a module ships without
// a .json sidecar carrying its real display name.
inline void displayNameFromSlug(const char* slug, char* out, size_t outSize) {
  size_t n = 0;
  bool upper = true;
  while (*slug && n + 1 < outSize) {
    char c = *slug++;
    if (c == '_' || c == '-') {
      out[n++] = ' ';
      upper = true;
    } else {
      out[n++] = (upper && c >= 'a' && c <= 'z') ? c - ('a' - 'A') : c;
      upper = false;
    }
  }
  out[n] = '\0';
}

// Deliberately a substring scan rather than a JSON parser: the sidecar is our
// own generated file. One open for both facts it holds: the display name
// (left as it was when the sidecar has none) and whether the module was
// built against the absolute-param helpers — a missing sidecar or a missing
// key both mean "no", since every module built before the bus existed is
// delta-only by definition.
inline void readSidecar(const char* modulePath, char* nameOut, size_t nameSize,
                        bool& absReady) {
  absReady = false;
  char jsonPath[MODULE_PATH_BYTES];
  snprintf(jsonPath, sizeof(jsonPath), "%s", modulePath);
  char* extension = strrchr(jsonPath, '.');
  if (!extension) return;
  snprintf(extension, sizeof(jsonPath) - (extension - jsonPath), ".json");

  File metadata = FFat.open(jsonPath, FILE_READ);
  if (!metadata) return;
  String json = metadata.readString();
  metadata.close();

  int key = json.indexOf("\"name\"");
  if (key >= 0) {
    int colon = json.indexOf(':', key + 6);
    int open = colon < 0 ? -1 : json.indexOf('"', colon + 1);
    int close = open < 0 ? -1 : json.indexOf('"', open + 1);
    if (open >= 0 && close > open + 1) {
      snprintf(nameOut, nameSize, "%s", json.substring(open + 1, close).c_str());
    }
  }

  key = json.indexOf("\"absoluteReady\"");
  if (key >= 0) {
    int colon = json.indexOf(':', key + 15);
    if (colon >= 0) {
      String tail = json.substring(colon + 1);
      tail.trim();
      absReady = tail.startsWith("true");
    }
  }
}

// The cached answer for a path the scan has just been over, reading the
// sidecar only if the cache has no room for it.
inline bool sidecarAbsFor(const char* modulePath) {
  int i = sidecarFind(modulePath);
  if (i >= 0) return sidecarAbs[i];
  char name[MODULE_NAME_BYTES];
  bool absReady = false;
  readSidecar(modulePath, name, sizeof(name), absReady);
  return absReady;
}

// Mount the partition the presets never needed. Label "ffat" is what the
// shipped partition table calls it; passing the wrong label mounts nothing and
// looks exactly like an empty filesystem.
//
// Formats only after a plain mount has already failed. Every device shipped so
// far has this partition sitting unformatted — without the fallback, modules
// would never work until the owner found some other way to format it. A volume
// that will not mount cannot be read from either, so nothing reachable is lost;
// it is still logged loudly because it does discard any .pfv clips that were
// there before the volume broke.
// One open file at a time is all this ever needs (read a module, or write an
// upload). The default of 10 buys nothing and each slot costs internal heap,
// which on this board is the scarce kind — HUB75's DMA buffers live there too.
constexpr int MODULE_FS_MAX_FILES = 2;

inline void reportHeap(const char* stage) {
  Serial.printf("[MEM] %-18s internal=%u largest=%u psram=%u\n", stage,
                (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL),
                (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
}

inline bool mountModuleStorage() {
  if (moduleStorageMounted) return true;
  moduleStorageMounted = FFat.begin(false, "/ffat", MODULE_FS_MAX_FILES, "ffat");
  if (!moduleStorageMounted) {
    Serial.println("[PATTERNS] FATFS mount failed - presets only "
                   "(format from /patterns if this persists)");
  }
  return moduleStorageMounted;
}

// The deliberate, user-initiated format. Destroys everything on the volume —
// modules AND .pfv clips — which is exactly why it only runs from an explicit
// button on /patterns and never as a fallback. An earlier revision formatted
// automatically when a mount failed; a crash mid-write corrupted the FAT, the
// next boot "helpfully" wiped it, and every installed module was lost.
inline bool formatModuleStorage() {
  sidecarForgetAll();
  FFat.end();
  moduleStorageMounted = false;
  bool ok = FFat.format(true, (char*)"ffat");
  Serial.printf("[PATTERNS] format %s\n", ok ? "OK" : "FAILED");
  if (ok) mountModuleStorage();
  return ok && moduleStorageMounted;
}

// ── Running order (/patterns/catalog.txt) ────────────────────────────
// One module slug per line, in the order the device should cycle them; a
// missing file or an unlisted module falls back to the alphabetical sort
// below. This is how a deck keeps its arrangement: the deck export writes
// the file into the pack, the /patterns page writes it on drag-reorder, and
// either way the order is data on FATFS rather than a property of filenames.
//
// Listed modules come first, in file order; unlisted ones keep their
// alphabetical order after them — a pack installed on top of an existing
// library must not scramble what was already arranged.
inline void applyCatalogOrder() {
  if (numModules < 2) return;
  char catalogPath[MODULE_PATH_BYTES];
  snprintf(catalogPath, sizeof(catalogPath), "%s/catalog.txt", MODULE_DIR);
  File catalog = FFat.open(catalogPath, FILE_READ);
  if (!catalog) return;

  int placed = 0;  // modules already moved into their catalog position
  while (catalog.available() && placed < numModules) {
    String line = catalog.readStringUntil('\n');
    line.trim();
    if (line.length() == 0 || line.startsWith("#")) continue;

    for (int i = placed; i < numModules; i++) {
      const char* filename = strrchr(modulePaths[i], '/');
      filename = filename ? filename + 1 : modulePaths[i];
      size_t stem = strlen(filename);
      const char* dot = strrchr(filename, '.');
      if (dot) stem = (size_t)(dot - filename);
      if (line.length() != (int)stem || strncmp(filename, line.c_str(), stem) != 0) {
        continue;
      }
      // Rotate [placed..i] one step right so i lands at `placed` and the
      // slots between keep their relative order.
      char name[MODULE_NAME_BYTES], path[MODULE_PATH_BYTES];
      snprintf(name, sizeof(name), "%s", moduleNames[i]);
      snprintf(path, sizeof(path), "%s", modulePaths[i]);
      for (int j = i; j > placed; j--) {
        snprintf(moduleNames[j], MODULE_NAME_BYTES, "%s", moduleNames[j - 1]);
        snprintf(modulePaths[j], MODULE_PATH_BYTES, "%s", modulePaths[j - 1]);
      }
      snprintf(moduleNames[placed], MODULE_NAME_BYTES, "%s", name);
      snprintf(modulePaths[placed], MODULE_PATH_BYTES, "%s", path);
      placed++;
      break;
    }
  }
  catalog.close();
}

inline void scanModules() {
  numModules = 0;
  if (moduleCapacity == 0) return;
  if (!mountModuleStorage()) return;

  // readdir, not File::openNextFile. The Arduino iterator opens every entry
  // it hands back in order to build a File, and on this FATFS that is ~10 ms
  // a file - with forty modules and their sidecars, most of what a rebuild
  // still cost once the sidecars were cached. A directory entry's name is
  // all the scan needs.
  char dirPath[MODULE_PATH_BYTES];
  snprintf(dirPath, sizeof(dirPath), "/ffat%s", MODULE_DIR);
  DIR* directory = opendir(dirPath);
  if (!directory) {
    Serial.printf("[PATTERNS] no %s directory - presets only\n", MODULE_DIR);
    return;
  }

  for (struct dirent* entry = readdir(directory); entry; entry = readdir(directory)) {
    if (numModules >= moduleCapacity) break;
    if (entry->d_type == DT_DIR) continue;
    const char* name = entry->d_name;
    const size_t n = strlen(name);
    if (n < 5 || strcmp(name + n - 4, ".pfm") != 0) continue;

    const int slot = numModules;
    snprintf(modulePaths[slot], MODULE_PATH_BYTES, "%s/%s", MODULE_DIR, name);

    char slug[MODULE_NAME_BYTES];
    const char* filename = strrchr(modulePaths[slot], '/');
    snprintf(slug, sizeof(slug), "%s", filename ? filename + 1 : modulePaths[slot]);
    char* extension = strrchr(slug, '.');
    if (extension) *extension = '\0';

    displayNameFromSlug(slug, moduleNames[slot], MODULE_NAME_BYTES);
    int cached = sidecarFind(modulePaths[slot]);
    if (cached >= 0) {
      snprintf(moduleNames[slot], MODULE_NAME_BYTES, "%s", sidecarNames[cached]);
    } else {
      bool absReady = false;
      readSidecar(modulePaths[slot], moduleNames[slot], MODULE_NAME_BYTES, absReady);
      sidecarRemember(modulePaths[slot], moduleNames[slot], absReady);
    }
    numModules++;
  }
  closedir(directory);

  // FAT hands back directory entries in whatever order it likes, and the index
  // is what OSC addresses and the knob position mean — sort so a pattern keeps
  // its number across reboots.
  for (int i = 1; i < numModules; i++) {
    char name[MODULE_NAME_BYTES], path[MODULE_PATH_BYTES];
    snprintf(name, sizeof(name), "%s", moduleNames[i]);
    snprintf(path, sizeof(path), "%s", modulePaths[i]);
    int j = i - 1;
    while (j >= 0 && strcmp(modulePaths[j], path) > 0) {
      snprintf(moduleNames[j + 1], MODULE_NAME_BYTES, "%s", moduleNames[j]);
      snprintf(modulePaths[j + 1], MODULE_PATH_BYTES, "%s", modulePaths[j]);
      j--;
    }
    snprintf(moduleNames[j + 1], MODULE_NAME_BYTES, "%s", name);
    snprintf(modulePaths[j + 1], MODULE_PATH_BYTES, "%s", path);
  }

  applyCatalogOrder();

  Serial.printf("[PATTERNS] %d module(s) on FATFS\n", numModules);
}

inline void buildPatternList() {
  allocPatternStorage();
  NUM_PATTERNS = 0;
  for (int i = 0; i < NUM_PRESETS; i++) patterns[NUM_PATTERNS++] = presetPatterns[i];
#if PF_CUSTOM_SLOT_COUNT > 0
  // Present only in a build-service image; see the CUSTOM SLOTS note above.
  for (int i = 0; i < PF_CUSTOM_SLOT_COUNT; i++) patterns[NUM_PATTERNS++] = customPatterns[i];
#endif

  scanModules();
  for (int i = 0; i < numModules; i++) {
    patterns[NUM_PATTERNS++] = {
      moduleNames[i], MODULE_KNOB_LABELS, nullptr, nullptr, nullptr, modulePaths[i],
      false,  // hidden - an installed pattern is always browsable
      sidecarAbsFor(modulePaths[i]),
    };
  }
}

// Make `index` the running pattern. Presets were already set up at boot, so
// this only costs anything for a module: read the .pfm, relocate it, run its
// setup(). Returns false if a module failed to load, leaving nothing active.
inline bool activatePattern(int index) {
  if (index < 0 || index >= NUM_PATTERNS) return false;
  if (index == activePatternIdx) return true;

  const PatternEntry& entry = patterns[index];
  if (!entry.modulePath) {
    // Hand the module's executable RAM back before running a preset.
    if (PFModuleLoader::active) PFModuleLoader::unload();
    activePatternIdx = index;
    return true;
  }

  if (!PFModuleLoader::load(FFat, entry.modulePath)) {
    Serial.printf("[PATTERNS] %s failed: %s\n", entry.modulePath, PFModuleLoader::error());
    activePatternIdx = -1;
    return false;
  }
  // The loaded descriptor is authoritative; the sidecar name was only a guess
  // for the selection list.
  // Module slot, not pattern index: the list is presets, then any build-service
  // custom slots, THEN modules. Subtracting only NUM_PRESETS wrote the loaded
  // name into the wrong slot on an image that has custom slots filled — which
  // is exactly how a pattern ends up displaying somebody else's name.
  const int moduleSlot = index - (NUM_PRESETS + PF_CUSTOM_SLOT_COUNT);
  if (moduleSlot >= 0 && moduleSlot < numModules) {
    snprintf(moduleNames[moduleSlot], MODULE_NAME_BYTES, "%s", PFModuleLoader::active->name);
  }
  activePatternIdx = index;
  return true;
}

// ── Naming a pattern from outside the list ───────────────────────────
// Two callers need to talk about a pattern by something other than its index:
// MQTT (which addresses patterns by name or slug on the wire) and the sketch's
// pattern persistence (which writes a slug to NVS, because an index means a
// different pattern the moment a module is installed or deleted). These used
// to live in core_mqtt.h, which made persistence depend on MQTT being compiled
// in — they are registry knowledge, so they live with the registry.

// "/patterns/cell_ripple.pfm" -> "cell_ripple". Empty for a preset.
inline void slugFromModulePath(const char* path, char* out, size_t n) {
  if (!path || !path[0]) { out[0] = '\0'; return; }
  const char* filename = strrchr(path, '/');
  snprintf(out, n, "%s", filename ? filename + 1 : path);
  char* extension = strrchr(out, '.');
  if (extension) *extension = '\0';
}

// A module's slug, or a slugified display name for a preset (which has no file
// to take one from).
inline void patternSlugAt(int index, char* out, size_t n) {
  out[0] = '\0';
  if (index < 0 || index >= NUM_PATTERNS || !patterns) return;
  slugFromModulePath(patterns[index].modulePath, out, n);
  if (out[0]) return;
  const char* name = patterns[index].name ? patterns[index].name : "";
  size_t j = 0;
  for (size_t i = 0; name[i] && j + 1 < n; ++i) {
    char c = name[i];
    if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    if (c == ' ' || c == '-') c = '_';
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_') {
      out[j++] = c;
    }
  }
  out[j] = '\0';
}

// Exact display name, then case-insensitive display name, then slug. The order
// matters: a pattern whose name happens to match another's slug should still
// resolve to itself.
inline int findPatternByName(const char* name) {
  if (!name || !name[0] || !patterns) return -1;
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (patterns[i].name && strcmp(patterns[i].name, name) == 0) return i;
  }
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (patterns[i].name && strcasecmp(patterns[i].name, name) == 0) return i;
  }
  char slug[MODULE_NAME_BYTES];
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    slugFromModulePath(patterns[i].modulePath, slug, sizeof(slug));
    if (slug[0] && strcasecmp(slug, name) == 0) return i;
  }
  return -1;
}

inline void updateActivePattern(float dt, const InputFrame& input) {
  if (activePatternIdx < 0) return;
  const PatternEntry& entry = patterns[activePatternIdx];
  if (entry.modulePath) PFModuleLoader::update(dt, input);
  else if (entry.update) entry.update(dt, input);
}

inline void drawActivePattern() {
  if (activePatternIdx < 0) return;
  const PatternEntry& entry = patterns[activePatternIdx];
  if (entry.modulePath) PFModuleLoader::draw();
  else if (entry.draw) entry.draw();
}

#undef PATTERN_ENTRY
