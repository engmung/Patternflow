import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0519-1",
  num: 519.01,
  name: "0519-1",
  desc: "Organic isocontours with dynamic feedback",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-19",
  lineage: "AI generated and curated",
  code: `// Pattern: 0519-1
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
}`,
};
