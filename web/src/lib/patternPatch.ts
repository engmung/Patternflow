// Pattern Lab "Experiment" — a layer-stack patch that compiles to a plain
// v-field pattern (setup/update/draw + display.setValue). The patch is data;
// this module turns it into JavaScript source, so the existing runtime,
// ramp, cost analyzer, and C++ prompt all work on the result unchanged.
//
// Knob bindings: any slider can be bound to knob 1–4 (index 0–3). Binding sets
// the knob's min/max to the parameter's default range as a starting point, and
// the generated code reads input.knobValues[i] directly with NO extra clamp —
// the knob's own min/max is the only authority, so widening the knob range in
// Pattern Lab extends the parameter past its slider range. Unbound parameters
// are baked in as constants. The C++ conversion picks the bindings up as the
// pattern's knobs.
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

/** Knob binding: 0–3 = knob index, -1/undefined = not bound. */
export type PatchKnob = number;

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
  scaleK?: PatchKnob;
  speedK?: PatchKnob;
  angleK?: PatchKnob;
  amountK?: PatchKnob;
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
  masterSpeedK?: PatchKnob;
  contrastK?: PatchKnob;
  posterizeK?: PatchKnob;
};

export const MAX_PATCH_LAYERS = 4;

// Slider ranges — the same ranges the UI uses, and the span a bound knob
// sweeps across. Keep the two in sync via these constants.
export const PATCH_RANGES = {
  scale: [1, 30] as const,
  speed: [0, 3] as const,
  angle: [0, 180] as const,
  amount: [0, 1] as const,
  masterSpeed: [0, 3] as const,
  contrast: [0.25, 2] as const,
  posterize: [1, 8] as const,
};

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

const isBound = (knob: PatchKnob | undefined): knob is number =>
  typeof knob === "number" && knob >= 0 && knob <= 3;

// Expression for a parameter: a literal when unbound; when bound, the knob's
// absolute value as-is — the knob's own min/max (retuned at bind time, then
// user-adjustable) is the only range authority, so no clamp here. `kv` is
// hoisted in the surrounding scope; the literal fallback covers missing or
// non-finite knob input.
function paramExpr(value: number, knob: PatchKnob | undefined) {
  if (!isBound(knob)) return fmt(value);
  return `(kv && Number.isFinite(kv[${knob}]) ? kv[${knob}] : ${fmt(value)})`;
}

// Statements that compute `const <v> = <0..1>` from rx/ry (rotated, centered,
// height-normalized coords), the hoisted scale vars s<i>/sh<i>, and phase ph<i>.
function generatorLines(gen: PatchGenerator, index: number, v: string): string[] {
  const s = `s${index}`;
  const sh = `sh${index}`;
  const ph = `ph${index}`;
  switch (gen) {
    case "waves":
      return [`const ${v} = 0.5 + 0.5 * Math.sin(rx * ${s} + ${ph});`];
    case "rings":
      return [`const ${v} = 0.5 + 0.5 * Math.sin(Math.sqrt(rx * rx + ry * ry) * ${s} - ${ph});`];
    case "stripes":
      return [`const ${v} = fract(rx * ${sh} + ${ph} * 0.25);`];
    case "checker":
      return [
        `const ${v} = ((Math.floor(rx * ${sh} + ${ph} * 0.15) + Math.floor(ry * ${sh})) & 1);`,
      ];
    case "cells":
      return [
        `const gx${index} = Math.floor(rx * ${sh});`,
        `const gy${index} = Math.floor(ry * ${sh});`,
        `const ${v} = 0.5 + 0.5 * Math.sin(hash2(gx${index}, gy${index}) * 6.2832 + ${ph});`,
      ];
    case "spiral":
      return [
        `const ${v} = 0.5 + 0.5 * Math.sin(Math.atan2(ry, rx) * 3 + Math.sqrt(rx * rx + ry * ry) * ${s} - ${ph});`,
      ];
    case "noise":
      return [
        `const sx${index} = rx * ${sh} + ${ph} * 0.3;`,
        `const sy${index} = ry * ${sh};`,
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

function blendLine(blend: PatchBlend, lv: string, a: string): string {
  switch (blend) {
    case "mix":
      return `v = v + (${lv} - v) * ${a};`;
    case "add":
      return `v = Math.min(1, v + ${lv} * ${a});`;
    case "multiply":
      return `v = v * (1 - ${a} + ${lv} * ${a});`;
    case "min":
      return `v = v + (Math.min(v, ${lv}) - v) * ${a};`;
    case "max":
      return `v = v + (Math.max(v, ${lv}) - v) * ${a};`;
    case "difference":
      return `v = v + (Math.abs(v - ${lv}) - v) * ${a};`;
  }
}

/**
 * Human-readable knob roles from the patch bindings, e.g.
 * "Knob 1 = layer 2 amount (default 0 to 1)". The ranges are bind-time
 * defaults — the knob's actual min/max in Pattern Lab is the authority, since
 * the user can retune it after binding.
 */
export function describePatchKnobs(patch: PatchState): string[] {
  const roles: string[][] = [[], [], [], []];
  const note = (knob: PatchKnob | undefined, label: string, range: readonly [number, number]) => {
    if (isBound(knob)) roles[knob].push(`${label} (default ${fmt(range[0])} to ${fmt(range[1])})`);
  };
  patch.layers.forEach((layer, index) => {
    if (!layer.enabled) return;
    const name = `layer ${index + 1}`;
    note(layer.scaleK, `${name} scale`, PATCH_RANGES.scale);
    note(layer.speedK, `${name} speed`, PATCH_RANGES.speed);
    note(layer.angleK, `${name} angle`, PATCH_RANGES.angle);
    note(layer.amountK, `${name} amount`, PATCH_RANGES.amount);
  });
  note(patch.masterSpeedK, "master speed", PATCH_RANGES.masterSpeed);
  note(patch.contrastK, "contrast", PATCH_RANGES.contrast);
  note(patch.posterizeK, "posterize", PATCH_RANGES.posterize);
  return roles.map((entries, index) =>
    entries.length ? `Knob ${index + 1} = ${entries.join(" + ")}` : `Knob ${index + 1} = (unused)`,
  );
}

export function buildPatchCode(patch: PatchState): string {
  const layers = patch.layers.filter((layer) => layer.enabled);

  const anyBinding =
    layers.some(
      (layer) =>
        isBound(layer.scaleK) || isBound(layer.speedK) || isBound(layer.angleK) || isBound(layer.amountK),
    ) ||
    isBound(patch.masterSpeedK) ||
    isBound(patch.contrastK) ||
    isBound(patch.posterizeK);

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

  // @knobs annotation so Pattern Lab re-applies knob names + ranges when this
  // code is loaded back into the editor ("-" = slot not bound, left alone).
  const knobNames: (string | null)[] = [null, null, null, null];
  const knobRanges: (readonly [number, number] | null)[] = [null, null, null, null];
  const claimKnob = (
    knob: PatchKnob | undefined,
    name: string,
    range: readonly [number, number],
  ) => {
    if (isBound(knob) && knobNames[knob] === null) {
      knobNames[knob] = name;
      knobRanges[knob] = range;
    }
  };
  layers.forEach((layer, index) => {
    claimKnob(layer.scaleK, `L${index + 1} scale`, PATCH_RANGES.scale);
    claimKnob(layer.speedK, `L${index + 1} speed`, PATCH_RANGES.speed);
    claimKnob(layer.angleK, `L${index + 1} angle`, PATCH_RANGES.angle);
    claimKnob(layer.amountK, `L${index + 1} amount`, PATCH_RANGES.amount);
  });
  claimKnob(patch.masterSpeedK, "speed", PATCH_RANGES.masterSpeed);
  claimKnob(patch.contrastK, "contrast", PATCH_RANGES.contrast);
  claimKnob(patch.posterizeK, "poster", PATCH_RANGES.posterize);
  const knobsAnnotation = anyBinding
    ? `\n// @knobs ${[0, 1, 2, 3]
        .map((knob) => {
          const name = knobNames[knob];
          const range = knobRanges[knob];
          return name && range ? `${name}=${fmt(range[0])}..${fmt(range[1])}` : "-";
        })
        .join(", ")}`
    : "";

  const knobComment = anyBinding
    ? `// ${describePatchKnobs(patch).join(" · ")}${knobsAnnotation}\n// Bound knobs read input.knobValues as ABSOLUTE values, no clamp — the knob's own min/max range is the authority (listed ranges are bind-time defaults).`
    : "// Knobs: none bound — bind sliders to K1–K4 in the Experiment tab to control them live.";

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

  const knPreamble = anyBinding ? "  const kv = params.knobValues;\n" : "";

  // Per-layer hoisted values: scale, half-scale, phase, amount, rotation.
  const hoisted: string[] = [];
  layers.forEach((layer, index) => {
    hoisted.push(`  const s${index} = ${paramExpr(layer.scale, layer.scaleK)};`);
    hoisted.push(`  const sh${index} = s${index} * 0.5;`);
    hoisted.push(
      `  const ph${index} = t * ${paramExpr(layer.speed, layer.speedK)};`,
    );
    hoisted.push(`  const a${index} = ${paramExpr(layer.amount, layer.amountK)};`);
    if (isBound(layer.angleK)) {
      hoisted.push(
        `  const an${index} = ${paramExpr(layer.angle, layer.angleK)} * 0.0174533;`,
      );
      hoisted.push(`  const ca${index} = Math.cos(an${index});`);
      hoisted.push(`  const sa${index} = Math.sin(an${index});`);
    } else if (layer.angle !== 0) {
      const radians = (layer.angle * Math.PI) / 180;
      hoisted.push(`  const ca${index} = ${fmt(Math.cos(radians))};`);
      hoisted.push(`  const sa${index} = ${fmt(Math.sin(radians))};`);
    }
  });

  const layerBlocks = layers.map((layer, index) => {
    const v = `lv${index}`;
    const rotated = isBound(layer.angleK) || layer.angle !== 0;
    const lines: string[] = [];
    lines.push(`      // layer ${index + 1}: ${layer.gen}${index > 0 ? ` (${layer.blend})` : ""}`);
    lines.push("      {");
    if (rotated) {
      lines.push(`        const rx = nx * ca${index} - ny * sa${index};`);
      lines.push(`        const ry = nx * sa${index} + ny * ca${index};`);
    } else {
      lines.push("        const rx = nx;");
      lines.push("        const ry = ny;");
    }
    for (const line of generatorLines(layer.gen, index, v)) {
      lines.push(`        ${line}`);
    }
    if (index === 0) {
      lines.push(`        v = ${v} * a0;`);
    } else {
      lines.push(`        ${blendLine(layer.blend, v, `a${index}`)}`);
    }
    lines.push("      }");
    return lines.join("\n");
  });

  // Post ops: hoisted expressions + per-pixel lines.
  const postHoisted: string[] = [];
  const postLines: string[] = [];
  if (isBound(patch.contrastK) || patch.contrast !== 1) {
    postHoisted.push(
      `  const contrastV = ${paramExpr(patch.contrast, patch.contrastK)};`,
    );
    postLines.push("      v = (v - 0.5) * contrastV + 0.5;");
  }
  if (isBound(patch.posterizeK)) {
    postHoisted.push(
      `  const bands = Math.max(1, Math.round(${paramExpr(patch.posterize, patch.posterizeK)}));`,
    );
    postLines.push("      v = v < 0 ? 0 : v > 1 ? 1 : v;");
    postLines.push(
      "      if (bands > 1) { v = Math.min(bands - 1, Math.floor(v * bands)) / (bands - 1); }",
    );
  } else if (patch.posterize > 1) {
    const bands = Math.round(patch.posterize);
    postLines.push("      v = v < 0 ? 0 : v > 1 ? 1 : v;");
    postLines.push(`      v = Math.min(${bands - 1}, Math.floor(v * ${bands})) / ${bands - 1};`);
  }
  if (patch.invert) {
    postLines.push("      v = 1 - v;");
  }

  const masterSpeedExpr = paramExpr(patch.masterSpeed, patch.masterSpeedK);
  const updateBody = isBound(patch.masterSpeedK)
    ? `  const kv = input.knobValues;\n  params.t += dt * ${masterSpeedExpr};`
    : `  params.t += dt * ${masterSpeedExpr};`;

  return `// Generated by Pattern Lab — Experiment (layer stack)
// Layers:
${summary}
${knobComment}
// Value field only: color comes from the Color Ramp panel.
// This is ordinary pattern code — send it to the Code tab and edit freely.
${helpers.length ? `\n${helpers.join("\n")}\n` : ""}
export function setup(params) {
  params.t = 0;
}

export function update(dt, input, params) {
${updateBody}
}

export function draw(display, params, time) {
  const w = display.width;
  const h = display.height;
  const t = params.t;
${knPreamble}${hoisted.join("\n")}
${postHoisted.length ? `${postHoisted.join("\n")}\n` : ""}
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
