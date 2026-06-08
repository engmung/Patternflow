import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0530",
  num: 530,
  name: "0530",
  desc: "Psychedelic liquid water surface",
  code: `// Variation 5: Psychedelic Liquid Phase
// Over time, the color wheel rotates as a whole, creating a psychedelic liquid water surface.
// Knob 1: Multi-Wave Distortion (0.0 to 1.0) -> complexity of multi-wave distortion for flowing lines
// Knob 2: Spectrum Rotation Velocity (0.1 to 10.0) -> speed of spectrum cycling and rotation
// Knob 3: Sharpness Blackout Gate (0.0 to 4.9) -> contrast falloff threshold around light rays
// Knob 4: Spatial Phase Distance (0.0 to 1.0) -> spatial prism distance splitting colors based on position

let _r = 0, _g = 0, _b = 0;
function hsv(h, s, v) {
  h = (h - Math.floor(h)) * 6;
  const c = v * s;
  const xx = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = xx; }
  else if (h < 2) { r = xx; g = c; }
  else if (h < 3) { g = c; b = xx; }
  else if (h < 4) { g = xx; b = c; }
  else if (h < 5) { r = xx; b = c; }
  else { r = c; b = xx; }
  _r = r + m; _g = g + m; _b = b + m;
}

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const k = input.knobValues || [0.3, 2.0, 2.5, 0.6];
  params.warp = 1.0 + k[0] * 5.0;
  params.speed = k[1];
  params.gate = 0.35 + (k[2] / 4.9) * 0.7;
  params.spatialPhase = k[3] * 0.4;
  params.time += dt * params.speed * 0.4;
}

export function draw(display, params, time) {
  const w = display.width;
  const h = display.height;
  const t = params.time;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 4.0;
      const ny = (y / h) * 4.0;

      const xOff = Math.sin(ny + t) * params.warp;
      const yOff = Math.cos(nx - t * 0.8) * params.warp;

      const f1 = Math.sin(nx + xOff + t);
      const f2 = Math.cos(ny + yOff - t * 0.6);
      let field = 1.0 - Math.sqrt(Math.abs(f1 * f2));

      field = field - params.gate;
      if (field <= 0) {
        display.setPixel(x, y, 0, 0, 0);
        continue;
      }

      const core = field / (1.0 - params.gate);
      
      // Psychedelic wheel where the hue axis rotates over time and splits based on spatial coordinates
      const hue = t * 0.25 + (nx - ny) * params.spatialPhase + core * 0.05;
      const sat = 1.0;
      const val = Math.pow(core, 0.6);

      hsv(hue, sat, val);
      display.setPixel(x, y, _r * 255, _g * 255, _b * 255);
    }
  }
}`,
};
