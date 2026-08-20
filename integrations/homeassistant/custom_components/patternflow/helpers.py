"""Pure translations between what the device says and what Home Assistant wants.

Deliberately free of Home Assistant imports so it can be tested without the
whole harness — these are the parts most likely to be wrong, and the cheapest
to check.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

# Fields every Patternflow build answers with, whatever is compiled out. Used to
# tell a real device from whatever else on the network answered a probe — the
# mDNS records carry nothing Patternflow-specific, so this is the confirmation.
_STATUS_SIGNATURE = ("version", "panel", "patterns")


def looks_like_patternflow(status: Any) -> bool:
    """Return True when this /api/status body could only be a device's."""
    if not isinstance(status, dict):
        return False
    return all(key in status for key in _STATUS_SIGNATURE)


def build_pattern_options(
    patterns: list[dict[str, Any]],
) -> tuple[list[str], dict[str, int]]:
    """Turn the device's pattern list into select options and a reverse map.

    Two things make this more than a list comprehension.

    Display names are not unique — nothing stops two modules carrying the same
    `name` in their sidecar, and the community is exactly where that happens. A
    colliding name gets its slug appended so the two options are distinguishable
    in the dropdown and, more importantly, so the reverse map does not lose one
    of them.

    Indices are not stable either: installing or deleting one `.pfm` renumbers
    everything after it. The map is therefore rebuilt from every poll of the
    list rather than cached across one.
    """
    names = Counter(str(entry.get("name", "")) for entry in patterns)

    options: list[str] = []
    by_option: dict[str, int] = {}

    for entry in patterns:
        index = entry.get("index")
        if not isinstance(index, int):
            continue
        name = str(entry.get("name", "")).strip() or f"Pattern {index + 1}"

        if names[str(entry.get("name", ""))] > 1:
            # The slug is the unambiguous thing a person can act on; a preset
            # has none, so fall back to the index it is sitting at.
            suffix = entry.get("module") or f"#{index + 1}"
            name = f"{name} ({suffix})"

        # Belt and braces: if two entries still collide the second would
        # silently overwrite the first in the reverse map, and selecting it
        # would switch to the wrong pattern.
        if name in by_option:
            name = f"{name} #{index + 1}"

        options.append(name)
        by_option[name] = index

    return options, by_option


def active_option(
    options: list[str], patterns: list[dict[str, Any]], active_index: int | None
) -> str | None:
    """Return the option label for the running pattern, if there is one.

    `active` is -1 while nothing is loaded — during a module reload, or after a
    load failure — which is a real state and not an error.
    """
    if active_index is None or active_index < 0:
        return None
    for position, entry in enumerate(patterns):
        if entry.get("index") == active_index and position < len(options):
            return options[position]
    return None


def active_slug(patterns: list[dict[str, Any]], active_index: int | None) -> str | None:
    """Return the running pattern's module slug, if it is a module at all.

    None for a preset compiled into the firmware, which has no slug and no
    sidecar — and therefore no knob labels and no readable `absoluteReady`.
    """
    if active_index is None or active_index < 0:
        return None
    for entry in patterns:
        if entry.get("index") == active_index:
            module = entry.get("module")
            return str(module) if module else None
    return None


def fps_from_frame_us(frame_us: Any) -> float | None:
    """Frames per second from the smoothed frame time.

    `frameUs` is 0 before the first frame is timed, and while the device is
    asleep the loop returns early without rendering — both are honestly "no
    frame rate" rather than a division by zero.
    """
    if not isinstance(frame_us, (int, float)) or frame_us <= 0:
        return None
    return round(1_000_000 / frame_us, 1)


def knob_labels(sidecar: dict[str, Any] | None) -> list[str]:
    """Return the four knob labels for a pattern, in logical order.

    Falls back to K1 to K4. That is the honest answer for a preset compiled into
    the firmware: its labels live in the C++ `PatternEntry` and are not exposed
    on any endpoint, so guessing would be worse than admitting it.
    """
    fallback = [f"K{i + 1}" for i in range(4)]
    if not isinstance(sidecar, dict):
        return fallback

    labels = sidecar.get("knobs")
    if not isinstance(labels, list):
        return fallback

    return [
        str(labels[i]).strip() or fallback[i]
        if i < len(labels) and labels[i] is not None
        else fallback[i]
        for i in range(4)
    ]
