"""
Assemble built modules into a shareable pattern pack (.zip).

    python firmware/toolchain/make_pack.py --out web/public/packs/basics.zip build/modules
    python firmware/toolchain/make_pack.py --out /tmp/set.zip --name "Night set" build/modules

Takes the output of build_module.py and produces the exact shape the device's
/patterns page unpacks: `<slug>.pfm` + `<slug>.json` per pattern, plus a
`catalog.txt` running order. A deck's pack is built on demand by the site;
this is the same file for sets that live in the repo, built from sources we
hold rather than from the build queue.

Three things the raw build output is not ready to publish:

  1. `source` is the absolute path of whoever ran the build. Nobody
     downloading a pack needs a stranger's directory layout.
  2. Module order would otherwise be whatever the filesystem returned. The
     running order is part of the set, so it ships as catalog.txt, ordered by
     the same pattern number the site sorts by.
  3. Authorship has to be checked, not assumed. A pack asserting an author
     the source never declared is worse than one that admits it doesn't know,
     so an undeclared author fails the build instead of shipping a guess.

Output is byte-identical across rebuilds (fixed timestamps, sorted entries) so
a committed pack only changes when a pattern does.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

# Same reasoning as port_preset.py: pattern names legitimately contain
# accents, CJK and emoji, and this console may be cp949.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]          # firmware/
REPO = ROOT.parent
WEB_PRESETS = REPO / "web" / "src" / "lib" / "presets"

NUM_RE = re.compile(r"^\s*num:\s*([0-9.]+)", re.MULTILINE)

# Fields that describe THIS build rather than the pattern, dropped on the way
# into the pack.
LOCAL_FIELDS = ("source", "opt")

# A fixed timestamp for every entry. Zip stores mtimes, so without this a
# rebuild of unchanged patterns produces a different file every time.
FIXED_DATE = (2026, 1, 1, 0, 0, 0)


def canonical_order() -> dict[str, float]:
    """
    Map preset stem -> pattern number, read from the site's presets.

    The site is the one place that already decides what order patterns come
    in (`livePresets` sorts by `num`), and it is the order a visitor sees
    before they ever download a pack. Duplicating that ordering here as a
    second hand-maintained list would just be a second thing to forget to
    update, so this reads it back instead: `preset_0515_3.h` is the firmware
    side of `pattern-0515-3.ts`, underscores for hyphens.
    """
    order: dict[str, float] = {}
    for path in WEB_PRESETS.glob("pattern-*.ts"):
        match = NUM_RE.search(path.read_text(encoding="utf-8"))
        if match:
            stem = path.stem[len("pattern-"):].replace("-", "_")
            order[stem] = float(match.group(1))
    return order


def preset_stem(sidecar: dict) -> str | None:
    """
    Which repo preset a module was built from, or None if it came from
    somewhere else. The module slug comes from the pattern's NAME and does not
    have to match the filename ("breakout arcade" is preset_0716.h), so this
    is the only honest link between a shipped module and the source it has a
    live JS twin in.
    """
    source = sidecar.get("source")
    if not source:
        return None
    stem = Path(source).stem
    return stem[len("preset_"):] if stem.startswith("preset_") else stem


def sort_key(slug: str, sidecar: dict, order: dict[str, float]) -> tuple[float, str]:
    """
    Position of one module in the running order.

    The module slug comes from the pattern's NAME, which is not the preset
    filename ("breakout arcade" lives in preset_0716.h), so the link back to a
    pattern number runs through `source`. A module built from something other
    than a repo preset has no number and sorts to the end, alphabetically
    among its peers, rather than pushing the numbered ones around.
    """
    stem = preset_stem(sidecar)
    if stem is not None and stem in order:
        return (order[stem], slug)
    return (float("inf"), slug)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("artifacts", type=Path,
                    help="Directory of built .pfm + .json (build_module.py --out)")
    ap.add_argument("--out", type=Path, required=True, help="Pack .zip to write")
    ap.add_argument("--name", default="Basics", help="Pack name, shown in README.txt")
    ap.add_argument("--publisher", default=None,
                    help="Who publishes the set, if not its authors (e.g. Patternflow)")
    ap.add_argument("--exclude", action="append", default=[],
                    help="Slug to leave out; repeatable")
    args = ap.parse_args()

    if not args.artifacts.is_dir():
        sys.exit(f"not a directory: {args.artifacts}")

    modules = []
    for pfm in sorted(args.artifacts.glob("*.pfm")):
        slug = pfm.stem
        if slug in args.exclude:
            continue
        meta = pfm.with_suffix(".json")
        if not meta.exists():
            sys.exit(f"{slug}: built module has no .json sidecar")
        modules.append((slug, pfm, json.loads(meta.read_text(encoding="utf-8"))))

    if not modules:
        sys.exit(f"no modules found in {args.artifacts}")

    # Refuse to publish a pattern whose author was never declared. This is the
    # one check worth failing over: a pack is a thing people redistribute, and
    # an authorship claim it invented cannot be corrected downstream.
    unattributed = [slug for slug, _, meta in modules
                    if not meta.get("author") or meta["author"] == "unknown"]
    if unattributed:
        sys.exit("author not declared in source for: " + ", ".join(unattributed))

    order = canonical_order()
    modules.sort(key=lambda m: sort_key(m[0], m[2], order))
    slugs = [slug for slug, _, _ in modules]

    authors = sorted({m[2]["author"] for m in modules})
    licences = sorted({m[2].get("license", "unknown") for m in modules})

    catalog = (
        "# Patternflow running order - one module slug per line.\n"
        "# The device reads this on install; delete it to sort by name instead.\n"
        + "\n".join(slugs) + "\n"
    )

    # A publisher credits the SET without touching who wrote each pattern.
    # Collapsing 33 real authors into one house name in the sidecars is the
    # exact defect that made an existing pack unpublishable here - the name
    # in a .json is the attribution that travels under CC-BY-SA, and a pack
    # that overwrites it cannot be repaired downstream. So it goes here, in a
    # field of its own, and stays true when a contributor's pattern joins.
    readme = "\n".join([
        f"Patternflow - {args.name} pattern pack",
        "",
        f"{len(slugs)} patterns, in running order.",
        "",
        "To install: open your board's Patterns page and drop this .zip on the",
        "upload area. Your browser unpacks it and the patterns appear in the",
        "list - no reflash, and nothing to unzip yourself.",
        "",
        *([f"Published by: {args.publisher}"] if args.publisher else []),
        f"Author:  {', '.join(authors)}",
        f"Licence: {', '.join(licences)}",
        "Per-pattern attribution stays in each .json beside its .pfm.",
        "",
        "https://patternflow.work",
        "",
    ])

    # Machine-readable twin of the README, written BESIDE the zip rather than
    # inside it. The device's install filter takes any *.json in a pack as a
    # module sidecar, so a "pack.json" in the archive would land on the board
    # as an orphan with no .pfm. Outside, it is also what the site can read to
    # show a pack's size and publisher without unpacking 33 sidecars - and it
    # cannot drift from the zip, because both are written here.
    manifest = {
        "name": args.name,
        **({"publisher": args.publisher} if args.publisher else {}),
        "patterns": len(slugs),
        "authors": authors,
        "licenses": licences,
        # The highest descriptor version in the pack — what a firmware must
        # accept to load everything here (2 since the absolute-param bus).
        "abi": max((int(m[2].get("abi", 1)) for m in modules), default=1),
        "panel": {"w": 128, "h": 64},
        "order": slugs,
        # slug -> pattern number, for the modules that came from a repo preset.
        # A compiled .pfm cannot be previewed in a browser, but the preset it
        # was built from has a JS twin the site already renders, and this is
        # what connects the two.
        #
        # Keyed on the number rather than the preset filename because that is
        # what both sides actually agree on: the JS `id` is not derivable from
        # the filename (pattern-0510.ts is "pattern-0510", pattern-wave-saw.ts
        # is "wave-saw"), while `num` is the field the site already sorts by.
        # Absent for anything built outside the repo, which is the honest
        # answer rather than a guessed match.
        "presets": {
            slug: order[stem]
            for slug, _, meta in modules
            if (stem := preset_stem(meta)) is not None and stem in order
        },
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:

        def write(name: str, data: bytes) -> None:
            info = zipfile.ZipInfo(name, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, data)

        for slug, pfm, meta in modules:
            write(f"{slug}.pfm", pfm.read_bytes())
            public = {k: v for k, v in meta.items() if k not in LOCAL_FIELDS}
            write(f"{slug}.json",
                  (json.dumps(public, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
        write("catalog.txt", catalog.encode("utf-8"))
        write("README.txt", readme.encode("utf-8"))

    manifest["bytes"] = args.out.stat().st_size
    meta_path = args.out.with_suffix(".json")
    meta_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
                         encoding="utf-8")

    size = args.out.stat().st_size
    print(f"{len(slugs)} pattern(s) -> {args.out}  ({size:,} bytes)")
    print(f"manifest    {meta_path.name}")
    print(f"author(s):  {', '.join(authors)}")
    print(f"licence(s): {', '.join(licences)}")
    print(f"order:      {', '.join(slugs[:6])}" + (" ..." if len(slugs) > 6 else ""))


if __name__ == "__main__":
    main()
