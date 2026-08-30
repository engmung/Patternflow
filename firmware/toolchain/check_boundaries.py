"""The core/feature boundary, enforced mechanically.

    python firmware/toolchain/check_boundaries.py

The rule this checks is written at the top of patternflow.ino and in
docs/EDITIONS.md: the core names no feature. Not in an #include, not in an
#if, not by namespace. Every published firmware compiles the core unchanged,
so a feature that leaks into it ships to every edition at once.

The rule needed a checker because prose does not hold. It was violated three
separate times before this existed - the NETWORK screen's hard-coded
"OSC / AUD" hint, the console header's nav table, and the home page's feature
rows - each one capability-gated and well-intentioned, each one a core file
that knew a feature by name, and none of them caught by anything until a
person tripped over the symptom. The guards that DID hold all had teeth:
addons.h refuses a composition that defines neither macro, CI refuses a
console header that drifted from its HTML, platformio.ini names libraries
because the dependency finder cannot. This is the same idea aimed at the
boundary itself.

Four rules:

  R1  Core references no addon namespace. The namespace list is read from
      the addon directories themselves, so a brand-new feature is guarded
      the moment it declares `namespace PFAddonWhatever`.
  R2  Core includes nothing from the addon tree, except the two seams that
      ARE the boundary: the sketch includes the dispatcher, the pattern
      registry includes the preset seam.
  R3  Behavioural core - the sketch, src/, abi/ - takes no #if / #ifdef
      branch on a feature's flags: which features exist must not change what
      the core compiles to. config.h and net_config.h are exempt, because
      providing feature DEFAULTS is their entire job ("settings tune a
      feature, they never add one") and every #ifndef there is that.
  R4  Features do not include each other. Six directories, zero coupling;
      an edition is a set, not a stack.

License: MIT
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKETCH = ROOT / "patternflow"

# The one constant to touch if the directory is ever renamed (features/?).
ADDON_DIR = "addons"

# Files under addons/ that are the interface rather than a feature: the hook
# struct, the dispatcher, the composition, and the preset seam.
SEAM_FILES = {"pf_addon.h", "pf_addons.h", "addons.h", "addon_presets.h"}

# The two sanctioned core -> addons includes (core file, included seam file).
CORE_INCLUDE_ALLOW = {
    ("patternflow.ino", "pf_addons.h"),
    ("pattern_registry.h", "addon_presets.h"),
    # overrides.h is the composition's second file - config.h includes it
    # before any default precisely so an edition can reach every #ifndef.
    ("config.h", "overrides.h"),
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

# Same stripping check_sources.py uses: comments and raw strings blanked to
# same-length spaces so line numbers survive. A comment may mention an addon
# namespace freely - core_bus.h explains its own history that way.
RAW_STRING = re.compile(r'R"([A-Za-z_]*)\(.*?\)\1"', re.DOTALL)
LINE_COMMENT = re.compile(r"//[^\n]*")
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def blank_out(text: str, pattern: re.Pattern[str]) -> str:
    return pattern.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)


def stripped(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    for pattern in (RAW_STRING, BLOCK_COMMENT, LINE_COMMENT):
        text = blank_out(text, pattern)
    return text


def core_files() -> list[Path]:
    files = [SKETCH / "patternflow.ino"]
    for name in ("config.h", "net_config.h", "pattern_registry.h",
                 "patternflow_secrets.example.h"):
        p = SKETCH / name
        if p.exists():
            files.append(p)
    for sub in ("src", "abi"):
        files.extend(sorted((SKETCH / sub).rglob("*.h")))
    return files


def addon_subdirs() -> list[Path]:
    root = SKETCH / ADDON_DIR
    return sorted(d for d in root.iterdir() if d.is_dir())


def addon_namespaces(cores: list[Path]) -> dict[str, str]:
    """namespace name -> feature directory that declares it.

    A namespace the CORE declares belongs to the core, even where an addon
    re-opens it - core_audio_ws.h re-opens PatternflowPatternsHttp to
    forward-declare server(), which is the addon reaching toward the core
    (the allowed direction), not the core toward the addon. The first run
    of this checker attributed that namespace to addons/audio/ and flagged
    every legitimate core use of the core's own web server.
    """
    decl = re.compile(r"^\s*namespace\s+(\w+)", re.M)
    core_owned: set[str] = set()
    for p in cores:
        core_owned.update(decl.findall(stripped(p)))
    ns: dict[str, str] = {}
    for d in addon_subdirs():
        for h in d.rglob("*.h"):
            for name in decl.findall(stripped(h)):
                if name not in core_owned:
                    ns[name] = d.name
    return ns


def feature_flag_prefixes() -> list[str]:
    """PF_OSC, PF_AUDIO, ... derived from the directory names, so a new
    feature's flags are guarded without anyone editing this file."""
    return sorted({"PF_" + d.name.upper() for d in addon_subdirs()})


def main() -> int:
    violations: list[str] = []
    cores = core_files()
    namespaces = addon_namespaces(cores)
    prefixes = feature_flag_prefixes()

    ns_pattern = re.compile(
        r"\b(" + "|".join(re.escape(n) for n in sorted(namespaces)) + r")\b")
    include_pattern = re.compile(
        r'#\s*include\s+"([^"]*' + re.escape(ADDON_DIR) + r'/[^"]+)"')
    cond_pattern = re.compile(r"^\s*#\s*(if|elif|ifdef|ifndef)\b(.*)$", re.M)
    flag_pattern = re.compile(
        r"\b(" + "|".join(prefixes) + r")\w*\b")

    for path in cores:
        rel = path.relative_to(SKETCH).as_posix()
        text = stripped(path)
        raw = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()

        # R1 - namespaces
        for m in ns_pattern.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            violations.append(
                f"{rel}:{line}: core references {m.group(1)} "
                f"(a namespace of {ADDON_DIR}/{namespaces[m.group(1)]}/) - "
                f"reach it through a hook in pf_addon.h instead")

        # R2 - includes (checked on raw text: includes never sit in comments
        # we care about, and the historical ones are stripped anyway)
        for m in include_pattern.finditer(text):
            target = Path(m.group(1)).name
            if (path.name, target) in CORE_INCLUDE_ALLOW:
                continue
            line = text.count("\n", 0, m.start()) + 1
            violations.append(
                f"{rel}:{line}: core includes {m.group(1)} - only the "
                f"dispatcher and the preset seam cross this line")

        # R3 - branching on feature flags, in behavioural core only.
        if path.name not in ("config.h", "net_config.h"):
            for m in cond_pattern.finditer(text):
                flag = flag_pattern.search(m.group(2))
                if not flag:
                    continue
                line_no = text.count("\n", 0, m.start()) + 1
                violations.append(
                    f"{rel}:{line_no}: core branches on {flag.group(0)} - "
                    f"which features exist must not change what the core "
                    f"compiles to")

        _ = (raw, lines)  # raw text kept for future raw-only rules

    # R4 - feature isolation
    cross = re.compile(r'#\s*include\s+"\.\./([\w-]+)/')
    for d in addon_subdirs():
        for h in sorted(d.rglob("*.h")):
            text = stripped(h)
            for m in cross.finditer(text):
                target = m.group(1)
                if target == d.name:
                    continue
                line = text.count("\n", 0, m.start()) + 1
                rel = h.relative_to(SKETCH).as_posix()
                violations.append(
                    f"{rel}:{line}: feature {d.name} includes from "
                    f"{ADDON_DIR}/{target}/ - features do not know each "
                    f"other; an edition is a set, not a stack")

    if violations:
        print("the core/feature boundary is breached:\n")
        for v in violations:
            print("  " + v)
        print(f"\n{len(violations)} violation(s). The rule and its reasons: "
              f"docs/EDITIONS.md and the patternflow.ino header.")
        return 1

    print(f"boundary holds: {len(cores)} core files know none of "
          f"{len(namespaces)} feature namespaces across "
          f"{len(addon_subdirs())} features")
    return 0


if __name__ == "__main__":
    sys.exit(main())
