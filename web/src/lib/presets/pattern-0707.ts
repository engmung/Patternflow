import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0707",
  num: 707,
  name: "0707",
  desc: "Concentric wave with glitch phase displacement",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-07",
  lineage: "AI generated and curated via Pattern Lab",
  labOnly: true,
  code: `// ===== Patternflow pattern =====
// Title:   260707
// Author:  Seunghun LEE
// Date:    2026-07-07
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// @knobs Glitch=0..1, Speed=0.05..5, Freq=10..120, Quantize=2..10
//
// Knob 1 (Glitch): Phase displacement and row slippage amount
// Knob 2 (Speed): Base time flow rate
// Knob 3 (Freq): Spatial frequency of the wave generation
// Knob 4 (Quantize): Level discretization steps for a stepped material feel

export function setup(params) {
    params.glitch = 0.1;
    params.speed = 1.0;
    params.freq = 40.0;
    params.quantize = 4;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.glitch = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.freq = input.knobValues[2];
        params.quantize = Math.floor(input.knobValues[3]);
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    const w = display.width;
    const h = display.height;
    const t = params.timeAcc;

    for (let y = 0; y < h; y++) {
        let rowShift = 0;
        if (params.glitch > 0.02) {
            let noise = Math.sin(y * 0.5 + t * 10.0) * Math.cos(y * 0.1 - t * 4.0);
            if (noise > 1.0 - params.glitch) {
                rowShift = Math.sin(t * 30.0) * params.glitch * 30.0;
            }
        }

        for (let x = 0; x < w; x++) {
            let nx = (x + rowShift - w / 2) / (w / 2);
            let ny = (y - h / 2) / (h / 2);
            let d = Math.sqrt(nx * nx + ny * ny);

            let waveValue = Math.sin(d * params.freq - t * 4.0 + Math.sin(nx * 4.0 + t) * params.glitch * 5.0);
            let rawV = (waveValue + 1.0) * 0.5;

            let steps = params.quantize;
            let v = Math.floor(rawV * steps) / (steps - 1);
            v = Math.max(0.0, Math.min(1.0, v));

            display.setValue(x, y, v);
        }
    }
}

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
