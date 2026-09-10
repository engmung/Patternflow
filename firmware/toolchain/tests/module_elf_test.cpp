// Host regressions for the checks used by core_module_loader.h. License: MIT.
#include "core_module_elf.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <vector>

using namespace PFModuleLoader;

static void require(bool ok, const char* what) {
  if (!ok) throw std::runtime_error(what);
}

static void regressions() {
  static_assert(sizeof(Elf32Ehdr) == 52, "ELF header layout");
  static_assert(sizeof(Elf32Shdr) == 40, "ELF section layout");
  static_assert(sizeof(Elf32Sym) == 16, "ELF symbol layout");
  static_assert(sizeof(Elf32Rela) == 12, "ELF relocation layout");
  Elf32Ehdr good{};
  memcpy(good.ident, &ELF_MAGIC, sizeof(ELF_MAGIC));
  good.ident[4] = good.ident[5] = 1;
  good.type = ET_REL;
  good.machine = EM_XTENSA;
  good.shentsize = sizeof(Elf32Shdr);
  good.shnum = 2;
  good.shoff = sizeof(Elf32Ehdr);
  const size_t fileSize = good.shoff + good.shnum * sizeof(Elf32Shdr);
  require(moduleHeaderValid(good, fileSize), "valid header rejected");
  require(!moduleHeaderValid(good, fileSize - 1), "truncated section table accepted");
  require(!moduleHeaderValid(good, sizeof(Elf32Ehdr) - 1), "short header accepted");
  for (int kind = 0; kind < 8; ++kind) {
    Elf32Ehdr bad = good;
    switch (kind) {
      case 0: bad.ident[0] = 0; break;
      case 1: bad.ident[4] = 2; break;  // ELF64
      case 2: bad.ident[5] = 2; break;  // big endian
      case 3: bad.type = 2; break;     // executable, not relocatable
      case 4: bad.machine = 3; break;  // x86
      case 5: bad.shentsize = 1; break;
      case 6: bad.shnum = 0; break;
      case 7: bad.shoff = UINT32_MAX - 3; break;  // used to wrap on ESP32
    }
    require(!moduleHeaderValid(bad, fileSize), "malformed header accepted");
  }

  require(rangeValid(12, 4, 16), "last complete relocation rejected");
  require(!rangeValid(13, 4, 16), "partial relocation accepted");
  require(!rangeValid(UINT32_MAX - 1, 4, 16), "wrapped relocation accepted");
  require(!rangeValid(SIZE_MAX - 1, 4, 16), "host size overflow accepted");
  require(rangeValid(16, 0, 16), "empty range at end rejected");
  require(!rangeValid(17, 0, 16), "range past end accepted");

  size_t rounded = 0;
  require(sectionAllocationSize(1, rounded) && rounded == 4, "short section rounding");
  require(sectionAllocationSize(4, rounded) && rounded == 4, "aligned section rounding");
  require(sectionAllocationSize(UINT32_MAX - 3, rounded) && rounded == UINT32_MAX - 3,
          "largest representable rounded section");
  for (uint32_t tail = 0; tail < 3; ++tail)
    require(!sectionAllocationSize(UINT32_MAX - tail, rounded), "wrapped allocation accepted");

  const char names[] = "\0sinf\0.init_array\0unterminated";
  const size_t tableSize = sizeof(names) - 1;  // terminator exists OUTSIDE the table
  require(tableString(names, tableSize, 0) == names, "empty symbol rejected");
  require(strcmp(tableString(names, tableSize, 1), "sinf") == 0, "symbol lookup");
  require(strcmp(tableString(names, tableSize, 6), ".init_array") == 0, "section lookup");
  require(!tableString(names, tableSize, 18), "unterminated name accepted");
  require(!tableString(names, tableSize, tableSize), "end-of-table name accepted");
  require(!tableString(names, tableSize, SIZE_MAX), "wrapped name accepted");
  require(!tableString(nullptr, 0, 0), "absent table accepted");
  const char utf8[] = "Moir\xc3\xa9";
  require(tableString(utf8, sizeof(utf8), 0) == utf8, "UTF-8 name rejected");
}

template<class T>
static T read(const std::vector<char>& image, size_t offset) {
  require(rangeValid(offset, sizeof(T), image.size()), "fixture record outside file");
  T value;
  memcpy(&value, image.data() + offset, sizeof(T));
  return value;
}

// The largest executable-section total a module shipped from this repository may
// have. It is NOT a guarantee that a board will admit it: the device compares
// codeBytes against budget() = serviceFree() - PF_MODULE_INTERNAL_RESERVE, and
// serviceFree() is ambient - an HTTP response in flight, an rtpMIDI session and a
// DHCP renew all move it. This is a floor of observations, and its job is to stop
// a module being added here that the tightest edition cannot load.
//
// Set 2026-09-10 from docs/investigations/2026-09-firmware-runtime.md:
//   the module's internal share with none resident measures 7,816 B (section 4.4)
//   boot-to-boot ambient variance is about 700 B (section 4.1)
//   so the worst reasonable budget is about 7,116 B
//   the largest module currently shipped, breakout_arcade.pfm, is 5,364 B
// 6,144 sits 780 B above what ships and 972 B below the worst budget. Section 4.2
// is what the absence of this number cost: a firmware that could not load its own
// pack, 24,576 + 5,364 = 29,940 against ~28,320 free, found by hardware bisect.
//
// Raising it is allowed and is a decision, not a formality: re-measure
// moduleMemory.budget from /api/status on the Audio edition (the tightest - 41,036 B
// internal free after smoke, against Default's 73,172 B), with the console open and
// a module resident, sample repeatedly against the ambient variance, and say in the
// commit which observation the new number came from.
static constexpr size_t SHIPPED_CODE_CEILING = 6144;

static size_t largestShippedCode = 0;
static const char* largestShippedName = "";

// Exercise the production bounds functions on the modules actually shipped
// in Basics. This checks compatibility of the file checks, not Xtensa execution.
//
// It also PRICES each module exactly as core_module_loader.h does in its pass 1,
// because structure being valid is not the same as the module being loadable, and
// only the second question is the one that stops a pattern appearing on a panel.
static void shippedModule(const char* path) {
  std::ifstream file(path, std::ios::binary);
  require(file.good(), "cannot open fixture");
  std::vector<char> image((std::istreambuf_iterator<char>(file)), {});
  auto header = read<Elf32Ehdr>(image, 0);
  require(moduleHeaderValid(header, image.size()), "shipped module header rejected");
  auto section = [&](size_t index) {
    require(index < header.shnum, "fixture section index");
    return read<Elf32Shdr>(image, header.shoff + index * sizeof(Elf32Shdr));
  };
  size_t codeBytes = 0;
  for (size_t i = 1; i < header.shnum; ++i) {
    auto s = section(i);
    if (s.flags & SHF_ALLOC) {
      size_t rounded;
      require(sectionAllocationSize(s.size, rounded), "shipped section size rejected");
      if (s.type != SHT_NOBITS)
        require(rangeValid(s.offset, s.size, image.size()), "shipped section range rejected");
      // core_module_loader.h pass 1, to the letter: allocatable, non-empty,
      // rounded up to four, executable summed. If that rule ever moves, this
      // has to move with it or the number below stops meaning anything.
      if (s.size != 0 && (s.flags & SHF_EXECINSTR)) codeBytes += rounded;
    }
    if (s.type == SHT_SYMTAB) {
      auto strings = section(s.link);
      require(rangeValid(strings.offset, strings.size, image.size()), "fixture string range");
      for (size_t n = 0; n < s.size / sizeof(Elf32Sym); ++n) {
        auto sym = read<Elf32Sym>(image, s.offset + n * sizeof(Elf32Sym));
        require(tableString(image.data() + strings.offset, strings.size, sym.name),
                "shipped symbol name rejected");
      }
    }
    if (s.type == SHT_RELA) {
      auto target = section(s.info);
      if (!(target.flags & SHF_ALLOC)) continue;
      for (size_t n = 0; n < s.size / sizeof(Elf32Rela); ++n) {
        auto reloc = read<Elf32Rela>(image, s.offset + n * sizeof(Elf32Rela));
        if ((reloc.info & 0xff) == R_XTENSA_32)
          require(rangeValid(reloc.offset, sizeof(uint32_t), target.size),
                  "shipped relocation rejected");
      }
    }
  }
  if (codeBytes > largestShippedCode) {
    largestShippedCode = codeBytes;
    largestShippedName = path;
  }
  if (codeBytes > SHIPPED_CODE_CEILING) {
    std::cerr << path << ": " << codeBytes << " B of executable sections, over the "
              << SHIPPED_CODE_CEILING << " B ceiling for a module shipped from this\n"
              << "repository. A board admits code only against "
              << "serviceFree() - PF_MODULE_INTERNAL_RESERVE, so this one may simply\n"
              << "not come on. Read the ceiling's provenance in this file before "
              << "raising it.\n";
    throw std::runtime_error("shipped module over the code ceiling");
  }
}

int main(int argc, char** argv) {
  try {
    regressions();
    for (int i = 1; i < argc; ++i) shippedModule(argv[i]);
    std::cout << "ELF regressions passed; " << argc - 1 << " shipped modules accepted\n";
    if (argc > 1) {
      const char* slash = strrchr(largestShippedName, '/');
      const char* back = strrchr(largestShippedName, '\\');
      if (back > slash) slash = back;
      std::cout << "largest module code: " << largestShippedCode << " B ("
                << (slash ? slash + 1 : largestShippedName)
                << "), ceiling " << SHIPPED_CODE_CEILING
                << " B, headroom " << (SHIPPED_CODE_CEILING - largestShippedCode)
                << " B\n";
    }
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
