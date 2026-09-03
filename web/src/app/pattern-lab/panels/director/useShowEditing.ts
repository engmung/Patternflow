// ── Editing the show ─────────────────────────────────────────────────────────
// Selection, the snap grid, keyframe edits (add on double-click, patch,
// delete), dragging keys and curve handles on window listeners, and the
// panel's two keys (Delete, Space).

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { resolveLane, resolvedLaneValue } from "@/lib/lab/director/bake";
import {
  DEFAULT_CURVE_CP,
  DIRECTOR_MAX_SECONDS,
  directorId,
  snapWireTime,
  type DirectorKeyframe,
  type DirectorShow,
} from "@/lib/lab/director/types";
import { useLabStore } from "@/lib/lab/store";
import { wireToY, yToWire } from "../directorGeometry";
import { CURVE_MAGNET_PX, FOCUS_PAD } from "./constants";

export type Selection =
  | { kind: "key"; lane: number; id: string }
  | { kind: "msg"; id: string }
  | null;

/** The three-way interpolation of a keyframe, for the selection editor. */
export type Interp = "auto" | "manual" | "hold";
export function interpOf(k: DirectorKeyframe): Interp {
  if (k.mode === "hold") return "hold";
  return k.h === "auto" ? "auto" : "manual";
}

export function sortedLane(lane: DirectorKeyframe[]): DirectorKeyframe[] {
  return [...lane].sort((a, b) => a.t - b.t);
}

export function useShowEditing({
  director,
  updateDirector,
  focusH,
  ppsRef,
  togglePlay,
}: {
  director: DirectorShow;
  updateDirector: (update: (show: DirectorShow) => DirectorShow) => void;
  focusH: number;
  ppsRef: RefObject<number>;
  togglePlay: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  // Snap is an authoring aid: on, keyframes land on the chosen grid; off,
  // they land on the raw 0.1 s wire grid (the v2 file resolution).
  const [snapOn, setSnapOn] = useState(true);
  const [snapStep, setSnapStep] = useState(1);

  // Drag handlers live on window and must see current snap settings.
  const snapRef = useRef({ on: true, step: 1 });
  useEffect(() => {
    snapRef.current = { on: snapOn, step: snapStep };
  }, [snapOn, snapStep]);
  const snapTime = useCallback((t: number, fine = false) => {
    const { on, step } = snapRef.current;
    const q = on && !fine ? Math.round(t / step) * step : t;
    return snapWireTime(Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, q)));
  }, []);

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

  const addMessageAt = useCallback(
    (rawT: number) => {
      const id = directorId();
      const t = snapTime(rawT);
      updateDirector((show) => ({
        ...show,
        messages: [...show.messages, { id, t, text: "message" }].sort((a, b) => a.t - b.t),
      }));
      setSelection({ kind: "msg", id });
    },
    [updateDirector, snapTime],
  );

  const patchMessage = useCallback(
    (id: string, patch: Partial<{ t: number; text: string }>) => {
      updateDirector((show) => ({
        ...show,
        messages: show.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
    },
    [updateDirector],
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
  }, [patchKey, snapTime, ppsRef]);

  const beginDrag = useCallback(
    (kind: "key" | "h1" | "h2", lane: number, id: string, svg: SVGSVGElement, resolvedCp?: DirectorKeyframe["cp"]) => {
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

  return {
    selection,
    setSelection,
    snapOn,
    setSnapOn,
    snapStep,
    setSnapStep,
    snapTime,
    patchKey,
    addKey,
    addMessageAt,
    patchMessage,
    deleteSelection,
    selectedKey,
    selectedMsg,
    onPanelKeyDown,
    beginDrag,
  };
}

export type ShowEditing = ReturnType<typeof useShowEditing>;
