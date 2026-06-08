import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0531",
  num: 531,
  name: "0531",
  desc: "Posterized thermal gradient effect",
  code: `// Posterized Thermal Gradient
// Knob 1: Thermal Core Offset (Base shift of threshold indices)
// Knob 2: Animation Speed
// Knob 3: Material Density Scale (Frequency of spatial noise bands)
// Knob 4: Color Palette Inversion Threshold

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const knobs = input.knobValues || [0.5, 2.0, 1.0, 0.6];
  
  // Custom material control mapping
  params.colorShift = knobs[0];
  params.speed = knobs[1];
  params.density = 0.02 + (knobs[2] / 4.9) * 0.15; // 0.02 to 0.17
  params.invertThreshold = knobs[4];
  
  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  const w = display.width;
  const h = display.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Complex spatial signal generating topological lines
      const n1 = Math.sin(x * params.density + params.time * 0.7);
      const n2 = Math.cos(y * params.density - params.time * 0.5);
      const n3 = Math.sin((x + y) * params.density * 0.5 + params.time);
      
      const compositeSignal = (n1 + n2 + n3) / 3.0 * 0.5 + 0.5; // Normalized 0 to 1
      
      // Map to 5 distinct discrete material color bands
      const evaluationVal = (compositeSignal + params.colorShift) % 1.0;
      const bandIndex = Math.floor(evaluationVal * 5);
      
      let r = 0, g = 0, b = 0;
      
      // Assign static, vivid material colors per index band mimicking thermal cameras
      switch (bandIndex) {
        case 0: // Ultra Hot Core
          r = 255; g = 255; b = 255;
          break;
        case 1: // Intense Heat
          r = 255; g = 140; b = 0;
          break;
        case 2: // Fluid Plasma
          r = 220; g = 0; b = 100;
          break;
        case 3: // Subdued Ambient Fill
          r = 40; g = 0; b = 160;
          break;
        case 4: // Deep Sub-zero Cold
          r = 5; g = 10; b = 40;
          break;
      }
      
      // Perform color block inverting check based on Knob 4 configuration
      if (evaluationVal > params.invertThreshold) {
        const brightSave = (r + g + b) / 3;
        r = brightSave * 0.2;
        g = 255 - g;
        b = 255;
      }
      
      display.setPixel(x, y, r, g, b);
    }
  }
}`,
};
