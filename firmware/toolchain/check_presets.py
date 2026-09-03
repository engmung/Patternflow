#!/usr/bin/env python3
"""The web presets and the firmware presets are twins; say so when they drift.

    python firmware/toolchain/check_presets.py

web/src/lib/presets/pattern-<slug>.ts is the source of truth and
firmware/patternflow/presets/preset_<slug>.h is generated from it (web spells
the slug with dashes, firmware with underscores). Two ways they drift, both
silent until now:

  - a firmware preset with no web twin: somebody edited C++ by hand, and the
    next regeneration from the web source will throw the edit away
  - a web preset with no firmware twin that nobody decided about: the ones
    that were deliberately left out are listed below, with the reason the
    firmware README gives; a new one has to be either ported or added here

Stdlib only; runs in a blink.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "src" / "lib" / "presets"
FIRMWARE = ROOT / "firmware" / "patternflow" / "presets"

# Web presets that intentionally have no .h. firmware/patternflow/README.md
# ("Not every pattern made the cut") gives the reason for the first eight:
# frame budget or rendering problems on the real ESP32. The rest were posted
# after the module loader made the compiled-in showcase unnecessary, and were
# never ported. Delete an entry here the day its .h lands.
WEB_ONLY = {
    "0516", "0517", "0519_2", "0524", "0524_2", "0526", "0529", "0530",
    "0609", "0614", "0614_2", "0619", "0622", "0624",
}

# Firmware presets with no web twin, on purpose. calib is the /api/display
# calibration overlay — device-side plumbing, not a pattern anyone composes.
FIRMWARE_ONLY = {"calib"}


def slugs(directory: Path, pattern: str) -> set[str]:
    rx = re.compile(pattern)
    out: set[str] = set()
    for p in directory.iterdir():
        m = rx.fullmatch(p.name)
        if m:
            out.add(m.group(1).replace("-", "_"))
    return out


def main() -> int:
    web = slugs(WEB, r"pattern-(.+)\.ts")
    web.discard("_TEMPLATE")
    firmware = slugs(FIRMWARE, r"preset_(.+)\.h")

    problems: list[str] = []
    for slug in sorted(firmware - web - FIRMWARE_ONLY):
        problems.append(
            f"firmware/patternflow/presets/preset_{slug}.h has no web twin - "
            f"the web preset is the source of truth; add "
            f"web/src/lib/presets/pattern-{slug.replace('_', '-')}.ts or list it as firmware-only")
    for slug in sorted(web - firmware - WEB_ONLY):
        problems.append(
            f"web/src/lib/presets/pattern-{slug.replace('_', '-')}.ts has no firmware twin - "
            f"port it to presets/preset_{slug}.h, or add it to WEB_ONLY with the reason")
    for slug in sorted(WEB_ONLY & firmware):
        problems.append(f"{slug} is listed as web-only but preset_{slug}.h exists - drop it from WEB_ONLY")
    for slug in sorted(WEB_ONLY - web):
        problems.append(f"{slug} is listed as web-only but there is no web preset by that name")

    if problems:
        print(f"{len(problems)} preset twin problem(s):")
        for p in problems:
            print("  " + p)
        return 1
    print(f"presets in step: {len(web & firmware)} twins, "
          f"{len(WEB_ONLY)} web-only on purpose, {len(FIRMWARE_ONLY)} firmware-only on purpose")
    return 0


if __name__ == "__main__":
    sys.exit(main())
