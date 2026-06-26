"use client";

import Editor from "@monaco-editor/react";
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
import {
  GEMINI_MODEL,
  GEMINI_THINKING_LEVEL,
  ORIENTATIONS,
  THINKING_LEVELS,
  buildVariantCopyPrompt,
  generatePatternVariants,
  loadGeminiKey,
  saveGeminiKey,
  type Orientation,
  type PatternVariant,
  type ThinkingLevelKey,
} from "@/lib/gemini";
import { captureEvent } from "@/lib/posthogEvents";
import SharePatternModal from "@/components/share/SharePatternModal";
import { preset as originPreset } from "@/lib/presets/pattern-origin";
import { livePresets } from "@/lib/presets";
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

type GalleryItem = PatternVariant & { id: string; pinned?: boolean };

// Cap the gallery without ever dropping pinned (kept) items.
function capGallery(items: GalleryItem[]): GalleryItem[] {
  if (items.length <= MAX_GALLERY) return items;
  const pinnedCount = items.reduce((total, item) => total + (item.pinned ? 1 : 0), 0);
  const unpinnedBudget = Math.max(0, MAX_GALLERY - pinnedCount);
  let unpinnedKept = 0;
  const result: GalleryItem[] = [];
  for (const item of items) {
    if (item.pinned) {
      result.push(item);
    } else if (unpinnedKept < unpinnedBudget) {
      result.push(item);
      unpinnedKept += 1;
    }
  }
  return result;
}

type GenJob = {
  id: string;
  count: number;
  thinkingLevel: ThinkingLevelKey;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  resultCount?: number;
  error?: string;
};

const MAX_GALLERY = 48;
const MAX_CONCURRENT_JOBS = 6;
const GEN_COUNT_MIN = 1;
const GEN_COUNT_MAX = 20;
// How many random existing patterns to feed the model as style references. 0 =
// no references at all (rules-only, max-creativity experiment).
const REF_OPTIONS = [0, 3, 6, 10];
const DEFAULT_REF_COUNT = 6;

// Random sample of presets (excluding the current code) to widen generation range.
function sampleExamples(currentCode: string, count: number) {
  if (count <= 0) return [];
  const pool = livePresets.filter((preset) => preset.code !== currentCode);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((preset) => ({ name: preset.name, code: preset.code }));
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// A live gallery card. It runs its own pattern runtime and reads the *current*
// knob values each frame (via shared refs), so turning a knob on the left panel
// updates every preview at once. Clicking the card loads its code into the
// editor. Refs are stable, so the animation loop never restarts on a knob turn.
function VariantPreview({
  code,
  name,
  active,
  selected,
  selectMode,
  pinned,
  knobsRef,
  rangesRef,
  onSelect,
}: {
  code: string;
  name: string;
  active: boolean;
  selected: boolean;
  selectMode: boolean;
  pinned: boolean;
  knobsRef: React.MutableRefObject<number[]>;
  rangesRef: React.MutableRefObject<KnobRange[]>;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runtime = new PatternRuntime();
    const load = runtime.loadCode(code);
    let frameId = 0;
    if (!load.ok) {
      // Report from a frame callback rather than synchronously in the effect body.
      frameId = requestAnimationFrame(() => setError(load.error ?? "Pattern failed to load."));
      return () => cancelAnimationFrame(frameId);
    }
    if (canvasRef.current) paintCanvas(canvasRef.current, runtime.data);

    let previousKnobs = [...knobsRef.current];
    let lastNow = performance.now();
    let simTime = 0;

    const tick = (now: number) => {
      const dt = Math.min(Math.max(0, (now - lastNow) / 1000), 0.05);
      lastNow = now;
      simTime += dt;

      const currentKnobs = knobsRef.current;
      const currentRanges = rangesRef.current;
      const knobDeltas = currentKnobs.map((value, index) =>
        knobTargetToDelta(
          previousKnobs[index] ?? value,
          value,
          LOGICAL_KNOB_WRAP[index],
          LOGICAL_KNOB_UNITS_PER_TURN[index],
        ),
      );
      const knobNormalized = getNormalizedKnobs(currentKnobs, currentRanges);
      previousKnobs = [...currentKnobs];

      const result = runtime.renderFrame(
        dt,
        simTime,
        createIdleInput(knobDeltas, {
          knobValues: currentKnobs,
          knobNormalized,
          knobRanges: currentRanges,
        }),
      );
      if (!result.ok) {
        setError(result.error ?? "Runtime error.");
        return;
      }
      if (canvasRef.current) paintCanvas(canvasRef.current, runtime.data);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [code, knobsRef, rangesRef]);

  return (
    <button
      type="button"
      className={`${styles.variantCard}${active && !selectMode ? ` ${styles.variantCardActive}` : ""}${selected ? ` ${styles.variantCardSelected}` : ""}`}
      onClick={onSelect}
      aria-pressed={selectMode ? selected : undefined}
      title={selectMode ? "Click to select" : "Click to load into the editor"}
    >
      <div className={styles.variantFrame}>
        <canvas
          ref={canvasRef}
          width={PATTERN_MATRIX_WIDTH}
          height={PATTERN_MATRIX_HEIGHT}
          aria-label={`${name} preview`}
        />
        {error && <div className={styles.variantError}>{error}</div>}
        {pinned && (
          <span className={styles.pinBadge} aria-hidden="true">
            PIN
          </span>
        )}
        {selected && (
          <span className={styles.selectBadge} aria-hidden="true">
            ✓
          </span>
        )}
      </div>
      <div className={styles.variantMeta}>
        <strong>{name}</strong>
      </div>
    </button>
  );
}

export default function PatternLabClient() {
  const [code, setCode] = useState(originPreset.code);
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
  const [buttonHelpOpen, setButtonHelpOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeRangeId, setActiveRangeId] = useState<string | null>(null);
  const [editingRange, setEditingRange] = useState<RangeEditState | null>(null);
  const [geminiKey, setGeminiKey] = useState(loadGeminiKey);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [jobs, setJobs] = useState<GenJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genThinking, setGenThinking] = useState<ThinkingLevelKey>(GEMINI_THINKING_LEVEL);
  const [genOrientation, setGenOrientation] = useState<Orientation>("landscape");
  const [genRefs, setGenRefs] = useState(DEFAULT_REF_COUNT);
  const [editorView, setEditorView] = useState<"code" | "gallery">("code");
  const [now, setNow] = useState(0);
  const removedJobsRef = useRef<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PatternRuntime | null>(null);
  const knobsRef = useRef(knobs);
  const previousKnobsRef = useRef(initialKnobs);
  const runningRef = useRef(running);
  const simTimeRef = useRef(0);
  const runtimeErrorRef = useRef<string | null>(null);
  const rangesRef = useRef(ranges);
  const rangeDragRef = useRef<RangeDragState | null>(null);
  const btnHeldRef = useRef([false, false, false, false]);
  const btnPressPendingRef = useRef([false, false, false, false]);

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

  // Tick `now` once a second while any job runs so elapsed timers update.
  useEffect(() => {
    if (!jobs.some((job) => job.status === "running")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [jobs]);

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

      const btnHeld = [...btnHeldRef.current];
      const btnPressed = [...btnPressPendingRef.current];
      btnPressPendingRef.current = [false, false, false, false];

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
            btnPressed,
            btnHeld,
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

  const pressButton = (index: number) => {
    if (btnHeldRef.current[index]) return;
    btnHeldRef.current[index] = true;
    btnPressPendingRef.current[index] = true;
  };

  const releaseButton = (index: number) => {
    btnHeldRef.current[index] = false;
  };

  useEffect(() => {
    const releaseAll = () => {
      btnHeldRef.current = [false, false, false, false];
    };
    window.addEventListener("pointerup", releaseAll);
    window.addEventListener("pointercancel", releaseAll);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("pointerup", releaseAll);
      window.removeEventListener("pointercancel", releaseAll);
      window.removeEventListener("blur", releaseAll);
    };
  }, []);

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
    await navigator.clipboard.writeText(buildVariantCopyPrompt(code, knobs, ranges));
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1200);
  };

  const openKeyModal = () => {
    setKeyDraft(geminiKey);
    setKeyModalOpen(true);
  };

  const saveKey = () => {
    const next = keyDraft.trim();
    saveGeminiKey(next);
    setGeminiKey(next);
    setKeyModalOpen(false);
  };

  const clearKey = () => {
    saveGeminiKey("");
    setGeminiKey("");
    setKeyDraft("");
  };

  const runningJobs = jobs.filter((job) => job.status === "running").length;

  // Fire a generation as an independent background job. Multiple can run at once;
  // each captures the current code/knobs as its seed and reports back on its own.
  const fireGeneration = () => {
    if (!geminiKey) {
      openKeyModal();
      return;
    }
    if (runningJobs >= MAX_CONCURRENT_JOBS) return;

    const count = Math.min(GEN_COUNT_MAX, Math.max(GEN_COUNT_MIN, Math.round(genCount) || 1));
    const thinkingLevel = genThinking;
    const jobId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const job: GenJob = { id: jobId, count, thinkingLevel, status: "running", startedAt: Date.now() };
    setJobs((current) => [job, ...current]);
    setEditorView("gallery");

    const seedKnobs = [...knobs];
    const seedRanges = ranges.map((range): KnobRange => [...range]);
    const examples = sampleExamples(code, genRefs);
    const seedWithCurrent = genRefs > 0;

    generatePatternVariants({ apiKey: geminiKey, code, knobs: seedKnobs, ranges: seedRanges, count, thinkingLevel, examples, orientation: genOrientation, seedWithCurrent })
      .then((items) => {
        if (removedJobsRef.current.has(jobId)) return;
        const stamped: GalleryItem[] = items.map((item, index) => ({ ...item, id: `${jobId}-${index}` }));
        setGallery((current) => capGallery([...stamped, ...current]));
        setJobs((current) =>
          current.map((entry) =>
            entry.id === jobId
              ? { ...entry, status: "done", finishedAt: Date.now(), resultCount: items.length }
              : entry,
          ),
        );
        captureEvent("pattern_lab_generate_variants", {
          model: GEMINI_MODEL,
          requested: count,
          count: items.length,
          thinking: thinkingLevel,
          ms: Date.now() - job.startedAt,
        });
      })
      .catch((error) => {
        if (removedJobsRef.current.has(jobId)) return;
        const message = error instanceof Error ? error.message : "Generation failed.";
        setJobs((current) =>
          current.map((entry) =>
            entry.id === jobId ? { ...entry, status: "error", finishedAt: Date.now(), error: message } : entry,
          ),
        );
        captureEvent("pattern_lab_generate_variants_error", {
          model: GEMINI_MODEL,
          requested: count,
          thinking: thinkingLevel,
          message,
        });
      });
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set([...jobs.map((job) => job.id), ...gallery.map((item) => item.id)]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const onCardActivate = (item: GalleryItem) => {
    if (selectMode) toggleSelected(item.id);
    else setCode(item.code);
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    selected.forEach((id) => removedJobsRef.current.add(id));
    setJobs((current) => current.filter((job) => !selected.has(job.id)));
    setGallery((current) => current.filter((item) => !selected.has(item.id)));
    setSelected(new Set());
  };

  const selectedGalleryItems = gallery.filter((item) => selected.has(item.id));
  const allSelectedPinned =
    selectedGalleryItems.length > 0 && selectedGalleryItems.every((item) => item.pinned);
  const pinnedCount = gallery.reduce((total, item) => total + (item.pinned ? 1 : 0), 0);

  // Pin (keep) the selected patterns at the top, or unpin if they are all pinned.
  const togglePinSelected = () => {
    if (selectedGalleryItems.length === 0) return;
    const pinnedTarget = !allSelectedPinned;
    setGallery((current) =>
      current.map((item) => (selected.has(item.id) ? { ...item, pinned: pinnedTarget } : item)),
    );
  };

  // Delete everything that is not pinned — the "keep my favorites, drop the rest" button.
  const clearUnpinned = () => {
    setGallery((current) => current.filter((item) => item.pinned));
  };

  const clearFinishedJobs = () => {
    setJobs((current) => current.filter((job) => job.status === "running"));
    setSelected((current) => {
      const finishedIds = new Set(
        jobs.filter((job) => job.status !== "running").map((job) => job.id),
      );
      const next = new Set([...current].filter((id) => !finishedIds.has(id)));
      return next;
    });
  };

  const buildCppPrompt = () => {
    const rangeLines = ranges
      .map((range, index) => {
        const detentStep = LOGICAL_KNOB_UNITS_PER_TURN[index] / 20;
        return `- ${knobLabels[index]}: min ${range[0]}, max ${range[1]}, current ${knobs[index]}, calibrated encoder step ${roundRangeValue(detentStep)} per detent`;
      })
      .join("\n");

    return `Convert the JavaScript LED pattern below into a single complete Arduino-compatible C++ header for the Patternflow ESP32-S3 firmware.

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
- Encoder buttons map 1:1: JS input.btnPressed[i] / input.btnHeld[i] become C++ input.btnPressed[i] / input.btnHeld[i] (same bool[4] semantics — edge vs level). If the JS pattern resets, freezes, or triggers on a button, keep that. Never consume long-press; that gesture is reserved for the firmware mode switcher.

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

  };

  const copyCppPrompt = async () => {
    await navigator.clipboard.writeText(buildCppPrompt());
    setCppPromptCopied(true);
    window.setTimeout(() => setCppPromptCopied(false), 1200);
  };

  return (
    <main className={`${styles.shell}${activeRangeId ? ` ${styles.shellDragging}` : ""}`}>
      <section className={styles.workspace}>
        <div className={styles.previewColumn}>
          <div className={styles.previewHeader}>
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
                  <div className={styles.knobHeaderMeta}>
                    <strong>{formatKnob(value)}</strong>
                    <button
                      type="button"
                      className={styles.knobButton}
                      aria-label={`${knobLabels[index]} button`}
                      title="Encoder button (short press)"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        pressButton(index);
                      }}
                      onPointerUp={() => releaseButton(index)}
                      onPointerLeave={() => releaseButton(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          pressButton(index);
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          releaseButton(index);
                        }
                      }}
                    >
                      Push
                    </button>
                  </div>
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
            <button type="button" className={styles.darkButton} onClick={() => setShareOpen(true)}>
              Share to Discord
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
            <div className={styles.viewToggle}>
              <button
                type="button"
                data-active={editorView === "code"}
                onClick={() => setEditorView("code")}
              >
                Code
              </button>
              <button
                type="button"
                data-active={editorView === "gallery"}
                onClick={() => setEditorView("gallery")}
              >
                Gallery{gallery.length > 0 ? ` (${gallery.length})` : ""}
              </button>
            </div>
            <div className={styles.editorActions}>
              {editorView === "gallery" ? (
                <>
                  <label className={styles.genField} title="How many variations per run (1–20)">
                    <span>n</span>
                    <input
                      type="number"
                      min={GEN_COUNT_MIN}
                      max={GEN_COUNT_MAX}
                      value={genCount}
                      aria-label="Variations per run"
                      onChange={(event) =>
                        setGenCount(
                          Math.min(
                            GEN_COUNT_MAX,
                            Math.max(GEN_COUNT_MIN, Math.round(Number(event.target.value)) || GEN_COUNT_MIN),
                          ),
                        )
                      }
                    />
                  </label>
                  <select
                    className={styles.genThinking}
                    value={genThinking}
                    aria-label="Thinking level"
                    title="Reasoning depth — higher is slower but more varied"
                    onChange={(event) => setGenThinking(event.target.value as ThinkingLevelKey)}
                  >
                    {THINKING_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.genThinking}
                    value={genOrientation}
                    aria-label="Orientation"
                    title="Dominant flow direction the pattern is designed for"
                    onChange={(event) => setGenOrientation(event.target.value as Orientation)}
                  >
                    {ORIENTATIONS.map((option) => (
                      <option key={option} value={option}>
                        {option === "landscape"
                          ? "horizontal"
                          : option === "portrait"
                            ? "vertical"
                            : "any dir"}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.genThinking}
                    value={genRefs}
                    aria-label="Reference examples"
                    title="How many existing patterns to show the model as references. No refs = rules only, most creative."
                    onChange={(event) => setGenRefs(Number(event.target.value))}
                  >
                    {REF_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option === 0 ? "no refs" : `${option} refs`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={fireGeneration}
                    disabled={runningJobs >= MAX_CONCURRENT_JOBS}
                    title={
                      runningJobs >= MAX_CONCURRENT_JOBS
                        ? `Max ${MAX_CONCURRENT_JOBS} runs at once`
                        : "Queue a generation run"
                    }
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    className={styles.keyButton}
                    onClick={openKeyModal}
                    title={geminiKey ? "Gemini key set — click to change" : "Set Gemini API key"}
                    aria-label="Gemini API key"
                  >
                    {geminiKey ? "Key ✓" : "Key"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={copyVariantPrompt}>
                    {promptCopied ? "Copied" : "Copy prompt"}
                  </button>
                  <button type="button" onClick={copyCppPrompt}>
                    {cppPromptCopied ? "Copied" : "Copy C++ prompt"}
                  </button>
                  <button
                    type="button"
                    className={styles.guideButton}
                    onClick={() => setButtonHelpOpen(true)}
                  >
                    Code guide
                  </button>
                </>
              )}
            </div>
          </div>
          <div className={styles.editorPane}>
            {editorView === "code" ? (
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
            ) : (
              <div className={styles.galleryPane}>
                {jobs.length > 0 && (
                  <div className={styles.queue}>
                    <div className={styles.queueHeader}>
                      <span>Queue</span>
                      {jobs.some((job) => job.status !== "running") && (
                        <button type="button" onClick={clearFinishedJobs}>
                          Clear finished
                        </button>
                      )}
                    </div>
                    <ul className={styles.queueList}>
                      {jobs.map((job) => {
                        const elapsed = (job.finishedAt ?? Math.max(now, job.startedAt)) - job.startedAt;
                        return (
                          <li key={job.id} className={styles.jobRow} data-status={job.status}>
                            {selectMode && (
                              <input
                                type="checkbox"
                                checked={selected.has(job.id)}
                                onChange={() => toggleSelected(job.id)}
                                aria-label="Select job"
                              />
                            )}
                            <span className={styles.jobDot} aria-hidden />
                            <span className={styles.jobLabel}>
                              {job.status === "running"
                                ? `Generating ${job.count}…`
                                : job.status === "done"
                                  ? `Done · ${job.resultCount ?? job.count} pattern${(job.resultCount ?? job.count) === 1 ? "" : "s"}`
                                  : "Failed"}
                              <em>{job.thinkingLevel.toLowerCase()}</em>
                            </span>
                            {job.status === "error" && job.error && (
                              <span className={styles.jobError} title={job.error}>
                                {job.error}
                              </span>
                            )}
                            <span className={styles.jobTime}>{formatDuration(elapsed)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {(gallery.length > 0 || jobs.length > 0) && (
                  <div className={styles.galleryToolbar}>
                    {selectMode ? (
                      <>
                        <button
                          type="button"
                          className={styles.toolbarActive}
                          onClick={exitSelectMode}
                        >
                          Done
                        </button>
                        <button type="button" onClick={selectAll}>
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={togglePinSelected}
                          disabled={selectedGalleryItems.length === 0}
                        >
                          {allSelectedPinned ? "Unpin" : "Pin"}
                          {selectedGalleryItems.length > 0 ? ` (${selectedGalleryItems.length})` : ""}
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={deleteSelected}
                          disabled={selected.size === 0}
                        >
                          Delete{selected.size > 0 ? ` (${selected.size})` : ""}
                        </button>
                        <span className={styles.toolbarHint}>
                          {selected.size} selected — click items to toggle
                        </span>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setSelectMode(true)}>
                          Select
                        </button>
                        {pinnedCount > 0 && pinnedCount < gallery.length && (
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={clearUnpinned}
                          >
                            Delete unpinned ({gallery.length - pinnedCount})
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {gallery.length === 0 ? (
                  jobs.length === 0 && (
                    <p className={styles.emptyState}>
                      No variants yet — set a count and hit Generate. Click any card to load it into
                      the editor.
                    </p>
                  )
                ) : (
                  <ol className={styles.galleryGrid}>
                    {[...gallery]
                      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                      .map((item) => (
                        <li key={item.id}>
                          <VariantPreview
                            code={item.code}
                            name={item.name}
                            active={item.code === code}
                            selected={selected.has(item.id)}
                            selectMode={selectMode}
                            pinned={Boolean(item.pinned)}
                            knobsRef={knobsRef}
                            rangesRef={rangesRef}
                            onSelect={() => onCardActivate(item)}
                          />
                        </li>
                      ))}
                  </ol>
                )}
              </div>
            )}
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

      {buttonHelpOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Code guide"
          onClick={() => setButtonHelpOpen(false)}
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Code guide — encoder buttons</span>
              <button type="button" onClick={() => setButtonHelpOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                A pattern is plain JavaScript that exports three functions. Only{" "}
                <code>draw</code> is required.
              </p>
              <pre>{`export function setup(params) {}              // runs once on load
export function update(dt, input, params) {}  // runs each frame, before draw
export function draw(display, params, time) {} // runs each frame`}</pre>
              <p>
                Store your state on the <code>params</code> object — it persists between frames.{" "}
                <code>dt</code> is the seconds elapsed since the last frame, <code>time</code> the
                seconds since load.
              </p>

              <h4>Controls — the input object</h4>
              <ul>
                <li>
                  <code>input.knobValues[i]</code> — the knob&apos;s absolute value after its
                  min/max range is applied. This is the primary control API.
                </li>
                <li>
                  <code>input.knobNormalized[i]</code> — the same knob remapped to{" "}
                  <code>0.0–1.0</code>, handy for blends.
                </li>
                <li>
                  <code>input.knobRanges[i]</code> — the <code>[min, max]</code> pair set by the
                  range fields under each knob.
                </li>
                <li>
                  <code>input.knobDeltas[i]</code> — per-frame change in encoder detents
                  (hardware-style); keep only as a fallback.
                </li>
                <li>
                  <code>input.btnPressed[i]</code> — true only on the frame button <code>i</code> is
                  pressed (edge). Use for one-shot actions: reset, cycle, snapshot, trigger.
                </li>
                <li>
                  <code>input.btnHeld[i]</code> — true while button <code>i</code> is held down
                  (level). Use for momentary holds: freeze, boost, reveal.
                </li>
              </ul>
              <p className={styles.modalNote}>
                <code>i</code> is <code>0–3</code>, matching Knob 1–4. Press a knob&apos;s{" "}
                <code>Push</code> button in the controls panel to fire its button flags.
              </p>

              <h4>Encoder buttons</h4>
              <pre>{`export function update(dt, input, params) {
  if (input.btnPressed[0]) params.hue = 0;     // reset on tap
  if (input.btnHeld[1]) params.frozen = true;   // act while held
}`}</pre>
              <p className={styles.modalNote}>
                Long-press is reserved for the firmware mode switcher — don&apos;t build
                mode-switching on the buttons. The Origin preset taps each knob to reset that value.
              </p>

              <h4>Drawing</h4>
              <ul>
                <li>
                  <code>display.width</code> / <code>display.height</code> — loop with these, never
                  hardcode 128 or 64.
                </li>
                <li>
                  <code>display.setPixel(x, y, r, g, b)</code> — write one pixel; <code>r/g/b</code>{" "}
                  are <code>0–255</code>.
                </li>
              </ul>
              <p className={styles.modalNote}>
                Use only plain JavaScript and <code>Math.*</code> — no DOM, imports, async, or
                per-pixel allocations. The two prompt buttons generate AI variations of the current
                pattern, or convert it into ESP32 firmware.
              </p>
            </div>
          </div>
        </div>
      )}

      {shareOpen && (
        <SharePatternModal
          code={code}
          cppConvertPrompt={buildCppPrompt()}
          onClose={() => setShareOpen(false)}
        />
      )}

      {keyModalOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Gemini API key"
          onClick={() => setKeyModalOpen(false)}
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Gemini API key</span>
              <button type="button" onClick={() => setKeyModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                Bring your own Google AI Studio key to generate variations in-app. It is stored only
                in this browser (localStorage) and sent directly to Google — never to our servers.
              </p>
              <input
                className={`${styles.keyField} ph-no-capture`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="AIza…"
                value={keyDraft}
                aria-label="Gemini API key"
                onChange={(event) => setKeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveKey();
                  if (event.key === "Escape") setKeyModalOpen(false);
                }}
              />
              <p className={styles.modalNote}>
                Get a free key at aistudio.google.com/apikey. The key never leaves your browser
                except to call Google directly.
              </p>
              <div className={styles.variantActions} style={{ marginTop: 12 }}>
                <button type="button" onClick={saveKey}>
                  Save
                </button>
                {geminiKey && (
                  <button type="button" onClick={clearKey}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
