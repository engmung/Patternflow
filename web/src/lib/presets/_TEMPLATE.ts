import type { LivePreset } from "./types";

// Pattern template — copy this file to start a new pattern.
//
// The JS pattern is the SOURCE OF TRUTH. The firmware C++ header is generated
// from `code` below (see firmware/patternflow/patterns/_TEMPLATE.h). Keep the
// SPDX/author/lineage comment block at the top of `code` so attribution and
// license survive the conversion into the .h file.
//
// This file is a template and is intentionally NOT exported from index.ts.

export const preset: LivePreset = {
  id: "template",            // stable, lowercase-kebab; never change once shipped
  num: 0,                    // Instagram pattern number (ordering)
  name: "Template",
  desc: "One-line description shown as the chip tooltip.",

  kind: "preset",            // "preset" (curated) | "custom" (community/user)
  author: "engmung",         // author handle/name
  license: "CC-BY-SA-4.0",   // SPDX id; project default is CC-BY-SA-4.0
  source: "",                // Instagram/Discord/PR URL, if any
  lineage: "original",       // e.g. "remixed from @someone's Wave Saw"

  code: `// Pattern: Template
// Author: engmung
// SPDX-License-Identifier: CC-BY-SA-4.0
// Lineage: original
//
// Knob 1: ... · Knob 2: ... · Knob 3: ... · Knob 4: ...
// Buttons: input.btnPressed[i] (tap) / input.btnHeld[i] (hold), i = 0..3

export function setup(params) {
  // runs once on load — initialise state on params
}

export function update(dt, input, params) {
  // runs each frame before draw
  // input.knobValues[i] (absolute) · input.knobNormalized[i] (0..1)
  // input.btnPressed[i] / input.btnHeld[i]
}

export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
      display.setPixel(x, y, 0, 0, 0); // r,g,b 0..255
    }
  }
}`,
};
