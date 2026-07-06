'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './Roadmap.module.css';
import {
  EDGES,
  LANES,
  NODES,
  NOW,
  type LaneId,
  type RoadmapNode,
} from './roadmap-data';

type LiveIssue = {
  number: number;
  title: string;
  url: string;
  subIssues: { total: number; completed: number; percent: number } | null;
};

type RoadmapApiData = { issues: LiveIssue[]; error?: string };

// Piecewise time scale. Only the past gets month ticks; everything after
// "today" is a single future region ordered by intention, not by fake dates.
const ANCHORS: [number, number][] = [
  [Date.UTC(2026, 0, 1), 0.01],
  [Date.UTC(2026, 3, 1), 0.09],
  [Date.UTC(2026, 4, 1), 0.26],
  [Date.UTC(2026, 5, 1), 0.43],
  [Date.UTC(2026, 6, 1), 0.6],
  [Date.UTC(2026, 7, 1), 0.72],
  [Date.UTC(2026, 8, 1), 0.82],
  [Date.UTC(2026, 9, 1), 0.9],
  [Date.UTC(2026, 10, 1), 0.96],
  [Date.UTC(2026, 11, 1), 1.0],
];

// No "Jul" tick — the today line sits right on it and marks July by itself.
const TICKS: { label: string; utc: number }[] = [
  { label: 'Jan', utc: Date.UTC(2026, 0, 1) },
  { label: 'Apr', utc: Date.UTC(2026, 3, 1) },
  { label: 'May', utc: Date.UTC(2026, 4, 1) },
  { label: 'Jun', utc: Date.UTC(2026, 5, 1) },
];

function dateToT(date: string): number {
  const ms = new Date(`${date}T00:00:00Z`).getTime();
  if (ms <= ANCHORS[0][0]) return ANCHORS[0][1];
  for (let i = 1; i < ANCHORS.length; i += 1) {
    const [aMs, aT] = ANCHORS[i - 1];
    const [bMs, bT] = ANCHORS[i];
    if (ms <= bMs) return aT + ((ms - aMs) / (bMs - aMs)) * (bT - aT);
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

// The detailed view shows ~twice the nodes, so the whole time axis stretches
// with it — ticks, today line and future zone all use the same scale, keeping
// boxes near their real dates instead of just sliding off the axis.
const OVERVIEW_W = 1700;
const DETAILED_W = 2500;
const GUTTER = 170;
const RIGHT_PAD = 60;
const TOP = 84;
const LANE_H = 112;
const NODE_H = 44;
const HEIGHT = TOP + LANES.length * LANE_H + 32;
const POPUP_W = 360;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.8;

const laneY = (lane: LaneId) =>
  TOP + LANES.findIndex((l) => l.id === lane) * LANE_H + LANE_H / 2;

const nodeWidth = (title: string) => Math.round(title.length * 9.2) + 32;

type PlacedNode = RoadmapNode & { x: number; y: number; w: number };

// Nodes never get squeezed back into the frame — the canvas is pannable, so
// the drawing just grows to whatever width the layout needs.
function layoutNodes(detailed: boolean): {
  nodes: PlacedNode[];
  width: number;
  innerW: number;
} {
  const innerW = (detailed ? DETAILED_W : OVERVIEW_W) - GUTTER - RIGHT_PAD;
  const visible = NODES.filter((n) => detailed || n.level === 1);
  const placed: PlacedNode[] = visible.map((n) => {
    const w = nodeWidth(n.title);
    return { ...n, w, x: GUTTER + dateToT(n.date) * innerW - w / 2, y: laneY(n.lane) };
  });
  let maxRight = GUTTER + innerW + RIGHT_PAD;
  for (const lane of LANES) {
    const row = placed.filter((n) => n.lane === lane.id).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i += 1) {
      const minX = row[i - 1].x + row[i - 1].w + 16;
      if (row[i].x < minX) row[i].x = minX;
    }
    for (const n of row) {
      maxRight = Math.max(maxRight, n.x + n.w + RIGHT_PAD);
    }
  }
  return { nodes: placed, width: maxRight, innerW };
}

export default function RoadmapMap() {
  const [detailed, setDetailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<RoadmapApiData | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 700 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    captured: false,
    pointerId: 0,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/roadmap')
      .then((res) => res.json())
      .then((payload: RoadmapApiData) => {
        if (active) setLive(payload);
      })
      .catch(() => {
        if (active) setLive({ issues: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const { nodes, width, innerW } = useMemo(() => layoutNodes(detailed), [detailed]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const nowX = GUTTER + dateToT(NOW) * innerW;

  // Start with "today" around the right third of the viewport so both the
  // recent past and the future zone are visible on load; center vertically.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    setPan({
      x: Math.min(0, Math.round(cw * 0.62 - nowX)),
      y: Math.round((ch - HEIGHT) / 2),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gate = useMemo(() => {
    const gateNodes = nodes.filter((n) => n.gate);
    if (gateNodes.length === 0) return null;
    const left = Math.min(...gateNodes.map((n) => n.x)) - 20;
    const right = Math.max(...gateNodes.map((n) => n.x + n.w)) + 20;
    const laneIdx = gateNodes.map((n) => LANES.findIndex((l) => l.id === n.lane));
    const topLane = Math.min(...laneIdx);
    const bottomLane = Math.max(...laneIdx);
    const y = TOP + topLane * LANE_H + LANE_H / 2 - NODE_H / 2 - 18;
    const h = (bottomLane - topLane) * LANE_H + NODE_H + 36;
    return { x: left, y, w: right - left, h };
  }, [nodes]);

  const clampPan = (x: number, y: number, z = zoom) => {
    const el = canvasRef.current;
    const cw = el ? el.clientWidth : width;
    const ch = el ? el.clientHeight : HEIGHT;
    const drawW = width * z;
    const drawH = HEIGHT * z;
    // When the canvas is bigger than the drawing, let the drawing sit
    // anywhere inside it; otherwise pan within the drawing plus some slack.
    return {
      x: Math.min(Math.max(0, cw - drawW) + 60, Math.max(Math.min(0, cw - drawW) - 60, x)),
      y: Math.min(Math.max(0, ch - drawH) + 40, Math.max(Math.min(0, ch - drawH) - 40, y)),
    };
  };

  const zoomTo = (next: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 10) / 10));
    if (nz === zoom) return;
    const el = canvasRef.current;
    const cx = el ? el.clientWidth / 2 : 0;
    const cy = el ? el.clientHeight / 2 : 0;
    // Keep the point at the canvas center fixed while zooming.
    setPan(
      clampPan(cx - ((cx - pan.x) / zoom) * nz, cy - ((cy - pan.y) / zoom) * nz, nz),
    );
    setZoom(nz);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      active: true,
      moved: false,
      captured: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      drag.moved = true;
      // Capture only once an actual drag starts, so plain clicks still reach
      // the nodes underneath.
      if (!drag.captured) {
        try {
          event.currentTarget.setPointerCapture(drag.pointerId);
          drag.captured = true;
        } catch {
          // pointer may already be gone — panning still works without capture
        }
      }
    }
    if (drag.moved) setPan(clampPan(drag.panX + dx, drag.panY + dy));
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  const handleNodeClick = (id: string) => {
    if (dragRef.current.moved) return;
    setSelectedId((current) => (current === id ? null : id));
  };

  const selectedIssues =
    selected?.issues && live
      ? live.issues.filter((issue) => selected.issues?.includes(issue.number))
      : [];

  // Popup lives outside the zoomed layer (so its text never scales) and is
  // positioned in screen space next to the node. maxHeight is computed in
  // real pixels from the actual viewport size — a percentage-based CSS
  // max-height doesn't reliably resolve inside this flex layout, and the
  // popup would silently get clipped by an ancestor's overflow:hidden
  // instead of scrolling.
  let popupPos: { left: number; top: number; maxHeight: number } | null = null;
  if (selected) {
    const cw = canvasSize.w;
    const ch = canvasSize.h;
    const margin = 14;
    const rightEdge = (selected.x + selected.w) * zoom + pan.x;
    const leftEdge = selected.x * zoom + pan.x;
    const left =
      rightEdge + 18 + POPUP_W > cw ? leftEdge - POPUP_W - 18 : rightEdge + 18;
    const top = Math.min(Math.max(selected.y * zoom + pan.y - 90, margin), ch - 160 - margin);
    const maxHeight = Math.max(160, ch - top - margin);
    popupPos = { left, top, maxHeight };
  }

  return (
    <div className={styles.map}>
      <div className={styles.controls}>
        <div className={styles.toggleGroup} role="group" aria-label="Map detail level">
          <button
            type="button"
            className={`${styles.toggleBtn} ${!detailed ? styles.toggleOn : ''}`}
            onClick={() => setDetailed(false)}
          >
            Overview
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${detailed ? styles.toggleOn : ''}`}
            onClick={() => setDetailed(true)}
          >
            Detailed
          </button>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.swatchDone} /> shipped
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchPlanned} /> planned
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchDep} /> dependency
          </span>
          <span className={styles.legendDrag}>drag to move</span>
        </div>
        <div className={styles.zoomGroup} role="group" aria-label="Zoom">
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label="Zoom out"
            onClick={() => zoomTo(zoom - 0.2)}
          >
            −
          </button>
          <button
            type="button"
            className={styles.zoomVal}
            title="Reset zoom"
            onClick={() => zoomTo(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label="Zoom in"
            onClick={() => zoomTo(zoom + 0.2)}
          >
            +
          </button>
        </div>
      </div>

      <div className={styles.viewport}>
        <div
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className={styles.layer}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <svg
            className={styles.mapSvg}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Patternflow project map: past releases and planned work by area over time"
          >
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 z" className={styles.depArrow} />
              </marker>
            </defs>

            <rect
              className={styles.futureZone}
              x={nowX}
              y={TOP - 16}
              width={width - nowX - 8}
              height={HEIGHT - TOP - 8}
            />
            <text
              className={styles.futureLabel}
              x={nowX + (width - nowX) / 2}
              y={TOP - 32}
              textAnchor="middle"
            >
              future
            </text>

            {TICKS.map((tick) => {
              const x =
                GUTTER + dateToT(new Date(tick.utc).toISOString().slice(0, 10)) * innerW;
              return (
                <g key={tick.label}>
                  <line
                    className={styles.gridLine}
                    x1={x}
                    y1={TOP - 16}
                    x2={x}
                    y2={HEIGHT - 24}
                  />
                  <text className={styles.tickText} x={x} y={TOP - 32} textAnchor="middle">
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {LANES.map((lane) => (
              <text key={lane.id} className={styles.laneLabel} x={16} y={laneY(lane.id) + 5}>
                {lane.label}
              </text>
            ))}

            {LANES.map((lane) => {
              const row = nodes
                .filter((n) => n.lane === lane.id)
                .sort((a, b) => a.x - b.x);
              return row.slice(1).map((n, i) => {
                const prev = row[i];
                const dashed = prev.status === 'planned' || n.status === 'planned';
                return (
                  <line
                    key={`${prev.id}-${n.id}`}
                    className={dashed ? styles.threadPlanned : styles.thread}
                    x1={prev.x + prev.w}
                    y1={prev.y}
                    x2={n.x}
                    y2={n.y}
                  />
                );
              });
            })}

            {gate && (
              <g>
                <rect
                  className={styles.gateRect}
                  x={gate.x}
                  y={gate.y}
                  width={gate.w}
                  height={gate.h}
                  rx={16}
                />
                <text className={styles.gateLabel} x={gate.x + 6} y={gate.y - 14}>
                  v3.0.0 — build release
                </text>
              </g>
            )}

            {EDGES.map((edge) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const sx = from.x + from.w;
              const sy = from.y;
              const tx = to.x;
              const ty = to.y;
              const bend = Math.min(90, Math.abs(tx - sx) / 2 + 28);
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  className={styles.depEdge}
                  d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 4} ${ty}`}
                  markerEnd="url(#dep-arrow)"
                />
              );
            })}

            <line
              className={styles.nowLine}
              x1={nowX}
              y1={TOP - 16}
              x2={nowX}
              y2={HEIGHT - 24}
            />
            <text className={styles.nowLabel} x={nowX - 10} y={TOP - 32} textAnchor="end">
              today
            </text>

            {nodes.map((n) => {
              const isSelected = n.id === selectedId;
              // Level 2 nodes only exist in the detailed view — give them a
              // visibly secondary color so overview-level nodes keep priority.
              const secondary = n.level === 2 && !isSelected;
              const boxClass = isSelected
                ? styles.nodeSelected
                : n.status === 'planned'
                  ? secondary
                    ? styles.nodePlannedSecondary
                    : styles.nodePlanned
                  : secondary
                    ? styles.nodeDoneSecondary
                    : styles.nodeDone;
              const textClass = isSelected
                ? styles.nodeTextSelected
                : n.status === 'planned'
                  ? secondary
                    ? styles.nodeTextPlannedSecondary
                    : styles.nodeTextPlanned
                  : secondary
                    ? styles.nodeTextSecondary
                    : styles.nodeText;
              return (
                <g
                  key={n.id}
                  className={styles.nodeGroup}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.title}, ${n.status}`}
                  onClick={() => handleNodeClick(n.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleNodeClick(n.id);
                    }
                  }}
                >
                  <rect
                    className={boxClass}
                    x={n.x}
                    y={n.y - NODE_H / 2}
                    width={n.w}
                    height={NODE_H}
                    rx={10}
                  />
                  <text
                    className={textClass}
                    x={n.x + n.w / 2}
                    y={n.y + 5}
                    textAnchor="middle"
                  >
                    {n.title}
                  </text>
                </g>
              );
            })}
          </svg>
          </div>
        </div>

        {selected && popupPos && (
          <div
            className={styles.popup}
            style={{
              left: popupPos.left,
              top: popupPos.top,
              width: POPUP_W,
              maxHeight: popupPos.maxHeight,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
              <div className={styles.popupHead}>
                <span className={styles.popupDate}>
                  {selected.status === 'planned' ? 'future' : selected.date}
                </span>
                {selected.gate && <span className={styles.tagGate}>v3.0.0</span>}
                <button
                  type="button"
                  className={styles.popupClose}
                  aria-label="Close"
                  onClick={() => setSelectedId(null)}
                >
                  ×
                </button>
              </div>
              <h2 className={styles.popupTitle}>{selected.title}</h2>
              <p className={styles.popupBody}>{selected.detail}</p>
              {(selected.links?.length || selectedIssues.length > 0) && (
                <div className={styles.popupLinks}>
                  {selected.links?.map((link) => (
                    <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                      {link.label} ↗
                    </a>
                  ))}
                  {selectedIssues.map((issue) => (
                    <a key={issue.number} href={issue.url} target="_blank" rel="noreferrer">
                      #{issue.number} {issue.title}
                      {issue.subIssues
                        ? ` — ${issue.subIssues.completed}/${issue.subIssues.total}`
                        : ''}{' '}
                      ↗
                    </a>
                  ))}
                </div>
              )}
          </div>
        )}

        <p className={styles.mapCaption}>
          Hardware and guides gather into the v3.0.0 build release — what people physically build
          from gets frozen per release. Firmware and pattern tools ship continuously. Planned
          items are intentions, not promises.
        </p>
      </div>
    </div>
  );
}
