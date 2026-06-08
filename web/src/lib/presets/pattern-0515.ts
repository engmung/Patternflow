import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0515",
  num: 515,
  name: "0515",
  desc: "Horizontal bands with layer shifting",
  code: `// Knobs: 1=Band Speed, 2=Band Width, 3=Layer Shift, 4=Color Phase
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

export function setup(params) {
  params.speed = 0.5;
  params.width = 0.5;
  params.shift = 0.5;
  params.phase = 0.5;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.speed = input.knobValues[0];
    params.width = input.knobValues[1];
    params.shift = input.knobValues[2];
    params.phase = input.knobValues[3];
  }
  params.timeAcc += dt * (0.3 + params.speed * 2.5);
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  let bandWidth = 0.1 + params.width * 0.4;  // 0.1..0.5 as fraction of width
  let layerShift = params.shift * w * 0.5;   // pixel offset between layers
  let hueBase = params.phase;                 // 0..1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Layer 1: travelling sine wave texture, offset moving right
      let nx1 = (x + t * w * 0.2) / w;
      let tex1 = Math.sin(nx1 * 12 + Math.sin(y * 0.1 + t) * 3);
      // Layer 2: moving left, shifted vertically
      let nx2 = (x - t * w * 0.15 + layerShift) / w;
      let tex2 = Math.cos(nx2 * 8 + Math.cos(y * 0.07 - t) * 2.5);

      // Convert to 0..1 value
      let v1 = (tex1 + 1) * 0.5;
      let v2 = (tex2 + 1) * 0.5;
      // Threshold bands: each layer has a moving threshold that creates ribbons
      let th1 = 0.5 + Math.sin(t * 2) * 0.2;
      let th2 = 0.5 + Math.cos(t * 2.3) * 0.2;
      let m1 = v1 > th1 ? 1.0 : 0.0;
      let m2 = v2 > th2 ? 1.0 : 0.0;

      let intensity = m1 + m2 * 0.7; // additive, layer2 softer
      let hue = hueBase;
      if (m1 > 0 && m2 > 0) {
        // overlap gives a bright highlight and different hue
        hue = (hueBase + 0.5) % 1.0;
        intensity = 1.2;
      } else if (m1 > 0) {
        hue = hueBase;
      } else if (m2 > 0) {
        hue = hueBase + 0.2;
      }
      intensity = Math.min(1.0, intensity);
      let sat = 0.8;
      let bright = intensity * 1.1;
      if (intensity > 0.9) bright = 1.0;
      let rgb = hsvToRgb(hue, sat, bright);
      display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}`,
};
