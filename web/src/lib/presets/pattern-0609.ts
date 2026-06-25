import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0609",
  num: 609,
  name: "0609",
  desc: "Molten Magma Heat-Map with cooling crusts",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-06-09",
  lineage: "AI generated and curated",
  code: `// Pattern: 0609
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-06-09
// Lineage: AI generated and curated
//
// Molten Magma Heat-Map — Emulates thermal energy color bands where bright hotspots cooling down leave dark crusts.
// Knob 1: Thermal Fluid Viscosity (0.0 to 1.0)
// Knob 2: Boiling Flow Speed (0.1 to 10.0)
// Knob 3: Hotspot Core Expansion (0.0 to 4.9)
// Knob 4: Cool Crust Fracturing (0.0 to 1.0)

export function setup(params) {
    params.viscosity = 0.5;
    params.speed = 2.0;
    params.expansion = 2.0;
    params.crust = 0.4;
    params.timeAcc = 0.0;
}

export function update(dt, input, params) {
    if (input && input.knobValues) {
        params.viscosity = input.knobValues[0];
        params.speed = input.knobValues[1];
        params.expansion = input.knobValues[2];
        params.crust = input.knobValues[3];
    }
    params.timeAcc += dt * params.speed;
}

export function draw(display, params, time) {
    let w = display.width;
    let h = display.height;
    let t = params.timeAcc;

    let visc = 0.02 + params.viscosity * 0.08;
    let coreShift = params.expansion - 2.5;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            
            // Multiple layers of wave signals create fluid thermal paths
            let n1 = Math.sin(x * visc + t) * Math.cos(y * visc - t);
            let n2 = Math.sin((x - w/2) * 0.05 - t * 0.4) * Math.sin((y - h/2) * 0.05 + t * 0.6);
            let n3 = Math.cos(Math.sqrt((x-w/2)*(x-w/2) + (y-h/2)*(y-h/2)) * 0.1 - t * 1.5);

            let heatSum = (n1 + n2 * 0.7 + n3 * 0.5) / 2.2;
            heatSum = heatSum + coreShift * 0.3; // Manual shift balancing
            let temp = Math.max(0.0, Math.min(1.0, (heatSum + 1.0) * 0.5));

            let r = 0, g = 0, b = 0;

            // Heat map color palette step assignments
            if (temp > 0.85) {
                // Incandescent Superhot White Core
                r = 255; g = 255; b = 230;
            } else if (temp > 0.65) {
                // Liquid Yellow Plasma
                r = 255; g = 180 + Math.floor((temp - 0.65) * 375); b = 20;
            } else if (temp > 0.4) {
                // Flowing Viscous Orange-Red
                r = 220; g = Math.floor((temp - 0.4) * 700); b = 5;
            } else if (temp > 0.18) {
                // Deep Cooled Dormant Crimson
                r = 40 + Math.floor((temp - 0.18) * 800); g = 0; b = 0;
            } else {
                // Charcoal Rock Base
                r = 10; g = 5; b = 15;
            }

            // Introduce cool surface fractures/cracking maps
            if (params.crust > 0.05) {
                let crackPattern = Math.sin(x * 1.5) * Math.cos(y * 1.5);
                if (crackPattern > 1.0 - params.crust && temp < 0.6) {
                    // Reduce thermal radiation, exposing dark deep cracks
                    r = Math.floor(r * 0.15);
                    g = 0;
                    b = Math.floor(b * 0.1);
                }
            }

            display.setPixel(x, y, r, g, b);
        }
    }
}`,
};
