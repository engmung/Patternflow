// ── Director: performance authoring for the lab ──────────────────────────────
// A show is knob automation over time, authored against the pattern being
// built. The device truth is the .pfs cue table — whole-second cues, each
// setting some of the four absolute channels (0..1000) and holding until the
// next — so the authoring grid IS that grid: keyframes sit on whole seconds
// and carry wire values. "Animation" is a curve on the segment between two
// keyframes (Blender-style: grab the handles and pull); bake.ts samples it
// at every second in between, so the lab preview, the exported .pfs and the
// panel all play the exact same staircase.

/** How the segment LEAVING a keyframe reaches the next one. */
export type SegmentMode = "hold" | "curve";

export type DirectorKeyframe = {
  id: string;
  /** Whole seconds — the .pfs cue grid is the authoring grid. */
  t: number;
  /** Absolute wire value 0..1000, the device's bus unit. */
  v: number;
  mode: SegmentMode;
  /**
   * cubic-bezier(x1, y1, x2, y2) easing for "curve", in segment-normalized
   * space (0,0 → 1,1). x is clamped to [0,1] by the editor; y may overshoot,
   * the baked wire value clamps to 0..1000.
   */
  cp: [number, number, number, number];
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
};

/** Gentle ease-in-out — the default shape when a segment turns into a curve. */
export const DEFAULT_CURVE_CP: [number, number, number, number] = [0.35, 0, 0.65, 1];

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
  };
}
