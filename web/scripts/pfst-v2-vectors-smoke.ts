// Checks docs/pfst-v2-spec.md against its own test vectors: an executable
// model of the documented player rule is run over the shipped .pfs files and
// asserted at the values the spec's tables print. If the rule and the doc
// ever drift, this fails. Run: npx tsx scripts/pfst-v2-vectors-smoke.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePfst, type PerformanceCue } from "../src/lib/community/performance";

// Resolve vectors from THIS file, not the cwd the runner happened to use.
const VECTORS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/pfst-v2-vectors",
);

/**
 * Executable model of the spec's player rule (docs/pfst-v2-spec.md §3–4).
 * Returns the channel's value at a wall-clock time in seconds, or null before
 * the channel's first cue.
 */
function player(timeline: PerformanceCue[]) {
  return (ch: number, now: number): number | null => {
    // Last cue at or before `now` that sets this channel. A plain loop, not
    // forEach: an assignment inside a callback is invisible to TypeScript's
    // narrowing, which then reads the result as `never`.
    let from: PerformanceCue | null = null;
    let prevIdx = -1;
    for (let i = 0; i < timeline.length; i++) {
      const cue = timeline[i];
      if (cue.param?.[ch] != null && cue.t <= now) {
        from = cue;
        prevIdx = i;
      }
    }
    if (!from) return null;
    const fromValue = from.param![ch]!;
    if (!from.ease) return fromValue;

    let next: PerformanceCue | null = null;
    for (let j = prevIdx + 1; j < timeline.length; j++) {
      const cue = timeline[j];
      if (cue.param?.[ch] == null) continue;
      if (cue.t > from.t) next = cue; // a same-t next cue is no segment
      break; // the first cue that touches the channel decides
    }
    if (!next) return fromValue; // no later cue → hold
    const toValue = next.param![ch]!;
    if (now >= next.t) return toValue;
    const u = (now - from.t) / (next.t - from.t);
    return Math.round(fromValue + (toValue - fromValue) * u);
  };
}

let failures = 0;
function eq(label: string, got: number | null, want: number): void {
  if (got == null || Math.abs(got - want) > 1) {
    console.error(`FAIL ${label}: got ${got}, want ${want}`);
    failures++;
  }
}

function load(file: string) {
  return decodePfst(new Uint8Array(fs.readFileSync(path.join(VECTORS, file))));
}

// ── A: one eased ramp, ch1 0 → 1000 over 0.0–3.0 s ──
const a = load("a-ease-ramp.pfs");
const pa = player(a.timeline);
if (a.version !== 2) {
  console.error(`FAIL vector A should be version 2, got ${a.version}`);
  failures++;
}
const rampTable: [number, number][] = [
  [0, 0],
  [0.5, 167],
  [1, 333],
  [1.5, 500],
  [2, 667],
  [2.9, 967],
  [3, 1000],
  [4, 1000],
];
for (const [t, want] of rampTable) eq(`A t=${t}`, pa(0, t), want);

// ── B: eased ch1 alongside a hard-cutting ch2 at the same tick ──
const b = load("b-mixed-moment.pfs");
const pb = player(b.timeline);
eq("B ch1 t=1.75 (midpoint)", pb(0, 1.75), 500);
eq("B ch2 t=1.0", pb(1, 1.0), 250);
eq("B ch2 t=2.0 (never interpolates)", pb(1, 2.0), 250);
if (pb(1, 0.5) !== null) {
  console.error("FAIL B ch2 before its first cue should be null");
  failures++;
}

// ── C: chained eases — a segment's end arms the next ──
const c = load("c-chained.pfs");
const pc = player(c.timeline);
eq("C t=1.0 (up leg mid)", pc(0, 1.0), 400);
eq("C t=2.0 (junction exact)", pc(0, 2.0), 800);
eq("C t=3.0 (down leg mid)", pc(0, 3.0), 500);
eq("C t=4.0 (end)", pc(0, 4.0), 200);
eq("C t=5.0 (holds past the end)", pc(0, 5.0), 200);

// ── The two edge cases the spec decides in prose ──
const noNext = player([{ t: 0, param: [300, null, null, null], ease: true }]);
eq("EASE with no later cue holds", noNext(0, 9), 300);

const sameTick = player([
  { t: 1, param: [0, null, null, null], ease: true },
  { t: 1, param: [900, null, null, null] },
]);
eq("same-t next cue is no segment", sameTick(0, 1), 900);

if (failures > 0) {
  console.error(`\n${failures} mismatch(es) — the spec and the vectors disagree`);
  process.exit(1);
}
console.log("pfst v2 vectors OK — every case matches the documented rule");
