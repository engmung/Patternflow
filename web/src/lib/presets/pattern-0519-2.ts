import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0519-2",
  num: 519.02,
  name: "0519-2",
  desc: "Glitch typography on matrix grid",
  code: `// Knobs for Glitch Typography:
// Knob 1: Glitch Preset (10 distinct modes: 0.0=Clean to 1.0=Meltdown)
// Knob 2: Overall Pattern Speed (Animation speed of background, 0.1 - 10.0)
// Knob 3: Motif Density (Scale of the underlying shapes, 0.0 - 4.9)
// Knob 4: Chromatic Aberration (RGB channel splitting width, 0.0 - 1.0)

export function setup(params) {
  params.patternTime = 0;  
  params.glitchTime = 0;   
}

export function update(dt, input, params) {
  let speed = input && input.knobValues ? input.knobValues[1] : 2.0;
  params.patternTime += dt * speed;
  params.glitchTime += dt * 2.0; 

  if (input && input.knobValues && input.knobNormalized) {
    // Convert 0.0-1.0 into exactly 10 discrete integer states: 0 to 9
    params.glitchPreset = Math.floor(input.knobNormalized[0] * 9.99);
    
    let densityRatio = input.knobValues[2] / 4.9;
    params.cellSize = Math.floor(6 + densityRatio * 14);
    
    params.aberration = input.knobValues[3] * 10.0;
  } else {
    params.glitchPreset = 4;
    params.cellSize = 12;
    params.aberration = 5.0;
  }
}

// Pure function to evaluate the base "typography" pattern at a coordinate
function getShapeAt(x, y, cellSize, patternT) {
  let gx = Math.floor(x / cellSize);
  let gy = Math.floor(y / cellSize);
  let lx = (x % cellSize) - cellSize * 0.5;
  let ly = (y % cellSize) - cellSize * 0.5;

  let offset = gx * 11.3 + gy * 5.7;
  let shapeAnim = Math.sin(patternT * 0.5 + offset); 

  let box = Math.max(Math.abs(lx), Math.abs(ly)) - cellSize * 0.4;
  let cross = Math.min(Math.abs(lx), Math.abs(ly)) - cellSize * 0.1;
  
  let val = Math.max(box, -cross * shapeAnim);
  return val < 0.0; 
}

export function draw(display, params, time) {
  let w = display.width;
  let h = display.height;
  
  let pTime = params.patternTime; 
  let gTime = params.glitchTime;  
  let preset = params.glitchPreset;
  
  for (let y = 0; y < h; y++) {
    let isGlitched = false;
    let xOffset = 0;
    let showFlash = false;
    let abMult = 1.0; // Local multiplier for chromatic aberration
    
    // 10-Stage Glitch Rules
    switch (preset) {
      case 1: // Gentle VHS
        if (Math.sin(y * 0.05 - gTime * 3.0) > 0.98) {
          isGlitched = true; xOffset = Math.floor(Math.sin(y * 0.1) * 6.0);
        }
        break;
      case 2: // Interlace Tear
        if (Math.sin(y * 77.0 + gTime * 2.0) > 0.9) {
          isGlitched = true; xOffset = (y % 2 === 0) ? 5 : -5;
        }
        break;
      case 3: // Macroblock
        let bY3 = Math.floor(y / 6.0);
        let n3 = Math.sin(bY3 * 12.3 - gTime * 4.0);
        if (n3 > 0.7) {
          isGlitched = true; xOffset = Math.floor(Math.sin(bY3 * 3.3 + gTime * 10.0) * 12.0);
          if (n3 > 0.95) showFlash = true;
        }
        break;
      case 4: // Scanline Drops
        if (Math.sin(y * 84.1 + gTime * 5.0) > 0.85) {
          isGlitched = true; xOffset = Math.floor(Math.sin(y * 99.9 + gTime * 20.0) * 20.0);
        }
        break;
      case 5: // Wavy Warp
        isGlitched = true;
        xOffset = Math.floor(Math.sin(y * 0.15 + gTime * 4.0) * 4.0);
        break;
      case 6: // Chromatic Pulse
        if (Math.sin(y * 0.08 - gTime * 6.0) > 0.9) {
          isGlitched = true; abMult = 4.0; xOffset = (y % 3 === 0) ? 3 : -3;
        }
        break;
      case 7: // Data Mosh
        let bY7 = Math.floor(y / 16.0);
        if (Math.sin(bY7 * 4.1 - gTime * 1.5) > 0.5) {
          isGlitched = true; xOffset = Math.floor(Math.sin(bY7 * 9.1 + gTime * 10.0) * 25.0);
        }
        break;
      case 8: // High Freq Buzz
        if (Math.sin(y * 154.3 + gTime * 15.0) > 0.0) {
          isGlitched = true; xOffset = Math.floor(Math.sin(y * 34.2 + gTime * 30.0) * 3.0);
        }
        break;
      case 9: // Total Meltdown
        let n91 = Math.sin(y * 84.1 + gTime * 5.0);
        let n92 = Math.cos(Math.floor(y / 4.0) * 13.3 - gTime * 8.0);
        let c9 = (n91 + n92) * 0.5;
        if (c9 > 0.2) {
          isGlitched = true; xOffset = Math.floor(Math.sin(y * 99.9 + gTime * 25.0) * 30.0);
          abMult = 2.5;
          if (c9 > 0.7) showFlash = true;
        }
        break;
    }
    
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      
      let currentAberration = params.aberration * abMult;
      
      let rx = x + xOffset - currentAberration;
      let gx = x + xOffset;
      let bx = x + xOffset + currentAberration;
      
      let redHit = getShapeAt(rx, y, params.cellSize, pTime);
      let greenHit = getShapeAt(gx, y, params.cellSize, pTime);
      let blueHit = getShapeAt(bx, y, params.cellSize, pTime);
      
      if (redHit) r = 255;
      if (greenHit) g = 255;
      if (blueHit) b = 255;
      
      // Bright flash for heavy presets
      if (showFlash && !redHit && !greenHit && !blueHit) {
        r = 60; g = 60; b = 60;
      }
      
      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
