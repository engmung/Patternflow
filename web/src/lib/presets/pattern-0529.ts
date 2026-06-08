import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0529",
  num: 529,
  name: "0529",
  desc: "Topographic contour lines on near-black",
  code: `// Contrast Remix: sparse, hard-edged topographic contour lines on near-black — inverse of the dense soft seed.
// (Only level-set lines of a morphing field glow; everything between stays dark and mechanical.)
// Knob 1: Field flow rotation (wraps, 0..2PI)
// Knob 2: Morph speed (0.1 - 10.0)
// Knob 3: Contour density (0.0 - 4.9 -> more, tighter rings)
// Knob 4: Line thickness / softness (wraps, thin & hard -> thicker)

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
  const k = input.knobValues || [0.0, 2.0, 2.0, 0.3];
  params.rot = k[0] * Math.PI * 2;
  params.speed = k[1];
  params.levels = 3 + k[2] * 5;
  params.thick = 0.04 + k[3] * 0.22;
  params.time += dt * params.speed * 0.4;
}

export function draw(display, params, time) {
  const w = display.width;
  const h = display.height;
  const cx = w * 0.5, cy = h * 0.5;
  const t = params.time;
  const ca = Math.cos(params.rot), sa = Math.sin(params.rot);
  const levels = params.levels;
  const thick = params.thick;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ox = (x - cx) / w, oy = (y - cy) / h;
      const rx = ox * ca - oy * sa;
      const ry = ox * sa + oy * ca;
      const field =
        Math.sin(rx * 6.0 + t) +
        Math.sin(ry * 5.0 - t * 0.8) +
        Math.sin((rx + ry) * 4.0 + Math.sin(t) * 2.0);
      const norm = field / 3.0 * 0.5 + 0.5;
      const lf = norm * levels;
      const fpart = lf - Math.floor(lf);
      const di = Math.min(fpart, 1.0 - fpart);
      let r = 0, g = 0, b = 0;
      if (di < thick) {
        const core = 1.0 - di / thick;
        const lvl = Math.floor(lf);
        const hue = 0.55 + lvl * 0.09;
        const sat = 1.0 - core * 0.7;
        const val = Math.pow(core, 0.6);
        hsv(hue, sat, val);
        r = _r * 255; g = _g * 255; b = _b * 255;
      }
      display.setPixel(x, y,
        Math.max(0, Math.min(255, r)),
        Math.max(0, Math.min(255, g)),
        Math.max(0, Math.min(255, b)));
    }
  }
}`,
};
