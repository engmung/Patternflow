import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0517",
  num: 517,
  name: "0517",
  desc: "Sweeping scan beams",
  author: "Seunghun LEE",
  license: "CC-BY-SA-4.0",
  date: "2026-05-17",
  lineage: "AI generated and curated",
  code: `// Pattern: 0517
// Author: Seunghun LEE
// SPDX-License-Identifier: CC-BY-SA-4.0
// Date: 2026-05-17
// Lineage: AI generated and curated
//
// Knob 1: Beam Thickness (Width of the sweeping scan)
// Knob 2: Rotation Speed (How fast the radar sweeps)
// Knob 3: Noise Turbulence (How much the sweep is distorted)
// Knob 4: Highlight Color (Hue of the leading edge)

function hsvToRgb(h, s, v) {
  h = h - Math.floor(h); 
  let i = Math.floor(h * 6); 
  let f = h * 6 - i;
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
  return [Math.floor(r*255), Math.floor(g*255), Math.floor(b*255)];
}

function hash21(x,y){let n=Math.sin(x*12.9898+y*78.233)*43758.5453;return n-Math.floor(n);}
function noise2D(x,y){let ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy; 
  let ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  let a=hash21(ix,iy),b=hash21(ix+1,iy),c=hash21(ix,iy+1),d=hash21(ix+1,iy+1);
  return (a*(1-ux)+b*ux)*(1-uy)+(c*(1-ux)+d*ux)*uy;
}
function fbm(x,y,t,oct){let v=0,amp=1,freq=1;for(let i=0;i<oct;i++){v+=amp*noise2D(x*freq,y*freq+t*0.4);freq*=2;amp*=0.5;}return v;}

export function setup(params) {
  params.timeAcc = 0;
  params.thickness = 0.5;
  params.speed = 0.5;
  params.turbulence = 0.5;
  params.baseHue = 0.5;
}

export function update(dt, input, params) {
  if (input && input.knobValues) {
    params.thickness = 0.1 + input.knobValues[0] * 0.6;
    params.speed = input.knobValues[1];
    params.turbulence = input.knobValues[2] * 2.0;
    params.baseHue = input.knobValues[3];
  }
  params.timeAcc += dt * (1.0 + params.speed * 4.0);
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  let t = params.timeAcc;
  let cx = w / 2;
  let cy = h / 2;

  // Global rotation angle
  let sweepAngle = (t * 0.5) % (Math.PI * 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx = x - cx;
      let dy = y - cy;
      
      // Base polar angle of the pixel
      let pixelAngle = Math.atan2(dy, dx);
      if (pixelAngle < 0) pixelAngle += Math.PI * 2;
      
      // Calculate noise to displace the angle
      let displacement = fbm(x * 0.03, y * 0.03, t * 0.2, 3);
      displacement = (displacement - 0.5) * params.turbulence;
      
      // Compare pixel angle (plus noise) to the sweep angle
      let angleDiff = sweepAngle - (pixelAngle + displacement);
      
      // Wrap difference to 0 -> 2PI range
      while (angleDiff < 0) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;
      
      let brightness = 0;
      let saturation = 1.0;
      let hue = params.baseHue;
      
      // Render the beam tail
      if (angleDiff < params.thickness * Math.PI) {
        // Normalize position within the beam (0.0 = leading edge, 1.0 = trailing edge)
        let beamPos = angleDiff / (params.thickness * Math.PI);
        brightness = Math.pow(1.0 - beamPos, 2.0); // Exponential fade out
        
        // Leading edge gets hot/white, trailing edge cools to saturated color
        saturation = beamPos * 1.5; 
        hue = params.baseHue + (1.0 - beamPos) * 0.2; // Shift hue near the edge
      }
      
      // Add a slight ambient glow based on raw noise
      brightness += Math.max(0, displacement * 0.3);

      let rgb = hsvToRgb(hue, Math.min(1, saturation), Math.min(1, brightness));
      display.setPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}`,
};
