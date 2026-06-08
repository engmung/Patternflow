import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0524",
  num: 524,
  name: "0524",
  desc: "Layered fluid dynamic vorticity field",
  code: `// Layered Vorticity Field
// Break the fixed grid completely, simulating multiple fluid vortex center points 
// pushing and pulling space non-linearly to simulate mixed paint structure.
//
// Knob 1 (0.0 to 1.0): Swirl Radius
// Knob 2 (0.1 to 10.0): Flow Speed
// Knob 3 (0.0 to 4.9): Vortex Count
// Knob 4 (0.0 to 1.0): Color Phase Spread

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
  params.radius = 0.5;
  params.speed = 1.0;
  params.vortices = 2.0;
  params.colorSpread = 0.5;
  params.timeAcc = 0;
  params.rgbBuffer = [0, 0, 0];
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.radius = input.knobValues[0];
    params.speed = input.knobValues[1];
    params.vortices = input.knobValues[2];
    params.colorSpread = input.knobValues[3];
  }
  params.timeAcc += dt * params.speed * 0.5;
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

      let wx = nx;
      let wy = ny;

      // Fluid dynamic coordinate distortion of moving vortex cores
      let maxV = 1.0 + Math.floor(params.vortices);
      for (let i = 0; i < maxV; i++) {
        let cx = 0.5 * Math.sin(t * (0.8 + i * 0.3) + i * 1.5);
        let cy = 0.3 * Math.cos(t * (0.6 + i * 0.4) + i * 2.0);
        
        let dx = wx - cx;
        let dy = wy - cy;
        let dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        
        let swirl = Math.sin(dist * 3.0 - t) * params.radius * (1.0 / dist);
        let cosS = Math.cos(swirl);
        let sinS = Math.sin(swirl);
        
        wx = dx * cosS - dy * sinS + cx;
        wy = dx * sinS + dy * cosS + cy;
      }

      // Calculate fluid signal based on distorted space
      let fluidSignal = Math.sin(wx * 4.0) * Math.cos(wy * 4.0) + Math.sin(wx * 2.0 + t);
      let normalized = (fluidSignal + 2.0) / 4.0;

      let r = 0, g = 0, b = 0;

      // Local color mapping according to flowing density
      if (normalized > 0.1) {
        let localHue = 0.6 + normalized * 0.3 + params.colorSpread * Math.sin(wx * wy + t);
        let brightness = Math.min(1.0, normalized * 1.5);
        let saturation = 0.9 - (1.0 - brightness) * 0.4;
        
        hsvToRgb(localHue, saturation, brightness, rgb);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
        
        // Insert intense white highlights at fluid peak points
        if (normalized > 0.75) {
          r = Math.min(255, r + 150);
          g = Math.min(255, g + 150);
          b = Math.min(255, b + 255);
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
