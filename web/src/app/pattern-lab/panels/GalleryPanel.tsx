"use client";

// AI generation gallery. Generations seed from the focused code layer; cards
// render live previews driven by that layer's current knobs and ramp. Clicking
// a card loads it into the active code layer; the ⧉ button stacks it as a new
// layer instead — the layered-lab way to build up a composition.

import { useEffect, useRef, useState } from "react";
import {
  PatternRuntime,
  createIdleInput,
  knobTargetToDelta,
} from "@/lib/patternHarness";
import {
  LOGICAL_KNOB_UNITS_PER_TURN,
  LOGICAL_KNOB_WRAP,
} from "@/lib/patternflowControls";
import { DEFAULT_MATRIX, parseMatrixAnnotation } from "@/lib/patternMatrix";
import {
  COLOR_MODES,
  GEMINI_MODEL,
  THINKING_LEVELS,
  generatePatternVariants,
  loadGeminiKey,
  saveGeminiKey,
  type ColorMode,
  type ThinkingLevelKey,
} from "@/lib/gemini";
import { captureEvent } from "@/lib/posthogEvents";
import { livePresets } from "@/lib/presets";
import { rampStateToHarness } from "@/lib/lab/engine";
import { useFocusCodeLayer, useLabStore } from "@/lib/lab/store";
import { isCodeLayer, type GalleryItem, type GenJob, type KnobRange } from "@/lib/lab/types";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";

const MAX_GALLERY = 48;
const MAX_CONCURRENT_JOBS = 6;
const GEN_COUNT_MIN = 1;
const GEN_COUNT_MAX = 20;
const REF_OPTIONS = [0, 3, 6, 10];

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

// A live gallery card: runs its own runtime, reading the FOCUS code layer's
// current knobs/ranges/ramp from the store each frame, so turning a knob
// updates every preview at once.
function VariantPreview({
  code,
  name,
  active,
  selected,
  selectMode,
  pinned,
  onSelect,
  onAddAsLayer,
}: {
  code: string;
  name: string;
  active: boolean;
  selected: boolean;
  selectMode: boolean;
  pinned: boolean;
  onSelect: () => void;
  onAddAsLayer: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardMatrix = parseMatrixAnnotation(code) ?? DEFAULT_MATRIX;

  useEffect(() => {
    const matrix = parseMatrixAnnotation(code) ?? DEFAULT_MATRIX;
    const runtime = new PatternRuntime(matrix.width, matrix.height);
    const load = runtime.loadCode(code);
    let frameId = 0;
    if (!load.ok) {
      frameId = requestAnimationFrame(() => setError(load.error ?? "Pattern failed to load."));
      return () => cancelAnimationFrame(frameId);
    }

    const paint = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const imageData = context.createImageData(runtime.width, runtime.height);
      const minLength = Math.min(runtime.data.length, imageData.data.length);
      imageData.data.set(runtime.data.subarray(0, minLength));
      context.putImageData(imageData, 0, 0);
    };
    paint();

    let previousKnobs: number[] | null = null;
    let cachedRampState: unknown = null;
    let lastNow = performance.now();
    let simTime = 0;

    const tick = (now: number) => {
      const dt = Math.min(Math.max(0, (now - lastNow) / 1000), 0.05);
      lastNow = now;
      simTime += dt;

      // Follow the SHARED knobs live; ramp/recolor come from the focus layer.
      const state = useLabStore.getState();
      const activeLayer = state.layers.find((layer) => layer.id === state.activeLayerId);
      const focus = isCodeLayer(activeLayer) ? activeLayer : state.layers.find(isCodeLayer);

      if (previousKnobs === null) previousKnobs = [...state.knobs];
      const knobDeltas = state.knobs.map((value, index) =>
        knobTargetToDelta(
          previousKnobs![index] ?? value,
          value,
          LOGICAL_KNOB_WRAP[index],
          LOGICAL_KNOB_UNITS_PER_TURN[index],
        ),
      );
      const knobNormalized = state.knobs.map((value, index) => {
        const range: KnobRange = state.ranges[index] ?? [0, 1];
        const span = Math.max(0.0001, range[1] - range[0]);
        return (value - range[0]) / span;
      });
      previousKnobs = [...state.knobs];

      if (focus && cachedRampState !== focus.ramp) {
        cachedRampState = focus.ramp;
        runtime.setRamp(rampStateToHarness(focus.ramp));
      }
      runtime.recolor = focus?.recolor ?? false;
      const input = createIdleInput(knobDeltas, {
        knobValues: state.knobs,
        knobNormalized,
        knobRanges: state.ranges,
      });

      const result = runtime.renderFrame(dt, simTime, input);
      if (!result.ok) {
        setError(result.error ?? "Runtime error.");
        return;
      }
      paint();
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [code]);

  return (
    <button
      type="button"
      className={`${styles.variantCard}${active && !selectMode ? ` ${styles.variantCardActive}` : ""}${selected ? ` ${styles.variantCardSelected}` : ""}`}
      onClick={onSelect}
      aria-pressed={selectMode ? selected : undefined}
      title={selectMode ? "Click to select" : "Click to load into the active code layer"}
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
        {!selectMode && (
          <span
            role="button"
            tabIndex={0}
            className={styles.pinBadge}
            style={{ left: "auto", right: 4, cursor: "pointer" }}
            title="Add as a new layer on top of the stack"
            aria-label="Add as new layer"
            onClick={(event) => {
              event.stopPropagation();
              onAddAsLayer();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onAddAsLayer();
              }
            }}
          >
            +⧉
          </span>
        )}
      </div>
      <div className={styles.variantMeta}>
        <strong>{name}</strong>
      </div>
    </button>
  );
}

export default function GalleryPanel() {
  const focus = useFocusCodeLayer();
  const matrix = useLabStore((state) => state.matrix);
  const knobs = useLabStore((state) => state.knobs);
  const ranges = useLabStore((state) => state.ranges);
  const gen = useLabStore((state) => state.gen);
  const setGen = useLabStore((state) => state.setGen);
  const gallery = useLabStore((state) => state.gallery);
  const jobs = useLabStore((state) => state.jobs);
  const setGallery = useLabStore((state) => state.setGallery);
  const setJobs = useLabStore((state) => state.setJobs);
  const applyCodeToActive = useLabStore((state) => state.applyCodeToActive);
  const addCodeLayerFromCode = useLabStore((state) => state.addCodeLayerFromCode);
  const activeCode = useLabStore((state) => {
    const layer = state.layers.find((entry) => entry.id === state.activeLayerId);
    return isCodeLayer(layer) ? layer.code : null;
  });

  const [geminiKey, setGeminiKey] = useState("");
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [now, setNow] = useState(0);
  const removedJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only localStorage read after mount
    setGeminiKey(loadGeminiKey());
  }, []);

  useEffect(() => {
    if (!jobs.some((job) => job.status === "running")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  const runningJobs = jobs.filter((job) => job.status === "running").length;

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

  const fireGeneration = () => {
    if (!focus) return;
    if (!geminiKey) {
      openKeyModal();
      return;
    }
    if (runningJobs >= MAX_CONCURRENT_JOBS) return;

    const count = Math.min(GEN_COUNT_MAX, Math.max(GEN_COUNT_MIN, Math.round(gen.count) || 1));
    const thinkingLevel = gen.thinking;
    const jobId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const job: GenJob = {
      id: jobId,
      count,
      thinkingLevel,
      status: "running",
      startedAt: Date.now(),
    };
    setJobs((current) => [job, ...current]);

    const seedCode = focus.code;
    const seedKnobs = [...knobs];
    const seedRanges = ranges.map((range): KnobRange => [...range]);
    const examples = sampleExamples(seedCode, gen.refs);
    const seedWithCurrent = gen.refs > 0;

    generatePatternVariants({
      apiKey: geminiKey,
      code: seedCode,
      knobs: seedKnobs,
      ranges: seedRanges,
      count,
      thinkingLevel,
      examples,
      matrix,
      seedWithCurrent,
      colorMode: gen.colorMode,
    })
      .then((items) => {
        if (removedJobsRef.current.has(jobId)) return;
        const stamped: GalleryItem[] = items.map((item, index) => ({
          ...item,
          id: `${jobId}-${index}`,
        }));
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
          color_mode: gen.colorMode,
          ms: Date.now() - job.startedAt,
        });
      })
      .catch((error) => {
        if (removedJobsRef.current.has(jobId)) return;
        const message = error instanceof Error ? error.message : "Generation failed.";
        setJobs((current) =>
          current.map((entry) =>
            entry.id === jobId
              ? { ...entry, status: "error", finishedAt: Date.now(), error: message }
              : entry,
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

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
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

  const togglePinSelected = () => {
    if (selectedGalleryItems.length === 0) return;
    const pinnedTarget = !allSelectedPinned;
    setGallery((current) =>
      current.map((item) => (selected.has(item.id) ? { ...item, pinned: pinnedTarget } : item)),
    );
  };

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        <label className={styles.genField} title="How many variations per run (1–20)">
          <span>n</span>
          <input
            type="number"
            min={GEN_COUNT_MIN}
            max={GEN_COUNT_MAX}
            value={gen.count}
            aria-label="Variations per run"
            onChange={(event) =>
              setGen({
                count: Math.min(
                  GEN_COUNT_MAX,
                  Math.max(GEN_COUNT_MIN, Math.round(Number(event.target.value)) || GEN_COUNT_MIN),
                ),
              })
            }
          />
        </label>
        <select
          value={gen.thinking}
          aria-label="Thinking level"
          title="Reasoning depth — higher is slower but more varied"
          onChange={(event) => setGen({ thinking: event.target.value as ThinkingLevelKey })}
        >
          {THINKING_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level.toLowerCase()}
            </option>
          ))}
        </select>
        <select
          value={gen.refs}
          aria-label="Reference examples"
          title="How many existing patterns to show the model as references. No refs = rules only, most creative."
          onChange={(event) => setGen({ refs: Number(event.target.value) })}
        >
          {REF_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 0 ? "no refs" : `${option} refs`}
            </option>
          ))}
        </select>
        <select
          value={gen.colorMode}
          aria-label="Color mode"
          title="v-field: the model outputs a 0..1 value field and the layer's Color Ramp does the coloring. rgb: the model colors pixels itself."
          onChange={(event) => setGen({ colorMode: event.target.value as ColorMode })}
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
          disabled={!focus || runningJobs >= MAX_CONCURRENT_JOBS}
          title={
            !focus
              ? "Add a code layer first — generations seed from it"
              : runningJobs >= MAX_CONCURRENT_JOBS
                ? `Max ${MAX_CONCURRENT_JOBS} runs at once`
                : "Queue a generation run seeded from the focused code layer"
          }
        >
          Generate
        </button>
        <button
          type="button"
          onClick={openKeyModal}
          title={geminiKey ? "Gemini key set — click to change" : "Set Gemini API key"}
          aria-label="Gemini API key"
        >
          {geminiKey ? "Key ✓" : "Key"}
        </button>
      </div>

      <div className={dock.panelBody}>
        <div className={styles.galleryPane}>
          {jobs.length > 0 && (
            <div className={styles.queue}>
              <div className={styles.queueHeader}>
                <span>Queue</span>
                {jobs.some((job) => job.status !== "running") && (
                  <button
                    type="button"
                    onClick={() => {
                      const finishedIds = new Set(
                        jobs.filter((job) => job.status !== "running").map((job) => job.id),
                      );
                      setJobs((current) => current.filter((job) => job.status === "running"));
                      setSelected(
                        (current) => new Set([...current].filter((id) => !finishedIds.has(id))),
                      );
                    }}
                  >
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
                  <button type="button" className={styles.toolbarActive} onClick={exitSelectMode}>
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        new Set([...jobs.map((job) => job.id), ...gallery.map((item) => item.id)]),
                      )
                    }
                  >
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
                      onClick={() => setGallery((current) => current.filter((item) => item.pinned))}
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
                No variants yet — set a count and hit Generate. Click a card to load it into the
                active code layer, or +⧉ to stack it as a new layer.
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
                      active={item.code === activeCode}
                      selected={selected.has(item.id)}
                      selectMode={selectMode}
                      pinned={Boolean(item.pinned)}
                      onSelect={() => {
                        if (selectMode) toggleSelected(item.id);
                        else applyCodeToActive(item.code);
                      }}
                      onAddAsLayer={() => addCodeLayerFromCode(item.code, item.name)}
                    />
                  </li>
                ))}
            </ol>
          )}
        </div>
      </div>

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
                  <button
                    type="button"
                    onClick={() => {
                      saveGeminiKey("");
                      setGeminiKey("");
                      setKeyDraft("");
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
