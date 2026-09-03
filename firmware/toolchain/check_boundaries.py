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
features.h refuses a composition that defines neither macro, CI refuses a
console header that drifted from its HTML, platformio.ini names libraries
because the dependency finder cannot. This is the same idea aimed at the
boundary itself.

Four rules:

  R1  Core references no feature namespace. The namespace list is read from
      the feature directories themselves, so a brand-new feature is guarded
      the moment it declares `namespace PFFeatureWhatever`.
  R2  Core includes nothing from the feature tree, except the two seams that
      ARE the boundary: the sketch includes the dispatcher, the pattern
      registry includes the preset seam.
  R3  Behavioural core - the sketch, src/, abi/ - takes no #if / #ifdef
      branch on a feature's flags: which features exist must not change what
      the core compiles to. config.h and net_config.h are exempt: their job
      is #ifndef defaults ("settings tune a feature, they never add one"),
      and the exemption stays although a feature's own defaults now live in
      features/<name>/<name>_config.h rather than in net_config.h.
  R4  Features do not include each other. One directory each, zero coupling;
      an edition is a set, not a stack.
  R5  The core's console pages name no feature either. console/*.html whose
      header lands in src/, and the shared chrome in theme_index.h, are the
      core's user-facing text - and two of the three original violations
      lived exactly there (the nav table, the home page's feature rows).
      Rules 1-3 blank raw strings before scanning, so they could never see
      it; this one reads the page text with its comments stripped.

License: MIT
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKETCH = ROOT / "patternflow"

# The one constant to touch if the directory is ever renamed (features/?).
FEATURE_DIR = "features"

# Files under features/ that are the interface rather than a feature: the hook
# struct, the dispatcher, the composition, and the preset seam.
SEAM_FILES = {"pf_feature.h", "pf_features.h", "features.h", "feature_presets.h"}

# The two sanctioned core -> features includes (core file, included seam file).
CORE_INCLUDE_ALLOW = {
    ("patternflow.ino", "pf_features.h"),
    ("pattern_registry.h", "feature_presets.h"),
    # overrides.h is the composition's second file - config.h includes it
    # before any default precisely so an edition can reach every #ifndef.
    ("config.h", "overrides.h"),
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

# Same stripping check_sources.py uses: comments and raw strings blanked to
# same-length spaces so line numbers survive. A comment may mention a feature
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


def feature_subdirs() -> list[Path]:
    root = SKETCH / FEATURE_DIR
    return sorted(d for d in root.iterdir() if d.is_dir())


def feature_namespaces(cores: list[Path]) -> dict[str, str]:
    """namespace name -> feature directory that declares it.

    A namespace the CORE declares belongs to the core, even where a feature
    re-opens it - core_audio_ws.h re-opens PatternflowPatternsHttp to
    forward-declare server(), which is the feature reaching toward the core
    (the allowed direction), not the core toward the feature. The first run
    of this checker attributed that namespace to features/audio/ and flagged
    every legitimate core use of the core's own web server.
    """
    decl = re.compile(r"^\s*namespace\s+(\w+)", re.M)
    core_owned: set[str] = set()
    for p in cores:
        core_owned.update(decl.findall(stripped(p)))
    ns: dict[str, str] = {}
    for d in feature_subdirs():
        for h in d.rglob("*.h"):
            for name in decl.findall(stripped(h)):
                if name not in core_owned:
                    ns[name] = d.name
    return ns


def feature_flag_prefixes() -> list[str]:
    """PF_OSC, PF_AUDIO, ... derived from the directory names, so a new
    feature's flags are guarded without anyone editing this file."""
    return sorted({"PF_" + d.name.upper() for d in feature_subdirs()})


# What a feature looks like in prose. Derived by hand rather than from the
# directory names because the words a page would use are not the directory
# names: nobody writes "audio_in" in a sentence, everybody writes "microphone".
# Case-insensitive except the acronyms, which are only ever upper-case.
PAGE_MARKERS: dict[str, re.Pattern[str]] = {
    "osc": re.compile(r"\bOSC\b"),
    "mqtt": re.compile(r"\bMQTT\b"),
    "midi": re.compile(r"\bMIDI\b"),
    "ble": re.compile(r"\b(BLE|Bluetooth)\b"),
    "weather": re.compile(r"\bweather\b", re.I),
    "audio": re.compile(r"\b(audio|microphone|sound)\b", re.I),
    "show": re.compile(r"\b(sequences?|show player|director)\b", re.I),
}
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


def core_page_texts() -> list[tuple[str, str]]:
    """(label, text) for every page the core serves, comments blanked.

    Which pages are the core's is console_pages.py's PAGES list: a header
    under src/ is core, under features/ is a feature's. theme_index.h is the
    chrome every page loads, and it is core by construction.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from console_pages import PAGES  # noqa: E402

    out: list[tuple[str, str]] = []
    for name, header in PAGES:
        if not header.startswith("src/"):
            continue
        page = SKETCH / "console" / f"{name}.html"
        if page.exists():
            out.append((f"console/{name}.html",
                        page.read_text(encoding="utf-8", errors="replace")))
    theme = SKETCH / "src" / "theme_index.h"
    if theme.exists():
        raw = theme.read_text(encoding="utf-8", errors="replace")
        bodies = "\n".join(m.group(0) for m in RAW_STRING.finditer(raw))
        out.append(("src/theme_index.h (page text)", bodies))
    cleaned: list[tuple[str, str]] = []
    for label, text in out:
        for pattern in (HTML_COMMENT, BLOCK_COMMENT, LINE_COMMENT):
            text = blank_out(text, pattern)
        cleaned.append((label, text))
    return cleaned


def check_core_pages() -> list[str]:
    found: list[str] = []
    for label, text in core_page_texts():
        for feature, pattern in PAGE_MARKERS.items():
            for m in pattern.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                found.append(
                    f"{label}:{line}: a core page says \"{m.group(0)}\" - "
                    f"that is {FEATURE_DIR}/{feature}/ talking; the core does "
                    f"not know it exists. Let the feature add its own row.")
    return found


def main() -> int:
    violations: list[str] = []
    cores = core_files()
    namespaces = feature_namespaces(cores)
    prefixes = feature_flag_prefixes()

    ns_pattern = re.compile(
        r"\b(" + "|".join(re.escape(n) for n in sorted(namespaces)) + r")\b")
    include_pattern = re.compile(
        r'#\s*include\s+"([^"]*' + re.escape(FEATURE_DIR) + r'/[^"]+)"')
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
                f"(a namespace of {FEATURE_DIR}/{namespaces[m.group(1)]}/) - "
                f"reach it through a hook in pf_feature.h instead")

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
    for d in feature_subdirs():
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
                    f"{FEATURE_DIR}/{target}/ - features do not know each "
                    f"other; an edition is a set, not a stack")

    # R5 - the core's pages name no feature
    violations.extend(check_core_pages())

    if violations:
        print("the core/feature boundary is breached:\n")
        for v in violations:
            print("  " + v)
        print(f"\n{len(violations)} violation(s). The rule and its reasons: "
              f"docs/EDITIONS.md and the patternflow.ino header.")
        return 1

    print(f"boundary holds: {len(cores)} core files know none of "
          f"{len(namespaces)} feature namespaces across "
          f"{len(feature_subdirs())} features")
    return 0


if __name__ == "__main__":
    sys.exit(main())
