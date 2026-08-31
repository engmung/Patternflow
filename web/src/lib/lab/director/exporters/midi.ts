// ── MIDI export: the show as CC automation ───────────────────────────────────
// A Standard MIDI File any DAW opens: each knob lane becomes one CC
// automation, so dropping the .mid on an Ableton track and MIDI-mapping the
// four CCs to macros replays the show against anything. Format 0, PPQ 480 at
// a fixed 120 BPM — 1 s = 960 ticks, so the 0.1 s wire grid lands on exact
// ticks (96) and the file's clock IS the show's clock at the DAW's default
// tempo. Values come from the canonical sampler (sample.ts), scaled to
// 7 bits and deduped, so ramps are dense, holds are single events, and the
// envelope a DAW draws is what the panel played.

import { sampleShow } from "../sample";
import type { DirectorShow } from "../types";

/**
 * One CC per lane, on channel 1. CC 20–23 are undefined in the MIDI spec —
 * nothing common listens to them by accident, which is exactly what you want
 * for MIDI-learn.
 */
export const MIDI_LANE_CCS = [20, 21, 22, 23] as const;

const PPQ = 480;
const TEMPO_USEC = 500_000; // 120 BPM
const TICKS_PER_SECOND = (PPQ * 1_000_000) / TEMPO_USEC; // 960
/** Sampling for 7-bit change detection — well under one tick of slack. */
const SAMPLE_FPS = 100;

function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function metaText(type: number, text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  return [0xff, type, ...vlq(bytes.length), ...bytes];
}

export function midiFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);
  return `${slug || "lab-show"}.mid`;
}

export function showToMidi(
  show: DirectorShow,
  opts?: { labels?: readonly string[] },
): Uint8Array {
  // The sampler's default count includes the end instant, so a ramp's final
  // CC lands exactly on its target value.
  const sampled = sampleShow(show, SAMPLE_FPS);

  // Events as (tick, raw bytes) in nondecreasing tick order: metas at 0,
  // then one pass over the frames emitting every 7-bit change per lane.
  const events: Array<{ tick: number; bytes: number[] }> = [];
  events.push({ tick: 0, bytes: metaText(0x03, show.title.trim() || "lab-show") });
  events.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (TEMPO_USEC >> 16) & 0xff, (TEMPO_USEC >> 8) & 0xff, TEMPO_USEC & 0xff],
  });
  for (let lane = 0; lane < 4; lane++) {
    const label = opts?.labels?.[lane]?.trim();
    if (label) events.push({ tick: 0, bytes: metaText(0x01, `${label} = CC${MIDI_LANE_CCS[lane]}`) });
  }

  const last: number[] = [-1, -1, -1, -1];
  for (let f = 0; f < sampled.frames; f++) {
    const tick = Math.round((f / SAMPLE_FPS) * TICKS_PER_SECOND);
    for (let lane = 0; lane < 4; lane++) {
      const wire = sampled.wire[lane][f];
      if (Number.isNaN(wire)) continue; // before the lane's first cue: silent
      const value = Math.max(0, Math.min(127, Math.round((wire * 127) / 1000)));
      if (value === last[lane]) continue;
      last[lane] = value;
      events.push({ tick, bytes: [0xb0, MIDI_LANE_CCS[lane], value] });
    }
  }

  const endTick = Math.round(sampled.duration * TICKS_PER_SECOND);
  const track: number[] = [];
  let at = 0;
  for (const event of events) {
    track.push(...vlq(event.tick - at), ...event.bytes);
    at = event.tick;
  }
  track.push(...vlq(Math.max(0, endTick - at)), 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0, 0, 0, 6,
    0, 0, // format 0
    0, 1, // one track
    (PPQ >> 8) & 0xff, PPQ & 0xff,
  ];
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
  ];
  return new Uint8Array([...header, ...trackHeader, ...track]);
}
