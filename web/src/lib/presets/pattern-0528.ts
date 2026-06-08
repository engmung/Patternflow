import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0528",
  num: 528,
  name: "0528",
  desc: "Mechanical grid blocks with contrast variations",
  code: `// Contrast Remix: Mechanical Grid Blocks
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
}`,
};
