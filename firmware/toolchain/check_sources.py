"""
Fast pre-compile sanity check on the firmware sources.

    python firmware/toolchain/check_sources.py

Three classes of bug, all of which have shipped from this repo and all of which
cost far more to find on the device than here:

1. A C string literal broken by a real newline. Patch scripts and shell
   heredocs mangle `\\n` into an actual line break; the compiler then reports
   "missing terminating character" thirty lines away from the cause.

2. A raw control byte where an escape belongs. The same mangling collapses
   `'\\0'` into a literal NUL. This one *compiles* - a NUL char literal has the
   value it should - so nothing fails; the file just quietly becomes binary to
   git, grep and every editor, and the next patch that touches it corrupts more.

3. A syntax error in a page's embedded JavaScript. The device serves the page
   fine, the browser refuses to run any of it, and the console looks blank and
   "broken" while every API underneath is healthy. Needs node on PATH; skipped
   with a warning if absent.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKETCH = ROOT / "patternflow"

# Sources are UTF-8 and full of em dashes; a cp949 console must not turn a
# report into a traceback.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

# Raw-string literals (R"TAG( ... )TAG") legitimately span lines.
RAW_STRING = re.compile(r'R"([A-Za-z_]*)\(.*?\)\1"', re.DOTALL)
LINE_COMMENT = re.compile(r"//[^\n]*")
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
CHAR_LITERAL = re.compile(r"'(?:\\.|[^'\\])'")


def blank_out(text: str, pattern: re.Pattern[str]) -> str:
    """Replace matches with same-length blanks so line numbers stay true."""
    return pattern.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)


def unterminated_strings(path: Path) -> list[tuple[int, str]]:
    """Lines where a "..." literal is still open at the newline.

    Walks character by character rather than regex-stripping comments first:
    `"http://x"` contains what looks like a line comment, and blanking that
    eats the closing quote and reports every URL in the tree as broken.
    """
    source = path.read_text(encoding="utf-8", errors="replace")
    # Raw strings are the one construct allowed to span lines.
    text = blank_out(source, RAW_STRING)
    lines = source.splitlines()

    bad: list[tuple[int, str]] = []
    in_block_comment = False
    line_number = 1
    index = 0
    in_string = False
    length = len(text)

    while index < length:
        char = text[index]

        if char == "\n":
            if in_string:
                bad.append((line_number, lines[line_number - 1].strip()[:90]))
                in_string = False  # report once, keep scanning the rest
            line_number += 1
            index += 1
            continue

        if in_block_comment:
            if text.startswith("*/", index):
                in_block_comment = False
                index += 2
            else:
                index += 1
            continue

        if in_string:
            if char == "\\":
                index += 2  # escape consumes the next character, newline included
                continue
            if char == '"':
                in_string = False
            index += 1
            continue

        # Outside a string: comments and char literals can start here.
        if text.startswith("//", index):
            while index < length and text[index] != "\n":
                index += 1
            continue
        if text.startswith("/*", index):
            in_block_comment = True
            index += 2
            continue
        if char == "'":
            match = CHAR_LITERAL.match(text, index)
            if match:
                index = match.end()
                continue
        if char == '"':
            in_string = True
        index += 1

    return bad


def control_bytes(path: Path) -> list[tuple[int, str]]:
    """Lines carrying a raw control byte, i.e. an escape that got flattened.

    Tab, LF and CR are the only ones that belong in a source file. Anything
    else here is the residue of a mangled `\\0`, `\\r` or `\\x1b`.
    """
    data = path.read_bytes()
    allowed = {0x09, 0x0A, 0x0D}
    found: list[tuple[int, str]] = []
    for offset, byte in enumerate(data):
        if byte < 0x20 and byte not in allowed:
            number = data.count(b"\n", 0, offset) + 1
            context = data[max(0, offset - 40) : offset + 40]
            found.append((number, context.decode("utf-8", "replace").replace("\n", " ")))
    return found


def page_scripts(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return re.findall(r"<script>(.*?)</script>", text, re.DOTALL)


def main() -> None:
    failures = 0

    headers = sorted(SKETCH.rglob("*.h")) + sorted(SKETCH.glob("*.ino"))
    headers = [h for h in headers if "build" not in h.parts]
    print(f"scanning {len(headers)} source files for broken string literals")
    for path in headers:
        for number, line in unterminated_strings(path):
            failures += 1
            print(f"  FAIL {path.relative_to(ROOT)}:{number}\n       {line}")

    print(f"\nscanning {len(headers)} source files for raw control bytes")
    for path in headers:
        for number, context in control_bytes(path):
            failures += 1
            print(f"  FAIL {path.relative_to(ROOT)}:{number} raw control byte")
            print(f"       {context}")

    node = shutil.which("node")
    pages = [p for p in SKETCH.rglob("*_index.h") if "build" not in p.parts]
    if not node:
        print(f"\nnode not found - skipping JS syntax check of {len(pages)} page(s)")
    else:
        print(f"\nchecking embedded JavaScript in {len(pages)} page(s)")
        for path in pages:
            for index, script in enumerate(page_scripts(path)):
                with tempfile.NamedTemporaryFile(
                    "w", suffix=".js", delete=False, encoding="utf-8"
                ) as handle:
                    handle.write(script)
                    temporary = handle.name
                result = subprocess.run(
                    [node, "--check", temporary], capture_output=True, text=True
                )
                Path(temporary).unlink(missing_ok=True)
                if result.returncode != 0:
                    failures += 1
                    detail = (result.stderr.strip().splitlines() or ["syntax error"])[:3]
                    print(f"  FAIL {path.relative_to(ROOT)} script #{index + 1}")
                    for line in detail:
                        print(f"       {line}")

    print("\nall checks passed" if failures == 0 else f"\n{failures} problem(s) found")
    sys.exit(0 if failures == 0 else 1)


if __name__ == "__main__":
    main()
