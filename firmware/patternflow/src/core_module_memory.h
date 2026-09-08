// Module allocations may use internal RAM only while preserving service room.
// This governs module-owned allocations, not allocations by Wi-Fi or features.
//
// One internal heap serves both jobs on the S3: EXEC|INTERNAL|32BIT and
// INTERNAL|8BIT name the same D/IRAM, so an executable allocation reduces the
// very number the reserve is measured against. Two rules follow:
//
//   The reserve PLACES data; it never refuses it. Data has PSRAM to fall back
//   on, so a data section that will not fit internally moves - it does not
//   fail a load.
//
//   Code is PRICED, once, for the whole module, from its section headers,
//   before anything is allocated. .text is the only part with no second home,
//   so it is the only thing admission can honestly be about - and it must be
//   charged its own size.
//
// Both rules were broken. The previous policy refused an executable allocation
// whenever total free was under the reserve WITHOUT looking at the requested
// size, and code() had no fallback, so a 2 KB .text was refused exactly as hard
// as a 200 KB one: a module rejected while the RAM it needed sat unused. Each
// data section was also tested independently against one floor, so N sections
// that each "fit" crossed it together, and the outcome depended on the order
// the sections happened to be walked. Finally it allocated first and rolled
// back after - dipping the heap under the reserve, on the network core, to
// discover whether it was allowed to, which is the exact condition the reserve
// exists to prevent.
#pragma once
#include <esp_heap_caps.h>
#include <stdint.h>
#include <stddef.h>

#ifndef PF_MODULE_INTERNAL_RESERVE
#define PF_MODULE_INTERNAL_RESERVE 24576
#endif
#ifndef PF_MODULE_DATA_INTERNAL_MAX
#define PF_MODULE_DATA_INTERNAL_MAX 16384
#endif
#ifndef PF_MODULE_RUNTIME_MAX_BYTES
#define PF_MODULE_RUNTIME_MAX_BYTES (4u * 1024u * 1024u)
#endif

namespace PFModuleMemory {
constexpr uint32_t internalData = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
constexpr uint32_t internalCode =
    MALLOC_CAP_EXEC | MALLOC_CAP_INTERNAL | MALLOC_CAP_32BIT;
constexpr uint32_t externalData = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;

inline uint32_t refusals = 0;

// Internal bytes this load may still place in data sections: what the reserve
// leaves after the module's executable image is priced. Zero outside a load,
// so setup()'s api->alloc() and the temporary ELF image stay PSRAM-first.
inline size_t dataBudget = 0;

inline bool fits(size_t bytes, size_t available, size_t reserve = 0) {
  return bytes && reserve <= available && bytes <= available - reserve;
}

inline size_t serviceFree() { return heap_caps_get_free_size(internalData); }

// What a module may take from internal RAM without pushing the services under
// the reserve. Nothing is held; this is the one number every decision inside a
// load is made against, and /api/status publishes it.
inline size_t budget() {
  const size_t free = serviceFree();
  const size_t reserve = (size_t)PF_MODULE_INTERNAL_RESERVE;
  return free > reserve ? free - reserve : 0;
}

// One allocation out of the service pool, charged its own size against live
// free BEFORE it is attempted. Total space and a contiguous block both matter.
inline void* internal(size_t bytes, uint32_t caps, bool zero = false) {
  if (!fits(bytes, serviceFree(), (size_t)PF_MODULE_INTERNAL_RESERVE)) return nullptr;
  if (bytes > heap_caps_get_largest_free_block(caps)) return nullptr;
  return zero ? heap_caps_calloc(1, bytes, caps) : heap_caps_malloc(bytes, caps);
}

// Never let the running total wrap: a data section may reach the internal heap
// through the PSRAM-refused fallback without having been budgeted for.
inline void spend(size_t bytes) {
  dataBudget = bytes >= dataBudget ? 0 : dataBudget - bytes;
}

// Whole-module admission, called once from load() before any section is
// placed. codeBytes is the SUM of the module's executable sections, taken from
// the section headers, so the verdict is a property of the module and not of
// the order its sections happen to be walked in.
inline bool admitCode(size_t codeBytes) {
  const size_t room = budget();
  dataBudget = codeBytes > room ? 0 : room - codeBytes;
  return codeBytes <= room;
}
inline void endLoad() { dataBudget = 0; }

inline void* data(size_t bytes, bool zero, bool preferExternal) {
  if (!bytes) return nullptr;
  void* p = nullptr;
  // The budget decides WHERE, never WHETHER. Past it the section goes to
  // PSRAM, and if PSRAM refuses, the reserve-checked internal heap is still
  // tried - so data can lose its placement but can never fail a load alone.
  if (!preferExternal && bytes <= dataBudget) {
    p = internal(bytes, internalData, zero);
    if (p) spend(bytes);
  }
  if (!p) {
    p = zero ? heap_caps_calloc(1, bytes, externalData)
             : heap_caps_malloc(bytes, externalData);
  }
  if (!p) {
    p = internal(bytes, internalData, zero);
    if (p) spend(bytes);
  }
  if (!p) ++refusals;
  return p;
}

inline void* code(size_t bytes) {
  void* p = internal(bytes, internalCode);
  if (!p) ++refusals;
  return p;
}
} // namespace PFModuleMemory
