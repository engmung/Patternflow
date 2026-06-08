import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0601",
  num: 601,
  name: "0601",
  desc: "Cellular wave matrix with noise",
  code: `// Cellular Wave Matrix
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
}`,
};
