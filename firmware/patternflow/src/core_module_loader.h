#pragma once

#include <Arduino.h>
#include <FS.h>
#include <esp_heap_caps.h>
#include <soc/soc_memory_layout.h>   // esp_ptr_external_ram(): where a section landed
#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#if defined(CONFIG_IDF_TARGET_ESP32S3)
#include "esp32s3/rom/cache.h"
#elif defined(CONFIG_IDF_TARGET_ESP32S2)
#include "esp32s2/rom/cache.h"
#elif defined(CONFIG_IDF_TARGET_ESP32)
#include "esp32/rom/cache.h"
#endif

#include "config.h"
#include "abi/pf_abi.h"
#include "core_canvas.h"
#include "core_module_memory.h"
#include "core_encoders.h"
#include "core_mem.h"
#include "core_module_elf.h"
#include "core_tables.h"

// Single-precision divide is a libgcc call on the S3 (its FPU does mul/add in
// hardware but not div). The double-precision set below is soft-float in full:
// nothing in a pattern needs double, but AI-written patterns reach for bare
// sin()/pow() constantly, and an unresolved symbol is a hard load failure
// rather than a slow pattern. Cheaper to carry the emulation than to reject
// half the uploads.
extern "C" {
float __divsf3(float, float);
double __adddf3(double, double);
double __subdf3(double, double);
double __muldf3(double, double);
double __divdf3(double, double);
double __extendsfdf2(float);
float __truncdfsf2(double);
double __floatsidf(int);
int __fixdfsi(double);
double __floatunsidf(unsigned int);
unsigned int __fixunsdfsi(double);
int __eqdf2(double, double);
int __nedf2(double, double);
int __ltdf2(double, double);
int __ledf2(double, double);
int __gtdf2(double, double);
int __gedf2(double, double);
int __unorddf2(double, double);
// 64-bit integer helpers. A pattern doing arithmetic on long long — a
// microsecond timestamp, a large LCG state — emits these, and the S3 has no
// 64-bit divide either.
long long __divdi3(long long, long long);
long long __moddi3(long long, long long);
unsigned long long __udivdi3(unsigned long long, unsigned long long);
unsigned long long __umoddi3(unsigned long long, unsigned long long);
long long __fixsfdi(float);
long long __fixdfdi(double);
unsigned long long __fixunssfdi(float);
unsigned long long __fixunsdfdi(double);
float __floatdisf(long long);
double __floatdidf(long long);
float __floatundisf(unsigned long long);
double __floatundidf(unsigned long long);
}

namespace PFModuleLoader {

// module.ld collapses a module to .text/.rodata/.data/.bss, so four is what
// every stock preset actually produces. The headroom is for .init_array (see
// runInitArray) and for whatever a community pattern's toolchain adds.
constexpr int MAX_SECTIONS = 8;
constexpr int MAX_MODULE_ALLOCS = 16;

struct LoadedSection {
  uint16_t index = 0;
  uint32_t elfAddress = 0;
  uint32_t size = 0;
  uint8_t* memory = nullptr;
  bool executable = false;
  bool initArray = false;
};

inline LoadedSection sections[MAX_SECTIONS];
inline int sectionCount = 0;

// Module data, executable sections and temporary ELF images use the shared
// admission policy in core_module_memory.h. Large data prefers PSRAM; every
// permitted internal fallback preserves the configured service reserve.
// Bytes of the resident module's sections in internal RAM and in PSRAM -
// /api/status reports them next to the load timing, so "this pattern ate the
// console" is a number rather than a hunch.
inline uint32_t lastInternalBytes = 0;
inline uint32_t lastPsramBytes = 0;
// Executable bytes the last module the loader priced asked for, whether or not
// it went on to load. Published beside the budget it was weighed against, so a
// refusal is arithmetic anyone can redo from the console.
inline uint32_t lastCodeBytes = 0;
inline void* moduleAllocs[MAX_MODULE_ALLOCS] = {};
inline int moduleAllocCount = 0;
inline uint32_t runtimeBytes = 0;
inline uint32_t runtimePeakBytes = 0;
inline const PFPatternModule* active = nullptr;
inline float* tableR = nullptr;
inline float* tableTheta = nullptr;
inline bool tablesReady = false;
inline char lastError[128] = {};

inline bool fail(const char* message) {
  snprintf(lastError, sizeof(lastError), "%s", message);
  Serial.printf("[MODULE] %s\n", lastError);
  return false;
}

inline LoadedSection* sectionByIndex(uint16_t index) {
  for (int i = 0; i < sectionCount; ++i) {
    if (sections[i].index == index) return &sections[i];
  }
  return nullptr;
}

// Which loaded section a relocated pointer lands in, or nullptr if it points
// outside the module image entirely — which is what a broken relocation
// actually looks like.
inline const LoadedSection* sectionContaining(const void* address) {
  const uint8_t* p = static_cast<const uint8_t*>(address);
  for (int i = 0; i < sectionCount; ++i) {
    const LoadedSection& section = sections[i];
    if (section.memory && p >= section.memory && p < section.memory + section.size) {
      return &section;
    }
  }
  return nullptr;
}

// A partial link normally keeps the SHT_INIT_ARRAY type, but match the name
// too: some toolchains hand the orphan section through as plain PROGBITS and
// silently skipping it would mean skipping a module's constructors.
inline bool isInitArraySection(const Elf32Shdr& section, const char* names,
                               size_t namesSize) {
  if (section.type == SHT_INIT_ARRAY) return true;
  const char* name = tableString(names, namesSize, section.name);
  return name && strcmp(name, ".init_array") == 0;
}

// C++ global constructors. GCC emits them as a table of function pointers in
// .init_array, and nothing in a loaded image runs that table on its own — so a
// module holding a non-trivial global (a struct with a constructor, anything
// std::) would otherwise reach setup() with the object still zeroed. Every
// stock preset is POD and links an empty .init_array; this exists for the
// arbitrary patterns people upload from the community site.
//
// Runs after relocation and after the I-cache sync, because each entry is a
// pointer into the module's freshly patched .text.
inline void runInitArray() {
  for (int i = 0; i < sectionCount; ++i) {
    if (!sections[i].initArray) continue;
    size_t count = sections[i].size / sizeof(void (*)());
    auto** constructors = reinterpret_cast<void (**)()>(sections[i].memory);
    for (size_t c = 0; c < count; ++c) {
      uintptr_t function = reinterpret_cast<uintptr_t>(constructors[c]);
      if (function == 0 || function == (uintptr_t)-1) continue;  // ld padding
      constructors[c]();
    }
  }
}

inline uintptr_t mapDefinedSymbol(const Elf32Sym& symbol) {
  LoadedSection* section = sectionByIndex(symbol.shndx);
  if (!section || symbol.value > section->size) return 0;
  return (uintptr_t)section->memory + symbol.value;
}

// A module reaching for raw malloc would take memory the loader never gets back
// on unload — a leak per pattern switch. Route the C allocators through the
// module allocator, which is freed wholesale when the module is dropped. free()
// is a no-op for the same reason unload() exists.
inline void* moduleAlloc(size_t bytes);  // defined below
inline void* pfModuleMalloc(size_t bytes) { return moduleAlloc(bytes); }
inline void* pfModuleCalloc(size_t count, size_t size) {
  if (size && count > SIZE_MAX / size) return nullptr;
  return moduleAlloc(count * size);
}
inline void pfModuleFree(void*) {}
// Report success, register nothing — see the atexit note in resolveSymbol().
inline int pfModuleAtexit(void (*)(void)) { return 0; }

#define PF_HOST_SYMBOL(name) \
  if (strcmp(symbol, #name) == 0) return (uintptr_t)(void*)(&name)

// <math.h> in C++ gives the double-named functions float/long-double overloads,
// so a bare &sin is ambiguous. Name the signature to pick the C one.
#define PF_HOST_FN(name, signature) \
  if (strcmp(symbol, #name) == 0)   \
  return (uintptr_t)(void*)static_cast<signature>(&name)

inline uintptr_t resolveHostSymbol(const char* symbol) {
  PF_HOST_SYMBOL(__divsf3);
  PF_HOST_SYMBOL(atan2f);
  PF_HOST_SYMBOL(ceilf);
  PF_HOST_SYMBOL(cosf);
  PF_HOST_SYMBOL(expf);
  PF_HOST_SYMBOL(floorf);
  PF_HOST_SYMBOL(fmaxf);
  PF_HOST_SYMBOL(fminf);
  PF_HOST_SYMBOL(fmodf);
  PF_HOST_SYMBOL(lroundf);
  PF_HOST_SYMBOL(memcpy);
  PF_HOST_SYMBOL(memset);
  PF_HOST_SYMBOL(powf);
  PF_HOST_SYMBOL(roundf);
  PF_HOST_SYMBOL(sinf);
  PF_HOST_SYMBOL(sqrtf);
  PF_HOST_SYMBOL(tanf);

  // Float libm the stock presets happen not to use.
  PF_HOST_SYMBOL(logf);
  PF_HOST_SYMBOL(log2f);
  PF_HOST_SYMBOL(log10f);
  PF_HOST_SYMBOL(exp2f);
  PF_HOST_SYMBOL(asinf);
  PF_HOST_SYMBOL(acosf);
  PF_HOST_SYMBOL(atanf);
  PF_HOST_SYMBOL(hypotf);
  PF_HOST_SYMBOL(copysignf);
  PF_HOST_SYMBOL(truncf);
  PF_HOST_SYMBOL(fabsf);
  PF_HOST_SYMBOL(cbrtf);
  PF_HOST_SYMBOL(expm1f);
  PF_HOST_SYMBOL(log1pf);
  PF_HOST_SYMBOL(ldexpf);
  PF_HOST_SYMBOL(frexpf);
  PF_HOST_SYMBOL(modff);

  // Hyperbolics. tanhf was here alone, which turns out to be the worst
  // possible subset: sech(x) = 1/cosh(x) is the closed form of a soliton, so
  // every wave/soliton/lattice pattern reaches for coshf and hit a hard load
  // failure ("unresolved symbol: coshf") that reads as the pattern being too
  // heavy for the board. It was never too heavy — it never ran.
  PF_HOST_SYMBOL(sinhf);
  PF_HOST_SYMBOL(coshf);
  PF_HOST_SYMBOL(tanhf);
  PF_HOST_SYMBOL(asinhf);
  PF_HOST_SYMBOL(acoshf);
  PF_HOST_SYMBOL(atanhf);
  PF_HOST_SYMBOL(rintf);
  PF_HOST_SYMBOL(nearbyintf);
  PF_HOST_SYMBOL(lrintf);
  PF_HOST_SYMBOL(remainderf);
  PF_HOST_SYMBOL(fdimf);
  PF_HOST_SYMBOL(scalbnf);
  PF_HOST_SYMBOL(erff);
  PF_HOST_SYMBOL(erfcf);

  // Double soft-float + libm, so a pattern written with bare sin()/pow()
  // loads instead of failing on an unresolved symbol.
  PF_HOST_SYMBOL(__adddf3);
  PF_HOST_SYMBOL(__subdf3);
  PF_HOST_SYMBOL(__muldf3);
  PF_HOST_SYMBOL(__divdf3);
  PF_HOST_SYMBOL(__extendsfdf2);
  PF_HOST_SYMBOL(__truncdfsf2);
  PF_HOST_SYMBOL(__floatsidf);
  PF_HOST_SYMBOL(__fixdfsi);
  PF_HOST_SYMBOL(__floatunsidf);
  PF_HOST_SYMBOL(__fixunsdfsi);
  PF_HOST_SYMBOL(__eqdf2);
  PF_HOST_SYMBOL(__nedf2);
  PF_HOST_SYMBOL(__ltdf2);
  PF_HOST_SYMBOL(__ledf2);
  PF_HOST_SYMBOL(__gtdf2);
  PF_HOST_SYMBOL(__gedf2);
  PF_HOST_SYMBOL(__unorddf2);
  PF_HOST_SYMBOL(__divdi3);
  PF_HOST_SYMBOL(__moddi3);
  PF_HOST_SYMBOL(__udivdi3);
  PF_HOST_SYMBOL(__umoddi3);
  PF_HOST_SYMBOL(__fixsfdi);
  PF_HOST_SYMBOL(__fixdfdi);
  PF_HOST_SYMBOL(__fixunssfdi);
  PF_HOST_SYMBOL(__fixunsdfdi);
  PF_HOST_SYMBOL(__floatdisf);
  PF_HOST_SYMBOL(__floatdidf);
  PF_HOST_SYMBOL(__floatundisf);
  PF_HOST_SYMBOL(__floatundidf);
  PF_HOST_FN(sin, double (*)(double));
  PF_HOST_FN(cos, double (*)(double));
  PF_HOST_FN(tan, double (*)(double));
  PF_HOST_FN(asin, double (*)(double));
  PF_HOST_FN(acos, double (*)(double));
  PF_HOST_FN(atan, double (*)(double));
  PF_HOST_FN(atan2, double (*)(double, double));
  PF_HOST_FN(sqrt, double (*)(double));
  PF_HOST_FN(pow, double (*)(double, double));
  PF_HOST_FN(exp, double (*)(double));
  PF_HOST_FN(log, double (*)(double));
  PF_HOST_FN(log2, double (*)(double));
  PF_HOST_FN(log10, double (*)(double));
  PF_HOST_FN(floor, double (*)(double));
  PF_HOST_FN(ceil, double (*)(double));
  PF_HOST_FN(round, double (*)(double));
  PF_HOST_FN(fmod, double (*)(double, double));
  PF_HOST_FN(fabs, double (*)(double));
  PF_HOST_FN(sinh, double (*)(double));
  PF_HOST_FN(cosh, double (*)(double));
  PF_HOST_FN(tanh, double (*)(double));
  PF_HOST_FN(asinh, double (*)(double));
  PF_HOST_FN(acosh, double (*)(double));
  PF_HOST_FN(atanh, double (*)(double));
  PF_HOST_FN(hypot, double (*)(double, double));
  PF_HOST_FN(cbrt, double (*)(double));
  PF_HOST_FN(expm1, double (*)(double));
  PF_HOST_FN(log1p, double (*)(double));

  // String/memory helpers a pattern can pull in without meaning to.
  PF_HOST_SYMBOL(memmove);
  PF_HOST_SYMBOL(memcmp);
  PF_HOST_SYMBOL(strlen);
  PF_HOST_SYMBOL(strcmp);
  PF_HOST_SYMBOL(strncmp);
  PF_HOST_SYMBOL(snprintf);

  // stdlib. A real community pattern (Rocket Flight) failed to load for want of
  // rand() alone, which is exactly the kind of one-symbol cliff worth removing
  // in bulk rather than one report at a time.
  PF_HOST_SYMBOL(rand);
  PF_HOST_SYMBOL(srand);
  PF_HOST_FN(abs, int (*)(int));
  PF_HOST_FN(labs, long (*)(long));
  PF_HOST_SYMBOL(qsort);
  PF_HOST_SYMBOL(bsearch);
  PF_HOST_SYMBOL(strtof);
  PF_HOST_SYMBOL(strtod);
  PF_HOST_SYMBOL(strtol);
  PF_HOST_SYMBOL(strtoul);
  PF_HOST_SYMBOL(atoi);
  PF_HOST_SYMBOL(atol);
  PF_HOST_SYMBOL(atof);

  // More string/ctype. Same bulk-removal rationale: a pattern parsing its own
  // little config string, or classifying characters for a text effect, should
  // not die on the device for a name this ordinary.
  PF_HOST_SYMBOL(strcpy);
  PF_HOST_SYMBOL(strncpy);
  PF_HOST_SYMBOL(strcat);
  PF_HOST_SYMBOL(strncat);
  PF_HOST_SYMBOL(strchr);
  PF_HOST_SYMBOL(strrchr);
  PF_HOST_SYMBOL(strstr);
  PF_HOST_SYMBOL(memchr);
  PF_HOST_SYMBOL(strcasecmp);
  PF_HOST_SYMBOL(strncasecmp);
  PF_HOST_SYMBOL(toupper);
  PF_HOST_SYMBOL(tolower);
  PF_HOST_SYMBOL(isalpha);
  PF_HOST_SYMBOL(isdigit);
  PF_HOST_SYMBOL(isalnum);
  PF_HOST_SYMBOL(isspace);
  PF_HOST_SYMBOL(isupper);
  PF_HOST_SYMBOL(islower);

  // atexit: -fno-use-cxa-atexit turns a local static's destructor
  // registration into a plain atexit() call. Nothing on this board ever
  // exits, and a module is dropped wholesale rather than destructed (see the
  // /DISCARD/ note in module.ld), so registering the pointer would only store
  // a reference into memory that may later be reused. Accept and forget.
  if (strcmp(symbol, "atexit") == 0) return (uintptr_t)(void*)(&pfModuleAtexit);

  // Allocators, routed through the module's tracked heap (see the shims above).
  if (strcmp(symbol, "malloc") == 0) return (uintptr_t)(void*)(&pfModuleMalloc);
  if (strcmp(symbol, "calloc") == 0) return (uintptr_t)(void*)(&pfModuleCalloc);
  if (strcmp(symbol, "free") == 0) return (uintptr_t)(void*)(&pfModuleFree);
  return 0;
}

#undef PF_HOST_SYMBOL
#undef PF_HOST_FN

inline void* moduleAlloc(size_t bytes) {
  if (moduleAllocCount >= MAX_MODULE_ALLOCS ||
      !PFModuleMemory::fits(bytes, PF_MODULE_RUNTIME_MAX_BYTES, runtimeBytes)) {
    ++PFModuleMemory::refusals;
    return nullptr;
  }
  // Zeroed: abi/pf_abi.h documents alloc() as "PSRAM-preferred zeroed" and HEAD
  // honoured it through PFMem::alloc (core_mem.h memsets). The rework dropped
  // the zeroing, so a pattern that allocates a trail map or accumulator and
  // reads it before writing has been reading whatever the last module left.
  void* memory = PFModuleMemory::data(bytes, true, true);
  if (memory) {
    moduleAllocs[moduleAllocCount++] = memory;
    runtimeBytes += bytes;
    if (runtimeBytes > runtimePeakBytes) runtimePeakBytes = runtimeBytes;
  }
  return memory;
}

inline void hostLog(const char* message) {
  if (message) Serial.print(message);
}

inline void hostVlogf(const char* format, va_list args) {
  char buffer[192];
  vsnprintf(buffer, sizeof(buffer), format, args);
  Serial.print(buffer);
}

inline uint32_t hostMillis() {
  return (uint32_t)millis();
}

inline uint32_t hostRand32() {
  return esp_random();
}

inline const float* hostTableR() {
  PFTables::init();
  return PFTables::rT;
}

inline const float* hostTableTheta() {
  PFTables::init();
  return PFTables::thetaT;
}

inline PFHostAPI hostAPI = {
  PF_ABI_VERSION,
  PANEL_RES_W,
  PANEL_RES_H,
  PFCanvas::buffer,
  PFCanvas::present,
  PFCanvas::clear,
  moduleAlloc,
  hostLog,
  hostVlogf,
  hostMillis,
  hostRand32,
  hostTableR,
  hostTableTheta,
};

inline void unload() {
  active = nullptr;
  for (int i = 0; i < moduleAllocCount; ++i) free(moduleAllocs[i]);
  memset(moduleAllocs, 0, sizeof(moduleAllocs));
  moduleAllocCount = 0;
  runtimeBytes = 0;
  for (int i = 0; i < sectionCount; ++i) {
    free(sections[i].memory);
    sections[i] = {};
  }
  sectionCount = 0;
  // Nothing is resident: /api/status must stop reporting the footprint of a
  // module that left, or the partial footprint of one that never arrived.
  lastInternalBytes = 0;
  lastPsramBytes = 0;
  PFModuleMemory::endLoad();
}

inline bool copyExecutable(uint8_t* destination, const uint8_t* source, size_t bytes) {
  size_t words = (bytes + 3) / 4;
  volatile uint32_t* output = reinterpret_cast<volatile uint32_t*>(destination);
  for (size_t i = 0; i < words; ++i) {
    uint32_t value = 0;
    size_t base = i * 4;
    for (size_t byte = 0; byte < 4 && base + byte < bytes; ++byte) {
      value |= (uint32_t)source[base + byte] << (byte * 8);
    }
    output[i] = value;
  }
  return true;
}

// EXEC heap is reachable through the data cache. After we copy or relocate
// code into it, the instruction fetch path can still see stale lines — on
// ESP32-S3 that shows up as a silent TG0WDT reboot the moment we call into
// the module. Write-back + invalidate before the first call.
inline void syncExecutable(uint8_t* memory, size_t bytes) {
  if (!memory || bytes == 0) return;
  size_t aligned = (bytes + 3) & ~size_t(3);
#if defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32S2)
  Cache_WriteBack_Addr((uint32_t)memory, aligned);
  Cache_Invalidate_Addr((uint32_t)memory, aligned);
#elif defined(CONFIG_IDF_TARGET_ESP32)
  Cache_Flush(0);
  Cache_Flush(1);
#else
  __asm__ __volatile__("memw" ::: "memory");
#endif
}

// Phase timings from the last successful load(). Switching to a module is the
// one thing this design costs that a compiled-in preset does not, so the cost
// is measured rather than assumed.
inline uint32_t lastReadUs = 0;
inline uint32_t lastRelocateUs = 0;
inline uint32_t lastSetupUs = 0;
inline uint32_t lastTotalUs = 0;

// Cheap structural check on a freshly written .pfm, without loading it.
//
// The upload path used to answer "ok" as soon as the bytes were received, so a
// truncated or corrupted module reported success and only revealed itself when
// the knob reached it. Validating the header at upload time makes the reply
// mean something: a file that passes this is at least the right kind of object
// for this device.
inline bool looksLikeModule(fs::FS& filesystem, const char* path, char* why, size_t whySize) {
  File file = filesystem.open(path, FILE_READ);
  if (!file) {
    snprintf(why, whySize, "cannot reopen after write");
    return false;
  }
  Elf32Ehdr header;
  size_t got = file.read(reinterpret_cast<uint8_t*>(&header), sizeof(header));
  size_t size = file.size();
  file.close();

  if (got != sizeof(header)) {
    snprintf(why, whySize, "too small to be a module (%u bytes)", (unsigned)size);
    return false;
  }
  uint32_t magic;
  memcpy(&magic, header.ident, sizeof(magic));
  if (magic != ELF_MAGIC) {
    snprintf(why, whySize, "not an ELF file (corrupt upload?)");
    return false;
  }
  if (!moduleHeaderValid(header, size)) {
    snprintf(why, whySize, "unsupported or truncated ELF - rebuild with build_module.py");
    return false;
  }
  return true;
}

inline bool load(fs::FS& filesystem, const char* path) {
  unload();
  lastError[0] = '\0';
  Serial.printf("[MODULE] loading %s\n", path);
  const uint32_t startedUs = micros();

  File file = filesystem.open(path, FILE_READ);
  if (!file) return fail("cannot open module");
  size_t fileSize = file.size();
  uint8_t* image = static_cast<uint8_t*>(PFModuleMemory::data(fileSize, false, true));
  if (!image) {
    file.close();
    return fail("not enough RAM for ELF file");
  }
  size_t bytesRead = file.read(image, fileSize);
  file.close();
  if (bytesRead != fileSize || fileSize < sizeof(Elf32Ehdr)) {
    free(image);
    return fail("truncated ELF file");
  }

  lastReadUs = micros() - startedUs;

  const Elf32Ehdr* header = reinterpret_cast<const Elf32Ehdr*>(image);
  if (!moduleHeaderValid(*header, fileSize)) {
    free(image);
    return fail("unsupported ELF format");
  }

  const Elf32Shdr* sectionHeaders =
      reinterpret_cast<const Elf32Shdr*>(image + header->shoff);

  // Section-name table, used only to recognise .init_array by name.
  const char* sectionNames = nullptr;
  size_t sectionNamesSize = 0;
  if (header->shstrndx < header->shnum) {
    const Elf32Shdr& nameTable = sectionHeaders[header->shstrndx];
    if (rangeValid(nameTable.offset, nameTable.size, fileSize)) {
      sectionNames = reinterpret_cast<const char*>(image + nameTable.offset);
      sectionNamesSize = nameTable.size;
    }
  }

  // Pass 1 - price. Everything admission needs is already in the section
  // headers: which sections are allocatable, how big each is once rounded, and
  // which of them are executable. Validate and sum here, so nothing is
  // allocated until the verdict is known and there is no half-placed module to
  // unwind - and so the verdict does not depend on the order the sections
  // happen to be walked in.
  size_t plannedSize[MAX_SECTIONS] = {};
  uint16_t plannedIndex[MAX_SECTIONS] = {};
  int planned = 0;
  size_t codeBytes = 0;
  for (uint16_t i = 1; i < header->shnum; ++i) {
    const Elf32Shdr& section = sectionHeaders[i];
    if (!(section.flags & SHF_ALLOC) || section.size == 0) continue;
    if (planned >= MAX_SECTIONS) {
      free(image);
      unload();
      return fail("too many loadable sections");
    }
    size_t allocationSize;
    if (!sectionAllocationSize(section.size, allocationSize) ||
        (section.type != SHT_NOBITS &&
         !rangeValid(section.offset, section.size, fileSize))) {
      free(image);
      unload();
      return fail("invalid module section size or range");
    }
    plannedIndex[planned] = i;
    plannedSize[planned] = allocationSize;
    ++planned;
    if (section.flags & SHF_EXECINSTR) codeBytes += allocationSize;
  }
  lastCodeBytes = (uint32_t)codeBytes;

  // Admission - one decision, for the whole module, about the only part of it
  // that has nowhere else to live. Refusing here refuses before a byte has been
  // taken, and names the two numbers that disagreed instead of eight words that
  // could equally mean a full heap.
  if (!PFModuleMemory::admitCode(codeBytes)) {
    const unsigned room = (unsigned)PFModuleMemory::budget();
    const unsigned freeNow = (unsigned)PFModuleMemory::serviceFree();
    // Count it. The right-hand side of this comparison is ambient - an HTTP
    // response in flight, an rtpMIDI session, a DHCP renew all move it, and a
    // dip under the reserve makes room read as zero however small the module
    // is. That is a transient, not a verdict, and loadPatternJob() already
    // knows how to wait one out: it retries precisely while refusals keep
    // moving. Failing without counting is what turns a 50 ms dip into "the
    // pattern does not come on".
    ++PFModuleMemory::refusals;
    (void)room;
    free(image);
    unload();
    snprintf(lastError, sizeof(lastError), "code %u B needs %u free, have %u",
             (unsigned)codeBytes,
             (unsigned)(codeBytes + (size_t)PF_MODULE_INTERNAL_RESERVE), freeNow);
    Serial.printf("[MODULE] %s\n", lastError);
    return false;
  }

  // Pass 2 - place, executable sections first. Code takes the share admission
  // set aside for it before any data allocation can spend it, so the reserve is
  // consumed in the order it was priced. sections[] is looked up by ELF index
  // everywhere (sectionByIndex), so its order here does not matter.
  lastInternalBytes = 0;
  lastPsramBytes = 0;
  for (int pass = 0; pass < 2; ++pass) {
    for (int q = 0; q < planned; ++q) {
      const uint16_t i = plannedIndex[q];
      const Elf32Shdr& section = sectionHeaders[i];
      const bool executable = (section.flags & SHF_EXECINSTR) != 0;
      if (executable != (pass == 0)) continue;
      const size_t allocationSize = plannedSize[q];
      uint8_t* memory = executable
          ? static_cast<uint8_t*>(PFModuleMemory::code(allocationSize))
          : static_cast<uint8_t*>(PFModuleMemory::data(
                allocationSize, true, allocationSize > PF_MODULE_DATA_INTERNAL_MAX));
      if (!memory) {
        // Sample before free()/unload(), or the line reports the heap as it is
        // after the cleanup and contradicts the failure it is explaining.
        const unsigned freeNow = (unsigned)PFModuleMemory::serviceFree();
        const unsigned largest = (unsigned)heap_caps_get_largest_free_block(
            executable ? PFModuleMemory::internalCode : PFModuleMemory::internalData);
        free(image);
        unload();
        snprintf(lastError, sizeof(lastError), "no %s RAM: %u B, free %u, blk %u",
                 executable ? "exec" : "data", (unsigned)allocationSize, freeNow,
                 largest);
        Serial.printf("[MODULE] %s\n", lastError);
        return false;
      }
      if (esp_ptr_external_ram(memory)) lastPsramBytes += allocationSize;
      else lastInternalBytes += allocationSize;
      LoadedSection& loaded = sections[sectionCount++];
      loaded.index = i;
      loaded.elfAddress = section.addr;
      loaded.size = section.size;
      loaded.memory = memory;
      loaded.executable = executable;
      loaded.initArray = isInitArraySection(section, sectionNames, sectionNamesSize);
      if (section.type != SHT_NOBITS) {
        if (executable) copyExecutable(memory, image + section.offset, section.size);
        else memcpy(memory, image + section.offset, section.size);
      }
    }
  }
  // Placement is over; setup()'s api->alloc() must not spend the load budget.
  PFModuleMemory::endLoad();

  const Elf32Sym* symbols = nullptr;
  size_t symbolCount = 0;
  const char* strings = nullptr;
  size_t stringsSize = 0;
  for (uint16_t i = 1; i < header->shnum; ++i) {
    const Elf32Shdr& section = sectionHeaders[i];
    if (section.type != SHT_SYMTAB || section.entsize != sizeof(Elf32Sym) ||
        section.link >= header->shnum ||
        !rangeValid(section.offset, section.size, fileSize)) continue;
    const Elf32Shdr& stringSection = sectionHeaders[section.link];
    if (!rangeValid(stringSection.offset, stringSection.size, fileSize)) continue;
    symbols = reinterpret_cast<const Elf32Sym*>(image + section.offset);
    symbolCount = section.size / sizeof(Elf32Sym);
    strings = reinterpret_cast<const char*>(image + stringSection.offset);
    stringsSize = stringSection.size;
    break;
  }
  if (!symbols || !strings) {
    free(image);
    unload();
    return fail("ELF has no symbol table");
  }

  for (uint16_t i = 1; i < header->shnum; ++i) {
    const Elf32Shdr& relocationSection = sectionHeaders[i];
    if (relocationSection.type != SHT_RELA ||
        relocationSection.entsize != sizeof(Elf32Rela) ||
        relocationSection.info >= header->shnum ||
        !rangeValid(relocationSection.offset, relocationSection.size, fileSize)) continue;
    LoadedSection* target = sectionByIndex(relocationSection.info);
    if (!target) continue;
    const Elf32Rela* relocations =
        reinterpret_cast<const Elf32Rela*>(image + relocationSection.offset);
    size_t count = relocationSection.size / sizeof(Elf32Rela);
    for (size_t r = 0; r < count; ++r) {
      if ((r & 63) == 63) yield();
      const Elf32Rela& relocation = relocations[r];
      uint8_t type = relocation.info & 0xff;
      if (type == R_XTENSA_NONE || type == R_XTENSA_SLOT0_OP ||
          type == R_XTENSA_ASM_EXPAND) continue;
      if (type != R_XTENSA_32 ||
          !rangeValid(relocation.offset, sizeof(uint32_t), target->size)) {
        free(image);
        unload();
        return fail("unsupported Xtensa relocation");
      }
      uint32_t symbolIndex = relocation.info >> 8;
      if (symbolIndex >= symbolCount) {
        free(image);
        unload();
        return fail("bad relocation symbol");
      }
      const Elf32Sym& symbol = symbols[symbolIndex];
      const char* symbolName = tableString(strings, stringsSize, symbol.name);
      uintptr_t address;
      if (symbol.shndx == 0) {
        address = symbolName ? resolveHostSymbol(symbolName) : 0;
      } else {
        address = mapDefinedSymbol(symbol);
      }
      if (!address) {
        // Both symbol and its name belong to image. Copy the diagnostic
        // BEFORE freeing it; even reading symbol.shndx afterwards is a UAF.
        if (symbol.shndx == 0 && symbolName) {
          snprintf(lastError, sizeof(lastError), "unresolved symbol: %s",
                   symbolName);
        } else {
          snprintf(lastError, sizeof(lastError), "unresolved module symbol");
        }
        free(image);
        unload();
        Serial.printf("[MODULE] %s\n", lastError);
        return false;
      }
      // Xtensa partial-link emits SHT_RELA with addend 0 and keeps the real
      // offset in the place being patched (REL semantics in a RELA container).
      // Using only S+A would zero every string/literal pointer (e.g. NAME ->
      // &rodata[0] instead of &rodata[0x83] "Origin") and crash on first
      // setup(). Measured across all 38 stock modules: 1318/1318 R_XTENSA_32
      // entries carry addend 0.
      //
      // But do NOT hardcode that convention. A binutils that switches to true
      // RELA would put the offset in r_addend and zero the place; adding both
      // unconditionally would then double it and corrupt every pointer in the
      // same silent, watchdog-resetting way. Pick per entry: a non-zero addend
      // means the linker owns the offset, so the place is not part of it.
      volatile uint32_t* destination = reinterpret_cast<volatile uint32_t*>(
          target->memory + relocation.offset);
      uint32_t place = *destination;
      *destination = relocation.addend != 0
                         ? (uint32_t)(address + relocation.addend)
                         : (uint32_t)(address + place);
    }
  }

  uintptr_t entryAddress = 0;
  for (size_t i = 0; i < symbolCount; ++i) {
    const Elf32Sym& symbol = symbols[i];
    const char* symbolName = tableString(strings, stringsSize, symbol.name);
    if (symbolName && strcmp(symbolName, PF_MODULE_ENTRY_SYMBOL) == 0) {
      entryAddress = mapDefinedSymbol(symbol);
      break;
    }
  }
  free(image);
  if (!entryAddress) {
    unload();
    return fail("module entry point not found");
  }

  // Relocations may have patched literals inside .text — publish those
  // writes to the instruction side before the first call into the module.
  for (int i = 0; i < sectionCount; ++i) {
    if (sections[i].executable) {
      syncExecutable(sections[i].memory, sections[i].size);
    }
  }

  runInitArray();

  lastRelocateUs = micros() - startedUs - lastReadUs;

  Serial.printf("[MODULE] entering %s...\n", path);
  using Entry = const PFPatternModule* (*)(const PFHostAPI*);
  Entry entry = reinterpret_cast<Entry>(entryAddress);
  active = entry(&hostAPI);
  // Descriptor version 1 (pre-absolute) and 2 (reads the appended
  // absolute-param InputFrame fields) both run here — the host always fills
  // the extended frame. Anything else is a layout we do not provide.
  if (!active || active->abi_version < PF_ABI_VERSION ||
      active->abi_version > PF_ABI_MODULE_VERSION ||
      active->panel_w != PANEL_RES_W || active->panel_h != PANEL_RES_H ||
      !active->name || !active->knob_labels || !active->setup ||
      !active->update || !active->draw) {
    unload();
    return fail("module rejected host ABI or panel size");
  }
  // Guard against a still-broken string reloc: a bad NAME pointer used to
  // hang inside printf and trip the interrupt watchdog with no backtrace.
  //
  // The question is "does this pointer land inside the module image and
  // terminate there", never "is the text ASCII". Testing for printable ASCII
  // is what the first version did, and it rejected every pattern whose NAME
  // carried an accent or CJK: "Dynamic Moiré" was reported as a reloc bug
  // with the relocation perfectly intact. Names are UTF-8 and may be
  // anything; only the panel's font is ASCII, and that is a drawing concern.
  {
    const char* name = active->name;
    const LoadedSection* owner = sectionContaining(name);
    if (!owner) {
      unload();
      return fail("module name points outside the image (reloc bug)");
    }
    const size_t room = owner->size - (size_t)((const uint8_t*)name - owner->memory);
    size_t length = 0;
    while (length < room && name[length] != '\0') length++;
    if (length == 0 || length == room) {
      unload();
      return fail("module name is empty or unterminated (reloc bug)");
    }
  }
  Serial.printf("[MODULE] setup %s...\n", active->name);
  const uint32_t setupStartedUs = micros();
  active->setup();
  lastSetupUs = micros() - setupStartedUs;
  lastTotalUs = micros() - startedUs;
  Serial.printf("[MODULE] loaded %s (%s)\n", active->name, path);
  Serial.printf("[MODULE] %lu us total = read %lu + relocate %lu + setup %lu\n",
                (unsigned long)lastTotalUs, (unsigned long)lastReadUs,
                (unsigned long)lastRelocateUs, (unsigned long)lastSetupUs);
  return true;
}

inline void update(float dt, const InputFrame& input) {
  if (active) {
    active->update(dt, reinterpret_cast<const PFInputFrame*>(&input));
  }
}

inline void draw() {
  if (active) active->draw();
}

inline const char* error() {
  return lastError;
}

}  // namespace PFModuleLoader
