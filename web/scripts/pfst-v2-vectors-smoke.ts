// Checks docs/pfst-v2-spec.md against its own test vectors: an executable
// model of the documented player rule is run over the shipped .pfs files and
// asserted at the values the spec's tables print. If the rule and the doc
// ever drift, this fails. Run: npx tsx scripts/pfst-v2-vectors-smoke.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePfst } from "../src/lib/community/performance";

// Resolve vectors from THIS file, not the cwd the runner happened to use.
const VECTORS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/pfst-v2-vectors");

// Executable model of the spec's player rule (docs/pfst-v2-spec.md §3-4).
function player(timeline: any[], version: number) {
  const tick = version === 2 ? 0.1 : 1;
  return (ch: number, now: number) => {
    let prev: any = null, prevIdx = -1;
    timeline.forEach((c, i) => { if (c.param?.[ch] != null && c.t <= now) { prev = c; prevIdx = i; } });
    if (!prev) return null;
    if (!prev.ease) return prev.param[ch];
    let next: any = null;
    for (let j = prevIdx + 1; j < timeline.length; j++) {
      const c = timeline[j];
      if (c.param?.[ch] == null) continue;
      if (c.t > prev.t) next = c;
      break;                       // first cue touching the channel decides
    }
    if (!next) return prev.param[ch];
    if (now >= next.t) return next.param[ch];
    const u = (now - prev.t) / (next.t - prev.t);
    return Math.round(prev.param[ch] + (next.param[ch] - prev.param[ch]) * u);
  };
}
let fail = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = Math.abs((got ?? -1) - want) <= 1;
  if (!ok) { console.error(`FAIL ${label}: got ${got}, want ${want}`); fail++; }
};

const A = decodePfst(new Uint8Array(fs.readFileSync(path.join(VECTORS, "a-ease-ramp.pfs"))));
const pa = player(A.timeline, A.version);
console.log("A version", A.version, "length", A.length, "cues", A.timeline.length);
[[0,0],[0.5,167],[1,333],[1.5,500],[2,667],[2.9,967],[3,1000],[4,1000]].forEach(([t,v]) => eq(`A t=${t}`, pa(0,t as number), v as number));

const B = decodePfst(new Uint8Array(fs.readFileSync(path.join(VECTORS, "b-mixed-moment.pfs"))));
const pb = player(B.timeline, B.version);
eq("B ch1 t=1.75 (midpoint)", pb(0,1.75), 500);
eq("B ch2 t=1.0", pb(1,1.0), 250);
eq("B ch2 t=2.0 (never interpolates)", pb(1,2.0), 250);
if (pb(1,0.5) !== null) { console.error("FAIL B ch2 before its first cue should be null"); fail++; }

const C = decodePfst(new Uint8Array(fs.readFileSync(path.join(VECTORS, "c-chained.pfs"))));
const pc = player(C.timeline, C.version);
eq("C t=1.0 (up leg mid)", pc(0,1.0), 400);
eq("C t=2.0 (junction exact)", pc(0,2.0), 800);
eq("C t=3.0 (down leg mid)", pc(0,3.0), 500);
eq("C t=4.0 (end)", pc(0,4.0), 200);
eq("C t=5.0 (holds past end)", pc(0,5.0), 200);

// Edge: EASE with no later cue on that channel must hold.
const hold = player([{t:0,param:[300,null,null,null],ease:true}], 2);
eq("no-next holds", hold(0, 9), 300);
// Edge: next cue at the SAME t must not interpolate.
const samet = player([{t:1,param:[0,null,null,null],ease:true},{t:1,param:[900,null,null,null]}], 2);
eq("same-t no segment", samet(0, 1), 900);

console.log(fail === 0 ? "\nspec vectors OK — all cases match the documented rule" : `\n${fail} MISMATCHES`);
process.exit(fail ? 1 : 0);
