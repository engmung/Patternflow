"""Cut and publish a Patternflow release - the ten steps of docs/RELEASING.md as
two commands, so a release is a habit rather than an afternoon.

    python firmware/toolchain/release.py cut v3.9.4 --audio v0.5.4 --performance v0.2.4
    python firmware/toolchain/release.py publish v3.9.4 --notes notes.md

`cut` (on dev, clean tree, written [Unreleased] section):
  1. bumps PF_IMPROV_FW_VERSION and each named edition's PF_VARIANT_VERSION,
  2. turns CHANGELOG's [Unreleased] into "## [X.Y.Z] - today" under a fresh
     [Unreleased], and the "current" lines in AGENTS.md,
  3. runs shelf.sh for the core and each named edition (the images the site
     serves, built from a sketch copy without patternflow_secrets.h - shelf.sh
     refuses an image that carries credentials or the wrong version),
  4. points web/public/flash/manifest.json and the /editions cards at them,
  5. runs the web checks (typecheck, check:ci, the docs link checker),
  6. commits "release: vX.Y.Z" and tags it.
  README.md's "Moving fast" note is prose; it says what changed, so it is
  left to the author and named in the summary.

`publish` (after `cut`):
  pushes dev and the tag, opens the dev -> main pull request from the
  changelog section, waits for its checks, merges, creates the GitHub release
  from the notes file, attaches the edition images under their release names,
  and waits for the "Firmware release assets" workflow that attaches the core
  images and FLASHING.md.

Every step that talks to the outside prints the command it runs. Nothing here
edits a file it does not name in this docstring.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NET_CONFIG = ROOT / "firmware/patternflow/net_config.h"
CHANGELOG = ROOT / "CHANGELOG.md"
AGENTS = ROOT / "AGENTS.md"
MANIFEST = ROOT / "web/public/flash/manifest.json"
EDITIONS_TS = ROOT / "web/src/app/editions/editions-data.ts"
BIN_DIR = ROOT / "web/public/flash/bin"
EDITIONS = ("audio", "performance", "clock")
CO_AUTHOR = "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
TRAILER = "🤖 Generated with [Claude Code](https://claude.com/claude-code)"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ── helpers ────────────────────────────────────────────────────────────────

def die(msg: str) -> None:
    print(f"release: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd: list[str] | str, *, cwd: Path = ROOT, check: bool = True, capture: bool = False,
        shell: bool = False) -> subprocess.CompletedProcess:
    shown = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"$ {shown}")
    return subprocess.run(cmd, cwd=str(cwd), check=check, shell=shell,
                          capture_output=capture, text=True, encoding="utf-8", errors="replace")


def out(cmd: list[str], *, cwd: Path = ROOT, check: bool = True) -> str:
    return subprocess.run(cmd, cwd=str(cwd), check=check, capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout.strip()


def find_bash() -> str:
    """The bash that can run shelf.sh: Git Bash at a Windows desk, bash elsewhere.

    On Windows a bare "bash" handed to CreateProcess resolves to
    System32\\bash.exe - the WSL relay - even when Git's bash is first on the
    PATH that `which` sees. The first cut of 3.9.4 died there, silently
    inside a filtered log: "execvpe(/bin/bash) failed".
    """
    if sys.platform != "win32":
        return "bash"
    import shutil
    candidates = [
        Path(r"C:\Program Files\Git\usr\bin\bash.exe"),
        Path(r"C:\Program Files\Git\bin\bash.exe"),
        Path(r"C:\Program Files (x86)\Git\usr\bin\bash.exe"),
    ]
    found = shutil.which("bash")
    if found and "System32" not in found and "WindowsApps" not in found:
        candidates.insert(0, Path(found))
    for c in candidates:
        if c.is_file():
            return str(c)
    die("no Git Bash found - shelf.sh and the web checks need it")
    return "bash"


BASH = find_bash()


def bash(script: str, *, cwd: Path = ROOT, check: bool = True) -> subprocess.CompletedProcess:
    # One shell for every platform: Git Bash at a desk, bash on a runner.
    return run([BASH, "-c", script], cwd=cwd, check=check)


def read(path: Path) -> tuple[str, bool]:
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    return raw.decode("utf-8").replace("\r\n", "\n"), crlf


def write(path: Path, text: str, crlf: bool) -> None:
    if crlf:
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))


def sub_once(text: str, pattern: str, repl: str, what: str, flags: int = 0) -> str:
    new, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        die(f"could not find {what}")
    return new


def vcheck(v: str, what: str) -> str:
    if not re.fullmatch(r"v\d+\.\d+\.\d+", v):
        die(f"{what} must look like vX.Y.Z, got {v!r}")
    return v


# ── cut ────────────────────────────────────────────────────────────────────

def bump_firmware(core: str, editions: dict[str, str]) -> None:
    text, crlf = read(NET_CONFIG)
    text = sub_once(text, r'#define PF_IMPROV_FW_VERSION "[^"]+"',
                    f'#define PF_IMPROV_FW_VERSION "{core[1:]}"', "PF_IMPROV_FW_VERSION in net_config.h")
    write(NET_CONFIG, text, crlf)
    print(f"  net_config.h: PF_IMPROV_FW_VERSION -> {core[1:]}")
    for name, version in editions.items():
        path = ROOT / f"firmware/bundles/{name}/overrides.h"
        text, crlf = read(path)
        text = sub_once(text, r'(#define PF_VARIANT_VERSION\s+)"[^"]+"', rf'\g<1>"{version}"',
                        f"PF_VARIANT_VERSION in {path.name}")
        write(path, text, crlf)
        print(f"  bundles/{name}/overrides.h: PF_VARIANT_VERSION -> {version}")


def current_edition_versions() -> dict[str, str]:
    found = {}
    for name in EDITIONS:
        text, _ = read(ROOT / f"firmware/bundles/{name}/overrides.h")
        m = re.search(r'#define PF_VARIANT_VERSION\s+"(v[^"]+)"', text)
        if m:
            found[name] = m.group(1)
    return found


def bump_changelog(core: str, today: str, allow_empty: bool) -> str:
    text, crlf = read(CHANGELOG)
    m = re.search(r"^## \[Unreleased\]\n(.*?)(?=^## \[)", text, re.M | re.S)
    if not m:
        die("CHANGELOG.md has no [Unreleased] section followed by a release section")
    body = m.group(1).strip("\n")
    if not body.strip() and not allow_empty:
        die("CHANGELOG.md's [Unreleased] section is empty - write the release before cutting it "
            "(or pass --allow-empty-changelog)")
    heading = f"## [{core[1:]}] - {today}"
    if f"## [{core[1:]}]" in text:
        die(f"CHANGELOG.md already has a {core[1:]} section")
    replacement = f"## [Unreleased]\n\n{heading}\n\n{body}\n\n" if body.strip() else f"## [Unreleased]\n\n{heading}\n\n"
    text = text[:m.start()] + replacement + text[m.end():]
    write(CHANGELOG, text, crlf)
    print(f"  CHANGELOG.md: [Unreleased] -> {heading}")
    return body


def bump_agents(core: str, today: str, editions_now: dict[str, str]) -> None:
    text, crlf = read(AGENTS)
    text = sub_once(text, r"- Project: v\d+\.\d+\.\d+ \(current, released \d{4}-\d{2}-\d{2}\)",
                    f"- Project: {core} (current, released {today})", "the 'Project: vX (current, released …)' line in AGENTS.md")
    if all(editions_now.get(n) for n in EDITIONS):
        # "Audio vA, Performance vB, Utility vC at the time of writing" - one
        # clause per edition, in EDITIONS order, so adding an edition is one
        # tuple entry here and one clause in AGENTS.md.
        pattern = ", ".join(rf"{n.capitalize()} v\d+\.\d+\.\d+" for n in EDITIONS) + " at the time of writing"
        repl = ", ".join(f"{n.capitalize()} {editions_now[n]}" for n in EDITIONS) + " at the time of writing"
        text = sub_once(text, pattern, repl, "the editions' 'at the time of writing' line in AGENTS.md")
    write(AGENTS, text, crlf)
    print(f"  AGENTS.md: current {core}, " + ", ".join(f"{n.capitalize()} {editions_now.get(n)}" for n in EDITIONS))


def shelf(name: str, version: str) -> None:
    if (BIN_DIR / f"{name}-{version}").exists():
        die(f"web/public/flash/bin/{name}-{version} already exists - bump instead of overwriting")
    bash(f'bash firmware/bundles/shelf.sh {name} {version}')


def point_site(core: str, editions: dict[str, str]) -> None:
    text, crlf = read(MANIFEST)
    data = json.loads(text)
    data["version"] = core
    for build in data["builds"]:
        for part in build["parts"]:
            part["path"] = re.sub(r"bin/core-v[\d.]+/", f"bin/core-{core}/", part["path"])
    write(MANIFEST, json.dumps(data, indent=2) + "\n", crlf)
    print(f"  manifest.json: {core}, bin/core-{core}/")

    text, crlf = read(EDITIONS_TS)
    for ident, version in {"core": core, **editions}.items():
        # The card's block runs from its id: to the next id:. Inside it, the
        # first version:/url: pair is the image the shelf serves.
        m = re.search(rf"id: '{ident}',(.*?)(?=id: '|\Z)", text, re.S)
        if not m:
            die(f"editions-data.ts has no card with id '{ident}'")
        block = m.group(1)
        new_block = sub_once(block, r"version: 'v[\d.]+'", f"version: '{version}'", f"version in the {ident} card")
        new_block = sub_once(new_block, rf"flash/bin/{ident}-v[\d.]+/", f"flash/bin/{ident}-{version}/",
                             f"image url in the {ident} card")
        text = text[:m.start(1)] + new_block + text[m.end(1):]
        print(f"  editions-data.ts: {ident} -> {version}")
    write(EDITIONS_TS, text, crlf)


def web_checks(quick: bool) -> None:
    bash("cd web && npm run -s typecheck")
    if not quick:
        bash("cd web && npm run -s check:ci")
    run([sys.executable, ".github/scripts/check_links.py"])


def cmd_cut(args: argparse.Namespace) -> None:
    core = vcheck(args.version, "the version")
    editions = {}
    for name in EDITIONS:
        v = getattr(args, name)
        if v:
            editions[name] = vcheck(v, f"--{name}")
    today = dt.date.today().isoformat()

    branch = out(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if branch != "dev" and not args.any_branch:
        die(f"on '{branch}', releases are cut on dev (--any-branch to override)")
    dirty = [l for l in out(["git", "status", "--porcelain"]).splitlines() if not l.startswith("??")]
    if dirty and not args.no_commit:
        die("the working tree has uncommitted changes:\n  " + "\n  ".join(dirty))
    if out(["git", "tag", "-l", core]):
        die(f"tag {core} already exists")

    print(f"== cut {core}" + (" with " + ", ".join(f"{k} {v}" for k, v in editions.items()) if editions else ""))
    bump_firmware(core, editions)
    bump_changelog(core, today, args.allow_empty_changelog)
    bump_agents(core, today, {**current_edition_versions(), **editions})

    if args.no_build:
        print("  (shelf skipped: --no-build)")
    else:
        shelf("core", core)
        for name, version in editions.items():
            shelf(name, version)
        for folder in sorted(p.name for p in BIN_DIR.iterdir() if p.is_dir()):
            bins = list((BIN_DIR / folder).glob("*.bin"))
            for b in bins:
                if b.name == "patternflow.ino.bin" and b"YOUR_WIFI_SSID" not in b.read_bytes():
                    die(f"{b} has no placeholder SSID - it was not built clean")
    point_site(core, editions)

    if args.no_web_checks:
        print("  (web checks skipped: --no-web-checks)")
    else:
        web_checks(args.quick)

    if args.no_commit:
        print("  (commit and tag skipped: --no-commit)")
    else:
        paths = ["firmware/patternflow/net_config.h", "CHANGELOG.md", "AGENTS.md",
                 "web/public/flash/manifest.json", "web/src/app/editions/editions-data.ts"]
        paths += [f"firmware/bundles/{n}/overrides.h" for n in editions]
        run(["git", "add", "-A", "--", *paths, "web/public/flash/bin"])
        summary = f"Core {core}" + "".join(f", {n.capitalize()} {v}" for n, v in editions.items())
        run(["git", "commit", "-q", "-m", f"release: {core}",
             "-m", f"{summary} staged by shelf.sh from a sketch copy without patternflow_secrets.h; "
                   "the previous folders retired to their tags.", "-m", CO_AUTHOR])
        run(["git", "tag", "-a", core, "-m", f"Patternflow {core}"])

    print(f"""
== {core} is cut.
  README.md's "Moving fast" note still says the previous release - it is prose, so it is yours.
  Write the release notes (the CHANGELOG section is the raw material), then:
    python firmware/toolchain/release.py publish {core} --notes <file.md>""")


# ── publish ────────────────────────────────────────────────────────────────

def changelog_section(core: str) -> str:
    text, _ = read(CHANGELOG)
    m = re.search(rf"^## \[{re.escape(core[1:])}\][^\n]*\n(.*?)(?=^## \[|\Z)", text, re.M | re.S)
    return m.group(1).strip("\n") if m else ""


def cmd_publish(args: argparse.Namespace) -> None:
    core = vcheck(args.version, "the version")
    notes = Path(args.notes)
    if not notes.is_file():
        die(f"notes file not found: {notes}")
    if not out(["git", "tag", "-l", core]):
        die(f"no tag {core} - run `cut` first")
    title = args.title or f"Patternflow {core}"

    run(["git", "push", "origin", "dev"])
    run(["git", "push", "origin", core])

    existing = out(["gh", "pr", "list", "--base", "main", "--head", "dev", "--state", "open",
                    "--json", "url", "--jq", ".[0].url"], check=False)
    if existing:
        url = existing
        print(f"  reusing open PR {url}")
    else:
        body = f"Promotes dev to main for {core}.\n\n{changelog_section(core)}\n\n{TRAILER}\n"
        body_file = ROOT / "web" / ".release-pr-body.md"
        body_file.write_text(body, encoding="utf-8")
        try:
            url = out(["gh", "pr", "create", "--base", "main", "--head", "dev",
                       "--title", f"Dev: {core}", "--body-file", str(body_file)])
        finally:
            body_file.unlink(missing_ok=True)
        print(f"  PR {url}")

    run(["gh", "pr", "checks", url, "--watch", "--interval", "30"])
    if args.no_merge:
        print("  (merge and release skipped: --no-merge)")
        return
    run(["gh", "pr", "merge", url, "--merge"])

    run(["gh", "release", "create", core, "--title", title, "--notes-file", str(notes)])
    # The edition images go up under their release names; gh names an asset
    # after the file, so they are copied into a temp dir under those names.
    import tempfile
    import time
    staging = Path(tempfile.mkdtemp(prefix="pf-release-"))
    uploads = []
    for name in EDITIONS:
        folders = sorted(BIN_DIR.glob(f"{name}-v*"))
        if not folders:
            continue
        image = folders[-1] / "patternflow.ino.bin"
        target = staging / f"patternflow-{name}.ino.bin"
        target.write_bytes(image.read_bytes())
        uploads.append(target)
    if uploads:
        try:
            run(["gh", "release", "upload", core, *[str(u) for u in uploads], "--clobber"])
        finally:
            for u in uploads:
                u.unlink(missing_ok=True)
            staging.rmdir()

    print("  waiting for 'Firmware release assets' to attach the core images…")
    time.sleep(25)
    run_id = out(["gh", "run", "list", "--workflow", "firmware-release.yml", "--limit", "1",
                  "--json", "databaseId", "--jq", ".[0].databaseId"])
    run(["gh", "run", "watch", run_id, "--exit-status"])
    print(out(["gh", "release", "view", core, "--json", "assets",
               "--jq", '.assets[] | "\\(.size)\\t\\(.name)"']))
    print(f"\n== {core} is published: " + out(["gh", "release", "view", core, "--json", "url", "--jq", ".url"]))


# ── main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    cut = sub.add_parser("cut", help="bump, shelf, point the site, check, commit, tag")
    cut.add_argument("version", help="vX.Y.Z")
    for name in EDITIONS:
        cut.add_argument(f"--{name}", metavar="vA.B.C", help=f"also re-cut the {name} edition at this version")
    cut.add_argument("--no-build", action="store_true", help="skip shelf.sh (for a dry run of the edits)")
    cut.add_argument("--no-web-checks", action="store_true")
    cut.add_argument("--quick", action="store_true", help="typecheck and links only, no check:ci")
    cut.add_argument("--no-commit", action="store_true", help="leave the edits in the tree, no commit or tag")
    cut.add_argument("--allow-empty-changelog", action="store_true")
    cut.add_argument("--any-branch", action="store_true")
    cut.set_defaults(fn=cmd_cut)

    pub = sub.add_parser("publish", help="push, PR, merge, GitHub release with images")
    pub.add_argument("version", help="vX.Y.Z (already cut)")
    pub.add_argument("--notes", required=True, help="release notes markdown file")
    pub.add_argument("--title", help="release title (default: Patternflow vX.Y.Z)")
    pub.add_argument("--no-merge", action="store_true", help="stop after the PR's checks")
    pub.set_defaults(fn=cmd_publish)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
