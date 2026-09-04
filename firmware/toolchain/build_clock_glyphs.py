"""The clock's digits: a typeface rasterised once, into a blob both sides read.

    python firmware/toolchain/build_clock_glyphs.py --fetch
    python firmware/toolchain/build_clock_glyphs.py --inter Inter-Bold.ttf --bebas BebasNeue-Regular.ttf
    python firmware/toolchain/build_clock_glyphs.py --check      # is the header current?

The panel draws its clock from anti-aliased glyphs, not from a 1-bit font:
each digit is a cell of 4-bit alpha, blended over the pattern on the way to
the panel. Rendering a real typeface here, offline, is what makes that cheap
on the device and pretty on the panel — the firmware never rasterises text.

Five sets, two faces. Each set is the largest point size whose digits stay
inside its cell, so layouts fit the panels that exist:

    S, M, L   Inter Bold - the overlay styles, small print to a fat corner
              clock. The site's own face; clear at every size.
    C1, C2    Bebas Neue - the clip styles, where the digits ARE the picture:
              two rows fill a 64x64 (C1); hours over minutes fill a 64x128
              and four across fill a 128x64 (C2). Condensed, so two digits
              of it stand tall inside 64 pixels where Inter would only reach
              half way up.

Both are SIL Open Font License 1.1 (Inter 4.1 from its GitHub release; Bebas
Neue from google/fonts at a pinned commit); --fetch downloads exactly those.
The colon comes from the same face as its set, cropped to the digits'
vertical extent so it sits where the type designer put it.

Output, both from the same bytes:
    features/clock/clock_glyphs.h     PROGMEM array + CLOCK_GLYPHS_REV
    features/clock/clock_glyphs.bin   the file console_serve.py serves as
                                      /clock/glyphs.bin, so the page's preview
                                      draws the same pixels as the panel

Blob layout (little-endian):
    'PFG1'  u8 nsets
    nsets x [u8 h, u8 w, u8 colonW, u8 gap, u16 offset]
    per set at offset: 10 digit cells then the colon cell; a cell is h rows
    of ceil(width/2) bytes, two 4-bit alpha values per byte, even column in
    the high nibble.
"""
from __future__ import annotations

import argparse
import io
import os
import struct
import sys
import urllib.request
import zipfile
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
FEATURE = HERE.parent / "patternflow" / "features" / "clock"
HEADER = FEATURE / "clock_glyphs.h"
BLOB = FEATURE / "clock_glyphs.bin"

INTER_URL = "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip"
INTER_TTF = "extras/ttf/Inter-Bold.ttf"
BEBAS_URL = ("https://raw.githubusercontent.com/google/fonts/1e42f687f08eac15a39bde41db3d32198d269067"
             "/ofl/bebasneue/BebasNeue-Regular.ttf")
CACHE_DIR = Path.home() / ".cache" / "patternflow"
CACHE = {"inter": CACHE_DIR / "Inter-Bold-4.1.ttf", "bebas": CACHE_DIR / "BebasNeue-Regular.ttf"}

# name, face, max digit height, max cell width
SETS = [("S", "inter", 11, 7), ("M", "inter", 22, 14), ("L", "inter", 30, 19),
        ("C1", "bebas", 28, 30), ("C2", "bebas", 58, 26)]
DIGITS = "0123456789"


def fetch(face: str) -> Path:
    path = CACHE[face]
    if path.is_file():
        return path
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if face == "inter":
        print(f"fetching {INTER_URL}")
        data = urllib.request.urlopen(INTER_URL, timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            path.write_bytes(z.read(INTER_TTF))
    else:
        print(f"fetching {BEBAS_URL}")
        path.write_bytes(urllib.request.urlopen(BEBAS_URL, timeout=120).read())
    return path


def measure(font, text: str):
    x0, y0, x1, y1 = font.getbbox(text, anchor="ls")  # left, baseline
    return x0, y0, x1, y1


def fit(font_path: Path, max_h: int, max_w: int):
    """Largest point size whose digits fit the cell, and its metrics."""
    from PIL import ImageFont
    best = None
    for size in range(4, 200):
        font = ImageFont.truetype(str(font_path), size)
        boxes = [measure(font, d) for d in DIGITS]
        top = min(b[1] for b in boxes)
        bottom = max(b[3] for b in boxes)
        h = bottom - top
        w = max(b[2] - b[0] for b in boxes)
        if h > max_h or w > max_w:
            break
        best = (size, font, top, bottom, w)
    if not best:
        raise SystemExit(f"no size fits {max_h}x{max_w}")
    return best


def render_cell(font, text: str, top: int, bottom: int, cell_w: int):
    """An 'L' image of the glyph, cropped to the digits' vertical extent and
    centred in a cell of cell_w pixels."""
    from PIL import Image, ImageDraw
    x0, _, x1, _ = measure(font, text)
    ink_w = x1 - x0
    h = bottom - top
    img = Image.new("L", (cell_w, h), 0)
    draw = ImageDraw.Draw(img)
    # anchor "ls": (x, y) is the left edge at the baseline. Shift so the
    # ink's left lands at the centring offset and the baseline at -top.
    ox = (cell_w - ink_w) // 2 - x0
    draw.text((ox, -top), text, fill=255, font=font, anchor="ls")
    return img


def pack(img) -> bytes:
    w, h = img.size
    px = img.load()
    out = bytearray()
    for y in range(h):
        row = bytearray((w + 1) // 2)
        for x in range(w):
            a = (px[x, y] + 8) // 17
            if a > 15:
                a = 15
            if x & 1:
                row[x >> 1] |= a
            else:
                row[x >> 1] |= a << 4
        out += row
    return bytes(out)


def build(fonts: dict[str, Path]) -> tuple[bytes, list[str]]:
    sets = []
    report = []
    for name, face, max_h, max_w in SETS:
        size, font, top, bottom, w = fit(fonts[face], max_h, max_w)
        h = bottom - top
        cx0, _, cx1, _ = measure(font, ":")
        cw = max(1, cx1 - cx0)
        cells = b"".join(pack(render_cell(font, d, top, bottom, w)) for d in DIGITS)
        colon = pack(render_cell(font, ":", top, bottom, cw))
        gap = max(1, round(w / 8))
        sets.append((h, w, cw, gap, cells + colon))
        report.append(f"{name} ({face}): {size} pt -> digits {w}x{h}, colon {cw} wide, gap {gap}")
    header = b"PFG1" + bytes([len(sets)])
    off = len(header) + 6 * len(sets)
    table = b""
    data = b""
    for h, w, cw, gap, cells in sets:
        table += struct.pack("<BBBBH", h, w, cw, gap, off + len(data))
        data += cells
    return header + table + data, report


def emit_header(blob: bytes, report: list[str]) -> str:
    rev = zlib.crc32(blob) & 0xFFFF
    lines = []
    lines.append("// ═══════════════════════════════════════════════════════════")
    lines.append("// PatternFlow - the clock's digits, rasterised")
    lines.append("//")
    lines.append("// GENERATED by firmware/toolchain/build_clock_glyphs.py - do not edit.")
    lines.append("// Inter Bold (S, M, L) and Bebas Neue (C1, C2), both SIL Open Font License")
    lines.append("// 1.1, as 4-bit alpha cells; the same bytes are served as /clock/glyphs.bin so")
    lines.append("// the page's preview draws what the panel draws. Layout is documented in")
    lines.append("// the generator's docstring.")
    lines.append("//")
    for r in report:
        lines.append(f"//   {r}")
    lines.append("//")
    lines.append("// License: MIT (this file); the typeface's licence is the OFL.")
    lines.append("// ═══════════════════════════════════════════════════════════")
    lines.append("#pragma once")
    lines.append("#include <Arduino.h>")
    lines.append("")
    lines.append(f"#define CLOCK_GLYPHS_REV 0x{rev:04X}")
    lines.append(f"static const size_t CLOCK_GLYPHS_LEN = {len(blob)};")
    lines.append("static const uint8_t CLOCK_GLYPHS[] PROGMEM = {")
    for i in range(0, len(blob), 24):
        chunk = blob[i:i + 24]
        lines.append("  " + ",".join(f"0x{b:02X}" for b in chunk) + ",")
    lines.append("};")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inter", help="Inter-Bold.ttf to use instead of the cached copy")
    ap.add_argument("--bebas", help="BebasNeue-Regular.ttf to use instead of the cached copy")
    ap.add_argument("--fetch", action="store_true", help="download the pinned faces into ~/.cache if they are not there")
    ap.add_argument("--check", action="store_true", help="exit 1 if the header is not what these faces produce")
    args = ap.parse_args(argv)

    fonts = {}
    for face, override in (("inter", args.inter), ("bebas", args.bebas)):
        if override:
            fonts[face] = Path(override)
        elif args.fetch or CACHE[face].is_file():
            fonts[face] = fetch(face)
        else:
            ap.error(f"no {face} font: pass --{face} PATH or --fetch")
        if not fonts[face].is_file():
            raise SystemExit(f"font not found: {fonts[face]}")

    blob, report = build(fonts)
    header = emit_header(blob, report)
    if args.check:
        current = HEADER.read_text(encoding="utf-8") if HEADER.is_file() else ""
        if current.replace("\r\n", "\n") != header:
            print("clock_glyphs.h is stale - run build_clock_glyphs.py")
            return 1
        print("clock_glyphs.h is current")
        return 0
    HEADER.write_text(header, encoding="utf-8", newline="\n")
    BLOB.write_bytes(blob)
    for r in report:
        print("  " + r)
    print(f"wrote {HEADER.relative_to(HERE.parent.parent)} and clock_glyphs.bin ({len(blob)} bytes, rev 0x{zlib.crc32(blob) & 0xFFFF:04X})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
