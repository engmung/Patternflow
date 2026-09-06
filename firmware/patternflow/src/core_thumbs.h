// ═══════════════════════════════════════════════════════════
// PatternFlow - thumbnails: what a pattern looks like, before it is loaded
//
// Browsing with K4 used to load every module the knob passed over, and a
// module's cost is its own setup(): 10 ms for a light one, 2.3 s for
// "Branched flow", 2.9 s for "Two-stream". The loop stood still for that
// long, the encoder kept counting, and when the loop came back the detents
// landed all at once - a panel that freezes for two seconds and then jumps
// five patterns. Measured 2026-09-06, and it was the whole of "the knob lags".
//
// So SELECT no longer loads what it merely passes; it shows a picture. The
// picture is the panel-sized frame the pattern last drew: 128×64 in RGB565,
// 16 KB, taken off the canvas when the pattern is left after it has run for
// a few seconds, kept in PSRAM (8 MB of it sits idle; forty patterns are
// 640 KB) and written beside the module as /patterns/<slug>.thumb so it is
// there again after a reboot. A pattern nobody has played yet has no
// picture and shows nothing but its name until it has - the first slow
// pass through the list is what builds the set.
//
// Deliberately a still. A moving preview would mean running the pattern,
// and running it is the cost this exists to avoid. The canvas is captured
// BEFORE gamma, white balance and saturation, and painted back through the
// same present() every pattern goes through, so the thumbnail looks exactly
// like the pattern did.
//
// This header owns the pictures only. When to take one (the pattern has to
// have run, and the canvas has to hold IT rather than another thumbnail) is
// the sketch's decision, next to the SELECT loop that has that context.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <FFat.h>
#include <string.h>

#include "core_canvas.h"
#include "core_mem.h"

namespace PFThumbs {

constexpr int W = PFCanvas::W;
constexpr int H = PFCanvas::H;
constexpr size_t PIXELS = (size_t)W * H;
constexpr size_t BYTES = PIXELS * 2;   // RGB565
// Beside the modules (pattern_registry.h MODULE_DIR), and a slug is bounded
// the way module names are (MODULE_NAME_BYTES). Spelled out here rather than
// included, so this header depends on the canvas and nothing above it.
constexpr const char* DIR = "/patterns";
constexpr size_t SLUG_BYTES = 40;
constexpr int MAX_SLOTS = 96;

// File: "PFT1", width, height (little-endian u16 each), then W*H RGB565.
constexpr uint8_t MAGIC[4] = {'P', 'F', 'T', '1'};
constexpr size_t HEADER_BYTES = 8;

struct Slot {
  char slug[SLUG_BYTES];
  uint16_t* px;        // PSRAM, or null until captured or read
  bool diskChecked;    // the file has been looked for once this boot
  bool savedThisBoot;  // written once per boot; leaving a pattern twice does not rewrite it
};

// The slot table lives in PSRAM too: internal RAM is what the console is
// made of, and ninety-six slugs are 4 KB of it.
inline Slot* slots = nullptr;
inline int slotCount = 0;
inline uint32_t captures = 0;
inline uint32_t reads = 0;

inline void pathFor(const char* slug, char* out, size_t n) {
  snprintf(out, n, "%s/%s.thumb", DIR, slug);
}

inline Slot* find(const char* slug) {
  for (int i = 0; i < slotCount; i++) {
    if (strcmp(slots[i].slug, slug) == 0) return &slots[i];
  }
  return nullptr;
}

inline Slot* slotFor(const char* slug) {
  if (!slug || !slug[0]) return nullptr;
  Slot* s = find(slug);
  if (s) return s;
  if (!slots) slots = static_cast<Slot*>(PFMem::alloc(sizeof(Slot) * MAX_SLOTS));
  if (!slots || slotCount >= MAX_SLOTS) return nullptr;
  s = &slots[slotCount++];
  memset(s, 0, sizeof(*s));
  snprintf(s->slug, SLUG_BYTES, "%s", slug);
  return s;
}

inline bool ensurePixels(Slot& s) {
  if (!s.px) s.px = static_cast<uint16_t*>(PFMem::alloc(BYTES));
  return s.px != nullptr;
}

inline bool readFromDisk(Slot& s) {
  char path[64];
  pathFor(s.slug, path, sizeof(path));
  // exists() first: opening a missing file logs an error from the VFS layer,
  // and most patterns have no picture until they have been played.
  if (!FFat.exists(path)) return false;
  File f = FFat.open(path, FILE_READ);
  if (!f) return false;
  uint8_t hdr[HEADER_BYTES];
  bool ok = f.read(hdr, HEADER_BYTES) == HEADER_BYTES &&
            memcmp(hdr, MAGIC, sizeof(MAGIC)) == 0 &&
            (hdr[4] | (hdr[5] << 8)) == W && (hdr[6] | (hdr[7] << 8)) == H;
  if (ok && ensurePixels(s)) ok = f.read(reinterpret_cast<uint8_t*>(s.px), BYTES) == BYTES;
  f.close();
  if (ok) reads++;
  return ok;
}

inline bool writeToDisk(Slot& s) {
  char path[64];
  pathFor(s.slug, path, sizeof(path));
  File f = FFat.open(path, FILE_WRITE);
  if (!f) return false;
  const uint8_t hdr[HEADER_BYTES] = {MAGIC[0], MAGIC[1], MAGIC[2], MAGIC[3],
                                     (uint8_t)W, (uint8_t)(W >> 8), (uint8_t)H, (uint8_t)(H >> 8)};
  bool ok = f.write(hdr, HEADER_BYTES) == HEADER_BYTES &&
            f.write(reinterpret_cast<const uint8_t*>(s.px), BYTES) == BYTES;
  f.close();
  return ok;
}

// The picture for a slug, or null when nobody has taken one. The volume is
// consulted once per slug per boot; after that it is the PSRAM copy or nothing.
inline const uint16_t* get(const char* slug) {
  Slot* s = slotFor(slug);
  if (!s) return nullptr;
  if (!s->px && !s->diskChecked) {
    s->diskChecked = true;
    if (!readFromDisk(*s) && s->px) {
      free(s->px);
      s->px = nullptr;
    }
  }
  return s->px;
}

// Take what is on the canvas right now as `slug`'s picture. Written to the
// volume the first time per boot (about 16 KB, a few tens of milliseconds
// on the loop task, once per pattern), refreshed in PSRAM every time.
inline bool capture(const char* slug, bool volumeMounted) {
  Slot* s = slotFor(slug);
  if (!s || !ensurePixels(*s)) return false;
  const uint8_t* src = PFCanvas::buffer;
  for (size_t i = 0; i < PIXELS; i++) {
    const uint8_t r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
    s->px[i] = (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
  }
  s->diskChecked = true;
  captures++;
  if (volumeMounted && !s->savedThisBoot) s->savedThisBoot = writeToDisk(*s);
  return true;
}

// Paint a picture into the canvas. The caller presents it, the way a
// pattern's draw() would, so it goes through the same gamma and clamp.
inline void paint(const uint16_t* px) {
  uint8_t* dst = PFCanvas::buffer;
  for (size_t i = 0; i < PIXELS; i++) {
    const uint16_t p = px[i];
    dst[i * 3]     = (uint8_t)((((p >> 11) & 0x1F) * 255) / 31);
    dst[i * 3 + 1] = (uint8_t)((((p >> 5) & 0x3F) * 255) / 63);
    dst[i * 3 + 2] = (uint8_t)(((p & 0x1F) * 255) / 31);
  }
}

// A module is gone: its picture goes with it, on the volume and in PSRAM.
// The slot stays (slugs are few) and will look at the volume again if the
// same slug is ever installed back.
inline void forget(const char* slug) {
  if (Slot* s = find(slug)) {
    if (s->px) free(s->px);
    s->px = nullptr;
    s->diskChecked = false;
    s->savedThisBoot = false;
  }
  char path[64];
  pathFor(slug, path, sizeof(path));
  if (FFat.exists(path)) FFat.remove(path);
}

// The volume was formatted: every file is gone, so every copy is stale.
inline void forgetAll() {
  for (int i = 0; i < slotCount; i++) {
    if (slots[i].px) free(slots[i].px);
  }
  slotCount = 0;
}

}  // namespace PFThumbs
