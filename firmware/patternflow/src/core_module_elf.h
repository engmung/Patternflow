// Bounds checks shared by module upload and loading. No device dependencies:
// the same checks run in the host regression suite. License: MIT.
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

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


inline bool rangeValid(size_t offset, size_t bytes, size_t total) {
  return offset <= total && bytes <= total - offset;
}

// Keep upload acceptance and the loader's header interpretation in step.
inline bool moduleHeaderValid(const Elf32Ehdr& header, size_t fileSize) {
  uint32_t magic;
  memcpy(&magic, header.ident, sizeof(magic));
  return fileSize >= sizeof(Elf32Ehdr) && magic == ELF_MAGIC &&
         header.ident[4] == 1 && header.ident[5] == 1 &&
         header.type == ET_REL && header.machine == EM_XTENSA &&
         header.shentsize == sizeof(Elf32Shdr) && header.shnum != 0 &&
         rangeValid(header.shoff, (size_t)header.shnum * sizeof(Elf32Shdr), fileSize);
}

// An offset inside a string table is not enough: the terminator must also
// belong to that table, before strcmp/printf can safely read the string.
inline const char* tableString(const char* table, size_t size, size_t offset) {
  if (!table || offset >= size) return nullptr;
  const char* text = table + offset;
  return memchr(text, '\0', size - offset) ? text : nullptr;
}

// The target uses 32-bit size_t, even when tests run on a 64-bit host.
// Rounding a corrupt section size up to a word must not wrap to zero.
inline bool sectionAllocationSize(uint32_t bytes, size_t& rounded) {
  if (bytes > UINT32_MAX - 3u) return false;
  rounded = (bytes + 3u) & ~uint32_t(3);
  return true;
}

}  // namespace PFModuleLoader
