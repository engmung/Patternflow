"""Pin how much internal SRAM each edition's image has already spent.

python firmware/toolchain/check_footprint.py [--update] [--dir DIR]

Run `firmware/bundles/build.sh all` first; it leaves one .elf per edition next to
the .bin in ~/pf-build-editions.

WHY. CI builds four editions and then prints `ls -l *.bin`, which is flash — and
flash is not the scarce resource on this board. Internal DRAM is. A loadable
pattern's code has to fit in one contiguous internal executable block, and that
block is the residual of the internal pool after .data, .bss and IRAM have taken
theirs. So a three-kilobyte static regression — one more inline buffer, one
feature's tables, an unrolled loop in an IRAM_ATTR function — eats a large share
of the budget that decides whether somebody's pattern loads, and nothing in CI
would notice. There are 24 KB of canvas in .bss alone before anything else.

WHAT IT MEASURES. Not a sum of section names. `.dram0.heap_start` is a zero-length
marker the linker places at the first byte of DRAM the heap may use, so its
ADDRESS is the answer the linker itself computed to "where do the statics end".
That survives a toolchain renaming its sections, which a name-matching sum would
not — it would just quietly measure less and pass.

IRAM is reported and pinned separately because on the S3 it is the same physical
SRAM as DRAM: `.dram0.dummy` exists to reserve the DRAM address space that the
cached flash-instruction region occupies, so IRAM growth shows up as DRAM loss.
That coupling is real and is exactly why the check is worth having.

THE STATIC NUMBER IS NOT THE RUNTIME NUMBER. IDF startup takes heap of its own —
platformio.ini's header documents a ~71 KB gap between two Arduino core
generations that is mostly startup heap, not statics. Treat a movement here as a
signal to go and read /api/status on a board, not as a runtime figure.
"""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]

# ESP32-S3 internal SRAM, from the technical reference manual. A section is
# classified by where the linker put it, never by what it is called.
DRAM_BASE = 0x3FC88000
DRAM_END = 0x3FD00000
IRAM_BASE = 0x40370000
IRAM_END = 0x403E0000

# One row per edition: (static DRAM bytes, IRAM bytes). Both are asserted with
# TOLERANCE, and a deliberate change re-pins by running with --update and saying
# in the commit which way it moved and why — the rule abi.sums works under.
#
# Set 2026-09-10, commit adding this file, PlatformIO espressif32@7.0.1 ->
# Arduino core 2.0.17 -> xtensa-esp32s3-elf-gcc 8.4.0 at -Os. A toolchain bump
# moves every row; re-pin it in the same commit as the bump.
PINS = {
    "default": (141080, 72311),
    "audio": (160096, 72791),
    "performance": (149968, 72311),
    "clock": (141352, 72311),
}

# Enough that an intentional, well-understood adjustment does not fire the check
# and teach people to bypass it; small enough that the class of regression this
# exists for cannot hide inside it.
TOLERANCE = 1024


def size_tool() -> str:
    name = "xtensa-esp32s3-elf-size"
    if found := shutil.which(name):
        return found
    for base in (Path.home() / ".platformio/packages", Path("/root/.platformio/packages")):
        for candidate in sorted(base.glob("toolchain-xtensa*/bin/" + name + "*")):
            return str(candidate)
    raise SystemExit(
        f"{name} not found. Build first (firmware/bundles/build.sh all), which "
        "installs the toolchain, or put it on PATH."
    )


def sections(tool: str, elf: Path) -> list[tuple[str, int, int]]:
    out = subprocess.check_output([tool, "-A", str(elf)], text=True)
    found = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) != 3:
            continue
        name, size, addr = parts
        if not re.fullmatch(r"\d+", size) or not re.fullmatch(r"\d+", addr):
            continue
        found.append((name, int(size), int(addr)))
    if not found:
        raise SystemExit(f"parsed no sections out of {elf} - did the size tool's output format change?")
    return found


def measure(tool: str, elf: Path) -> dict:
    dram = iram = 0
    heap_start = None
    for name, size, addr in sections(tool, elf):
        if size == 0 and name.endswith("heap_start"):
            heap_start = addr
        if size == 0:
            continue
        if DRAM_BASE <= addr < DRAM_END:
            dram += size
        elif IRAM_BASE <= addr < IRAM_END:
            iram += size
    if heap_start is None:
        raise SystemExit(
            f"{elf.name}: no zero-length *heap_start marker in the section table. The "
            "linker script named it something else, so this check can no longer see "
            "where the statics end - fix the check rather than removing it."
        )
    if not DRAM_BASE <= heap_start < DRAM_END:
        raise SystemExit(f"{elf.name}: heap_start 0x{heap_start:08X} is outside the DRAM window")
    # heap_start is what the linker itself concluded; the summed figure is a
    # cross-check on it, and a disagreement means a section escaped the windows.
    return {
        "static_dram": heap_start - DRAM_BASE,
        "summed_dram": dram,
        "iram": iram,
        "heap_start": heap_start,
        "free_dram": DRAM_END - heap_start,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--update", action="store_true",
                        help="rewrite PINS in this file from what was just built")
    parser.add_argument("--dir", default=os.environ.get("PF_BUILD_DIR", str(Path.home() / "pf-build")) + "-editions",
                        help="where build.sh all left its .elf files")
    args = parser.parse_args()

    outdir = Path(args.dir)
    tool = size_tool()
    measured, missing, failures = {}, [], 0

    # "window left" is address space, NOT free heap. The DRAM window is 491,520 B
    # and the statics leave ~350 KB of it, but a default build reports about 73 KB
    # free at runtime (audio about 41 KB) - the difference is heap taken during IDF
    # startup, which platformio.ini's header documents as ~71 KB between two core
    # generations. Anchor: on 2026-09, Default measured 73,172 B internal free after
    # smoke and Audio 41,036 B, a 32,136 B gap, of which the static figures below
    # account for 19,016 B. Read a movement here as a reason to go and look at
    # /api/status, never as a runtime number.
    print(f"{'edition':<13} {'static DRAM':>12} {'IRAM':>9} {'window left':>12}   pinned")
    for edition in PINS:
        elf = outdir / f"{edition}.elf"
        if not elf.is_file():
            missing.append(edition)
            print(f"{edition:<13} {'-':>12} {'-':>9} {'-':>11}   no elf at {elf}")
            continue
        m = measure(tool, elf)
        measured[edition] = m
        want_dram, want_iram = PINS[edition]
        marks = []
        if want_dram and abs(m["static_dram"] - want_dram) > TOLERANCE:
            marks.append(f"DRAM {m['static_dram'] - want_dram:+d} vs pin {want_dram}")
        if want_iram and abs(m["iram"] - want_iram) > TOLERANCE:
            marks.append(f"IRAM {m['iram'] - want_iram:+d} vs pin {want_iram}")
        if marks:
            failures += 1
        print(f"{edition:<13} {m['static_dram']:>12,} {m['iram']:>9,} {m['free_dram']:>12,}   "
              + ("<-- " + "; ".join(marks) if marks else ("ok" if want_dram else "UNPINNED")))

    if missing:
        print(f"\n{len(missing)} edition(s) not built: {', '.join(missing)}")
        print("Run: bash firmware/bundles/build.sh all")
        return 1

    if args.update:
        text = Path(__file__).read_text(encoding="utf-8")
        block = "PINS = {\n" + "".join(
            f'    "{e}": ({measured[e]["static_dram"]}, {measured[e]["iram"]}),\n' for e in PINS
        ) + "}"
        text = re.sub(r"PINS = \{.*?\n\}", block, text, count=1, flags=re.S)
        Path(__file__).write_text(text, encoding="utf-8")
        print("\nPINS rewritten. Say in the commit which way each moved and why.")
        return 0

    if failures:
        print(f"\n{failures} edition(s) outside tolerance ({TOLERANCE} B).")
        print("Internal DRAM is what decides whether a large .pfm can be admitted, so a")
        print("move here is a move in the module budget. If it is intended, re-pin with")
        print("--update in the same commit and say which way it went.")
        return 1

    if not any(PINS[e][0] for e in PINS):
        print("\nNo pins set yet. Run with --update once the build is trusted.")
        return 0

    print("\nevery edition within tolerance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
