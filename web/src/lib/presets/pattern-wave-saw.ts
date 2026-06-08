import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "wave-saw",
  num: 2,
  name: "Wave Saw",
  desc: "Rotated sawtooth waves with fractal noise distortion",
  code: `// Wave Saw — rotated sawtooth bands with a 3-step constant color ramp.
// Knob 1: Angle (0..1 -> 0..2PI) · Knob 2: Scale (band density) · Knob 3: Distortion · Knob 4: Distortion scale
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
}`,
};
