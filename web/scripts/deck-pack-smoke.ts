/**
 * Deck pack smoke test — `npm run check:pack`.
 *
 * The pack is a deck's shareable form: a .zip of .pfm + .json + catalog.txt
 * served from a stable URL, assembled per request from the module cache
 * (lib/community/server/deckZip.ts + modulePack.ts). The database side — which
 * slots go in, which are skipped and why, 202 while baking — is driven through
 * the real route in check:modcache. This file pins the pure parts, each of
 * which is quiet when it breaks.
 *
 * The CATALOG is the running order the device reads. Written wrong — extra
 * blanks, missing trailing newline, wrong order — and the device falls back
 * to sorting alphabetically, silently discarding the arrangement.
 *
 * FILE NAMES are what the board keys a module by. Two slots landing on one
 * name used to fail the whole pack; now the later one is renamed, and the
 * rename has to survive the board's 39-character cut or it collides again
 * on arrival.
 *
 * The SIDECAR is what a board lists before it loads a module. The device
 * reads the first "name" token it finds with a substring scan, so "name"
 * must come first and be spelled the way Python's json.dumps spells it.
 *
 * The PERFORMANCE decoration must add the table, leave the modules alone,
 * and refuse to fail loudly: a broken attachment may cost its own file and
 * nothing else.
 */

import { unzipSync, zipSync } from "fflate";

import {
  decoratePackWithPerformance,
  deckZipFilename,
  performanceEntry,
} from "../src/lib/community/server/deckZip";
import {
  DEVICE_SLUG_MAX,
  assignPackSlugs,
  catalogText,
  composeSidecar,
  pythonJsonDumps,
  sanitizeSidecar,
  zipFiles,
} from "../src/lib/community/server/modulePack";
import { decodePfst } from "../src/lib/pattern/pfst";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}` +
      (ok ? "" : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`),
  );
}

console.log("\ncatalog.txt — the running order the device reads\n");

// The firmware's applyCatalogOrder() skips blank lines and lines starting with
// '#', matches the rest against module filenames, and leaves anything
// unlisted in its existing order.
const catalog = catalogText(["cell_ripple", "conway_life", "wave_saw"]);
const lines = catalog.split("\n");
const meaningful = lines.filter((line) => line.trim() && !line.startsWith("#"));

check("slugs come out in deck order", meaningful, ["cell_ripple", "conway_life", "wave_saw"]);
check("ends with a newline", catalog.endsWith("\n"), true);
check("no blank line before the first slug", lines[2], "cell_ripple");
check("comments are '#'-prefixed", lines.slice(0, 2).every((l) => l.startsWith("#")), true);
// One module is the common case for a single-pattern deck and the one most
// likely to produce a stray empty line.
check(
  "a one-module pack is well formed",
  catalogText(["origin"]).split("\n").filter((l) => l.trim() && !l.startsWith("#")),
  ["origin"],
);

console.log("\nfile names — unique on the board, in slot order\n");

check("distinct names are left alone", assignPackSlugs(["a", "b", "c"]), ["a", "b", "c"]);
check(
  "a repeated name is renamed, not dropped",
  assignPackSlugs(["wave", "wave", "wave"]),
  ["wave", "wave_2", "wave_3"],
);
// port_preset.py names every non-ASCII NAME "pattern" — a deck of Korean
// titles is exactly this.
check(
  "the non-ASCII fallback name spreads out",
  assignPackSlugs(["pattern", "pattern", "origin", "pattern"]),
  ["pattern", "pattern_2", "origin", "pattern_3"],
);
// A real slot that is already called wave_2 must not be overwritten by a
// renamed duplicate.
check(
  "a rename skips names another slot already has",
  assignPackSlugs(["wave", "wave_2", "wave"]),
  ["wave", "wave_2", "wave_3"],
);
check("FAT is case-insensitive, so the check is too", assignPackSlugs(["Wave", "wave"]), ["Wave", "wave_2"]);

const long = "a".repeat(50);
const longNames = assignPackSlugs([long, long]);
check("a long name is cut to what the board keeps", longNames[0].length, DEVICE_SLUG_MAX);
check("its duplicate still fits after the suffix", longNames[1].length, DEVICE_SLUG_MAX);
check("…and still differs after the cut", longNames[0] === longNames[1], false);
check("the suffix survives", longNames[1].endsWith("_2"), true);
// Two names that differ only past character 39 are one file on the board.
check(
  "names equal within the board's 39 characters collide, and are separated",
  assignPackSlugs([`${"b".repeat(39)}x`, `${"b".repeat(39)}y`]).map((s) => s.length <= DEVICE_SLUG_MAX),
  [true, true],
);
check(
  "…into two different files",
  new Set(assignPackSlugs([`${"b".repeat(39)}x`, `${"b".repeat(39)}y`])).size,
  2,
);

console.log("\nsidecar — what a board lists before it loads the module\n");

// What build_module.py writes, including the two worker-local fields.
const raw = pythonJsonDumps({
  name: "Café Ripple",
  namespace: "CafeRipple",
  author: "unknown",
  license: "CC-BY-SA-4.0",
  abi: 2,
  knobs: ["Speed", "Hue", "Scale", "Fade"],
  source: "/home/pi/Patternflow/.build-worker/modules/0123456789abcdef-0/src/pattern1.h",
  slug: "caf_ripple",
  absoluteReady: true,
  panel_w: 128,
  panel_h: 64,
  module: "caf_ripple.pfm",
  size: 6120,
  opt: "-Os",
});
check("non-ASCII is written as \\uXXXX, like Python", raw.includes('"Caf\\u00e9 Ripple"'), true);
check("indent is two spaces, like Python", raw.split("\n")[1], '  "name": "Caf\\u00e9 Ripple",');
check(
  "an astral character becomes a surrogate pair, like Python",
  pythonJsonDumps({ name: "🌊" }),
  '{\n  "name": "\\ud83c\\udf0a"\n}',
);
check("DEL is escaped too, like Python", pythonJsonDumps("\u007f"), '"\\u007f"');

const stored = sanitizeSidecar(raw);
check("the cache drops the worker's temp path", stored.includes(".build-worker"), false);
check("…and the optimisation flag", JSON.parse(stored).opt, undefined);
check("…and keeps what the device reads", JSON.parse(stored).absoluteReady, true);
check("a broken sidecar sanitises to an empty object", sanitizeSidecar("{nope"), "{}\n");

const source = {
  id: "p123",
  license: "CC-BY-4.0",
  authorHandle: "Alice",
  header: { code: "#pragma once", source: "port" as const, ownerId: "u2", portId: "h1", porterHandle: "bob" },
};
const served = composeSidecar(stored, { name: "Café Ripple", slug: "caf_ripple_2", source });
const servedJson = JSON.parse(served);
check("\"name\" is the very first key", served.split("\n")[1].startsWith('  "name"'), true);
check(
  "the first \"name\" token is the name (the device's substring scan)",
  served.slice(served.indexOf('"name"')).split('"')[3],
  "Caf\\u00e9 Ripple",
);
check("the author comes from the database, porter credited", servedJson.author, "Alice (firmware port by bob)");
check("the licence comes from the pattern row", servedJson.license, "CC-BY-4.0");
check("it links back to the pattern", servedJson.url, "https://patternflow.work/community/p/p123");
check("the slug is the file it will actually be", [servedJson.slug, servedJson.module], ["caf_ripple_2", "caf_ripple_2.pfm"]);
check("absoluteReady survives", servedJson.absoluteReady, true);
check("no worker path reaches a board", served.includes("source"), false);
check(
  "an author header credits the author alone",
  JSON.parse(
    composeSidecar(stored, {
      name: null,
      slug: "x",
      source: { ...source, header: { code: "", source: "author" as const, ownerId: "u1" } },
    }),
  ).author,
  "Alice",
);
check(
  "a missing cached sidecar still yields a named one",
  JSON.parse(composeSidecar(null, { name: "Fallback", slug: "fallback", source })).name,
  "Fallback",
);

console.log("\nfilename — says what it is\n");

check("an ASCII title slugs", deckZipFilename("My Sunset Set!", "0123456789abcdef"), "patternflow-deck-my-sunset-set.zip");
check(
  "a title with no ASCII falls back to the id",
  deckZipFilename("노을 세트", "0123456789abcdef"),
  "patternflow-deck-01234567.zip",
);
check(
  "a long title never ends in a dash",
  deckZipFilename(`${"ab ".repeat(30)}`, "0123456789abcdef").endsWith("-.zip"),
  false,
);

console.log("\nthe archive is deterministic\n");

const files = {
  "wave_saw.pfm": new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]),
  "wave_saw.json": new TextEncoder().encode('{"name":"Wave Saw"}\n'),
  "catalog.txt": new TextEncoder().encode(catalogText(["wave_saw"])),
};
const first = zipFiles(files);
check("same inputs, same bytes", Buffer.from(first).equals(Buffer.from(zipFiles({ ...files }))), true);
check("and it unpacks to what went in", Object.keys(unzipSync(first)).sort(), ["catalog.txt", "wave_saw.json", "wave_saw.pfm"]);

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
check("the route's entry and the decoration agree on the name", performanceEntry(performanceJson)?.name, "sunset_set.pfs");

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
// Unreadable JSON contributes nothing at all. (A readable one with no
// timeline normalises to an empty show, as it always has.)
check("an unreadable performance contributes no entry", performanceEntry("{{{"), null);

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
