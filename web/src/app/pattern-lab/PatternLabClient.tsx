"use client";

import Link from "next/link";
import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PATTERN_KNOB_COUNT,
  PATTERN_MATRIX_HEIGHT,
  PATTERN_MATRIX_WIDTH,
  PatternRuntime,
  RAMP_MODES,
  buildRampLUT,
  createIdleInput,
  knobTargetToDelta,
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
  THINKING_LEVELS,
  buildVariantCopyPrompt,
  generatePatternVariants,
  loadGeminiKey,
  saveGeminiKey,
  type ColorMode,
  type PatternVariant,
  type ThinkingLevelKey,
} from "@/lib/gemini";
import {
  DEFAULT_MATRIX,
  MATRIX_HEAVY_PIXELS,
  MATRIX_MAX,
  MATRIX_MIN,
  clampMatrixDimension,
  matchMatrixAnnotation,
  matrixesEqual,
  parseMatrixAnnotation,
  withMatrixAnnotation,
  type MatrixSize,
} from "@/lib/patternMatrix";
import {
  clearDraft,
  loadDraft,
  loadGallery,
  saveDraft,
  saveGallery,
} from "@/lib/labDraft";
import { captureEvent } from "@/lib/posthogEvents";
import PublishModal from "@/components/community/PublishModal";
import { clearLabHandoff, readLabHandoff } from "@/lib/community/handoff";
import { buildsConfigured, communityConfigured } from "@/lib/community/apiBase";
import BuildFirmwareModal from "@/components/community/BuildFirmwareModal";
import {
  codeUsesValueField,
  parseRampAnnotation,
  stripRampAnnotation,
  withRampAnnotation,
} from "@/lib/patternRamp";
import { livePresets } from "@/lib/presets";
import styles from "./PatternLab.module.css";

// Pattern Lab's own presets — the labOnly set (built on lab features like the
// color ramp / value field) that the /pattern showcase hides. The header
// stepper browses these; the editor opens on the first one.
const labPresets = livePresets.filter((preset) => preset.labOnly);
const initialLabPreset = labPresets[0] ?? livePresets[0];

const DEFAULT_KNOB_LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];
const initialKnobs = [...LOGICAL_KNOB_DEFAULTS];

// ── @knobs annotation ──
// Patterns declare knob names + ranges with one comment line:
//   // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1
// Loading code with this line renames the on-screen knobs and applies the
// ranges ("-" skips a slot). The pattern reads input.knobValues directly, so
// the user can still retune any range afterwards and the pattern follows.
const KNOBS_ANNOTATION_RE = /^[ \t]*\/\/[ \t]*@knobs[ \t]+(.+)$/m;

type KnobAnnotationEntry = { name: string; min: number; max: number } | null;

function parseKnobsAnnotation(code: string): KnobAnnotationEntry[] | null {
  const match = code.match(KNOBS_ANNOTATION_RE);
  if (!match) return null;
  const result: KnobAnnotationEntry[] = [null, null, null, null];
  match[1]
    .split(",")
    .slice(0, 4)
    .forEach((part, index) => {
      const entry = part.trim();
      if (!entry || entry === "-") return;
      const m = entry.match(/^(.+?)\s*=\s*(-?\d*\.?\d+)\s*\.\.\s*(-?\d*\.?\d+)$/);
      if (!m) return;
      const min = Number(m[2]);
      const max = Number(m[3]);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
      result[index] = { name: m[1].trim().slice(0, 14), min, max };
    });
  return result.some(Boolean) ? result : null;
}
const defaultRanges: KnobRange[] = LOGICAL_KNOB_RANGES.map(([min, max]) => [min, max]);

// The initial preset seeds useState directly (bypassing updateCode), so honor
// its @knobs annotation here; every later load goes through applyKnobsAnnotation.
const initialAnnotationRaw = initialLabPreset.code.match(KNOBS_ANNOTATION_RE)?.[0] ?? null;
const initialAnnotation = initialAnnotationRaw ? parseKnobsAnnotation(initialLabPreset.code) : null;
const presetKnobLabels = DEFAULT_KNOB_LABELS.map(
  (label, index) => initialAnnotation?.[index]?.name ?? label,
);
const presetRanges: KnobRange[] = defaultRanges.map((range, index) => {
  const entry = initialAnnotation?.[index];
  return entry ? [entry.min, entry.max] : range;
});
const presetKnobs = initialKnobs.map((value, index) => {
  const entry = initialAnnotation?.[index];
  return entry ? Math.max(entry.min, Math.min(entry.max, value)) : value;
});
// Frames offered in the header picker. Any other size is still legal — it can
// arrive from a pattern's own @matrix line, or (later) from direct entry — and
// is shown as an extra option rather than being snapped to a preset.
const RESOLUTION_PRESETS = [
  { value: "128x64", label: "128 × 64 (Patternflow Standard)" },
  { value: "64x128", label: "64 × 128 (Patternflow Vertical)" },
  { value: "64x64", label: "64 × 64 (Square)" },
];

const minRangeSpan = 0.001;
const pixelsPerDigitStep = 10;

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

function paintCanvas(
  canvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  width = PATTERN_MATRIX_WIDTH,
  height = PATTERN_MATRIX_HEIGHT,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const imageData = context.createImageData(width, height);
  const minLength = Math.min(data.length, imageData.data.length);
  imageData.data.set(data.subarray(0, minLength));
  context.putImageData(imageData, 0, 0);
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
const MAX_RAMP_STOPS = 64;

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
  // Each card renders at the frame its own code declares — a gallery can hold
  // patterns composed for different frames (a 64×128 run sitting above an
  // earlier 128×64 one).
  const cardMatrix = useMemo(() => parseMatrixAnnotation(code) ?? DEFAULT_MATRIX, [code]);

  useEffect(() => {
    const runtime = new PatternRuntime(cardMatrix.width, cardMatrix.height);
    const load = runtime.loadCode(code);
    let frameId = 0;
    if (!load.ok) {
      // Report from a frame callback rather than synchronously in the effect body.
      frameId = requestAnimationFrame(() => setError(load.error ?? "Pattern failed to load."));
      return () => cancelAnimationFrame(frameId);
    }
    if (canvasRef.current) {
      paintCanvas(canvasRef.current, runtime.data, runtime.width, runtime.height);
    }

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
      if (canvasRef.current) {
        paintCanvas(canvasRef.current, runtime.data, runtime.width, runtime.height);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [code, cardMatrix, knobsRef, rangesRef, rampRef, recolorRef]);

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
          width={cardMatrix.width}
          height={cardMatrix.height}
          style={{ aspectRatio: `${cardMatrix.width} / ${cardMatrix.height}` }}
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
  const [code, setCode] = useState(initialLabPreset.code);
  const [knobs, setKnobs] = useState(presetKnobs);
  const [ranges, setRanges] = useState<KnobRange[]>(presetRanges);
  const [knobLabels, setKnobLabels] = useState<string[]>(presetKnobLabels);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [renderStats, setRenderStats] = useState({ fps: 0, ms: 0 });
  const [promptCopied, setPromptCopied] = useState(false);
  const [cppPromptCopied, setCppPromptCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [buttonHelpOpen, setButtonHelpOpen] = useState(false);
  const [communityShareOpen, setCommunityShareOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  // Fork lineage carried over from a community pattern opened "in Pattern
  // Lab". Sticky until the user detaches it (×) — we never guess whether the
  // code has diverged too far to still count as a fork.
  const [forkOf, setForkOf] = useState<{ id: string; title: string } | null>(null);
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
  const [genRefs, setGenRefs] = useState(DEFAULT_REF_COUNT);
  const [genColorMode, setGenColorMode] = useState<ColorMode>("vfield");
  const [rampState, setRampState] = useState<RampState>(DEFAULT_RAMP);
  const [recolor, setRecolor] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [editorView, setEditorView] = useState<"code" | "gallery">("code");
  // The pattern's LOGICAL frame — what it draws into, and what a viewer sees.
  // Single source of truth: there is no separate "orientation", because a
  // 64×128 frame already *is* portrait. Travels with the code as a `// @matrix`
  // line so the community, the sandbox and the firmware all agree.
  const [matrix, setMatrix] = useState<MatrixSize>(
    () => parseMatrixAnnotation(initialLabPreset.code) ?? DEFAULT_MATRIX,
  );
  const resPreset = `${matrix.width}x${matrix.height}`;
  const isPresetMatrix = RESOLUTION_PRESETS.some((preset) => preset.value === resPreset);
  // Direct W×H entry. Also shown unprompted for a frame that isn't one of the
  // presets, which is how a community pattern's own @matrix line arrives.
  const [customOpen, setCustomOpen] = useState(false);
  const showCustomMatrix = customOpen || !isPresetMatrix;
  // Draft autosave: `draftReady` gates every write until the restore pass has
  // run, so the pre-restore initial state can never overwrite a saved draft.
  // `draftRestoredAt` is non-null only when work was actually recovered — it
  // drives the header badge that lets the user discard it.
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);

  // Sync state from localStorage after initial client mount to prevent SSR hydration mismatches
  // (browser-only state that cannot exist during the first render, so an
  // effect is the right place despite the lint heuristic).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRampState(loadStoredRamp());
    setGeminiKey(loadGeminiKey());
  }, []);
  const [now, setNow] = useState(0);
  const removedJobsRef = useRef<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PatternRuntime | null>(null);
  const knobsRef = useRef(knobs);
  const previousKnobsRef = useRef(presetKnobs);
  const simTimeRef = useRef(0);
  const runtimeErrorRef = useRef<string | null>(null);
  const rangesRef = useRef(ranges);
  const rangeDragRef = useRef<RangeDragState | null>(null);
  const btnHeldRef = useRef([false, false, false, false]);
  const btnPressPendingRef = useRef([false, false, false, false]);

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

  const resetRampToBlack = () => {
    setRampState((current) => ({
      ...current,
      stops: [
        { position: 0, color: "#000000" },
        { position: 1, color: "#000000" },
      ],
    }));
    setSelectedStopIndex(0);
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
      const runtime = new PatternRuntime(matrix.width, matrix.height);
      const result = runtime.loadCode(nextCode);
      runtimeRef.current = runtime;
      previousKnobsRef.current = [...knobsRef.current];
      simTimeRef.current = 0;
      setRuntimeErrorSafe(result.ok ? null : result.error ?? "Pattern failed to load.");

      if (canvasRef.current) {
        paintCanvas(canvasRef.current, runtime.data, runtime.width, runtime.height);
      }
    },
    [matrix, setRuntimeErrorSafe],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => loadCode(code), 180);
    return () => window.clearTimeout(timeout);
  }, [code, loadCode]);

  // Apply a pattern's @knobs annotation only when the annotation text itself
  // changes — manual label/range edits persist until different code arrives.
  const lastKnobsAnnotationRef = useRef<string | null>(initialAnnotationRaw);

  const applyKnobsAnnotation = (nextCode: string) => {
    const raw = nextCode.match(KNOBS_ANNOTATION_RE)?.[0] ?? null;
    if (raw === lastKnobsAnnotationRef.current) return;
    lastKnobsAnnotationRef.current = raw;
    const parsed = raw ? parseKnobsAnnotation(nextCode) : null;
    if (!parsed) return;
    setKnobLabels((current) => current.map((label, index) => parsed[index]?.name ?? label));
    setRanges((current) =>
      current.map((range, index): KnobRange => {
        const entry = parsed[index];
        return entry ? [entry.min, entry.max] : range;
      }),
    );
    setKnobs((current) =>
      current.map((value, index) => {
        const entry = parsed[index];
        if (!entry) return value;
        return Math.max(entry.min, Math.min(entry.max, value));
      }),
    );
  };

  // ── @matrix ↔ the frame picker ──
  // Same change-detection trick as @knobs: apply the annotation only when the
  // line itself changes, so a manual frame switch survives the next keystroke.
  // Code that declares no frame is a legacy pattern, which means 128×64.
  const lastMatrixAnnotationRef = useRef<string | null>(
    matchMatrixAnnotation(initialLabPreset.code),
  );

  const applyMatrixAnnotation = (nextCode: string) => {
    const raw = matchMatrixAnnotation(nextCode);
    if (raw === lastMatrixAnnotationRef.current) return;
    lastMatrixAnnotationRef.current = raw;
    setMatrix(parseMatrixAnnotation(nextCode) ?? DEFAULT_MATRIX);
  };

  // Single entry point for replacing the editor code so annotations apply on
  // every path (typing/pasting, gallery load, preset step, patch send).
  const updateCode = (nextCode: string) => {
    applyKnobsAnnotation(nextCode);
    applyMatrixAnnotation(nextCode);
    setCode(nextCode);
  };

  // The other direction. Picking a frame rewrites the code's @matrix line so
  // the editor and the picker can never disagree — that disagreement is exactly
  // what made generated patterns come out cropped and over-zoomed.
  const changeMatrix = (next: MatrixSize) => {
    if (matrixesEqual(next, matrix)) return;
    setMatrix(next);
    const nextCode = withMatrixAnnotation(code, next);
    lastMatrixAnnotationRef.current = matchMatrixAnnotation(nextCode);
    setCode(nextCode);
  };

  /** Code as it leaves the lab: the frame it was composed for always attached. */
  const codeWithMatrix = (source: string) => withMatrixAnnotation(source, matrix);

  // The W×H boxes are uncontrolled and keyed on the active frame: any change
  // from elsewhere (a preset, a loaded pattern's @matrix line) remounts them
  // with the new numbers, so they can't drift out of sync while half-typed.
  const customWidthRef = useRef<HTMLInputElement | null>(null);
  const customHeightRef = useRef<HTMLInputElement | null>(null);

  const commitCustomMatrix = () => {
    const width = clampMatrixDimension(Number(customWidthRef.current?.value));
    const height = clampMatrixDimension(Number(customHeightRef.current?.value));
    if (width === null || height === null) {
      // Nonsense entry: put the active frame back rather than leaving the box
      // showing something that isn't what the pattern is being drawn at.
      if (customWidthRef.current) customWidthRef.current.value = String(matrix.width);
      if (customHeightRef.current) customHeightRef.current.value = String(matrix.height);
      return;
    }
    if (width !== matrix.width || height !== matrix.height) {
      changeMatrix({ width, height });
    } else {
      // Clamped back to where we already were — reflect the clamp in the boxes.
      if (customWidthRef.current) customWidthRef.current.value = String(width);
      if (customHeightRef.current) customHeightRef.current.value = String(height);
    }
  };

  // ── Draft restore ──
  // Runs before the handoff effect below, so an explicit "Open in Pattern Lab"
  // still wins over whatever was left in the editor last session.
  useEffect(() => {
    const draft = loadDraft(PATTERN_KNOB_COUNT);
    if (!draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftReady(true);
      return;
    }

    // Generation settings are safe to restore either way — a handoff carries
    // code, not lab settings.
    if (typeof draft.recolor === "boolean") setRecolor(draft.recolor);
    if (draft.gen) {
      setGenCount(draft.gen.count);
      setGenThinking(draft.gen.thinking);
      setGenRefs(draft.gen.refs);
      setGenColorMode(draft.gen.colorMode);
    }

    if (readLabHandoff() === null) {
      // The draft's knob labels/ranges are the user's own tuning, so seed the
      // annotation guards with the draft's own lines — otherwise the next edit
      // would look like "new annotation" and reset that tuning.
      lastKnobsAnnotationRef.current = draft.code?.match(KNOBS_ANNOTATION_RE)?.[0] ?? null;
      lastMatrixAnnotationRef.current = draft.code ? matchMatrixAnnotation(draft.code) : null;
      // The code's own @matrix line wins; the stored frame only covers drafts
      // saved before annotations existed.
      const draftMatrix =
        (draft.code ? parseMatrixAnnotation(draft.code) : null) ?? draft.matrix ?? null;
      if (draftMatrix) setMatrix(draftMatrix);
      if (draft.code) setCode(draft.code);
      if (draft.knobs) {
        setKnobs(draft.knobs);
        previousKnobsRef.current = [...draft.knobs];
      }
      if (draft.ranges) setRanges(draft.ranges);
      if (draft.knobLabels) setKnobLabels(draft.knobLabels);
      if (draft.forkOf) setForkOf(draft.forkOf);
      if (draft.editorView) setEditorView(draft.editorView);
      setGallery(loadGallery());
      setDraftRestoredAt(draft.savedAt || Date.now());
    }

    setDraftReady(true);
  }, []);

  // Persist the working state. Debounced so typing in the editor doesn't
  // serialize the whole draft on every keystroke.
  useEffect(() => {
    if (!draftReady) return;
    const timeout = window.setTimeout(() => {
      saveDraft({
        code,
        knobs,
        ranges,
        knobLabels,
        recolor,
        matrix,
        editorView,
        forkOf,
        gen: {
          count: genCount,
          thinking: genThinking,
          refs: genRefs,
          colorMode: genColorMode,
        },
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [
    draftReady,
    code,
    knobs,
    ranges,
    knobLabels,
    recolor,
    matrix,
    editorView,
    forkOf,
    genCount,
    genThinking,
    genRefs,
    genColorMode,
  ]);

  // The gallery lives in its own key: it can run to hundreds of KB, and a
  // quota failure there must not take the small draft down with it.
  useEffect(() => {
    if (!draftReady) return;
    saveGallery(gallery);
  }, [draftReady, gallery]);

  // Throw the session away and return to the opening preset.
  const discardDraft = () => {
    clearDraft();
    setDraftRestoredAt(null);
    setGallery([]);
    setSelected(new Set());
    setSelectMode(false);
    setForkOf(null);
    setEditorView("code");
    lastKnobsAnnotationRef.current = initialAnnotationRaw;
    lastMatrixAnnotationRef.current = matchMatrixAnnotation(initialLabPreset.code);
    setMatrix(parseMatrixAnnotation(initialLabPreset.code) ?? DEFAULT_MATRIX);
    setCode(initialLabPreset.code);
    setKnobs(presetKnobs);
    setRanges(presetRanges);
    setKnobLabels(presetKnobLabels);
  };

  // Consume a community → lab handoff exactly once per mount. The detail
  // page's "Open in Pattern Lab" writes it to sessionStorage right before
  // navigating here; publishing later records the carried parentId as a fork.
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    handoffConsumedRef.current = true;
    const handoff = readLabHandoff();
    if (!handoff) return;
    clearLabHandoff();
    // A shared pattern may carry its color ramp as a `// @ramp` line. Restore
    // it into the lab's ramp state and keep the editor clean — the annotation
    // is re-injected fresh at publish time. (These are post-mount reads of
    // browser-only sessionStorage, hence the setState-in-effect exemptions.)
    const rampAnnotation = parseRampAnnotation(handoff.code);
    if (rampAnnotation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRampState({
        stops: rampAnnotation.stops,
        mode: rampAnnotation.mode,
        wrap: rampAnnotation.wrap,
      });
      setRecolor(rampAnnotation.recolor);
      updateCode(stripRampAnnotation(handoff.code));
    } else {
      updateCode(handoff.code); // editorView already defaults to "code" on mount
    }
    if (handoff.parentId) {
      setForkOf({ id: handoff.parentId, title: handoff.parentTitle ?? "a community pattern" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lab preset stepper ── browses the labOnly set; index follows the editor
  // content, so editing away from a preset shows "–".
  const activeLabIndex = labPresets.findIndex((preset) => preset.code === code);

  const stepLabPreset = (dir: number) => {
    if (labPresets.length === 0) return;
    const base = activeLabIndex >= 0 ? activeLabIndex : dir > 0 ? -1 : 0;
    const next = (base + dir + labPresets.length) % labPresets.length;
    updateCode(labPresets[next].code);
    setEditorView("code");
  };

  useEffect(() => {
    knobsRef.current = knobs;
  }, [knobs]);

  useEffect(() => {
    rangesRef.current = ranges;
  }, [ranges]);

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
      const dt = Math.min(elapsed, 0.05);
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
          paintCanvas(canvas, runtime.data, runtime.width, runtime.height);
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

  const copyVariantPrompt = async () => {
    await navigator.clipboard.writeText(
      buildVariantCopyPrompt(code, knobs, ranges, genColorMode, matrix),
    );
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1200);
  };

  const pasteFromClipboard = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          updateCode(text);
          setPasted(true);
          window.setTimeout(() => setPasted(false), 1200);
          return;
        }
      }
    } catch {
      // Permission blocked or unsupported in WebView — fall back to window.prompt
    }
    const fallbackText = window.prompt("붙여넣을 패턴 코드를 아래 상자에 입력하거나 붙여넣어 주세요:");
    if (fallbackText !== null) {
      updateCode(fallbackText);
      setPasted(true);
      window.setTimeout(() => setPasted(false), 1200);
    }
  };

  const clearCode = () => {
    updateCode("");
    setCleared(true);
    window.setTimeout(() => setCleared(false), 1200);
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

    generatePatternVariants({ apiKey: geminiKey, code, knobs: seedKnobs, ranges: seedRanges, count, thinkingLevel, examples, matrix, seedWithCurrent, colorMode: genColorMode })
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
    else updateCode(item.code);
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
    // ── Frame ──
    // A pattern composed for the panel's own grid compiles exactly as it
    // always did: loop PANEL_RES_W/H, write PFCanvas::setPixel, done. Any
    // other grid declares itself to the canvas, which owns the single
    // logical→physical mapping (see firmware/patternflow/src/core_canvas.h).
    // The model is never asked to rotate coordinates itself — that is the
    // mistake this whole rework exists to remove.
    const isPanelFrame = matrix.width === PATTERN_MATRIX_WIDTH && matrix.height === PATTERN_MATRIX_HEIGHT;
    const frameSection = isPanelFrame
      ? `- Use PANEL_RES_W and PANEL_RES_H for the pixel loops.
`
      : `- FRAME: this pattern is composed for a ${matrix.width} × ${matrix.height} grid, which is NOT the panel's ${PATTERN_MATRIX_WIDTH} × ${PATTERN_MATRIX_HEIGHT}. Handle it exactly like this and in no other way:
    - Declare the grid in the namespace: \`constexpr int FRAME_W = ${matrix.width}; constexpr int FRAME_H = ${matrix.height};\`
    - Make \`PFCanvas::setFrame(FRAME_W, FRAME_H);\` the FIRST line of draw().
    - Loop over FRAME_W / FRAME_H — not PANEL_RES_W / PANEL_RES_H — and pass those same logical x, y straight to PFCanvas::setPixel.
    - Do NOT rotate, swap, mirror, offset, or otherwise transform the coordinates yourself, and do not mention the panel's dimensions anywhere in the drawing math. PFCanvas::setFrame installs the mapping and setPixel applies it; doing it a second time turns the pattern the wrong way.
    - Do NOT use PFTables::rT / PFTables::thetaT. Those tables are indexed by the PANEL grid and measured from the panel's centre, so they are wrong for this frame. Compute radius with sqrtf and angle with PFMath::fastAtan2 from the FRAME centre (FRAME_W * 0.5f, FRAME_H * 0.5f) instead, and do not call PFTables::init().
    - Size any per-pixel buffer by FRAME_W * FRAME_H.
`;

    const rangeLines = ranges
      .map((range, index) => {
        const detentStep = LOGICAL_KNOB_UNITS_PER_TURN[index] / 20;
        return `- ${knobLabels[index]}: min ${range[0]}, max ${range[1]}, current ${knobs[index]}, calibrated encoder step ${roundRangeValue(detentStep)} per detent`;
      })
      .join("\n");

    // Value-field patterns carry no color of their own. The ramp LUT is
    // precomputed HERE (same buildRampLUT as the live preview) and emitted as
    // a finished C array — models must not write sorting/interpolation code,
    // which is exactly where weaker models broke (unsorted stops → all-black
    // LUT, hallucinated tokens in hand-rolled lerp loops).
    const usesValueField = /display\s*\.\s*setValue\s*\(/.test(code);
    let rampSection = "";
    if (usesValueField) {
      const lut = buildRampLUT(ramp);
      const lutRows: string[] = [];
      for (let i = 0; i < 256; i += 8) {
        const entries: string[] = [];
        for (let j = i; j < i + 8; j++) {
          entries.push(`{${lut[j * 3]},${lut[j * 3 + 1]},${lut[j * 3 + 2]}}`);
        }
        lutRows.push(`  ${entries.join(",")},`);
      }
      const sortedStops = [...rampState.stops].sort((a, b) => a.position - b.position);
      const stopSummary = sortedStops
        .map((stop) => `${stop.position.toFixed(3)}:${stop.color}`)
        .join(", ");
      rampSection = `
## Color ramp (value-field pattern) — PRE-BAKED, copy verbatim
This pattern writes a scalar field via display.setValue(x, y, v) with v in 0..1 and has NO color logic of its own. The user's color ramp has already been baked into the 256-entry RGB lookup table below (it encodes the stops, interpolation mode, and wrap exactly as the web preview renders them).

Embed this table in the namespace EXACTLY as given:

static const uint8_t RAMP_LUT[256][3] = {
${lutRows.join("\n")}
};

Rules:
- Copy the table verbatim — do NOT recompute, resample, reorder, shorten, or "optimize" it, and do NOT write any stop/interpolation/sorting code. The table IS the ramp.
- In draw(): clamp v to 0..1, then
    int li = (int)(v * 255.0f + 0.5f);
    PFCanvas::setPixel(x, y, RAMP_LUT[li][0], RAMP_LUT[li][1], RAMP_LUT[li][2]);
- Do NOT use PFColor:: functions for this pattern's colors; the LUT replaces all color work.
- (Reference only, for the header comment: stops ${stopSummary}; mode ${rampState.mode}; wrap ${rampState.wrap ? "on" : "off"}.)
`;
    }

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

    #include "src/core_math.h"   // PFMath:: fastSin, fastCos, fastAtan2, fastPow, fract, lerp, approxLength, sin LUT
    #include "src/core_color.h"  // PFColor:: hsvToRgb, buildPowLUT/buildPowLUTf, ColorStop, sampleRamp
    #include "src/core_noise.h"  // PFNoise:: cellHash, valueNoise2D, perlin2D, fractal2D
    #include "src/core_tables.h" // PFTables:: init(), rT[], thetaT[] — per-pixel radius/angle from the panel center, precomputed
    #include "src/core_mem.h"    // PFMem:: allocFloats — PSRAM-first, zeroed allocation for framebuffer-sized buffers

Helper signatures — these are the FULL argument lists. Call them exactly like this; do not add size arguments, reorder parameters, or invent overloads:

    PFMath::buildSinLUT();                               // in setup(); idempotent
    float s  = PFMath::fastSin(angleRadians);
    float c  = PFMath::fastCos(angleRadians);
    float a  = PFMath::fastAtan2(dy, dx);                // returns (-π, π], like atan2f(y, x)
    float w  = PFMath::fastPow(base, exponent);          // base > 0 (returns 0 for base <= 0, even with a negative exponent); ~0.1% error
    PFTables::init();                                    // in setup(); idempotent
    float r  = PFTables::rT[y * PANEL_RES_W + x];        // fixed-center radius, screen-height units
    float th = PFTables::thetaT[y * PANEL_RES_W + x];    // fixed-center angle, -π..π
    float h  = PFNoise::cellHash(gx, gy);                // int cell coords → 0..1; optional 3rd int seed
    float n  = PFNoise::valueNoise2D(x, y);              // floats → 0..1
    float p  = PFNoise::perlin2D(x, y);                  // floats → ≈ -1..1
    float f  = PFNoise::fractal2D(x, y, octaves, roughness);
    PFColor::hsvToRgb(h01, s01, v01, r8, g8, b8);        // h/s/v floats 0..1; r8/g8/b8 are uint8_t& outputs
    static uint8_t plut[256];  PFColor::buildPowLUT(exponent, plut);   // fills (i/255)^exp scaled to 0..255
    static float  plutf[256];  PFColor::buildPowLUTf(exponent, plutf); // fills (i/255)^exp as 0..1 floats
    static float* buf = nullptr;  buf = PFMem::allocFloats(count);     // in setup(); PSRAM-first, returns zeroed memory (or nullptr)

Other interface rules:
${frameSection}- Never hardcode pixel dimensions as literals. Use the frame constants named above.
- All pixel writes go through PFCanvas::setPixel(x, y, r, g, b). Never call dma_display->drawPixelRGB888 directly.
- The last line of draw() must be PFCanvas::present();. Without it nothing reaches the panel.
- Macro collisions: Arduino.h and config.h define macros that will preprocessor-mangle same-named declarations into compile errors. Do NOT define your own variables, constants, or functions named PI, TWO_PI, HALF_PI, DEG_TO_RAD, RAD_TO_DEG, EULER, min, max, abs, sq, round, radians, degrees, constrain, MAX_HUE, MAX_SPEED, SPEED_STEP, MAX_FREQ, or FREQ_STEP. Use the existing PI / TWO_PI constants directly, use fminf/fmaxf/fabsf for your own helpers, and prefix pattern constants with the pattern name (e.g. CELLS_TWO_PI, CELLS_SPEED_STEP).

## Memory rules — big buffers must never be static arrays
All patterns compile into one firmware image, so every namespace static array occupies internal DRAM from boot even while the pattern is inactive — and internal DRAM is shared with the Wi-Fi stack and the HUB75 DMA driver. Two 32 KB static arrays were enough to boot-loop a real device.

- Any per-pixel buffer (trail map, glow/density accumulator, feedback field — anything sized by PANEL_RES_W * PANEL_RES_H or similar) must be a POINTER allocated once in setup() with PFMem::allocFloats (include src/core_mem.h). PFMem allocates from PSRAM when available and returns zeroed memory:

    static float* trail = nullptr;
    void setup() { if (!trail) trail = PFMem::allocFloats(PANEL_RES_W * PANEL_RES_H); }

- Guard update() with \`if (!trail) return;\` and start draw() with \`if (!trail) { PFCanvas::present(); return; }\` so a failed allocation degrades to a blank pattern instead of crashing.
- Small fixed state (particle arrays, knob params, 256-entry LUTs — anything under ~2 KB) stays as plain statics; this rule is only for framebuffer-scale buffers.
- Call PFTables::init() ONLY if the code actually reads PFTables::rT or PFTables::thetaT. Never call it "just in case" — it allocates two 32 KB tables.

## DO NOT reimplement existing helpers
The firmware ships tested, optimized versions of these. Using your own breaks shared optimizations (color calibration, sin LUT sharing) and wastes ROM. If the JavaScript source contains an inline hsvToRgb or sin LUT, strip it and call the firmware helper instead.

- DO NOT write your own HSV → RGB converter. Not as a separate function, not inline with a switch statement, not as a chain of fmodf + conditionals. Call PFColor::hsvToRgb(h, s, v, r, g, b). h is normalized 0..1, not degrees.
- DO NOT write your own sin LUT or fast-sin approximation. Call PFMath::buildSinLUT() once in setup(); use PFMath::fastSin / fastCos in draw().
- DO NOT write your own Perlin or fractal noise. Use PFNoise::perlin2D / fractal2D.
- DO NOT write your own atan/atan2 approximation or angle LUT. Use PFMath::fastAtan2 or the precomputed PFTables::thetaT (see the decision table).
- DO NOT translate sin-based hash formulas literally. If the JS contains fract(sin(x * 127.1 + y * 311.7) * 43758.5453) or similar, replace it with PFNoise::cellHash(gx, gy) (add a seed argument to decorrelate multiple uses). NEVER build a hash from PFMath::fastSin — the sin LUT's tiny error is amplified ~44,000× by the big multiplier and destroys the hash with visible banding.

## Expensive math — pick the tool by situation
The board has abundant flash and PSRAM, so the firmware trades memory for per-pixel math. Choose per this table; it overrides any literal translation of the JS:

| Situation in the pattern | Use this |
|---|---|
| Radius and/or angle from the FIXED panel center (rings, spirals, vortex, kaleidoscope) | PFTables::init() once in setup(); then PFTables::rT[i] / PFTables::thetaT[i] in draw() with i = y * PANEL_RES_W + x. Zero per-pixel cost — never call sqrtf or atan2f for a fixed center. rT is in screen-height units (0 center, 0.5 top/bottom edge); thetaT is -π..π. |
| Angle from a MOVING center | PFMath::fastAtan2(dy, dx) (~0.01° max error). Never call atan2f inside the pixel loop. |
| Distance from a MOVING center | sqrtf(dx*dx + dy*dy) — the S3 FPU makes sqrtf cheap; two per pixel cost under 1 ms per frame. |
| Random value per grid cell (voronoi seeds, cell colors/phases) | PFNoise::cellHash(gx, gy) or cellHash(gx, gy, seed). |
| Smooth organic field | PFNoise::valueNoise2D (cheapest) or perlin2D / fractal2D (richer). |
| powf(v, CONSTANT) | v*v for squares; otherwise bake a LUT in setup() with PFColor::buildPowLUT (byte out) / buildPowLUTf (float out) and index it in draw(). |
| powf(v, e) where e VARIES per pixel or per frame | PFMath::fastPow(v, e) — never call libm powf inside the pixel loop. fastPow returns 0 for v <= 0; if the JS relied on Math.pow(0, negative) → Infinity → clamp-to-max, branch on v <= 0 explicitly and output that clamped value. |
| sin/cos inside the pixel loop | PFMath::fastSin / fastCos (call buildSinLUT() in setup()). Full-precision sinf/cosf only for one-shot computations outside the loop — and for hash inputs, use cellHash instead entirely. |

approxLength caveat: PFMath::approxLength is an octagonal approximation (~5% error — the isodistance contour is a visible octagon). With PFTables::rT and cheap sqrtf available it is almost never the right choice; only use it for non-visual weighting terms where the contour can never be seen. When in doubt, use PFTables::rT (fixed center) or sqrtf (moving center).

Last resort — half-resolution rendering: if the pattern is genuinely smooth/low-frequency and still too slow after the table above, compute the value on a 64×32 grid inside draw() and write each result to a 2×2 pixel block. Only for soft gradients; never for patterns with single-pixel details.

## Knob conversion
- The JS preview uses input.knobValues as absolute values (after the Pattern Lab min/max ranges are applied).
- The firmware receives input.knobDeltas — the per-frame change in detents.
- For each knob, store the parameter as state initialized to its current Pattern Lab value below.
- In update(): param += input.knobDeltas[i] * STEP[i]; then constrain to the min/max range.
- Use the calibrated encoder step below as STEP so physical encoders match the live editor and one detent feels the same on both.
- If the JS reads input.knobNormalized[i] (e.g. generated layer-stack patterns), keep the raw knob state exactly as above and compute the normalized value from it each frame: (raw - min) / (max - min). Do NOT store the normalized value as the knob state itself.
- Preserve knob meanings from the JS code (any comments naming the knobs) in KNOB_LABELS. Knobs the comments mark as unused get the label "-" and no update logic.
- Encoder buttons map 1:1: JS input.btnPressed[i] / input.btnHeld[i] become C++ input.btnPressed[i] / input.btnHeld[i] (same bool[4] semantics — edge vs level). If the JS pattern resets, freezes, or triggers on a button, keep that. Never consume long-press; that gesture is reserved for the firmware mode switcher.

Pattern Lab knob ranges and current values:
${rangeLines}
${rampSection}
## Performance
- Hoist anything that depends only on time, row, or parameters out of the inner pixel loop.
- Wrap every time accumulator at its period — the device runs for days, and an unbounded t += dt * speed loses float precision until sin-driven motion visibly stutters (hours at high speed). If t only ever feeds fastSin/fastCos through INTEGER multipliers (t, t*2.0f, t*3.0f...), wrap with if (t > TWO_PI) t -= TWO_PI;. For non-integer multipliers, wrap at a common period instead (e.g. multipliers 0.1 and 1.2 → period 20π wraps both seamlessly). A drift that is fract()ed anyway (hue cycling) should be its own accumulator wrapped with PFMath::fract. Never leave a time accumulator unbounded.
- Prefer multiplication and comparison over expensive functions and branches.
- Route every expensive call through the "Expensive math" decision table above — the fast path exists for each common case; a literal translation of the JS math is almost always the slow answer.
- Keep some pixels near full RGB output so LED brightness stays strong.
- Preserve local color logic from the JS — value-based bands, distance-driven hue, threshold steps, etc. The visual character lives in those rules.

## Self-check before output
Before finalizing your code block, verify each of these. If any answer is wrong, fix it.

1. Does the pattern use radius or angle from the FIXED panel center while calling sqrtf/atan2f per pixel? If yes, switch to PFTables::rT / PFTables::thetaT. Is atan2f called anywhere inside the pixel loop? If yes, switch to PFMath::fastAtan2. If I used approxLength, is its octagonal contour truly invisible? If not certain, use rT/sqrtf.
2. Did I write my own hsvToRgb, sin LUT, atan2 approximation, noise function, or a sin-based hash — or build a hash from PFMath::fastSin? If yes, replace with the PFColor / PFMath / PFNoise helpers.
3. Does draw() end with PFCanvas::present();?
4. Are all pixel writes via PFCanvas::setPixel? Did I avoid touching dma_display?
5. Do my knob parameters consume input.knobDeltas (not input.knobValues), constrained to the documented range?
6. Does every time accumulator wrap at its period (TWO_PI or a common multiple — see Performance)? An unbounded accumulator is a bug even if the preview looks fine.
7. Is every line valid C++ that will compile — no stray tokens, no placeholder text, no truncated statements? Re-read the block once before finalizing.
8. Did I declare any static array bigger than ~2 KB (e.g. float buf[PANEL_RES_W * PANEL_RES_H])? If yes, convert it to a PFMem::allocFloats pointer per the Memory rules. Did I call PFTables::init() without reading rT/thetaT anywhere? If yes, remove the call.${
      usesValueField
        ? "\n9. Did I paste the RAMP_LUT table verbatim (all 256 entries, unchanged), and does draw() get every color exclusively from RAMP_LUT with no other color code?"
        : ""
    }${
      isPanelFrame
        ? ""
        : `\n${usesValueField ? "10" : "9"}. Is PFCanvas::setFrame(FRAME_W, FRAME_H) the first line of draw(), do all loops run over FRAME_W/FRAME_H, and did I avoid transforming the coordinates myself or touching PFTables?`
    }

## JavaScript source
\`\`\`javascript
${codeWithMatrix(code)}
\`\`\``;

  };

  const copyCppPrompt = async () => {
    await navigator.clipboard.writeText(buildCppPrompt());
    setCppPromptCopied(true);
    window.setTimeout(() => setCppPromptCopied(false), 1200);
  };

  return (
    <main className={`${styles.shell}${activeRangeId ? ` ${styles.shellDragging}` : ""}`}>
      <header className={styles.labHeader}>
        <div className={styles.labBrandBlock}>
          <Link href="/" className={styles.labBrand}>
            Patternflow
          </Link>
          <span className={styles.labTitle}>Pattern Lab</span>
        </div>
        <nav className={styles.labNav}>
          <Link href="/community" title="Patternflow Community">
            Community ↗
          </Link>
        </nav>
      </header>
      <section className={styles.workspace}>
        <div className={styles.previewColumn}>
          <div className={styles.previewHeader}>
            <div className={styles.stats}>
              <span>{renderStats.fps.toFixed(0)} fps</span>
              <span className={styles.dotSep}>·</span>
              <span>{renderStats.ms.toFixed(2)} ms</span>
              {forkOf && (
                <span
                  className={styles.forkBadge}
                  title="Sharing to the community will publish this as a fork of the linked pattern. Click × if this is no longer a remix of it."
                >
                  forking from {forkOf.title}
                  <button
                    type="button"
                    aria-label="Detach fork lineage"
                    onClick={() => setForkOf(null)}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            <div className={styles.headerControls}>
              {draftRestoredAt !== null && (
                <button
                  type="button"
                  className={styles.headerToggle}
                  title={`Restored your last session (${new Date(draftRestoredAt).toLocaleString()}). Click to discard it and start from the opening preset.`}
                  onClick={discardDraft}
                >
                  restored ×
                </button>
              )}
              <select
                className={styles.headerSelect}
                value={showCustomMatrix ? "custom" : resPreset}
                aria-label="Pattern frame"
                title="The pixel grid this pattern is composed for. Written into the code as an @matrix line, and used for the AI prompt, the community preview, and the firmware export."
                onChange={(event) => {
                  if (event.target.value === "custom") {
                    setCustomOpen(true);
                    return;
                  }
                  setCustomOpen(false);
                  const [width, height] = event.target.value.split("x").map(Number);
                  if (Number.isFinite(width) && Number.isFinite(height)) {
                    changeMatrix({ width, height });
                  }
                }}
              >
                {RESOLUTION_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>

              {showCustomMatrix && (
                <span className={styles.customMatrix}>
                  {(["width", "height"] as const).map((edge, index) => (
                    <span key={edge} className={styles.customMatrixField}>
                      {index === 1 && <span aria-hidden="true">×</span>}
                      <input
                        // Remount on frame change so the box always shows the
                        // frame actually in use.
                        key={`${edge}-${matrix[edge]}`}
                        ref={edge === "width" ? customWidthRef : customHeightRef}
                        type="number"
                        inputMode="numeric"
                        min={MATRIX_MIN}
                        max={MATRIX_MAX}
                        defaultValue={matrix[edge]}
                        aria-label={`Frame ${edge}`}
                        title={`${MATRIX_MIN}–${MATRIX_MAX} pixels`}
                        onBlur={commitCustomMatrix}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            event.currentTarget.value = String(matrix[edge]);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </span>
                  ))}
                </span>
              )}

              {matrix.width * matrix.height > MATRIX_HEAVY_PIXELS && (
                <span
                  className={styles.frameWarning}
                  title="Large frames cost proportionally more per preview frame, and the ESP32 has to fill every one of those pixels too."
                >
                  heavy
                </span>
              )}
            </div>
          </div>

          {/* Mobile AI workflow action bar: Copy prompt for AI chat, and Paste response into editor. */}
          <div className={styles.mobileActions}>
            <button
              type="button"
              className={styles.mobileCopyPromptBtn}
              onClick={copyVariantPrompt}
              title="Copy AI prompt to clipboard for ChatGPT / Claude / Gemini"
            >
              {promptCopied ? "Copied ✓" : "Copy prompt"}
            </button>
            <button
              type="button"
              className={styles.mobilePasteBtn}
              onClick={pasteFromClipboard}
              title="Replace editor content with copied AI response"
            >
              {pasted ? "Pasted ✓" : "Paste response"}
            </button>
          </div>

          <div
            className={styles.matrixFrame}
            style={{ aspectRatio: `${matrix.width} / ${matrix.height}` }}
          >
            <canvas
              ref={canvasRef}
              width={matrix.width}
              height={matrix.height}
              style={{ aspectRatio: `${matrix.width} / ${matrix.height}` }}
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
                {/* Name/value/push on top; the slider gets its own full-width
                    row below (flanked by its min/max) so it's long enough to
                    tune precisely — especially with a finger. */}
                <div className={styles.knobHead}>
                  <span className={styles.knobName}>{knobLabels[index]}</span>
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
                <div className={styles.knobSlider}>
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
                </div>
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
                <button
                  type="button"
                  className={styles.rampResetBtn}
                  title="Reset all stops to black"
                  onClick={resetRampToBlack}
                >
                  Reset to black
                </button>
              </div>
            )}
          </div>

          <div className={styles.actionRow}>
            {/* Only offered where a community actually exists to publish to —
                otherwise this deployment would show a button that can only
                fail (see lib/community/apiBase). */}
            {communityConfigured() && (
              <button
                type="button"
                className={styles.darkButton}
                onClick={() => setCommunityShareOpen(true)}
              >
                Share to Community
              </button>
            )}
            {buildsConfigured() && (
              <button
                type="button"
                className={styles.darkButton}
                title="Compile a firmware image with this pattern and flash it over USB — no Arduino IDE"
                onClick={() => setBuildOpen(true)}
              >
                Build firmware
              </button>
            )}
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
              ) : (
                <>
                  <div
                    className={styles.presetStep}
                    title={activeLabIndex >= 0 ? labPresets[activeLabIndex].name : "Lab presets"}
                  >
                    <button type="button" onClick={() => stepLabPreset(-1)} aria-label="Previous lab preset">
                      ‹
                    </button>
                    <span>
                      {activeLabIndex >= 0 ? activeLabIndex + 1 : "–"}/{labPresets.length}
                    </span>
                    <button type="button" onClick={() => stepLabPreset(1)} aria-label="Next lab preset">
                      ›
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.pasteButton}
                    onClick={pasteFromClipboard}
                    title="Paste pattern code directly from clipboard"
                  >
                    {pasted ? "Pasted ✓" : "Paste"}
                  </button>
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={clearCode}
                    title="Clear all code in the editor"
                  >
                    {cleared ? "Cleared ✓" : "Clear"}
                  </button>
                  <button type="button" onClick={copyVariantPrompt}>
                    {promptCopied ? "Copied" : "Copy prompt"}
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
                onChange={(value) => updateCode(value ?? "")}
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
                  <code>{"// @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1"}</code>{" "}
                  — one comment line declaring knob names and ranges. Loading code with this line
                  renames the knobs and applies the ranges automatically (<code>-</code> skips a
                  slot); read the values back via <code>knobValues</code>, not{" "}
                  <code>knobNormalized</code>, so range edits keep working.
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

      {buildOpen && (
        <BuildFirmwareModal
          patternLabel={forkOf?.title ?? "Pattern Lab pattern"}
          // The lab holds JavaScript, not a header, so the conversion prompt is
          // offered right in the modal rather than sending people elsewhere.
          cppPrompt={buildCppPrompt()}
          onClose={() => setBuildOpen(false)}
        />
      )}

      {communityShareOpen && (
        <PublishModal
          // Value-field patterns (and recolored ones) are colorless without
          // their ramp — embed it as a @ramp line so the community renders
          // them exactly as seen here. Plain RGB patterns keep their colors.
          // The frame goes along either way: without it the community sandbox
          // would render a 64×128 pattern into a 128×64 canvas.
          code={
            codeUsesValueField(code) || recolor
              ? withRampAnnotation(codeWithMatrix(code), {
                  stops: rampState.stops,
                  mode: rampState.mode,
                  wrap: rampState.wrap,
                  recolor,
                })
              : codeWithMatrix(code)
          }
          parentId={forkOf?.id ?? null}
          parentTitle={forkOf?.title ?? null}
          onClose={() => setCommunityShareOpen(false)}
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
