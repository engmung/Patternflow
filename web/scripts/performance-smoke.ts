// Smoke test for the performance library: normalize/validate a Director-shaped
// JSON, encode PFST v1, and assert the byte layout the device's core_show.h
// reads. The encoder was verified byte-identical against the Director PWA's
// own .pfs saves (its four demos) when it landed; this keeps the structural
// contract pinned without needing those files. Run:
//   npx tsx scripts/performance-smoke.ts

import fs from "node:fs";
import path from "node:path";

import {
  PFST_HEADER_BYTES,
  PFST_CUE_BYTES,
  decodePfst,
  encodePfst,
  normalizePerformance,
  pfsFilename,
  serializePerformance,
  validatePerformance,
} from "../src/lib/pattern/pfst";

let failed = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

console.log("\nnormalize + validate");
const raw = JSON.stringify({
  version: 1,
  id: "smoke-set",
  title: "Smoke Set",
  length: 30,
  loop: true,
  timeline: [
    { t: 5, param: { "2": 800 } }, // sparse, 1-based object form
    { t: 0, pattern: "Origin" },
    { t: 0, param: [200, 500, 500, 900] },
    { t: 12.4, message: "encore" }, // quantizes to 12
    { t: 20, message: "" }, // empty clears the banner
    { t: 3, param: [2000, -5, null, null] }, // clamps to 1000 / 0
    { bogus: true }, // no usable field — dropped
  ],
});
const verdict = validatePerformance(raw);
check("validates", verdict.ok);
if (!verdict.ok) {
  console.log(`  (${verdict.error})`);
  process.exit(1);
}
const perf = verdict.perf;
check("cues sorted by time, pattern before param at t=0",
  perf.timeline[0].pattern === "Origin" && perf.timeline[1].param?.[0] === 200);
check("bogus cue dropped", perf.timeline.length === 6);
check("param clamps to 0..1000",
  perf.timeline[2].param?.[0] === 1000 && perf.timeline[2].param?.[1] === 0);
check("time quantized to whole seconds",
  perf.timeline.some((cue) => cue.t === 12 && cue.message === "encore"));
check("filename slug", pfsFilename(perf) === "smoke_set.pfs");

console.log("\nPFST bytes (the table core_show.h walks)");
const bytes = encodePfst(perf);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
check("magic PFST", bytes[0] === 0x50 && bytes[1] === 0x46 && bytes[2] === 0x53 && bytes[3] === 0x54);
check("version 1", bytes[4] === 1);
check("loop flag set", bytes[5] === 1);
check("length u16 = 30 (authoring length wins over last cue)", view.getUint16(6, true) === 30);
check("cue count u16 = 6", view.getUint16(8, true) === 6);
const poolBytes = view.getUint16(10, true);
check("total size = header + pool + cues",
  bytes.length === PFST_HEADER_BYTES + poolBytes + 6 * PFST_CUE_BYTES);
const title = new TextDecoder().decode(bytes.slice(12, 12 + 9));
check("title NUL-padded in header", title === "Smoke Set" && bytes[12 + 9] === 0);
// First cue: t=0, pattern "Origin"
const cue0 = PFST_HEADER_BYTES + poolBytes;
check("cue0 t=0 with PATTERN flag", view.getUint16(cue0, true) === 0 && (bytes[cue0 + 2] & 1) === 1);
const patternOff = view.getUint16(cue0 + 4, true);
const pool = bytes.slice(PFST_HEADER_BYTES, PFST_HEADER_BYTES + poolBytes);
const patternName = new TextDecoder().decode(
  pool.slice(patternOff, pool.indexOf(0, patternOff)),
);
check('cue0 pattern resolves to "Origin" through the pool', patternName === "Origin");
check("pool offset 0 is the empty string", pool[0] === 0);

console.log("\n.pfs → performance (publishing accepts either half of a save)");
{
  // Round-trip our own encode first: decode must reproduce the timeline, and
  // re-encoding must reproduce the bytes.
  const back = decodePfst(bytes);
  check("decode keeps the cue count", back.timeline.length === perf.timeline.length);
  check("decode keeps title / loop / length",
    back.title === "Smoke Set" && back.loop === true && back.length === 30);
  check("decode keeps the pattern cue", back.timeline[0].pattern === "Origin");
  check("decode keeps a SPARSE param patch (flags carry which channels)",
    JSON.stringify(back.timeline.find((cue) => cue.t === 5)?.param) ===
      JSON.stringify([null, 800, null, null]));
  check("decode keeps an empty message cue",
    back.timeline.some((cue) => cue.t === 20 && cue.message === ""));
  check("re-encode reproduces the bytes",
    Buffer.from(encodePfst(back)).equals(Buffer.from(bytes)));

  // And against the Director's own saves, which is the real contract: these
  // .pfs files were written by Simone's tool, not by us.
  const demos = path.resolve(
    process.cwd(),
    "..",
    "_temp",
    "patternflow-SimonePDA-feature-performance-director",
    "director",
    "demos",
  );
  if (fs.existsSync(demos)) {
    let checked = 0;
    for (const file of fs.readdirSync(demos)) {
      if (!file.endsWith(".pfs")) continue;
      const raw = fs.readFileSync(path.join(demos, file));
      const decoded = decodePfst(new Uint8Array(raw));
      const reencoded = Buffer.from(encodePfst(decoded));
      check(`${file}: decode → encode is byte-identical`, reencoded.equals(raw));
      // And the decoded form must survive the same validation a paste does.
      const verdict2 = validatePerformance(JSON.stringify(serializePerformance(decoded)));
      check(`${file}: decoded form validates`, verdict2.ok);
      checked++;
    }
    if (checked === 0) console.log("  --    no demo .pfs found (skipped)");
  } else {
    console.log("  --    Director demos not in this checkout (skipped)");
  }

  check("rejects a file that is not a PFST table",
    (() => {
      try {
        decodePfst(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
        return false;
      } catch {
        return true;
      }
    })());
}

console.log("\nrefusals");
check("rejects non-JSON", !validatePerformance("not json").ok);
check("rejects an empty timeline", !validatePerformance('{"timeline":[]}').ok);
const tooMany = JSON.stringify({
  timeline: Array.from({ length: 300 }, (_, i) => ({ t: i, param: [1, null, null, null] })),
});
check("rejects >256 cues", !validatePerformance(tooMany).ok);
const bigPool = JSON.stringify({
  timeline: Array.from({ length: 200 }, (_, i) => ({ t: i, message: `m${"x".repeat(30)}${i}` })),
});
check("rejects a >4KB string pool", !validatePerformance(bigPool).ok);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
