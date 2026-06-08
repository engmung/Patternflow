import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0524-2",
  num: 524.02,
  name: "0524-2",
  desc: "Liquid water droplet ripple refraction",
  code: `// Liquid Ripple Refraction
// Using virtual aspherical water droplet waves falling on the center and edges of the screen, 
// refracts the entire 2D plane like a lens and creates ripples.
//
// Knob 1 (0.0 to 1.0): Refraction Depth
// Knob 2 (0.1 to 10.0): Ripple Speed
// Knob 3 (0.0 to 4.9): Ripple Wave Count
// Knob 4 (0.0 to 1.0): Specular Reflection

function hsvToRgb(h, s, v, out) {
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
  out[0] = Math.floor(r * 255);
  out[1] = Math.floor(g * 255);
  out[2] = Math.floor(b * 255);
}

export function setup(params) {
  params.warp = 0.4;
  params.speed = 2.0;
  params.waves = 2.5;
  params.specular = 0.2;
  params.timeAcc = 0;
  params.rgbBuffer = [0, 0, 0];
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.warp = input.knobValues[0];
    params.speed = input.knobValues[1];
    params.waves = input.knobValues[2];
    params.specular = input.knobValues[3];
  }
  params.timeAcc += dt * params.speed * 1.5;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  let rgb = params.rgbBuffer;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx = (x / w) * 2.0 - 1.0;
      let ny = (y / h) * 2.0 - 1.0;
      nx *= (w / h);

      // Calculate surface refraction field based on distance from wave centers
      let d1 = Math.sqrt((nx - 0.3 * Math.sin(t * 0.4)) * (nx - 0.3 * Math.sin(t * 0.4)) + ny * ny);
      let d2 = Math.sqrt((nx + 0.4) * (nx + 0.4) + (ny - 0.2) * (ny - 0.2));

      let waveFreq = 4.0 + params.waves * 4.0;
      let rippleField = Math.sin(d1 * waveFreq - t) * 0.6 + Math.sin(d2 * (waveFreq * 0.7) - t * 1.3) * 0.4;
      
      // Induce refraction using gradient displacement of wave slopes
      let warpFactor = params.warp * 0.3;
      let wx = nx + rippleField * warpFactor;
      let wy = ny + rippleField * warpFactor;

      // Sample bottom fluid base layer
      let liquidBase = Math.sin(wx * 3.0 + t * 0.5) * Math.cos(wy * 3.0 - t * 0.4);
      let nLiquid = (liquidBase + 1.0) * 0.5;

      // Calculate surface reflection highlights (specular vector)
      let specularAngle = (wx * Math.cos(params.specular * Math.PI * 2) + wy * Math.sin(params.specular * Math.PI * 2));
      let specTrigger = Math.sin(specularAngle * 8.0 + rippleField * 4.0);

      let r = 0, g = 0, b = 0;

      let hue = 0.5 + nLiquid * 0.25 + rippleField * 0.1;
      let sat = 0.95 - Math.max(0, specTrigger * 0.3); // Saturation decreases in specular reflection highlights
      let val = 0.2 + nLiquid * 0.6 + Math.max(0, rippleField * 0.2);

      hsvToRgb(hue, sat, val, rgb);
      r = rgb[0]; g = rgb[1]; b = rgb[2];

      // Ultra-bright specular sparkle effect on wave ridges
      if (specTrigger > 0.88 && rippleField > 0.2) {
        r = Math.min(255, r + 180);
        g = Math.min(255, g + 180);
        b = 255;
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
