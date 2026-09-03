// Smoke test for the OKLab/OKLCH ramp modes: checks the conversion against
// Björn Ottosson's published reference values, round-trips the sRGB cube,
// asserts every mode stays finite and in-gamut across random ramps, proves the
// oklab midpoint actually fixes the muddy sRGB middle, and — because the
// sandbox carries a hand-ported copy of this math — diffs the plain-JS port in
// public/pattern-sandbox.html against the TypeScript LUT byte-for-byte.
// Run: npx tsx scripts/ramp-oklab-smoke.ts

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import {
  RAMP_MODES,
  buildRampLUT,
  sampleRamp,
  sampleRampRGBA,
  srgbToOklab,
  oklabToSrgb,
  type ColorRamp,
  type RampMode,
} from "../src/lib/pattern/harness";
import { buildRampAnnotationLine, parseRampAnnotation } from "../src/lib/pattern/ramp";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1. Reference values (bottosson.github.io/posts/oklab, table of sRGB primaries)
const REFS: Array<{ rgb: [number, number, number]; lab: [number, number, number] }> = [
  { rgb: [255, 255, 255], lab: [1.0, 0.0, 0.0] },
  { rgb: [255, 0, 0], lab: [0.62796, 0.22486, 0.12585] },
  { rgb: [0, 255, 0], lab: [0.86644, -0.23389, 0.1795] },
  { rgb: [0, 0, 255], lab: [0.45201, -0.03246, -0.31153] },
];
for (const ref of REFS) {
  const lab = srgbToOklab(...ref.rgb);
  const maxErr = Math.max(...lab.map((v, i) => Math.abs(v - ref.lab[i])));
  check(
    `reference oklab of rgb(${ref.rgb.join(",")})`,
    maxErr < 1e-3,
    `got [${lab.map((v) => v.toFixed(5)).join(", ")}]`,
  );
}

// ── 2. Round-trip: sRGB → OKLab → sRGB is identity within rounding
{
  let maxErr = 0;
  for (let r = 0; r <= 255; r += 15) {
    for (let g = 0; g <= 255; g += 15) {
      for (let b = 0; b <= 255; b += 15) {
        const [L, A, B] = srgbToOklab(r, g, b);
        const [r2, g2, b2] = oklabToSrgb(L, A, B);
        maxErr = Math.max(maxErr, Math.abs(r2 - r), Math.abs(g2 - g), Math.abs(b2 - b));
      }
    }
  }
  check("round-trip identity over the sRGB cube", maxErr < 1, `max channel error ${maxErr.toFixed(4)}`);
}

// ── 3. Gamut + finiteness: random ramps × every mode × dense t
{
  let bad = "";
  const rand = (() => {
    let seed = 0x9e3779b9;
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xffffffff;
    };
  })();
  outer: for (let trial = 0; trial < 40; trial++) {
    const stopCount = 2 + Math.floor(rand() * 3);
    const stops = Array.from({ length: stopCount }, () => ({
      position: Math.round(rand() * 100) / 100,
      color: [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256)] as [
        number,
        number,
        number,
      ],
      alpha: rand(),
    }));
    for (const mode of RAMP_MODES) {
      for (const wrap of [false, true]) {
        const ramp: ColorRamp = { stops, mode, wrap };
        for (let i = 0; i <= 256; i++) {
          const [r, g, b, a] = sampleRampRGBA(ramp, i / 256);
          const finite = [r, g, b, a].every((v) => Number.isFinite(v));
          const inRange =
            r > -0.5 && r < 255.5 && g > -0.5 && g < 255.5 && b > -0.5 && b < 255.5 && a >= 0 && a <= 1;
          if (!finite || !inRange) {
            bad = `trial ${trial} mode ${mode} wrap ${wrap} t=${(i / 256).toFixed(3)} → [${r}, ${g}, ${b}, ${a}]`;
            break outer;
          }
        }
      }
    }
  }
  check("all modes finite and in range over random ramps", bad === "", bad);
}

// ── 4. The muddy middle: blue→yellow keeps chroma in oklab, dies in sRGB
{
  const stops = [
    { position: 0, color: [0, 0, 255] as [number, number, number] },
    { position: 1, color: [255, 255, 0] as [number, number, number] },
  ];
  const chromaOfMid = (mode: RampMode) => {
    const [r, g, b] = sampleRamp({ stops, mode, wrap: false }, 0.5);
    const [, A, B] = srgbToOklab(r, g, b);
    return Math.sqrt(A * A + B * B);
  };
  const linearC = chromaOfMid("linear");
  const oklabC = chromaOfMid("oklab");
  check(
    "blue→yellow midpoint keeps chroma in oklab",
    oklabC > linearC + 0.05,
    `linear C=${linearC.toFixed(4)}, oklab C=${oklabC.toFixed(4)}`,
  );
}

// ── 5. OKLCH short vs long actually take different hue paths (red→blue)
{
  const stops = [
    { position: 0, color: [255, 0, 0] as [number, number, number] },
    { position: 1, color: [0, 0, 255] as [number, number, number] },
  ];
  const short = sampleRamp({ stops, mode: "oklchShort", wrap: false }, 0.5);
  const long = sampleRamp({ stops, mode: "oklchLong", wrap: false }, 0.5);
  // Short path red→blue crosses magenta (green stays low); the long way runs
  // through green territory.
  check(
    "oklchShort red→blue passes through magenta",
    short[0] > short[1] && short[2] > short[1],
    `mid [${short.map((v) => v.toFixed(0)).join(", ")}]`,
  );
  check(
    "oklchLong red→blue takes the green route",
    long[1] > short[1] + 40,
    `short g=${short[1].toFixed(0)}, long g=${long[1].toFixed(0)}`,
  );
}

// ── 6. Black→white in oklab keeps L monotone (the default-ramp guarantee)
{
  const lut = buildRampLUT({
    stops: [
      { position: 0, color: [0, 0, 0] },
      { position: 1, color: [255, 255, 255] },
    ],
    mode: "oklab",
    wrap: false,
  });
  let monotone = true;
  for (let i = 1; i < 256; i++) {
    const prev = srgbToOklab(lut[(i - 1) * 3], lut[(i - 1) * 3 + 1], lut[(i - 1) * 3 + 2])[0];
    const cur = srgbToOklab(lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2])[0];
    if (cur < prev - 1e-6) {
      monotone = false;
      break;
    }
  }
  check("black→white oklab ramp has monotone L", monotone);
}

// ── 7. @ramp annotation survives the new mode tokens
{
  const line = buildRampAnnotationLine({
    stops: [
      { position: 0, color: "#081840" },
      { position: 1, color: "#ffe89a" },
    ],
    mode: "oklchShort",
    wrap: true,
    recolor: false,
  });
  const parsed = parseRampAnnotation(`${line}\nexport function draw() {}`);
  check(
    "@ramp round-trips oklchShort",
    parsed !== null && parsed.mode === "oklchShort" && parsed.wrap && parsed.stops.length === 2,
    line,
  );
}

// ── 8. Sandbox parity: the plain-JS port must build the same LUT bytes
{
  const html = fs.readFileSync(path.resolve(__dirname, "../public/pattern-sandbox.html"), "utf8");
  const start = html.indexOf("// ── Color ramp");
  const end = html.indexOf("var RAMP_LINE_RE");
  if (start < 0 || end < 0 || end <= start) {
    check("sandbox ramp code found", false, "slice markers missing — update ramp-oklab-smoke.ts");
  } else {
    const context = vm.createContext({ Math, Uint8Array, isFinite });
    vm.runInContext(
      `function clampByte(v){ if (!isFinite(v)) return 0; return Math.max(0, Math.min(255, Math.round(v))); }\n${html.slice(start, end)}`,
      context,
    );
    const sandboxBuild = vm.runInContext("buildRampLUT", context) as (
      stops: { position: number; color: [number, number, number] }[],
      mode: string,
      wrap: boolean,
    ) => Uint8Array;

    let maxDiff = 0;
    let where = "";
    const stops = [
      { position: 0.0, color: [8, 24, 64] as [number, number, number] },
      { position: 0.35, color: [255, 77, 0] as [number, number, number] },
      { position: 0.7, color: [0, 200, 120] as [number, number, number] },
      { position: 1.0, color: [255, 232, 154] as [number, number, number] },
    ];
    for (const mode of RAMP_MODES) {
      for (const wrap of [false, true]) {
        const ts = buildRampLUT({ stops, mode, wrap });
        const js = sandboxBuild(stops, mode, wrap);
        for (let i = 0; i < ts.length; i++) {
          const diff = Math.abs(ts[i] - js[i]);
          if (diff > maxDiff) {
            maxDiff = diff;
            where = `mode ${mode} wrap ${wrap} byte ${i}`;
          }
        }
      }
    }
    check("sandbox port matches TypeScript LUT", maxDiff === 0, `max diff ${maxDiff} at ${where}`);
  }
}

if (failures > 0) {
  console.error(`\nramp-oklab-smoke: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nramp-oklab-smoke: OK");
