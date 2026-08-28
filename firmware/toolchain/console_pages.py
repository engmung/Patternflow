"""Console pages: edit them as HTML, ship them as PROGMEM.

The device serves each console page from a C string literal in a header —
the right thing to ship, the wrong thing to work on. A page inside
`R"HTML(...)HTML"` cannot be opened in a browser, cannot be saved and
reloaded, and cannot be handed to someone who designs in HTML. Iterating on
one meant build, flash, look, repeat.

So the HTML lives in console/*.html, and this splices it back:

    python firmware/toolchain/console_pages.py extract   # .h  -> .html
    python firmware/toolchain/console_pages.py build     # .html -> .h
    python firmware/toolchain/console_pages.py check     # are they in sync?

Pair it with console_serve.py and the loop becomes save-and-refresh.

This replaces ONLY the bytes between `R"HTML(` and `)HTML";`. Everything
else in the header — the doc comment explaining what the page is for, the
includes, `static` or not — is left exactly as it was. That matters: those
comments carry design intent and attribution that a whole-file generator
would quietly delete, and the storage class is not this tool's business.

`extract` is lossless by construction (build right after it is a no-op),
and `build` is idempotent.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKETCH = os.path.normpath(os.path.join(HERE, "..", "patternflow"))
HTML_DIR = os.path.join(SKETCH, "console")

# page name -> header path, relative to the sketch. Order is the console's
# own nav order, so `check` output reads like the site map.
PAGES = [
    ("home", "src/home_index.h"),
    ("patterns", "src/patterns_index.h"),
    ("status", "src/status_index.h"),
    ("wifi", "src/wifi_index.h"),
    ("update", "src/web_update_index.h"),
    ("show", "addons/show/show_index.h"),
    ("weather", "addons/weather/weather_index.h"),
    ("mqtt", "addons/mqtt/mqtt_index.h"),
]

OPEN = 'R"HTML('
CLOSE = ')HTML";'

# Dropped into the header's existing comment block, once, so someone opening
# the .h is told where the real source is before they start editing PROGMEM.
NOTE = (
    "// The page body below is generated from console/{name}.html — edit that,\n"
    "// then run: python firmware/toolchain/console_pages.py build\n"
)
NOTE_MARK = "generated from console/"


def header_path(rel):
    return os.path.join(SKETCH, rel.replace("/", os.sep))


def html_path(name):
    return os.path.join(HTML_DIR, name + ".html")


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def split(text, name):
    """prefix, body, suffix — the literal's contents and everything around it."""
    a = text.find(OPEN)
    if a < 0:
        raise SystemExit(name + ': no R"HTML( in the header')
    a += len(OPEN)
    b = text.find(CLOSE, a)
    if b < 0:
        raise SystemExit(name + ": no )HTML\"; closing the literal")
    if text.find(OPEN, b) >= 0:
        raise SystemExit(name + ": more than one HTML literal — splice by hand")
    return text[:a], text[a:b], text[b:]


def with_note(prefix, name):
    """Add the where-to-edit note to the header's comment block, once."""
    if NOTE_MARK in prefix:
        return prefix
    note = NOTE.format(name=name)
    # Land it at the end of the leading comment block, above #pragma once,
    # so it reads as the last thing the file says about itself.
    m = re.search(r"^#pragma once", prefix, re.M)
    if not m:
        return prefix
    nl = "\r\n" if "\r\n" in prefix else "\n"
    if nl == "\r\n":
        note = note.replace("\n", "\r\n")
    return prefix[: m.start()] + note + prefix[m.start() :]


def cmd_extract():
    for name, rel in PAGES:
        _, body, _ = split(read(header_path(rel)), name)
        write(html_path(name), body)
        print("  %-9s <- %s" % (name + ".html", rel))
    print("\n%d pages extracted. `build` now is a no-op apart from the" % len(PAGES))
    print("edit-me note; anything else in the diff is a bug in this script.")


def cmd_build():
    changed = 0
    for name, rel in PAGES:
        src = html_path(name)
        if not os.path.exists(src):
            raise SystemExit(name + ": " + src + " missing (run extract first)")
        dest = header_path(rel)
        old = read(dest)
        prefix, _, suffix = split(old, name)
        new = with_note(prefix, name) + read(src) + suffix
        if new == old:
            continue
        write(dest, new)
        changed += 1
        print("  wrote", rel)
    print(("%d header(s) updated" % changed) if changed else "already up to date")


def cmd_check():
    stale = []
    for name, rel in PAGES:
        src = html_path(name)
        if not os.path.exists(src):
            stale.append(name + " (no .html)")
            continue
        prefix, body, suffix = split(read(header_path(rel)), name)
        if body != read(src) or with_note(prefix, name) != prefix:
            stale.append(name)
    if stale:
        print("out of sync: " + ", ".join(stale))
        print("run: python firmware/toolchain/console_pages.py build")
        return 1
    print("all %d console headers match their HTML" % len(PAGES))
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "extract":
        cmd_extract()
    elif cmd == "build":
        cmd_build()
    elif cmd == "check":
        sys.exit(cmd_check())
    else:
        print(__doc__)
        sys.exit(2)
