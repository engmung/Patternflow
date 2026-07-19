import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0716",
  num: 716,
  name: "0716",
  desc: "Triangular marching distance field rendering",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-16",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// ===== Patternflow pattern =====
// Title:   260716_TriMarch
// Author:  Seunghun LEE
// Date:    2026-07-16
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Knob 1: Triangle size · Knob 2: Speed · Knob 3: March angle · Knob 4: Color palette
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function setup(p) {
  p.tsize = 0.5; p.speed = 1.5; p.angle = 0.5; p.palette = 0.3; p.t = 0;
}

export function update(dt, input, p) {
  if (input && input.knobValues) {
    let v = input.knobValues;
    p.tsize = v[0]; p.speed = v[1]; p.angle = v[2]; p.palette = v[3];
  }
  p.t += dt * p.speed;
}

export function draw(d, p, time) {
  let w = d.width, h = d.height, t = p.t;
  let triH = 6 + p.tsize * 25;
  let triW = triH * 0.866;
  let rows = Math.ceil(h / triH);
  let cols = Math.ceil(w / triW);

  let moveX = Math.cos(p.angle * Math.PI) * t * 10;
  let moveY = Math.sin(p.angle * Math.PI) * t * 10;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let fx = (x - moveX) / triW;
      let fy = (y - moveY) / triH;
      let row = Math.floor(fy);
      let col = Math.floor(fx);
      let lx = fx - col - 0.5;
      let ly = fy - row - 0.5;
      let flip = (col + row) % 2;

      let inTri = false;
      if (flip === 0) {
        inTri = (ly < 0.3 && Math.abs(lx) * 1.8 + ly < 0.45);
      } else {
        inTri = (ly > -0.3 && Math.abs(lx) * 1.8 - ly < 0.45);
      }

      if (inTri) {
        let seed = col * 11 + row * 17;
        let brightness = Math.sin(seed * 0.5 + t * 2) * 0.4 + 0.6;
        let hue = (seed * 0.03 * p.palette + brightness * 0.2 + t * 0.05) % 1;
        let r2, g, b;
        let h6 = (hue * 6) % 6, c = brightness * 255, xc = c * (1 - Math.abs(h6 % 2 - 1));
        if (h6 < 1) { r2 = c; g = xc; b = 0; }
        else if (h6 < 2) { r2 = xc; g = c; b = 0; }
        else if (h6 < 3) { r2 = 0; g = c; b = xc; }
        else if (h6 < 4) { r2 = 0; g = xc; b = c; }
        else if (h6 < 5) { r2 = xc; g = 0; b = c; }
        else { r2 = c; g = 0; b = xc; }
        d.setPixel(x, y, Math.floor(r2), Math.floor(g), Math.floor(b));
      } else {
        d.setPixel(x, y, 0, 0, 0);
      }
    }
  }
}

// ── Made with Patternflow Live Editor · https://patternflow.work/pattern ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
