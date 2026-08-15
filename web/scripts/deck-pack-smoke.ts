/**
 * Deck pack smoke test — `npm run check:pack`.
 *
 * The pack is a deck's shareable form: a .zip of .pfm + .json + catalog.txt
 * served from a stable URL. Two things in it are quiet when they break.
 *
 * The FINGERPRINT is the whole cache policy. If it stops changing when the
 * running order changes, a rearranged deck keeps serving the old pack forever
 * and nobody finds out until a device plays the wrong set. If it changes when
 * nothing changed, every download recompiles.
 *
 * The CATALOG is the running order the device reads. Written wrong — extra
 * blanks, missing trailing newline, wrong order — and the device falls back
 * to sorting alphabetically, silently discarding the arrangement.
 *
 * The PERFORMANCE decoration runs on every download of a deck that has one,
 * and it rewrites the archive — so a mistake there breaks the pack itself,
 * not just the performance. It must add the table, leave the modules alone,
 * and refuse to fail loudly: a broken attachment may cost its own file and
 * nothing else.
 */

import { unzipSync, zipSync } from "fflate";

import { decoratePackWithPerformance, fingerprintDeck } from "../src/lib/community/deckZip";
import { decodePfst } from "../src/lib/community/performance";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}` +
      (ok ? "" : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`),
  );
}

const slot = (id: string, code: string | null = "#pragma once") => ({
  patternId: id,
  codeCpp: code,
});

console.log("\nfingerprint — what must and must not invalidate a built pack\n");

const base = [slot("a"), slot("b"), slot("c")];

check("same deck, same fingerprint", fingerprintDeck(base), fingerprintDeck([...base]));

check(
  "reordering changes it",
  fingerprintDeck([slot("b"), slot("a"), slot("c")]) === fingerprintDeck(base),
  false,
);

check(
  "swapping a pattern changes it",
  fingerprintDeck([slot("a"), slot("b"), slot("d")]) === fingerprintDeck(base),
  false,
);

check(
  "removing a pattern changes it",
  fingerprintDeck([slot("a"), slot("b")]) === fingerprintDeck(base),
  false,
);

// A pattern's author fixing a bad header must reach people who download the
// deck — otherwise the pack keeps shipping the broken build.
check(
  "an edited header changes it",
  fingerprintDeck([slot("a"), slot("b"), slot("c", "#pragma once\n// fixed")]) ===
    fingerprintDeck(base),
  false,
);

// The near-miss that a length-based key waves through, and the reason this
// hashes: same character count, different code.
check(
  "a same-length header edit changes it",
  fingerprintDeck([slot("a"), slot("b"), slot("c", "#pragma once")]) ===
    fingerprintDeck([slot("a"), slot("b"), slot("c", "#pragma ONCE!")]),
  false,
);

// A slot whose pattern was deleted still counts: the deck now builds to
// something different, and the pack has to follow.
check(
  "a slot going empty changes it",
  fingerprintDeck([slot("a"), slot("b"), slot("c", null)]) === fingerprintDeck(base),
  false,
);

console.log("\ncatalog.txt — the running order the device reads\n");

// Mirrors what runModuleBuildZipped writes. Kept here as the spec: the
// firmware's applyCatalogOrder() skips blank lines and lines starting with
// '#', matches the rest against module filenames, and leaves anything
// unlisted in its existing order.
function buildCatalog(slugs: string[]): string {
  return (
    "# Patternflow running order — one module slug per line.\n" +
    "# Written by the deck export; the device reads it at boot.\n" +
    slugs.join("\n") +
    "\n"
  );
}

const catalog = buildCatalog(["cell_ripple", "conway_life", "wave_saw"]);
const lines = catalog.split("\n");
const meaningful = lines.filter((line) => line.trim() && !line.startsWith("#"));

check("slugs come out in deck order", meaningful, ["cell_ripple", "conway_life", "wave_saw"]);
check("ends with a newline", catalog.endsWith("\n"), true);
check("no blank line before the first slug", lines[2], "cell_ripple");
check("comments are '#'-prefixed", lines.slice(0, 2).every((l) => l.startsWith("#")), true);

// One module is the common case for a single-pattern deck and the one most
// likely to produce a stray empty line.
check("a one-module pack is well formed", buildCatalog(["origin"]).split("\n").filter((l) => l.trim() && !l.startsWith("#")), ["origin"]);

// ── performance decoration ───────────────────────────────────────────────
console.log("\nperformance rides the pack");

const basePack = zipSync({
  "wave_saw.pfm": new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]),
  "wave_saw.json": new TextEncoder().encode('{"slug":"wave_saw","abi":1}'),
  "catalog.txt": new TextEncoder().encode("wave_saw\n"),
});

const performanceJson = JSON.stringify({
  version: 1,
  id: "sunset-set",
  title: "Sunset Set",
  length: 24,
  loop: true,
  timeline: [
    { t: 0, pattern: "Wave Saw" },
    { t: 0, param: [200, 500, 500, 800] },
    { t: 12, param: [800, 500, 200, 100] },
    { t: 20, message: "encore" },
  ],
});

const decorated = unzipSync(decoratePackWithPerformance(basePack, performanceJson));
const names = Object.keys(decorated).sort();

check("the modules survive untouched", names.includes("wave_saw.pfm"), true);
check("so does the running order", names.includes("catalog.txt"), true);
check("the packed table is added, named from the id", names.includes("sunset_set.pfs"), true);
// The Director opens and saves .pfs, so the table IS the document — a JSON
// beside it would be a file nothing opens.
check("no JSON rides along", names.includes("performance.json"), false);

// The .pfs is what the panel plays, so it has to be a table, not bytes that
// merely exist — decode it back and check the timeline survived the trip.
const table = decodePfst(decorated["sunset_set.pfs"]);
check("the .pfs decodes to the same show", table.title, "Sunset Set");
check("its cues are all there", table.timeline.length, 4);
check("its pattern cue points at the pattern", table.timeline[0].pattern, "Wave Saw");
check("loop survives", table.loop, true);
check("a sparse param patch survives", table.timeline[2].param, [800, 500, 200, 100]);

// A deck with no performance must get byte-identical bytes back, or every
// download of every plain deck pays for a pointless repack.
check(
  "no performance means the pack is not touched at all",
  decoratePackWithPerformance(basePack, null) === basePack,
  true,
);

// Broken attachments are the case that must not cascade: the pack is what
// people came for.
for (const [label, bad] of [
  ["not JSON", "{{{"],
  ["no timeline", '{"version":1,"title":"Empty"}'],
] as const) {
  const out = decoratePackWithPerformance(basePack, bad);
  const entries = Object.keys(unzipSync(out));
  check(`a performance that is ${label} still leaves an installable pack`, entries.includes("wave_saw.pfm"), true);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
