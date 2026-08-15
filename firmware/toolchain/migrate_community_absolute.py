"""
One-shot migration: make community pattern headers absolute-ready (PFParams).

    python firmware/toolchain/migrate_community_absolute.py --db path/to/community.db --dry-run
    python firmware/toolchain/migrate_community_absolute.py --db path/to/community.db

Rewrites `patterns.code_cpp` (and `pattern_headers.code_cpp` where that table
exists) the same way the repo presets were converted: delta-accumulation
idioms become PFParams:: calls, a `constexpr bool ABSOLUTE_READY = true;`
lands after KNOB_LABELS, button resets get the absolute-hold guard, and
`core_params.h` joins the includes.

Two safety rules this deliberately enforces:

  1. ALL-OR-NOTHING PER PATTERN. A header is written back only when no
     knobDeltas access survives outside comments. A partial conversion would
     mix absolute and delta channels in one pattern — worse than either pure
     form — so anything the regexes cannot fully claim is left byte-identical
     and reported as NEED MANUAL. (Upstream's make_absolute_ready.py marks
     those ABSOLUTE_READY=true anyway; that flaw is what this script fixes.)

  2. ORIGINALS ARE DUMPED FIRST. Before any write, every row this run will
     touch is copied to a JSON file beside the database
     (community-code-cpp-backup-<timestamp>.json). Restoring is a small
     script over that file, not a prayer.

Deck zips need no cache work afterwards: their fingerprint is a digest of
code_cpp, so every converted pattern's packs rebuild on next download.

The transformation regexes are ported from Simone Majocchi's
toolchain/make_absolute_ready.py (his performance-director branch) — the
same code that converted the repo's 33 presets — trimmed to the idioms that
actually appear in community headers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

LABELS_RE = re.compile(r"KNOB_LABELS\s*\[\s*4\s*\]\s*=\s*\{(.*?)\}", re.DOTALL)
ABS_READY_RE = re.compile(r"constexpr\s+bool\s+ABSOLUTE_READY\s*=\s*(true|false)\s*;")


# ── include + flag ────────────────────────────────────────────────────────


def ensure_core_params_include(text: str) -> str:
    if "core_params.h" in text or "pf_params.h" in text:
        return text
    # Community headers say `#include "src/..."`; repo presets say
    # `#include "../src/..."`. Follow whichever style the file already uses.
    prefix = "../src" if '#include "../src/' in text else "src"
    lines = text.splitlines(keepends=True)
    last_inc = -1
    for i, line in enumerate(lines):
        if line.lstrip().startswith("#include"):
            last_inc = i
    if last_inc < 0:
        return f'#include "{prefix}/core_params.h"\n' + text
    lines.insert(last_inc + 1, f'#include "{prefix}/core_params.h"\n')
    return "".join(lines)


def ensure_absolute_ready_flag(text: str) -> str:
    if ABS_READY_RE.search(text):
        return ABS_READY_RE.sub("constexpr bool ABSOLUTE_READY = true;", text, count=1)
    m = LABELS_RE.search(text)
    if not m:
        return text
    semi = text.find(";", m.end())
    if semi < 0:
        return text
    return text[: semi + 1] + "\nconstexpr bool ABSOLUTE_READY = true;" + text[semi + 1 :]


# ── delta-idiom rewrites (ported from make_absolute_ready.py) ─────────────


def transform_fminmax_assign(text: str) -> str:
    var = r"(?P<var>[A-Za-z_][\w.]*(?:\[[0-3]\])?)"

    def apply_line(m: re.Match) -> str:
        return (
            f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('lo').strip()}, {m.group('hi').strip()}, {m.group('step').strip()});"
        )

    # var += deltas * step; var = fmaxf(lo, fminf(hi, var));
    text = re.sub(
        rf"(?P<indent>[ \t]*){var}\s*\+=\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^;]+);\s*"
        rf"(?P=var)\s*=\s*fmaxf\s*\(\s*(?P<lo>[^,]+)\s*,\s*fminf\s*\(\s*(?P<hi>[^,]+)\s*,\s*(?P=var)\s*\)\s*\)\s*;",
        apply_line, text, flags=re.MULTILINE)

    # var += deltas * step; var = fminf(fmaxf(var, lo), hi);
    text = re.sub(
        rf"(?P<indent>[ \t]*){var}\s*\+=\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^;]+);\s*"
        rf"(?P=var)\s*=\s*fminf\s*\(\s*fmaxf\s*\(\s*(?P=var)\s*,\s*(?P<lo>[^,]+)\s*\)\s*,\s*(?P<hi>[^)]+)\s*\)\s*;",
        apply_line, text, flags=re.MULTILINE)

    # var = fminf(fmaxf(var + deltas * step, lo), hi);
    text = re.sub(
        rf"(?P<indent>[ \t]*){var}\s*=\s*fminf\s*\(\s*fmaxf\s*\(\s*(?P=var)\s*\+\s*"
        rf"input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^,]+)\s*,\s*(?P<lo>[^,]+)\s*\)\s*,\s*(?P<hi>[^)]+)\s*\)\s*;",
        apply_line, text, flags=re.MULTILINE)

    return text


def transform_if_delta_blocks(text: str) -> str:
    """if (input.knobDeltas[i] != 0) { var += ...; optional clamps }"""
    pat = re.compile(
        r"(?P<indent>[ \t]*)if\s*\(\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*!=\s*0\s*\)\s*\{\s*"
        r"(?P<var>[A-Za-z_][\w.]*)\s*\+=\s*input\.knobDeltas\[(?P=idx)\]\s*\*\s*(?P<step>[^;]+);\s*"
        r"(?:if\s*\(\s*(?P=var)\s*<\s*(?P<lo>[^)]+)\)\s*(?P=var)\s*=\s*(?P=lo)\s*;\s*)?"
        r"(?:if\s*\(\s*(?P=var)\s*>\s*(?P<hi>[^)]+)\)\s*(?P=var)\s*=\s*(?P=hi)\s*;\s*)?"
        r"\}",
        re.MULTILINE,
    )

    def repl(m: re.Match) -> str:
        lo = m.group("lo")
        hi = m.group("hi")
        if lo and hi:
            return (
                f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
                f"{lo.strip()}, {hi.strip()}, {m.group('step').strip()});"
            )
        return (
            f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
            f"0.0f, 1.0f, {m.group('step').strip()});"
        )

    return pat.sub(repl, text)


def transform_plain_delta_clamps(text: str) -> str:
    """var += deltas * step; followed by the common clamp shapes."""
    # += then two if-clamps
    text = re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*\+=\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^;]+);\s*"
        r"if\s*\(\s*(?P=var)\s*<\s*(?P<lo>[^)]+)\)\s*(?P=var)\s*=\s*(?P=lo)\s*;\s*"
        r"if\s*\(\s*(?P=var)\s*>\s*(?P<hi>[^)]+)\)\s*(?P=var)\s*=\s*(?P=hi)\s*;",
        lambda m: (
            f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('lo').strip()}, {m.group('hi').strip()}, {m.group('step').strip()});"
        ),
        text, flags=re.MULTILINE)

    # var = constrain(var + deltas * step, lo, hi);
    text = re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*=\s*constrain\s*\(\s*(?P=var)\s*\+\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^,]+)\s*,\s*(?P<lo>[^,]+)\s*,\s*(?P<hi>[^)]+)\)\s*;",
        lambda m: (
            f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('lo').strip()}, {m.group('hi').strip()}, {m.group('step').strip()});"
        ),
        text)

    # var = clampf(var + deltas * step, lo, hi);
    text = re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*=\s*clampf\s*\(\s*(?P=var)\s*\+\s*"
        r"input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^,]+)\s*,\s*(?P<lo>[^,]+)\s*,\s*(?P<hi>[^)]+)\)\s*;",
        lambda m: (
            f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('lo').strip()}, {m.group('hi').strip()}, {m.group('step').strip()});"
        ),
        text)

    return text


def transform_one_sided_max(text: str) -> str:
    """var = max(lo, var + deltas * step); — unbounded above → soft 10.0f cap.

    Same call upstream's converter made for the repo presets, so a community
    copy of 0510 ends up byte-identical to the converted preset.
    """
    return re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*=\s*max\s*\(\s*(?P<lo>[^,]+)\s*,\s*"
        r"(?P=var)\s*\+\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^)]+)\)\s*;",
        lambda m: (
            f"{m.group('indent')}PFParams::apply(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('lo').strip()}, 10.0f, {m.group('step').strip()});"
        ),
        text)


def transform_grouped_deltas(text: str) -> str:
    """+= lines whose clamp/wrap sits later in the function (ported from
    make_absolute_ready.py's windowed transform, minus its dead branches)."""
    add_re = re.compile(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*(?:\[[0-3]\])?)\s*\+=\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^;]+);"
    )
    adds = list(add_re.finditer(text))
    if not adds:
        return text

    replacements: list[tuple[int, int, str]] = []
    consumed: list[tuple[int, int]] = []

    def overlaps(start: int, end: int) -> bool:
        return any(not (end <= a or start >= b) for a, b in consumed)

    for m in adds:
        var = m.group("var")
        idx = m.group("idx")
        step = m.group("step").strip()
        indent = m.group("indent")
        window = text[m.end() : m.end() + 900]

        wrap_lo = re.search(
            rf"if\s*\(\s*{re.escape(var)}\s*<\s*0(?:\.0f)?\s*\)\s*{re.escape(var)}\s*\+=\s*1(?:\.0f)?\s*;", window)
        wrap_hi = re.search(
            rf"if\s*\(\s*{re.escape(var)}\s*>=?\s*1(?:\.0f)?\s*\)\s*{re.escape(var)}\s*-=\s*1(?:\.0f)?\s*;", window)
        fmod_line = re.search(rf"{re.escape(var)}\s*=\s*fmodf\([^;]+;", window)
        while_wraps = list(re.finditer(
            rf"while\s*\(\s*{re.escape(var)}\s*[<>]=?\s*[^)]+\)\s*{re.escape(var)}\s*[+-]=\s*[^;]+;", window))
        lo_m = re.search(
            rf"if\s*\(\s*{re.escape(var)}\s*<\s*(?P<lo>[^)]+)\)\s*{re.escape(var)}\s*=\s*(?P=lo)\s*;", window)
        hi_m = re.search(
            rf"if\s*\(\s*{re.escape(var)}\s*>\s*(?P<hi>[^)]+)\)\s*{re.escape(var)}\s*=\s*(?P=hi)\s*;", window)
        fm_m = re.search(
            rf"{re.escape(var)}\s*=\s*fmaxf\s*\(\s*(?P<lo>[^,]+)\s*,\s*fminf\s*\(\s*(?P<hi>[^,]+)\s*,\s*{re.escape(var)}\s*\)\s*\)\s*;", window)
        fm_m2 = re.search(
            rf"{re.escape(var)}\s*=\s*fminf\s*\(\s*fmaxf\s*\(\s*{re.escape(var)}\s*,\s*(?P<lo>[^,]+)\s*\)\s*,\s*(?P<hi>[^)]+)\s*\)\s*;", window)
        fm_m3 = re.search(
            rf"{re.escape(var)}\s*=\s*fminf\s*\(\s*(?P<hi>[^,]+)\s*,\s*fmaxf\s*\(\s*(?P<lo>[^,]+)\s*,\s*{re.escape(var)}\s*\)\s*\)\s*;", window)
        con_m = re.search(
            rf"{re.escape(var)}\s*=\s*constrain\s*\(\s*{re.escape(var)}\s*,\s*(?P<lo>[^,]+)\s*,\s*(?P<hi>[^)]+)\)\s*;", window)

        clamp = fm_m or fm_m2 or fm_m3 or con_m
        if clamp:
            new = (f"{indent}PFParams::apply(input, {idx}, &{var}, "
                   f"{clamp.group('lo').strip()}, {clamp.group('hi').strip()}, {step});")
        elif wrap_lo or wrap_hi or fmod_line or while_wraps:
            new = f"{indent}PFParams::applyUnit(input, {idx}, &{var}, {step});"
        elif lo_m and hi_m:
            new = (f"{indent}PFParams::apply(input, {idx}, &{var}, "
                   f"{lo_m.group('lo').strip()}, {hi_m.group('hi').strip()}, {step});")
        else:
            continue

        if overlaps(m.start(), m.end()):
            continue
        replacements.append((m.start(), m.end(), new))
        consumed.append((m.start(), m.end()))

        # Blank out the distant clamp/wrap lines this apply subsumes.
        followers: list[re.Match] = []
        if clamp:
            followers.append(clamp)
        if lo_m and hi_m and not clamp:
            followers.extend([lo_m, hi_m])
        for wm in (wrap_lo, wrap_hi):
            if wm:
                followers.append(wm)
        if fmod_line and not clamp:
            followers.append(fmod_line)
        followers.extend(while_wraps)
        for fm in followers:
            cs = m.end() + fm.start()
            ce = m.end() + fm.end()
            if overlaps(cs, ce):
                continue
            replacements.append((cs, ce, ""))
            consumed.append((cs, ce))

    for start, end, new in sorted(replacements, key=lambda x: x[0], reverse=True):
        text = text[:start] + new + text[end:]
    return text


def transform_hue_wraps(text: str) -> str:
    """The three spellings of `hue += delta; wrap into 0..1` → applyUnit."""
    # += step; if (<0) += 1; fmodf(...)
    text = re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*\+=\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^;]+);\s*"
        r"if\s*\(\s*(?P=var)\s*<\s*0(?:\.0f)?\s*\)\s*(?P=var)\s*\+=\s*1(?:\.0f)?\s*;\s*"
        r"(?P=var)\s*=\s*fmodf\s*\([^;]+;",
        lambda m: (
            f"{m.group('indent')}PFParams::applyUnit(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('step').strip()});"
        ),
        text, flags=re.MULTILINE)

    # var = fmodf(var + deltas * step, 1.0f); [optional if (<0) += 1]
    # Paren salad tolerated: the generator spelling is
    #   fmodf((float)((var + deltas * step)), (float)(1.0f))
    text = re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*=\s*fmodf\s*\(\s*[\s(]*(?:\(float\)\s*)?[\s(]*(?P=var)\s*\+\s*"
        r"input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^,()]+)[\s)]*,\s*(?:\(float\)\s*)?[\s(]*1(?:\.0f)?[\s)]*\)\s*;\s*"
        r"(?:if\s*\(\s*(?P=var)\s*<\s*0(?:\.0f)?\s*\)\s*(?P=var)\s*\+=\s*1(?:\.0f)?\s*;\s*)?",
        lambda m: (
            f"{m.group('indent')}PFParams::applyUnit(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('step').strip()});\n"
        ),
        text, flags=re.MULTILINE)

    # += step; wrap via two ifs (+= span / -= span) over 0..1
    text = re.sub(
        r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][\w.]*)\s*\+=\s*input\.knobDeltas\[(?P<idx>[0-3])\]\s*\*\s*(?P<step>[^;]+);\s*"
        r"if\s*\(\s*(?P=var)\s*<\s*0(?:\.0f)?\s*\)\s*(?P=var)\s*\+=\s*1(?:\.0f)?\s*;\s*"
        r"if\s*\(\s*(?P=var)\s*>=?\s*1(?:\.0f)?\s*\)\s*(?P=var)\s*-=\s*1(?:\.0f)?\s*;",
        lambda m: (
            f"{m.group('indent')}PFParams::applyUnit(input, {m.group('idx')}, &{m.group('var')}, "
            f"{m.group('step').strip()});"
        ),
        text, flags=re.MULTILINE)

    return text


def guard_btn_resets(text: str) -> str:
    return re.sub(
        r"if\s*\(\s*input\.btnPressed\[([0-3])\]\s*\)\s+(?!&&)",
        r"if (input.btnPressed[\1] && !input.paramAbsoluteActive[\1] && !input.knobAudioActive[\1]) ",
        text,
    )


def still_has_deltas(text: str) -> bool:
    body = re.sub(r"//.*?$", "", text, flags=re.MULTILINE)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.DOTALL)
    return "knobDeltas" in body


def convert(code: str) -> tuple[str, bool]:
    """Return (converted, fully_converted). Original returned when partial."""
    text = transform_fminmax_assign(code)
    text = transform_hue_wraps(text)
    text = transform_if_delta_blocks(text)
    text = transform_plain_delta_clamps(text)
    text = transform_one_sided_max(text)
    text = transform_grouped_deltas(text)
    if still_has_deltas(text):
        return code, False
    text = ensure_core_params_include(text)
    text = ensure_absolute_ready_flag(text)
    text = guard_btn_resets(text)
    return text, True


# ── database walk ─────────────────────────────────────────────────────────


# ── repo-twin replacement ─────────────────────────────────────────────────
#
# The community DB was seeded from the repo's presets, so many rows are
# byte-identical copies of a preset's pre-conversion source (verified against
# git HEAD for Origin / Wave Saw / 0513). Those need no regex at all: when a
# row's code matches a preset's PRE-conversion source exactly (by hash), the
# row takes the repo's hand-checked converted file wholesale. Hashes live in
# preset_twin_hashes.json beside this script (generated at conversion time by
# gen_twin_hashes.py); the converted sources come from --presets-dir.


def norm_code(s: str) -> str:
    return s.replace("\r\n", "\n").strip()


def load_twins(presets_dir: Path) -> dict[str, str]:
    """sha1(normalized old source) → converted source text."""
    hashes_path = Path(__file__).with_name("preset_twin_hashes.json")
    if not hashes_path.is_file() or not presets_dir.is_dir():
        return {}
    mapping = json.loads(hashes_path.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for old_sha, filename in mapping.items():
        src = presets_dir / filename
        if src.is_file():
            out[old_sha] = src.read_text(encoding="utf-8")
    return out


def twin_lookup(twins: dict[str, str], code: str) -> str | None:
    sha = hashlib.sha1(norm_code(code).encode("utf-8")).hexdigest()
    return twins.get(sha)


def table_exists(db: sqlite3.Connection, name: str) -> bool:
    row = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def migrate(db_path: Path, dry: bool, presets_dir: Path) -> int:
    db = sqlite3.connect(db_path)
    targets = [("patterns", "id")]
    if table_exists(db, "pattern_headers"):
        targets.append(("pattern_headers", "id"))

    twins = load_twins(presets_dir)
    backup: dict[str, dict[str, str]] = {}
    planned: list[tuple[str, str, str]] = []  # table, id, new_code
    manual: list[tuple[str, str]] = []
    already: int = 0
    twinned: int = 0

    for table, key in targets:
        rows = db.execute(
            f"SELECT {key}, code_cpp FROM {table} WHERE code_cpp IS NOT NULL AND code_cpp != ''"
        ).fetchall()
        for row_id, code in rows:
            if "PFParams::" in code:
                already += 1
                continue
            if "knobDeltas" not in code:
                # No knob handling at all — still absolute-safe by
                # definition, but flagging it ready would promise Director
                # response it cannot give. Leave it alone.
                continue
            twin = twin_lookup(twins, code)
            if twin is not None:
                backup.setdefault(table, {})[str(row_id)] = code
                planned.append((table, str(row_id), twin))
                twinned += 1
                continue
            new_code, ok = convert(code)
            if not ok:
                manual.append((table, str(row_id)))
                continue
            backup.setdefault(table, {})[str(row_id)] = code
            planned.append((table, str(row_id), new_code))

    print(f"convertible: {len(planned)} (of which repo twins: {twinned})   "
          f"already PFParams: {already}   NEED MANUAL: {len(manual)}")
    for table, row_id in manual:
        print(f"  NEED MANUAL: {table}.{row_id}")

    if dry or not planned:
        db.close()
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(f"community-code-cpp-backup-{stamp}.json")
    backup_path.write_text(json.dumps(backup, indent=1), encoding="utf-8")
    print(f"originals saved: {backup_path}")

    for table, row_id, new_code in planned:
        db.execute(f"UPDATE {table} SET code_cpp = ? WHERE id = ?", (new_code, row_id))
    db.commit()
    db.close()
    print(f"updated {len(planned)} row(s)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, required=True, help="community.db path")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--presets-dir", type=Path,
                    default=Path(__file__).resolve().parents[1] / "patternflow" / "presets",
                    help="Converted repo presets, used for repo-twin rows")
    args = ap.parse_args()
    if not args.db.is_file():
        sys.exit(f"no database at {args.db}")
    return migrate(args.db, args.dry_run, args.presets_dir)


if __name__ == "__main__":
    sys.exit(main())
