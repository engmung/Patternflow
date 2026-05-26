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

// --- Live editor presets ---
// Embedded as string templates so the landing-page Live Editor can load
// them with one click. Each preset is a complete standalone pattern.

export const plasmaRidgesPattern = `// Plasma Ridges — nested trig field with chaos warping
function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function setup(params) {
    params.hueBase = 0.5;
    params.speed = 1.0;
    params.scale = 0.1;
    params.chaos = 1.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase = (params.hueBase + input.knobDeltas[0] * 0.05) % 1.0;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.scale = clamp(params.scale + input.knobDeltas[2] * 0.01, 0.02, 0.2);
    params.chaos = clamp(params.chaos + input.knobDeltas[3] * 0.1, 0.0, 3.0);
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let s = params.scale;
    let c = params.chaos;

    for (let y = 0; y < display.height; y++) {
        let ny = y * s;
        for (let x = 0; x < display.width; x++) {
            let nx = x * s;

            // Nested trigonometric functions for liquid plasma/domain warping
            let v1 = Math.sin(nx + t);
            let v2 = Math.cos(ny - t * 0.8);

            // Add chaos distortion
            let warpX = Math.sin(ny * 2.0 + t) * c;
            let warpY = Math.cos(nx * 2.0 - t * 1.2) * c;

            let v3 = Math.sin((nx + warpX) * 1.5 + t * 1.5);
            let v4 = Math.cos((ny + warpY) * 1.5 - t);

            // Combine fields and take absolute value to create sharp interference "ridges"
            let field = Math.abs(v1 + v2 + v3 + v4);

            // Invert and sharpen: 0.0 is empty, highly peaked at exactly the ridges
            let val = 1.0 - (field * 0.5);
            val = Math.pow(clamp(val, 0.0, 1.0), 3.0); // pow is ok sparsely, makes neon tubes pop

            // Boost brightness to ensure LED pop
            val = clamp(val * 2.5, 0.0, 1.0);

            // Deep organic color shifting based on position
            let hue = (params.hueBase + nx * 0.1 + ny * 0.1 + field * 0.05) % 1.0;

            let rgb = hsvToRgb(hue, 1.0 - val * 0.2, val); // Desaturate slightly at absolute brightest centers
            display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
        }
    }
}`;

export const glitchRainPattern = `// Glitch Rain — bitwise cascade with neon-pink raindrop heads
// Knob 1: Tear Severity (horizontal crack intensity)
// Knob 2: Cascade Velocity (vertical fall frequency)
// Knob 3: Pixel Block Size (macro chunk resolution)
// Knob 4: Bitwise Threshold (binary mask match level)

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
        // Falling raindrop heads pop in neon pink
        if (rainMass > 0.0 && drop === 0) {
          r = 255; g = 0; b = 150;
        } else {
          r = 255; g = 255; b = 255;
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`;

export const hudTickerPattern = `// HUD Ticker — sliding rows of UI/HUD segments at varying speeds
function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function setup(params) {
    params.hueBase = 0.2;
    params.speed = 1.0;
    params.rowHeight = 8.0;
    params.segWidth = 16.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase = (params.hueBase + input.knobDeltas[0] * 0.05) % 1.0;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.rowHeight = clamp(params.rowHeight + input.knobDeltas[2] * 0.5, 4.0, 16.0);
    params.segWidth = clamp(params.segWidth + input.knobDeltas[3] * 1.0, 8.0, 48.0);
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let rh = Math.floor(params.rowHeight);
    let sw = Math.floor(params.segWidth);

    for (let y = 0; y < display.height; y++) {
        let rowIdx = Math.floor(y / rh);
        let ly = y % rh;
        let halfRh = rh >> 1;

        // Each row has a unique speed and direction based on its index
        let speedMult = (rowIdx % 2 === 0 ? 1 : -1) * ((rowIdx % 3) * 0.5 + 0.5);
        let rowOffset = t * 20.0 * speedMult;

        for (let x = 0; x < display.width; x++) {
            let adjX = x + rowOffset;
            let segIdx = Math.floor(adjX / sw);
            let lx = Math.floor(adjX % sw);
            if (lx < 0) lx += sw;

            let halfSw = sw >> 1;

            // Pseudo-random hash for this specific block segment
            let hash = Math.abs(Math.sin(rowIdx * 12.9898 + segIdx * 78.233)) * 10000;
            let val = hash - Math.floor(hash);

            let r = 0, g = 0, b = 0;
            let draw = false;
            let hOffset = 0;

            let cx = lx - halfSw;
            let cy = ly - halfRh;
            let maxL = Math.max(Math.abs(cx), Math.abs(cy));

            // Map random segment value to distinct UI/HUD style blocks
            if (val < 0.2) {
                // Loading bar segment
                if (ly > halfRh - 2 && ly < halfRh + 2 && lx < sw * 0.8) { draw = true; hOffset = 0.0; }
            } else if (val < 0.4) {
                // Caution chevrons
                if ((lx + ly) % 6 < 3) { draw = true; hOffset = 0.2; }
            } else if (val < 0.6) {
                // Empty spacing block
            } else if (val < 0.8) {
                // Data nodes (dots)
                if (lx % 4 === 0 && ly % 4 === 0) { draw = true; hOffset = 0.6; }
            } else {
                // Signal waveform (sine within segment)
                let waveY = halfRh + Math.sin(lx * 0.5) * (halfRh - 1);
                if (Math.abs(ly - waveY) < 1.5) { draw = true; hOffset = 0.8; }
            }

            // Segment boundary marker
            if (lx === 0) {
                draw = true;
                hOffset = 0.5;
            }

            if (draw) {
                let rgb = hsvToRgb((params.hueBase + hOffset) % 1.0, 0.9, 1.0);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            }
            display.setPixel(x, y, r, g, b);
        }
    }
}`;

export type LivePreset = {
  id: string;
  name: string;
  desc: string;
  code: string;
};

export const livePresets: LivePreset[] = [
  {
    id: 'pattern2',
    name: 'Pattern 2',
    desc: 'Liquid plasma with chaos-warped neon ridges',
    code: plasmaRidgesPattern,
  },
  {
    id: 'pattern3',
    name: 'Pattern 3',
    desc: 'Sliding rows of UI segments at varying speeds',
    code: hudTickerPattern,
  },
  {
    id: 'pattern16',
    name: 'Pattern 16',
    desc: 'Bitwise cascade with neon-pink raindrop heads',
    code: glitchRainPattern,
  },
];
