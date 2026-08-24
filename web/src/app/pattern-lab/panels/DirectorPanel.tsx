"use client";

// Director — knob automation over time, authored against the pattern on the
// canvas. Four lanes (one per physical knob) hold keyframes on whole seconds;
// a segment between two keyframes is either a hold (jump at the next cue) or
// a Blender-style bezier curve you shape by its handles. Everything the
// timeline PLAYS is the baked staircase from lib/lab/director/bake — the same
// cues the .pfs export and the publish rail carry, so the preview is the show.
//
// Playback drives the shared knob store the way the device's absolute bus
// drives the encoders: a cue fires once when the playhead crosses its second,
// values hold until the next, and the pattern animates in the live preview
// (and Capture) because they already follow the knobs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  encodePfst,
  pfsFilename,
  serializePerformance,
  validatePerformance,
  PFST_MAX_CUES,
} from "@/lib/community/performance";
import { readPerformanceFile } from "@/lib/community/performanceFile";
import {
  bakeShow,
  continuousLaneValue,
  cubicBezierY,
  showFromPerformance,
} from "@/lib/lab/director/bake";
import {
  DEFAULT_CURVE_CP,
  DIRECTOR_MAX_SECONDS,
  directorId,
  showHasContent,
  type DirectorKeyframe,
  type DirectorShow,
} from "@/lib/lab/director/types";
import { useLabStore } from "@/lib/lab/store";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";
import local from "./DirectorPanel.module.css";

const PPS = 28; // px per second
const LANE_H = 56;
const MSG_H = 26;
const PAD_Y = 5;

type Selection =
  | { kind: "key"; lane: number; id: string }
  | { kind: "msg"; id: string }
  | null;

function wireToY(v: number): number {
  return LANE_H - PAD_Y - (Math.max(0, Math.min(1000, v)) / 1000) * (LANE_H - PAD_Y * 2);
}

function yToWire(y: number): number {
  const t = (LANE_H - PAD_Y - y) / (LANE_H - PAD_Y * 2);
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
}

/** The knob's real value for a wire value, for the readouts. */
function wireToReal(v: number, range: [number, number]): number {
  return range[0] + (v / 1000) * (range[1] - range[0]);
}

function sortedLane(lane: DirectorKeyframe[]): DirectorKeyframe[] {
  return [...lane].sort((a, b) => a.t - b.t);
}

export default function DirectorPanel() {
  const director = useLabStore((state) => state.director);
  const updateDirector = useLabStore((state) => state.updateDirector);
  const knobLabels = useLabStore((state) => state.knobLabels);
  const ranges = useLabStore((state) => state.ranges);

  const [selection, setSelection] = useState<Selection>(null);
  const [playing, setPlaying] = useState(false);
  // Smooth follows the authoring curves per frame (what the lab and any
  // interpolating player can do); steps replays the 1 Hz staircase exactly
  // as today's panel .pfs player does. The file is identical either way.
  const [smooth, setSmooth] = useState(true);
  const [timeText, setTimeText] = useState("0.0");
  const [message, setMessage] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  const baked = useMemo(() => bakeShow(director), [director]);
  const width = (baked.duration + 2) * PPS;
  const hasContent = showHasContent(director);

  // ── playback (refs + rAF; the playheads move via one CSS var, no re-render) ──
  const bakedRef = useRef(baked);
  const loopRef = useRef(director.loop);
  useEffect(() => {
    bakedRef.current = baked;
  }, [baked]);
  useEffect(() => {
    loopRef.current = director.loop;
  }, [director.loop]);
  const playheadRef = useRef(0);
  const lastSecRef = useRef(-1);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const moveDom = useCallback(() => {
    timelineRef.current?.style.setProperty("--ph", `${playheadRef.current * PPS}px`);
  }, []);

  const smoothRef = useRef(true);

  const updateMessageAt = useCallback((s: number) => {
    let text = "";
    for (const cue of bakedRef.current.perf.timeline) {
      if (cue.t > s) break;
      if (cue.message != null) text = cue.message;
    }
    setMessage(text);
  }, []);

  /** Fire every lane whose staircase changes at second `s` into the knobs. */
  const applySecond = useCallback(
    (s: number, force: boolean) => {
      const values = bakedRef.current.laneValues;
      const state = useLabStore.getState();
      for (let lane = 0; lane < 4; lane++) {
        const v = values[lane]?.[s];
        if (v == null) continue;
        const previous = s > 0 ? values[lane][s - 1] : null;
        if (!force && v === previous) continue;
        const range = state.ranges[lane] ?? [0, 1];
        state.setKnob(lane, wireToReal(v, range));
      }
      updateMessageAt(s);
    },
    [updateMessageAt],
  );

  /** Sample the authoring curves at a continuous time — smooth playback. */
  const lastWireRef = useRef<(number | null)[]>([null, null, null, null]);
  const applyContinuous = useCallback((t: number, force: boolean) => {
    const state = useLabStore.getState();
    for (let lane = 0; lane < 4; lane++) {
      const v = continuousLaneValue(state.director.lanes[lane], t);
      if (v == null) continue;
      if (!force && lastWireRef.current[lane] === v) continue;
      lastWireRef.current[lane] = v;
      const range = state.ranges[lane] ?? [0, 1];
      state.setKnob(lane, wireToReal(v, range));
    }
  }, []);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(bakedRef.current.duration, t));
      playheadRef.current = clamped;
      lastSecRef.current = Math.floor(clamped);
      if (smoothRef.current) {
        applyContinuous(clamped, true);
        updateMessageAt(Math.floor(clamped));
      } else {
        applySecond(Math.floor(clamped), true);
      }
      moveDom();
      setTimeText(clamped.toFixed(1));
    },
    [applyContinuous, applySecond, moveDom, updateMessageAt],
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let readoutAt = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let t = playheadRef.current + dt;
      const duration = bakedRef.current.duration;
      if (t >= duration) {
        if (loopRef.current) {
          t = t % Math.max(1, duration);
          lastSecRef.current = -1;
        } else {
          playheadRef.current = duration;
          moveDom();
          setTimeText(duration.toFixed(1));
          setPlaying(false);
          return;
        }
      }
      playheadRef.current = t;
      const second = Math.floor(t);
      if (second !== lastSecRef.current) {
        lastSecRef.current = second;
        if (smoothRef.current) updateMessageAt(second);
        else applySecond(second, false);
      }
      if (smoothRef.current) applyContinuous(t, false);
      moveDom();
      if (now - readoutAt > 150) {
        readoutAt = now;
        setTimeText(t.toFixed(1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, applyContinuous, applySecond, moveDom, updateMessageAt]);

  // ── editing helpers ──
  const editLane = useCallback(
    (lane: number, edit: (keys: DirectorKeyframe[]) => DirectorKeyframe[]) => {
      updateDirector((show) => {
        const lanes = show.lanes.map((entry, index) =>
          index === lane ? sortedLane(edit(entry)) : entry,
        ) as DirectorShow["lanes"];
        return { ...show, lanes };
      });
    },
    [updateDirector],
  );

  const addKey = useCallback(
    (lane: number, t: number, v: number) => {
      const id = directorId();
      editLane(lane, (keys) => [
        ...keys,
        { id, t, v, mode: "hold", cp: [...DEFAULT_CURVE_CP] as DirectorKeyframe["cp"] },
      ]);
      setSelection({ kind: "key", lane, id });
    },
    [editLane],
  );

  const patchKey = useCallback(
    (lane: number, id: string, patch: Partial<DirectorKeyframe>) => {
      editLane(lane, (keys) => keys.map((k) => (k.id === id ? { ...k, ...patch } : k)));
    },
    [editLane],
  );

  const selectedKey = useMemo(() => {
    if (selection?.kind !== "key") return null;
    const k = director.lanes[selection.lane]?.find((entry) => entry.id === selection.id);
    return k ? { ...selection, key: k } : null;
  }, [selection, director]);

  const selectedMsg = useMemo(() => {
    if (selection?.kind !== "msg") return null;
    const m = director.messages.find((entry) => entry.id === selection.id);
    return m ? { id: m.id, msg: m } : null;
  }, [selection, director]);

  // ── pointer dragging (keys and curve handles) ──
  const dragRef = useRef<{
    kind: "key" | "h1" | "h2";
    lane: number;
    id: string;
    svg: SVGSVGElement;
  } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = drag.svg.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const state = useLabStore.getState();
      const lane = state.director.lanes[drag.lane];
      const key = lane.find((k) => k.id === drag.id);
      if (!key) return;
      if (drag.kind === "key") {
        const t = Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, Math.round(px / PPS)));
        patchKey(drag.lane, drag.id, { t, v: yToWire(py) });
        return;
      }
      // Curve handles: normalized within the segment to the NEXT keyframe.
      const keys = sortedLane(lane);
      const index = keys.findIndex((k) => k.id === drag.id);
      const next = keys[index + 1];
      if (!next || next.t <= key.t) return;
      const u = Math.max(0, Math.min(1, (px / PPS - key.t) / (next.t - key.t)));
      const dv = next.v - key.v;
      let y: number;
      if (dv === 0) {
        y = drag.kind === "h1" ? key.cp[1] : key.cp[3];
      } else {
        y = Math.max(-1, Math.min(2, (yToWire(py) - key.v) / dv));
      }
      const cp = [...key.cp] as DirectorKeyframe["cp"];
      if (drag.kind === "h1") {
        cp[0] = u;
        cp[1] = y;
      } else {
        cp[2] = u;
        cp[3] = y;
      }
      patchKey(drag.lane, drag.id, { cp });
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [patchKey]);

  // ── import / export ──
  const exportPfs = () => {
    const check = validatePerformance(JSON.stringify(serializePerformance(baked.perf)));
    if (!check.ok) {
      setImportError(check.error);
      return;
    }
    const bytes = encodePfst(check.perf);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pfsFilename(check.perf);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    void readPerformanceFile(file).then((result) => {
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      const check = validatePerformance(result.json);
      if (!check.ok) {
        setImportError(check.error);
        return;
      }
      if (
        showHasContent(useLabStore.getState().director) &&
        !window.confirm("Replace the current show with the imported one?")
      ) {
        return;
      }
      updateDirector(() => showFromPerformance(check.perf));
      setSelection(null);
      seek(0);
    });
  };

  const rulerSeek = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seek((event.clientX - rect.left) / PPS);
  };

  const budgetClass = baked.overBudget
    ? `${local.budget} ${local.budgetOver}`
    : local.budget;

  return (
    <div className={dock.panel}>
      {/* transport */}
      <div className={dock.panelBar}>
        <button
          type="button"
          data-active={playing ? "true" : undefined}
          disabled={!hasContent}
          title={hasContent ? (playing ? "Pause" : "Play the show — cues drive the knobs, the pattern follows") : "Add keyframes first (double-click a lane)"}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            if (playheadRef.current >= baked.duration) seek(0);
            setPlaying(true);
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          title="Back to the start"
          onClick={() => {
            setPlaying(false);
            seek(0);
          }}
        >
          ⏮
        </button>
        <button
          type="button"
          data-active={smooth ? "true" : undefined}
          title={
            smooth
              ? "Smooth: playback follows your curves continuously — what the lab (and any interpolating player) shows. The .pfs file itself is 1-second cues; click to hear it exactly as today's panel player steps it."
              : "Steps: playback replays the 1-second staircase exactly as today's panel .pfs player does. Click for smooth playback along your curves."
          }
          onClick={() => {
            const next = !smooth;
            smoothRef.current = next;
            setSmooth(next);
            seek(playheadRef.current);
          }}
        >
          {smooth ? "smooth" : "steps"}
        </button>
        <span className={styles.stats}>
          <span>t {timeText} s</span>
          <span className={styles.dotSep}>·</span>
          <span
            className={budgetClass}
            title={`Device budget: ${PFST_MAX_CUES} cues per show. Curves bake one cue per second.`}
          >
            {baked.cueCount}/{PFST_MAX_CUES} cues
          </span>
        </span>
        {message && (
          <span className={styles.stats} title="Banner message at the playhead">
            💬 {message}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <label title="Show length in seconds — playback and export never end before the last cue">
          length
          <input
            type="number"
            min={1}
            max={DIRECTOR_MAX_SECONDS}
            value={director.length}
            style={{ width: 54 }}
            onChange={(event) => {
              const length = Math.max(
                1,
                Math.min(DIRECTOR_MAX_SECONDS, Math.round(Number(event.target.value) || 1)),
              );
              updateDirector((show) => ({ ...show, length }));
            }}
          />
        </label>
        <label title="Loop the show">
          <input
            type="checkbox"
            checked={director.loop}
            onChange={(event) => updateDirector((show) => ({ ...show, loop: event.target.checked }))}
          />
          loop
        </label>
        <input
          type="text"
          value={director.title}
          placeholder="Show title"
          maxLength={31}
          style={{ width: 110 }}
          title="Name of the show — the .pfs and the published performance carry it"
          onChange={(event) => updateDirector((show) => ({ ...show, title: event.target.value }))}
        />
        <button
          type="button"
          disabled={!hasContent || baked.overBudget}
          title="Download this show as a .pfs table — what the panel plays from /shows"
          onClick={exportPfs}
        >
          .pfs
        </button>
        <button
          type="button"
          title="Load a .pfs (or Director JSON) into the timeline"
          onClick={() => fileRef.current?.click()}
        >
          Load
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pfs,.json,application/octet-stream,application/json"
          style={{ display: "none" }}
          onChange={(event) => {
            importFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {/* selection editor */}
      <div className={dock.panelBar}>
        {selectedKey ? (
          <>
            <label title="Keyframe second">
              t
              <input
                type="number"
                min={0}
                max={DIRECTOR_MAX_SECONDS}
                value={selectedKey.key.t}
                style={{ width: 54 }}
                onChange={(event) =>
                  patchKey(selectedKey.lane, selectedKey.id, {
                    t: Math.max(
                      0,
                      Math.min(DIRECTOR_MAX_SECONDS, Math.round(Number(event.target.value) || 0)),
                    ),
                  })
                }
              />
            </label>
            <label title="Wire value on the device's absolute bus">
              value
              <input
                type="number"
                min={0}
                max={1000}
                value={selectedKey.key.v}
                style={{ width: 60 }}
                onChange={(event) =>
                  patchKey(selectedKey.lane, selectedKey.id, {
                    v: Math.max(0, Math.min(1000, Math.round(Number(event.target.value) || 0))),
                  })
                }
              />
            </label>
            <span className={styles.stats}>
              = {wireToReal(selectedKey.key.v, ranges[selectedKey.lane] ?? [0, 1]).toFixed(2)}{" "}
              {knobLabels[selectedKey.lane]}
            </span>
            <label title="How this keyframe reaches the NEXT one: hold jumps there, curve eases with draggable handles">
              to next
              <select
                value={selectedKey.key.mode}
                onChange={(event) =>
                  patchKey(selectedKey.lane, selectedKey.id, {
                    mode: event.target.value === "curve" ? "curve" : "hold",
                  })
                }
              >
                <option value="hold">hold</option>
                <option value="curve">curve</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                editLane(selectedKey.lane, (keys) =>
                  keys.filter((k) => k.id !== selectedKey.id),
                );
                setSelection(null);
              }}
            >
              Delete
            </button>
          </>
        ) : selectedMsg ? (
          <>
            <label title="Message second">
              t
              <input
                type="number"
                min={0}
                max={DIRECTOR_MAX_SECONDS}
                value={selectedMsg.msg.t}
                style={{ width: 54 }}
                onChange={(event) =>
                  updateDirector((show) => ({
                    ...show,
                    messages: show.messages.map((m) =>
                      m.id === selectedMsg.id
                        ? {
                            ...m,
                            t: Math.max(
                              0,
                              Math.min(
                                DIRECTOR_MAX_SECONDS,
                                Math.round(Number(event.target.value) || 0),
                              ),
                            ),
                          }
                        : m,
                    ),
                  }))
                }
              />
            </label>
            <input
              type="text"
              value={selectedMsg.msg.text}
              maxLength={200}
              style={{ flex: 1, minWidth: 120 }}
              onChange={(event) =>
                updateDirector((show) => ({
                  ...show,
                  messages: show.messages.map((m) =>
                    m.id === selectedMsg.id ? { ...m, text: event.target.value } : m,
                  ),
                }))
              }
            />
            <button
              type="button"
              onClick={() => {
                updateDirector((show) => ({
                  ...show,
                  messages: show.messages.filter((m) => m.id !== selectedMsg.id),
                }));
                setSelection(null);
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <span className={dock.panelHint} style={{ padding: 0 }}>
              Double-click a lane to add a keyframe · drag dots to move · select one to shape its
              curve
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              title="Add a banner message at the playhead"
              onClick={() => {
                const id = directorId();
                const t = Math.round(playheadRef.current);
                updateDirector((show) => ({
                  ...show,
                  messages: [...show.messages, { id, t, text: "message" }].sort(
                    (a, b) => a.t - b.t,
                  ),
                }));
                setSelection({ kind: "msg", id });
              }}
            >
              + message
            </button>
          </>
        )}
        {importError && <span className={styles.errorBox}>{importError}</span>}
      </div>

      {/* timeline */}
      <div className={local.body}>
        <div
          ref={timelineRef}
          className={local.timeline}
          style={{ "--pps": PPS } as React.CSSProperties}
        >
          <div className={local.gutterCell}>t</div>
          <div
            className={`${local.laneCell} ${local.ruler}`}
            style={{ width }}
            onPointerDown={rulerSeek}
            onPointerMove={(event) => {
              if (event.buttons === 1) rulerSeek(event);
            }}
          >
            {Array.from({ length: Math.floor(baked.duration / 5) + 1 }, (_, i) => (
              <span key={i} className={local.rulerTick} style={{ left: i * 5 * PPS }}>
                {i * 5}s
              </span>
            ))}
            <div className={local.playhead} />
          </div>

          {[0, 1, 2, 3].map((lane) => (
            <FragmentRow key={lane} label={knobLabels[lane] ?? `Knob ${lane + 1}`} width={width}>
              <Lane
                keys={sortedLane(director.lanes[lane])}
                values={baked.laneValues[lane]}
                duration={baked.duration}
                width={width}
                selectedId={
                  selection?.kind === "key" && selection.lane === lane ? selection.id : null
                }
                onAdd={(t, v) => addKey(lane, t, v)}
                onBeginDrag={(kind, id, svg) => {
                  if (kind === "key") setSelection({ kind: "key", lane, id });
                  dragRef.current = { kind, lane, id, svg };
                }}
              />
            </FragmentRow>
          ))}

          <div className={local.gutterCell}>message</div>
          <div className={local.laneCell} style={{ width, height: MSG_H }}>
            {director.messages.map((m) => (
              <span
                key={m.id}
                className={`${local.msgChip}${
                  selection?.kind === "msg" && selection.id === m.id
                    ? ` ${local.msgChipSelected}`
                    : ""
                }`}
                style={{ left: m.t * PPS }}
                title={`${m.t}s · ${m.text}`}
                onClick={() => setSelection({ kind: "msg", id: m.id })}
              >
                {m.text}
              </span>
            ))}
            <div className={local.playhead} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  label,
  width,
  children,
}: {
  label: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={local.gutterCell}>{label}</div>
      <div className={local.laneCell} style={{ width, height: LANE_H }}>
        {children}
        <div className={local.playhead} />
      </div>
    </>
  );
}

/** One knob lane: the honest staircase, the authoring curve, dots, handles. */
function Lane({
  keys,
  values,
  duration,
  width,
  selectedId,
  onAdd,
  onBeginDrag,
}: {
  keys: DirectorKeyframe[];
  values: (number | null)[];
  duration: number;
  width: number;
  selectedId: string | null;
  onAdd: (t: number, v: number) => void;
  onBeginDrag: (kind: "key" | "h1" | "h2", id: string, svg: SVGSVGElement) => void;
}) {
  // Honest staircase — what the device (and playback) does.
  let stairs = "";
  for (let s = 0; s <= duration; s++) {
    const v = values[s];
    if (v == null) continue;
    const y = wireToY(v);
    stairs += `${stairs ? "L" : "M"}${s * PPS},${y} L${(s + 1) * PPS},${y} `;
  }

  // Authoring intent — the smooth curve the handles shape.
  let ghost = "";
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.mode !== "curve" || b.t <= a.t) continue;
    let path = `M${a.t * PPS},${wireToY(a.v)} `;
    for (let step = 1; step <= 24; step++) {
      const u = step / 24;
      const v = a.v + (b.v - a.v) * cubicBezierY(a.cp, u);
      path += `L${(a.t + u * (b.t - a.t)) * PPS},${wireToY(v)} `;
    }
    ghost += path;
  }

  const selectedIndex = selectedId ? keys.findIndex((k) => k.id === selectedId) : -1;
  const handleKey = selectedIndex >= 0 ? keys[selectedIndex] : null;
  const handleNext = selectedIndex >= 0 ? keys[selectedIndex + 1] : null;
  const showHandles =
    handleKey && handleNext && handleKey.mode === "curve" && handleNext.t > handleKey.t;

  let handles: React.ReactNode = null;
  if (showHandles && handleKey && handleNext) {
    const span = handleNext.t - handleKey.t;
    const dv = handleNext.v - handleKey.v;
    const hx = (u: number) => (handleKey.t + u * span) * PPS;
    const hy = (y: number) => wireToY(handleKey.v + dv * y);
    handles = (
      <g>
        <line
          className={local.handleLine}
          x1={handleKey.t * PPS}
          y1={wireToY(handleKey.v)}
          x2={hx(handleKey.cp[0])}
          y2={hy(handleKey.cp[1])}
        />
        <line
          className={local.handleLine}
          x1={handleNext.t * PPS}
          y1={wireToY(handleNext.v)}
          x2={hx(handleKey.cp[2])}
          y2={hy(handleKey.cp[3])}
        />
        <circle
          className={local.handle}
          cx={hx(handleKey.cp[0])}
          cy={hy(handleKey.cp[1])}
          r={4}
          onPointerDown={(event) => {
            event.stopPropagation();
            onBeginDrag("h1", handleKey.id, event.currentTarget.ownerSVGElement!);
          }}
        />
        <circle
          className={local.handle}
          cx={hx(handleKey.cp[2])}
          cy={hy(handleKey.cp[3])}
          r={4}
          onPointerDown={(event) => {
            event.stopPropagation();
            onBeginDrag("h2", handleKey.id, event.currentTarget.ownerSVGElement!);
          }}
        />
      </g>
    );
  }

  return (
    <svg
      className={local.laneSvg}
      width={width}
      height={LANE_H}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const t = Math.max(0, Math.round((event.clientX - rect.left) / PPS));
        onAdd(t, yToWire(event.clientY - rect.top));
      }}
    >
      {ghost && <path className={local.curveGhost} d={ghost} />}
      {stairs && <path className={local.stairs} d={stairs} />}
      {handles}
      {keys.map((k) => (
        <circle
          key={k.id}
          className={`${local.key}${k.id === selectedId ? ` ${local.keySelected}` : ""}`}
          cx={k.t * PPS}
          cy={wireToY(k.v)}
          r={5}
          onPointerDown={(event) => {
            event.stopPropagation();
            onBeginDrag("key", k.id, event.currentTarget.ownerSVGElement!);
          }}
        />
      ))}
    </svg>
  );
}
