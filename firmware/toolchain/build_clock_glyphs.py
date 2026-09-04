"""The clock's digits: typefaces rasterised once, into a blob both sides read.

    python firmware/toolchain/build_clock_glyphs.py --fetch
    python firmware/toolchain/build_clock_glyphs.py --check        # is the header current?
    python firmware/toolchain/build_clock_glyphs.py --extra "My Face=path/to/face.ttf"
    python firmware/toolchain/build_clock_glyphs.py --extra "My Face=path/to/var.ttf:Bold"

The panel draws its clock from anti-aliased glyphs, not from a 1-bit font:
each digit is a cell of 4-bit alpha, and the frame is masked through it on
the way to the panel. Rendering real typefaces here, offline, is what makes
that cheap on the device and pretty on the panel - the firmware never
rasterises text, and it does not care which face a cell came from.

## Faces

FACES below is the shipped list: condensed display faces, because two digits
have to stand tall inside 64 pixels and a text face only reaches half way
up. Every one is SIL Open Font License 1.1, fetched from google/fonts at a
pinned commit (--fetch), so the same command reproduces the same bytes.

**To add a face:** drop a TTF anywhere and pass `--extra "Name=path.ttf"`
(append `:Bold` or another named instance for a variable font), or add a
line to FACES to ship it. The name is what /clock lists, fifteen characters
at most. Anything FreeType can open works, a hand-drawn face included; the
only requirement is digits 0-9 and a colon. Two sizes are cut per face:

    C1   two rows fill a 64x64
    C2   hours over minutes fill a 64x128; four across fill a 128x64

each the largest point size whose widest digit stays inside its cell, so
the layout code can pick "the tallest set that fits" without knowing the
face.

Output, both from the same bytes:
    features/clock/clock_glyphs.h     PROGMEM array + CLOCK_GLYPHS_REV
    features/clock/clock_glyphs.bin   the file console_serve.py serves as
                                      /clock/glyphs.bin, so the page's preview
                                      draws the same pixels as the panel

Blob layout (little-endian), version 2:
    'PFG2'  u8 nfaces
    per face:  16 bytes name (NUL-padded), u8 nsets,
               nsets x [u8 h, u8 w, u8 colonW, u8 gap, u16 offset]
    data:      per set at offset, 10 digit cells then the colon cell; a cell
               is h rows of ceil(width/2) bytes, two 4-bit alpha values per
               byte, even column in the high nibble.
"""
from __future__ import annotations

import argparse
import struct
import sys
import urllib.request
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
FEATURE = HERE.parent / "patternflow" / "features" / "clock"
HEADER = FEATURE / "clock_glyphs.h"
BLOB = FEATURE / "clock_glyphs.bin"

GF = "https://raw.githubusercontent.com/google/fonts/1e42f687f08eac15a39bde41db3d32198d269067/ofl/"
CACHE_DIR = Path.home() / ".cache" / "patternflow" / "clock-faces"

# name (<= 15 chars, what /clock lists), cache key, source, named instance
# for a variable font (None for a static one). Order is the order the page
# offers them; the first is the default.
FACES = [
    ("Bebas Neue", "bebas", GF + "bebasneue/BebasNeue-Regular.ttf", None),
    ("Anton", "anton", GF + "anton/Anton-Regular.ttf", None),
    ("Oswald", "oswald", GF + "oswald/Oswald%5Bwght%5D.ttf", "Bold"),
    ("Saira XCond", "saira", GF + "sairaextracondensed/SairaExtraCondensed-Bold.ttf", None),
    ("Barlow Cond", "barlow", GF + "barlowcondensed/BarlowCondensed-Bold.ttf", None),
    ("Six Caps", "sixcaps", GF + "sixcaps/SixCaps.ttf", None),
    ("Squada One", "squada", GF + "squadaone/SquadaOne-Regular.ttf", None),
]

# name, max digit height, max cell width
SETS = [("C1", 28, 30), ("C2", 58, 26)]
DIGITS = "0123456789"
NAME_BYTES = 16


def fetch(key: str, url: str) -> Path:
    path = CACHE_DIR / f"{key}.ttf"
    if path.is_file():
        return path
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"fetching {url}")
    path.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    return path


def load(path: Path, size: int, instance: str | None):
    from PIL import ImageFont
    font = ImageFont.truetype(str(path), size)
    if instance:
        try:
            font.set_variation_by_name(instance)
        except Exception as e:  # not a variable font, or no such instance
            raise SystemExit(f"{path.name}: cannot select instance {instance!r}: {e}")
    return font


def measure(font, text: str):
    x0, y0, x1, y1 = font.getbbox(text, anchor="ls")  # left, baseline
    return x0, y0, x1, y1


def fit(path: Path, instance: str | None, max_h: int, max_w: int):
    """Largest point size whose digits fit the cell, and its metrics."""
    best = None
    for size in range(4, 240):
        font = load(path, size, instance)
        boxes = [measure(font, d) for d in DIGITS]
        top = min(b[1] for b in boxes)
        bottom = max(b[3] for b in boxes)
        h = bottom - top
        w = max(b[2] - b[0] for b in boxes)
        if h > max_h or w > max_w:
            break
        best = (size, font, top, bottom, w)
    if not best:
        raise SystemExit(f"{path.name}: no size fits {max_h}x{max_w}")
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


def build_face(name: str, path: Path, instance: str | None, report: list[str]):
    sets = []
    for set_name, max_h, max_w in SETS:
        size, font, top, bottom, w = fit(path, instance, max_h, max_w)
        h = bottom - top
        cx0, _, cx1, _ = measure(font, ":")
        cw = max(1, cx1 - cx0)
        cells = b"".join(pack(render_cell(font, d, top, bottom, w)) for d in DIGITS)
        colon = pack(render_cell(font, ":", top, bottom, cw))
        gap = max(1, round(w / 8))
        sets.append((h, w, cw, gap, cells + colon))
        report.append(f"{name} {set_name}: {size} pt -> digits {w}x{h}, colon {cw} wide, gap {gap}")
    return sets


def build(faces: list[tuple[str, Path, str | None]]) -> tuple[bytes, list[str]]:
    report: list[str] = []
    built = [(name, build_face(name, path, inst, report)) for name, path, inst in faces]
    # Lay out: header, face table, then data - offsets are absolute.
    head_len = 5 + sum(NAME_BYTES + 1 + 6 * len(sets) for _, sets in built)
    table = b""
    data = b""
    for name, sets in built:
        nm = name.encode("utf-8")[: NAME_BYTES - 1]
        table += nm + b"\0" * (NAME_BYTES - len(nm)) + bytes([len(sets)])
        for h, w, cw, gap, cells in sets:
            table += struct.pack("<BBBBH", h, w, cw, gap, head_len + len(data))
            data += cells
    blob = b"PFG2" + bytes([len(built)]) + table + data
    assert len(b"PFG2") + 1 + len(table) == head_len
    return blob, report


def emit_header(blob: bytes, report: list[str], faces: list[str]) -> str:
    rev = zlib.crc32(blob) & 0xFFFF
    lines = []
    lines.append("// ═══════════════════════════════════════════════════════════")
    lines.append("// PatternFlow - the clock's digits, rasterised")
    lines.append("//")
    lines.append("// GENERATED by firmware/toolchain/build_clock_glyphs.py - do not edit.")
    lines.append("// " + ", ".join(faces) + " - every one SIL Open Font License 1.1 - as")
    lines.append("// 4-bit alpha cells, two sizes per face; the same bytes are served as")
    lines.append("// /clock/glyphs.bin so the page's preview draws what the panel draws.")
    lines.append("// Layout is documented in the generator's docstring; so is adding a face.")
    lines.append("//")
    for r in report:
        lines.append(f"//   {r}")
    lines.append("//")
    lines.append("// License: MIT (this file); the typefaces' licence is the OFL.")
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
    ap.add_argument("--fetch", action="store_true", help="download the shipped faces into ~/.cache if they are not there")
    ap.add_argument("--extra", action="append", default=[], metavar="NAME=PATH[:INSTANCE]",
                    help="add a face for this build (repeatable)")
    ap.add_argument("--check", action="store_true", help="exit 1 if the header is not what these faces produce")
    args = ap.parse_args(argv)

    faces: list[tuple[str, Path, str | None]] = []
    for name, key, url, inst in FACES:
        path = CACHE_DIR / f"{key}.ttf"
        if not path.is_file():
            if not args.fetch:
                ap.error(f"{name} is not cached at {path} - pass --fetch")
            path = fetch(key, url)
        faces.append((name, path, inst))
    for spec in args.extra:
        if "=" not in spec:
            ap.error(f"--extra wants NAME=PATH[:INSTANCE], got {spec!r}")
        name, rest = spec.split("=", 1)
        inst = None
        if ":" in rest and not Path(rest).is_file():
            rest, inst = rest.rsplit(":", 1)
        p = Path(rest)
        if not p.is_file():
            ap.error(f"--extra: no such file {p}")
        faces.append((name.strip(), p, inst))

    blob, report = build(faces)
    header = emit_header(blob, report, [f[0] for f in faces])
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
    print(f"wrote {HEADER.relative_to(HERE.parent.parent)} and clock_glyphs.bin "
          f"({len(blob)} bytes, {len(faces)} faces, rev 0x{zlib.crc32(blob) & 0xFFFF:04X})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
