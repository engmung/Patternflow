// ── Show transport: ONE clock for the show ───────────────────────────────────
// The playhead used to live inside the Director panel, which made the show's
// time a private fact of one view — and left every other consumer (the
// Capture stage above all) watching a different clock. Promoted here it is a
// lab-wide runtime fact: the Director panel is the view that EDITS the
// transport, and anything else — today the Capture panel's 🔗 link — reads
// and follows the same one. Playing and seeking drive the shared knob store
// exactly like the device's absolute bus drives the encoders, so the live
// preview and the capture stage follow automatically, because they already
// follow the knobs.
//
// `follow` rides along as transport state: it is the Capture panel's
// "the show is the truth for my exports" switch, and it lives here (not in
// the capture module) so the Director's Render… shortcut can switch it on
// without the director ever importing the capture add-on.
//
// Runtime state only — nothing here persists with the project.

import { BUS_WIRE_MAX } from "@/lib/pattern/controls";
import { bakeShowV2, resolveLane, resolvedLaneValue } from "./bake";
import { showHasContent, type DirectorKeyframe, type DirectorShow } from "./types";
import { useLabStore } from "../store";

export type ShowTransportState = {
  /** Playhead seconds on the show's clock. */
  time: number;
  playing: boolean;
  /** Capture's 🔗 Director link — exports follow the show while on. */
  follow: boolean;
};

type ShowTransport = {
  get(): ShowTransportState;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  setFollow(on: boolean): void;
  duration(): number;
  /** Notified on every transport change, including each playing frame. */
  subscribe(listener: (state: ShowTransportState) => void): () => void;
};

function createTransport(): ShowTransport {
  let time = 0;
  let playing = false;
  let follow = false;
  let raf = 0;
  let last = 0;
  const listeners = new Set<(state: ShowTransportState) => void>();

  // Duration and resolved curves, cached by show identity — the driver reads
  // them every frame and edits swap the director object in the store.
  let cachedShow: DirectorShow | null = null;
  let cachedResolved: DirectorKeyframe[][] = [];
  let cachedDuration = 0;
  const showData = () => {
    const show = useLabStore.getState().director;
    if (show !== cachedShow) {
      cachedShow = show;
      cachedResolved = show.lanes.map((lane) => resolveLane(lane));
      cachedDuration = bakeShowV2(show).perf.length;
    }
    return { show, resolved: cachedResolved, duration: cachedDuration };
  };

  const get = (): ShowTransportState => ({ time, playing, follow });
  const notify = () => {
    const state = get();
    for (const listener of listeners) listener(state);
  };

  // Same continuous sampling the bake pipeline plays by; a lane is silent
  // before its first cue (the knob keeps its live value, device-style).
  const lastWire: (number | null)[] = [null, null, null, null];
  const applyKnobs = (t: number, force: boolean) => {
    const state = useLabStore.getState();
    const { resolved } = showData();
    for (let lane = 0; lane < 4; lane++) {
      const v = resolvedLaneValue(resolved[lane], t);
      if (v == null) continue;
      if (!force && lastWire[lane] === v) continue;
      lastWire[lane] = v;
      const range = state.ranges[lane] ?? [0, 1];
      state.setKnob(lane, range[0] + (v / BUS_WIRE_MAX) * (range[1] - range[0]));
    }
  };

  const tick = (now: number) => {
    if (!playing) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const { show, duration } = showData();
    let t = time + dt;
    if (t >= duration) {
      if (show.loop) {
        t = t % Math.max(0.1, duration);
      } else {
        time = duration;
        playing = false;
        applyKnobs(duration, false);
        notify();
        return;
      }
    }
    time = t;
    applyKnobs(t, false);
    notify();
    raf = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    notify();
  };

  const seek = (t: number) => {
    const { duration } = showData();
    time = Math.max(0, Math.min(duration, t));
    applyKnobs(time, true);
    notify();
  };

  const play = () => {
    if (playing || typeof window === "undefined") return;
    const { show, duration } = showData();
    if (!showHasContent(show)) return;
    if (time >= duration) seek(0);
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
    notify();
  };

  return {
    get,
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    seek,
    setFollow(on) {
      if (follow === on) return;
      follow = on;
      notify();
    },
    duration: () => showData().duration,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// One transport per page, dev reloads included — a stale module's rAF driver
// must never race a fresh one.
const host = globalThis as { __pfShowTransport?: ShowTransport };
export const showTransport: ShowTransport = (host.__pfShowTransport ??= createTransport());
