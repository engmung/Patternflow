// ── Director: performance authoring for the lab ──────────────────────────────
// A show is knob automation over time, authored against the pattern being
// built. The device truth is the PFST v2 cue table — cues on a 0.1 s grid,
// each setting some of the four absolute channels (0..1000); a plain cue
// holds until the next, an EASE cue lerps toward it — so keyframes live on
// that same 0.1 s grid and carry wire values. The editor optionally snaps
// them to a coarser grid (1 s / 0.5 s / ...) purely as an authoring aid.
// "Animation" is a curve on the segment between two keyframes
// (Blender-style: grab the handles and pull); bake.ts flattens it into
// eased linear pieces within a sub-detent error, so the lab preview, the
// exported .pfs and the panel all play the same show.

/** How the segment LEAVING a keyframe reaches the next one. */
export type SegmentMode = "hold" | "curve";

/**
 * Who shapes a curve segment's bezier. "auto" — the default for new keys —
 * derives the handles from the neighboring keyframes (Blender's auto-clamped
 * idea: flat at the ends and at local extremes, secant slope through monotone
 * runs, clamped so the curve never leaves the band between its endpoints);
 * the stored cp is ignored and resolveLane materializes it. "manual" is a
 * hand-shaped bezier: the stored cp is the truth. ABSENT means manual —
 * every show saved before handle modes existed was hand-shaped (or hold),
 * and reading absent as manual keeps those bakes bit-identical.
 */
export type HandleMode = "auto" | "manual";

export type DirectorKeyframe = {
  id: string;
  /** Seconds on the 0.1 s wire grid (PFST v2 deciseconds). */
  t: number;
  /** Absolute wire value 0..1000, the device's bus unit. */
  v: number;
  mode: SegmentMode;
  /** Handle mode for "curve" segments; absent = manual (see HandleMode). */
  h?: HandleMode;
  /**
   * cubic-bezier(x1, y1, x2, y2) easing for "curve", in segment-normalized
   * space (0,0 → 1,1). x is clamped to [0,1] by the editor; y may overshoot,
   * the baked wire value clamps to 0..1000. For h: "auto" this is a
   * placeholder — the effective cp comes from resolveLane.
   */
  cp: [number, number, number, number];
};

/**
 * A pattern switch at a point in time — "at t, show this pattern".
 *
 * The lab does not author these: its Director builds a show for the one
 * pattern on the canvas, and the piece's name goes on the opening cue.
 * Other editors do author them — a show can walk a whole palette — and the
 * format has carried them since v1. They are kept here so that opening
 * such a show in the lab and exporting it again returns the pattern
 * switches untouched, instead of silently deleting somebody's palette.
 */
export type DirectorPatternCue = {
  id: string;
  t: number;
  name: string;
};

export type DirectorMessage = {
  id: string;
  t: number;
  /** Banner text the device scrolls; empty strings are dropped at bake. */
  text: string;
};

export type DirectorShow = {
  title: string;
  /** Authoring length in seconds; never shorter than the last cue at bake. */
  length: number;
  loop: boolean;
  /** One lane per physical knob, keyframes kept sorted by t. */
  lanes: [DirectorKeyframe[], DirectorKeyframe[], DirectorKeyframe[], DirectorKeyframe[]];
  messages: DirectorMessage[];
  /**
   * Pattern switches this show carried in from elsewhere. Never written by
   * the lab's own editing; passed through on import/export so a
   * multi-pattern show survives a round trip (see DirectorPatternCue).
   */
  patternCues?: DirectorPatternCue[];
};

/** Gentle ease-in-out — the default shape when a segment turns into a curve. */
export const DEFAULT_CURVE_CP: [number, number, number, number] = [0.35, 0, 0.65, 1];

/**
 * A straight-line bezier. Imported v2 EASE cues come back as curve segments
 * with this shape: the file stores flattened linear pieces, so pieces are
 * what an import can honestly reconstruct (the original bezier only exists
 * in Director JSON). Re-baking a linear segment reproduces the same piece,
 * so a v2 file round-trips exactly.
 */
export const LINEAR_CURVE_CP: [number, number, number, number] = [1 / 3, 1 / 3, 2 / 3, 2 / 3];

/** Everything time in a show sits on this grid — PFST v2 deciseconds. */
export function snapWireTime(t: number): number {
  // n/10, not n*0.1 — must match the decoder's raw/10 bit-for-bit.
  return Math.round(t * 10) / 10;
}

export const DIRECTOR_MAX_SECONDS = 3600;
export const DIRECTOR_DEFAULT_SECONDS = 30;

export function directorId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyShow(): DirectorShow {
  return {
    title: "",
    length: DIRECTOR_DEFAULT_SECONDS,
    loop: false,
    lanes: [[], [], [], []],
    messages: [],
  };
}

/** Anything worth playing, exporting, or publishing? */
export function showHasContent(show: DirectorShow): boolean {
  return show.lanes.some((lane) => lane.length > 0) || show.messages.length > 0;
}

export function cloneShow(show: DirectorShow): DirectorShow {
  return {
    title: show.title,
    length: show.length,
    loop: show.loop,
    lanes: show.lanes.map((lane) => lane.map((k) => ({ ...k, cp: [...k.cp] }))) as DirectorShow["lanes"],
    messages: show.messages.map((m) => ({ ...m })),
    patternCues: show.patternCues?.map((c) => ({ ...c })),
  };
}
