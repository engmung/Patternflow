import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0602",
  num: 602,
  name: "0602",
  desc: "Oil core melt glitch with color separation",
  code: `// Knob 1: Oil Core Shift (0-1)
// Knob 2: Melt Speed (0.1-10)
// Knob 3: Glitch Intensity/Slicing (0-4.9)
// Knob 4: Color Separation Tearing (0-1)
export function setup(params) {
  params.k1 = 0; params.k2 = 2; params.k3 = 0; params.k4 = 0; params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.k1 = input.knobValues[0]; params.k2 = input.knobValues[1];
    params.k3 = input.knobValues[2]; params.k4 = input.knobValues[3];
  }
  params.timeAcc += dt * params.k2 * 0.5;
}

export function draw(display, params, time) {
  let w = display.width, h = display.height, t = params.timeAcc;
  let glitchAmt = params.k3 * 10.0;
  let tear = params.k4 * 3.0;

  for (let y = 0; y < h; y++) {
    // Divide the Y axis into bands of specific thickness to generate horizontal swipe glitches
    let band = Math.floor(y / 4.0);
    let glitchShift = Math.sin(band * 12.34 + t * 2.0) * glitchAmt;
    
    // Add a strong choppy stuttering effect
    if (Math.abs(Math.sin(band * 7.65 - t * 3.0)) > 0.9) {
      glitchShift *= 3.0;
    }

    for (let x = 0; x < w; x++) {
      let gx = x + glitchShift; // Use distorted X coordinate
      
      let fluid = Math.sin(y * 0.03 + t) * Math.cos(gx * 0.03 - t) + Math.sin(gx * 0.02 + y * 0.01);
      
      let contour = Math.sin(fluid * 5.0);
      
      let rVal = Math.sin((contour + params.k1) * 2.5 + tear) * 0.5 + 0.5;
      let gVal = Math.sin((contour + params.k1) * 2.5) * 0.5 + 0.5;
      let bVal = Math.sin((contour + params.k1) * 2.5 - tear) * 0.5 + 0.5;

      let r = Math.pow(rVal, 2.0) * 255;
      let g = Math.pow(gVal, 2.0) * 255;
      let b = Math.pow(bVal, 2.0) * 255;

      display.setPixel(x, y, Math.floor(r), Math.floor(g), Math.floor(b));
    }
  }
}`,
};
