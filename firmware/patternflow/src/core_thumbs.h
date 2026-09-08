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
#include <esp_heap_caps.h>

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
  bool savePending;
  uint32_t generation; // invalidates an I/O result after deletion/reinstallation
};

// The slot table lives in PSRAM too: internal RAM is what the console is
// made of, and ninety-six slugs are 4 KB of it.
inline Slot* slots = nullptr;
inline int slotCount = 0;
inline uint32_t captures = 0;
inline uint32_t reads = 0;
inline uint32_t writes = 0;
inline uint32_t ioMaxUs = 0;
inline uint32_t captureMaxUs = 0;
inline uint32_t nextGeneration = 0;

// One immutable job, at most one extra frame of PSRAM. The loop owns the
// cache and submits snapshots; the existing network task owns disk I/O.
// No extra task/stack and no lock held across a file read or write.
enum IoState : uint8_t { IO_IDLE, IO_PENDING, IO_RUNNING, IO_DONE };
inline uint8_t ioState = IO_IDLE;
struct IoJob {
  Slot* slot;
  uint32_t generation;
  char path[64];
  uint16_t* px;
  bool write;
  bool ok;
};
inline IoJob io{};

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
  // Pictures are expendable. Never spend the console's internal heap when
  // PSRAM is unavailable or full just to keep a browsing thumbnail.
  if (!slots) slots = static_cast<Slot*>(
      heap_caps_calloc(MAX_SLOTS, sizeof(Slot), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!slots || slotCount >= MAX_SLOTS) return nullptr;
  s = &slots[slotCount++];
  // A formatted volume can reuse a slot while an old job still holds its
  // address. Keep generation atomic even during reuse.
  s->px = nullptr;
  s->diskChecked = false;
  s->savedThisBoot = false;
  s->savePending = false;
  snprintf(s->slug, SLUG_BYTES, "%s", slug);
  __atomic_store_n(&s->generation, ++nextGeneration, __ATOMIC_RELEASE);
  return s;
}

inline bool ensurePixels(Slot& s) {
  if (!s.px) s.px = static_cast<uint16_t*>(
      heap_caps_malloc(BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  return s.px != nullptr;
}

inline bool readFromDisk(IoJob& job) {
  // exists() first: opening a missing file logs an error from the VFS layer,
  // and most patterns have no picture until they have been played.
  if (!FFat.exists(job.path)) return false;
  File f = FFat.open(job.path, FILE_READ);
  if (!f) return false;
  uint8_t hdr[HEADER_BYTES];
  bool ok = f.read(hdr, HEADER_BYTES) == HEADER_BYTES &&
            memcmp(hdr, MAGIC, sizeof(MAGIC)) == 0 &&
            (hdr[4] | (hdr[5] << 8)) == W && (hdr[6] | (hdr[7] << 8)) == H;
  if (ok) ok = f.read(reinterpret_cast<uint8_t*>(job.px), BYTES) == BYTES;
  f.close();
  return ok;
}

inline bool writeToDisk(const IoJob& job) {
  File f = FFat.open(job.path, FILE_WRITE);
  if (!f) return false;
  const uint8_t hdr[HEADER_BYTES] = {MAGIC[0], MAGIC[1], MAGIC[2], MAGIC[3],
                                     (uint8_t)W, (uint8_t)(W >> 8), (uint8_t)H, (uint8_t)(H >> 8)};
  bool ok = f.write(hdr, HEADER_BYTES) == HEADER_BYTES &&
            f.write(reinterpret_cast<const uint8_t*>(job.px), BYTES) == BYTES;
  f.close();
  return ok;
}

// Network task only, between HTTP requests. Deletion/format handlers run
// on this same task: a stale queued save cannot recreate a deleted file.
inline void serviceDisk() {
  uint8_t pending = IO_PENDING;
  if (!__atomic_compare_exchange_n(&ioState, &pending, IO_RUNNING, false,
                                   __ATOMIC_ACQ_REL, __ATOMIC_ACQUIRE)) return;
  const uint32_t started = micros();
  io.ok = false;
  if (__atomic_load_n(&io.slot->generation, __ATOMIC_ACQUIRE) == io.generation)
    io.ok = io.write ? writeToDisk(io) : readFromDisk(io);
  const uint32_t elapsed = micros() - started;
  if (elapsed > ioMaxUs) ioMaxUs = elapsed;
  __atomic_store_n(&ioState, IO_DONE, __ATOMIC_RELEASE);
}

// Loop task only. A completed read becomes visible between frames. A
// captured newer picture always wins over a read already in flight.
inline void collectIO() {
  if (__atomic_load_n(&ioState, __ATOMIC_ACQUIRE) != IO_DONE) return;
  Slot& s = *io.slot;
  if (s.generation == io.generation) {
    if (io.write) {
      s.savedThisBoot = io.ok;
      if (io.ok) {
        s.savePending = false;
        writes++;
      }
    } else {
      s.diskChecked = true;
      if (io.ok && !s.px) {
        s.px = io.px;
        io.px = nullptr;
        reads++;
      }
    }
  }
  free(io.px);
  io = {};
  __atomic_store_n(&ioState, IO_IDLE, __ATOMIC_RELEASE);
}

inline bool queueIO(Slot& s, bool write) {
  if (__atomic_load_n(&ioState, __ATOMIC_ACQUIRE) != IO_IDLE) return false;
  uint16_t* px = static_cast<uint16_t*>(
      heap_caps_malloc(BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!px) return false;
  if (write) memcpy(px, s.px, BYTES);
  io.slot = &s;
  io.generation = s.generation;
  pathFor(s.slug, io.path, sizeof(io.path));
  io.px = px;
  io.write = write;
  io.ok = false;
  __atomic_store_n(&ioState, IO_PENDING, __ATOMIC_RELEASE);
  return true;
}

inline void service() {
  collectIO();
  for (int i = 0; i < slotCount; ++i) {
    Slot& s = slots[i];
    if (s.savePending && !s.savedThisBoot && s.px && queueIO(s, true)) {
      s.savePending = false;
      return;
    }
  }
}

// The picture for a slug, or null when nobody has taken one. The volume is
// consulted once per slug per boot; after that it is the PSRAM copy or nothing.
inline const uint16_t* get(const char* slug) {
  collectIO();
  Slot* s = slotFor(slug);
  if (!s) return nullptr;
  if (!s->px && !s->diskChecked) {
    queueIO(*s, false);
  }
  return s->px;
}

// Take what is on the canvas right now as `slug`'s picture. Written to the
// volume in the background, refreshed in PSRAM every time. Capture never
// opens a file: entering SELECT or switching patterns only copies pixels.
inline bool capture(const char* slug, bool volumeMounted) {
  const uint32_t started = micros();
  collectIO();
  Slot* s = slotFor(slug);
  if (!s || !ensurePixels(*s)) return false;
  const uint8_t* src = PFCanvas::buffer;
  for (size_t i = 0; i < PIXELS; i++) {
    const uint8_t r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
    s->px[i] = (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
  }
  s->diskChecked = true;
  captures++;
  if (volumeMounted && !s->savedThisBoot) s->savePending = true;
  const uint32_t elapsed = micros() - started;
  if (elapsed > captureMaxUs) captureMaxUs = elapsed;
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
  PFLoopSync::run([&] {
  if (Slot* s = find(slug)) {
    __atomic_store_n(&s->generation, ++nextGeneration, __ATOMIC_RELEASE);
    if (s->px) free(s->px);
    s->px = nullptr;
    s->diskChecked = false;
    s->savedThisBoot = false;
    s->savePending = false;
  }
  });
  char path[64];
  pathFor(slug, path, sizeof(path));
  if (FFat.exists(path)) FFat.remove(path);
}

// The volume was formatted: every file is gone, so every copy is stale.
inline void forgetAll() {
  PFLoopSync::run([] {
  for (int i = 0; i < slotCount; i++) {
    __atomic_store_n(&slots[i].generation, ++nextGeneration, __ATOMIC_RELEASE);
    if (slots[i].px) free(slots[i].px);
    slots[i].px = nullptr;
  }
  slotCount = 0;
  });
}

}  // namespace PFThumbs
