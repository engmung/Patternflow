#!/usr/bin/env python3
"""Relative links in Markdown must point at files that exist.

    python .github/scripts/check_links.py            # whole repository
    python .github/scripts/check_links.py README.md docs/EDITIONS.md

Only relative links are checked — `[text](path)`, `[text](path#anchor)` and
`<img src="path">` — resolved against the file that carries them. Anything
with a scheme (https:, mailto:), a bare `#anchor`, or a GitHub repo-relative
path like `../../releases` is left alone: this is not a reachability check,
it is the one that catches a renamed directory (addons/ → features/) leaving
a dead pointer in a contract document. Stdlib only; runs in a second.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import subprocess

ROOT = Path(__file__).resolve().parents[2]

# Vendored upstream code carries its own docs, with links into files upstream
# has and we did not copy. Not ours to fix.
SKIP_DIRS = {"hub75", "webserver", "pubsubclient"}
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
IMAGE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")
IMG_TAG = re.compile(r"<img[^>]+src=\"([^\"]+)\"")
FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")
# Paths that exist only on GitHub's side (repo-relative navigation).
GITHUB_ONLY = ("../../releases", "../../discussions", "../../issues")


def markdown_files(args: list[str]) -> list[Path]:
    """Tracked Markdown only: a gitignored PlatformIO clone under
    firmware/patternflow/lib/ ships hundreds of upstream docs, and none of
    them are the repository's promise."""
    if args:
        return [Path(a).resolve() for a in args]
    listed = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.md"],
        cwd=ROOT, check=True, capture_output=True).stdout
    out: list[Path] = []
    for rel in listed.decode("utf-8", errors="replace").split("\0"):
        if not rel:
            continue
        if SKIP_DIRS.intersection(Path(rel).parts):
            continue
        out.append(ROOT / rel)
    return sorted(out)


def targets(text: str) -> list[str]:
    text = FENCE.sub("", text)
    text = INLINE_CODE.sub("", text)
    found: list[str] = []
    for pattern in (LINK, IMAGE, IMG_TAG):
        found.extend(pattern.findall(text))
    return found


def is_local(target: str) -> bool:
    if "://" in target or target.startswith(("mailto:", "tel:", "#", "<")):
        return False
    if target.startswith(GITHUB_ONLY):
        return False
    if target.startswith("/"):
        return False  # site-absolute — a URL on patternflow.work, not a file
    return True


def main(argv: list[str]) -> int:
    broken: list[str] = []
    checked = 0
    for md in markdown_files(argv):
        text = md.read_text(encoding="utf-8", errors="replace")
        for raw in targets(text):
            if not is_local(raw):
                continue
            path = raw.split("#", 1)[0].split("?", 1)[0]
            if not path:
                continue
            checked += 1
            resolved = (md.parent / path).resolve()
            if not resolved.exists():
                rel = md.relative_to(ROOT).as_posix()
                broken.append(f"{rel}: {raw}")
    if broken:
        print(f"{len(broken)} broken relative link(s):")
        for b in broken:
            print("  " + b)
        return 1
    print(f"all {checked} relative links resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
