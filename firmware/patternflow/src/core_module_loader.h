#pragma once

#include <Arduino.h>
#include <FS.h>
#include <esp_heap_caps.h>
#include <math.h>
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
#include "core_encoders.h"
#include "core_mem.h"
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
}

namespace PFModuleLoader {

constexpr uint32_t ELF_MAGIC = 0x464c457f;
constexpr uint16_t ET_REL = 1;
constexpr uint16_t EM_XTENSA = 94;
constexpr uint32_t SHT_SYMTAB = 2;
constexpr uint32_t SHT_RELA = 4;
constexpr uint32_t SHT_NOBITS = 8;
constexpr uint32_t SHT_INIT_ARRAY = 14;
constexpr uint32_t SHF_ALLOC = 0x2;
constexpr uint32_t SHF_EXECINSTR = 0x4;
constexpr uint8_t R_XTENSA_NONE = 0;
constexpr uint8_t R_XTENSA_32 = 1;
constexpr uint8_t R_XTENSA_ASM_EXPAND = 11;
constexpr uint8_t R_XTENSA_SLOT0_OP = 20;
// module.ld collapses a module to .text/.rodata/.data/.bss, so four is what
// every stock preset actually produces. The headroom is for .init_array (see
// runInitArray) and for whatever a community pattern's toolchain adds.
constexpr int MAX_SECTIONS = 8;
constexpr int MAX_MODULE_ALLOCS = 16;

struct Elf32Ehdr {
  uint8_t ident[16];
  uint16_t type;
  uint16_t machine;
  uint32_t version;
  uint32_t entry;
  uint32_t phoff;
  uint32_t shoff;
  uint32_t flags;
  uint16_t ehsize;
  uint16_t phentsize;
  uint16_t phnum;
  uint16_t shentsize;
  uint16_t shnum;
  uint16_t shstrndx;
};

struct Elf32Shdr {
  uint32_t name;
  uint32_t type;
  uint32_t flags;
  uint32_t addr;
  uint32_t offset;
  uint32_t size;
  uint32_t link;
  uint32_t info;
  uint32_t addralign;
  uint32_t entsize;
};

struct Elf32Sym {
  uint32_t name;
  uint32_t value;
  uint32_t size;
  uint8_t info;
  uint8_t other;
  uint16_t shndx;
};

struct Elf32Rela {
  uint32_t offset;
  uint32_t info;
  int32_t addend;
};

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
inline void* moduleAllocs[MAX_MODULE_ALLOCS] = {};
inline int moduleAllocCount = 0;
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

inline bool rangeValid(size_t offset, size_t bytes, size_t total) {
  return offset <= total && bytes <= total - offset;
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
  if (!names || section.name >= namesSize) return false;
  return strcmp(names + section.name, ".init_array") == 0;
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
inline void* pfModuleCalloc(size_t count, size_t size) { return moduleAlloc(count * size); }
inline void pfModuleFree(void*) {}

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
  PF_HOST_SYMBOL(tanhf);
  PF_HOST_SYMBOL(hypotf);
  PF_HOST_SYMBOL(copysignf);
  PF_HOST_SYMBOL(truncf);
  PF_HOST_SYMBOL(fabsf);

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

  // Allocators, routed through the module's tracked heap (see the shims above).
  if (strcmp(symbol, "malloc") == 0) return (uintptr_t)(void*)(&pfModuleMalloc);
  if (strcmp(symbol, "calloc") == 0) return (uintptr_t)(void*)(&pfModuleCalloc);
  if (strcmp(symbol, "free") == 0) return (uintptr_t)(void*)(&pfModuleFree);
  return 0;
}

#undef PF_HOST_SYMBOL
#undef PF_HOST_FN

inline void* moduleAlloc(size_t bytes) {
  if (moduleAllocCount >= MAX_MODULE_ALLOCS) return nullptr;
  void* memory = PFMem::alloc(bytes);
  if (memory) moduleAllocs[moduleAllocCount++] = memory;
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
  for (int i = 0; i < sectionCount; ++i) {
    free(sections[i].memory);
    sections[i] = {};
  }
  sectionCount = 0;
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
  if (header.type != ET_REL || header.machine != EM_XTENSA) {
    snprintf(why, whySize, "wrong ELF kind - rebuild with build_module.py");
    return false;
  }
  // Section headers live at the END of the image, so this catches the
  // truncation a plain size check would miss.
  if (header.shoff + (uint32_t)header.shnum * sizeof(Elf32Shdr) > size) {
    snprintf(why, whySize, "truncated - section table past end of file");
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
  uint8_t* image = static_cast<uint8_t*>(ps_malloc(fileSize));
  if (!image) image = static_cast<uint8_t*>(malloc(fileSize));
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
  uint32_t magic;
  memcpy(&magic, header->ident, sizeof(magic));
  if (magic != ELF_MAGIC || header->ident[4] != 1 || header->ident[5] != 1 ||
      header->type != ET_REL || header->machine != EM_XTENSA ||
      header->shentsize != sizeof(Elf32Shdr) ||
      !rangeValid(header->shoff, (size_t)header->shnum * sizeof(Elf32Shdr), fileSize)) {
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

  for (uint16_t i = 1; i < header->shnum; ++i) {
    const Elf32Shdr& section = sectionHeaders[i];
    if (!(section.flags & SHF_ALLOC) || section.size == 0) continue;
    if (sectionCount >= MAX_SECTIONS) {
      free(image);
      unload();
      return fail("module has more than four loadable sections");
    }
    size_t allocationSize = (section.size + 3) & ~size_t(3);
    uint8_t* memory;
    if (section.flags & SHF_EXECINSTR) {
      memory = static_cast<uint8_t*>(
          heap_caps_malloc(allocationSize, MALLOC_CAP_EXEC | MALLOC_CAP_INTERNAL | MALLOC_CAP_32BIT));
      if (!memory) {
        memory = static_cast<uint8_t*>(
            heap_caps_malloc(allocationSize, MALLOC_CAP_EXEC | MALLOC_CAP_32BIT));
      }
    } else {
      // Prefer internal 8-bit RAM: module code does l8ui/s8i on .bss flags
      // (e.g. sinLUTReady). EXEC heap is 32-bit-only, so data must not land
      // there, and PSRAM has been a flaky partner for early-boot module data.
      memory = static_cast<uint8_t*>(
          heap_caps_calloc(1, allocationSize, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
      if (!memory) {
        memory = static_cast<uint8_t*>(
            heap_caps_calloc(1, allocationSize, MALLOC_CAP_8BIT));
      }
      if (!memory) {
        memory = static_cast<uint8_t*>(
            heap_caps_calloc(1, allocationSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
      }
    }
    if (!memory) {
      free(image);
      unload();
      return fail("not enough executable/data RAM");
    }
    LoadedSection& loaded = sections[sectionCount++];
    loaded.index = i;
    loaded.elfAddress = section.addr;
    loaded.size = section.size;
    loaded.memory = memory;
    loaded.executable = (section.flags & SHF_EXECINSTR) != 0;
    loaded.initArray = isInitArraySection(section, sectionNames, sectionNamesSize);
    if (section.type != SHT_NOBITS) {
      if (!rangeValid(section.offset, section.size, fileSize)) {
        free(image);
        unload();
        return fail("section outside ELF file");
      }
      if (section.flags & SHF_EXECINSTR) copyExecutable(memory, image + section.offset, section.size);
      else memcpy(memory, image + section.offset, section.size);
    }
  }

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
      if (type != R_XTENSA_32 || relocation.offset + sizeof(uint32_t) > target->size) {
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
      uintptr_t address;
      if (symbol.shndx == 0) {
        if (symbol.name >= stringsSize) address = 0;
        else address = resolveHostSymbol(strings + symbol.name);
      } else {
        address = mapDefinedSymbol(symbol);
      }
      if (!address) {
        free(image);
        unload();
        // Include the symbol name when we can — much easier to diagnose
        // missing libm hooks from the serial log.
        if (symbol.shndx == 0 && symbol.name < stringsSize) {
          snprintf(lastError, sizeof(lastError), "unresolved symbol: %s",
                   strings + symbol.name);
          Serial.printf("[MODULE] %s\n", lastError);
          return false;
        }
        return fail("unresolved module symbol");
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
    if (symbol.name < stringsSize &&
        strcmp(strings + symbol.name, PF_MODULE_ENTRY_SYMBOL) == 0) {
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
  if (!active || active->abi_version != PF_ABI_VERSION ||
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
