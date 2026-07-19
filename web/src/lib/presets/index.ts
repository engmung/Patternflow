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
import { preset as pattern_0609 } from "./pattern-0609";
import { preset as pattern_0614 } from "./pattern-0614";
import { preset as pattern_0614_2 } from "./pattern-0614-2";
import { preset as pattern_0619 } from "./pattern-0619";
import { preset as pattern_0622 } from "./pattern-0622";
import { preset as pattern_0624 } from "./pattern-0624";
import { preset as pattern_0628 } from "./pattern-0628";
import { preset as pattern_0629 } from "./pattern-0629";
import { preset as pattern_0629_2 } from "./pattern-0629-2";
import { preset as pattern_0701 } from "./pattern-0701";
import { preset as pattern_0707 } from "./pattern-0707";
import { preset as pattern_0710 } from "./pattern-0710";
import { preset as pattern_0712 } from "./pattern-0712";
import { preset as pattern_0712_2 } from "./pattern-0712-2";
import { preset as pattern_0713 } from "./pattern-0713";
import { preset as pattern_0715 } from "./pattern-0715";
import { preset as pattern_0716 } from "./pattern-0716";
import { preset as pattern_0718 } from "./pattern-0718";
import { preset as pattern_0719 } from "./pattern-0719";
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
  pattern_0609,
  pattern_0614,
  pattern_0614_2,
  pattern_0619,
  pattern_0622,
  pattern_0624,
  pattern_0628,
  pattern_0629,
  pattern_0629_2,
  pattern_0701,
  pattern_0707,
  pattern_0710,
  pattern_0712,
  pattern_0712_2,
  pattern_0713,
  pattern_0715,
  pattern_0716,
  pattern_0718,
  pattern_0719,
  pattern_a_big_hit
];

export type { LivePreset } from "./types";

/** All live-editor presets, sorted by pattern number. Pattern Lab shows this full set. */
export const livePresets: LivePreset[] = [...presets].sort((a, b) => a.num - b.num);

/** Presets for the simple /pattern showcase — lab-only patterns are excluded. */
export const showcasePresets: LivePreset[] = livePresets.filter((p) => !p.labOnly);
