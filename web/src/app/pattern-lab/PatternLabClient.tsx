"use client";

import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeEsp32Cost } from "@/lib/esp32CostAnalyzer";
import {
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  PatternRuntime,
  RAMP_MODES,
  buildRampLUT,
  createIdleInput,
  knobTargetToDelta,
  renderPatternStill,
  sampleRamp,
  type ColorRamp,
  type RampMode,
} from "@/lib/patternHarness";
import {
  LOGICAL_KNOB_DEFAULTS,
  LOGICAL_KNOB_RANGES,
  LOGICAL_KNOB_UNITS_PER_TURN,
  LOGICAL_KNOB_WRAP,
} from "@/lib/patternflowControls";
import {
  COLOR_MODES,
  GEMINI_MODEL,
  GEMINI_THINKING_LEVEL,
  ORIENTATIONS,
  THINKING_LEVELS,
  buildVariantCopyPrompt,
  generatePatternVariants,
  loadGeminiKey,
  saveGeminiKey,
  type ColorMode,
  type Orientation,
  type PatternVariant,
  type ThinkingLevelKey,
} from "@/lib/gemini";
import {
  DEFAULT_PATCH,
  MAX_PATCH_LAYERS,
  PATCH_BLENDS,
  PATCH_GENERATORS,
  PATCH_RANGES,
  buildPatchCode,
  createPatchLayer,
  type PatchKnob,
  type PatchLayer,
  type PatchState,
} from "@/lib/patternPatch";
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

// ── Color ramp (value-field coloring) ──────────────────────────────────────
// UI state keeps hex strings for <input type="color">; the harness ColorRamp
// (RGB tuples) is derived via useMemo.

type RampStopState = { position: number; color: string };
type RampState = { stops: RampStopState[]; mode: RampMode; wrap: boolean };

const DEFAULT_RAMP: RampState = {
  stops: [
    { position: 0, color: "#081840" },
    { position: 0.55, color: "#ff4d00" },
    { position: 1, color: "#ffe89a" },
  ],
  mode: "linear",
  wrap: false,
};

const RAMP_STORAGE = "patternflow_ramp_v1";
const MAX_RAMP_STOPS = 8;

function loadStoredRamp(): RampState {
  if (typeof window === "undefined") return DEFAULT_RAMP;
  try {
    const raw = window.localStorage.getItem(RAMP_STORAGE);
    if (!raw) return DEFAULT_RAMP;
    const parsed = JSON.parse(raw) as Partial<RampState>;
    if (!Array.isArray(parsed.stops) || parsed.stops.length === 0) return DEFAULT_RAMP;
    return {
      stops: parsed.stops
        .slice(0, MAX_RAMP_STOPS)
        .map((stop) => ({
          position: Math.max(0, Math.min(1, Number(stop?.position) || 0)),
          color: /^#[0-9a-fA-F]{6}$/.test(String(stop?.color)) ? String(stop.color) : "#ffffff",
        })),
      mode: RAMP_MODES.includes(parsed.mode as RampMode) ? (parsed.mode as RampMode) : "linear",
      wrap: Boolean(parsed.wrap),
    };
  } catch {
    return DEFAULT_RAMP;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${((toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).padStart(6, "0")}`;
}

const PATCH_STORAGE = "patternflow_patch_v1";

function loadStoredPatch(): PatchState {
  if (typeof window === "undefined") return DEFAULT_PATCH;
  try {
    const raw = window.localStorage.getItem(PATCH_STORAGE);
    if (!raw) return DEFAULT_PATCH;
    const parsed = JSON.parse(raw) as PatchState;
    if (!Array.isArray(parsed.layers) || parsed.layers.length === 0) return DEFAULT_PATCH;
    return parsed;
  } catch {
    return DEFAULT_PATCH;
  }
}

// Demo pattern for the value-field workflow: pure 0..1 field via setValue,
// color comes entirely from the Color Ramp panel.
const VFIELD_DEMO_CODE = `// V-field demo — this pattern outputs only a 0..1 value field.
// Color comes from the Color Ramp panel, not from this code.
// Knobs: 1 = warp, 2 = speed, 3 = zoom, 4 = bands (0 = smooth)

export function setup(params) {
  params.t = 0;
}

export function update(dt, input, params) {
  const kn = input.knobNormalized || [0.5, 0.5, 0.5, 0.5];
  params.warp = kn[0] * 2.2;
  params.speed = input.knobValues ? input.knobValues[1] : 1.0;
  params.zoom = 0.6 + kn[2] * 2.4;
  params.bands = Math.round(kn[3] * 8);
  params.t += dt * params.speed * 0.6;
}

export function draw(display, params, time) {
  const w = display.width;
  const h = display.height;
  const t = params.t;
  const zoom = params.zoom;
  const cx = 0.5 + 0.22 * Math.sin(t * 0.7);
  const cy = 0.5 + 0.22 * Math.cos(t * 0.9);

  for (let y = 0; y < h; y++) {
    const ny = (y / h - 0.5);
    for (let x = 0; x < w; x++) {
      const nx = (x / h - w / h * 0.5);
      const dx = x / h - cx * (w / h);
      const dy = y / h - cy;
      const ring = Math.sin((dx * dx + dy * dy) * 14 * zoom - t * 2.0);
      const wave = Math.sin(nx * 6 * zoom + t + params.warp * Math.sin(ny * 5 * zoom - t * 0.8));
      let v = 0.5 + 0.25 * ring + 0.25 * wave;
      if (params.bands > 1) {
        v = Math.floor(v * params.bands) / (params.bands - 1);
      }
      display.setValue(x, y, v);
    }
  }
}`;

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
  rampRef,
  recolorRef,
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
  rampRef: React.MutableRefObject<ColorRamp>;
  recolorRef: React.MutableRefObject<boolean>;
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

      // Ramp is shared with the main preview; identity check keeps this free.
      if (runtime.ramp !== rampRef.current) runtime.setRamp(rampRef.current);
      runtime.recolor = recolorRef.current;

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
  }, [code, knobsRef, rangesRef, rampRef, recolorRef]);

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
  const [genColorMode, setGenColorMode] = useState<ColorMode>("vfield");
  const [rampState, setRampState] = useState<RampState>(loadStoredRamp);
  const [recolor, setRecolor] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [editorView, setEditorView] = useState<"code" | "gallery" | "experiment">("code");
  const [patch, setPatch] = useState<PatchState>(loadStoredPatch);
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

  // The Experiment tab renders its layer patch by compiling it to ordinary
  // pattern code and feeding the same runtime; everything downstream (ramp,
  // cost, prompts) just sees code.
  const patchCode = useMemo(() => buildPatchCode(patch), [patch]);
  const activeCode = editorView === "experiment" ? patchCode : code;

  const cost = useMemo(() => analyzeEsp32Cost(activeCode), [activeCode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PATCH_STORAGE, JSON.stringify(patch));
    } catch {
      // Ignore private-mode / storage-disabled sessions.
    }
  }, [patch]);

  const updatePatch = (patchUpdate: Partial<PatchState>) => {
    setPatch((current) => ({ ...current, ...patchUpdate }));
  };

  const updatePatchLayer = (index: number, layerUpdate: Partial<PatchLayer>) => {
    setPatch((current) => ({
      ...current,
      layers: current.layers.map((layer, layerIndex) =>
        layerIndex === index ? { ...layer, ...layerUpdate } : layer,
      ),
    }));
  };

  const addPatchLayer = () => {
    setPatch((current) =>
      current.layers.length >= MAX_PATCH_LAYERS
        ? current
        : { ...current, layers: [...current.layers, createPatchLayer(current.layers.length)] },
    );
  };

  const removePatchLayer = (index: number) => {
    setPatch((current) =>
      current.layers.length <= 1
        ? current
        : { ...current, layers: current.layers.filter((_, layerIndex) => layerIndex !== index) },
    );
  };

  const sendPatchToEditor = () => {
    setCode(patchCode);
    setEditorView("code");
  };

  // ── Patch knob bindings ──
  // A bound slider is driven by the knob (normalized onto the slider's range);
  // the select next to each slider picks the knob. -1 = unbound.
  const knLive = getNormalizedKnobs(knobs, ranges);

  const isKnobBound = (knob: PatchKnob | undefined): knob is number =>
    typeof knob === "number" && knob >= 0 && knob <= 3;

  const patchParamValue = (
    knob: PatchKnob | undefined,
    value: number,
    range: readonly [number, number],
  ) => (isKnobBound(knob) ? range[0] + knLive[knob] * (range[1] - range[0]) : value);

  const renderBindSelect = (
    knob: PatchKnob | undefined,
    onChange: (knob: number) => void,
    label: string,
  ) => (
    <select
      className={styles.patchBind}
      value={isKnobBound(knob) ? knob : -1}
      aria-label={`${label} knob binding`}
      title="Drive this slider with a knob (K1–K4). Bound sliders follow the knob and become the pattern's knobs in C++."
      onChange={(event) => onChange(Number(event.target.value))}
    >
      <option value={-1}>–</option>
      <option value={0}>K1</option>
      <option value={1}>K2</option>
      <option value={2}>K3</option>
      <option value={3}>K4</option>
    </select>
  );

  // Derived harness ramp — referentially stable so per-frame identity checks
  // in the render loops only trigger a LUT rebuild when the ramp truly changed.
  const ramp = useMemo<ColorRamp>(
    () => ({
      stops: rampState.stops.map((stop) => ({
        position: stop.position,
        color: hexToRgb(stop.color),
      })),
      mode: rampState.mode,
      wrap: rampState.wrap,
    }),
    [rampState],
  );
  const rampRef = useRef(ramp);
  const recolorRef = useRef(recolor);
  const rampBarRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    rampRef.current = ramp;
  }, [ramp]);

  useEffect(() => {
    recolorRef.current = recolor;
  }, [recolor]);

  // Persist the ramp across sessions (best effort).
  useEffect(() => {
    try {
      window.localStorage.setItem(RAMP_STORAGE, JSON.stringify(rampState));
    } catch {
      // Ignore private-mode / storage-disabled sessions.
    }
  }, [rampState]);

  // Paint the gradient preview bar whenever the ramp changes.
  useEffect(() => {
    const canvas = rampBarRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const lut = buildRampLUT(ramp);
    const imageData = context.createImageData(256, 1);
    for (let i = 0; i < 256; i++) {
      imageData.data[i * 4] = lut[i * 3];
      imageData.data[i * 4 + 1] = lut[i * 3 + 1];
      imageData.data[i * 4 + 2] = lut[i * 3 + 2];
      imageData.data[i * 4 + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
  }, [ramp]);

  const updateRampStop = useCallback((index: number, patch: Partial<RampStopState>) => {
    setRampState((current) => ({
      ...current,
      stops: current.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, ...patch } : stop,
      ),
    }));
  }, []);

  // ── Gradient-editor interactions: click bar = add stop, drag line = move,
  // click line = select, Delete = remove. ──
  const rampTrackRef = useRef<HTMLDivElement | null>(null);
  const stopDragRef = useRef<{ index: number } | null>(null);

  const rampPositionFromClientX = useCallback((clientX: number) => {
    const track = rampTrackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const raw = (clientX - rect.left) / rect.width;
    return Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = stopDragRef.current;
      if (!drag) return;
      event.preventDefault();
      updateRampStop(drag.index, { position: rampPositionFromClientX(event.clientX) });
    };
    const endDrag = () => {
      stopDragRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, [rampPositionFromClientX, updateRampStop]);

  const addRampStop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (rampState.stops.length >= MAX_RAMP_STOPS) return;
    event.preventDefault();
    const position = rampPositionFromClientX(event.clientX);
    // New stop inherits the ramp's current color at that spot, so adding a
    // stop never visibly changes the gradient until the user recolors it.
    const [r, g, b] = sampleRamp(ramp, position);
    const newIndex = rampState.stops.length;
    setRampState((current) => ({
      ...current,
      stops: [...current.stops, { position, color: rgbToHex(r, g, b) }],
    }));
    setSelectedStopIndex(newIndex);
    stopDragRef.current = { index: newIndex };
  };

  const startStopDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedStopIndex(index);
    stopDragRef.current = { index };
  };

  const deleteRampStop = (index: number) => {
    setRampState((current) => {
      if (current.stops.length <= 1) return current;
      return { ...current, stops: current.stops.filter((_, stopIndex) => stopIndex !== index) };
    });
    setSelectedStopIndex((current) => {
      if (current === index) return 0;
      return current > index ? current - 1 : current;
    });
  };

  const activeStopIndex = Math.min(selectedStopIndex, rampState.stops.length - 1);
  const activeStop = rampState.stops[activeStopIndex];

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
    const timeout = window.setTimeout(() => loadCode(activeCode), 180);
    return () => window.clearTimeout(timeout);
  }, [activeCode, loadCode]);

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
        if (runtime.ramp !== rampRef.current) runtime.setRamp(rampRef.current);
        runtime.recolor = recolorRef.current;
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
      const result = renderPatternStill(activeCode, {
        knobStart,
        knobTargets: targets,
        knobRanges: ranges,
        knobWrap: LOGICAL_KNOB_WRAP,
        knobUnitsPerTurn: LOGICAL_KNOB_UNITS_PER_TURN,
        ramp,
        recolor,
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
      code: activeCode,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const copyVariantPrompt = async () => {
    await navigator.clipboard.writeText(buildVariantCopyPrompt(activeCode, knobs, ranges, genColorMode));
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
    const examples = sampleExamples(activeCode, genRefs);
    const seedWithCurrent = genRefs > 0;

    generatePatternVariants({ apiKey: geminiKey, code: activeCode, knobs: seedKnobs, ranges: seedRanges, count, thinkingLevel, examples, orientation: genOrientation, seedWithCurrent, colorMode: genColorMode })
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
          color_mode: genColorMode,
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

    // Value-field patterns carry no color of their own — bake the user's ramp
    // into the generated C++ so the device matches the web preview exactly.
    const usesValueField = /display\s*\.\s*setValue\s*\(/.test(activeCode);
    const rampModeNotes: Record<RampMode, string> = {
      linear: "straight sRGB lerp between neighboring stops",
      smooth: "sRGB lerp with smoothstep easing (t*t*(3-2*t)) applied per segment",
      step: "hard bands — each stop's color holds until the next stop position",
      hsvShort: "interpolate in HSV space taking the SHORTEST hue path (use PFColor::hsvToRgb)",
      hsvLong: "interpolate in HSV space taking the LONGEST hue path around the wheel (use PFColor::hsvToRgb)",
    };
    const rampSection = usesValueField
      ? `
## Color ramp (value-field pattern)
This pattern writes a scalar field via display.setValue(x, y, v) with v in 0..1 and has NO color logic of its own. The user designed this exact color ramp in Pattern Lab — bake it in verbatim, do not restyle it:

Ramp stops (position -> sRGB):
${rampState.stops
  .map((stop) => {
    const [r, g, b] = hexToRgb(stop.color);
    return `- ${stop.position.toFixed(3)} -> rgb(${r}, ${g}, ${b})`;
  })
  .join("\n")}
Interpolation: ${rampState.mode} (${rampModeNotes[rampState.mode]}).
Wrap: ${rampState.wrap ? "yes — the ramp is cyclic; past the last stop blend back into the first across the 1->0 seam" : "no — clamp to the first/last stop color outside the stop range"}.

Implementation rules:
- In setup(), build a 256-entry lookup table once: static uint8_t RAMP_LUT[256][3]; fill it by interpolating the stops above with the interpolation mode described.
- In draw(), compute the same v the JavaScript computes, clamp to 0..1, then read the LUT: const uint8_t* c = RAMP_LUT[(int)(v * 255.0f + 0.5f)]; and pass c[0], c[1], c[2] to PFCanvas::setPixel.
- Do NOT interpolate colors per pixel with float math in draw() — the LUT replaces all per-pixel color work.
- PFColor::sampleRamp in core_color.h is step-only. Use it directly only if the mode above is "step"; otherwise fill the LUT with your own interpolation in setup().
`
      : "";

    return `Convert the JavaScript LED pattern below into a single complete Arduino-compatible C++ header for the Patternflow ESP32-S3 firmware.
${
  usesValueField
    ? `
NOTE: the JS pattern draws with display.setValue(x, y, v) — a 0..1 value field colored by a lookup ramp (see "Color ramp" section below). There is no setPixel in the source; your C++ maps v through the baked ramp LUT and writes the resulting RGB with PFCanvas::setPixel.
`
    : ""
}

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
${rampSection}
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
5. Do my knob parameters consume input.knobDeltas (not input.knobValues), constrained to the documented range?${
      usesValueField
        ? "\n6. Does setup() build RAMP_LUT from the exact stops and interpolation mode in the Color ramp section, and does draw() get every color exclusively from that LUT?"
        : ""
    }

## JavaScript source
\`\`\`javascript
${activeCode}
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
              <div key={knobLabels[index]} className={styles.knobLine}>
                <span className={styles.knobName}>{knobLabels[index]}</span>
                {renderRangeValue(index, "min")}
                <input
                  type="range"
                  min={ranges[index][0]}
                  max={ranges[index][1]}
                  step="0.001"
                  value={value}
                  aria-label={`${knobLabels[index]} value`}
                  onChange={(event) => updateKnob(index, Number(event.target.value))}
                />
                {renderRangeValue(index, "max")}
                <strong className={styles.knobValue}>{formatKnob(value)}</strong>
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
            ))}
          </div>

          <div className={styles.rampPanel}>
            <div className={styles.rampHeader}>
              <span>Color ramp</span>
              <select
                value={rampState.mode}
                aria-label="Ramp interpolation mode"
                title="How colors blend between stops"
                onChange={(event) =>
                  setRampState((current) => ({ ...current, mode: event.target.value as RampMode }))
                }
              >
                {RAMP_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "hsvShort" ? "hsv short" : mode === "hsvLong" ? "hsv long" : mode}
                  </option>
                ))}
              </select>
              <label className={styles.rampToggle} title="Cyclic ramp — blends past the last stop back into the first">
                <input
                  type="checkbox"
                  checked={rampState.wrap}
                  onChange={(event) =>
                    setRampState((current) => ({ ...current, wrap: event.target.checked }))
                  }
                />
                wrap
              </label>
              <label
                className={styles.rampToggle}
                title="Recolor any pattern: map each pixel's luminance through the ramp (works on RGB patterns too)"
              >
                <input
                  type="checkbox"
                  checked={recolor}
                  onChange={(event) => setRecolor(event.target.checked)}
                />
                recolor
              </label>
              <button
                type="button"
                className={styles.rampDemo}
                title="Load a demo pattern that draws a 0..1 value field via display.setValue"
                onClick={() => setCode(VFIELD_DEMO_CODE)}
              >
                V demo
              </button>
            </div>
            <div
              ref={rampTrackRef}
              className={styles.rampTrack}
              title="Click to add a stop · drag a line to move it"
              onPointerDown={addRampStop}
            >
              <canvas ref={rampBarRef} className={styles.rampBar} width={256} height={1} aria-label="Ramp gradient preview" />
              {rampState.stops.map((stop, index) => (
                <button
                  key={index}
                  type="button"
                  className={`${styles.rampHandle}${index === activeStopIndex ? ` ${styles.rampHandleActive}` : ""}`}
                  style={{ left: `${stop.position * 100}%` }}
                  aria-label={`Ramp stop at ${stop.position.toFixed(2)}`}
                  title={`${stop.color} @ ${stop.position.toFixed(2)} — drag to move, Delete to remove`}
                  onPointerDown={(event) => startStopDrag(event, index)}
                  onKeyDown={(event) => {
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      deleteRampStop(index);
                    }
                  }}
                >
                  <span style={{ background: stop.color }} />
                </button>
              ))}
            </div>
            {activeStop && (
              <div className={styles.rampStopEdit}>
                <input
                  type="color"
                  value={activeStop.color}
                  aria-label="Selected stop color"
                  onChange={(event) => updateRampStop(activeStopIndex, { color: event.target.value })}
                />
                <span className={styles.rampStopPos}>@ {activeStop.position.toFixed(2)}</span>
                <button
                  type="button"
                  className={styles.rampStopDelete}
                  disabled={rampState.stops.length <= 1}
                  title={rampState.stops.length <= 1 ? "The ramp needs at least one stop" : "Remove this stop"}
                  onClick={() => deleteRampStop(activeStopIndex)}
                >
                  Delete
                </button>
                <span className={styles.rampHint}>
                  click bar = add · drag line = move
                </span>
              </div>
            )}
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
              <button
                type="button"
                data-active={editorView === "experiment"}
                onClick={() => setEditorView("experiment")}
                title="Layer-stack experiment: build a value field by stacking generators, no code"
              >
                Experiment
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
                  <select
                    className={styles.genThinking}
                    value={genColorMode}
                    aria-label="Color mode"
                    title="v-field: the model outputs a 0..1 value field and your Color Ramp does the coloring. rgb: the model colors pixels itself."
                    onChange={(event) => setGenColorMode(event.target.value as ColorMode)}
                  >
                    {COLOR_MODES.map((option) => (
                      <option key={option} value={option}>
                        {option === "vfield" ? "v-field" : "rgb"}
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
              ) : editorView === "experiment" ? (
                <>
                  <button
                    type="button"
                    onClick={sendPatchToEditor}
                    title="Copy the generated pattern code into the Code tab for hand-editing"
                  >
                    Send to editor
                  </button>
                  <button type="button" onClick={copyCppPrompt}>
                    {cppPromptCopied ? "Copied" : "Copy C++ prompt"}
                  </button>
                  <button
                    type="button"
                    className={styles.guideButton}
                    onClick={() => setPatch(DEFAULT_PATCH)}
                    title="Reset the layer stack to the default patch"
                  >
                    Reset
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
            ) : editorView === "experiment" ? (
              <div className={styles.patchPane}>
                <p className={styles.patchIntro}>
                  Stack field generators into one 0–1 value field; the Color Ramp does the
                  coloring. The stack compiles to ordinary pattern code — check the ESP32 cost
                  live, then &quot;Send to editor&quot; to refine it as code. Bind any slider to
                  K1–K4 to drive it with the knobs on the left; bound sliders become the
                  pattern&apos;s knobs when converted to C++.
                </p>
                {patch.layers.map((layer, index) => (
                  <div
                    key={index}
                    className={styles.patchLayer}
                    data-disabled={!layer.enabled}
                  >
                    <div className={styles.patchLayerHead}>
                      <label className={styles.patchEnable}>
                        <input
                          type="checkbox"
                          checked={layer.enabled}
                          onChange={(event) =>
                            updatePatchLayer(index, { enabled: event.target.checked })
                          }
                        />
                        <span>{index + 1}</span>
                      </label>
                      <select
                        value={layer.gen}
                        aria-label={`Layer ${index + 1} generator`}
                        onChange={(event) =>
                          updatePatchLayer(index, { gen: event.target.value as PatchLayer["gen"] })
                        }
                      >
                        {PATCH_GENERATORS.map((gen) => (
                          <option key={gen} value={gen}>
                            {gen}
                          </option>
                        ))}
                      </select>
                      {index > 0 ? (
                        <select
                          value={layer.blend}
                          aria-label={`Layer ${index + 1} blend`}
                          title="How this layer combines with the layers above it"
                          onChange={(event) =>
                            updatePatchLayer(index, {
                              blend: event.target.value as PatchLayer["blend"],
                            })
                          }
                        >
                          {PATCH_BLENDS.map((blend) => (
                            <option key={blend} value={blend}>
                              {blend}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={styles.patchBase}>base</span>
                      )}
                      <button
                        type="button"
                        className={styles.patchRemove}
                        disabled={patch.layers.length <= 1}
                        aria-label={`Remove layer ${index + 1}`}
                        onClick={() => removePatchLayer(index)}
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.patchSliders}>
                      <label>
                        <span>scale</span>
                        <input
                          type="range"
                          min={PATCH_RANGES.scale[0]}
                          max={PATCH_RANGES.scale[1]}
                          step={0.5}
                          value={patchParamValue(layer.scaleK, layer.scale, PATCH_RANGES.scale)}
                          disabled={isKnobBound(layer.scaleK)}
                          onChange={(event) =>
                            updatePatchLayer(index, { scale: Number(event.target.value) })
                          }
                        />
                        <em>{patchParamValue(layer.scaleK, layer.scale, PATCH_RANGES.scale).toFixed(1)}</em>
                        {renderBindSelect(
                          layer.scaleK,
                          (knob) => updatePatchLayer(index, { scaleK: knob }),
                          `Layer ${index + 1} scale`,
                        )}
                      </label>
                      <label>
                        <span>speed</span>
                        <input
                          type="range"
                          min={PATCH_RANGES.speed[0]}
                          max={PATCH_RANGES.speed[1]}
                          step={0.05}
                          value={patchParamValue(layer.speedK, layer.speed, PATCH_RANGES.speed)}
                          disabled={isKnobBound(layer.speedK)}
                          onChange={(event) =>
                            updatePatchLayer(index, { speed: Number(event.target.value) })
                          }
                        />
                        <em>{patchParamValue(layer.speedK, layer.speed, PATCH_RANGES.speed).toFixed(2)}</em>
                        {renderBindSelect(
                          layer.speedK,
                          (knob) => updatePatchLayer(index, { speedK: knob }),
                          `Layer ${index + 1} speed`,
                        )}
                      </label>
                      <label>
                        <span>angle</span>
                        <input
                          type="range"
                          min={PATCH_RANGES.angle[0]}
                          max={PATCH_RANGES.angle[1]}
                          step={1}
                          value={patchParamValue(layer.angleK, layer.angle, PATCH_RANGES.angle)}
                          disabled={isKnobBound(layer.angleK)}
                          onChange={(event) =>
                            updatePatchLayer(index, { angle: Number(event.target.value) })
                          }
                        />
                        <em>{patchParamValue(layer.angleK, layer.angle, PATCH_RANGES.angle).toFixed(0)}°</em>
                        {renderBindSelect(
                          layer.angleK,
                          (knob) => updatePatchLayer(index, { angleK: knob }),
                          `Layer ${index + 1} angle`,
                        )}
                      </label>
                      <label>
                        <span>amount</span>
                        <input
                          type="range"
                          min={PATCH_RANGES.amount[0]}
                          max={PATCH_RANGES.amount[1]}
                          step={0.01}
                          value={patchParamValue(layer.amountK, layer.amount, PATCH_RANGES.amount)}
                          disabled={isKnobBound(layer.amountK)}
                          onChange={(event) =>
                            updatePatchLayer(index, { amount: Number(event.target.value) })
                          }
                        />
                        <em>{patchParamValue(layer.amountK, layer.amount, PATCH_RANGES.amount).toFixed(2)}</em>
                        {renderBindSelect(
                          layer.amountK,
                          (knob) => updatePatchLayer(index, { amountK: knob }),
                          `Layer ${index + 1} amount`,
                        )}
                      </label>
                    </div>
                  </div>
                ))}
                {patch.layers.length < MAX_PATCH_LAYERS && (
                  <button type="button" className={styles.patchAdd} onClick={addPatchLayer}>
                    + Add layer
                  </button>
                )}
                <div className={styles.patchPost}>
                  <label>
                    <span>master speed</span>
                    <input
                      type="range"
                      min={PATCH_RANGES.masterSpeed[0]}
                      max={PATCH_RANGES.masterSpeed[1]}
                      step={0.05}
                      value={patchParamValue(patch.masterSpeedK, patch.masterSpeed, PATCH_RANGES.masterSpeed)}
                      disabled={isKnobBound(patch.masterSpeedK)}
                      onChange={(event) => updatePatch({ masterSpeed: Number(event.target.value) })}
                    />
                    <em>{patchParamValue(patch.masterSpeedK, patch.masterSpeed, PATCH_RANGES.masterSpeed).toFixed(2)}</em>
                    {renderBindSelect(
                      patch.masterSpeedK,
                      (knob) => updatePatch({ masterSpeedK: knob }),
                      "Master speed",
                    )}
                  </label>
                  <label>
                    <span>contrast</span>
                    <input
                      type="range"
                      min={PATCH_RANGES.contrast[0]}
                      max={PATCH_RANGES.contrast[1]}
                      step={0.05}
                      value={patchParamValue(patch.contrastK, patch.contrast, PATCH_RANGES.contrast)}
                      disabled={isKnobBound(patch.contrastK)}
                      onChange={(event) => updatePatch({ contrast: Number(event.target.value) })}
                    />
                    <em>{patchParamValue(patch.contrastK, patch.contrast, PATCH_RANGES.contrast).toFixed(2)}</em>
                    {renderBindSelect(
                      patch.contrastK,
                      (knob) => updatePatch({ contrastK: knob }),
                      "Contrast",
                    )}
                  </label>
                  <label>
                    <span>posterize</span>
                    <input
                      type="range"
                      min={PATCH_RANGES.posterize[0]}
                      max={PATCH_RANGES.posterize[1]}
                      step={1}
                      value={patchParamValue(patch.posterizeK, patch.posterize, PATCH_RANGES.posterize)}
                      disabled={isKnobBound(patch.posterizeK)}
                      onChange={(event) => updatePatch({ posterize: Number(event.target.value) })}
                    />
                    <em>
                      {(() => {
                        const bands = Math.round(
                          patchParamValue(patch.posterizeK, patch.posterize, PATCH_RANGES.posterize),
                        );
                        return bands <= 1 ? "off" : bands;
                      })()}
                    </em>
                    {renderBindSelect(
                      patch.posterizeK,
                      (knob) => updatePatch({ posterizeK: knob }),
                      "Posterize",
                    )}
                  </label>
                  <label className={styles.patchInvert}>
                    <input
                      type="checkbox"
                      checked={patch.invert}
                      onChange={(event) => updatePatch({ invert: event.target.checked })}
                    />
                    <span>invert</span>
                  </label>
                </div>
              </div>
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
                            rampRef={rampRef}
                            recolorRef={recolorRef}
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
                <li>
                  <code>display.setValue(x, y, v)</code> — value-field mode: write a{" "}
                  <code>0–1</code> scalar and the Color Ramp panel does the coloring. Don&apos;t mix
                  with <code>setPixel</code> in one pattern.
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
          code={activeCode}
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
