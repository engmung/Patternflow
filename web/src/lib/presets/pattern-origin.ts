import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "origin",
  num: 1,
  name: "Origin",
  desc: "Concentric sine waves sampled by an emergent grid",
  code: `// Origin — concentric sine waves sampled by an emergent tile grid.
// Knob 1: Hue (0..1) · Knob 2: Speed · Knob 3: Mode/tiling (0..4) · Knob 4: Frequency
// Encoder button (short press): resets that knob to its origin value.
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

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function setup(params) {
    params.hue = 0.0;
    params.speed = 2.0;
    params.mode = 0.0;
    params.freq = 0.06;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    // Knobs set absolute values, but only follow a slider while it is
    // actually moving — that way a button reset persists until the knob
    // is touched again, just like the hardware encoders.
    if (input && input.knobValues) {
        let v = input.knobValues;
        if (!params.lastKnob) params.lastKnob = [v[0], v[1], v[2], v[3]];
        if (Math.abs(v[0] - params.lastKnob[0]) > 1e-6) params.hue = v[0];
        if (Math.abs(v[1] - params.lastKnob[1]) > 1e-6) params.speed = v[1];
        if (Math.abs(v[2] - params.lastKnob[2]) > 1e-6) params.mode = v[2];
        if (Math.abs(v[3] - params.lastKnob[3]) > 1e-6) params.freq = v[3];
        params.lastKnob = [v[0], v[1], v[2], v[3]];
    }

    // Encoder button (short press): reset that knob to its origin value.
    if (input && input.btnPressed) {
        if (input.btnPressed[0]) params.hue = 0.0;
        if (input.btnPressed[1]) params.speed = 0.0;
        if (input.btnPressed[2]) params.mode = 0.0;
        if (input.btnPressed[3]) params.freq = 0.0;
    }

    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let mode = Math.floor(clamp(params.mode, 0.0, 4.0));
    let rows, cols, gap, tileSize, gridStep, gridCells;
    if (mode === 0) { rows = 1; cols = 2; gap = 4; tileSize = 56; gridStep = 7; gridCells = 8; }
    else if (mode === 1) { rows = 2; cols = 4; gap = 3; tileSize = 27; gridStep = 3; gridCells = 9; }
    else if (mode === 2) { rows = 3; cols = 6; gap = 2; tileSize = 18; gridStep = 3; gridCells = 6; }
    else if (mode === 3) { rows = 3; cols = 6; gap = 2; tileSize = 18; gridStep = 2; gridCells = 9; }
    else { rows = 6; cols = 12; gap = 0; tileSize = 10; gridStep = 2; gridCells = 5; }

    let totalW = cols * tileSize + (cols + 1) * gap;
    let totalH = rows * tileSize + (rows + 1) * gap;
    let offsetX = Math.floor((w - totalW) / 2);
    let offsetY = Math.floor((h - totalH) / 2);

    let cellW = tileSize + gap;
    let cellH = tileSize + gap;
    let cx = tileSize / 2;

    let knobFreqBase = 50.0 + params.freq * 950.0;
    let knobFreqVar = params.freq * 1000.0;

    let hc = hsvToRgb(params.hue, 1.0, 1.0);

    for (let y = 0; y < h; y++) {
        let py = y - offsetY;
        for (let x = 0; x < w; x++) {
            let px = x - offsetX;
            let r = 0, g = 0, b = 0;

            let ti = Math.floor((px - gap) / cellW);
            let tj = Math.floor((py - gap) / cellH);

            if (ti >= 0 && ti < cols && tj >= 0 && tj < rows) {
                let localX = px - (gap + ti * cellW);
                let localY = py - (gap + tj * cellH);

                if (localX >= 0 && localX < tileSize && localY >= 0 && localY < tileSize) {
                    let gx = Math.min(Math.floor(localX / gridStep), gridCells - 1);
                    let gy = Math.min(Math.floor(localY / gridStep), gridCells - 1);

                    let sx = gx * gridStep + gridStep / 2;
                    let sy = gy * gridStep + gridStep / 2;
                    let dx = sx - cx;
                    let dy = sy - cx;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    let tileFreq = knobFreqBase + (tj * cols + ti) * knobFreqVar * 0.15;
                    let wave = Math.sin(dist * tileFreq * 0.5 + t * 2.0);

                    let tt = clamp((wave * 0.8 + 1.0) * 0.5, 0.0, 1.0);

                    // 3-step ramp: dim base -> hue glow -> white core
                    if (tt >= 0.154) { r = 10; g = 10; b = 10; }
                    if (tt >= 0.556) {
                        r = clamp(Math.floor(hc[0] * 1.5), 0, 255);
                        g = clamp(Math.floor(hc[1] * 1.5), 0, 255);
                        b = clamp(Math.floor(hc[2] * 1.5), 0, 255);
                    }
                    if (tt >= 0.816) { r = 255; g = 255; b = 255; }
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
