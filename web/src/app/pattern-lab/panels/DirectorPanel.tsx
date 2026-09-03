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
//
// This file is the composition; the concerns are under ./director/: the
// transport view, time zoom and lane height, editing (selection, snap, keys,
// drags), the show as files, and the two bars. The lanes themselves are
// DirectorLanes.tsx. DirectorPanel.test.tsx pins the behaviour.

import { useMemo, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { bakeShowV2, resolveLane } from "@/lib/lab/director/bake";
import { showTransport } from "@/lib/lab/director/transport";
import { showHasContent } from "@/lib/lab/director/types";
import { labPatternName, useLabStore } from "@/lib/lab/store";
import dock from "../LabPanels.module.css";
import local from "./DirectorPanel.module.css";
import { LaneRow, Lane } from "./DirectorLanes";
import { DirectorSelectionBar, DirectorTransportBar } from "./director/DirectorBars";
import { COMPACT_H, COMPACT_PAD, FOCUS_PAD, MSG_H, PPS_DEFAULT, laneColor, tickStep } from "./director/constants";
import { exportMidi, exportPfs, importShowFile } from "./director/showFiles";
import { useShowEditing } from "./director/useShowEditing";
import { useTimelineZoom } from "./director/useTimelineZoom";
import { useTransportView } from "./director/useTransportView";

export default function DirectorPanel(props: IDockviewPanelProps) {
  const director = useLabStore((state) => state.director);
  const updateDirector = useLabStore((state) => state.updateDirector);
  const knobLabels = useLabStore((state) => state.knobLabels);
  const ranges = useLabStore((state) => state.ranges);

  const [importError, setImportError] = useState<string | null>(null);
  const [focusLane, setFocusLane] = useState(0);
  const [showWire, setShowWire] = useState(false);

  // The lab's pattern name rides along everywhere: it opens the show (t=0
  // pattern cue), names the .pfs when the title is blank, and matches the
  // .pfm the hardware path installs — one identity, nothing retyped.
  const patternName = useLabStore((state) => labPatternName(state));
  const baked = useMemo(() => bakeShowV2(director, { openingPattern: patternName }), [director, patternName]);
  const hasContent = showHasContent(director);

  // Auto handles materialized once per edit — drawing, handle display and
  // on-curve insertion all read these, so what is shown IS what bakes.
  const resolvedLanes = useMemo(() => director.lanes.map((lane) => resolveLane(lane)), [director]);

  // The elements this panel renders own their refs, and so do the two
  // mirrors handlers read without a render; the hooks are handed them.
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef(0);
  const ppsRef = useRef(PPS_DEFAULT);
  const transport = useTransportView({ baked, timelineRef, playheadRef });
  const zoom = useTimelineZoom({ bodyRef, ppsRef });
  const editing = useShowEditing({
    director,
    updateDirector,
    focusH: zoom.focusH,
    ppsRef,
    togglePlay: transport.togglePlay,
  });

  const { pps, focusH } = zoom;
  const { selection, setSelection } = editing;
  const duration = baked.perf.length;
  const width = (duration + 2) * pps;
  const step = tickStep(pps);
  const tickCount = Math.floor(duration / step) + 1;
  const gridPx = step * pps;

  const importFile = (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    void importShowFile(file, showHasContent(useLabStore.getState().director), () =>
      window.confirm("Replace the current show with the imported one?"),
    ).then((result) => {
      if (!result.ok) {
        if (result.error) setImportError(result.error);
        return;
      }
      updateDirector(() => result.show);
      setSelection(null);
      transport.seek(0);
    });
  };

  const rulerSeek = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    transport.seek((event.clientX - rect.left) / pps);
  };

  return (
    <div className={dock.panel} tabIndex={-1} onKeyDown={editing.onPanelKeyDown}>
      <DirectorTransportBar
        director={director}
        updateDirector={updateDirector}
        patternName={patternName}
        hasContent={hasContent}
        baked={baked}
        transport={transport}
        editing={editing}
        showWire={showWire}
        setShowWire={setShowWire}
        zoomBy={zoom.zoomBy}
        onExportPfs={() => {
          const error = exportPfs(director, patternName);
          if (error) setImportError(error);
        }}
        onExportMidi={() => exportMidi(director, patternName, knobLabels)}
        onRender={() => {
          // A shortcut, not a hierarchy: flip the shared link on and front
          // the Capture panel (if the user closed it, the link still holds
          // for when they reopen it from the Panels menu).
          showTransport.setFollow(true);
          props.containerApi?.getPanel("capture")?.api.setActive();
        }}
        onImportFile={importFile}
      />

      <DirectorSelectionBar
        editing={editing}
        ranges={ranges}
        knobLabels={knobLabels}
        importError={importError}
        playheadRef={playheadRef}
      />

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
                  selectedId={selection?.kind === "key" && selection.lane === lane ? selection.id : null}
                  onFocus={() => setFocusLane(lane)}
                  onAdd={(t, py) => editing.addKey(lane, t, py)}
                  onSelect={(id) => setSelection({ kind: "key", lane, id })}
                  onBeginDrag={(kind, id, svg, resolvedCp) => editing.beginDrag(kind, lane, id, svg, resolvedCp)}
                />
              </LaneRow>
            );
          })}

          <div className={local.gutterCell}>message</div>
          <div className={local.laneCell} style={{ width, height: MSG_H }}>
            {director.messages.map((m) => (
              <span
                key={m.id}
                className={`${local.msgChip}${selection?.kind === "msg" && selection.id === m.id ? ` ${local.msgChipSelected}` : ""}`}
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
