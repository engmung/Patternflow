# -*- coding: utf-8 -*-
"""Assemble console/audio-in.html, the panel's /audio-in page, from its sources.

    python firmware/toolchain/console_pages.py build          # the build: this page, then every header
    python firmware/toolchain/console_pages.py check          # everything in sync, this page included

    python firmware/toolchain/build_audio_in_page.py          # only assemble this page
    python firmware/toolchain/build_audio_in_page.py --check  # CI: page == sources, and inside its budget
    --sketch DIR    work on another copy of firmware/patternflow (as console_pages.py)

/audio-in is the one console page that is not written as a page. Its editor is
the browser extension's mapping editor, copied, never re-extracted, so the two
cannot drift apart; what is the panel's own sits beside the other console
sources. This script holds none of their text:

    tools/patternflow-audio-extension/
      editor.html    the markup: its <div class="page"> block is taken, and the
                     <script src> tags after it say which scripts, in which order
      editor.css     the editor's styles
      editor.js      the editor; it reaches its host only through window.PFAdapter
      (any other script editor.html loads is taken the same way)
    firmware/patternflow/console/     (underscore: sources, not pages)
      _audio_in_bar.html     the device bar, put right after the editor's </header>
      _audio_in.css          the panel's styles, after the editor's
      _audio_in_adapter.js   window.PFAdapter over fetch('/api/audio-in'): taken where
                             editor.html loads editor-adapter.js, its twin for
                             the extension

Edit those, run `console_pages.py build`. Never edit console/audio-in.html or
features/audio_in/audio_in_index.h: both are generated, and CI fails on a page
that is not what its sources assemble to.

ASSEMBLING IS ALL IT DOES, except for one thing: what the sources say to the
person reading them does not travel. From every source it drops

    whole-line // comments (JS), /* */ comments (CSS), <!-- --> comments (HTML),
    leading and trailing whitespace, and blank lines.

That is a quarter of the page on the wire, on a link measured at 2-5 KB/s, and
it lets the sources stay as commented as they need to be. It is done line by
line, with no JavaScript tokenizer, so it is only safe while a line break in
the source is never inside a token. Rather than trust that, the build FAILS on
the constructs that would break it: a JS line with an odd number of backticks
(a template literal left open across lines), a JS line ending in a backslash,
a CSS comment opened inside a quoted string, and <pre>/<textarea>/<script>/
<style> in the markup. A comment after code on the same line is left alone:
telling `// note` from the // in 'http://x' is what would need the tokenizer.
Line numbers in the browser's console are therefore the generated page's, not
the source's.

A script the extension shares with the panel may have a tail the panel has no
use for. A comment line that says only EXTENSION ONLY (a rule drawn around the
words is fine) ends what is taken from it.

THE BUDGET. `--check` also fails when the page, stamped and gzipped as the panel
sends it, is over BUDGET bytes: see the comment there.

Other tools import this: assemble(sketch) returns the page, sources(sketch) the
files it is made from, check(sketch) what is wrong. A bad source raises
BuildError (a ValueError), which is what console_pages.stamp raises too.

License: MIT
"""
from __future__ import annotations

import argparse
import gzip
import io
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EXT = ROOT / 'tools' / 'patternflow-audio-extension'
SKETCH = ROOT / 'firmware' / 'patternflow'

PAGE = 'audio-in'
EDITOR_HTML, EDITOR_CSS, EDITOR_JS = 'editor.html', 'editor.css', 'editor.js'
EXT_ADAPTER = 'editor-adapter.js'  # the extension's PFAdapter; the panel's goes in its place
BAR_FILE, CSS_FILE, ADAPTER_FILE = '_audio_in_bar.html', '_audio_in.css', '_audio_in_adapter.js'
# The line a shared script is taken down to: a comment that says only this
# (a rule drawn around the words is fine; a sentence that mentions them is not).
EXTENSION_ONLY = re.compile(r'//\W*EXTENSION ONLY\W*')

# Bytes of the page as the panel sends it: stamped by console_pages.py (the
# chrome's ?h= and the fallback PF), gzip -9. This is the heaviest page the
# console has, and on the panel's own hotspot (2-5 KB/s measured) a kilobyte is
# 0.2 to 0.5 s before anything paints - so, like check_footprint.py's PINS, it
# is pinned, and growing it is a decision somebody makes rather than something
# that happens. It was 19,920 before the page stopped shipping its sources'
# comments and about 15,300 right after. To raise it, change the number and say
# in the commit what the bytes bought. (zlib builds differ by a few bytes for
# the same input; a page that close to the line is over it.)
BUDGET = 17500

# The one comment that does travel: whoever opens the generated page is told
# not to edit it. Short, because the panel serves it too.
GENERATED = '<!-- GENERATED by firmware/toolchain/build_audio_in_page.py from its sources: edit those -->'


class BuildError(ValueError):
    """A source this page cannot be assembled from; the message says which."""


# ── the sources ────────────────────────────────────────────────────────────

def console_dir(sketch=None) -> Path:
    return Path(sketch or SKETCH) / 'console'


def out_path(sketch=None) -> Path:
    return console_dir(sketch) / (PAGE + '.html')


def shown(path) -> str:
    try:
        return Path(path).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def text_of(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')  # universal newlines: LF from here on
    except OSError as e:
        raise BuildError('%s: %s' % (shown(path), e.strerror or e))


SCRIPT_TAG = re.compile(r'<script src="([^"]+)"></script>')


def script_files(editor_html: str, sketch=None) -> list:
    """(name, path) of each script the page carries: the ones editor.html
    loads, in its order, with the extension's adapter swapped for the panel's."""
    names = SCRIPT_TAG.findall(editor_html)
    if len(names) != editor_html.lower().count('<script'):
        raise BuildError(EDITOR_HTML + ': every script must be a plain '
                         '<script src="file.js"></script>; one here is not')
    for need in (EXT_ADAPTER, EDITOR_JS):
        if names.count(need) != 1:
            raise BuildError('%s: must load %s exactly once' % (EDITOR_HTML, need))
    return [(ADAPTER_FILE, console_dir(sketch) / ADAPTER_FILE) if name == EXT_ADAPTER
            else (name, EXT / name) for name in names]


def sources(sketch=None) -> list:
    """The files the page is assembled from. A preview server watches these
    to know the page changed; it never raises, so that it can."""
    console = console_dir(sketch)
    try:
        scripts = [path for _, path in script_files(text_of(EXT / EDITOR_HTML), sketch)]
    except BuildError:
        scripts = [console / ADAPTER_FILE, EXT / EDITOR_JS]
    return [EXT / EDITOR_HTML, EXT / EDITOR_CSS, console / BAR_FILE, console / CSS_FILE] + scripts


# ── what does not travel ───────────────────────────────────────────────────
# Each takes a source's text and the name to blame, and returns it lean. See
# the docstring for why these are line rules and what they refuse.

def lean_lines(lines) -> str:
    return '\n'.join(s for s in (line.strip() for line in lines) if s)


def lean_js(text: str, name: str) -> str:
    out = []
    for n, line in enumerate(text.split('\n'), 1):
        s = line.strip()
        if EXTENSION_ONLY.fullmatch(s):
            break
        if s.startswith('//') and '*/' in s:
            raise BuildError(
                '%s:%d: a // line holding */. If it closes a block comment, dropping '
                'the line would leave that comment open; reword it.' % (name, n))
        if not s or s.startswith('//'):
            continue
        if s.count('`') % 2:
            raise BuildError(
                '%s:%d: an odd number of backticks. A template literal that runs past '
                'the end of its line would have its inside stripped; keep each on one '
                'line (or build the string with +).' % (name, n))
        if s.endswith('\\'):
            raise BuildError(
                '%s:%d: the line ends in a backslash. A string continued onto the next '
                'line would lose that line\'s indentation; join it with + instead.' % (name, n))
        out.append(s)
    text = '\n'.join(out)
    if '</script' in text.lower():
        raise BuildError('%s: "</script" would end the page\'s <script> early' % name)
    return text


def lean_css(text: str, name: str) -> str:
    out, at = [], 0
    while True:
        a = text.find('/*', at)
        if a < 0:
            out.append(text[at:])
            break
        out.append(text[at:a])
        before = ''.join(out).rsplit('\n', 1)[-1]  # this line, earlier comments already gone
        if before.count('"') % 2 or before.count("'") % 2:
            raise BuildError(
                '%s:%d: /* inside a quoted string; this build would cut it out as a comment'
                % (name, text.count('\n', 0, a) + 1))
        b = text.find('*/', a + 2)
        if b < 0:
            raise BuildError('%s:%d: a /* comment that never closes'
                             % (name, text.count('\n', 0, a) + 1))
        out.append(' ')  # a comment separates tokens: `a/**/b` is not `ab`
        at = b + 2
    text = lean_lines(''.join(out).split('\n'))
    if '</style' in text.lower():
        raise BuildError('%s: "</style" would end the page\'s <style> early' % name)
    return text


def lean_html(text: str, name: str) -> str:
    for tag in ('pre', 'textarea', 'script', 'style'):
        if re.search(r'<%s\b' % tag, text, re.I):
            raise BuildError(
                '%s: <%s> in the markup. This build strips indentation and comments '
                'line by line, which is not safe inside one.' % (name, tag))
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    if '<!--' in text:
        raise BuildError('%s: a <!-- comment that never closes' % name)
    return lean_lines(text.split('\n'))


# ── the page ───────────────────────────────────────────────────────────────

def assemble(sketch=None) -> str:
    """The page, LF line endings, exactly as console/audio-in.html holds it.
    Raises BuildError when a source is missing or cannot be stripped safely."""
    console = console_dir(sketch)
    editor_html = text_of(EXT / EDITOR_HTML)

    # The editor's body: its .page block, up to the scripts that follow it.
    block = re.search(r'<div class="page">.*</div>\s*(?=<script)', editor_html, re.S)
    if not block:
        raise BuildError(EDITOR_HTML + ': no <div class="page"> block ahead of its scripts')
    body = lean_html(block.group(0), EDITOR_HTML)
    if body.count('</header>') != 1:
        raise BuildError(EDITOR_HTML + ': the device bar goes after </header>, and there '
                         'must be exactly one')
    bar = lean_html(text_of(console / BAR_FILE), BAR_FILE)
    body = body.replace('</header>', '</header>\n' + bar)

    css = '\n'.join((lean_css(text_of(EXT / EDITOR_CSS), EDITOR_CSS),
                     lean_css(text_of(console / CSS_FILE), CSS_FILE)))

    # One <script> per file, as editor.html has them: they are separate
    # programs ('use strict' is editor.js's own), sharing only the globals.
    scripts = []
    for name, path in script_files(editor_html, sketch):
        scripts += ['<script>', lean_js(text_of(path), name), '</script>']

    return '\n'.join([
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<script src="/pf-console.js"></script>',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>Patternflow - Mic mapping</title>',
        GENERATED,
        '<style>', css, '</style>',
        '</head>',
        '<body>',
        body,
    ] + scripts + [
        '</body>',
        '</html>',
        '',
    ])


def stamped_gzip(page: str, sketch=None) -> int:
    """Bytes of `page` as the panel sends it: console_pages.py's own stamp and
    its own gzip, so this cannot measure something other than what ships."""
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))
    import console_pages as cp

    sk = Path(sketch or SKETCH)
    name, rel, delim = cp.CHROME
    try:
        _, chrome, _ = cp.split(cp.read(str(sk / rel)), name, delim)
        shim = cp.load_shim(str(sk / 'console' / cp.SHIM_FILE))
        stamped = cp.stamp(page, cp.crc_of(chrome), shim, PAGE)
    except (OSError, ValueError) as e:
        raise BuildError(str(e))
    return len(gzip.compress(cp.payload(stamped), compresslevel=9, mtime=0))


def weight(page: str, sketch=None):
    """(gzip bytes as the panel sends it, one line saying so against the budget)."""
    gz = stamped_gzip(page, sketch)
    return gz, '%d bytes, %d gzip -9 as the panel sends it (budget %d, %s)' % (
        len(page.encode('utf-8')), gz, BUDGET,
        '%d spare' % (BUDGET - gz) if gz <= BUDGET else '%d OVER' % (gz - BUDGET))


def on_disk(sketch=None):
    """The page as written, LF, or None when there is none."""
    out = out_path(sketch)
    return out.read_text(encoding='utf-8') if out.exists() else None


def write(sketch=None):
    """Assemble and write the page. Returns (page, changed). Line endings stay
    the file's own (a Windows checkout is CRLF, as every file around it), and a
    page that already says this is not rewritten, so a build with nothing to
    do touches nothing."""
    page = assemble(sketch)
    out = out_path(sketch)
    if on_disk(sketch) == page:
        return page, False
    nl = '\r\n' if out.exists() and b'\r\n' in out.read_bytes() else '\n'
    with io.open(out, 'w', encoding='utf-8', newline='') as f:
        f.write(page.replace('\n', nl))
    return page, True


def check(sketch=None) -> list:
    """What is wrong, as lines to print; [] when the page on disk is what the
    sources assemble to and is inside its budget."""
    try:
        page = assemble(sketch)
        gz, _ = weight(page, sketch)
    except BuildError as e:
        return ['console/%s.html cannot be assembled: %s' % (PAGE, e)]
    problems = []
    if on_disk(sketch) != page:
        problems.append(
            'console/%s.html is not what its sources assemble to (one of them was '
            'edited, or the page was edited by hand).\n'
            '  run: python firmware/toolchain/console_pages.py build' % PAGE)
    if gz > BUDGET:
        problems.append(
            'console/%s.html is %d bytes gzip -9 as the panel sends it: %d over its '
            'budget of %d.\n'
            '  On the panel\'s own hotspot every kilobyte is 0.2 to 0.5 s before anything '
            'paints.\n'
            '  Take the bytes back out, or raise BUDGET in '
            'firmware/toolchain/build_audio_in_page.py and say in the commit what they bought.'
            % (PAGE, gz, gz - BUDGET, BUDGET))
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description='Assemble console/audio-in.html from its sources. '
                    'The usual way in is console_pages.py build.')
    ap.add_argument('--check', action='store_true',
                    help='write nothing: fail if the page on disk is not what the sources '
                         'assemble to, or is over its size budget')
    ap.add_argument('--sketch', metavar='DIR',
                    help='another copy of firmware/patternflow to read console/_audio_in* '
                         'from and write the page into')
    args = ap.parse_args(argv)
    # Sources are UTF-8 and so are their names in a report; a cp949 console
    # must not turn one into a traceback.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(errors='replace')

    if args.check:
        problems = check(args.sketch)
        for problem in problems:
            print(problem, file=sys.stderr)
        if problems:
            return 1
        print('console/%s.html is what its sources assemble to: %s'
              % (PAGE, weight(assemble(args.sketch), args.sketch)[1]))
        return 0

    try:
        page, changed = write(args.sketch)
        gz, line = weight(page, args.sketch)
    except BuildError as e:
        print('build_audio_in_page: %s' % e, file=sys.stderr)
        return 1
    print('%s %s: %s' % ('wrote' if changed else 'unchanged', shown(out_path(args.sketch)), line))
    if gz > BUDGET:
        print('  over its size budget: --check (and CI) fails until it is not', file=sys.stderr)
    if changed:
        print('the header still has to be baked: python firmware/toolchain/console_pages.py build '
              '(which also does this step)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
