import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0521",
  num: 521,
  name: "0521",
  desc: "Asymmetric bitwise glitch cascade waterfall",
  code: `// Asymmetric Bitwise Glitch Cascade (Point Color)
// Knob 1: Tear Severity (horizontal crack intensity from fault tearing)
// Knob 2: Cascade Velocity (waterfall frequency of vertically falling bit chunks)
// Knob 3: Pixel Block Size (macro resolution unit of bitwise fragment chunks)
// Knob 4: Bitwise Threshold (binary mask bit matching threshold level)

export function setup(params) {
  params.tear = 0.5;
  params.velocity = 2.0;
  params.blockSize = 2.5;
  params.bitThresh = 0.06;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.tear = input.knobValues[0];
    params.velocity = input.knobValues[1];
    params.blockSize = input.knobValues[2];
    params.bitThresh = input.knobValues[3];
  }
  params.timeAcc += dt * params.velocity * 3.0;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;

  let ditherPattern = [0, 12, 3, 15, 8, 4, 11, 7, 2, 14, 1, 13, 10, 6, 9, 5];
  let pSize = Math.max(1, Math.floor(1.0 + params.blockSize * 4.0));

  for (let y = 0; y < h; y++) {
    let faultLine = Math.sin(y * 0.08 + t * 0.4) * Math.cos(y * 0.03);
    let hShift = 0;
    if (faultLine > 0.9 - params.tear * 0.7) {
      hShift = Math.floor(Math.tan(y * 0.05 + t) * (params.tear * 15.0));
    }

    for (let x = 0; x < w; x++) {
      let sx = Math.floor(((x + hShift + w) % w) / pSize) * pSize;
      let sy = Math.floor(y / pSize) * pSize;

      let streamSeed = Math.sin(Math.floor(sx / 8) * 54.12) * 0.5 + 0.5;
      let drop = Math.floor(sy / 4 - t * (0.6 + streamSeed * 0.4)) % 16;
      if (drop < 0) drop += 16;
      let rainMass = drop < 6 ? 1.0 : 0.0;

      let maskVal = Math.floor(params.bitThresh * 31);
      let bitField = (((sx / pSize) ^ (sy / pSize)) & maskVal) === 0 ? 0.5 : 0.0;

      let totalSignal = rainMass * 0.6 + bitField;
      
      let cx = sx - w * 0.5;
      let cy = sy - h * 0.5;
      let bgWave = Math.sin(Math.sqrt(cx * cx + cy * cy) * 0.15 - t) * 0.25;
      totalSignal += bgWave;

      let mx = x % 4;
      let my = y % 4;
      let thresh = ditherPattern[my * 4 + mx] / 16.0;

      let r = 0, g = 0, b = 0;
      if (totalSignal > thresh) {
        // [Point Layer] Only the head chunk of specific falling streams gets an electric neon pink point highlight
        if (rainMass > 0.0 && drop === 0) {
          r = 255; g = 0; b = 150;
        } else {
          r = 255; g = 255; b = 255;
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
