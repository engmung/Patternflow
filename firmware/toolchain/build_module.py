"""
Build Patternflow loadable pattern modules (.pfm) with the Xtensa toolchain.

    python firmware/toolchain/build_module.py --all
    python firmware/toolchain/build_module.py firmware/modules/layer_stack
    python firmware/toolchain/build_module.py --all --compile-only
    python firmware/toolchain/build_module.py --out /tmp/art /tmp/mods/my_pattern

Inputs  : firmware/modules/<slug>/pattern.cpp (+ optional module.json)
Outputs : <out>/<slug>.pfm and <out>/<slug>.json, defaulting to the sketch's
          data/patterns/ so "ESP32 Sketch Data Upload" carries them to FATFS.
          The build service passes --out to keep artefacts out of the repo.

Needs an xtensa-esp32s3 toolchain; it finds the one the ESP32 Arduino core
installs, or PlatformIO's, or whatever PF_XTENSA_BIN points at.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # firmware/
SKETCH = ROOT / "patternflow"
ABI = SKETCH / "abi"
SRC_ROOT = ROOT / "modules"
# Under the sketch's data/ so the existing "ESP32 Sketch Data Upload" flow
# carries modules to FATFS. The /patterns subdirectory keeps them clear of the
# .pfv video clips that already share this partition.
OUT = SKETCH / "data" / "patterns"
BUILD = ROOT / "modules" / ".build"
PIO_HOME = Path(os.environ.get("PLATFORMIO_CORE_DIR", Path.home() / ".platformio"))

PANEL_W = 128
PANEL_H = 64

# -mlongcalls routes every call through an l32r literal, and
# -mtext-section-literals keeps those literals inside .text. Combined with
# toolchain/module.ld that makes all PC-relative fixups intra-section, so the
# device-side loader only has to patch absolute addresses.
#
# No -ffunction-sections here on purpose: it multiplies the section count and
# would force the loader to place (and relocate between) dozens of fragments.
# Headers the firmware and the modules genuinely share (pure math, no Arduino,
# no hardware). pf_module.h includes these rather than carrying a second copy.
SHARED_HEADERS = ["core_color.h", "core_math.h", "core_noise.h"]

# -Os matches how the Arduino core builds the firmware, but a module is not
# competing for the app partition: it is 6-22 KB in a 10 MB filesystem, so
# trading size for speed is nearly free here. --opt selects it.
DEFAULT_OPT = "s"

CXXFLAGS = [
    "-std=gnu++17",
    # Drops the vestigial <Arduino.h> from the shared headers above; a module
    # links freestanding with no Arduino core.
    "-DPF_MODULE_BUILD",
    "-fno-exceptions",
    "-fno-rtti",
    "-fno-threadsafe-statics",
    "-fno-use-cxa-atexit",
    "-fvisibility=hidden",
    "-fvisibility-inlines-hidden",
    "-mlongcalls",
    "-mtext-section-literals",
    "-Wall",
]


def toolchain_roots() -> list[Path]:
    """Where an xtensa-esp32s3 toolchain may live, most specific first.

    Patternflow's firmware and the community build worker are both arduino-cli,
    so the Arduino core's copy is the one that matches what devices actually
    run. PlatformIO is kept as a fallback for the fork this came from.
    """
    roots: list[Path] = []
    explicit = os.environ.get("PF_XTENSA_BIN")
    if explicit:
        roots.append(Path(explicit))

    arduino15 = os.environ.get("ARDUINO_DIRECTORIES_DATA")
    candidates = [Path(arduino15)] if arduino15 else []
    home = Path.home()
    candidates += [
        Path(os.environ.get("LOCALAPPDATA", home)) / "Arduino15",  # Windows
        home / "Library" / "Arduino15",                            # macOS
        home / ".arduino15",                                       # Linux / Pi
    ]
    for base in candidates:
        tools = base / "packages" / "esp32" / "tools"
        # esp-x32 is the unified toolchain in esp32 core 3.x; the older core
        # shipped it under xtensa-esp32s3-elf-gcc.
        roots += sorted(tools.glob("esp-x32/*/bin"))
        roots += sorted(tools.glob("xtensa-esp32s3-elf-gcc/*/bin"))

    roots += sorted((PIO_HOME / "packages").glob("toolchain-xtensa-esp32s3*/bin"))
    return roots


def find_tool(name: str) -> Path:
    searched = toolchain_roots()
    for root in searched:
        for suffix in ("", ".exe"):
            candidate = root / f"xtensa-esp32s3-elf-{name}{suffix}"
            if candidate.is_file():
                return candidate
    raise SystemExit(
        f"Could not find xtensa-esp32s3-elf-{name}.\n"
        "Looked in:\n  " + "\n  ".join(str(p) for p in searched) + "\n"
        "Install the ESP32 core in Arduino IDE / arduino-cli, or set PF_XTENSA_BIN "
        "to the directory holding the xtensa-esp32s3-elf-* binaries."
    )


def discover() -> list[Path]:
    return sorted(p for p in SRC_ROOT.iterdir() if (p / "pattern.cpp").is_file())


def is_ascii(path: Path) -> bool:
    try:
        str(path).encode("ascii")
    except UnicodeEncodeError:
        return False
    return True


def resolve_source(argument: Path) -> Path:
    """Accept a module directory as absolute, cwd-relative, or firmware-relative."""
    for candidate in (argument, Path.cwd() / argument, ROOT / argument):
        if (candidate / "pattern.cpp").is_file():
            return candidate.resolve()
    raise SystemExit(f"No pattern.cpp under {argument}")


def build_one(src_dir: Path, gxx: Path, compile_only: bool, abi: Path,
              build_dir: Path, out_dir: Path, opt: str = DEFAULT_OPT) -> tuple[str, bool, str]:
    slug = src_dir.name
    obj_dir = build_dir / slug
    obj_dir.mkdir(parents=True, exist_ok=True)
    obj = obj_dir / "pattern.o"

    cmd = [
        str(gxx),
        f"-O{opt}",
        *CXXFLAGS,
        f"-DPF_PANEL_W={PANEL_W}",
        f"-DPF_PANEL_H={PANEL_H}",
        f"-I{abi}",
        f"-I{SKETCH / 'src'}",
        f"-I{src_dir}",
        "-c",
        str(src_dir / "pattern.cpp"),
        "-o",
        str(obj),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return slug, False, proc.stdout + proc.stderr

    if compile_only:
        return slug, True, ""

    out_dir.mkdir(parents=True, exist_ok=True)
    pfm = out_dir / f"{slug}.pfm"
    # Relocatable link (-r): keeps relocations and the undefined libm/libgcc
    # references for the on-device loader to resolve against the host symbol
    # table, while module.ld collapses the image to .text/.rodata/.data/.bss.
    # --force-group-allocation dissolves the C++ COMDAT groups that would
    # otherwise survive a partial link, so module.ld really can collapse the
    # image down to .text/.rodata/.data/.bss at contiguous addresses.
    link_cmd = [
        str(gxx),
        "-nostdlib",
        "-Wl,-r",
        "-Wl,--force-group-allocation",
        "-Wl,-T," + str(build_dir / "module.ld"),
        "-o",
        str(pfm),
        str(obj),
    ]
    proc = subprocess.run(link_cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return slug, False, proc.stdout + proc.stderr

    meta_src = src_dir / "module.json"
    meta = json.loads(meta_src.read_text(encoding="utf-8")) if meta_src.is_file() else {}
    meta.update(
        {
            "slug": slug,
            "abi": 1,
            "panel_w": PANEL_W,
            "panel_h": PANEL_H,
            "module": f"{slug}.pfm",
            "size": pfm.stat().st_size,
            "opt": f"-O{opt}",
        }
    )
    (out_dir / f"{slug}.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return slug, True, ""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sources", nargs="*", type=Path)
    ap.add_argument("--all", action="store_true", help="Build every pattern in sdk/patterns")
    ap.add_argument("--compile-only", action="store_true", help="Skip link + manifest output")
    ap.add_argument("--clean", action="store_true", help="Remove previous build output first")
    ap.add_argument("--opt", default=DEFAULT_OPT, choices=["s", "1", "2", "3"],
                    help="Optimisation level (default: s, matching the firmware)")
    ap.add_argument("--out", type=Path, default=OUT,
                    help="Where to write <slug>.pfm/.json (default: the sketch data dir)")
    args = ap.parse_args()

    if args.clean:
        shutil.rmtree(BUILD, ignore_errors=True)
        shutil.rmtree(args.out, ignore_errors=True)

    dirs = discover() if args.all else [resolve_source(p) for p in args.sources]
    if not dirs:
        raise SystemExit("Nothing to build. Pass directories or --all.")

    gxx = find_tool("g++")

    # The Xtensa binutils cannot open files under a non-ASCII path on Windows:
    # it compiles every TU and then fails at link with a mojibake filename.
    # Patternflow's repo lives under a Korean directory name, so stage the
    # whole build in a temp ASCII tree and copy the artefacts back.
    staged = not all(is_ascii(p) for p in (ROOT, *dirs))
    with contextlib.ExitStack() as stack:
        if staged:
            stage = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="pf-mod-")))
            print(f"Non-ASCII repo path - staging build in {stage}")
            abi = stage / "abi"
            shutil.copytree(ABI, abi)
            # The shared firmware headers sit beside the ABI ones so a single
            # -I covers both, exactly as in the unstaged build.
            for name in SHARED_HEADERS:
                shutil.copyfile(SKETCH / "src" / name, abi / name)
            build_dir = stage / "build"
            out_dir = stage / "out"
            build_dir.mkdir(parents=True, exist_ok=True)
            sources = []
            for d in dirs:
                staged_src = stage / "src" / d.name
                shutil.copytree(d, staged_src)
                sources.append(staged_src)
        else:
            abi, build_dir, out_dir, sources = ABI, BUILD, args.out, dirs
            build_dir.mkdir(parents=True, exist_ok=True)

        shutil.copyfile(ROOT / "toolchain" / "module.ld", build_dir / "module.ld")

        failures: list[tuple[str, str]] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
            futures = [
                pool.submit(build_one, d, gxx, args.compile_only, abi, build_dir, out_dir, args.opt)
                for d in sources
            ]
            for fut in concurrent.futures.as_completed(futures):
                slug, ok, log = fut.result()
                print(f"{'OK  ' if ok else 'FAIL'}  {slug}")
                if not ok:
                    failures.append((slug, log))

        if staged and not args.compile_only and out_dir.is_dir():
            args.out.mkdir(parents=True, exist_ok=True)
            for produced in out_dir.iterdir():
                shutil.copyfile(produced, args.out / produced.name)

    print(f"\n{len(dirs) - len(failures)}/{len(dirs)} module(s) built")
    if failures:
        for slug, log in failures:
            print(f"\n=== {slug} ===\n{log}")
        sys.exit(1)
    if not args.compile_only:
        print(f"Output: {args.out}")


if __name__ == "__main__":
    main()
