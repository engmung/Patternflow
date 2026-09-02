// ── Generation settings the rest of the app may name ─────────────────────────
// The lab's project stores a GenSettings block (how many variants, how much
// thinking, which colour model) and persists it; the community's atlas quotes
// the prompt vocabulary. None of that needs the Gemini client — a 500-line
// module that talks to Google — so the vocabulary lives here, dependency-free,
// and gemini.ts re-exports it for callers that already import from there.

// More thinking = more varied/correct output but slower.
export type ThinkingLevelKey = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
export const THINKING_LEVELS: ThinkingLevelKey[] = ["MINIMAL", "LOW", "MEDIUM", "HIGH"];
// Default reasoning depth. "LOW" keeps batches responsive.
export const GEMINI_THINKING_LEVEL: ThinkingLevelKey = "LOW";

// How generated patterns handle colour:
// - "rgb": the model colours every pixel itself via setPixel (classic mode).
// - "vfield": the model outputs a pure 0..1 value field via setValue; colour is
//   applied by the user-controlled Color Ramp in Pattern Lab. Keeps the model
//   focused on geometry/motion — the part it's good at — and leaves colour to
//   the human.
//
// NOTE — there is deliberately no "orientation" setting any more. There used
// to be one, and it was the source of a whole class of broken output: it told
// the model to compose along the *opposite* axis from the one the user picked,
// to compensate for the panel's mounting, while every other line of the prompt
// still claimed the frame was 128×64. Orientation is not independent
// information: a 64×128 frame *is* portrait. The model gets the real frame
// dimensions and nothing else, and the logical→physical mapping happens once,
// at the display boundary. See lib/pattern/matrix.ts.
export type ColorMode = "rgb" | "vfield";
export const COLOR_MODES: ColorMode[] = ["vfield", "rgb"];

/** One generated pattern, as the gallery keeps it. */
export type PatternVariant = {
  name: string;
  knobNotes?: string;
  code: string;
};
