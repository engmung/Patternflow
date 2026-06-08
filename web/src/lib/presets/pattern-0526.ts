import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0526",
  num: 526,
  name: "0526",
  desc: "Kaleidoscopic coordinate vortex mapping",
  code: `// Kaleidoscopic Vortex Vortex
// Change: Imposes a multi-axis radial reflection fold onto coordinate spaces prior to applying fluid warp matrices.
// Knob 1: Reflection Segment Symmetry Fold Count
// Knob 2: System Animation Speed
// Knob 3: Polar Center Warp Core Depth
// Knob 4: Spiral Twist Distortion Index

export function setup(params) {
  params.timeAcc = 0;
  params.k1 = 0.3;
  params.k2 = 1.6;
  params.k3 = 0.5;
  params.k4 = 0.4;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.k1 = input.knobValues[0];
    params.k2 = input.knobValues[1];
    params.k3 = input.knobValues[2];
    params.k4 = input.knobValues[3];
  }
  params.timeAcc += dt * params.k2 * 0.6;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;

  let sectors = Math.floor(3.0 + params.k1 * 9.0);
  let coreDepth = params.k3 * 1.5;
  let twistFactor = params.k4 * 3.0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Shift mapping coordinate origin to screen center
      let nx = ((x / w) * 2.0 - 1.0) * (w / h);
      let ny = (y / h) * 2.0 - 1.0;

      let radius = Math.sqrt(nx * nx + ny * ny) + 0.001;
      let angle = Math.atan2(ny, nx);

      // Execute Kaleidoscope coordinate segment replication folds
      let slice = (Math.PI * 2.0) / sectors;
      angle = ((angle % slice) + slice) % slice;
      if (angle > slice * 0.5) angle = slice - angle;

      // Return spatial domain safely back to Cartesian grid vectors
      let kx = Math.cos(angle) * radius;
      let ky = Math.sin(angle) * radius;

      // Subject the reflected space vectors to a heavy internal fluid spiral
      let vortexDist = Math.sqrt((kx - 0.2) * (kx - 0.2) + ky * ky) + 0.05;
      let force = Math.sin(vortexDist * twistFactor - t) * (coreDepth / vortexDist);
      
      let wx = kx * Math.cos(force) - ky * Math.sin(force);
      let wy = kx * Math.sin(force) + ky * Math.cos(force);

      // Re-sample geometry inside the mirrored/warped universe
      let signal = Math.sin(wx * 6.0 + t) * Math.cos(wy * 6.0 - t);
      let norm = Math.abs(signal);

      let r = 0, g = 0, b = 0;

      if (norm > 0.15) {
        // High-saturation crystalline color signatures reflecting distance and phase
        let hue = 0.55 + radius * 0.2 + Math.cos(angle * 4.0 + t) * 0.15;
        let br = Math.min(1.0, norm * 1.6) * (1.1 - radius * 0.5);

        r = Math.floor((Math.sin(hue * 6.28) * 0.5 + 0.5) * 255 * br);
        g = Math.floor((Math.sin(hue * 6.28 + 2.0) * 0.5 + 0.5) * 230 * br);
        b = Math.floor(255 * br);

        // Outer bounds matrix containment ring
        if (Math.abs(radius - 0.8) < 0.02) {
          r = 255; g = 255; b = 255;
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
