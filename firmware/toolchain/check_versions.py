"""The six places a version lives agree, and the images they name exist.

    python firmware/toolchain/check_versions.py

A release is one version written in six files: PF_IMPROV_FW_VERSION in
net_config.h, PF_VARIANT_VERSION in each edition's overrides.h, the "current"
lines in AGENTS.md, the flasher manifest, and the /editions cards. For a long
time they were edited by hand, one at a time, and drifted: AGENTS.md said
v3.7.0 while the shelf served v3.8.0; Audio v0.4.0 shipped still believing it
was v0.3.1. release.py is the one writer now; this is the check that says so,
and it runs in CI beside the boundary checks.

It reads, never writes. Exit 1 with every disagreement listed.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EDITIONS = ("audio", "performance", "clock")


def text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def one(pattern: str, source: str, what: str, problems: list[str], flags: int = 0) -> str | None:
    m = re.search(pattern, source, flags)
    if not m:
        problems.append(f"{what}: not found")
        return None
    return m.group(1)


def main() -> int:
    problems: list[str] = []

    core = one(r'#define PF_IMPROV_FW_VERSION "([^"]+)"', text("firmware/patternflow/net_config.h"),
               "PF_IMPROV_FW_VERSION in net_config.h", problems)
    core_v = f"v{core}" if core else None

    editions: dict[str, str | None] = {}
    for name in EDITIONS:
        editions[name] = one(r'#define PF_VARIANT_VERSION\s+"([^"]+)"', text(f"firmware/bundles/{name}/overrides.h"),
                             f"PF_VARIANT_VERSION in bundles/{name}/overrides.h", problems)

    agents = text("AGENTS.md")
    agents_core = one(r"- Project: (v\d+\.\d+\.\d+) \(current, released \d{4}-\d{2}-\d{2}\)", agents,
                      "the 'Project: vX (current…)' line in AGENTS.md", problems)
    # "Audio vA, Performance vB, Utility vC at the time of writing" - one
    # clause per edition, in EDITIONS order.
    agents_editions: dict[str, str | None] = {}
    clause = r"(v\d+\.\d+\.\d+)"
    line = ", ".join(f"{n.capitalize()} {clause}" for n in EDITIONS) + " at the time of writing"
    m = re.search(line, agents)
    if not m:
        problems.append("the editions' 'at the time of writing' line in AGENTS.md: not found")
    for i, name in enumerate(EDITIONS):
        agents_editions[name] = m.group(i + 1) if m else None

    manifest = json.loads(text("web/public/flash/manifest.json"))
    manifest_v = manifest.get("version")
    manifest_paths = [p["path"] for b in manifest.get("builds", []) for p in b.get("parts", [])]

    cards = text("web/src/app/editions/editions-data.ts")
    card_versions: dict[str, str | None] = {}
    card_urls: dict[str, str | None] = {}
    for ident in ("core", *EDITIONS):
        m = re.search(rf"id: '{ident}',(.*?)(?=id: '|\Z)", cards, re.S)
        if not m:
            problems.append(f"editions-data.ts: no card with id '{ident}'")
            continue
        block = m.group(1)
        card_versions[ident] = one(r"version: '(v[\d.]+)'", block, f"version in the {ident} card", problems)
        card_urls[ident] = one(r"url: '([^']+)'", block, f"url in the {ident} card", problems)

    # ── agreement ──
    if core_v and agents_core and core_v != agents_core:
        problems.append(f"core: net_config.h says {core_v}, AGENTS.md says {agents_core}")
    if core_v and manifest_v and core_v != manifest_v:
        problems.append(f"core: net_config.h says {core_v}, manifest.json says {manifest_v}")
    if core_v and card_versions.get("core") and core_v != card_versions["core"]:
        problems.append(f"core: net_config.h says {core_v}, the /editions card says {card_versions['core']}")
    for path in manifest_paths:
        if core_v and f"bin/core-{core_v}/" not in path:
            problems.append(f"manifest.json part {path} is not under bin/core-{core_v}/")
        if not (ROOT / "web/public/flash" / path).is_file():
            problems.append(f"manifest.json names a file that does not exist: web/public/flash/{path}")
    for name, want_agents in agents_editions.items():
        v = editions.get(name)
        if v and want_agents and v != want_agents:
            problems.append(f"{name}: overrides.h says {v}, AGENTS.md says {want_agents}")
        if v and card_versions.get(name) and v != card_versions[name]:
            problems.append(f"{name}: overrides.h says {v}, the /editions card says {card_versions[name]}")
    for ident, url in card_urls.items():
        v = core_v if ident == "core" else editions.get(ident)
        if not url or not v:
            continue
        folder = f"{ident}-{v}"
        if f"/flash/bin/{folder}/" not in url:
            problems.append(f"the {ident} card's url is not under flash/bin/{folder}/: {url}")
        if not (ROOT / "web/public/flash/bin" / folder / "patternflow.ino.bin").is_file():
            problems.append(f"the {ident} card names an image that is not on the shelf: web/public/flash/bin/{folder}/")

    # The shelf holds only what the cards name.
    named = {f"core-{core_v}"} | {f"{n}-{v}" for n, v in editions.items() if v}
    on_shelf = {p.name for p in (ROOT / "web/public/flash/bin").iterdir() if p.is_dir()}
    for extra in sorted(on_shelf - named):
        problems.append(f"web/public/flash/bin/{extra} is on the shelf but no card or manifest names it")

    if problems:
        print(f"{len(problems)} version problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"versions agree: core {core_v}, " + ", ".join(f"{n} {v}" for n, v in editions.items())
          + " - in net_config.h, the overrides, AGENTS.md, the manifest and the /editions cards, images on the shelf")
    return 0


if __name__ == "__main__":
    sys.exit(main())
