#pragma once

#include <FFat.h>
#include <FS.h>

#include "src/core_encoders.h"
#include "src/core_module_loader.h"

// The pattern list has two halves.
//
//   PRESETS  compiled into firmware.bin, exactly as they always were. Switching
//            between them is instant and they keep working whether or not the
//            filesystem mounts.
//   MODULES  .pfm files on the FATFS partition, discovered at boot and appended
//            after the presets. This is where a pattern from the community site
//            lands — a ~6 KB upload instead of a 1 MB reflash.
//
// The hand-edited custom1..3 slots are gone: uploading a module is what they
// were for, and it no longer costs a rebuild. Their patterns live on under
// firmware/modules/. An empty region further down is still reserved for the web
// build service, which needs to compile a pattern in for devices running
// firmware older than the module loader — see CUSTOM SLOTS below.

// ── PRESETS (curated showcase, in presets/) ──
#include "presets/preset_origin.h"
#include "presets/preset_wave_saw.h"
#include "presets/preset_0510.h"
#include "presets/preset_0511.h"
#include "presets/preset_0512.h"
#include "presets/preset_0513.h"
#include "presets/preset_0514.h"
#include "presets/preset_0515_3.h"
#include "presets/preset_0515_4.h"
#include "presets/preset_0515.h"
#include "presets/preset_0518.h"
#include "presets/preset_0519_1.h"
#include "presets/preset_0520.h"
#include "presets/preset_0521.h"
#include "presets/preset_0522.h"
#include "presets/preset_0527.h"
#include "presets/preset_0528.h"
#include "presets/preset_0531.h"
#include "presets/preset_0601.h"
#include "presets/preset_0602.h"
#include "presets/preset_0628.h"
#include "presets/preset_0629.h"
#include "presets/preset_0629_2.h"
#include "presets/preset_0701.h"
#include "presets/preset_0707.h"
#include "presets/preset_0710.h"
#include "presets/preset_0712.h"
#include "presets/preset_0712_2.h"
#include "presets/preset_0713.h"
#include "presets/preset_0715.h"
#include "presets/preset_0716.h"
#include "presets/preset_0718.h"
#include "presets/preset_0719.h"
#include "presets/preset_a_big_hit.h"

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
};

#define PATTERN_ENTRY(ns) \
  { ns::NAME, ns::KNOB_LABELS, ns::setup, ns::update, ns::draw, nullptr }

// To add a pattern:
// - Module (the usual way now): build a .pfm and upload it — no rebuild.
//     python firmware/toolchain/port_preset.py <pattern.h>
//     python firmware/toolchain/build_module.py firmware/modules/<slug>
// - Preset (curated showcase): copy _TEMPLATE.h to presets/preset_<name>.h
//   ("../src/..." includes) and add a PATTERN_ENTRY in presetPatterns[].
// Pattern 1 stays Origin; modules are appended after the last preset, so
// turning back from pattern 1 reaches them.

// ── PRESETS (curated showcase) ──
PatternEntry presetPatterns[] = {
  PATTERN_ENTRY(Origin),
  PATTERN_ENTRY(WaveSaw),
  PATTERN_ENTRY(Pattern0510),
  PATTERN_ENTRY(Pattern0511),
  PATTERN_ENTRY(Pattern0512),
  PATTERN_ENTRY(Pattern0513),
  PATTERN_ENTRY(Pattern0514),
  PATTERN_ENTRY(Pattern05153),
  PATTERN_ENTRY(Pattern05154),
  PATTERN_ENTRY(Pattern0515),
  PATTERN_ENTRY(Pattern0518),
  PATTERN_ENTRY(Pattern05191),
  PATTERN_ENTRY(Pattern0520),
  PATTERN_ENTRY(Pattern0521),
  PATTERN_ENTRY(Pattern0522),
  PATTERN_ENTRY(Pattern0527),
  PATTERN_ENTRY(Pattern0528),
  PATTERN_ENTRY(Pattern0531),
  PATTERN_ENTRY(Pattern0601),
  PATTERN_ENTRY(Pattern0602),
  PATTERN_ENTRY(RetroDigitalTapestry),
  PATTERN_ENTRY(ChromaticAberrationVortexPattern),
  PATTERN_ENTRY(VectorFieldParticleFlowPattern),
  PATTERN_ENTRY(LissajousWeave),
  PATTERN_ENTRY(UntitledPattern),
  PATTERN_ENTRY(TileWaves),
  PATTERN_ENTRY(MidsummerSea),
  PATTERN_ENTRY(BreakoutArcade),
  PATTERN_ENTRY(FireflyHollow),
  PATTERN_ENTRY(PoincareSphere),
  PATTERN_ENTRY(TriMarch),
  PATTERN_ENTRY(WarpedWave),
  PATTERN_ENTRY(MagVortex),
  PATTERN_ENTRY(PatternABigHit),
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
constexpr int MAX_MODULE_PATTERNS = 48;
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

  if (patterns && moduleNames && modulePaths) {
    moduleCapacity = MAX_MODULE_PATTERNS;
    return true;
  }

  Serial.println("[PATTERNS] no PSRAM for the module list - presets only");
  free(patterns);
  free(moduleNames);
  free(modulePaths);
  moduleNames = nullptr;
  modulePaths = nullptr;
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
// own generated file and this runs once per module at boot.
inline void readSidecarName(const char* modulePath, char* out, size_t outSize) {
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
  if (key < 0) return;
  int colon = json.indexOf(':', key + 6);
  int open = colon < 0 ? -1 : json.indexOf('"', colon + 1);
  int close = open < 0 ? -1 : json.indexOf('"', open + 1);
  if (open < 0 || close <= open + 1) return;
  snprintf(out, outSize, "%s", json.substring(open + 1, close).c_str());
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
  FFat.end();
  moduleStorageMounted = false;
  bool ok = FFat.format(true, (char*)"ffat");
  Serial.printf("[PATTERNS] format %s\n", ok ? "OK" : "FAILED");
  if (ok) mountModuleStorage();
  return ok && moduleStorageMounted;
}

inline void scanModules() {
  numModules = 0;
  if (moduleCapacity == 0) return;
  if (!mountModuleStorage()) return;

  File directory = FFat.open(MODULE_DIR);
  if (!directory || !directory.isDirectory()) {
    Serial.printf("[PATTERNS] no %s directory - presets only\n", MODULE_DIR);
    return;
  }

  for (File file = directory.openNextFile(); file; file = directory.openNextFile()) {
    if (file.isDirectory() || numModules >= moduleCapacity) {
      file.close();
      continue;
    }
    String path = file.path();
    file.close();
    if (!path.endsWith(".pfm")) continue;

    const int slot = numModules;
    snprintf(modulePaths[slot], MODULE_PATH_BYTES, "%s", path.c_str());

    char slug[MODULE_NAME_BYTES];
    const char* filename = strrchr(modulePaths[slot], '/');
    snprintf(slug, sizeof(slug), "%s", filename ? filename + 1 : modulePaths[slot]);
    char* extension = strrchr(slug, '.');
    if (extension) *extension = '\0';

    displayNameFromSlug(slug, moduleNames[slot], MODULE_NAME_BYTES);
    readSidecarName(modulePaths[slot], moduleNames[slot], MODULE_NAME_BYTES);
    numModules++;
  }
  directory.close();

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
