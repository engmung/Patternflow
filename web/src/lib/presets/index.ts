import type { LivePreset } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Live Editor presets — one pattern per file.
// Sorted by pattern number automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { preset as pattern_origin } from "./pattern-origin";
import { preset as pattern_wave_saw } from "./pattern-wave-saw";
import { preset as pattern_0510 } from "./pattern-0510";
import { preset as pattern_0511 } from "./pattern-0511";
import { preset as pattern_0512 } from "./pattern-0512";
import { preset as pattern_0513 } from "./pattern-0513";
import { preset as pattern_0514 } from "./pattern-0514";
import { preset as pattern_0515 } from "./pattern-0515";
import { preset as pattern_0515_3 } from "./pattern-0515-3";
import { preset as pattern_0515_4 } from "./pattern-0515-4";
import { preset as pattern_0516 } from "./pattern-0516";
import { preset as pattern_0517 } from "./pattern-0517";
import { preset as pattern_0518 } from "./pattern-0518";
import { preset as pattern_0519_1 } from "./pattern-0519-1";
import { preset as pattern_0519_2 } from "./pattern-0519-2";
import { preset as pattern_0520 } from "./pattern-0520";
import { preset as pattern_0521 } from "./pattern-0521";
import { preset as pattern_0522 } from "./pattern-0522";
import { preset as pattern_0524 } from "./pattern-0524";
import { preset as pattern_0524_2 } from "./pattern-0524-2";
import { preset as pattern_0526 } from "./pattern-0526";
import { preset as pattern_0527 } from "./pattern-0527";
import { preset as pattern_0528 } from "./pattern-0528";
import { preset as pattern_0529 } from "./pattern-0529";
import { preset as pattern_0530 } from "./pattern-0530";
import { preset as pattern_0531 } from "./pattern-0531";
import { preset as pattern_0601 } from "./pattern-0601";
import { preset as pattern_0602 } from "./pattern-0602";
import { preset as pattern_a_big_hit } from "./pattern-a-big-hit";

const presets: LivePreset[] = [
  pattern_origin,
  pattern_wave_saw,
  pattern_0510,
  pattern_0511,
  pattern_0512,
  pattern_0513,
  pattern_0514,
  pattern_0515,
  pattern_0515_3,
  pattern_0515_4,
  pattern_0516,
  pattern_0517,
  pattern_0518,
  pattern_0519_1,
  pattern_0519_2,
  pattern_0520,
  pattern_0521,
  pattern_0522,
  pattern_0524,
  pattern_0524_2,
  pattern_0526,
  pattern_0527,
  pattern_0528,
  pattern_0529,
  pattern_0530,
  pattern_0531,
  pattern_0601,
  pattern_0602,
  pattern_a_big_hit
];

export type { LivePreset } from "./types";

/** All live-editor presets, sorted by pattern number. */
export const livePresets: LivePreset[] = [...presets].sort((a, b) => a.num - b.num);
