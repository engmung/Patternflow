"use client";

// Director — knob automation over time, authored against the pattern on the
// canvas. Four lanes (one per physical knob) hold keyframes on the PFST v2
// 0.1 s wire grid — the snap toggle (1 s / 0.5 s / 0.2 s / 0.1 s) is an
// authoring aid, not a format limit.
//
// The editor is an overview-plus-focus layout: all four lanes are always
// visible as compact strips, and the FOCUSED lane (click a strip) expands to
// fill the panel with a value axis, draggable keys and curve handles. New
// keyframes interpolate as SMOOTH curves by default — auto handles derived
// from the neighbors, Blender's auto-clamped idea — and a key can be switched
// to a hand-shaped bezier (grab a handle, it converts) or a hold that jumps
// at the next cue. The solid line is the authored curve; the flattened v2
// wire pieces (what the .pfs ships) track it within a sub-detent error and
// can be overlaid with the "wire" toggle.
//
// Playback belongs to the shared show transport (lib/lab/director/
// transport) — ONE clock for the whole lab. This panel is the view that
// edits it: play/seek here move the same playhead the Capture panel's 🔗
// link follows, and the transport drives the shared knob store the way the
// device's absolute bus drives the encoders, so the pattern animates in the
// live preview (and Capture) because they already follow the knobs.
// Alt/Ctrl-wheel zooms time around the cursor; Shift while dragging bypasses
// the snap grid; Delete removes the selection.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import {
  encodePfst,
  pfsFilename,
  serializePerformance,
  validatePerformance,
  PFST_MAX_CUES,
} from "@/lib/pattern/pfst";
import { readPerformanceFile } from "@/lib/community/performanceFile";
import {
  bakeShowV2,
  resolveLane,
  resolvedLaneValue,
  showFromPerformance,
} from "@/lib/lab/director/bake";
import { showToMidi, midiFilename } from "@/lib/lab/director/exporters/midi";
import { showTransport, type ShowTransportState } from "@/lib/lab/director/transport";
import {
  DEFAULT_CURVE_CP,
  DIRECTOR_MAX_SECONDS,
  directorId,
  showHasContent,
  snapWireTime,
  type DirectorKeyframe,
  type DirectorShow,
} from "@/lib/lab/director/types";
import { labPatternName, useLabStore } from "@/lib/lab/store";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";
import local from "./DirectorPanel.module.css";
import { LaneRow, Lane } from "./DirectorLanes";
import { wireToReal, wireToY, yToWire } from "./directorGeometry";

const PPS_DEFAULT = 28; // px per second
const PPS_MIN = 6;
const PPS_MAX = 220;
const RULER_H = 20;
const COMPACT_H = 36;
const COMPACT_PAD = 4;
const FOCUS_MIN_H = 140;
const GUTTER_W = 92; // must match the grid template in DirectorPanel.module.css
const FOCUS_PAD = 8;
const MSG_H = 26;
/** Double-click closer than this (px) to the curve inserts ON the curve. */
const CURVE_MAGNET_PX = 10;

const LANE_COLORS = ["#0ea5e9", "#a855f7", "#f59e0b", "#10b981"];

type Selection =
  | { kind: "key"; lane: number; id: string }
  | { kind: "msg"; id: string }
  | null;


function sortedLane(lane: DirectorKeyframe[]): DirectorKeyframe[] {
  return [...lane].sort((a, b) => a.t - b.t);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Ruler/grid spacing in seconds for a zoom level — ticks stay ≥ ~56 px apart. */
function tickStep(pps: number): number {
  for (const step of [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) {
    if (step * pps >= 56) return step;
  }
  return 600;
}

/** The three-way interpolation of a keyframe, for the selection editor. */
type Interp = "auto" | "manual" | "hold";
function interpOf(k: DirectorKeyframe): Interp {
  if (k.mode === "hold") return "hold";
  return k.h === "auto" ? "auto" : "manual";
}

export default function DirectorPanel(props: IDockviewPanelProps) {
  const director = useLabStore((state) => state.director);
  const updateDirector = useLabStore((state) => state.updateDirector);
  const knobLabels = useLabStore((state) => state.knobLabels);
  const ranges = useLabStore((state) => state.ranges);

  const [selection, setSelection] = useState<Selection>(null);
  const [playing, setPlaying] = useState(false);
  // Snap is an authoring aid: on, keyframes land on the chosen grid; off,
  // they land on the raw 0.1 s wire grid (the v2 file resolution).
  const [snapOn, setSnapOn] = useState(true);
  const [snapStep, setSnapStep] = useState(1);
  const [timeText, setTimeText] = useState("0.0");
  const [message, setMessage] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [pps, setPps] = useState(PPS_DEFAULT);
  const [focusLane, setFocusLane] = useState(0);
  const [showWire, setShowWire] = useState(false);
  const [focusH, setFocusH] = useState(200);

  // The lab's pattern name rides along everywhere: it opens the show (t=0
  // pattern cue), names the .pfs when the title is blank, and matches the
  // .pfm the hardware path installs — one identity, nothing retyped.
  const patternName = useLabStore((state) => labPatternName(state));
  const baked = useMemo(
    () => bakeShowV2(director, { openingPattern: patternName }),
    [director, patternName],
  );
  const duration = baked.perf.length;
  const width = (duration + 2) * pps;
  const hasContent = showHasContent(director);

  // Auto handles materialized once per edit — drawing, handle display and
  // on-curve insertion all read these, so what is shown IS what bakes.
  const resolvedLanes = useMemo(
    () => director.lanes.map((lane) => resolveLane(lane)),
    [director],
  );

  // Drag handlers live on window and must see current snap/zoom settings.
  const snapRef = useRef({ on: true, step: 1 });
  useEffect(() => {
    snapRef.current = { on: snapOn, step: snapStep };
  }, [snapOn, snapStep]);
  const ppsRef = useRef(pps);
  useEffect(() => {
    ppsRef.current = pps;
  }, [pps]);
  const snapTime = useCallback((t: number, fine = false) => {
    const { on, step } = snapRef.current;
    const q = on && !fine ? Math.round(t / step) * step : t;
    return snapWireTime(Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, q)));
  }, []);

  // ── playback: rendered FROM the shared transport (one clock, lab-wide) ──
  const bakedRef = useRef(baked);
  useEffect(() => {
    bakedRef.current = baked;
  }, [baked]);
  /** Mirror of the transport time, for handlers that need "the playhead now". */
  const playheadRef = useRef(showTransport.get().time);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // The playhead carries its time in seconds; CSS multiplies by --pps, so a
  // zoom moves every playhead without a seek.
  const moveDom = useCallback((t: number) => {
    timelineRef.current?.style.setProperty("--pht", String(t));
  }, []);

  const updateMessageAt = useCallback((t: number) => {
    let text = "";
    for (const cue of bakedRef.current.perf.timeline) {
      if (cue.t > t) break;
      if (cue.message != null) text = cue.message;
    }
    setMessage(text);
  }, []);

  const seek = useCallback((t: number) => showTransport.seek(t), []);

  // The panel renders whatever the transport says — playhead CSS var, time
  // readout (throttled while playing), banner message, play button state.
  useEffect(() => {
    let readoutAt = 0;
    const apply = (state: ShowTransportState) => {
      playheadRef.current = state.time;
      moveDom(state.time);
      updateMessageAt(state.time);
      setPlaying(state.playing);
      const now = performance.now();
      if (!state.playing || now - readoutAt > 150) {
        readoutAt = now;
        setTimeText(state.time.toFixed(1));
      }
    };
    apply(showTransport.get());
    return showTransport.subscribe(apply);
  }, [moveDom, updateMessageAt]);

  const togglePlay = useCallback(() => showTransport.toggle(), []);

  // ── layout: the focused lane fills whatever the panel gives it ──
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const free = el.clientHeight - (RULER_H + 3 * COMPACT_H + MSG_H + 8);
      setFocusH(Math.max(FOCUS_MIN_H, free));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── zoom: Alt/Ctrl-wheel scales time around the cursor ──
  // Native listener: React delegates wheel passively, so preventDefault (to
  // stop browser page-zoom on Ctrl-wheel) only works here.
  const pendingScroll = useRef<{ t: number; px: number } | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.altKey && !event.ctrlKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left - GUTTER_W;
      const t = Math.max(0, (px + el.scrollLeft) / ppsRef.current);
      const next = Math.min(PPS_MAX, Math.max(PPS_MIN, ppsRef.current * Math.exp(-event.deltaY * 0.002)));
      if (next === ppsRef.current) return;
      pendingScroll.current = { t, px };
      setPps(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!target || !bodyRef.current) return;
    pendingScroll.current = null;
    bodyRef.current.scrollLeft = Math.max(0, target.t * pps - target.px);
  }, [pps]);

  const zoomBy = useCallback((factor: number) => {
    const el = bodyRef.current;
    const next = Math.min(PPS_MAX, Math.max(PPS_MIN, ppsRef.current * factor));
    if (el) {
      // Keep the view center still.
      const px = (el.clientWidth - GUTTER_W) / 2;
      pendingScroll.current = { t: Math.max(0, (px + el.scrollLeft) / ppsRef.current), px };
    }
    setPps(next);
  }, []);

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

  const patchKey = useCallback(
    (lane: number, id: string, patch: Partial<DirectorKeyframe>) => {
      editLane(lane, (keys) => keys.map((k) => (k.id === id ? { ...k, ...patch } : k)));
    },
    [editLane],
  );

  // Double-click on the focused lane: near the curve inserts ON the curve
  // (the segment keeps its shape as closely as auto handles allow), free
  // space inserts at the pointer. New keys are smooth — curve + auto.
  const addKey = useCallback(
    (lane: number, rawT: number, pointerY: number) => {
      const t = snapTime(rawT);
      let v = yToWire(pointerY, focusH, FOCUS_PAD);
      const onCurve = resolvedLaneValue(resolveLane(useLabStore.getState().director.lanes[lane]), t);
      if (onCurve != null && Math.abs(wireToY(onCurve, focusH, FOCUS_PAD) - pointerY) <= CURVE_MAGNET_PX) {
        v = Math.round(onCurve);
      }
      const id = directorId();
      editLane(lane, (keys) => [
        ...keys,
        { id, t, v, mode: "curve", h: "auto", cp: [...DEFAULT_CURVE_CP] as DirectorKeyframe["cp"] },
      ]);
      setSelection({ kind: "key", lane, id });
    },
    [editLane, snapTime, focusH],
  );

  const deleteSelection = useCallback(() => {
    const current = selection;
    if (!current) return;
    if (current.kind === "key") {
      editLane(current.lane, (keys) => keys.filter((k) => k.id !== current.id));
    } else {
      updateDirector((show) => ({
        ...show,
        messages: show.messages.filter((m) => m.id !== current.id),
      }));
    }
    setSelection(null);
  }, [selection, editLane, updateDirector]);

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

  // Keyboard, scoped to the panel (the root div holds focus after any click
  // inside): Delete removes the selection, Space toggles playback.
  const onPanelKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.tagName === "BUTTON" ||
        target.isContentEditable
      ) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      }
    },
    [deleteSelection, togglePlay],
  );

  // ── pointer dragging (keys and curve handles) ──
  const dragRef = useRef<{
    kind: "key" | "h1" | "h2";
    lane: number;
    id: string;
    svg: SVGSVGElement;
    laneH: number;
    pad: number;
  } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = drag.svg.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const pps = ppsRef.current;
      const state = useLabStore.getState();
      const lane = state.director.lanes[drag.lane];
      const key = lane.find((k) => k.id === drag.id);
      if (!key) return;
      if (drag.kind === "key") {
        patchKey(drag.lane, drag.id, {
          t: snapTime(px / pps, event.shiftKey),
          v: yToWire(py, drag.laneH, drag.pad),
        });
        return;
      }
      // Curve handles: normalized within the segment to the NEXT keyframe.
      const keys = sortedLane(lane);
      const index = keys.findIndex((k) => k.id === drag.id);
      const next = keys[index + 1];
      if (!next || next.t <= key.t) return;
      const u = Math.max(0, Math.min(1, (px / pps - key.t) / (next.t - key.t)));
      const dv = next.v - key.v;
      let y: number;
      if (dv === 0) {
        y = drag.kind === "h1" ? key.cp[1] : key.cp[3];
      } else {
        y = Math.max(-1, Math.min(2, (yToWire(py, drag.laneH, drag.pad) - key.v) / dv));
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
  }, [patchKey, snapTime]);

  const beginDrag = useCallback(
    (
      kind: "key" | "h1" | "h2",
      lane: number,
      id: string,
      svg: SVGSVGElement,
      resolvedCp?: DirectorKeyframe["cp"],
    ) => {
      if (kind !== "key" && resolvedCp) {
        // Grabbing an auto handle converts the segment to a hand-shaped
        // bezier, frozen at the auto shape it had — Blender's gesture.
        const key = useLabStore.getState().director.lanes[lane].find((k) => k.id === id);
        if (key && key.h === "auto") {
          patchKey(lane, id, { h: "manual", cp: [...resolvedCp] as DirectorKeyframe["cp"] });
        }
      }
      dragRef.current = { kind, lane, id, svg, laneH: focusH, pad: FOCUS_PAD };
    },
    [patchKey, focusH],
  );

  // ── import / export ──
  const exportPfs = () => {
    // A blank title falls back to the pattern name, so the file downloads as
    // <pattern>.pfs instead of the one-size lab_show.pfs.
    const named = director.title.trim() ? director : { ...director, title: patternName };
    const out = bakeShowV2(named, { openingPattern: patternName });
    const check = validatePerformance(JSON.stringify(serializePerformance(out.perf)));
    if (!check.ok) {
      setImportError(check.error);
      return;
    }
    const bytes = encodePfst(check.perf);
    downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" }), pfsFilename(check.perf));
  };

  // The same show as a standard MIDI file: one CC per knob lane, ready to
  // drop on an Ableton (or any DAW) track and MIDI-map to macros.
  const exportMidi = () => {
    const named = director.title.trim() ? director : { ...director, title: patternName };
    const bytes = showToMidi(named, { labels: knobLabels });
    downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" }), midiFilename(named.title));
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
    seek((event.clientX - rect.left) / pps);
  };

  const budgetClass = baked.overBudget ? `${local.budget} ${local.budgetOver}` : local.budget;

  const step = tickStep(pps);
  const tickCount = Math.floor(duration / step) + 1;
  const gridPx = step * pps;

  const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

  return (
    <div className={dock.panel} tabIndex={-1} onKeyDown={onPanelKeyDown}>
      {/* transport */}
      <div className={dock.panelBar}>
        <button
          type="button"
          data-active={playing ? "true" : undefined}
          disabled={!hasContent}
          title={hasContent ? (playing ? "Pause (Space)" : "Play the show — cues drive the knobs, the pattern follows (Space)") : "Add keyframes first (double-click the focused lane)"}
          onClick={togglePlay}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          title="Back to the start"
          onClick={() => {
            showTransport.pause();
            seek(0);
          }}
        >
          ⏮
        </button>
        <label title="Snap keyframes to a time grid while placing and dragging — off (or holding Shift), they land on the raw 0.1 s wire grid (the .pfs resolution)">
          <input
            type="checkbox"
            checked={snapOn}
            onChange={(event) => setSnapOn(event.target.checked)}
          />
          snap
        </label>
        <select
          value={String(snapStep)}
          disabled={!snapOn}
          title="Snap grid spacing"
          onChange={(event) => setSnapStep(Number(event.target.value))}
        >
          <option value="1">1s</option>
          <option value="0.5">0.5s</option>
          <option value="0.2">0.2s</option>
          <option value="0.1">0.1s</option>
        </select>
        <button type="button" title="Zoom out (Alt-wheel on the timeline)" onClick={() => zoomBy(1 / 1.4)}>
          −
        </button>
        <button type="button" title="Zoom in (Alt-wheel on the timeline)" onClick={() => zoomBy(1.4)}>
          +
        </button>
        <label title="Overlay the flattened wire pieces the .pfs actually ships — they track the authored curve within one encoder detent">
          <input
            type="checkbox"
            checked={showWire}
            onChange={(event) => setShowWire(event.target.checked)}
          />
          wire
        </label>
        <span className={styles.stats}>
          <span>t {timeText} s</span>
          <span className={styles.dotSep}>·</span>
          <span
            className={budgetClass}
            title={`Device budget: ${PFST_MAX_CUES} cues per show. Curves flatten adaptively into eased pieces on the 0.1 s grid (within 0.8% of the authored bezier).`}
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
        <label title="Show length in seconds (0.1 s steps) — playback and export never end before the last cue">
          length
          <input
            type="number"
            min={0.1}
            max={DIRECTOR_MAX_SECONDS}
            step={0.1}
            value={director.length}
            style={{ width: 60 }}
            onChange={(event) => {
              const length = Math.max(
                0.1,
                Math.min(DIRECTOR_MAX_SECONDS, snapWireTime(Number(event.target.value) || 1)),
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
          placeholder={patternName}
          maxLength={31}
          style={{ width: 110 }}
          title="Name of the show — the .pfs and the published performance carry it. Blank uses the pattern's name, which also names the .pfm the hardware path installs."
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
          disabled={!hasContent}
          title="Download this show as a MIDI file — each knob lane becomes a CC automation, ready to drop on an Ableton track and MIDI-map"
          onClick={exportMidi}
        >
          .mid
        </button>
        <button
          type="button"
          disabled={!hasContent}
          title="Open Graphic Export linked to the Director (🔗) — render the show to video there, with the automation driving the knobs"
          onClick={() => {
            // A shortcut, not a hierarchy: flip the shared link on and front
            // the Capture panel (if the user closed it, the link still holds
            // for when they reopen it from the Panels menu).
            showTransport.setFollow(true);
            props.containerApi?.getPanel("capture")?.api.setActive();
          }}
        >
          Render…
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
            <label title="Keyframe time in seconds, 0.1 s steps">
              t
              <input
                type="number"
                min={0}
                max={DIRECTOR_MAX_SECONDS}
                step={0.1}
                value={selectedKey.key.t}
                style={{ width: 60 }}
                onChange={(event) =>
                  patchKey(selectedKey.lane, selectedKey.id, {
                    t: Math.max(
                      0,
                      Math.min(DIRECTOR_MAX_SECONDS, snapWireTime(Number(event.target.value) || 0)),
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
            <label title="How this keyframe reaches the NEXT one: smooth derives the curve from the neighbors (Blender auto-clamped), bezier is hand-shaped with draggable handles, hold keeps the value and jumps at the next cue">
              to next
              <select
                value={interpOf(selectedKey.key)}
                onChange={(event) => {
                  const interp = event.target.value as Interp;
                  if (interp === "hold") {
                    patchKey(selectedKey.lane, selectedKey.id, { mode: "hold" });
                  } else if (interp === "auto") {
                    patchKey(selectedKey.lane, selectedKey.id, { mode: "curve", h: "auto" });
                  } else {
                    // Freeze the current shape so switching auto → bezier
                    // starts from what is on screen, not from a default.
                    const resolved = resolveLane(
                      useLabStore.getState().director.lanes[selectedKey.lane],
                    ).find((k) => k.id === selectedKey.id);
                    patchKey(selectedKey.lane, selectedKey.id, {
                      mode: "curve",
                      h: "manual",
                      cp: [...(resolved?.cp ?? selectedKey.key.cp)] as DirectorKeyframe["cp"],
                    });
                  }
                }}
              >
                <option value="auto">smooth</option>
                <option value="manual">bezier</option>
                <option value="hold">hold</option>
              </select>
            </label>
            <button type="button" onClick={deleteSelection}>
              Delete
            </button>
          </>
        ) : selectedMsg ? (
          <>
            <label title="Message time in seconds, 0.1 s steps">
              t
              <input
                type="number"
                min={0}
                max={DIRECTOR_MAX_SECONDS}
                step={0.1}
                value={selectedMsg.msg.t}
                style={{ width: 60 }}
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
                                snapWireTime(Number(event.target.value) || 0),
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
            <button type="button" onClick={deleteSelection}>
              Delete
            </button>
          </>
        ) : (
          <>
            <span className={dock.panelHint} style={{ padding: 0 }}>
              Click a lane to focus it · double-click the focused lane to add a smooth keyframe ·
              drag dots, shape with handles · Shift = fine · Alt-wheel = zoom
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              title="Add a banner message at the playhead"
              onClick={() => {
                const id = directorId();
                const t = snapTime(playheadRef.current);
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
      <div className={local.body} ref={bodyRef}>
        <div
          ref={timelineRef}
          className={local.timeline}
          style={{ "--pps": pps, "--gridpx": gridPx } as React.CSSProperties}
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
            {Array.from({ length: tickCount }, (_, i) => (
              <span key={i} className={local.rulerTick} style={{ left: i * gridPx }}>
                {step < 1 ? (i * step).toFixed(1) : i * step}s
              </span>
            ))}
            <div className={local.playhead} />
          </div>

          {[0, 1, 2, 3].map((lane) => {
            const focused = lane === focusLane;
            const height = focused ? focusH : COMPACT_H;
            const range = ranges[lane] ?? [0, 1];
            return (
              <LaneRow
                key={lane}
                label={knobLabels[lane] ?? `Knob ${lane + 1}`}
                color={laneColor(lane)}
                focused={focused}
                height={height}
                width={width}
                range={range}
                onFocus={() => setFocusLane(lane)}
              >
                <Lane
                  keys={resolvedLanes[lane]}
                  rawLane={director.lanes[lane]}
                  width={width}
                  height={height}
                  pad={focused ? FOCUS_PAD : COMPACT_PAD}
                  pps={pps}
                  color={laneColor(lane)}
                  focused={focused}
                  showWire={showWire && focused}
                  selectedId={
                    selection?.kind === "key" && selection.lane === lane ? selection.id : null
                  }
                  onFocus={() => setFocusLane(lane)}
                  onAdd={(t, py) => addKey(lane, t, py)}
                  onSelect={(id) => setSelection({ kind: "key", lane, id })}
                  onBeginDrag={(kind, id, svg, resolvedCp) =>
                    beginDrag(kind, lane, id, svg, resolvedCp)
                  }
                />
              </LaneRow>
            );
          })}

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
                style={{ left: m.t * pps }}
                title={`${m.t.toFixed(1)}s · ${m.text}`}
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
