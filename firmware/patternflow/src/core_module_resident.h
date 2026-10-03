// ═══════════════════════════════════════════════════════════
// PatternFlow - modules that stay loaded when another pattern takes over
//
// A compiled-in preset is set up once at boot and resumes on every visit. A
// .pfm module used to be unloaded the moment anything else took the panel, so
// coming back to it cost a whole load: the FAT read (16-44 ms), relocation,
// constructors and the module's own setup(). For most of the catalogue that is
// 25-100 ms; for Branched Flow it is 3.3 s, Two Stream 4.1 s, Burgers and Wave
// Cascade 0.6 s each - all of it setup() (measured 2026-10-03, two boards).
//
// It had to be that way while a module needed internal RAM to exist: the
// console, Wi-Fi and lwIP live on the same few tens of kilobytes. Since 2026-10
// a module's code runs from PSRAM (core_module_memory.h), and with its data
// placed there too the whole module lives in memory nothing else is short of.
// So a module that has run is PARKED when another pattern takes over: the
// loader moves its bookkeeping into a slot here and frees nothing, and picking
// it again moves the slot back - no read, no relocation, no constructors, no
// setup(). It carries on from its own state, which is what a preset does.
//
// This file is the bookkeeping only: the slots, finding one by path, which is
// least recently used, and parking, taking and evicting over a release
// function the caller supplies. It knows nothing about ELF sections or heaps,
// so it compiles on a PC and the host suite drives it
// (firmware/toolchain/tests/resident_test.cpp). What a parked module IS, and
// when one may be parked at all, is the loader's business
// (core_module_loader.h, "Staying loaded").
//
// ── Who may touch the table ─────────────────────────────────────────
//
// Exactly one task at a time, and never by a lock: by the same hand-off the
// asynchronous loader already uses (pattern_registry.h, "Loading without
// stopping the frame").
//
//   the loop task (Core 1)    while loadInFlight is false
//   the pf-load worker (Core 0)  from the loop's release-store of
//                             loadInFlight = true (and the notify) until the
//                             worker's own release-store of loadFinished = true
//
// The loop does not look at the table again until it has acquired
// loadFinished and adopted the result, so the worker's writes happen-before
// the loop's next read. HTTP handlers run on the network task and never touch
// the table: whatever they need done - evicting everything when the storage
// changes - is handed to the loop at the frame boundary through PFLoopSync,
// which only runs it once tryFinishAsyncLoad() says no load is in flight. A
// file written from the network task without that moves one counter, the
// loader's storageGeneration, with an atomic add; the owner reads it and does
// the evicting.
//
// That rests on one more invariant, because a module can reach the table on
// its own through api->alloc() (the loader evicts the oldest parked module
// when PSRAM says no): module code runs on the loop only while the registry
// names it active, and the registry names nothing active for the whole of a
// load - the loop draws the incoming pattern's thumbnail instead. So a module
// running on the loop means no load is in flight, and a module running on the
// worker means one is: whichever task calls into a module owns the table.
//
// /api/status reads `count`, `bytes`, `resumes` and `evictions` from the
// network task. Each is one aligned word written only by the owner, so a
// reader sees a whole value, at worst one change late. The slots themselves
// are never read from there.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <new>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace PFModuleResident {

// The registry's MODULE_PATH_BYTES; pattern_registry.h asserts they agree. A
// path that does not fit whole is never parked: a cut key could name another
// file.
constexpr size_t PATH_BYTES = 72;

// Module: what the loader keeps per parked module, plain data.
// Capacity: slots. 0 compiles a table that never parks anything.
// Allocate: where the slots come from, once, on the first park. Called with
//   the bytes for every slot; nullptr means there is no table this time, and
//   the caller unloads as it would have without one.
// Release: frees exactly what unloading that module would have freed. The
//   table calls it on eviction and never otherwise.
template <class Module, int Capacity, void* (*Allocate)(size_t), void (*Release)(Module&)>
class Table {
 public:
  struct Slot {
    bool used;
    uint32_t stamp;   // last use, from `clock`; the smallest is evicted first
    uint32_t held;    // bytes the owner said the module holds, for /api/status
    char path[PATH_BYTES];
    Module module;
  };

  // Read from other tasks; see the header.
  uint32_t count = 0;
  uint32_t bytes = 0;
  uint32_t resumes = 0;
  uint32_t evictions = 0;

  static constexpr int capacity() { return Capacity > 0 ? Capacity : 0; }
  bool allocated() const { return slots != nullptr; }

  int find(const char* path) const {
    if (!slots || !path) return -1;
    for (int i = 0; i < capacity(); ++i) {
      if (slots[i].used && strcmp(slots[i].path, path) == 0) return i;
    }
    return -1;
  }
  bool has(const char* path) const { return find(path) >= 0; }

  // The module parked under `path`, to look at and not to keep: the pointer
  // is good until the table next changes. nullptr when there is none.
  const Module* peek(const char* path) const {
    const int at = find(path);
    return at < 0 ? nullptr : &slots[at].module;
  }

  // The least recently used slot that is not `keep`, or -1.
  int oldest(const char* keep = nullptr) const {
    if (!slots) return -1;
    int best = -1;
    for (int i = 0; i < capacity(); ++i) {
      if (!slots[i].used) continue;
      if (keep && strcmp(slots[i].path, keep) == 0) continue;
      if (best < 0 || slots[i].stamp < slots[best].stamp) best = i;
    }
    return best;
  }

  // Park the module `fill` writes into the slot, under `path`. False when it
  // cannot be kept - no capacity, no table, a path too long to key on, or a
  // full table whose only resident is `keep` - and then nothing has been
  // taken from the caller: it still owns its module and unloads it.
  //
  // `keep` is the module about to be resumed. Parking the outgoing one into a
  // full table evicts the least recently used, and that must not be the one
  // the caller is about to take back.
  //
  // A path that is already parked is a stale copy of the same file (the
  // registry never parks a module it could have resumed, so this does not
  // happen in ordinary use): it is evicted, and the module being parked now
  // replaces it. One slot per path, always, or find() would be a guess.
  template <class Fill>
  bool park(const char* path, uint32_t held, Fill fill, const char* keep = nullptr) {
    if (capacity() == 0 || !path || !path[0] || strlen(path) >= PATH_BYTES) return false;
    if (!ensure()) return false;
    const int stale = find(path);
    if (stale >= 0) evict(stale);
    int at = freeSlot();
    if (at < 0) {
      at = oldest(keep);
      if (at < 0) return false;
      evict(at);
    }
    Slot& slot = slots[at];
    fill(slot.module);
    memcpy(slot.path, path, strlen(path) + 1);
    slot.held = held;
    // A counter, not millis(): two parks in one millisecond (a knob spun
    // through presets) must still be ordered, and it never wraps in practice -
    // four billion switches.
    slot.stamp = ++clock;
    slot.used = true;
    ++count;
    bytes += held;
    return true;
  }

  // Hand the module parked under `path` to `drain` and forget it: from here
  // the caller owns it again. False when nothing is parked under that path.
  template <class Drain>
  bool take(const char* path, Drain drain) {
    const int at = find(path);
    if (at < 0) return false;
    drain(slots[at].module);
    vacate(at);
    ++resumes;
    return true;
  }

  bool evictOldest(const char* keep = nullptr) {
    const int at = oldest(keep);
    if (at < 0) return false;
    evict(at);
    return true;
  }

  int evictAll() {
    int evicted = 0;
    for (int i = 0; i < capacity() && slots; ++i) {
      if (!slots[i].used) continue;
      evict(i);
      ++evicted;
    }
    return evicted;
  }

  // Least recently used first, until `enough()` or nothing is parked.
  template <class Enough>
  int evictUntil(Enough enough) {
    int evicted = 0;
    while (count && !enough() && evictOldest()) ++evicted;
    return evicted;
  }

  // Every parked module `doomed(module)` says must go. The loader's test is
  // "loaded before the pattern storage last changed".
  template <class Doomed>
  int evictIf(Doomed doomed) {
    int evicted = 0;
    for (int i = 0; i < capacity() && slots; ++i) {
      if (!slots[i].used || !doomed(static_cast<const Module&>(slots[i].module))) continue;
      evict(i);
      ++evicted;
    }
    return evicted;
  }

 private:
  Slot* slots = nullptr;
  uint32_t clock = 0;

  bool ensure() {
    if (slots) return true;
    void* raw = Allocate(sizeof(Slot) * (size_t)capacity());
    if (!raw) return false;
    slots = static_cast<Slot*>(raw);
    for (int i = 0; i < capacity(); ++i) new (&slots[i]) Slot();
    return true;
  }

  int freeSlot() const {
    for (int i = 0; i < capacity(); ++i) {
      if (!slots[i].used) return i;
    }
    return -1;
  }

  // The slot forgets the module; it frees nothing. A vacated slot holds no
  // pointers, so nothing can ever be released through it twice.
  void vacate(int at) {
    Slot& slot = slots[at];
    if (count) --count;
    bytes = slot.held >= bytes ? 0 : bytes - slot.held;
    slot = Slot();
  }

  void evict(int at) {
    Release(slots[at].module);
    vacate(at);
    ++evictions;
  }
};

}  // namespace PFModuleResident
