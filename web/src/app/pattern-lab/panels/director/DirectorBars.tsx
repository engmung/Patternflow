"use client";

// ── The Director's two bars ──────────────────────────────────────────────────
// Transport (play, snap, zoom, wire, readouts, length/loop/title, export,
// load) and the selection editor (a keyframe's time / value / interpolation,
// or a message's time / text, or the hint and "+ message"). Presentation;
// every action is a prop.

import { useRef, type RefObject } from "react";
import { PFST_MAX_CUES } from "@/lib/pattern/pfst";
import { resolveLane } from "@/lib/lab/director/bake";
import { DIRECTOR_MAX_SECONDS, snapWireTime, type DirectorKeyframe, type DirectorShow } from "@/lib/lab/director/types";
import { useLabStore } from "@/lib/lab/store";
import { wireToReal } from "../directorGeometry";
import { interpOf, type Interp, type ShowEditing } from "./useShowEditing";
import type { TransportView } from "./useTransportView";
import styles from "../../PatternLab.module.css";
import dock from "../../LabPanels.module.css";
import local from "../DirectorPanel.module.css";

type Baked = { cueCount: number; overBudget: boolean };

export function DirectorTransportBar({
  director,
  updateDirector,
  patternName,
  hasContent,
  baked,
  transport,
  editing,
  showWire,
  setShowWire,
  zoomBy,
  onExportPfs,
  onExportMidi,
  onRender,
  onImportFile,
}: {
  director: DirectorShow;
  updateDirector: (update: (show: DirectorShow) => DirectorShow) => void;
  patternName: string;
  hasContent: boolean;
  baked: Baked;
  transport: TransportView;
  editing: ShowEditing;
  showWire: boolean;
  setShowWire: (on: boolean) => void;
  zoomBy: (factor: number) => void;
  onExportPfs: () => void;
  onExportMidi: () => void;
  onRender: () => void;
  onImportFile: (file: File | undefined) => void;
}) {
  const fileRef: RefObject<HTMLInputElement | null> = useRef<HTMLInputElement | null>(null);
  const { playing, timeText, message, togglePlay, backToStart } = transport;
  const { snapOn, setSnapOn, snapStep, setSnapStep } = editing;
  const budgetClass = baked.overBudget ? `${local.budget} ${local.budgetOver}` : local.budget;

  return (
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
      <button type="button" title="Back to the start" onClick={backToStart}>
        ⏮
      </button>
      <label title="Snap keyframes to a time grid while placing and dragging — off (or holding Shift), they land on the raw 0.1 s wire grid (the .pfs resolution)">
        <input type="checkbox" checked={snapOn} onChange={(event) => setSnapOn(event.target.checked)} />
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
        <input type="checkbox" checked={showWire} onChange={(event) => setShowWire(event.target.checked)} />
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
            const length = Math.max(0.1, Math.min(DIRECTOR_MAX_SECONDS, snapWireTime(Number(event.target.value) || 1)));
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
        onClick={onExportPfs}
      >
        .pfs
      </button>
      <button
        type="button"
        disabled={!hasContent}
        title="Download this show as a MIDI file — each knob lane becomes a CC automation, ready to drop on an Ableton track and MIDI-map"
        onClick={onExportMidi}
      >
        .mid
      </button>
      <button
        type="button"
        disabled={!hasContent}
        title="Open Graphic Export linked to the Director (🔗) — render the show to video there, with the automation driving the knobs"
        onClick={onRender}
      >
        Render…
      </button>
      <button type="button" title="Load a .pfs (or Director JSON) into the timeline" onClick={() => fileRef.current?.click()}>
        Load
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pfs,.json,application/octet-stream,application/json"
        style={{ display: "none" }}
        onChange={(event) => {
          onImportFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function DirectorSelectionBar({
  editing,
  ranges,
  knobLabels,
  importError,
  playheadRef,
}: {
  editing: ShowEditing;
  ranges: Array<[number, number]>;
  knobLabels: string[];
  importError: string | null;
  playheadRef: RefObject<number>;
}) {
  const { selectedKey, selectedMsg, patchKey, patchMessage, deleteSelection, addMessageAt } = editing;
  return (
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
                  t: Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, snapWireTime(Number(event.target.value) || 0))),
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
            = {wireToReal(selectedKey.key.v, ranges[selectedKey.lane] ?? [0, 1]).toFixed(2)} {knobLabels[selectedKey.lane]}
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
                  const resolved = resolveLane(useLabStore.getState().director.lanes[selectedKey.lane]).find(
                    (k) => k.id === selectedKey.id,
                  );
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
                patchMessage(selectedMsg.id, {
                  t: Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, snapWireTime(Number(event.target.value) || 0))),
                })
              }
            />
          </label>
          <input
            type="text"
            value={selectedMsg.msg.text}
            maxLength={200}
            style={{ flex: 1, minWidth: 120 }}
            onChange={(event) => patchMessage(selectedMsg.id, { text: event.target.value })}
          />
          <button type="button" onClick={deleteSelection}>
            Delete
          </button>
        </>
      ) : (
        <>
          <span className={dock.panelHint} style={{ padding: 0 }}>
            Click a lane to focus it · double-click the focused lane to add a smooth keyframe · drag dots, shape with handles ·
            Shift = fine · Alt-wheel = zoom
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" title="Add a banner message at the playhead" onClick={() => addMessageAt(playheadRef.current)}>
            + message
          </button>
        </>
      )}
      {importError && <span className={styles.errorBox}>{importError}</span>}
    </div>
  );
}
