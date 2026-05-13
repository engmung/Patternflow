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
import { sdfRunesPattern } from "@/lib/patternSamples";
import styles from "./PatternLab.module.css";

const knobLabels = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];
const initialKnobs = [0.5, 0.5, 0.5, 0.5];
const defaultRanges: KnobRange[] = [[0, 1], [0, 1], [0, 1], [0, 1]];
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
  const [activeRangeId, setActiveRangeId] = useState<string | null>(null);

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
        knobTargetToDelta(previousKnobs[index] ?? 0.5, value),
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

    return (
      <div
        className={`${styles.rangeValue}${activeRangeId ? ` ${styles.anyRangeDragging}` : ""}${activeRangeId === rangeId ? ` ${styles.rangeDragging}` : ""}`}
        role="spinbutton"
        aria-label={`${knobLabels[index]} ${edge}`}
        aria-valuenow={value}
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
    const midpoints = ranges.map(getRangeMidpoint);
    setKnobs(midpoints);
    previousKnobsRef.current = midpoints;
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
      const result = renderPatternStill(code, { knobStart, knobTargets: targets, knobRanges: ranges });
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
