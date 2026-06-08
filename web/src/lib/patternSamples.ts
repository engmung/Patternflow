export const sdfRunesPattern = `// SDF Runes (Shape Subtraction)
function hsvToRgb(h, s, v) {
  h = h - Math.floor(h);
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrap01(v) {
  v = v - Math.floor(v);
  if (v < 0) v += 1.0;
  return v;
}

export function setup(params) {
  params.hue = 0.5;
  params.speed = 0.5;
  params.mode = 0.5;
  params.freq = 0.5;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.hue = wrap01(input.knobValues[0]);
    params.speed = input.knobValues[1];
    params.mode = input.knobValues[2];
    params.freq = input.knobValues[3];
  } else {
    let d0 = 0;
    let d1 = 0;
    let d2 = 0;
    let d3 = 0;
    if (input && input.knobDeltas) {
      d0 = input.knobDeltas[0];
      d1 = input.knobDeltas[1];
      d2 = input.knobDeltas[2];
      d3 = input.knobDeltas[3];
    }

    params.hue = wrap01(params.hue + d0 * 0.02);
    params.speed = clamp(params.speed + d1 * 0.02, 0, 1);
    params.mode = clamp(params.mode + d2 * 0.02, 0, 1);
    params.freq = clamp(params.freq + d3 * 0.02, 0, 1);
  }
  params.timeAcc += dt * (0.2 + params.speed * 2.0);
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  let c1 = hsvToRgb(params.hue, 0.95, 1);
  let c2 = hsvToRgb(wrap01(params.hue + 0.4), 0.8, 1);
  let cellSize = Math.floor(8.0 + params.mode * 10.0);
  let thickness = 1.0 + params.freq * 2.0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gx = Math.floor(x / cellSize);
      let gy = Math.floor(y / cellSize);
      let lx = (x % cellSize) - cellSize * 0.5;
      let ly = (y % cellSize) - cellSize * 0.5;

      let offset = gx * 3.1 + gy * 7.4;
      let shape = Math.sin(t * 2.0 + offset);

      let box = Math.max(Math.abs(lx), Math.abs(ly)) - cellSize * 0.35;
      let circle = Math.sqrt(lx * lx + ly * ly) - cellSize * (0.15 + shape * 0.1);
      let rune = Math.max(box, -circle);

      let r = 0;
      let g = 0;
      let b = 0;
      if (Math.abs(rune) < thickness) {
        r = c1[0];
        g = c1[1];
        b = c1[2];
      } else if (Math.abs(lx) < 1 && Math.abs(ly) < 1 && shape > 0.5) {
        r = c2[0];
        g = c2[1];
        b = c2[2];
      }
      display.setPixel(x, y, r, g, b);
    }
  }
}`;

// Live Editor presets now live as one-file-per-pattern under `presets/`.
// Import them from `@/lib/presets` (re-exported here for backward compatibility).
export { livePresets, type LivePreset } from "./presets";
