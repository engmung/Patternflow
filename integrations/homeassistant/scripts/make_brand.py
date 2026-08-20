#!/usr/bin/env python3
"""Render the Patternflow mark into the brand icons Home Assistant looks for.

    python3 scripts/make_brand.py

Writes into `custom_components/patternflow/brand/`, which is where a custom
integration puts its own brand images since Home Assistant 2026.3 — local ones
take priority over the brands CDN, and nothing has to be added to the manifest.
Without them a custom integration shows the generic puzzle piece.

Two of each, because the mark is near-black: `icon.png` for light themes and
`dark_icon.png` in the project's off-white for dark ones. Plus @2x at 512.

The source is `web/public/favicon.svg` — the same mark as the site's favicon,
so the integration cannot drift into a second, slightly different logo. That
file is a rectangle and four circles and nothing else, which is why this can
rasterise it with the standard library rather than pulling in a renderer: none
of the shapes overlap, so coverage is a plain sum.
"""

from __future__ import annotations

import math
import re
import struct
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
INTEGRATION = HERE.parent
REPO = INTEGRATION.parent.parent
SOURCE = REPO / "web/public/favicon.svg"
OUT_DIR = INTEGRATION / "custom_components/patternflow/brand"

#: The mark's own colour, for light backgrounds.
LIGHT_THEME_INK = (0x0A, 0x0A, 0x0A)
#: Patternflow's off-white, the same tone the dashboard card draws in.
DARK_THEME_INK = (0xED, 0xE7, 0xDB)

#: Breathing room inside the square, as a fraction of its side. The brands
#: guidance asks for the mark trimmed to minimal empty space; a hair of margin
#: keeps it off the edge without wasting the canvas.
MARGIN = 0.02

#: Subsample rows per output row. Horizontal coverage is computed exactly, so
#: this is the only place antialiasing is approximated.
SUBSAMPLES = 16


def parse_mark(svg: str) -> tuple[list[tuple[float, ...]], list[tuple[float, ...]]]:
    """Pull the rectangles and circles out of the mark."""
    rects = [
        (float(x), float(y), float(w), float(h))
        for x, y, w, h in re.findall(
            r'<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"',
            svg,
        )
    ]
    circles = [
        (float(cx), float(cy), float(r))
        for cx, cy, r in re.findall(
            r'<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"', svg
        )
    ]
    if not rects and not circles:
        raise SystemExit(f"no shapes found in {SOURCE}")
    return rects, circles


def bounding_box(rects, circles) -> tuple[float, float, float, float]:
    """Return the mark's extent, so it can be trimmed and centred."""
    xs: list[float] = []
    ys: list[float] = []
    for x, y, w, h in rects:
        xs += [x, x + w]
        ys += [y, y + h]
    for cx, cy, r in circles:
        xs += [cx - r, cx + r]
        ys += [cy - r, cy + r]
    return min(xs), min(ys), max(xs), max(ys)


def coverage(size: int, rects, circles) -> list[list[float]]:
    """Per-pixel ink coverage, 0..1, for a square canvas of `size`.

    Scanline rather than point sampling: for one horizontal line the rectangle
    is an interval and each circle is an interval, so a row is a handful of
    spans added onto the row's accumulator with exact partial coverage at the
    ends. None of the mark's shapes overlap, so the spans simply add.
    """
    x0, y0, x1, y1 = bounding_box(rects, circles)
    span = max(x1 - x0, y1 - y0)
    scale = size * (1 - 2 * MARGIN) / span
    # Centre what is left over on each axis.
    offset_x = (size - (x1 - x0) * scale) / 2
    offset_y = (size - (y1 - y0) * scale) / 2

    def to_px(value: float, low: float, offset: float) -> float:
        return (value - low) * scale + offset

    rows = [[0.0] * size for _ in range(size)]

    for py in range(size):
        row = rows[py]
        for sub in range(SUBSAMPLES):
            # Sample line in SVG space.
            py_centre = py + (sub + 0.5) / SUBSAMPLES
            sy = (py_centre - offset_y) / scale + y0

            spans: list[tuple[float, float]] = []
            for rx, ry, rw, rh in rects:
                if ry <= sy <= ry + rh:
                    spans.append((rx, rx + rw))
            for cx, cy, r in circles:
                dy = sy - cy
                if abs(dy) < r:
                    dx = math.sqrt(r * r - dy * dy)
                    spans.append((cx - dx, cx + dx))

            weight = 1.0 / SUBSAMPLES
            for left, right in spans:
                add_span(row, to_px(left, x0, offset_x), to_px(right, x0, offset_x), weight)

    return rows


def add_span(row: list[float], left: float, right: float, weight: float) -> None:
    """Add a horizontal span to one row, with exact coverage at both ends."""
    size = len(row)
    left = max(0.0, min(float(size), left))
    right = max(0.0, min(float(size), right))
    if right <= left:
        return

    first, last = int(left), min(int(right), size - 1)
    if first == last:
        row[first] += (right - left) * weight
        return

    row[first] += (first + 1 - left) * weight
    for px in range(first + 1, last):
        row[px] += weight
    row[last] += (right - last) * weight


def write_png(path: Path, size: int, rows: list[list[float]], ink: tuple[int, int, int]) -> None:
    """Write 8-bit RGBA. Transparent everywhere the mark is not."""
    red, green, blue = ink
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type: none
        for value in row:
            alpha = round(max(0.0, min(1.0, value)) * 255)
            raw += bytes((red, green, blue, alpha))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    """Render every size and theme."""
    rects, circles = parse_mark(SOURCE.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for size, suffix in ((256, ""), (512, "@2x")):
        rows = coverage(size, rects, circles)
        for name, ink in (("icon", LIGHT_THEME_INK), ("dark_icon", DARK_THEME_INK)):
            path = OUT_DIR / f"{name}{suffix}.png"
            write_png(path, size, rows, ink)
            print(f"  {path.relative_to(REPO)}  {size}x{size}  {path.stat().st_size:,} B")


if __name__ == "__main__":
    main()
