// Pattern Lab "Experiment" — a layer-stack patch that compiles to a plain
// v-field pattern (setup/update/draw + display.setValue). The patch is data;
// this module turns it into JavaScript source, so the existing runtime,
// ramp, cost analyzer, and C++ prompt all work on the result unchanged.
//
// Deliberately dependency-free so it can be unit-tested standalone.

export type PatchGenerator =
  | "waves"
  | "rings"
  | "stripes"
  | "checker"
  | "cells"
  | "spiral"
  | "noise";

export const PATCH_GENERATORS: PatchGenerator[] = [
  "waves",
  "rings",
  "stripes",
  "checker",
  "cells",
  "spiral",
  "noise",
];

export type PatchBlend = "mix" | "add" | "multiply" | "min" | "max" | "difference";

export const PATCH_BLENDS: PatchBlend[] = ["mix", "add", "multiply", "min", "max", "difference"];

export type PatchLayer = {
  enabled: boolean;
  gen: PatchGenerator;
  /** Spatial frequency, roughly "features per screen height". 1..30 */
  scale: number;
  /** Layer phase speed multiplier. 0..3 */
  speed: number;
  /** Rotation of the layer's coordinate frame, degrees. 0..180 */
  angle: number;
  /** Blend weight vs the stack so far. 0..1 (base layer: output gain) */
  amount: number;
  /** How this layer combines with the stack (ignored on the base layer). */
  blend: PatchBlend;
};

export type PatchState = {
  layers: PatchLayer[];
  /** Global time multiplier. 0..3 */
  masterSpeed: number;
  /** Tonal contrast around 0.5 applied after blending. 0.25..2 */
  contrast: number;
  /** Quantize the value field into N bands; 1 = off. 1..8 */
  posterize: number;
  invert: boolean;
};

export const MAX_PATCH_LAYERS = 4;

export const DEFAULT_PATCH: PatchState = {
  layers: [
    { enabled: true, gen: "waves", scale: 6, speed: 1, angle: 20, amount: 1, blend: "mix" },
    { enabled: true, gen: "rings", scale: 9, speed: 0.8, angle: 0, amount: 0.6, blend: "difference" },
  ],
  masterSpeed: 1,
  contrast: 1,
  posterize: 1,
  invert: false,
};

export function createPatchLayer(index: number): PatchLayer {
  return {
    enabled: true,
    gen: PATCH_GENERATORS[index % PATCH_GENERATORS.length],
    scale: 8,
    speed: 1,
    angle: 0,
    amount: 0.5,
    blend: "mix",
  };
}

const fmt = (value: number) => String(Math.round(value * 10000) / 10000);

// Statements that compute `const <v> = <0..1>` from rx/ry (rotated, centered,
// height-normalized coords) and the layer's hoisted phase variable.
function generatorLines(gen: PatchGenerator, index: number, v: string, scale: number, ph: string): string[] {
  const S = fmt(scale);
  const half = fmt(scale * 0.5);
  switch (gen) {
    case "waves":
      return [`const ${v} = 0.5 + 0.5 * Math.sin(rx * ${S} + ${ph});`];
    case "rings":
      return [`const ${v} = 0.5 + 0.5 * Math.sin(Math.sqrt(rx * rx + ry * ry) * ${S} - ${ph});`];
    case "stripes":
      return [`const ${v} = fract(rx * ${half} + ${ph} * 0.25);`];
    case "checker":
      return [
        `const ${v} = ((Math.floor(rx * ${half} + ${ph} * 0.15) + Math.floor(ry * ${half})) & 1);`,
      ];
    case "cells":
      return [
        `const gx${index} = Math.floor(rx * ${half});`,
        `const gy${index} = Math.floor(ry * ${half});`,
        `const ${v} = 0.5 + 0.5 * Math.sin(hash2(gx${index}, gy${index}) * 6.2832 + ${ph});`,
      ];
    case "spiral":
      return [
        `const ${v} = 0.5 + 0.5 * Math.sin(Math.atan2(ry, rx) * 3 + Math.sqrt(rx * rx + ry * ry) * ${S} - ${ph});`,
      ];
    case "noise":
      return [
        `const sx${index} = rx * ${half} + ${ph} * 0.3;`,
        `const sy${index} = ry * ${half};`,
        `const x0${index} = Math.floor(sx${index});`,
        `const y0${index} = Math.floor(sy${index});`,
        `const fx${index} = sx${index} - x0${index};`,
        `const fy${index} = sy${index} - y0${index};`,
        `const ux${index} = fx${index} * fx${index} * (3 - 2 * fx${index});`,
        `const uy${index} = fy${index} * fy${index} * (3 - 2 * fy${index});`,
        `const ${v} = lerp(lerp(hash2(x0${index}, y0${index}), hash2(x0${index} + 1, y0${index}), ux${index}), lerp(hash2(x0${index}, y0${index} + 1), hash2(x0${index} + 1, y0${index} + 1), ux${index}), uy${index});`,
      ];
  }
}

function blendLine(blend: PatchBlend, lv: string, amount: number): string {
  const A = fmt(amount);
  switch (blend) {
    case "mix":
      return `v = v + (${lv} - v) * ${A};`;
    case "add":
      return `v = Math.min(1, v + ${lv} * ${A});`;
    case "multiply":
      return `v = v * (1 - ${A} + ${lv} * ${A});`;
    case "min":
      return `v = v + (Math.min(v, ${lv}) - v) * ${A};`;
    case "max":
      return `v = v + (Math.max(v, ${lv}) - v) * ${A};`;
    case "difference":
      return `v = v + (Math.abs(v - ${lv}) - v) * ${A};`;
  }
}

export function buildPatchCode(patch: PatchState): string {
  const layers = patch.layers.filter((layer) => layer.enabled);

  const summary = layers.length
    ? layers
        .map(
          (layer, index) =>
            `//   ${index + 1}. ${layer.gen} (scale ${fmt(layer.scale)}, speed ${fmt(layer.speed)}${
              layer.angle ? `, angle ${fmt(layer.angle)}°` : ""
            })${index > 0 ? ` — ${layer.blend} @ ${fmt(layer.amount)}` : ` @ ${fmt(layer.amount)}`}`,
        )
        .join("\n")
    : "//   (no layers enabled)";

  const needsHash = layers.some((layer) => layer.gen === "cells" || layer.gen === "noise");
  const needsFract = layers.some((layer) => layer.gen === "stripes") || needsHash;
  const needsLerp = layers.some((layer) => layer.gen === "noise");

  const helpers: string[] = [];
  if (needsFract) helpers.push("function fract(v) { return v - Math.floor(v); }");
  if (needsHash)
    helpers.push(
      "function hash2(x, y) { return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453); }",
    );
  if (needsLerp) helpers.push("function lerp(a, b, u) { return a + (b - a) * u; }");

  // Hoisted per-layer phase (and rotation constants baked at codegen time).
  const phaseLines = layers.map((layer, index) => `  const ph${index} = t * ${fmt(layer.speed)};`);

  const layerBlocks = layers.map((layer, index) => {
    const v = `lv${index}`;
    const lines: string[] = [];
    lines.push(`      // layer ${index + 1}: ${layer.gen}${index > 0 ? ` (${layer.blend})` : ""}`);
    lines.push("      {");
    if (layer.angle !== 0) {
      const radians = (layer.angle * Math.PI) / 180;
      lines.push(`        const rx = nx * ${fmt(Math.cos(radians))} - ny * ${fmt(Math.sin(radians))};`);
      lines.push(`        const ry = nx * ${fmt(Math.sin(radians))} + ny * ${fmt(Math.cos(radians))};`);
    } else {
      lines.push("        const rx = nx;");
      lines.push("        const ry = ny;");
    }
    for (const line of generatorLines(layer.gen, index, v, layer.scale, `ph${index}`)) {
      lines.push(`        ${line}`);
    }
    if (index === 0) {
      lines.push(`        v = ${v} * ${fmt(layer.amount)};`);
    } else {
      lines.push(`        ${blendLine(layer.blend, v, layer.amount)}`);
    }
    lines.push("      }");
    return lines.join("\n");
  });

  const postLines: string[] = [];
  if (patch.contrast !== 1) {
    postLines.push(`      v = (v - 0.5) * ${fmt(patch.contrast)} + 0.5;`);
  }
  if (patch.posterize > 1) {
    const bands = Math.round(patch.posterize);
    postLines.push(`      v = v < 0 ? 0 : v > 1 ? 1 : v;`);
    postLines.push(
      `      v = Math.min(${bands - 1}, Math.floor(v * ${bands})) / ${bands - 1};`,
    );
  }
  if (patch.invert) {
    postLines.push("      v = 1 - v;");
  }

  return `// Generated by Pattern Lab — Experiment (layer stack)
// Layers:
${summary}
// Value field only: color comes from the Color Ramp panel.
// This is ordinary pattern code — send it to the Code tab and edit freely.
${helpers.length ? `\n${helpers.join("\n")}\n` : ""}
export function setup(params) {
  params.t = 0;
}

export function update(dt, input, params) {
  params.t += dt * ${fmt(patch.masterSpeed)};
}

export function draw(display, params, time) {
  const w = display.width;
  const h = display.height;
  const t = params.t;
${phaseLines.join("\n")}

  for (let y = 0; y < h; y++) {
    const ny = (y - h * 0.5) / h;
    for (let x = 0; x < w; x++) {
      const nx = (x - w * 0.5) / h;
      let v = 0;
${layerBlocks.join("\n")}
${postLines.length ? `${postLines.join("\n")}\n` : ""}      display.setValue(x, y, v);
    }
  }
}`;
}
