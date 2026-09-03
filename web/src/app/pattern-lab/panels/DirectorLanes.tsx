"use client";

// ── Director lanes ───────────────────────────────────────────────────────────
// The four knob lanes of the Director timeline: the row chrome (LaneRow) and
// the keyframe/curve canvas inside it (Lane). Lived at the bottom of
// DirectorPanel.tsx until 2026-09; same code, own file.

import { bakeLaneV2, cubicBezierY } from "@/lib/lab/director/bake";
import type { DirectorKeyframe } from "@/lib/lab/director/types";
import local from "./DirectorPanel.module.css";
import { fmtReal, wireToY } from "./directorGeometry";

export function LaneRow({
  label,
  color,
  focused,
  height,
  width,
  range,
  onFocus,
  children,
}: {
  label: string;
  color: string;
  focused: boolean;
  height: number;
  width: number;
  range: [number, number];
  onFocus: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={`${local.gutterCell} ${focused ? local.gutterFocus : local.gutterCompact}`}
        style={{ height }}
        onClick={focused ? undefined : onFocus}
        title={focused ? undefined : "Focus this lane"}
      >
        <span className={local.laneHead}>
          <span className={local.laneSwatch} style={{ background: color }} />
          <span className={local.laneName}>{label}</span>
        </span>
        {focused && (
          <>
            <span className={`${local.axisLabel} ${local.axisMax}`}>{fmtReal(range[1])}</span>
            <span className={`${local.axisLabel} ${local.axisMid}`}>
              {fmtReal((range[0] + range[1]) / 2)}
            </span>
            <span className={`${local.axisLabel} ${local.axisMin}`}>{fmtReal(range[0])}</span>
          </>
        )}
      </div>
      <div
        className={`${local.laneCell}${focused ? "" : ` ${local.laneCompact}`}`}
        style={{ width, height }}
      >
        {children}
        <div className={local.playhead} />
      </div>
    </>
  );
}

/**
 * One knob lane. The solid line is the authored curve (auto handles already
 * materialized by resolveLane); holds draw as steps that jump at the next
 * key. Focused lanes edit — double-click adds, dots drag, a selected key
 * shows its incoming and outgoing handles (grabbing an auto handle converts
 * that segment to a hand-shaped bezier). Compact lanes are a click target
 * that focuses them.
 */
export function Lane({
  keys,
  rawLane,
  width,
  height,
  pad,
  pps,
  color,
  focused,
  showWire,
  selectedId,
  onFocus,
  onAdd,
  onSelect,
  onBeginDrag,
}: {
  /** Sorted, auto handles resolved. */
  keys: DirectorKeyframe[];
  rawLane: DirectorKeyframe[];
  width: number;
  height: number;
  pad: number;
  pps: number;
  color: string;
  focused: boolean;
  showWire: boolean;
  selectedId: string | null;
  onFocus: () => void;
  onAdd: (t: number, pointerY: number) => void;
  onSelect: (id: string) => void;
  onBeginDrag: (
    kind: "key" | "h1" | "h2",
    id: string,
    svg: SVGSVGElement,
    resolvedCp?: DirectorKeyframe["cp"],
  ) => void;
}) {
  const toY = (v: number) => wireToY(v, height, pad);

  // Authored curve — the line you trust. Curves sample their bezier; holds
  // draw a step with an explicit jump edge at the next keyframe.
  let curve = "";
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const next = keys[i + 1];
    const y = toY(k.v);
    curve += `${curve ? "L" : "M"}${k.t * pps},${y} `;
    if (!next) {
      curve += `L${width},${y} `;
    } else if (k.mode !== "curve" || next.t <= k.t || next.v === k.v) {
      const jump = k.mode !== "curve";
      curve += `L${next.t * pps},${y} `;
      if (jump) curve += `L${next.t * pps},${toY(next.v)} `;
    } else {
      const span = next.t - k.t;
      const steps = Math.max(8, Math.min(48, Math.round((span * pps) / 5)));
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const v = k.v + (next.v - k.v) * cubicBezierY(k.cp, u);
        curve += `L${(k.t + u * span) * pps},${toY(v)} `;
      }
    }
  }

  // The wire truth on demand — exactly what bakeLaneV2 exports and the
  // device plays: EASE points ramp, plain points hold and jump.
  let wire = "";
  if (showWire) {
    const points = bakeLaneV2(rawLane);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[i + 1];
      const y = toY(p.v);
      wire += `${wire ? "L" : "M"}${p.t * pps},${y} `;
      if (!next) wire += `L${width},${y} `;
      else if (!p.ease) wire += `L${next.t * pps},${y} `;
    }
  }

  // Handles for the selected key, Blender-style: its outgoing handle (own
  // segment) and its incoming handle (the previous segment's arrival).
  const selectedIndex = selectedId ? keys.findIndex((k) => k.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? keys[selectedIndex] : null;
  let handles: React.ReactNode = null;
  if (focused && selected) {
    const parts: React.ReactNode[] = [];
    const segmentHandle = (
      owner: DirectorKeyframe,
      next: DirectorKeyframe,
      which: "h1" | "h2",
      key: string,
    ) => {
      const span = next.t - owner.t;
      const dv = next.v - owner.v;
      const u = which === "h1" ? owner.cp[0] : owner.cp[2];
      const yn = which === "h1" ? owner.cp[1] : owner.cp[3];
      const hx = (owner.t + u * span) * pps;
      const hy = toY(owner.v + dv * yn);
      const anchor = which === "h1" ? owner : next;
      return (
        <g key={key}>
          <line
            className={local.handleLine}
            x1={anchor.t * pps}
            y1={toY(anchor.v)}
            x2={hx}
            y2={hy}
          />
          <circle
            className={local.handle}
            cx={hx}
            cy={hy}
            r={4}
            onPointerDown={(event) => {
              event.stopPropagation();
              onBeginDrag(which, owner.id, event.currentTarget.ownerSVGElement!, owner.cp);
            }}
          />
        </g>
      );
    };
    const next = keys[selectedIndex + 1];
    if (next && selected.mode === "curve" && next.t > selected.t) {
      parts.push(segmentHandle(selected, next, "h1", "out"));
    }
    const prev = keys[selectedIndex - 1];
    if (prev && prev.mode === "curve" && selected.t > prev.t) {
      parts.push(segmentHandle(prev, selected, "h2", "in"));
    }
    handles = <g>{parts}</g>;
  }

  // Focused lanes get quarter gridlines under the curve.
  const gridLines = focused
    ? [250, 500, 750].map((v) => (
        <line key={v} className={local.vGrid} x1={0} y1={toY(v)} x2={width} y2={toY(v)} />
      ))
    : null;

  return (
    <svg
      className={`${local.laneSvg}${focused ? "" : ` ${local.laneSvgCompact}`}`}
      width={width}
      height={height}
      onPointerDown={focused ? undefined : onFocus}
      onDoubleClick={
        focused
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              // Raw time out; the panel snaps it (grid or 0.1 s wire floor).
              onAdd((event.clientX - rect.left) / pps, event.clientY - rect.top);
            }
          : undefined
      }
    >
      {gridLines}
      {curve && (
        <path
          className={focused ? local.curve : local.curveCompact}
          style={{ stroke: color }}
          d={curve}
        />
      )}
      {wire && <path className={local.wire} d={wire} />}
      {handles}
      {keys.map((k) => (
        <circle
          key={k.id}
          className={`${local.key}${k.id === selectedId ? ` ${local.keySelected}` : ""}`}
          style={{ stroke: color }}
          cx={k.t * pps}
          cy={toY(k.v)}
          r={focused ? 5 : 2.5}
          onPointerDown={
            focused
              ? (event) => {
                  event.stopPropagation();
                  onSelect(k.id);
                  onBeginDrag("key", k.id, event.currentTarget.ownerSVGElement!);
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}
