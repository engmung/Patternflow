import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0628",
  num: 628,
  name: "0628",
  desc: "Retro 8-bit digital pixel tapestry",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-28",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// ===== Patternflow pattern =====
// Title:   Retro Digital Tapestry
// Author:  Seunghun LEE
// Date:    2026-06-28
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Retro Digital Tapestry
// Author: your name here
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-28
// Made with Patternflow Pattern Lab — https://patternflow.work/pattern-lab

export function setup(params) {
  params.cellScale = 0.3;
  params.speed = 1.0;
  params.logicMode = 0.2;
  params.waveMod = 0.5;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.cellScale = input.knobValues[0];
    params.speed = input.knobValues[1];
    params.logicMode = input.knobValues[2];
    params.waveMod = input.knobValues[3];
  }
  params.timeAcc += dt * params.speed * 2.0;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;

  let scale = Math.floor(4 + params.cellScale * 24);
  let mode = Math.floor(params.logicMode * 5.0);
  let waveF = 0.02 + params.waveMod * 0.08;

  for (let y = 0; y < h; y++) {
    let sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      let sx = Math.floor(x / scale);
      let patternVal = 0;

      switch (mode) {
        case 0: patternVal = (sx ^ sy) + Math.floor(t); break;
        case 1: patternVal = (sx & sy) * 3 + Math.floor(t * 1.5); break;
        case 2: patternVal = (sx * 7 + sy * 3) ^ Math.floor(t); break;
        case 3: patternVal = (sx ^ (sy + Math.floor(t))) & 15; break;
        default: patternVal = ((sx * sx + sy * sy) >> 2) + Math.floor(t * 0.8); break;
      }

      let smoothS = Math.sin(x * waveF + t) * Math.cos(y * waveF - t);
      let bitActive = (patternVal & 8) !== 0;

      let r = 0, g = 0, b = 0;

      if (bitActive) {
        let hu = (smoothS * 0.3 + 0.5 + (patternVal % 16) / 32.0) % 1.0;
        let hueIdx = Math.floor(hu * 6);
        let f = hu * 6 - hueIdx;
        let maxVal = 220;
        let minVal = Math.floor(50 * (Math.sin(t * 2.0) * 0.5 + 0.5));
        let range = maxVal - minVal;

        let p = maxVal;
        let q = minVal + Math.floor(range * (1 - f));
        let s = minVal + Math.floor(range * f);

        switch (hueIdx % 6) {
          case 0: r = p; g = s; b = minVal; break;
          case 1: r = q; g = p; b = minVal; break;
          case 2: r = minVal; g = p; b = s; break;
          case 3: r = minVal; g = q; b = p; break;
          case 4: r = s; g = minVal; b = p; break;
          default: r = p; g = minVal; b = q; break;
        }
      } else {
        if ((x % scale === 0) || (y % scale === 0)) {
          r = 20; g = 10; b = 40;
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}

// ---
// Generated at https://patternflow.work/pattern-lab — https://patternflow.work
// Licensed CC-BY-SA-4.0. Keep this notice if you share or remix.

// ── Made with Patternflow · https://patternflow.work ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
