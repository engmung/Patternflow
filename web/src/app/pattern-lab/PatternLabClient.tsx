"use client";

import Editor from "@monaco-editor/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeEsp32Cost } from "@/lib/esp32CostAnalyzer";
import {
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  PatternRuntime,
  createIdleInput,
  knobTargetToDelta,
  renderPatternStill,
} from "@/lib/patternHarness";
import {
  LOGICAL_KNOB_DEFAULTS,
  LOGICAL_KNOB_RANGES,
  LOGICAL_KNOB_UNITS_PER_TURN,
  LOGICAL_KNOB_WRAP,
} from "@/lib/patternflowControls";
import { sdfRunesPattern } from "@/lib/patternSamples";
import styles from "./PatternLab.module.css";

const knobLabels = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];
const initialKnobs = [...LOGICAL_KNOB_DEFAULTS];
const defaultRanges: KnobRange[] = LOGICAL_KNOB_RANGES.map(([min, max]) => [min, max]);
const sweepValues = [0, 0.25, 0.5, 0.75, 1];
const minRangeSpan = 0.001;
const pixelsPerDigitStep = 10;

type Snapshot = {
  id: string;
  src: string;
  label: string;
};

type KnobRange = [number, number];

type RangeDragState = {
  index: number;
  edge: "min" | "max";
  startValue: number;
  startX: number;
  startY: number;
  step: number;
};

type RangeEditState = {
  index: number;
  edge: "min" | "max";
  value: string;
};

function paintCanvas(canvas: HTMLCanvasElement, data: Uint8ClampedArray) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const imageData = context.createImageData(PATTERN_MATRIX_WIDTH, PATTERN_MATRIX_HEIGHT);
  imageData.data.set(data);
  context.putImageData(imageData, 0, 0);
}

function dataToUrl(data: Uint8ClampedArray) {
  const canvas = document.createElement("canvas");
  canvas.width = PATTERN_MATRIX_WIDTH;
  canvas.height = PATTERN_MATRIX_HEIGHT;
  paintCanvas(canvas, data);
  return canvas.toDataURL("image/png");
}

function formatKnob(value: number) {
  return value.toFixed(3);
}

function formatRangeControlValue(value: number) {
  return value.toFixed(3);
}

function roundRangeValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

function getDigitStep(text: string, index: number) {
  const char = text[index];
  if (!char || char === "-" || char === ".") return null;

  const decimalIndex = text.indexOf(".");
  if (decimalIndex < 0 || index < decimalIndex) {
    const placesLeft = (decimalIndex < 0 ? text.length : decimalIndex) - index - 1;
    return 10 ** placesLeft;
  }

  return 10 ** -(index - decimalIndex);
}

function getRangeMidpoint(range: KnobRange) {
  return range[0] + (range[1] - range[0]) * 0.5;
}

function clampToRange(value: number, range: KnobRange) {
  return Math.max(range[0], Math.min(range[1], value));
}

function getNormalizedKnobs(knobs: number[], ranges: KnobRange[]) {
  return knobs.map((value, index) => {
    const range = ranges[index] ?? [0, 1];
    const span = Math.max(minRangeSpan, range[1] - range[0]);
    return (value - range[0]) / span;
  });
}

function updateRangeValue(range: KnobRange, edge: "min" | "max", nextValue: number): KnobRange {
  const next: KnobRange = [...range];
  if (edge === "min") {
    next[0] = nextValue;
    if (next[1] <= next[0]) {
      next[1] = next[0] + minRangeSpan;
    }
  } else {
    next[1] = nextValue;
    if (next[0] >= next[1]) {
      next[0] = next[1] - minRangeSpan;
    }
  }
  return next;
}

export default function PatternLabClient() {
  const [code, setCode] = useState(sdfRunesPattern);
  const [knobs, setKnobs] = useState(initialKnobs);
  const [ranges, setRanges] = useState<KnobRange[]>(defaultRanges);
  const [running, setRunning] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [renderStats, setRenderStats] = useState({ fps: 0, ms: 0 });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [activeSweepKnob, setActiveSweepKnob] = useState(2);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [cppPromptCopied, setCppPromptCopied] = useState(false);
  const [activeRangeId, setActiveRangeId] = useState<string | null>(null);
  const [editingRange, setEditingRange] = useState<RangeEditState | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PatternRuntime | null>(null);
  const knobsRef = useRef(knobs);
  const previousKnobsRef = useRef(initialKnobs);
  const runningRef = useRef(running);
  const simTimeRef = useRef(0);
  const runtimeErrorRef = useRef<string | null>(null);
  const rangesRef = useRef(ranges);
  const rangeDragRef = useRef<RangeDragState | null>(null);

  const cost = useMemo(() => analyzeEsp32Cost(code), [code]);

  const setRuntimeErrorSafe = useCallback((message: string | null) => {
    if (runtimeErrorRef.current === message) return;
    runtimeErrorRef.current = message;
    setRuntimeError(message);
  }, []);

  const loadCode = useCallback(
    (nextCode: string) => {
      const runtime = new PatternRuntime();
      const result = runtime.loadCode(nextCode);
      runtimeRef.current = runtime;
      previousKnobsRef.current = [...knobsRef.current];
      simTimeRef.current = 0;
      setRuntimeErrorSafe(result.ok ? null : result.error ?? "Pattern failed to load.");

      if (canvasRef.current) {
        paintCanvas(canvasRef.current, runtime.data);
      }
    },
    [setRuntimeErrorSafe],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => loadCode(code), 180);
    return () => window.clearTimeout(timeout);
  }, [code, loadCode]);

  useEffect(() => {
    knobsRef.current = knobs;
  }, [knobs]);

  useEffect(() => {
    rangesRef.current = ranges;
  }, [ranges]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    let frameId = 0;
    let lastNow = performance.now();
    let statsStartedAt = lastNow;
    let statsFrames = 0;
    let lastRenderMs = 0;

    const tick = (now: number) => {
      const elapsed = Math.max(0, (now - lastNow) / 1000);
      const dt = runningRef.current ? Math.min(elapsed, 0.05) : 0;
      lastNow = now;
      simTimeRef.current += dt;

      const currentKnobs = knobsRef.current;
      const previousKnobs = previousKnobsRef.current;
      const knobDeltas = currentKnobs.map((value, index) =>
        knobTargetToDelta(
          previousKnobs[index] ?? initialKnobs[index] ?? 0.5,
          value,
          LOGICAL_KNOB_WRAP[index],
          LOGICAL_KNOB_UNITS_PER_TURN[index],
        ),
      );
      const currentRanges = rangesRef.current;
      const knobNormalized = getNormalizedKnobs(currentKnobs, currentRanges);
      previousKnobsRef.current = [...currentKnobs];

      const runtime = runtimeRef.current;
      const canvas = canvasRef.current;
      if (runtime && canvas) {
        const startedAt = performance.now();
        const result = runtime.renderFrame(
          dt,
          simTimeRef.current,
          createIdleInput(knobDeltas, {
            knobValues: currentKnobs,
            knobNormalized,
            knobRanges: currentRanges,
          }),
        );
        lastRenderMs = performance.now() - startedAt;

        if (result.ok) {
          setRuntimeErrorSafe(null);
          paintCanvas(canvas, runtime.data);
        } else {
          setRuntimeErrorSafe(result.error ?? "Runtime error.");
        }
      }

      statsFrames += 1;
      if (now - statsStartedAt > 500) {
        setRenderStats({
          fps: statsFrames * 1000 / (now - statsStartedAt),
          ms: lastRenderMs,
        });
        statsStartedAt = now;
        statsFrames = 0;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [setRuntimeErrorSafe]);

  const updateKnob = (index: number, value: number) => {
    setKnobs((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  };

  const updateRange = useCallback((index: number, edge: "min" | "max", value: number) => {
    if (!Number.isFinite(value)) return;

    setRanges((current) => {
      const next = current.map((range): KnobRange => [...range]);
      const previousRange = next[index] ?? [0, 1];
      const previousNormalized = getNormalizedKnobs(knobsRef.current, current)[index] ?? 0.5;
      const updatedRange = updateRangeValue(previousRange, edge, value);
      next[index] = updatedRange;

      const nextKnobValue = updatedRange[0] + previousNormalized * (updatedRange[1] - updatedRange[0]);
      setKnobs((currentKnobs) =>
        currentKnobs.map((knob, knobIndex) => knobIndex === index ? nextKnobValue : knob),
      );
      previousKnobsRef.current = previousKnobsRef.current.map((knob, knobIndex) =>
        knobIndex === index ? nextKnobValue : knob,
      );

      return next;
    });
  }, []);

  const commitRangeEdit = useCallback(() => {
    if (!editingRange) return;

    const nextValue = Number(editingRange.value);
    if (Number.isFinite(nextValue)) {
      updateRange(editingRange.index, editingRange.edge, roundRangeValue(nextValue));
    }
    setEditingRange(null);
  }, [editingRange, updateRange]);

  const finishRangeDrag = useCallback(() => {
    if (!rangeDragRef.current) return;
    rangeDragRef.current = null;
    setActiveRangeId(null);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = rangeDragRef.current;
      if (!drag) return;

      event.preventDefault();
      const dragAmount = (event.clientX - drag.startX) - (event.clientY - drag.startY);
      const stepCount = Math.round(dragAmount / pixelsPerDigitStep);
      updateRange(drag.index, drag.edge, roundRangeValue(drag.startValue + stepCount * drag.step));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishRangeDrag);
    window.addEventListener("pointercancel", finishRangeDrag);
    window.addEventListener("blur", finishRangeDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishRangeDrag);
      window.removeEventListener("pointercancel", finishRangeDrag);
      window.removeEventListener("blur", finishRangeDrag);
    };
  }, [finishRangeDrag, updateRange]);

  const startRangeDrag = (
    event: React.PointerEvent<HTMLElement>,
    index: number,
    edge: "min" | "max",
    step: number,
  ) => {
    if (event.button !== 0) return;

    event.preventDefault();
    setEditingRange(null);
    rangeDragRef.current = {
      index,
      edge,
      startValue: rangesRef.current[index][edge === "min" ? 0 : 1],
      startX: event.clientX,
      startY: event.clientY,
      step,
    };
    setActiveRangeId(`${index}-${edge}`);
  };

  const renderRangeValue = (index: number, edge: "min" | "max") => {
    const value = ranges[index][edge === "min" ? 0 : 1];
    const text = formatRangeControlValue(value);
    const decimalIndex = text.indexOf(".");
    const rangeId = `${index}-${edge}`;

    if (editingRange?.index === index && editingRange.edge === edge) {
      return (
        <input
          className={styles.rangeInput}
          value={editingRange.value}
          autoFocus
          inputMode="decimal"
          onChange={(event) =>
            setEditingRange((current) => current ? { ...current, value: event.target.value } : current)
          }
          onBlur={commitRangeEdit}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setEditingRange(null);
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      );
    }

    return (
      <div
        className={`${styles.rangeValue}${activeRangeId ? ` ${styles.anyRangeDragging}` : ""}${activeRangeId === rangeId ? ` ${styles.rangeDragging}` : ""}`}
        role="spinbutton"
        aria-label={`${knobLabels[index]} ${edge}`}
        aria-valuenow={value}
        onDoubleClick={(event) => {
          event.preventDefault();
          finishRangeDrag();
          setEditingRange({ index, edge, value: formatRangeControlValue(value) });
        }}
      >
        {[...text].map((char, charIndex) => {
          const step = getDigitStep(text, charIndex);
          const isExtraPrecision = decimalIndex >= 0 && charIndex > decimalIndex + 1;
          if (step === null) {
            return (
              <span
                key={`${char}-${charIndex}`}
                className={`${styles.rangeStatic}${isExtraPrecision ? ` ${styles.rangeExtra}` : ""}`}
              >
                {char}
              </span>
            );
          }

          return (
            <span
              key={`${char}-${charIndex}`}
              className={`${styles.rangeDigit}${isExtraPrecision ? ` ${styles.rangeExtra}` : ""}`}
              title={`${step}`}
              onPointerDown={(event) => startRangeDrag(event, index, edge, step)}
            >
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  const resetKnobs = () => {
    const defaults = ranges.map((range, index) => clampToRange(initialKnobs[index] ?? getRangeMidpoint(range), range));
    setKnobs(defaults);
    previousKnobsRef.current = defaults;
  };

  const captureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const label = knobs.map((value, index) => `${knobLabels[index]} ${formatKnob(value)}`).join(" / ");
    const snapshot = {
      id: `${Date.now()}-${snapshots.length}`,
      src: canvas.toDataURL("image/png"),
      label,
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 24));
  };

  const generateSweep = () => {
    const generated = sweepValues.map((value) => {
      const activeRange = ranges[activeSweepKnob] ?? [0, 1];
      const targetValue = activeRange[0] + value * (activeRange[1] - activeRange[0]);
      const targets = knobs.map((knob, index) => index === activeSweepKnob ? targetValue : knob);
      const knobStart = ranges.map(getRangeMidpoint);
      const result = renderPatternStill(code, {
        knobStart,
        knobTargets: targets,
        knobRanges: ranges,
        knobWrap: LOGICAL_KNOB_WRAP,
        knobUnitsPerTurn: LOGICAL_KNOB_UNITS_PER_TURN,
      });
      const src = dataToUrl(result.data);
      return {
        id: `${Date.now()}-${activeSweepKnob}-${value}`,
        src,
        label: `${knobLabels[activeSweepKnob]} ${formatKnob(targetValue)}${result.ok ? "" : " error"}`,
      };
    });
    setSnapshots((current) => [...generated, ...current].slice(0, 24));
  };

  const copyManifest = async () => {
    const payload = {
      matrix: { width: PATTERN_MATRIX_WIDTH, height: PATTERN_MATRIX_HEIGHT },
      knobs: Object.fromEntries(knobs.map((value, index) => [`knob${index + 1}`, value])),
      ranges: Object.fromEntries(ranges.map((range, index) => [`knob${index + 1}`, range])),
      normalizedKnobs: Object.fromEntries(
        getNormalizedKnobs(knobs, ranges).map((value, index) => [`knob${index + 1}`, value]),
      ),
      esp32Cost: cost,
      code,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const copyVariantPrompt = async () => {
    const rangeLines = ranges
      .map((range, index) => `- ${knobLabels[index]} range: ${range[0]} to ${range[1]}, current value: ${knobs[index]}`)
      .join("\n");

    const prompt = `I am writing custom LED patterns in JavaScript for Patternflow's 128x64 LED matrix web preview.

I will give you one existing Patternflow pattern. Use it as a seed, not as a cage. Create exactly 5 distinct standalone variations that explore different visual directions.

Very important output rules:
- Return exactly 5 separate JavaScript code blocks.
- Each code block must be a complete standalone Patternflow pattern.
- Do not combine the 5 variations into one file.
- Do not add a mode selector, preset array, switch statement, or any code that contains multiple patterns in one output.
- Do not write wrapper text inside the code blocks.
- Put a short variation name before each code block.
- Do not include nested triple backticks inside any code block.

Required API for every variation:
- export function setup(params) {}
- export function update(dt, input, params) {}
- export function draw(display, params, time) {}
- Use input.knobValues as the primary control API. input.knobValues is an array of 4 absolute knob values after the min/max ranges are applied.
- input.knobNormalized is also available when a 0.0-1.0 value is useful.
- Keep input.knobDeltas only as compatibility fallback if needed.
- Use display.width and display.height in loops. Do not hardcode 128 or 64 inside draw().
- Use only plain JavaScript and Math.*. No browser APIs, DOM APIs, imports, async code, external libraries, dynamic evaluation, or per-pixel allocations.

Creative control mapping:
- It is okay to keep one knob as animation speed, preferably Knob 2, if that suits the variation.
- Do not keep all four knobs as the same old hue/speed/mode/frequency template unless it is genuinely the best fit.
- Redesign the other controls creatively for each variation. Examples: cell size, symmetry fold, glitch amount, palette split, trail length, scanline spacing, pulse width, inversion threshold, rotation, warp depth, density, edge thickness, phase offset, bloom-like gain, or motif selection.
- Each of the 5 variations should have a slightly different control personality. The controls should reveal the unique idea of that variation.
- Include a short comment near setup() or update() naming what the 4 knobs do for that specific variation.

Color direction:
- Make color part of the pattern logic, not just a global hue wash.
- Avoid relying on a single full-frame gradient or a uniform hue shift across the whole image.
- Prefer colors that respond to local pattern values: distance fields, cell seeds, stripe index, phase, brightness, threshold bands, motion direction, edge thickness, density, or mask state.
- Good examples: large values become red while small values become blue; interior/exterior use different palettes; threshold bands step through 3-5 colors; cell IDs pick related colors; moving fronts leave warmer highlights; thin edges are white while filled regions are saturated.
- Both smooth local gradients and stepped posterized color bands are welcome, as long as the color changes are tied to the geometry or signal of the pattern.
- Keep at least some pixels near full LED brightness.

Variation direction:
- Keep the general intent and the four control roles understandable, but do not copy the original structure too literally.
- At least 3 of the 5 variations must change the main drawing algorithm, not only constants, colors, thresholds, or speed.
- Avoid making all 5 outputs feel like the same pattern with different parameter values.
- Do not reuse the same grid, shape, distance formula, or composition in every variation.
- Give each variation a different dominant idea. Use these five directions:
  1. Structural remix: change the main geometry or repetition system.
  2. Motion remix: change how time moves through the pattern.
  3. Palette/material remix: change color logic, brightness rhythm, or foreground/background relationship.
  4. Domain remix: warp, mirror, fold, scroll, rotate, or otherwise remap coordinates.
  5. Contrast remix: make a clearly different sparse/dense, hard/soft, or organic/mechanical interpretation.
- The variations can be bold. They should still feel related to the seed, but not trapped inside its exact look.
- Keep the patterns bright enough for an LED matrix and reasonably ESP32-friendly.
- Avoid smoothing/lerping knob-controlled values unless the visual idea specifically needs inertia.

Current Pattern Lab controls:
${rangeLines}

Existing pattern:
\`\`\`javascript
${code}
\`\`\``;

    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1200);
  };

  const copyCppPrompt = async () => {
    const rangeLines = ranges
      .map((range, index) => {
        const detentStep = LOGICAL_KNOB_UNITS_PER_TURN[index] / 20;
        return `- ${knobLabels[index]}: min ${range[0]}, max ${range[1]}, current ${knobs[index]}, calibrated encoder step ${roundRangeValue(detentStep)} per detent`;
      })
      .join("\n");

    const prompt = `Convert the JavaScript LED pattern below into a single complete Arduino-compatible C++ header for the Patternflow ESP32-S3 firmware.

## Output format
- One single code block labeled cpp. No prose before or after the block.
- The block must start with #pragma once and end with } // namespace YourPatternName.
- No nested triple backticks inside the block.

## Required interface
Define one unique namespace. Inside it expose exactly these symbols:

    const char* NAME = "Short Name";
    const char* const KNOB_LABELS[4] = {"...", "...", "...", "..."};
    void setup();
    void update(float dt, const InputFrame& input);
    void draw();

Always-required includes:

    #include <Arduino.h>
    #include "config.h"
    #include "src/core_display.h"
    #include "src/core_encoders.h"
    #include "src/core_canvas.h"

Conditional includes — only when actually used in your code:

    #include "src/core_math.h"   // PFMath:: fastSin, fastCos, fract, lerp, approxLength, sin LUT
    #include "src/core_color.h"  // PFColor:: hsvToRgb, ColorStop, sampleRamp
    #include "src/core_noise.h"  // PFNoise:: perlin2D, fractal2D

Other interface rules:
- Use PANEL_RES_W and PANEL_RES_H. Never hardcode 128 or 64.
- All pixel writes go through PFCanvas::setPixel(x, y, r, g, b). Never call dma_display->drawPixelRGB888 directly.
- The last line of draw() must be PFCanvas::present();. Without it nothing reaches the panel.

## DO NOT reimplement existing helpers
The firmware ships tested, optimized versions of these. Using your own breaks shared optimizations (color calibration, sin LUT sharing) and wastes ROM. If the JavaScript source contains an inline hsvToRgb or sin LUT, strip it and call the firmware helper instead.

- DO NOT write your own HSV → RGB converter. Not as a separate function, not inline with a switch statement, not as a chain of fmodf + conditionals. Call PFColor::hsvToRgb(h, s, v, r, g, b). h is normalized 0..1, not degrees.
- DO NOT write your own sin LUT or fast-sin approximation. Call PFMath::buildSinLUT() once in setup(); use PFMath::fastSin / fastCos in draw().
- DO NOT write your own Perlin or fractal noise. Use PFNoise::perlin2D / fractal2D.

## Distance and sqrt — default to sqrtf
Use sqrtf(dx*dx + dy*dy) by default for distance calculations. The ESP32-S3 has a hardware FPU and sqrtf is cheap. Two sqrtf calls per pixel cost under 1 ms per frame on a 128×64 panel.

PFMath::approxLength is an octagonal approximation (~5% error; the isodistance contour is an octagon, not a circle). It is a niche micro-optimization, NOT a default. Using it where distance shapes the visible pattern produces clearly polygonal artifacts on the panel.

DO NOT use approxLength when ANY of the following applies:
- The variable is named radius / dist / r / length and feeds rotation, hue, brightness, or ring placement.
- The expression uses 1/dist or amplification by inverse distance (vortex cores, ripple centers).
- The pattern has visible concentric rings, swirls, ripples, kaleidoscope sectors, or radial gradients.
- The distance is compared to a threshold to draw a shape: if (dist < r) { ... }.
- Multiple distance fields are composed (caustics, wavefronts, beat patterns).
- The output has visible circular structure of any kind.

approxLength is only acceptable when the distance is a purely scalar input to a noise lookup or a non-visual weighting term — i.e. you could not draw the contour even if you tried.

When in doubt, use sqrtf.

## Knob conversion
- The JS preview uses input.knobValues as absolute values (after the Pattern Lab min/max ranges are applied).
- The firmware receives input.knobDeltas — the per-frame change in detents.
- For each knob, store the parameter as state initialized to its current Pattern Lab value below.
- In update(): param += input.knobDeltas[i] * STEP[i]; then constrain to the min/max range.
- Use the calibrated encoder step below as STEP so physical encoders match the live editor and one detent feels the same on both.
- Preserve knob meanings from the JS code (any comments naming the knobs) in KNOB_LABELS.

Pattern Lab knob ranges and current values:
${rangeLines}

## Performance
- Hoist anything that depends only on time, row, or parameters out of the inner pixel loop.
- Prefer multiplication and comparison over expensive functions and branches.
- Use PFMath::fastSin / fastCos inside the pixel loop; restrict sinf/cosf to one-shot computations outside the loop.
- Keep some pixels near full RGB output so LED brightness stays strong.
- Preserve local color logic from the JS — value-based bands, distance-driven hue, threshold steps, etc. The visual character lives in those rules.

## Self-check before output
Before finalizing your code block, verify each of these. If any answer is wrong, fix it.

1. Did I use approxLength anywhere? If yes, is the distance truly invisible to the viewer (no rings, no rotation driver, no 1/dist amplification)? If not certain, change to sqrtf.
2. Did I write my own hsvToRgb, sin LUT, or noise function? If yes, replace with PFColor / PFMath / PFNoise.
3. Does draw() end with PFCanvas::present();?
4. Are all pixel writes via PFCanvas::setPixel? Did I avoid touching dma_display?
5. Do my knob parameters consume input.knobDeltas (not input.knobValues), constrained to the documented range?

## JavaScript source
\`\`\`javascript
${code}
\`\`\``;

    await navigator.clipboard.writeText(prompt);
    setCppPromptCopied(true);
    window.setTimeout(() => setCppPromptCopied(false), 1200);
  };

  return (
    <main className={`${styles.shell}${activeRangeId ? ` ${styles.shellDragging}` : ""}`}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">Patternflow</Link>
        <div className={styles.headerMeta}>
          <span>Pattern Lab</span>
          <span>128 x 64</span>
          <span>{running ? "Running" : "Paused"}</span>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.previewColumn}>
          <div className={styles.previewHeader}>
            <div>
              <h1>Preview</h1>
            </div>
            <div className={styles.stats}>
              <span>{renderStats.fps.toFixed(0)} fps</span>
              <span>{renderStats.ms.toFixed(2)} ms</span>
              <span className={styles[cost.level.toLowerCase()]}>ESP32 {cost.level}</span>
            </div>
          </div>

          <div className={styles.matrixFrame}>
            <canvas
              ref={canvasRef}
              width={PATTERN_MATRIX_WIDTH}
              height={PATTERN_MATRIX_HEIGHT}
              aria-label="Pattern preview"
            />
          </div>

          {runtimeError && (
            <div className={styles.errorBox}>
              {runtimeError}
            </div>
          )}

          <div className={styles.controls}>
            {knobs.map((value, index) => (
              <div key={knobLabels[index]} className={styles.knobControl}>
                <div className={styles.knobHeader}>
                  <span>{knobLabels[index]}</span>
                  <strong>{formatKnob(value)}</strong>
                </div>
                <div className={styles.knobRow}>
                  <label className={styles.rangeEndpoint}>
                    <span>min</span>
                    {renderRangeValue(index, "min")}
                  </label>
                  <input
                    type="range"
                    min={ranges[index][0]}
                    max={ranges[index][1]}
                    step="0.001"
                    value={value}
                    aria-label={`${knobLabels[index]} value`}
                    onChange={(event) => updateKnob(index, Number(event.target.value))}
                  />
                  <label className={styles.rangeEndpoint}>
                    <span>max</span>
                    {renderRangeValue(index, "max")}
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.actionRow}>
            <button type="button" onClick={() => setRunning((value) => !value)}>
              {running ? "Pause" : "Run"}
            </button>
            <button type="button" onClick={resetKnobs}>
              Reset knobs
            </button>
            <button type="button" onClick={captureSnapshot}>
              Snapshot
            </button>
            <button type="button" className={styles.darkButton} onClick={copyManifest}>
              {copied ? "Copied" : "Copy JSON"}
            </button>
          </div>

          <div className={styles.sweepBar}>
            <select
              value={activeSweepKnob}
              onChange={(event) => setActiveSweepKnob(Number(event.target.value))}
              aria-label="Sweep knob"
            >
              {knobLabels.map((label, index) => (
                <option key={label} value={index}>{label}</option>
              ))}
            </select>
            <button type="button" onClick={generateSweep}>
              Sweep
            </button>
          </div>
        </div>

        <div className={styles.editorColumn}>
          <div className={styles.editorHeader}>
            <div>
              <span>JavaScript Pattern</span>
            </div>
            <button type="button" onClick={copyVariantPrompt}>
              {promptCopied ? "Copied" : "Copy 5 variants prompt"}
            </button>
            <button type="button" onClick={copyCppPrompt}>
              {cppPromptCopied ? "Copied" : "Copy C++ prompt"}
            </button>
          </div>
          <div className={styles.editorPane}>
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              overviewRulerLanes: 0,
            }}
          />
          </div>
        </div>
      </section>

      <section className={styles.snapshots} aria-label="Snapshots">
        <div className={styles.snapshotsHeader}>
          <span>Snapshots</span>
          <button type="button" onClick={() => setSnapshots([])}>
            Clear
          </button>
        </div>
        {snapshots.length > 0 ? (
          <ol className={styles.snapshotGrid}>
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={snapshot.src} alt="" />
                <span>{snapshot.label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyState}>No snapshots yet.</p>
        )}
      </section>
    </main>
  );
}
