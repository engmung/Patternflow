import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0624",
  num: 624,
  name: "0624",
  desc: "Isometric Pillars waving in 3D projection space",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-24",
  lineage: "AI generated and curated via Pattern Lab",
  code: `// Pattern: Isometric Pillars
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-24
// Made with Patternflow Pattern Lab — https://patternflow.work/pattern-lab

function hsvToRgb(h, s, v) {
  h = (h % 1 + 1) % 1;
  let i = Math.floor(h * 6), f = h * 6 - i;
  let p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function drawIsoPillar(display, tx, ty, sx, sy, h, rgbTop, rgbLeft, rgbRight) {
  let w = display.width;
  let dh = display.height;

  for (let dy = -sy; dy <= sy; dy++) {
    let span = Math.floor((1.0 - Math.abs(dy) / sy) * sx);
    for (let dx = -span; dx <= span; dx++) {
      let px = tx + dx;
      let py = ty + dy;
      if (px >= 0 && px < w && py >= 0 && py < dh) {
        display.setPixel(px, py, rgbTop[0], rgbTop[1], rgbTop[2]);
      }
    }
  }

  for (let dy = 0; dy < h; dy++) {
    for (let stepY = 0; stepY <= sy; stepY++) {
      let span = Math.floor((stepY / sy) * sx);
      for (let dx = -span; dx < 0; dx++) {
        let px = tx + dx;
        let py = ty + sy + dy + stepY - sy;
        if (px >= 0 && px < w && py >= 0 && py < dh) {
          display.setPixel(px, py, rgbLeft[0], rgbLeft[1], rgbLeft[2]);
        }
      }
    }
  }

  for (let dy = 0; dy < h; dy++) {
    for (let stepY = 0; stepY <= sy; stepY++) {
      let span = Math.floor((stepY / sy) * sx);
      for (let dx = 0; dx <= span; dx++) {
        let px = tx + dx;
        let py = ty + sy + dy + stepY - sy;
        if (px >= 0 && px < w && py >= 0 && py < dh) {
          display.setPixel(px, py, rgbRight[0], rgbRight[1], rgbRight[2]);
        }
      }
    }
  }
}

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const k = input.knobValues || [0.5, 2.0, 0.5, 0.3];
  params.cols = 8 + Math.floor(k[0] * 12);
  params.speed = k[1];
  params.maxHeight = 10 + k[2] * 35;
  params.colorShift = k[3];
  params.time += dt * params.speed * 1.5;
}

export function draw(display, params, time) {
  const w = display.width;
  const h = display.height;
  const t = params.time;
  
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      display.setPixel(px, py, 10, 10, 20);
    }
  }

  const cols = params.cols;
  const rows = cols;
  const sizeX = 8;
  const sizeY = 4;
  const cx = w / 2;
  const cy = h / 2 - 10;

  for (let sum = 0; sum < rows + cols; sum++) {
    for (let r = 0; r < rows; r++) {
      let c = sum - r;
      if (c < 0 || c >= cols) continue;

      let isoX = cx + (c - r) * sizeX;
      let isoY = cy + (c + r) * sizeY;

      let dist = Math.sqrt((c - cols/2)*(c - cols/2) + (r - rows/2)*(r - rows/2));
      let wave = Math.sin(dist * 0.8 - t) * 0.5 + 0.5;
      let height = Math.floor(wave * params.maxHeight);

      let tx = Math.floor(isoX);
      let ty = Math.floor(isoY - height);

      let hue = (wave * 0.3 + params.colorShift) % 1.0;
      let rgbTop = hsvToRgb(hue, 0.85, 0.95);
      let rgbLeft = hsvToRgb(hue, 0.9, 0.6);
      let rgbRight = hsvToRgb(hue, 0.95, 0.4);

      drawIsoPillar(display, tx, ty, sizeX, sizeY, height, rgbTop, rgbLeft, rgbRight);
    }
  }
}

// ---
// Generated at https://patternflow.work/pattern-lab — https://patternflow.work
// Licensed CC-BY-SA-4.0. Keep this notice if you share or remix.`,
};
