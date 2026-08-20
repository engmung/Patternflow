var p={wave_saw:`// Pattern: Wave Saw
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026
// Lineage: Created in Blender3D, converted to JS via AI
//
// Wave Saw \u2014 rotated sawtooth bands with a 3-step constant color ramp.
// Knob 1: Angle (0..1 -> 0..2PI) \xB7 Knob 2: Scale (band density) \xB7 Knob 3: Distortion \xB7 Knob 4: Distortion scale
function hash(x, y) {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}

function noise(px, py) {
    let ix = Math.floor(px);
    let iy = Math.floor(py);
    let fx = px - ix;
    let fy = py - iy;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);

    let n00 = hash(ix, iy);
    let n10 = hash(ix + 1, iy);
    let n01 = hash(ix, iy + 1);
    let n11 = hash(ix + 1, iy + 1);

    let nx0 = n00 + (n10 - n00) * ux;
    let nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
}

function fractalNoise(px, py) {
    let sum = 0.0, amp = 1.0, maxAmp = 0.0, freq = 1.0;
    for (let i = 0; i < 2; i++) {
        sum += noise(px * freq, py * freq) * amp;
        maxAmp += amp;
        amp *= 0.22;
        freq *= 2.0;
    }
    return sum / maxAmp;
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function setup(params) {
    params.angle = 0.0;
    params.scale = 3.0;
    params.dist = 0.0;
    params.dScale = 0.15;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.angle = input.knobValues[0];
        params.scale = input.knobValues[1];
        params.dist = input.knobValues[2];
        params.dScale = input.knobValues[3];
    }
    // Wave Saw animates at a fixed rate; Knob 2 controls band density, not speed.
    params.timeAcc += dt;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;

    let angle = params.angle * 6.28318;
    let scale = clamp(params.scale, 0.5, 6.0);
    let dist = clamp(params.dist, 0.0, 4.0);
    let dScale = 0.3 + clamp(params.dScale, 0.0, 1.0) * 4.7;
    let phase = params.timeAcc * 2.4;

    let cosA = Math.cos(angle);
    let sinA = Math.sin(angle);

    let halfW = w / 2;
    let halfH = h / 2;

    for (let y = 0; y < h; y++) {
        let v = (y - halfH) / w;
        for (let x = 0; x < w; x++) {
            let u = (x - halfW) / halfW;

            // Vector rotate
            let xr = u * cosA - v * sinA;
            let yr = u * sinA + v * cosA;

            // Band field
            let n = xr * scale * 20.0 + phase;

            if (dist > 0.01) {
                let nz = fractalNoise(xr * dScale, yr * dScale) * 2.0 - 1.0;
                n += dist * nz;
            }

            // Saw profile -> 0..1
            let tt = n / 6.28318;
            tt -= Math.floor(tt);

            let r, g, b;
            if (tt < 0.14) { r = 255; g = 255; b = 255; }
            else if (tt < 0.40) { r = 255; g = 0; b = 0; }
            else { r = 0; g = 0; b = 255; }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,"0510":`// Pattern: 0510
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-10
// Lineage: AI generated and curated
//
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

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function setup(params) {
    params.hueBase = 0.0;
    params.speed = 1.0;
    params.scale = 1.0;
    params.distortion = 1.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase += input.knobDeltas[0] * 0.05;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.hueBase %= 1.0;

    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.scale = Math.max(0.1, params.scale + input.knobDeltas[2] * 0.05);
    params.distortion = Math.max(0.0, params.distortion + input.knobDeltas[3] * 0.05);

    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let scaleFactor = params.scale * 0.15;
    let distAmount = params.distortion * 2.0;
    let hBase = params.hueBase;

    for (let y = 0; y < display.height; y++) {
        let ny = y * scaleFactor;
        
        let dyWave = Math.sin(ny * 0.6 + t * 0.8) * distAmount;
        let nyMain = ny - t * 1.2;

        for (let x = 0; x < display.width; x++) {
            let nx = x * scaleFactor;
            
            let dxWave = Math.cos(nx * 0.7 - t * 0.9) * distAmount;

            let val = Math.sin(nx + dyWave + t) + Math.cos(nyMain + dxWave);
            
            let normVal = clamp((val + 2.0) * 0.25, 0.0, 1.0);

            let r = 0, g = 0, b = 0;

            if (normVal < 0.3) {
                let rgb = hsvToRgb(hBase, 0.9, 1.0);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (normVal < 0.5) {
                r = 0; g = 0; b = 0;
            } else if (normVal < 0.7) {
                if (x % 3 === 0 && y % 3 === 0) {
                    let rgb = hsvToRgb((hBase + 0.33) % 1.0, 0.8, 1.0);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            } else {
                if ((x + y) % 4 < 2) {
                    let rgb = hsvToRgb((hBase + 0.66) % 1.0, 0.9, 1.0);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,"0511":`// Pattern: 0511
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-11
// Lineage: AI generated and curated
//
// 5. Sliding Segmented Rows (Kinetic/Ticker/Glitch Foundation)
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
            if (lx < 0) lx += sw; // JS modulo fix for negative numbers
            
            let halfSw = sw >> 1;
            
            // Pseudo-random hash for this specific block segment
            let hash = Math.abs(Math.sin(rowIdx * 12.9898 + segIdx * 78.233)) * 10000;
            let val = hash - Math.floor(hash); // Random value 0.0 - 1.0

            let r = 0, g = 0, b = 0;
            let draw = false;
            let hOffset = 0;

            // Coordinate relative to segment center
            let cx = lx - halfSw;
            let cy = ly - halfRh;
            let maxL = Math.max(Math.abs(cx), Math.abs(cy));

            // Map random segment value to distinct UI/HUD style blocks
            if (val < 0.2) {
                // Loading bar segment
                if (ly > halfRh - 2 && ly < halfRh + 2 && lx < sw * 0.8) { draw = true; hOffset = 0.0; }
            } else if (val < 0.4) {
                // Caution Chevrons
                if ((lx + ly) % 6 < 3) { draw = true; hOffset = 0.2; }
            } else if (val < 0.6) {
                // Empty Space (Spacing block)
            } else if (val < 0.8) {
                // Data nodes (Dots)
                if (lx % 4 === 0 && ly % 4 === 0) { draw = true; hOffset = 0.6; }
            } else {
                // Signal waveform (Sine within segment)
                let waveY = halfRh + Math.sin(lx * 0.5) * (halfRh - 1);
                if (Math.abs(ly - waveY) < 1.5) { draw = true; hOffset = 0.8; }
            }

            // Draw segment boundary
            if (lx === 0) {
                draw = true; 
                hOffset = 0.5; // Boundary marker color
            }

            if (draw) {
                let rgb = hsvToRgb((params.hueBase + hOffset) % 1.0, 0.9, 1.0);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            }
            display.setPixel(x, y, r, g, b);
        }
    }
}`,"0512":`// Pattern: 0512
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-12
// Lineage: AI generated and curated
//
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
    params.hueBase = 0.85;
    params.speed = 1.0;
    params.petals = 6.0;
    params.fold = 1.0;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    params.hueBase = (params.hueBase + input.knobDeltas[0] * 0.05) % 1.0;
    if (params.hueBase < 0) params.hueBase += 1.0;
    params.speed = Math.max(0.0, params.speed + input.knobDeltas[1] * 0.05);
    params.petals = clamp(params.petals + input.knobDeltas[2] * 0.5, 3.0, 16.0);
    params.fold = clamp(params.fold + input.knobDeltas[3] * 0.05, 0.0, 5.0);
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let cx = display.width * 0.5;
    let cy = display.height * 0.5;
    let p = Math.floor(params.petals);
    let fold = params.fold;

    for (let y = 0; y < display.height; y++) {
        let dy = y - cy;
        for (let x = 0; x < display.width; x++) {
            let dx = x - cx;
            
            let angle = Math.atan2(dy, dx);
            let dist = Math.sqrt(dx * dx + dy * dy);
            
            // Sacred Geometry / Lotus math
            // The radius modulates based on the angle to create petals
            let petalWave = Math.sin(angle * p + t * 2.0);
            let targetDist = 15.0 + petalWave * 10.0 + Math.sin(dist * 0.5 - t * 3.0) * fold * 5.0;
            
            let val = Math.abs(dist - targetDist);
            
            let r = 0, g = 0, b = 0;
            
            if (val < 1.5) {
                // Bright outline
                let rgb = hsvToRgb(params.hueBase, 0.5, 1.0);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (val < 5.0 && dist < targetDist) {
                // Inner petal glow
                let rgb = hsvToRgb((params.hueBase + 0.1) % 1.0, 0.9, 1.0 - (val / 5.0));
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (dist < targetDist * 0.4) {
                // Core
                if ((x + y + Math.floor(t * 10)) % 3 === 0) {
                    let rgb = hsvToRgb((params.hueBase + 0.4) % 1.0, 1.0, 1.0);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            } else if (val < 10.0 && dist > targetDist) {
                // Outer aura
                if (Math.floor(angle * 20.0) % 2 === 0) {
                    let rgb = hsvToRgb((params.hueBase + 0.6) % 1.0, 1.0, 0.4 * (1.0 - val/10.0));
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                }
            }
            
            display.setPixel(x, y, r, g, b);
        }
    }
}`,"0513":`// Pattern: 0513
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-13
// Lineage: AI generated and curated
//


function hsvToRgb(h, s, v) {
    let r, g, b;
    h = h - Math.floor(h);
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
        default: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wrap01(v) { v = v - Math.floor(v); if (v < 0) v += 1.0; return v; }
function mix(a, b, t) { return a + (b - a) * t; }
function mixHue(a, b, t) {
    let d = b - a;
    if (d > 0.5) d -= 1.0;
    if (d < -0.5) d += 1.0;
    return wrap01(a + d * t);
}

export function setup(params) {
    params.hue = 0.56; params.speed = 0.42; params.mode = 0.35; params.freq = 0.45;
    params.hueT = params.hue; params.speedT = params.speed; params.modeT = params.mode; params.freqT = params.freq;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    let d0 = 0.0, d1 = 0.0, d2 = 0.0, d3 = 0.0;
    if (input && input.knobDeltas) {
        d0 = input.knobDeltas[0] || 0.0; d1 = input.knobDeltas[1] || 0.0;
        d2 = input.knobDeltas[2] || 0.0; d3 = input.knobDeltas[3] || 0.0;
    }
    params.hueT = wrap01(params.hueT + d0 * 0.012);
    params.speedT = clamp(params.speedT + d1 * 0.018, 0.0, 1.0);
    params.modeT = clamp(params.modeT + d2 * 0.018, 0.0, 1.0);
    params.freqT = clamp(params.freqT + d3 * 0.018, 0.0, 1.0);
    let s = clamp(dt * 7.5, 0.0, 1.0);
    params.hue = mixHue(params.hue, params.hueT, s);
    params.speed = mix(params.speed, params.speedT, s);
    params.mode = mix(params.mode, params.modeT, s);
    params.freq = mix(params.freq, params.freqT, s);
    params.timeAcc += dt * (0.18 + params.speed * 1.85);
}

export function draw(display, params, time) {
    let w = display.width, h = display.height;
    let t = params.timeAcc, hue = params.hue, mode = params.mode, freq = params.freq;

    let cellSize = Math.floor(mix(16.0, 4.0, freq));
    let invCell = 1.0 / cellSize;
    let c1 = hsvToRgb(hue, 0.9, 1.0);
    let shiftIntensity = mix(0.0, 3.0, mode);

    for (let y = 0; y < h; y++) {
        let gy = Math.floor(y * invCell);
        let shiftX = Math.floor(Math.sin(gy * 0.5 + t * 2.0) * cellSize * shiftIntensity);
        let ny = (y - gy * cellSize) * invCell - 0.5;
        let absNy = Math.abs(ny);
        
        for (let x = 0; x < w; x++) {
            let effX = x + shiftX;
            let gx = Math.floor(effX * invCell);
            let nx = (effX - gx * cellSize) * invCell - 0.5;
            let absNx = Math.abs(nx);

            let r = 0, g = 0, b = 0;
            let mask = (gx + gy) % 2 === 0;
            
            if (mask) {
                if (absNx < 0.3 && absNy < 0.3) {
                    r = c1[0]; g = c1[1]; b = c1[2];
                }
            } else {
                if (absNx > 0.4 || absNy > 0.4) {
                    r = 255; g = 255; b = 255;
                }
            }
            display.setPixel(x, y, r, g, b);
        }
    }
}`,"0514":`// Pattern: 0514
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-14
// Lineage: AI generated and curated
//
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

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wrap01(v) {
  v = v - Math.floor(v);
  if (v < 0) v += 1.0;
  return v;
}

export function setup(params) {
  params.timeAcc = 0;
  params.hueT = 0.57;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.hueT = wrap01(params.hueT + (input.knobValues[0] - 0.5) * 0.008);
    params.speed = input.knobValues[1];
    params.depth = input.knobValues[2];
    params.warp = input.knobValues[3];
  }
  params.timeAcc += dt * (0.23 + params.speed * 2.5);
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  let hue = params.hueT;
  let warp = 7 + params.warp * 28;

  let c1 = hsvToRgb(hue, 0.94, 1);
  let c2 = hsvToRgb(hue + 0.11, 0.86, 1);
  let c3 = hsvToRgb(hue + 0.39, 0.93, 0.98);
  let c4 = hsvToRgb(hue + 0.71, 0.74, 0.95);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cellSize = 9;
      let gx = Math.floor(x / cellSize);
      let gy = Math.floor(y / cellSize);
      
      let cx = (gx + 0.5) * cellSize + Math.sin(gy * 0.7 + t * 1.05) * warp * 0.75;
      let cy = (gy + 0.5) * cellSize + Math.cos(gx * 0.85 - t * 0.55) * warp * 0.75;

      let tex1 = (Math.sin(cx * 0.046 + t * 1.05) + Math.cos(cy * 0.053 - t * 0.85)) * 0.5 + 0.5;
      let tex2 = Math.sin(y * 0.022 + t * 0.32 * params.depth) * 0.5 + 0.5;

      let intensity = tex1 * (1 - params.depth * 0.4) + tex2 * params.depth * 1.2;
      intensity = clamp(intensity, 0, 1);

      let lx = (x % cellSize) / cellSize - 0.5;
      let ly = (y % cellSize) / cellSize - 0.5;

      let r = 0, g = 0, b = 0;
      if (intensity < 0.35) {
        if (Math.max(Math.abs(lx), Math.abs(ly)) < 0.4) { r = c1[0]; g = c1[1]; b = c1[2]; }
      } else if (intensity < 0.52) {
      } else if (intensity < 0.7) {
        if (Math.abs(lx) < 0.22 || Math.abs(ly) < 0.22) { r = c2[0]; g = c2[1]; b = c2[2]; }
      } else if (intensity < 0.86) {
        if (Math.abs(lx - ly) < 0.26) { r = c3[0]; g = c3[1]; b = c3[2]; }
      } else {
        if (Math.max(Math.abs(lx), Math.abs(ly)) < 0.48) { r = c4[0]; g = c4[1]; b = c4[2]; }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,"0515":`// Pattern: 0515
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Knobs: 1=Band Speed, 2=Band Width, 3=Layer Shift, 4=Color Phase
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
}`,"0515_3":`// Pattern: 0515-3
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Variation 2: Grid Interference
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
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function setup(params) {
  params.hueBase = 0.6;
  params.speed = 1.0;
  params.freq = 0.1;
  params.chaos = 1.0;
  params.timeAcc = 0.0;
}

// Knob1: Hue, Knob2: Speed, Knob3: Frequency, Knob4: Chaos
export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.hueBase = input.knobValues[0];
    params.speed = input.knobValues[1] * 4 + 0.4;
    params.freq = input.knobValues[2] * 0.15 + 0.05;
    params.chaos = input.knobValues[3] * 3;
  }
  params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
  let t = params.timeAcc;
  let f = params.freq;

  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
      let v1 = Math.sin(x * f + t);
      let v2 = Math.sin(y * f * 1.3 - t * 1.1);
      let v3 = Math.sin((x + y) * f * 0.7 + t * 0.8);
      let v4 = Math.sin((x - y) * f * 1.2 - t * 0.9);

      let field = Math.abs(v1 + v2 + v3 + v4) * (0.4 + params.chaos * 0.1);
      let val = Math.pow(clamp(1.2 - field, 0.0, 1.0), 3.0);

      let hue = (params.hueBase + (x + y) * 0.003 + field * 0.4) % 1;
      let rgb = hsvToRgb(hue, 0.9, val * 0.9 + 0.1);
      display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}`,"0515_4":`// Pattern: 0515-4
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-15
// Lineage: AI generated and curated
//
// Knob 1 (0-1): Grid complexity (size of cells)
// Knob 2 (0.1-10): Mechanical oscillation speed
// Knob 3 (0-4.9): Joint thickness (gear tooth size)
// Knob 4 (0-1): Sharpness vs inner fill brightness

function hsvToRgb(h, s, v) {
  h = h - Math.floor(h);
  if (h < 0) h += 1;
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
  params.k1 = 0;
  params.k2 = 2;
  params.k3 = 0;
  params.k4 = 0.06;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.k1 = input.knobValues[0];
    params.k2 = input.knobValues[1];
    params.k3 = input.knobValues[2];
    params.k4 = input.knobValues[3];
  }
  params.timeAcc += dt * params.k2;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  
  let cellSize = Math.floor(8 + params.k1 * 16);
  let thickness = 1.0 + params.k3;
  let fillBright = params.k4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gx = Math.floor(x / cellSize);
      let gy = Math.floor(y / cellSize);
      
      let lx = (x % cellSize) - cellSize * 0.5;
      let ly = (y % cellSize) - cellSize * 0.5;

      // Checkerboard phase offset causes adjacent cells to "spin" inversely
      let isEven = (gx + gy) % 2 === 0;
      let phase = isEven ? t * 2.0 : -t * 2.0;

      // Simulated rotation via coordinate transform
      let rx = lx * Math.cos(phase) - ly * Math.sin(phase);
      let ry = lx * Math.sin(phase) + ly * Math.cos(phase);

      // SDF Cross / Gear shape
      let crossDist = Math.min(Math.abs(rx), Math.abs(ry));
      let boundary = Math.max(Math.abs(rx), Math.abs(ry));
      
      let r = 0, g = 0, b = 0;

      // Color logic: High contrast mechanic. Edges are pure white, fills are solid
      if (boundary < cellSize * 0.45 && crossDist < thickness) {
        // Inner edge highlight
        if (Math.abs(crossDist - thickness) < 0.8) {
          r = 255; g = 255; b = 255;
        } else {
          // Inner fill
          let localHue = isEven ? 0.05 : 0.55; // Orange vs Cyan checkerboard
          let c = hsvToRgb(localHue, 0.9, fillBright + 0.2);
          r = c[0]; g = c[1]; b = c[2];
        }
      } else if (boundary > cellSize * 0.45 && boundary < cellSize * 0.5) {
        // Outer mechanical housing boundary
        let c = hsvToRgb(0.8, 0.8, 0.3);
        r = c[0]; g = c[1]; b = c[2];
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,"0518":`// Pattern: 0518
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-18
// Lineage: AI generated and curated
//
// Controls:
// Knob 1: Palette Split (distance between band colors)
// Knob 2: Animation Speed
// Knob 3: Shear Amplitude (horizontal stretching)
// Knob 4: Band Frequency (number of slices)

function hsvToRgb(h, s, v) {
  h = (h % 1 + 1) % 1;
  let i = Math.floor(h * 6), f = h * 6 - i;
  let p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
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

function hash21(x, y) {
  let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function noise2D(x, y) {
  let ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  let ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  let a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

export function setup(params) {
  params.split = 0.5;
  params.speed = 1.0;
  params.shear = 20.0;
  params.bands = 0.1;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.split = input.knobValues[0];
    params.speed = input.knobValues[1] * 2.0;
    params.shear = input.knobValues[2] * 40.0;
    params.bands = 0.02 + input.knobValues[3] * 0.2;
  }
  params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
  let w = display.width, h = display.height;
  let t = params.timeAcc;

  for (let y = 0; y < h; y++) {
    // Determine which band we are in
    let bandId = Math.floor(y * params.bands);
    let bandFract = (y * params.bands) - bandId;
    
    // Alternate direction and speed per band
    let dir = (bandId % 2 === 0) ? 1 : -1;
    let bandSpeed = dir * (1.0 + noise2D(bandId, 0) * 2.0) * t;
    
    // Shear offset based on band noise
    let offset = noise2D(bandId * 5.1, t * 0.2) * params.shear;
    
    for (let x = 0; x < w; x++) {
      let shearedX = x + offset + bandSpeed;
      let n = noise2D(shearedX * 0.05, y * 0.05);
      
      // Color logic: alternating bands use split complementary hues
      let localHue = (bandId % 2 === 0) ? n * 0.2 : params.split + n * 0.2;
      
      // Add a slight darkening at the edges of the bands to separate them
      let edgeDarken = Math.sin(bandFract * Math.PI);
      let val = Math.max(0, (n * 1.5) * edgeDarken);
      
      let rgb = hsvToRgb(localHue, 0.8, Math.min(1, val));
      display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}`,"0519_1":`// Pattern: 0519-1
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-19
// Lineage: AI generated and curated
//
// Knobs for Organic Isocontours:
// Knob 1: Surface Tension (Blob expansion/contraction)
// Knob 2: Undulation Speed
// Knob 3: Map Zoom Level
// Knob 4: Contour Sharpness (Stepped bands vs smooth gradients)

export function setup(params) {
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  let speed = input && input.knobValues ? input.knobValues[1] : 2.0;
  params.timeAcc += dt * speed * 0.5;
  
  if (input && input.knobNormalized) {
    params.tension = (input.knobNormalized[0] - 0.5) * 2.0; // -1 to 1
    params.zoom = 0.02 + input.knobNormalized[2] * 0.08;
    params.sharpness = input.knobNormalized[3];
  } else {
    params.tension = 0.0;
    params.zoom = 0.05;
    params.sharpness = 1.0;
  }
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx = x * params.zoom;
      let ny = y * params.zoom;
      
      // Sum of sine waves for a smooth organic field
      let v1 = Math.sin(nx + t) + Math.cos(ny - t);
      let v2 = Math.sin((nx + ny) * 0.8 + t * 1.3);
      let v3 = Math.cos((nx - ny) * 1.2 - t * 0.7);
      
      let field = (v1 + v2 + v3) / 3.0; 
      field += params.tension;
      
      let r = 0, g = 0, b = 0;
      
      if (field > 0.0) {
        // We are inside the organic blob
        // Create topographical contour lines
        let bands = field * 10.0;
        let bandFract = bands - Math.floor(bands);
        
        let edgeValue = bandFract;
        if (params.sharpness > 0.5) {
          // Sharp topographical steps
          edgeValue = bandFract > 0.8 ? 1.0 : 0.2;
        }
        
        // Colors respond dynamically to the field height
        let hue = 0.3 + field * 0.4; // Greens to Blues
        hue = hue - Math.floor(hue);
        
        let i = Math.floor(hue * 6);
        let f = hue * 6 - i;
        let val = 0.5 + edgeValue * 0.5;
        let sat = 0.8;
        
        let p = val * (1 - sat);
        let q = val * (1 - f * sat);
        let v_t = val * (1 - (1 - f) * sat);
        let rv, gv, bv;
        switch (i % 6) {
          case 0: rv = val; gv = v_t; bv = p; break;
          case 1: rv = q; gv = val; bv = p; break;
          case 2: rv = p; gv = val; bv = v_t; break;
          case 3: rv = p; gv = q; bv = val; break;
          case 4: rv = v_t; gv = p; bv = val; break;
          default: rv = val; gv = p; bv = q; break;
        }
        r = Math.floor(rv * 255);
        g = Math.floor(gv * 255);
        b = Math.floor(bv * 255);
      }
      
      display.setPixel(x, y, r, g, b);
    }
  }
}`,"0520":`// Pattern: 0520
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-20
// Lineage: AI generated and curated
//
// Bio-Luminescent Tendrils
// Knob 1: Wave Density (spatial frequency density)
// Knob 2: Fluid Speed (animation speed)
// Knob 3: Tendril Thicken (tendril thickness and cohesion)
// Knob 4: Color Mutation (position-based color mutation range)

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
    params.density = 0.5;
    params.speed = 1.0;
    params.thickness = 0.5;
    params.mutation = 0.5;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.density = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.thickness = input.knobValues[2];
        params.mutation = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let t = params.timeAcc;
    let w = display.width;
    let h = display.height;

    // Adjust knob mapping
    let freq = 0.03 + params.density * 0.12;
    let thickScale = 0.5 + params.thickness * 2.5;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let nx = x * freq;
            let ny = y * freq;

            // Generate honeycomb-shaped structural distortion field
            let f1 = Math.sin(nx + t) * Math.cos(ny + t * 0.5);
            let f2 = Math.sin(ny - t * 0.7) * Math.cos(nx - t * 0.3);
            
            // Synthesize organic tendril network
            let nX = nx + f1 * 1.5;
            let nY = ny + f2 * 1.5;
            
            let v1 = Math.sin(nX * 2.0 - t * 0.8);
            let v2 = Math.cos(nY * 2.0 + t * 1.1);
            let centerField = Math.abs(v1 + v2);

            // Smoothly extract tendril boundaries
            let val = Math.exp(-Math.pow(centerField - 0.4, 2.0) * thickScale);
            val = clamp(val * 1.8, 0.0, 1.0);

            // Colorful color combinations tied to local phase and fluidity
            let hue = (0.2 + params.mutation * (x / w) + f1 * 0.1 + t * 0.04) % 1.0;
            if (hue < 0) hue += 1.0;

            // Induce white light at the bright centerlines
            let sat = clamp(1.0 - val * 0.4, 0.5, 1.0);
            let rgb = hsvToRgb(hue, sat, val);

            display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
        }
    }
}`,"0521":`// Pattern: 0521
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-21
// Lineage: AI generated and curated
//
// Asymmetric Bitwise Glitch Cascade (Point Color)
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
}`,"0522":`// Pattern: 0522
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-22
// Lineage: AI generated and curated
//
// Quad-Fold Warp Gate (Domain Remix)
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
}`,"0527":`// Pattern: 0527
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-27
// Lineage: AI generated and curated
//
// Palette/Material Remix: 3D Vector Normal Matrix
// Knob 1: Cluster Weight (number of constellation nodes, splits from 4 to 10)
// Knob 2: Rotation Rate (time-acceleration vector operation speed)
// Knob 3: Maximum Distance (maximum cutoff threshold for connecting lines)
// Knob 4: Normal Depth (3D axis attenuation strength index of the normal map)

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const knobs = input.knobValues || [0.4, 1.8, 0.6, 0.5];
  params.nodeCount = 4 + Math.floor(knobs[0] * 6); 
  params.speed = knobs[1];
  params.linkDistance = 15 + knobs[2] * 40;
  params.normalDepth = knobs[3] * 1.0;

  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  const w = display.width;
  const h = display.height;
  const t = params.time;
  
  const nodes = [];
  for (let i = 0; i < params.nodeCount; i++) {
    const seed = Math.sin(i * 12.87 + 94.11) * 742.12;
    const cx = w * 0.5 + Math.cos((seed % 1.0) * 6.28 + t * 0.22) * (w * 0.38);
    const cy = h * 0.5 + Math.sin(((seed * 2.3) % 1.0) * 6.28 + t * 0.4) * (h * 0.35);
    nodes.push({ x: cx, y: cy });
  }

  // Clear background to pure black
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) display.setPixel(x, y, 0, 0, 0);
  }

  // 1. 3D vector normal-mapped line drawing
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < params.linkDistance) {
        const xMin = Math.max(0, Math.floor(Math.min(nodes[i].x, nodes[j].x)));
        const xMax = Math.min(w - 1, Math.ceil(Math.max(nodes[i].x, nodes[j].x)));
        const yMin = Math.max(0, Math.floor(Math.min(nodes[i].y, nodes[j].y)));
        const yMax = Math.min(h - 1, Math.ceil(Math.max(nodes[i].y, nodes[j].y)));

        // Calculate line slope (direction vector) and normalize (Normal Vector)
        const nx = dx / dist;
        const ny = dy / dist;

        // Apply 3D space normal map formula (X->R, Y->G, Z->B)
        const rVal = Math.floor((nx * 0.5 + 0.5) * 255);
        const gVal = Math.floor((ny * 0.5 + 0.5) * 255);
        const bVal = Math.floor(params.normalDepth * 255);

        for (let ly = yMin; ly <= yMax; ly++) {
          for (let lx = xMin; lx <= xMax; lx++) {
            const cross = (lx - nodes[i].x) * (nodes[j].y - nodes[i].y) - (ly - nodes[i].y) * (nodes[j].x - nodes[i].x);
            
            if (Math.abs(cross) / dist < 0.85) {
              const dot = (lx - nodes[i].x) * (nodes[j].x - nodes[i].x) + (ly - nodes[i].y) * (nodes[j].y - nodes[i].y);
              const param = dot / (dist * dist);
              
              if (param >= 0 && param <= 1) {
                display.setPixel(lx, ly, rVal, gVal, bVal);
              }
            }
          }
        }
      }
    }
  }

  // 2. White cross markers at node positions
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    const cx = Math.floor(node.x);
    const cy = Math.floor(node.y);
    const len = 3;

    for (let k = -len; k <= len; k++) {
      if (cx + k >= 0 && cx + k < w && cy >= 0 && cy < h) display.setPixel(cx + k, cy, 255, 255, 255);
      if (cx >= 0 && cx < w && cy + k >= 0 && cy + k < h) display.setPixel(cx, cy + k, 255, 255, 255);
    }
  }
}`,"0528":`// Pattern: 0528
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-28
// Lineage: AI generated and curated
//
// Contrast Remix: Mechanical Grid Blocks
// Knob 1: Grid Block Size [0.0 to 1.0]
// Knob 2: Animation Speed [0.1 to 10.0]
// Knob 3: Sparsity Threshold Limit [0.0 to 4.9]
// Knob 4: Chaos Noise Modulation [0.0 to 1.0]

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const knobs = input.knobValues || [0.4, 2.5, 2.0, 0.5];
  params.blockSize = 4 + Math.floor(knobs[0] * 12); 
  params.speed = knobs[1];
  params.sparsity = knobs[2] / 4.9; 
  params.chaos = knobs[3] * 1.5;
  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  for (let y = 0; y < display.height; y++) {
    const blockY = Math.floor(y / params.blockSize);
    const innerY = (y % params.blockSize) / params.blockSize - 0.5;

    for (let x = 0; x < display.width; x++) {
      const blockX = Math.floor(x / params.blockSize);
      const innerX = (x % params.blockSize) / params.blockSize - 0.5;

      // Compute individual cellular energy levels
      let cellEnergy = Math.sin(blockX * 0.35 + blockY * 0.25 + params.time) * 0.5 + 0.5;

      // Inject high-frequency structural disorder based on chaos control
      if (params.chaos > 0.05) {
        const structuralNoise = Math.sin(blockX * 3.1 - blockY * 2.3 - params.time * 2.0);
        cellEnergy += structuralNoise * params.chaos * 0.3;
        cellEnergy = Math.max(0.0, Math.min(1.0, cellEnergy));
      }

      let r = 0, g = 0, b = 0;

      // Strict clip to keep background stark, sparse, and black
      if (cellEnergy > params.sparsity) {
        // Define mechanical circular dot mask inside the cell bounds
        const radiusSq = innerX * innerX + innerY * innerY;
        const maxRadius = cellEnergy * 0.45;

        if (radiusSq < maxRadius) {
          const edgeProfile = 1.0 - (radiusSq / maxRadius);
          
          // Color selection based completely on cell parity and local energy states
          if ((blockX + blockY) % 2 === 0) {
            // Bright Orange/Yellow block cells
            r = 255;
            g = 80 + cellEnergy * 175;
            b = edgeProfile * 100;
          } else {
            // High-voltage Emerald/Teal block cells
            r = edgeProfile * 50;
            g = 230;
            b = 150 + cellEnergy * 105;
          }

          // Force hot-white cores inside energetic blocks
          if (edgeProfile > 0.85) {
            r = 255; g = 255; b = 255;
          }
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,"0531":`// Pattern: 0531
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-31
// Lineage: AI generated and curated
//
// Posterized Thermal Gradient
// Knob 1: Thermal Core Offset (Base shift of threshold indices)
// Knob 2: Animation Speed
// Knob 3: Material Density Scale (Frequency of spatial noise bands)
// Knob 4: Color Palette Inversion Threshold

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const knobs = input.knobValues || [0.5, 2.0, 1.0, 0.6];
  
  // Custom material control mapping
  params.colorShift = knobs[0];
  params.speed = knobs[1];
  params.density = 0.02 + (knobs[2] / 4.9) * 0.15; // 0.02 to 0.17
  params.invertThreshold = knobs[4];
  
  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  const w = display.width;
  const h = display.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Complex spatial signal generating topological lines
      const n1 = Math.sin(x * params.density + params.time * 0.7);
      const n2 = Math.cos(y * params.density - params.time * 0.5);
      const n3 = Math.sin((x + y) * params.density * 0.5 + params.time);
      
      const compositeSignal = (n1 + n2 + n3) / 3.0 * 0.5 + 0.5; // Normalized 0 to 1
      
      // Map to 5 distinct discrete material color bands
      const evaluationVal = (compositeSignal + params.colorShift) % 1.0;
      const bandIndex = Math.floor(evaluationVal * 5);
      
      let r = 0, g = 0, b = 0;
      
      // Assign static, vivid material colors per index band mimicking thermal cameras
      switch (bandIndex) {
        case 0: // Ultra Hot Core
          r = 255; g = 255; b = 255;
          break;
        case 1: // Intense Heat
          r = 255; g = 140; b = 0;
          break;
        case 2: // Fluid Plasma
          r = 220; g = 0; b = 100;
          break;
        case 3: // Subdued Ambient Fill
          r = 40; g = 0; b = 160;
          break;
        case 4: // Deep Sub-zero Cold
          r = 5; g = 10; b = 40;
          break;
      }
      
      // Perform color block inverting check based on Knob 4 configuration
      if (evaluationVal > params.invertThreshold) {
        const brightSave = (r + g + b) / 3;
        r = brightSave * 0.2;
        g = 255 - g;
        b = 255;
      }
      
      display.setPixel(x, y, r, g, b);
    }
  }
}`,"0601":`// Pattern: 0601
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-01
// Lineage: AI generated and curated
//
// Cellular Wave Matrix
// Knob 1: Grid Density (Cell Size Selector)
// Knob 2: Animation Speed
// Knob 3: Cell Inversion Threshold (Hardness of square blocks)
// Knob 4: Local Phase Split (Offset between alternating columns)

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const knobs = input.knobValues || [0.5, 2.0, 1.0, 0.6];
  
  // Custom structural control mapping
  params.cellSize = Math.max(4, Math.floor((1.0 - knobs[0]) * 24 + 4));
  params.speed = knobs[1];
  params.threshold = knobs[2] / 4.9; // Normalize 0 to 1
  params.phaseSplit = knobs[3] * Math.PI * 2;
  
  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  const w = display.width;
  const h = display.height;
  const size = params.cellSize;

  for (let y = 0; y < h; y++) {
    // Structural layout: block coordinate
    const cellY = Math.floor(y / size);
    
    for (let x = 0; x < w; x++) {
      const cellX = Math.floor(x / size);
      
      // Calculate a distinct phase per cell grid structural group
      let wavePhase = params.time + cellX * 0.4 + cellY * 0.3;
      if (cellX % 2 === 0) {
        wavePhase += params.phaseSplit;
      }

      // Generate localized square-wave signal
      const signal = Math.sin(wavePhase) * 0.5 + 0.5;
      
      // Determine if this pixel is part of the core cell or its shell boundary
      const localX = x % size;
      const localY = y % size;
      const isEdge = (localX === 0 || localX === size - 1 || localY === 0 || localY === size - 1);
      
      let bright = 0;
      let r = 0, g = 0, b = 0;

      if (signal > params.threshold) {
        // Active Cell State
        bright = isEdge ? 255 : (0.4 + (signal - params.threshold) * 0.6) * 255;
        
        // Color linked entirely to structural cell ID and signal intensity
        const colorAngle = wavePhase + cellX * 0.1;
        r = (Math.sin(colorAngle) * 0.5 + 0.5) * bright;
        g = (Math.sin(colorAngle + 1.5) * 0.5 + 0.5) * bright;
        b = (Math.sin(colorAngle + 3.0) * 0.5 + 0.5) * bright;
      } else {
        // Inactive/Background State: Draw thin, dim moving tracking lines
        const scanline = Math.sin(x * 0.1 - params.time * 2.0) * 0.5 + 0.5;
        if (scanline > 0.85 && isEdge) {
          r = 0;
          g = scanline * 120;
          b = scanline * 180;
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}`,"0602":`// Pattern: 0602
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-02
// Lineage: AI generated and curated
//
// Knob 1: Oil Core Shift (0-1)
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
}`,retro_digital_tapestry:`// ===== Patternflow pattern =====
// Title:   Retro Digital Tapestry
// Author:  Seunghun LEE
// Date:    2026-06-28
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Retro Digital Tapestry
// Author: your name here
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-28
// Made with Patternflow Pattern Lab \u2014 https://patternflow.work/pattern-lab

export function setup(params) {
  params.cellScale = 0.3;
  params.speed = 1.0;
  params.logicMode = 0.2;
  params.waveMod = 0.5;
  params.timeAcc = 0;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.cellScale = input.knobValues[0];
    params.speed = input.knobValues[1];
    params.logicMode = input.knobValues[2];
    params.waveMod = input.knobValues[3];
  }
  params.timeAcc += dt * params.speed * 2.0;
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;

  let scale = Math.floor(4 + params.cellScale * 24);
  let mode = Math.floor(params.logicMode * 5.0);
  let waveF = 0.02 + params.waveMod * 0.08;

  for (let y = 0; y < h; y++) {
    let sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      let sx = Math.floor(x / scale);
      let patternVal = 0;

      switch (mode) {
        case 0: patternVal = (sx ^ sy) + Math.floor(t); break;
        case 1: patternVal = (sx & sy) * 3 + Math.floor(t * 1.5); break;
        case 2: patternVal = (sx * 7 + sy * 3) ^ Math.floor(t); break;
        case 3: patternVal = (sx ^ (sy + Math.floor(t))) & 15; break;
        default: patternVal = ((sx * sx + sy * sy) >> 2) + Math.floor(t * 0.8); break;
      }

      let smoothS = Math.sin(x * waveF + t) * Math.cos(y * waveF - t);
      let bitActive = (patternVal & 8) !== 0;

      let r = 0, g = 0, b = 0;

      if (bitActive) {
        let hu = (smoothS * 0.3 + 0.5 + (patternVal % 16) / 32.0) % 1.0;
        let hueIdx = Math.floor(hu * 6);
        let f = hu * 6 - hueIdx;
        let maxVal = 220;
        let minVal = Math.floor(50 * (Math.sin(t * 2.0) * 0.5 + 0.5));
        let range = maxVal - minVal;

        let p = maxVal;
        let q = minVal + Math.floor(range * (1 - f));
        let s = minVal + Math.floor(range * f);

        switch (hueIdx % 6) {
          case 0: r = p; g = s; b = minVal; break;
          case 1: r = q; g = p; b = minVal; break;
          case 2: r = minVal; g = p; b = s; break;
          case 3: r = minVal; g = q; b = p; break;
          case 4: r = s; g = minVal; b = p; break;
          default: r = p; g = minVal; b = q; break;
        }
      } else {
        if ((x % scale === 0) || (y % scale === 0)) {
          r = 20; g = 10; b = 40;
        }
      }

      display.setPixel(x, y, r, g, b);
    }
  }
}

// ---
// Generated at https://patternflow.work/pattern-lab \u2014 https://patternflow.work
// Licensed CC-BY-SA-4.0. Keep this notice if you share or remix.

// \u2500\u2500 Made with Patternflow \xB7 https://patternflow.work \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,chromatic_vortex:`// ===== Patternflow pattern =====
// Title:   Chromatic Aberration Vortex
// Author:  Seunghun LEE
// Date:    2026-06-29
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Chromatic Aberration Vortex
// Author: Creative AI Collaborator
// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Knob 1: Aberration Split Distance
// Knob 2: Rotation Swirl Speed
// Knob 3: Vortex Ring Wave Density
// Knob 4: Base Color Shift Matrix

export function setup(params) {
    params.split = 0.4;
    params.speed = 1.5;
    params.density = 2.0;
    params.colorBias = 0.5;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.split = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.density = input.knobValues[2];
        params.colorBias = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let cx = w / 2, cy = h / 2;
    let maxShift = params.split * 8.0;

    for (let y = 0; y < h; y++) {
        let dy = y - cy;
        for (let x = 0; x < w; x++) {
            let dx = x - cx;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let angle = Math.atan2(dy, dx);

            // R, G, B \uAC1C\uBCC4 \uCC44\uB110\uC5D0 \uC11C\uB85C \uB2E4\uB978 \uBB3C\uB9AC \uC65C\uACE1 \uC704\uC0C1(\uBC18\uACBD/\uAC01\uB3C4) \uC801\uC6A9
            let shiftR = Math.sin(dist * 0.05 - t) * maxShift;
            let shiftG = Math.sin(dist * 0.05 - t + 1.0) * maxShift * 0.5;
            let shiftB = Math.sin(dist * 0.05 - t + 2.0) * maxShift * -0.5;

            // Red Channel Matrix
            let rDist = dist + shiftR;
            let rWave = Math.sin(rDist * (params.density * 0.1 + 0.05) - t * 2.0 + angle);
            let rInt = Math.max(0.0, rWave * 0.5 + 0.5);

            // Green Channel Matrix
            let gDist = dist + shiftG;
            let gWave = Math.sin(gDist * (params.density * 0.1 + 0.05) - t * 2.0 + angle + 1.0);
            let gInt = Math.max(0.0, gWave * 0.5 + 0.5);

            // Blue Channel Matrix
            let bDist = dist + shiftB;
            let bWave = Math.sin(bDist * (params.density * 0.1 + 0.05) - t * 2.0 + angle + 2.0);
            let bInt = Math.max(0.0, bWave * 0.5 + 0.5);

            // \uCEEC\uB7EC \uB9C8\uC2A4\uD130 \uBC14\uC774\uC5B4\uC2A4 \uD569\uC131
            let r = Math.floor(rInt * 255 * (params.colorBias * 0.5 + 0.5));
            let g = Math.floor(gInt * 255 * (1.0 - params.colorBias * 0.3));
            let b = Math.floor(bInt * 255 * (0.3 + params.colorBias * 0.7));

            // \uCC44\uB110\uB4E4\uC774 \uC644\uBCBD\uD788 \uC911\uCCA9\uB418\uB294 \uD53C\uD06C\uB294 \uC644\uC804\uD55C \uD770\uC0C9 \uAD11\uC6D0 \uD615\uC131
            if (rInt > 0.85 && gInt > 0.85 && bInt > 0.85) {
                r = 255; g = 255; b = 255;
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}

// \u2500\u2500 Made with Patternflow \xB7 https://patternflow.work \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,vector_field_flow:`// ===== Patternflow pattern =====
// Title:   Vector Field Particle Flow
// Author:  Seunghun LEE
// Date:    2026-06-29
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Vector Field Particle Flow
// Author: Creative AI Collaborator
// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Knob 1: Field Turbulence / Curl
// Knob 2: Stream Velocity
// Knob 3: Particle Density Scaling
// Knob 4: Directional Palette Shift

function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (((i % 6) + 6) % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

export function setup(params) {
    params.turbulence = 0.5;
    params.speed = 2.0;
    params.density = 2.5;
    params.palette = 0.1;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.turbulence = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.density = input.knobValues[2];
        params.palette = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let nx = x / w - 0.5;
            let ny = y / h - 0.5;

            // \uD68C\uC804 \uBCA1\uD130 \uD544\uB4DC \uACC4\uC0B0
            let angle = Math.sin(nx * params.density * 4.0 + t) + Math.cos(ny * params.density * 4.0 - t);
            let forceX = Math.sin(angle * params.turbulence * 5.0);
            let forceY = Math.cos(angle * params.turbulence * 5.0);

            let value = Math.sin((nx * forceX + ny * forceY) * 10.0 + t * 2.0);
            let intensity = Math.max(0.0, value * 0.5 + 0.5);

            let r = 0, g = 0, b = 0;
            if (intensity > 0.1) {
                let hue = params.palette + (angle / (Math.PI * 2)) + (forceX * 0.2);
                hue = Math.abs(hue % 1.0);
                
                let rgb = hsvToRgb(hue, 0.85, intensity);
                r = rgb[0]; g = rgb[1]; b = rgb[2];

                if (intensity > 0.88) {
                    r = 255; g = 255; b = 255;
                }
            }
            display.setPixel(x, y, r, g, b);
        }
    }
}

// \u2500\u2500 Made with Patternflow \xB7 https://patternflow.work \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,lissajous_weave:`// ===== Patternflow pattern =====
// Title:   Lissajous Weave
// Author:  Seunghun LEE
// Date:    2026-07-01
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Variation 16: Lissajous Weave (Structural Remix)
// Creates woven patterns using Lissajous curves with varying frequencies.
// Knob 1: X frequency (1-8)
// Knob 2: Speed (0.1-10.0)
// Knob 3: Y frequency (1-8)
// Knob 4: Phase offset (0.0-1.0)

export function setup(params) {
    params.freqX = 3.0;
    params.speed = 2.0;
    params.freqY = 4.0;
    params.phase = 0.5;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.freqX = 1 + Math.floor(input.knobValues[0] * 7);
        params.speed = input.knobValues[1];
        params.freqY = 1 + Math.floor(input.knobValues[2] * 7);
        params.phase = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;
    let fx = params.freqX;
    let fy = params.freqY;
    let phase = params.phase * Math.PI * 2;

    // Clear with background gradient
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let bg = Math.floor(10 + (x / w) * 20);
            display.setPixel(x, y, 0, bg, Math.floor(bg * 0.7));
        }
    }

    // Draw multiple Lissajous curves
    let numCurves = 12;
    for (let curve = 0; curve < numCurves; curve++) {
        let curvePhase = (curve / numCurves) * Math.PI * 2;
        let points = 300;
        let hue = (curve / numCurves + t * 0.01) % 1.0;
        
        for (let i = 0; i < points; i++) {
            let theta = (i / points) * Math.PI * 2 * 4 + t * 0.2;
            let cx = w/2 + Math.sin(theta * fx + t * 0.1 + curvePhase) * (w * 0.4);
            let cy = h/2 + Math.sin(theta * fy + t * 0.15 + curvePhase + phase) * (h * 0.4);
            
            let px = Math.floor(cx);
            let py = Math.floor(cy);
            
            if (px >= 0 && px < w && py >= 0 && py < h) {
                let brightness = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(theta * 3));
                let saturation = 0.8;
                
                let hh = hue * 6;
                let i = Math.floor(hh);
                let f = hh - i;
                let p = brightness * (1 - saturation);
                let q = brightness * (1 - saturation * f);
                let tt = brightness * (1 - saturation * (1 - f));
                let r, g, b;
                switch (i % 6) {
                    case 0: r = brightness; g = tt; b = p; break;
                    case 1: r = q; g = brightness; b = p; break;
                    case 2: r = p; g = brightness; b = tt; break;
                    case 3: r = p; g = q; b = brightness; break;
                    case 4: r = tt; g = p; b = brightness; break;
                    case 5: r = brightness; g = p; b = q; break;
                }
                
                // \uC9C1\uC811 \uD53D\uC140 \uC124\uC815 (additive \uB300\uC2E0)
                display.setPixel(px, py,
                    Math.floor(r * 255),
                    Math.floor(g * 255),
                    Math.floor(b * 255)
                );
            }
        }
    }
}

// \u2500\u2500 Made with Patternflow \xB7 https://patternflow.work \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,untitled_pattern:`// ===== Patternflow pattern =====
// Title:   260707
// Author:  Seunghun LEE
// Date:    2026-07-07
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// @knobs Glitch=0..1, Speed=0.05..5, Freq=10..120, Quantize=2..10
//
// Knob 1 (Glitch): Phase displacement and row slippage amount
// Knob 2 (Speed): Base time flow rate
// Knob 3 (Freq): Spatial frequency of the wave generation
// Knob 4 (Quantize): Level discretization steps for a stepped material feel

export function setup(params) {
    params.glitch = 0.1;
    params.speed = 1.0;
    params.freq = 40.0;
    params.quantize = 4;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.glitch = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.freq = input.knobValues[2];
        params.quantize = Math.floor(input.knobValues[3]);
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    const w = display.width;
    const h = display.height;
    const t = params.timeAcc;

    for (let y = 0; y < h; y++) {
        let rowShift = 0;
        if (params.glitch > 0.02) {
            let noise = Math.sin(y * 0.5 + t * 10.0) * Math.cos(y * 0.1 - t * 4.0);
            if (noise > 1.0 - params.glitch) {
                rowShift = Math.sin(t * 30.0) * params.glitch * 30.0;
            }
        }

        for (let x = 0; x < w; x++) {
            let nx = (x + rowShift - w / 2) / (w / 2);
            let ny = (y - h / 2) / (h / 2);
            let d = Math.sqrt(nx * nx + ny * ny);

            let waveValue = Math.sin(d * params.freq - t * 4.0 + Math.sin(nx * 4.0 + t) * params.glitch * 5.0);
            let rawV = (waveValue + 1.0) * 0.5;

            let steps = params.quantize;
            let v = Math.floor(rawV * steps) / (steps - 1);
            v = Math.max(0.0, Math.min(1.0, v));

            display.setValue(x, y, v);
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,tilewaves:`// ===== Patternflow pattern =====
// Title:   260710
// Author:  Seunghun LEE
// Date:    2026-07-10
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// @knobs Quantize=1..12, Speed=0.1..10, PhaseShift=0..5, Sharpness=1..10
//
// Knob 1: Quantize - The stepping threshold of the time updates
// Knob 2: Speed - Master flow rate of the pattern clock
// Knob 3: PhaseShift - Geometric lag spreading outwards from the center
// Knob 4: Sharpness - Value profile modulation between smooth ramp and hard step

export function setup(params) {
    params.timeAcc = 0;
}

export function update(dt, input, params) {
    let v = input.knobValues;
    params.quantize = v[0];
    params.speed = v[1];
    params.phaseShift = v[2];
    params.sharpness = v[3];
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    
    let tileSize = 8;
    let cx = w / 2;
    let cy = h / 2;

    for (let y = 0; y < h; y++) {
        let gridY = Math.floor(y / tileSize);
        for (let x = 0; x < w; x++) {
            let gridX = Math.floor(x / tileSize);
            
            // Core coordinate metrics based on tile centers
            let tx = gridX * tileSize + tileSize / 2;
            let ty = gridY * tileSize + tileSize / 2;
            let dx = tx - cx;
            let dy = ty - cy;
            let dist = Math.sqrt(dx * dx + dy * dy);

            // Phase delayed, time-quantized motion pipeline
            let localTime = params.timeAcc - dist * params.phaseShift * 0.08;
            if (params.quantize > 1.0) {
                let step = 1.0 / params.quantize;
                localTime = Math.floor(localTime / step) * step;
            }

            // Generate concentric tile waves derived from custom time
            let wave = Math.sin(dist * 0.25 - localTime * 3.0);
            let val = (wave + 1) * 0.5;

            // Apply high-contrast sharpening curves via power scaling
            val = Math.pow(val, params.sharpness);
            
            // Add tile frame borders to retain the structural matrix grid
            if (x % tileSize === 0 || y % tileSize === 0) {
                val = 0.0;
            }

            display.setValue(x, y, Math.max(0.0, Math.min(1.0, val)));
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,midsummer_sea:`// ===== Patternflow pattern =====
// Title:   260712_Midsummer Sea
// Author:  Seunghun LEE
// Date:    2026-07-12
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Midsummer Sea (Vertical Pixel Seascape)
// \uC138\uB85C(64x128) \uAD6C\uC131 \u2014 \uD558\uB298/\uD0DC\uC591/\uC6D0\uADFC \uD30C\uB3C4/\uC724\uC2AC/\uD574\uBCC0 \uD3EC\uB9D0 \uB808\uC774\uC5B4
// @knobs Waves=0..1, Speed=0.1..3, Sun=0..1, Glitter=0..1
//
// Knob 1 (Waves): \uD30C\uB3C4 \uC9C4\uD3ED + \uD574\uBCC0\uC5D0 \uBC00\uB824\uC624\uB294 \uBB3C\uC758 \uC138\uAE30
// Knob 2 (Speed): \uC804\uCCB4 \uC2DC\uAC04 \uD750\uB984 \uC18D\uB3C4
// Knob 3 (Sun): \uD0DC\uC591 \uACE0\uB3C4 (0=\uC218\uD3C9\uC120 \uB178\uC744, 1=\uD55C\uB0AE)
// Knob 4 (Glitter): \uC724\uC2AC(\uBC18\uC9DD\uC784) \uBC00\uB3C4

function hash(n) {
    let s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
}

export function setup(params) {
    params.waves = 0.5;
    params.speed = 1.0;
    params.sun = 0.7;
    params.glit = 0.5;
    params.t = 0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.waves = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.sun = input.knobValues[2];
        params.glit = input.knobValues[3];
    }
    params.t += dt * params.speed;
}

export function draw(display, params, time) {
    const W = display.width, H = display.height;
    const FLIP = 0; // \uD328\uB110 \uC7A5\uCC29 \uBC29\uD5A5 \uBC18\uB300\uBA74 1
    const portrait = W < H;
    const vw = portrait ? W : H;
    const vh = portrait ? H : W;

    const t = params.t;
    const amp = params.waves;
    const horizon = Math.floor(vh * 0.34);
    const beachTop = vh - Math.floor(vh * 0.14);
    const sunU = vw * 0.5;
    const sunV = horizon - 3 - params.sun * (horizon - 8);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let u, v;
            if (portrait) { u = x; v = y; }
            else if (FLIP) { u = H - 1 - y; v = x; }
            else { u = y; v = W - 1 - x; }

            let val;

            if (v < horizon) {
                // --- \uD558\uB298: \uC218\uD3C9\uC120 \uCABD\uC774 \uBC1D\uC740 \uD5E4\uC774\uC988 \uADF8\uB77C\uB514\uC5B8\uD2B8 ---
                const g = v / horizon;
                val = 0.12 + 0.38 * g;

                // \uD0DC\uC591 \uB514\uC2A4\uD06C + \uAE00\uB85C\uC6B0
                const du = u - sunU, dv = (v - sunV) * 1.2;
                const d = Math.sqrt(du * du + dv * dv);
                if (d < 4.5) val = 1.0;
                else val += 0.7 * Math.exp(-d * 0.18);

                // \uC587\uC740 \uAD6C\uB984 \uBC34\uB4DC (\uB290\uB9AC\uAC8C \uD750\uB984)
                const cl = Math.sin(u * 0.11 + v * 0.9 + t * 0.25)
                         + Math.sin(u * 0.05 - v * 0.5 + 2.0);
                if (cl > 1.2 && v < horizon * 0.8) val += 0.12;

            } else if (v < beachTop) {
                // --- \uBC14\uB2E4: \uC6D0\uADFC \uD30C\uB3C4 \uBC34\uB4DC ---
                const depth = (v - horizon) / (beachTop - horizon); // 0=\uC218\uD3C9\uC120, 1=\uD574\uBCC0 \uC55E
                const persp = 1.0 / (depth + 0.09);
                const wob = Math.sin(u * 0.25 + t * 1.3) * 0.5 * amp;
                const band = Math.sin(persp * 2.6 + wob + t * (1.5 + depth * 2.0));
                val = 0.42 - 0.22 * depth
                    + band * (0.06 + 0.14 * amp) * (0.4 + depth);

                // \uD0DC\uC591 \uBC18\uC0AC \uAE30\uB465 (\uC724\uC2AC \uAE38, \uC0B4\uC9DD \uD754\uB4E4\uB9BC)
                const pathW = 2.5 + depth * 9.0;
                const sway = Math.sin(v * 0.5 + t) * amp * 2.0;
                const inPath = Math.abs(u - sunU + sway) < pathW;
                if (inPath) val += 0.12 + 0.1 * (1.0 - depth);

                // \uC724\uC2AC \uC2A4\uD30C\uD074 (\uD30C\uB3C4 \uB9C8\uB8E8\uC5D0\uC11C\uB9CC \uD130\uC9D0)
                const sp = hash(u * 7.3 + v * 13.1 + Math.floor(t * 7.0) * 17.7);
                const thr = 1.0 - params.glit * (inPath ? 0.10 : 0.03);
                if (sp > thr && band > 0.2) val = 1.0;

            } else {
                // --- \uD574\uBCC0: \uBAA8\uB798 \uC9C8\uAC10 + \uBC00\uB824\uC624\uB294 \uD3EC\uB9D0 \uB77C\uC778 ---
                const s = (v - beachTop) / (vh - beachTop);
                val = 0.5 + 0.15 * s + 0.06 * hash(u * 3.7 + v * 5.1);

                const surge = Math.sin(t * 1.8) * 0.5 + 0.5; // \uBC00\uBB3C/\uC370\uBB3C \uD638\uD761
                const edge = beachTop
                           + 2 + surge * (vh - beachTop) * 0.55 * (0.4 + amp)
                           + Math.sin(u * 0.35 + t * 2.2) * 2.5 * amp;

                if (v < edge) {
                    // \uC595\uC740 \uBB3C (\uBAA8\uB798\uBCF4\uB2E4 \uC5B4\uB461\uAC8C)
                    val = 0.34 - 0.1 * (edge - v) / (vh - beachTop);
                    if (edge - v < 1.5) val = 0.95; // \uD3EC\uB9D0 \uB77C\uC778
                }
            }

            display.setValue(x, y, Math.max(0, Math.min(1, val)));
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,breakout_arcade:`// ===== Patternflow pattern =====
// Title:   260713_Breakout Arcade
// Author:  Seunghun LEE
// Date:    2026-07-12
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Breakout Arcade v2 (Wide Paddle + Item-Hungry AI)
// \uC138\uB85C(64x128) \u2014 \uB178\uBE0C1 \uC218\uB3D9 \uC870\uC791 / 5\uCD08 \uBC29\uCE58 \uC2DC AI \uBCF5\uADC0, AI\uAC00 \uC544\uC774\uD15C\uB3C4 \uD310\uB2E8\uD574\uC11C \uCE90\uCE58
// \uBCBD\uB3CC 8\uC904 \uACE0\uC815, \uC544\uC774\uD15C(\uBA40\uD2F0\uBCFC/\uC640\uC774\uB4DC/\uD30C\uC774\uC5B4\uBCFC) + \uAE00\uB85C\uC6B0 \uBC84\uD37C
// @knobs Paddle=2..62, Speed=25..90, Luck=0..1, Glow=0..1
//
// Knob 1 (Paddle): \uD328\uB4E4 \uC704\uCE58 \uC9C1\uACB0 (\uB3CC\uB9AC\uBA74 \uC218\uB3D9, 5\uCD08 \uBC29\uCE58 \uC2DC AI \uBCF5\uADC0)
// Knob 2 (Speed): \uACF5 \uC18D\uB3C4 (px/s)
// Knob 3 (Luck): \uC544\uC774\uD15C \uB4DC\uB78D \uD655\uB960
// Knob 4 (Glow): \uC794\uAD11 \uC720\uC9C0 \uC2DC\uAC04
// Button 1: \uBCBD\uB3CC \uB9AC\uC14B / Button 2: \uBA40\uD2F0\uBCFC / Button 3: \uC640\uC774\uB4DC / Button 4: \uD30C\uC774\uC5B4\uBCFC

function rnd(params) {
    params.rng = (params.rng * 48271) % 2147483647;
    return params.rng / 2147483647;
}

const ROWS = 8;
const PAD_W = 10;        // \uAE30\uBCF8 \uD328\uB4E4 \uD3ED (\uAE30\uC874 7\uC758 1.5\uBC30)
const PAD_W_WIDE = 16;   // \uC640\uC774\uB4DC \uC544\uC774\uD15C \uC2DC
const ITEM_FALL = 20;    // \uC544\uC774\uD15C \uB099\uD558 \uC18D\uB3C4 px/s
const AI_SPD = 115;      // AI \uD328\uB4E4 \uC18D\uB3C4 px/s

export function setup(params) {
    params.vw = 64; params.vh = 128;
    params.speed = 50;
    params.luck = 0.4; params.glowK = 0.5;
    params.rng = 12345;

    params.dead = new Uint8Array(64);          // 8\uC5F4 x 8\uC904
    params.balls = new Float32Array(32);       // 8\uAC1C x (x, y, dx, dy)
    params.ballOn = new Uint8Array(8);
    params.items = new Float32Array(18);       // 6\uAC1C x (x, y, type)
    params.itemOn = new Uint8Array(6);
    params.glow = new Float32Array(64 * 128);

    params.balls[0] = 32; params.balls[1] = 80;
    params.balls[2] = 0.55; params.balls[3] = -0.84;
    params.ballOn[0] = 1;

    params.px = 32;
    params.lastKnob = -999;
    params.idleT = 99;        // \uC2DC\uC791\uC740 AI \uBAA8\uB4DC
    params.wideT = 0; params.fireT = 0;
    params.flash = 0; params.combo = 0;
    params.aiTarget = 32;
}

function depositGlow(params, gx, gy, amt, rad) {
    const vw = params.vw, vh = params.vh;
    const x0 = Math.max(0, Math.floor(gx - rad));
    const x1 = Math.min(vw - 1, Math.ceil(gx + rad));
    const y0 = Math.max(0, Math.floor(gy - rad));
    const y1 = Math.min(vh - 1, Math.ceil(gy + rad));
    for (let gy2 = y0; gy2 <= y1; gy2++) {
        for (let gx2 = x0; gx2 <= x1; gx2++) {
            const du = gx2 - gx, dv = gy2 - gy;
            const f = 1.0 - Math.sqrt(du * du + dv * dv) / (rad + 0.001);
            if (f > 0) {
                const idx = gx2 + gy2 * vw;
                const nv = params.glow[idx] + amt * f;
                params.glow[idx] = nv > 1 ? 1 : nv;
            }
        }
    }
}

function multiball(params) {
    for (let i = 0; i < 8; i++) {
        if (!params.ballOn[i]) continue;
        for (let j = 0; j < 8; j++) {
            if (params.ballOn[j]) continue;
            params.ballOn[j] = 1;
            params.balls[j * 4]     = params.balls[i * 4];
            params.balls[j * 4 + 1] = params.balls[i * 4 + 1];
            const a = 0.3 + rnd(params) * 0.4;
            params.balls[j * 4 + 2] = -params.balls[i * 4 + 2] * (0.7 + a);
            params.balls[j * 4 + 3] = params.balls[i * 4 + 3];
            const dx = params.balls[j * 4 + 2], dy = params.balls[j * 4 + 3];
            const len = Math.sqrt(dx * dx + dy * dy);
            params.balls[j * 4 + 2] = dx / len;
            params.balls[j * 4 + 3] = dy / len;
            break;
        }
    }
}

export function update(dt, input, params) {
    let knobPad = params.px;
    if (input && input.knobValues) {
        knobPad = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.luck = input.knobValues[2];
        params.glowK = input.knobValues[3];
    }
    if (input && input.btnPressed) {
        if (input.btnPressed[0]) params.dead.fill(0);
        if (input.btnPressed[1]) { multiball(params); params.flash = 1.0; }
        if (input.btnPressed[2]) params.wideT = 6.0;
        if (input.btnPressed[3]) { params.fireT = 4.0; params.flash = 0.8; }
    }

    // --- \uC218\uB3D9/\uC790\uB3D9 \uD310\uC815 ---
    if (params.lastKnob < -100) params.lastKnob = knobPad;
    if (Math.abs(knobPad - params.lastKnob) > 0.15) params.idleT = 0;
    else params.idleT += dt;
    params.lastKnob = knobPad;
    const manual = params.idleT < 5.0;

    const vw = params.vw, vh = params.vh;
    const brickTop = 10, bw = 8, bh = 5;

    // \uAE00\uB85C\uC6B0 \uAC10\uC1E0
    const decay = Math.exp(-dt * (8.0 - 7.0 * params.glowK));
    const glow = params.glow;
    for (let i = 0; i < glow.length; i++) glow[i] *= decay;

    params.wideT = Math.max(0, params.wideT - dt);
    params.fireT = Math.max(0, params.fireT - dt);
    const padW = params.wideT > 0 ? PAD_W_WIDE : PAD_W;
    const fire = params.fireT > 0;
    const padV = vh - 7;

    // --- \uD328\uB4E4 \uC774\uB3D9 (\uCDA9\uB3CC \uD310\uC815\uBCF4\uB2E4 \uBA3C\uC800) ---
    if (manual) {
        params.px = knobPad;
    } else {
        const diff = params.aiTarget - params.px;
        const step = Math.min(Math.abs(diff), AI_SPD * dt);
        params.px += Math.sign(diff) * step;
    }
    params.px = Math.max(padW * 0.5, Math.min(vw - padW * 0.5, params.px));

    // --- \uACF5 \uC2DC\uBBAC\uB808\uC774\uC158 + \uC704\uD611 \uACF5 ETA \uACC4\uC0B0 ---
    let aliveBalls = 0;
    let ballTX = -1, ballETA = 1e9;

    for (let i = 0; i < 8; i++) {
        if (!params.ballOn[i]) continue;
        const o = i * 4;
        params.balls[o]     += params.balls[o + 2] * params.speed * dt;
        params.balls[o + 1] += params.balls[o + 3] * params.speed * dt;
        let bx = params.balls[o], by = params.balls[o + 1];

        if (bx < 2) { params.balls[o] = bx = 2; params.balls[o + 2] = Math.abs(params.balls[o + 2]); }
        if (bx > vw - 2) { params.balls[o] = bx = vw - 2; params.balls[o + 2] = -Math.abs(params.balls[o + 2]); }
        if (by < 2) { params.balls[o + 1] = by = 2; params.balls[o + 3] = Math.abs(params.balls[o + 3]); }

        // \uBCBD\uB3CC \uCDA9\uB3CC
        if (by >= brickTop && by < brickTop + ROWS * bh) {
            const col = Math.min(7, Math.max(0, Math.floor(bx / bw)));
            const row = Math.floor((by - brickTop) / bh);
            const idx = row * 8 + col;
            if (!params.dead[idx]) {
                params.dead[idx] = 1;
                if (!fire) params.balls[o + 3] = -params.balls[o + 3];
                params.combo++;
                params.flash = Math.min(1, 0.25 + params.combo * 0.1);
                depositGlow(params, col * bw + bw * 0.5, brickTop + row * bh + bh * 0.5,
                            0.9, fire ? 5 : 3);

                if (rnd(params) < params.luck * 0.4) {
                    for (let s = 0; s < 6; s++) {
                        if (params.itemOn[s]) continue;
                        params.itemOn[s] = 1;
                        params.items[s * 3]     = col * bw + bw * 0.5;
                        params.items[s * 3 + 1] = brickTop + row * bh;
                        params.items[s * 3 + 2] = Math.floor(rnd(params) * 3);
                        break;
                    }
                }
            }
        }

        // \uD328\uB4E4 \uBC18\uC0AC
        if (by >= padV - 1 && by <= padV + 2 && params.balls[o + 3] > 0
            && Math.abs(bx - params.px) < padW * 0.5 + 1) {
            params.balls[o + 3] = -Math.abs(params.balls[o + 3]);
            params.balls[o + 2] += (bx - params.px) / (padW * 0.5) * 0.7;
            let dx = params.balls[o + 2], dy = params.balls[o + 3];
            let len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
            if (dy > -0.35) dy = -0.35;
            len = Math.sqrt(dx * dx + dy * dy);
            params.balls[o + 2] = dx / len;
            params.balls[o + 3] = dy / len;
            params.combo = 0;
        }

        if (by > vh + 4) { params.ballOn[i] = 0; continue; }

        aliveBalls++;

        // \uD558\uAC15 \uC911\uC778 \uACF5\uC758 \uD328\uB4E4 \uB3C4\uCC29 \uC2DC\uAC04 (\uAC00\uC7A5 \uAE09\uD55C \uACF5 \uAE30\uB85D)
        if (params.balls[o + 3] > 0) {
            const eta = (padV - by) / (params.balls[o + 3] * params.speed);
            if (eta >= 0 && eta < ballETA) { ballETA = eta; ballTX = bx; }
        }

        depositGlow(params, bx, by, fire ? 0.5 : 0.3, fire ? 2.5 : 1.5);
    }

    // \uC804\uBA78 \u2192 \uB9AC\uC2A4\uD3F0
    if (aliveBalls === 0) {
        params.ballOn[0] = 1;
        params.balls[0] = vw * 0.5; params.balls[1] = vh * 0.55;
        params.balls[2] = rnd(params) > 0.5 ? 0.55 : -0.55;
        params.balls[3] = -0.84;
        params.flash = 1.0; params.combo = 0;
    }

    // \uBCBD\uB3CC \uC804\uBA78 \u2192 \uB9AC\uD544
    let brickAlive = 0;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 8; c++)
            if (!params.dead[r * 8 + c]) brickAlive++;
    if (brickAlive === 0) {
        params.dead.fill(0);
        params.flash = 1.0;
        depositGlow(params, vw * 0.5, vh * 0.3, 1.0, 14);
    }

    // --- \uC544\uC774\uD15C \uB099\uD558 & \uCE90\uCE58 + \uC544\uC774\uD15C ETA \uACC4\uC0B0 ---
    let itemTX = -1, itemETA = 1e9;
    for (let s = 0; s < 6; s++) {
        if (!params.itemOn[s]) continue;
        params.items[s * 3 + 1] += ITEM_FALL * dt;
        const ix = params.items[s * 3], iy = params.items[s * 3 + 1];

        if (iy >= padV - 1 && iy <= padV + 3 && Math.abs(ix - params.px) < padW * 0.5 + 1.5) {
            const ty = params.items[s * 3 + 2];
            if (ty === 0) multiball(params);
            else if (ty === 1) params.wideT = 6.0;
            else params.fireT = 4.0;
            params.flash = 1.0;
            depositGlow(params, ix, padV, 1.0, 6);
            params.itemOn[s] = 0;
            continue;
        }
        if (iy > vh + 3) { params.itemOn[s] = 0; continue; }

        // AI\uC6A9: \uAC00\uC7A5 \uBA3C\uC800 \uB5A8\uC5B4\uC9C8 \uC544\uC774\uD15C
        const eta = (padV - iy) / ITEM_FALL;
        if (eta >= 0 && eta < itemETA) { itemETA = eta; itemTX = ix; }
    }

    // --- AI \uD0C0\uAC9F \uACB0\uC815: ETA \uC6B0\uC120\uC21C\uC704 ---
    // 1) \uC704\uD611 \uACF5\uC774 \uC5C6\uC73C\uBA74 \uC544\uC774\uD15C\uC73C\uB85C (\uC5C6\uC73C\uBA74 \uC911\uC559 \uB300\uAE30)
    // 2) \uC544\uC774\uD15C\uC774 \uACF5\uBCF4\uB2E4 0.35\uCD08 \uC774\uC0C1 \uBA3C\uC800 \uB3C4\uCC29\uD558\uACE0, \uAC70\uAE30\uAE4C\uC9C0 \uAC08 \uC2DC\uAC04\uC774 \uB418\uBA74 \uC544\uC774\uD15C \uBA3C\uC800
    // 3) \uADF8 \uC678\uC5D4 \uACF5 \uC218\uBE44
    if (ballTX < 0) {
        params.aiTarget = itemTX >= 0 ? itemTX : vw * 0.5;
    } else if (itemTX >= 0) {
        const travelT = Math.abs(itemTX - params.px) / AI_SPD;
        if (itemETA + 0.35 < ballETA && travelT < itemETA + 0.2) {
            params.aiTarget = itemTX;
        } else {
            params.aiTarget = ballTX;
        }
    } else {
        params.aiTarget = ballTX;
    }

    params.flash = Math.max(0, params.flash - dt * 2.5);
    params.padW = padW;
    params.fire = fire ? 1 : 0;
    params.manual = manual ? 1 : 0;
    params.t = (params.t || 0) + dt;
}

export function draw(display, params, time) {
    const W = display.width, H = display.height;
    const FLIP = 0;
    const portrait = W < H;
    const vw = params.vw, vh = params.vh;
    const brickTop = 10, bw = 8, bh = 5;
    const padV = vh - 7;
    const t = params.t || 0;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let u, v;
            if (portrait) { u = x; v = y; }
            else if (FLIP) { u = H - 1 - y; v = x; }
            else { u = y; v = W - 1 - x; }

            let val = 0.03 + 0.02 * (v % 2) + params.flash * 0.15;

            if (u < 1 || u > vw - 2) val = 0.3;

            // \uBCBD\uB3CC 8\uC904
            if (v >= brickTop && v < brickTop + ROWS * bh) {
                const col = Math.floor(u / bw);
                const row = Math.floor((v - brickTop) / bh);
                if (col >= 0 && col < 8 && !params.dead[row * 8 + col]) {
                    const lu = u - col * bw;
                    const lv = (v - brickTop) - row * bh;
                    const border = (lu === 0 || lu === bw - 1 || lv === 0 || lv === bh - 1);
                    val = border ? 0.30 : 0.80 - row * 0.05;
                    if (params.fire) val += 0.12 * Math.sin(t * 10 + col * 2 + row);
                }
            }

            // \uD328\uB4E4
            if (v >= padV && v <= padV + 1 && Math.abs(u - params.px) < params.padW * 0.5) {
                val = 0.9;
                if (params.padW > PAD_W + 1 && Math.abs(u - params.px) > params.padW * 0.5 - 2) {
                    val = 0.6 + 0.4 * Math.sin(t * 12);
                }
                if (params.manual && Math.abs(u - params.px) < 1 && v === padV) {
                    val = 0.7 + 0.3 * Math.sin(t * 8);
                }
            }

            val += params.glow[u + v * vw] * 0.85;

            display.setValue(x, y, Math.max(0, Math.min(1, val)));
        }
    }

    const plot = (pu, pv, pval) => {
        let px, py;
        pu = Math.round(pu); pv = Math.round(pv);
        if (portrait) { px = pu; py = pv; }
        else if (FLIP) { px = pv; py = H - 1 - pu; }
        else { px = W - 1 - pv; py = pu; }
        if (px >= 0 && px < W && py >= 0 && py < H) display.setValue(px, py, pval);
    };

    // \uC544\uC774\uD15C \uAE00\uB9AC\uD504
    for (let s = 0; s < 6; s++) {
        if (!params.itemOn[s]) continue;
        const ix = params.items[s * 3], iy = params.items[s * 3 + 1];
        const ty = params.items[s * 3 + 2];
        const blink = 0.6 + 0.4 * Math.sin(t * (6 + ty * 4) + s);
        plot(ix, iy, 1.0);
        plot(ix - 1, iy, blink); plot(ix + 1, iy, blink);
        plot(ix, iy - 1, blink); plot(ix, iy + 1, blink);
        if (ty === 0) { plot(ix - 2, iy, blink * 0.5); plot(ix + 2, iy, blink * 0.5); }
    }

    // \uACF5
    for (let i = 0; i < 8; i++) {
        if (!params.ballOn[i]) continue;
        const bx = params.balls[i * 4], by = params.balls[i * 4 + 1];
        plot(bx, by, 1.0);
        plot(bx - 1, by, 0.8); plot(bx + 1, by, 0.8);
        plot(bx, by - 1, 0.8); plot(bx, by + 1, 0.8);
        if (params.fire) {
            plot(bx - 1, by - 1, 0.6); plot(bx + 1, by - 1, 0.6);
            plot(bx - 1, by + 1, 0.6); plot(bx + 1, by + 1, 0.6);
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,firefly_hollow:`// ===== Patternflow pattern =====
// Title:   260713_Firefly
// Author:  Seunghun LEE
// Date:    2026-07-13
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Firefly Hollow (Summer Night Valley)
// \uC138\uB85C(64x128) \uAD6C\uC131 \u2014 \uB2EC/fBM \uAD6C\uB984 / \uC5B8\uB355 \uC2E4\uB8E8\uC5E3 / \uD754\uB4E4\uB9AC\uB294 \uD480\uC232 / \uC810\uBA78 \uBC18\uB527\uBD88\uC774
// @knobs Flies=2..14, Speed=0.2..3, Glow=1.5..6, Wind=0..1
//
// Knob 1 (Flies): \uBC18\uB527\uBD88\uC774 \uAC1C\uCCB4 \uC218
// Knob 2 (Speed): \uC720\uC601/\uC810\uBA78 \uC18D\uB3C4
// Knob 3 (Glow): \uBC1C\uAD11 \uBC18\uACBD (\uBE5B\uBC88\uC9D0 \uD06C\uAE30)
// Knob 4 (Wind): \uD480\uC232 \uD754\uB4E4\uB9BC \uC138\uAE30 (+\uAD6C\uB984 \uB4DC\uB9AC\uD504\uD2B8 \uAC00\uC18D)

function hash(n) {
    let s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
}

// 2D \uBC38\uB958 \uB178\uC774\uC988: \uC815\uC218 \uACA9\uC790 \uD574\uC2DC + \uCF54\uC0AC\uC778 \uBCF4\uAC04
function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = (1 - Math.cos(xf * Math.PI)) * 0.5;
    const sy = (1 - Math.cos(yf * Math.PI)) * 0.5;
    const a = hash(xi * 12.9898 + yi * 78.233);
    const b = hash((xi + 1) * 12.9898 + yi * 78.233);
    const c = hash(xi * 12.9898 + (yi + 1) * 78.233);
    const d = hash((xi + 1) * 12.9898 + (yi + 1) * 78.233);
    const ab = a + (b - a) * sx;
    const cd = c + (d - c) * sx;
    return ab + (cd - ab) * sy;
}

export function setup(params) {
    params.flies = 8;
    params.speed = 1.0;
    params.glow = 3.0;
    params.wind = 0.4;
    params.t = 0;
    // \uBC18\uB527\uBD88\uC774 \uC88C\uD45C/\uBC1D\uAE30 \uBC84\uD37C (\uC815\uADDC\uD654 0..1) \u2014 \uD504\uB808\uC784\uB2F9 \uD560\uB2F9 \uBC29\uC9C0
    params.fu = new Float32Array(16);
    params.fv = new Float32Array(16);
    params.fb = new Float32Array(16);
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.flies = Math.round(input.knobValues[0]);
        params.speed = input.knobValues[1];
        params.glow = input.knobValues[2];
        params.wind = input.knobValues[3];
    }
    params.t += dt * params.speed;

    const t = params.t;
    const n = Math.min(16, params.flies);
    for (let i = 0; i < n; i++) {
        const s1 = 0.13 + 0.11 * hash(i * 7.1);
        const s2 = 0.09 + 0.13 * hash(i * 13.7);
        // \uB9AC\uC0AC\uC8FC \uC720\uC601 (\uC544\uB798\uCABD 2/3 \uC601\uC5ED\uC5D0\uC11C)
        params.fu[i] = 0.5 + 0.44 * Math.sin(t * s1 * 2.0 + i * 2.39);
        params.fv[i] = 0.62 + 0.30 * Math.sin(t * s2 * 2.0 + i * 5.17)
                            + 0.05 * Math.sin(t * 0.9 + i);
        // \uC228\uC26C\uB4EF \uC810\uBA78 (\uAC1C\uCCB4\uB9C8\uB2E4 \uC704\uC0C1/\uC8FC\uAE30 \uB2E4\uB984)
        const p = Math.sin(t * (0.8 + 0.5 * hash(i * 3.3)) + i * 1.7);
        params.fb[i] = Math.max(0, p) ** 3;
    }
}

export function draw(display, params, time) {
    const W = display.width, H = display.height;
    const FLIP = 0;
    const portrait = W < H;
    const vw = portrait ? W : H;
    const vh = portrait ? H : W;

    const t = params.t;
    const n = Math.min(16, params.flies);
    const g2 = params.glow * params.glow;
    const cloudDrift = t * (0.4 + params.wind * 0.8);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let u, v;
            if (portrait) { u = x; v = y; }
            else if (FLIP) { u = H - 1 - y; v = x; }
            else { u = y; v = W - 1 - x; }

            // --- \uD558\uB298: \uC704\uAC00 \uC9D9\uACE0 \uC544\uB798\uB85C \uC740\uC740\uD55C \uC9C0\uD3C9 \uD5E4\uC774\uC988 ---
            const g = v / vh;
            let val = 0.05 + 0.14 * g;

         
            // --- \uAD6C\uB984: 2\uC625\uD0C0\uBE0C fBM \uBC38\uB958 \uB178\uC774\uC988, \uB369\uC5B4\uB9AC \uD615\uD0DC ---
            if (v < vh * 0.5) {
                // \uC625\uD0C0\uBE0C\uBCC4\uB85C \uB2E4\uB978 \uC18D\uB3C4\uB85C \uD758\uB7EC \u2192 \uC774\uB3D9\uD558\uBA70 \uD615\uD0DC\uAC00 \uBCC0\uD615\uB428
                let cn = noise2(u * 0.045 + cloudDrift * 0.12,
                                v * 0.09 + cloudDrift * 0.015) * 0.65
                       + noise2(u * 0.11 - cloudDrift * 0.07,
                                v * 0.22 + 40.0) * 0.35;
                // \uB192\uC774 \uAC10\uC1E0: \uC704\uCABD \uD558\uB298\uC5D0 \uBAB0\uB9AC\uACE0 \uC544\uB798\uB85C \uAC08\uC218\uB85D \uC605\uC5B4\uC9D0
                cn *= 1.0 - (v / (vh * 0.5)) * 0.7;
                // soft threshold: \uAC00\uC7A5\uC790\uB9AC\uB294 \uC605\uC740 \uC548\uAC1C, \uC911\uC2EC\uC740 \uC9C4\uD55C \uB369\uC5B4\uB9AC
                const cd = (cn - 0.38) / 0.18;
                if (cd > 0) {
                    const soft = cd > 1 ? 1 : cd * cd * (3 - 2 * cd); // smoothstep
                    const lit = 1.0 + 0.5;
                    val += soft * 0.13 * lit;
                }
            }

            // --- \uBA3C \uC5B8\uB355 \uC2E4\uB8E8\uC5E3 ---
            const hillTop = vh * 0.58
                + Math.sin(u * 0.09 + 2.0) * 5
                + Math.sin(u * 0.023) * 8;
            if (v >= hillTop) val = 0.07;

            // --- \uD480\uC232 (\uC55E\uCABD, \uBC14\uB78C\uC5D0 \uCD9C\uB801\uC774\uB294 \uC2E4\uB8E8\uC5E3) ---
            const sway = Math.sin(u * 0.3 + t * 1.8) * params.wind * 4
                       + Math.sin(u * 0.9 - t * 2.6) * params.wind * 2;
            const gh = 10 + hash(Math.floor(u / 2) * 5.3) * 16;
            const grassTop = vh - gh + sway;
            if (v >= grassTop) {
                val = 0.015;
                if (v - grassTop < 1.2) val = 0.11; // \uB2EC\uBE5B \uBC1B\uC740 \uD480\uB05D
            }

            // --- \uBC18\uB527\uBD88\uC774 (\uAC00\uC0B0 \uBC1C\uAD11, \uD480 \uC704\uC5D0\uB3C4 \uBE44\uCE68) ---
            for (let i = 0; i < n; i++) {
                const du = u - params.fu[i] * vw;
                const dv = v - params.fv[i] * vh;
                const dd = du * du + dv * dv;
                if (dd < g2 * 9) {
                    val += params.fb[i] * Math.exp(-dd / g2);
                }
            }

            display.setValue(x, y, Math.max(0, Math.min(1, val)));
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,poincar_sphere:`// ===== Patternflow pattern =====
// Title:   Poincar\xE9 Sphere
// Author:  Seunghun LEE
// Date:    2026-07-15
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Pattern: Poincar\xE9 Sphere
// Author: Collaborator
// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Knob 1: \uC704\uC0C1 \uBCC0\uD654 \uCEEC\uB7EC\uD1A4 (0.0 to 1.0)
// Knob 2: \uAD6C\uBA74 \uC790\uC804 \uC18D\uB3C4 (0.1 to 10.0)
// Knob 3: \uAD6C\uBA74 \uC704\uC120/\uACBD\uC120 \uC870\uBC00\uB3C4 (0.0 to 4.9)
// Knob 4: \uC815\uC0AC\uC601 \uC65C\uACE1 \uACE1\uB960 (0.0 to 1.0)

export function setup(params) {
    params.hue = 0.4;
    params.speed = 2.0;
    params.density = 2.5;
    params.curve = 0.5;
    params.time = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.hue = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.density = input.knobValues[2];
        params.curve = input.knobValues[3];
    }
    params.time += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.time;

    let cx = w / 2;
    let cy = h / 2;
    
    let gridCount = 2.0 + params.density * 3.0; // \uACA9\uC790 \uC870\uBC00\uB3C4
    let curvature = 0.1 + params.curve * 2.0;

    for (let y = 0; y < h; y++) {
        let dy = (y - cy) / cy; // -1.0 to 1.0
        for (let x = 0; x < w; x++) {
            let dx = (x - cx) / cy; // -w/h to w/h

            let r2 = dx * dx + dy * dy;
            
            // 3D \uAD6C\uBA74 \uC815\uC0AC\uC601 \uC65C\uACE1 \uC778\uC790
            let projectionScale = 1.0 / (1.0 + r2 * curvature);
            let sphereX = dx * projectionScale;
            let sphereY = dy * projectionScale;

            // \uC65C\uACE1 \uC88C\uD45C\uACC4 \uAE30\uBC18\uC758 \uD3C9\uD615 \uAC00\uC0C1 \uC6E8\uC774\uBE0C
            let waveU = Math.sin(sphereX * gridCount * 6.28 + t);
            let waveV = Math.sin(sphereY * gridCount * 6.28 - t * 0.7);

            // \uACA9\uC790 \uC120 \uAC80\uCD9C
            let line = Math.abs(waveU) * Math.abs(waveV);
            let r = 0, g = 0, b = 0;

            if (line < 0.15) {
                let intensity = (1.0 - line / 0.15);
                
                r = Math.floor(intensity * 128 * params.hue);
                g = Math.floor(intensity * 255 * (1.0 - params.hue));
                b = Math.floor(intensity * 255);

                if (line < 0.03) {
                    r = 255; g = 255; b = 255;
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,tri_march:`// ===== Patternflow pattern =====
// Title:   260716_TriMarch
// Author:  Seunghun LEE
// Date:    2026-07-16
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Knob 1: Triangle size \xB7 Knob 2: Speed \xB7 Knob 3: March angle \xB7 Knob 4: Color palette
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function setup(p) {
  p.tsize = 0.5; p.speed = 1.5; p.angle = 0.5; p.palette = 0.3; p.t = 0;
}

export function update(dt, input, p) {
  if (input && input.knobValues) {
    let v = input.knobValues;
    p.tsize = v[0]; p.speed = v[1]; p.angle = v[2]; p.palette = v[3];
  }
  p.t += dt * p.speed;
}

export function draw(d, p, time) {
  let w = d.width, h = d.height, t = p.t;
  let triH = 6 + p.tsize * 25;
  let triW = triH * 0.866;
  let rows = Math.ceil(h / triH);
  let cols = Math.ceil(w / triW);

  let moveX = Math.cos(p.angle * Math.PI) * t * 10;
  let moveY = Math.sin(p.angle * Math.PI) * t * 10;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let fx = (x - moveX) / triW;
      let fy = (y - moveY) / triH;
      let row = Math.floor(fy);
      let col = Math.floor(fx);
      let lx = fx - col - 0.5;
      let ly = fy - row - 0.5;
      let flip = (col + row) % 2;

      let inTri = false;
      if (flip === 0) {
        inTri = (ly < 0.3 && Math.abs(lx) * 1.8 + ly < 0.45);
      } else {
        inTri = (ly > -0.3 && Math.abs(lx) * 1.8 - ly < 0.45);
      }

      if (inTri) {
        let seed = col * 11 + row * 17;
        let brightness = Math.sin(seed * 0.5 + t * 2) * 0.4 + 0.6;
        let hue = (seed * 0.03 * p.palette + brightness * 0.2 + t * 0.05) % 1;
        let r2, g, b;
        let h6 = (hue * 6) % 6, c = brightness * 255, xc = c * (1 - Math.abs(h6 % 2 - 1));
        if (h6 < 1) { r2 = c; g = xc; b = 0; }
        else if (h6 < 2) { r2 = xc; g = c; b = 0; }
        else if (h6 < 3) { r2 = 0; g = c; b = xc; }
        else if (h6 < 4) { r2 = 0; g = xc; b = c; }
        else if (h6 < 5) { r2 = xc; g = 0; b = c; }
        else { r2 = c; g = 0; b = xc; }
        d.setPixel(x, y, Math.floor(r2), Math.floor(g), Math.floor(b));
      } else {
        d.setPixel(x, y, 0, 0, 0);
      }
    }
  }
}

// \u2500\u2500 Made with Patternflow Live Editor \xB7 https://patternflow.work/pattern \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,warped_wave:`// ===== Patternflow pattern =====
// Title:   260718_Warped Wave
// Author:  Seunghun LEE
// Date:    2026-07-18
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// Variation 4 \u2014 Warped Wave (Domain Remix)
// Full-screen concentric wave with coordinate warping \u2014 no tile grid.
// Knob 1: Hue \xB7 Knob 2: Speed \xB7 Knob 3: Warp amplitude \xB7 Knob 4: Warp frequency
function hsvToRgb(h, s, v) {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (((i % 6) + 6) % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function setup(params) {
    params.hue = 0.0;
    params.speed = 2.0;
    params.warpAmp = 0.8;   // will be set by K3
    params.warpFreq = 0.5;   // K4
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        let v = input.knobValues;
        if (!params.lastKnob) params.lastKnob = [v[0], v[1], v[2], v[3]];
        if (Math.abs(v[0] - params.lastKnob[0]) > 1e-6) params.hue = v[0];
        if (Math.abs(v[1] - params.lastKnob[1]) > 1e-6) params.speed = v[1];
        if (Math.abs(v[2] - params.lastKnob[2]) > 1e-6) params.warpAmp = v[2] * 0.25; // 0..1.225
        if (Math.abs(v[3] - params.lastKnob[3]) > 1e-6) params.warpFreq = v[3];
        params.lastKnob = [v[0], v[1], v[2], v[3]];
    }
    if (input && input.btnPressed) {
        if (input.btnPressed[0]) params.hue = 0.0;
        if (input.btnPressed[1]) params.speed = 2.0;
        if (input.btnPressed[2]) params.warpAmp = 0.2;
        if (input.btnPressed[3]) params.warpFreq = 0.5;
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let waveFreq = 15.0;
    let warpAmp = params.warpAmp;
    let warpFreqBase = 3.0 + params.warpFreq * 8.0;

    let hc = hsvToRgb(params.hue, 1.0, 1.0);

    for (let y = 0; y < h; y++) {
        let ny = (y / h - 0.5) * 2; // -1..1
        for (let x = 0; x < w; x++) {
            let nx = (x / w - 0.5) * 2;
            // warp coordinates
            let wx = nx + warpAmp * Math.sin(ny * warpFreqBase + t * 0.3);
            let wy = ny + warpAmp * Math.cos(nx * warpFreqBase * 1.3 + t * 0.4);
            let dist = Math.sqrt(wx * wx + wy * wy);
            let wave = Math.sin(dist * waveFreq + t);

            let tt = clamp((wave * 0.8 + 1.0) * 0.5, 0.0, 1.0);
            let r = 0, g = 0, b = 0;
            if (tt >= 0.154) { r = 10; g = 10; b = 10; }
            if (tt >= 0.556) {
                r = clamp(Math.floor(hc[0] * 1.5), 0, 255);
                g = clamp(Math.floor(hc[1] * 1.5), 0, 255);
                b = clamp(Math.floor(hc[2] * 1.5), 0, 255);
            }
            if (tt >= 0.816) { r = 255; g = 255; b = 255; }
            display.setPixel(x, y, r, g, b);
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,magvortex:`// ===== Patternflow pattern =====
// Title:   260719_MagVortex
// Author:  Seunghun LEE
// Date:    2026-07-19
// SPDX-License-Identifier: CC-BY-SA-4.0
// ===============================

// @knobs TrailDecay=0.5..0.98, Velocity=0.1..10, SpinPull=0..4.9, InflowPitch=-20..20
// Knob 1: Trail decay rate (higher = longer trails, more density)
// Knob 2: Simulation speed / iteration rate
// Knob 3: Rotational angular velocity around core
// Knob 4: Flow direction & strength (-20 = explode outward, 0 = pure orbits, +20 = suck inward)

export function setup(params) {
    params.velocity = 2.5;
    params.spin = 3.0;
    params.pitch = 0.0;
    params.trailDecay = 0.88;
    params.timeCount = 0.0;

    params.densityMap = new Float32Array(128 * 64);

    params.charges = [];
    for (let i = 0; i < 48; i++) {
        // Initialize based on neutral state
        let r = 10 + Math.random() * 60;
        let angle = Math.random() * Math.PI * 2;
        let xPos = 64 + Math.cos(angle) * r;
        let yPos = 32 + Math.sin(angle) * r;
        
        params.charges.push({
            r: r,
            angle: angle,
            speedProfile: 0.8 + Math.random() * 1.4,
            brightness: 0.4 + Math.random() * 0.6,
            prevX: xPos,
            prevY: yPos
        });
    }
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.trailDecay = input.knobValues[0];
        params.velocity = input.knobValues[1];
        params.spin = input.knobValues[2];
        params.pitch = input.knobValues[3];
    }
    
    if (input && input.btnPressed) {
        if (input.btnPressed[0]) params.trailDecay = 0.88;
        if (input.btnPressed[1]) params.velocity = 2.5;
        if (input.btnPressed[2]) params.spin = 3.0;
        if (input.btnPressed[3]) params.pitch = 0.0;
    }

    let decay = params.trailDecay;
    for (let i = 0; i < 128 * 64; i++) {
        params.densityMap[i] *= decay;
    }

    let tStep = params.velocity * dt * 4.0;
    let cx = 64, cy = 32;

    for (let i = 0; i < params.charges.length; i++) {
        let c = params.charges[i];
        
        // Store previous position
        c.prevX = cx + Math.cos(c.angle) * c.r;
        c.prevY = cy + Math.sin(c.angle) * c.r;

        // Update orbit
        c.angle += (params.spin * 0.4) * c.speedProfile * tStep;
        
        // Flow direction: positive = inward, negative = outward
        c.r -= (params.pitch * 6.0) * tStep;

        // Reset logic depends on flow direction
        if (params.pitch > 0.01) {
            // Inward flow: particles get sucked to center, respawn at edge
            if (c.r < 3.0) {
                c.r = 55 + Math.random() * 35;
                c.angle = Math.random() * Math.PI * 2;
                c.prevX = cx + Math.cos(c.angle) * c.r;
                c.prevY = cy + Math.sin(c.angle) * c.r;
            }
        } else if (params.pitch < -0.01) {
            // Outward flow: particles explode from center, respawn at center
            if (c.r > 90.0) {
                c.r = 2 + Math.random() * 5;
                c.angle = Math.random() * Math.PI * 2;
                c.prevX = cx + Math.cos(c.angle) * c.r;
                c.prevY = cy + Math.sin(c.angle) * c.r;
            }
        } else {
            // Neutral: orbit freely, reset if out of bounds either way
            if (c.r < 3.0 || c.r > 90.0) {
                c.r = 30 + Math.random() * 40;
                c.angle = Math.random() * Math.PI * 2;
                c.prevX = cx + Math.cos(c.angle) * c.r;
                c.prevY = cy + Math.sin(c.angle) * c.r;
            }
        }

        // Current position
        let curX = cx + Math.cos(c.angle) * c.r;
        let curY = cy + Math.sin(c.angle) * c.r;
        
        // Interpolate trail
        let dx = curX - c.prevX;
        let dy = curY - c.prevY;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let steps = Math.max(1, Math.ceil(dist));
        
        for (let s = 0; s <= steps; s++) {
            let frac = s / steps;
            let px = Math.floor(c.prevX + dx * frac);
            let py = Math.floor(c.prevY + dy * frac);
            
            if (px >= 0 && px < 128 && py >= 0 && py < 64) {
                params.densityMap[py * 128 + px] = Math.min(1.0, 
                    params.densityMap[py * 128 + px] + c.brightness * 0.7);
            }
        }
    }
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let val = params.densityMap[y * 128 + x];
            
            let v = 0.0;
            
            if (val > 0.001) {
                if (val < 0.15) {
                    v = 0.06 + val * 0.6;
                } else if (val < 0.45) {
                    v = 0.2 + (val - 0.15) * 1.3;
                } else if (val < 0.75) {
                    v = 0.55 + (val - 0.45) * 1.5;
                } else {
                    v = 0.85 + (val - 0.75) * 2.0;
                }
                v = Math.min(1.0, Math.max(0.0, v));
            } else {
                v = 0.02;
            }
            
            display.setValue(x, y, v);
        }
    }
}

// \u2500\u2500 Made with Patternflow Pattern Lab \xB7 https://patternflow.work/pattern-lab \u2500\u2500
// Shared under CC-BY-SA-4.0. Attribution is part of this licence \u2014
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,a_big_hit:`// Pattern: a big hit
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-11
// Lineage: AI generated and curated
//
// Liquid plasma with chaos-warped neon ridges
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
}`};function E(i){return(i[1]-i[0])/2}var m=[[0,1],[.1,10],[0,4.9],[0,1]];var x=[!0,!1,!1,!0];function v(i=m){return m.map((a,n)=>E(i[n]??a))}var V=/^[ \t]*\/\/[ \t]*@knobs[ \t]+(.+)$/m,D=["Knob 1","Knob 2","Knob 3","Knob 4"];function w(i){let a=[...D],n=m.map(([r,o])=>[r,o]),e=n.map(([r,o])=>Number(((r+o)/2).toFixed(3))),t=i.match(V);return t&&t[1].split(",").slice(0,4).forEach((r,o)=>{let s=r.trim();if(!s||s==="-")return;let l=s.match(/^(.+?)\s*=\s*(-?\d*\.?\d+)\s*\.\.\s*(-?\d*\.?\d+)$/);if(!l)return;let c=Number(l[2]),h=Number(l[3]);!Number.isFinite(c)||!Number.isFinite(h)||h<=c||(a[o]=l[1].trim().slice(0,14),n[o]=[c,h],e[o]=Number(((c+h)/2).toFixed(3)))}),{labels:a,ranges:n,values:e}}var I={width:128,height:64};var q=8,K=512,_=/^[ \t]*\/\/[ \t]*@matrix[ \t]+(\d{1,4})[ \t]*[x×*][ \t]*(\d{1,4})[ \t]*$/m;function M(i){if(!Number.isFinite(i))return null;let a=Math.round(i);return a<q||a>K?null:a}var O=8192*4;function B(i){let a=i.match(_);if(!a)return null;let n=M(Number(a[1])),e=M(Number(a[2]));return n===null||e===null?null:{width:n,height:e}}function k(i){return B(i)??I}function S(i){return i.width>i.height?"landscape":i.height>i.width?"portrait":"square"}var A=typeof p>"u"?{}:p;var u=class{constructor(a,n){this.code="";this.values=[.5,.5,.5,.5];this.ranges=[[0,1],[0,1],[0,1],[0,1]];this.wrap=[!1,!1,!1,!1];this.unitsPerTurn=[1,1,1,1];this.running=!1;this.timers=[];this.onStatus=n,this.frame=document.createElement("iframe"),this.frame.src=a,this.frame.setAttribute("sandbox","allow-scripts"),this.frame.setAttribute("title","Pattern preview"),this.frame.setAttribute("scrolling","no"),this.frame.style.cssText="border:0;width:100%;height:100%;display:block;pointer-events:none;background:#000",this.frame.addEventListener("load",()=>this.sendLoad())}get element(){return this.frame}connect(){this.listener=a=>{if(a.source!==this.frame.contentWindow)return;let n=a.data;n?.type==="pf-ready"?this.sendLoad():n?.type==="pf-status"&&this.onStatus?.({ok:!!n.ok,error:n.error})},window.addEventListener("message",this.listener),this.timers=[0,50,200].map(a=>window.setTimeout(()=>this.sendLoad(),a))}disconnect(){this.listener&&window.removeEventListener("message",this.listener),this.listener=void 0,this.timers.forEach(a=>window.clearTimeout(a)),this.timers=[]}load(a,n,e,t,r){if(a===this.code){this.setKnobs(n,e);return}this.code=a,this.values=n,this.ranges=e,this.wrap=t,this.unitsPerTurn=r,this.sendLoad()}setKnobs(a,n){this.values=a,this.ranges=n,this.post({type:"pf-knobs",values:a,ranges:n})}setRunning(a){a!==this.running&&(this.running=a,this.post({type:"pf-run",running:a}))}sendLoad(){this.code&&this.post({type:"pf-load",code:this.code,knobValues:this.values,knobRanges:this.ranges,knobWrap:this.wrap,knobUnitsPerTurn:this.unitsPerTurn,running:this.running})}post(a){this.frame.contentWindow?.postMessage(a,"*")}};var P=`
:host {
  display: block;
}

ha-card {
  overflow: hidden;
}

.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 2;
  max-height: 420px;
  margin: 0 auto;
  background: #000;
  /* The preview is the only part that swallows gestures. Making the whole card
     a dead zone would turn it into a scroll trap on a phone, which is exactly
     what the community site's wall had to solve with its own wheel handler. */
  touch-action: none;
  cursor: ns-resize;
  user-select: none;
}

.stage.landscape {
  aspect-ratio: 2 / 1;
  cursor: ns-resize;
}

.stage.asleep .frame,
.stage.asleep .still {
  opacity: 0.12;
  filter: grayscale(1);
}

.frame,
.still {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition: opacity 150ms ease-out;
}

.still {
  display: grid;
  place-items: center;
  color: var(--secondary-text-color, #8a8272);
  font-size: 0.8rem;
  text-align: center;
  padding: 1rem;
  line-height: 1.5;
}

/* Four vertical bands over the preview, one per encoder. Shown only while a
   pointer is on the stage, so the pattern is unobstructed the rest of the
   time \u2014 the card is a picture first. */
.zones {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  opacity: 0;
  transition: opacity 120ms ease-out;
  pointer-events: none;
}

.stage.touched .zones {
  opacity: 1;
}

.zone {
  border-right: 1px solid rgba(237, 231, 219, 0.12);
}

.zone:last-child {
  border-right: 0;
}

.zone.active {
  background: linear-gradient(
    to top,
    rgba(237, 231, 219, 0.16),
    rgba(237, 231, 219, 0.02)
  );
}

/* The readout dodges to whichever half the pointer is not in. */
.readout {
  position: absolute;
  left: 0;
  right: 0;
  padding: 0.5rem 0.7rem;
  background: rgba(12, 11, 9, 0.82);
  backdrop-filter: blur(6px);
  color: #ede7db;
  opacity: 0;
  transition: opacity 120ms ease-out;
  pointer-events: none;
  font-size: 0.75rem;
}

.stage.touched .readout {
  opacity: 1;
}

.readout.top {
  top: 0;
}

.readout.bottom {
  bottom: 0;
}

.readout-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.readout-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readout-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.track {
  height: 3px;
  background: rgba(237, 231, 219, 0.18);
  border-radius: 2px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: #ede7db;
  transition: width 80ms linear;
}

.badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(12, 11, 9, 0.72);
  color: #8a8272;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  pointer-events: none;
}

.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--primary-text-color);
}

.subtitle {
  color: var(--secondary-text-color);
  font-size: 0.75rem;
  font-weight: 400;
}

.patterns {
  max-height: 13rem;
  overflow-y: auto;
  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
}

.pattern {
  display: block;
  width: 100%;
  padding: 0.55rem 1rem;
  border: 0;
  background: none;
  color: var(--primary-text-color);
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.pattern:hover {
  background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
}

.pattern.current {
  color: var(--primary-color);
  font-weight: 600;
}

.notice {
  padding: 0.7rem 1rem;
  color: var(--error-color, #b3261e);
  font-size: 0.8rem;
}
`;var d=4,T=150,z="/patternflow_static/pattern-sandbox.html";function b(i,a){if(a.switch_entity||a.select_entity||a.knob_entities)return{switchId:a.switch_entity,selectId:a.select_entity,knobIds:a.knob_entities??[]};let n=i.entities??{},e=Object.values(n).filter(s=>s.platform==="patternflow"),t=a.device_id??e.find(s=>s.device_id)?.device_id,r=e.filter(s=>!t||s.device_id===t),o=r.filter(s=>s.entity_id.startsWith("number.")).sort((s,l)=>C(i,s.entity_id)-C(i,l.entity_id)).map(s=>s.entity_id);return{switchId:r.find(s=>s.entity_id.startsWith("switch."))?.entity_id,selectId:r.find(s=>s.entity_id.startsWith("select."))?.entity_id,knobIds:o}}function C(i,a){let n=i.states[a]?.attributes?.knob;return typeof n=="number"?n:Number.MAX_SAFE_INTEGER}function R(i){if(!i)return null;let a=Number(i.state);return Number.isFinite(a)?a:null}var f=class extends HTMLElement{constructor(){super();this.config={type:"custom:patternflow-card"};this.zones=[];this.mounted=!1;this.code="";this.slug=null;this.labels=["K1","K2","K3","K4"];this.ranges=[[0,1],[0,1],[0,1],[0,1]];this.local=[50,50,50,50];this.dragging=null;this.dragStartValue=0;this.dragStartY=0;this.active=0;this.lastSentAt=[0,0,0,0];this.pending=[null,null,null,null];this.timers=[null,null,null,null];this.root=this.attachShadow({mode:"open"})}setConfig(n){this.config={preview:!0,show_patterns:!0,...n},this.mounted=!1,this.root.innerHTML=""}set hass(n){this.hassRef=n,this.mounted||this.build(),this.update()}getCardSize(){return this.config.show_patterns?12:8}static getStubConfig(n){return{type:"custom:patternflow-card",device_id:Object.values(n.entities??{}).find(t=>t.platform==="patternflow"&&t.device_id)?.device_id}}static getConfigElement(){return document.createElement("patternflow-card-editor")}disconnectedCallback(){this.sandbox?.disconnect(),this.timers.forEach(n=>n!==null&&window.clearTimeout(n))}build(){let n=document.createElement("style");n.textContent=P;let e=document.createElement("ha-card");e.innerHTML=`
      <div class="stage" part="stage">
        <div class="still">loading\u2026</div>
        <div class="zones">
          ${Array.from({length:d},()=>'<div class="zone"></div>').join("")}
        </div>
        <div class="readout bottom">
          <div class="readout-row">
            <span class="readout-label"></span>
            <span class="readout-value"></span>
          </div>
          <div class="track"><div class="fill"></div></div>
        </div>
        <span class="badge" hidden></span>
      </div>
      <div class="head">
        <span class="title"></span>
        <ha-switch class="power"></ha-switch>
      </div>
      <div class="patterns"></div>
      <div class="notice" hidden></div>
    `,this.root.append(n,e),this.stage=e.querySelector(".stage"),this.zones=Array.from(e.querySelectorAll(".zone")),this.readout=e.querySelector(".readout"),this.attachGestures(),this.attachPower(e),this.mounted=!0}attachPower(n){n.querySelector(".power").addEventListener("change",()=>{let{switchId:t}=b(this.hassRef,this.config);t&&this.hassRef?.callService("switch","toggle",{entity_id:t})})}attachGestures(){let n=this.stage;n.addEventListener("pointerdown",t=>{this.knobsUsable()&&(n.setPointerCapture(t.pointerId),n.classList.add("touched"),this.active=this.zoneAt(t),this.dragging=this.active,this.dragStartValue=this.local[this.active],this.dragStartY=t.clientY,this.dodge(t),this.paintOverlay())}),n.addEventListener("pointermove",t=>{if(this.dragging===null){t.pointerType==="mouse"&&(n.classList.add("touched"),this.active=this.zoneAt(t),this.dodge(t),this.paintOverlay());return}let r=(this.dragStartY-t.clientY)/n.clientHeight;this.setLocal(this.dragging,this.dragStartValue+r*100),this.dodge(t)});let e=t=>{if(this.dragging===null)return;let r=this.dragging;this.dragging=null,n.hasPointerCapture(t.pointerId)&&n.releasePointerCapture(t.pointerId),this.flush(r,!0),t.pointerType!=="mouse"&&n.classList.remove("touched")};n.addEventListener("pointerup",e),n.addEventListener("pointercancel",e),n.addEventListener("pointerleave",()=>{this.dragging===null&&n.classList.remove("touched")}),n.addEventListener("wheel",t=>{this.knobsUsable()&&(t.preventDefault(),this.active=this.zoneAt(t),this.setLocal(this.active,this.local[this.active]+(t.deltaY<0?4:-4)))},{passive:!1}),n.addEventListener("dblclick",t=>{if(!this.knobsUsable())return;let r=this.zoneAt(t);this.setLocal(r,50),this.flush(r,!0)})}zoneAt(n){let e=this.stage.getBoundingClientRect(),t=(n.clientX-e.left)/e.width;return Math.max(0,Math.min(d-1,Math.floor(t*d)))}dodge(n){let e=this.stage.getBoundingClientRect(),t=(n.clientY-e.top)/e.height;t>.55?this.readout.classList.replace("bottom","top"):t<.45&&this.readout.classList.replace("top","bottom")}knobsUsable(){let{knobIds:n}=b(this.hassRef,this.config);return n.length===d}setLocal(n,e){this.local[n]=Math.max(0,Math.min(100,e)),this.paintOverlay(),this.pushKnobsToSandbox(),this.scheduleWrite(n)}scheduleWrite(n){this.pending[n]=this.local[n];let e=performance.now()-this.lastSentAt[n];if(e>=T){this.flush(n);return}this.timers[n]===null&&(this.timers[n]=window.setTimeout(()=>this.flush(n),T-e))}flush(n,e=!1){let t=this.timers[n];t!==null&&(window.clearTimeout(t),this.timers[n]=null);let r=e?this.local[n]:this.pending[n];if(r===null)return;this.pending[n]=null,this.lastSentAt[n]=performance.now();let{knobIds:o}=b(this.hassRef,this.config),s=o[n];s&&this.hassRef?.callService("number","set_value",{entity_id:s,value:Math.round(r)}).catch(l=>this.showNotice(String(l)))}update(){let n=this.hassRef;if(!n||!this.mounted)return;let{switchId:e,selectId:t,knobIds:r}=b(n,this.config),o=t?n.states[t]:void 0,s=e?n.states[e]:void 0;if(!o&&!s){this.showNotice("No Patternflow entities found. Set device_id, or the entities, in the card configuration.");return}this.showNotice(null),this.dragging===null&&r.forEach((c,h)=>{let y=R(n.states[c]);y!==null&&this.pending[h]===null&&(this.local[h]=y)}),this.applyPattern(o),this.paintHead(o,s),this.paintOverlay(),this.paintPatterns(o);let l=s?.state==="off";this.stage?.classList.toggle("asleep",l),this.sandbox?.setRunning(!l&&this.config.preview!==!1)}applyPattern(n){let e=n?.attributes?.slug??null,t=n?.attributes?.knob_labels;if(Array.isArray(t)&&t.length===d&&(this.labels=t.map(String)),e===this.slug)return;this.slug=e;let r=e?A[e]??"":"";if(this.code=r,!r||this.config.preview===!1){this.sandbox?.disconnect(),this.sandbox?.element.remove(),this.sandbox=void 0,this.setStill(e?"No preview bundled for this pattern":"Presets have no preview \u2014 the controls still work");return}let o=w(r);this.ranges=o.ranges,this.labels=o.labels;let s=S(k(r))==="landscape";this.stage?.classList.toggle("landscape",s),this.sandbox||(this.sandbox=new u(z,l=>{l.ok||this.setStill(l.error??"This pattern did not load")}),this.sandbox.element.classList.add("frame"),this.stage?.prepend(this.sandbox.element),this.sandbox.connect()),this.setStill(null),this.sandbox.load(r,this.patternUnits(),this.ranges,[...x],v(this.ranges))}patternUnits(){return this.local.map((n,e)=>{let[t,r]=this.ranges[e]??[0,1];return t+n/100*(r-t)})}pushKnobsToSandbox(){this.sandbox?.setKnobs(this.patternUnits(),this.ranges)}paintHead(n,e){let t=this.root.querySelector(".title"),r=this.root.querySelector(".power"),o=this.root.querySelector(".badge"),s=n?.state??"\u2014";t.textContent=s,e&&(r.checked=e.state==="on");let l=!!n?.attributes?.absolute_ready;o.hidden=!n,o.textContent=l?"absolute":"relative"}paintOverlay(){this.zones.forEach((o,s)=>o.classList.toggle("active",s===this.active));let n=this.root.querySelector(".readout-label"),e=this.root.querySelector(".readout-value"),t=this.root.querySelector(".fill"),r=this.labels[this.active]??`K${this.active+1}`;n.textContent=r===`K${this.active+1}`?r:`K${this.active+1} ${r}`,e.textContent=`${Math.round(this.local[this.active])}%`,t.style.width=`${Math.round(this.local[this.active])}%`}paintPatterns(n){let e=this.root.querySelector(".patterns");if(this.config.show_patterns===!1||!n){e.hidden=!0;return}e.hidden=!1;let t=n.attributes.options??[],r=n.state,o=`${t.join("\0")}${r}`;e.dataset.signature!==o&&(e.dataset.signature=o,e.innerHTML="",t.forEach(s=>{let l=document.createElement("button");l.type="button",l.className=s===r?"pattern current":"pattern",l.textContent=s,l.addEventListener("click",()=>{this.hassRef?.callService("select","select_option",{entity_id:n.entity_id,option:s})}),e.append(l)}))}setStill(n){let e=this.root.querySelector(".still");e.hidden=n===null,n!==null&&(e.textContent=n)}showNotice(n){let e=this.root.querySelector(".notice");e.hidden=n===null,n!==null&&(e.textContent=n)}};var g=class extends HTMLElement{constructor(){super();this.config={type:"custom:patternflow-card"};this.root=this.attachShadow({mode:"open"})}setConfig(n){this.config=n,this.render()}set hass(n){this.hassRef=n,this.render()}devices(){let n=this.hassRef;if(!n)return[];let e=new Set;for(let t of Object.values(n.entities??{}))t.platform==="patternflow"&&t.device_id&&e.add(t.device_id);return[...e].map(t=>({id:t,label:n.devices?.[t]?.name_by_user??n.devices?.[t]?.name??t}))}emit(n){this.config={...this.config,...n},this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this.config},bubbles:!0,composed:!0}))}render(){let n=this.devices(),e=this.config.device_id??n[0]?.id??"";this.root.innerHTML=`
      <style>
        .row { display: flex; align-items: center; gap: .75rem; padding: .5rem 0; }
        label { flex: 1; color: var(--primary-text-color); }
        select { padding: .35rem; }
        .hint { color: var(--secondary-text-color); font-size: .8rem; padding-bottom: .5rem; }
      </style>
      <div class="row">
        <label for="device">Device</label>
        <select id="device">
          ${n.length?n.map(t=>`<option value="${t.id}"${t.id===e?" selected":""}>${t.label}</option>`).join(""):'<option value="">No Patternflow device set up</option>'}
        </select>
      </div>
      <div class="row">
        <label for="preview">Run the pattern in the card</label>
        <input type="checkbox" id="preview"${this.config.preview!==!1?" checked":""}>
      </div>
      <div class="hint">
        The preview runs the pattern's own code in this browser, sandboxed. The panel is
        never asked for pixels \u2014 it cannot spare them.
      </div>
      <div class="row">
        <label for="patterns">Show the installed patterns</label>
        <input type="checkbox" id="patterns"${this.config.show_patterns!==!1?" checked":""}>
      </div>
    `,this.root.querySelector("#device")?.addEventListener("change",t=>{this.emit({device_id:t.target.value})}),this.root.querySelector("#preview")?.addEventListener("change",t=>{this.emit({preview:t.target.checked})}),this.root.querySelector("#patterns")?.addEventListener("change",t=>{this.emit({show_patterns:t.target.checked})})}};customElements.get("patternflow-card")||customElements.define("patternflow-card",f);customElements.get("patternflow-card-editor")||customElements.define("patternflow-card-editor",g);window.customCards=window.customCards??[];window.customCards.push({type:"patternflow-card",name:"Patternflow",description:"The running pattern, its four knobs, and the panel switch.",preview:!0,documentationURL:"https://github.com/engmung/Patternflow/tree/main/integrations/homeassistant"});
