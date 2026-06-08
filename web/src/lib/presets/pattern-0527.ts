import type { LivePreset } from "./types";

export const preset: LivePreset = {
  id: "pattern-0527",
  num: 527,
  name: "0527",
  desc: "3D vector normal-mapped line grid",
  code: `// Palette/Material Remix: 3D Vector Normal Matrix
// Knob 1: Cluster Weight (number of constellation nodes, splits from 4 to 10)
// Knob 2: Rotation Rate (time-acceleration vector operation speed)
// Knob 3: Maximum Distance (maximum cutoff threshold for connecting lines)
// Knob 4: Normal Depth (3D axis attenuation strength index of the normal map)

export function setup(params) {
  params.time = 0;
}

export function update(dt, input, params) {
  const knobs = input.knobValues || [0.4, 1.8, 0.6, 0.5];
  params.nodeCount = 4 + Math.floor(knobs[0] * 6); 
  params.speed = knobs[1];
  params.linkDistance = 15 + knobs[2] * 40;
  params.normalDepth = knobs[3] * 1.0;

  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  const w = display.width;
  const h = display.height;
  const t = params.time;
  
  const nodes = [];
  for (let i = 0; i < params.nodeCount; i++) {
    const seed = Math.sin(i * 12.87 + 94.11) * 742.12;
    const cx = w * 0.5 + Math.cos((seed % 1.0) * 6.28 + t * 0.22) * (w * 0.38);
    const cy = h * 0.5 + Math.sin(((seed * 2.3) % 1.0) * 6.28 + t * 0.4) * (h * 0.35);
    nodes.push({ x: cx, y: cy });
  }

  // Clear background to pure black
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) display.setPixel(x, y, 0, 0, 0);
  }

  // 1. 3D vector normal-mapped line drawing
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < params.linkDistance) {
        const xMin = Math.max(0, Math.floor(Math.min(nodes[i].x, nodes[j].x)));
        const xMax = Math.min(w - 1, Math.ceil(Math.max(nodes[i].x, nodes[j].x)));
        const yMin = Math.max(0, Math.floor(Math.min(nodes[i].y, nodes[j].y)));
        const yMax = Math.min(h - 1, Math.ceil(Math.max(nodes[i].y, nodes[j].y)));

        // Calculate line slope (direction vector) and normalize (Normal Vector)
        const nx = dx / dist;
        const ny = dy / dist;

        // Apply 3D space normal map formula (X->R, Y->G, Z->B)
        const rVal = Math.floor((nx * 0.5 + 0.5) * 255);
        const gVal = Math.floor((ny * 0.5 + 0.5) * 255);
        const bVal = Math.floor(params.normalDepth * 255);

        for (let ly = yMin; ly <= yMax; ly++) {
          for (let lx = xMin; lx <= xMax; lx++) {
            const cross = (lx - nodes[i].x) * (nodes[j].y - nodes[i].y) - (ly - nodes[i].y) * (nodes[j].x - nodes[i].x);
            
            if (Math.abs(cross) / dist < 0.85) {
              const dot = (lx - nodes[i].x) * (nodes[j].x - nodes[i].x) + (ly - nodes[i].y) * (nodes[j].y - nodes[i].y);
              const param = dot / (dist * dist);
              
              if (param >= 0 && param <= 1) {
                display.setPixel(lx, ly, rVal, gVal, bVal);
              }
            }
          }
        }
      }
    }
  }

  // 2. White cross markers at node positions
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    const cx = Math.floor(node.x);
    const cy = Math.floor(node.y);
    const len = 3;

    for (let k = -len; k <= len; k++) {
      if (cx + k >= 0 && cx + k < w && cy >= 0 && cy < h) display.setPixel(cx + k, cy, 255, 255, 255);
      if (cx >= 0 && cx < w && cy + k >= 0 && cy + k < h) display.setPixel(cx, cy + k, 255, 255, 255);
    }
  }
}`,
};
