import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0522",
  num: 522,
  name: "0522",
  desc: "Quad-fold coordinates domain warp symmetry",
  code: `// Quad-Fold Warp Gate (Domain Remix)
// Knob 1: Warp Amplitude (sine wave distortion strength of quad-fold mirror symmetry planes)
// Knob 2: Whirlpool Velocity (scroll speed frequency of distorted coordinates)
// Knob 3: Sub-Grid Block Size (macro resolution scale of bit substrate after domain warp)
// Knob 4: Matrix Boolean Mask (XOR/AND composite domain matching gate threshold level)

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
  params.timeAcc += dt * params.velocity * 3.2;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;

  let ditherPattern = [0, 12, 3, 15, 8, 4, 11, 7, 2, 14, 1, 13, 10, 6, 9, 5];
  let pSize = Math.max(1, Math.floor(1.0 + params.blockSize * 4.0));

  let cx = w >> 1;
  let cy = h >> 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 1. Domain Warping
      let warpX = Math.sin(y * 0.07 + t) * (params.tear * 15.0);
      let warpY = Math.cos(x * 0.07 - t) * (params.tear * 15.0);

      // 2. Quad-Fold Mirroring
      let dx = Math.abs(x - cx + Math.floor(warpX));
      let dy = Math.abs(y - cy + Math.floor(warpY));

      let sx = Math.floor(dx / pSize) * pSize;
      let sy = Math.floor(dy / pSize) * pSize;

      // 3. Calculate scrolling bits on warped space
      let cellSeed = Math.sin(Math.floor(sy / 5) * 62.19) * 0.5 + 0.5;
      let flow = Math.floor(sx / 4 - t * (1.1 + cellSeed * 0.3)) % 16;
      if (flow < 0) flow += 16;
      let gateMass = flow < 4 ? 1.0 : 0.0;

      // 4. Symmetric domain matrix bitmask
      let maskVal = Math.floor(params.bitThresh * 31);
      let bitField = (((sx / pSize) ^ (sy / pSize)) & maskVal) === 0 ? 0.45 : 0.0;

      let totalSignal = gateMass * 0.6 + bitField;
      let spaceWave = Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.12 - t) * 0.2;
      totalSignal += spaceWave;

      let mx = x % 4;
      let my = y % 4;
      let thresh = ditherPattern[my * 4 + mx] / 16.0;

      let r = 0, g = 0, b = 0;
      if (totalSignal > thresh) {
        if (gateMass > 0.0 && (sx === 0 || sy === 0)) {
          // Pass psychedelic neon sky blue beam through vertex centerline of mirror symmetry
          r = 0; g = 220; b = 255;
        } else if (bitField > 0.0 && (sx * sy) % 3 === 0) {
          // Flash neon violet/magenta at orthogonal high-dimension node blocks
          r = 255; g = 0; b = 180;
        } else {
          r = 255; g = 255; b = 255;
        }
      } else if (totalSignal > thresh * 0.5 && dx < pSize * 6) {
        // Add deep cosmic techno midnight indigo shading around warp gate threshold
        r = 20; g = 10; b = 70;
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
