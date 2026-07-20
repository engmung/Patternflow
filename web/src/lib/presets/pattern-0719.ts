import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0719",
  num: 719,
  name: "0719",
  desc: "Magnetic particle orbit simulation with trails",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-07-19",
  lineage: "AI generated and curated via Pattern Lab",
  labOnly: true,
  code: `// ===== Patternflow pattern =====
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

// ── Made with Patternflow Pattern Lab · https://patternflow.work/pattern-lab ──
// Shared under CC-BY-SA-4.0. Attribution is part of this licence —
// please keep this notice and the author credit above when you reuse,
// remix, or redistribute this pattern. Do not delete it.
`,
};
