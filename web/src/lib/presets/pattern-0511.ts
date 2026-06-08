import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0511",
  num: 511,
  name: "0511",
  desc: "Sliding segmented rows with dynamic glitches",
  code: `// 5. Sliding Segmented Rows (Kinetic/Ticker/Glitch Foundation)
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
}`,
};
