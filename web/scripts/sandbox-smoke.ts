/**
 * Sandbox clock smoke — `npm run check:sandbox`.
 *
 * Drives the REAL tick()/step()/wake() out of public/pattern-sandbox.html with
 * a controlled clock. The script text is taken verbatim; the page exposes its
 * `live` state as globalThis.__pfLive for exactly this.
 *
 * What this guards, and why it needs a fake clock rather than a browser: the
 * live preview turns wall-clock time into simulation time, and getting that
 * wrong is invisible in every way a normal test looks. dt used to be clamped to
 * 50 ms and handed over once per frame, so a preview rendering at 10fps
 * advanced the simulation 50 ms per 100 ms of real time — a flocking pattern
 * moved at half speed on the wall and full speed on its own page, and nothing
 * errored. The numbers below are the arithmetic that made it visible.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SANDBOX = path.join(process.cwd(), "public", "pattern-sandbox.html");
const script = fs.readFileSync(SANDBOX, "utf8").match(/<script>([\s\S]*)<\/script>/)?.[1];
if (!script) {
  console.error("Could not find the sandbox script block in", SANDBOX);
  process.exit(1);
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

type Posted = { type?: string; ok?: boolean; error?: string; dataUrl?: string };

type Harness = {
  live: () => { runtime: { params: Record<string, number> } };
  send: (data: unknown) => void;
  /** Advance the wall clock and run the pending frame, if one is scheduled. */
  frame: (ms: number) => void;
  asleep: () => boolean;
  /** What the pattern reported: accumulated dt, as seconds. */
  simSeconds: () => number | null;
  /** Everything posted back to the parent. */
  posted: Posted[];
};

function boot(): Harness {
  let painted: Uint8ClampedArray | null = null;
  let pending: ((now: number) => void) | null = null;
  let handler: ((event: { data: unknown }) => void) | null = null;
  let clock = 1000;
  const posted: Posted[] = [];

  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img: { data: Uint8ClampedArray }) => { painted = img.data.slice(); },
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  const canvas = () => ({ width: 128, height: 64, getContext: () => ctx, toDataURL: () => "data:," });

  const sandbox: Record<string, unknown> = {
    document: { getElementById: canvas, createElement: canvas },
    parent: { postMessage: (m: Posted) => posted.push(m) },
    performance: { now: () => clock },
    requestAnimationFrame: (fn: (now: number) => void) => { pending = fn; return 1; },
    cancelAnimationFrame: () => { pending = null; },
    window: {
      addEventListener: (type: string, fn: (event: { data: unknown }) => void) => {
        if (type === "message") handler = fn;
      },
    },
    console,
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script as string, sandbox);

  return {
    live: () => sandbox.__pfLive as Harness extends never ? never : { runtime: { params: Record<string, number> } },
    send: (data) => handler?.({ data }),
    frame: (ms) => { clock += ms; const fn = pending; pending = null; fn?.(clock); },
    asleep: () => pending === null,
    simSeconds: () => {
      if (!painted) return null;
      let lit = 0;
      for (let i = 0; i < painted.length; i += 4) if (painted[i] > 128) lit += 1;
      return Number((lit / 100).toFixed(2));
    },
    posted,
  };
}

/** Reports the dt it was handed, as one lit pixel per 10 ms. */
const PROBE = `
// @matrix 128x64
export function setup(p){ p.t = 0; p.turns = 0; }
export function update(dt, input, p){
  p.t += dt;
  if (input.knobDeltas && input.knobDeltas[0]) p.turns += 1;
}
export function draw(display, p, time){
  const lit = Math.round(p.t * 100);
  for (let i = 0; i < lit && i < 128*64; i++) display.setPixel(i % 128, (i/128)|0, 255,255,255);
}`;

const load = (s: Harness, running: boolean) =>
  s.send({
    type: "pf-load", code: PROBE, running,
    knobValues: [0.5, 0.5, 0.5, 0.5], knobRanges: [[0, 1], [0, 1], [0, 1], [0, 1]],
    knobWrap: [false, false, false, false], knobUnitsPerTurn: [1, 1, 1, 1],
  });

// ── A paused preview schedules nothing ──────────────────────────────────────
// The wall mounts one sandbox per nearby card. They used to re-arm rAF forever
// and bail out inside the callback — cheap per call, and thirteen documents
// holding a live animation callback sharing the budget with the one card the
// cursor is on.
{
  const s = boot();
  load(s, false);
  check("a paused load wakes once", s.asleep(), false);
  s.frame(16);
  check("…paints that frame", s.simSeconds() !== null, true);
  check("…then stops scheduling entirely", s.asleep(), true);
  s.frame(16);
  check("…and stays asleep", s.asleep(), true);

  s.send({ type: "pf-run", running: true });
  check("running wakes it", s.asleep(), false);
  s.frame(16);
  check("…and it keeps itself going", s.asleep(), false);

  s.send({ type: "pf-run", running: false });
  s.frame(16);
  check("pausing settles, then sleeps", s.asleep(), true);

  s.send({ type: "pf-knobs", values: [0.7, 0.5, 0.5, 0.5], ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] });
  check("a knob turn wakes a paused preview", s.asleep(), false);
  s.frame(16);
  check("…for exactly one repaint", s.asleep(), true);
}

// ── Wall-clock time reaches the pattern at any frame rate ───────────────────
// Before the catch-up stepping these read 3.00 / 3.00 / 3.00 / 2.25 / 1.50 /
// 0.90 — i.e. below 20fps the pattern ran in slow motion, proportionally.
for (const [label, frameMs, frames] of [
  ["60fps", 16.667, 180],
  ["30fps", 33.333, 90],
  ["20fps", 50, 60],
  ["15fps", 66.667, 45],
  ["10fps", 100, 30],
  ["6fps", 166.667, 18],
] as const) {
  const s = boot();
  load(s, true);
  s.frame(0); // the wake frame carries no elapsed time
  for (let i = 0; i < frames; i += 1) s.frame(frameMs);
  check(`${label}: 3s of wall clock is 3s of simulation`, s.simSeconds(), 3);
}

// ── …but a genuine stall is dropped, never fast-forwarded ───────────────────
{
  const s = boot();
  load(s, true);
  s.frame(0);
  s.frame(60_000); // a minute in a background tab
  check("a 60s stall advances at most MAX_CATCHUP", s.simSeconds(), 0.25);
}

// ── A knob turn is one event, not one per catch-up step ─────────────────────
{
  const s = boot();
  load(s, true);
  s.frame(0);
  s.send({ type: "pf-knobs", values: [0.9, 0.5, 0.5, 0.5], ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] });
  s.frame(250); // 250ms behind — five catch-up steps in the one frame
  check("a knob turn is seen once, not once per substep", s.live().runtime.params.turns, 1);
}

// ── The still path is untouched, and never runs the live clock ──────────────
// Thumbnails step at a fixed 1/fps with no clamp. A still must also not wake
// the animation loop: the wall renders one per card through a single hidden
// sandbox, and a still that left a frame scheduled would start them all.
{
  const s = boot();
  load(s, false);
  s.frame(16);                       // settle the paused load, then sleep
  check("paused before the still", s.asleep(), true);

  s.send({
    type: "pf-still", id: "x", code: PROBE,
    knobValues: [0.5, 0.5, 0.5, 0.5], knobRanges: [[0, 1], [0, 1], [0, 1], [0, 1]],
    seconds: 0.9, fps: 15,
  });
  const result = s.posted.find((m) => m.type === "pf-still-result");
  check("a still comes back", result?.ok, true);
  check("…carrying an image", typeof result?.dataUrl === "string", true);
  check("…and schedules no frame of its own", s.asleep(), true);
}

console.log(failures === 0 ? "\nAll sandbox clock checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
