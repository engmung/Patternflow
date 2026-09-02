"use client";

// ── Panel registry ───────────────────────────────────────────────────────────
// The one list of what the lab can dock. A panel is an entry here and a
// component file beside this one — nothing else. The shell (PatternLabClient)
// reads this list for the dockview component map, the Panels menu, the
// default layout and the title restamp; the Layers panel names an entry's id
// when it asks for an editor to be fronted (editorReveal).
//
// Until 2026-09 adding a panel meant editing four places in the shell: a
// PANEL_DEFS array, a components record, a hand-written sequence of
// api.addPanel() calls with the split order baked in, and a static import.
// The order of those calls mattered (a panel's reference had to exist
// before it), which is why placement here is declarative: `dock` names the
// panel to sit next to and the side, and buildDefaultLayout() adds panels in
// whatever order satisfies that.
//
// The heavy editors — Pixel, Director, Graphic Export, Gallery — are loaded
// on demand. They are a third of the lab's code and most sessions open one
// of them at most; before this every panel sat in the route's first chunk.

import dynamic from "next/dynamic";
import type { ComponentType, FunctionComponent } from "react";
import type { DockviewApi, IDockviewPanelProps } from "dockview-react";

import PreviewPanel from "./PreviewPanel";
import LayersPanel from "./LayersPanel";
import CodePanel from "./CodePanel";
import KnobsPanel from "./KnobsPanel";
import RampPanel from "./RampPanel";
import dock from "../LabPanels.module.css";

export type PanelId =
  | "preview"
  | "layers"
  | "code"
  | "pixel"
  | "gallery"
  | "knobs"
  | "ramp"
  | "capture"
  | "director";

export type DockDirection = "right" | "below" | "within";

export type PanelDef = {
  id: PanelId;
  /** The tab title. Belongs here, not to a saved layout — a rename reaches everyone. */
  title: string;
  component: ComponentType<IDockviewPanelProps>;
  /**
   * Where the default layout puts it: beside (or inside) another panel.
   * `null` is the root — exactly one panel has it.
   */
  dock: { ref: PanelId; dir: DockDirection } | null;
  /** Share of the dock's width / height to claim in the default layout. */
  size?: { width?: number; height?: number };
  /** The default layout fronts this one after placing everything. */
  active?: boolean;
};

function PanelLoading() {
  return (
    <div className={dock.panelHint} style={{ height: "100%", display: "grid", placeItems: "center" }}>
      loading…
    </div>
  );
}

// Panels take dockview's props or none at all; both fit the component map,
// which is why the cast at the end is safe.
function lazy<P>(load: () => Promise<{ default: ComponentType<P> }>) {
  return dynamic(load, { ssr: false, loading: PanelLoading }) as unknown as ComponentType<IDockviewPanelProps>;
}

/** In menu order. Placement is by reference, so this order is free to be the reader's. */
export const PANELS: readonly PanelDef[] = [
  { id: "preview", title: "Preview", component: PreviewPanel, dock: null, size: { width: 0.3 } },
  { id: "layers", title: "Layers", component: LayersPanel, dock: { ref: "preview", dir: "below" }, size: { height: 0.34 } },
  { id: "code", title: "Code", component: CodePanel, dock: { ref: "preview", dir: "right" }, active: true },
  { id: "pixel", title: "Pixel", component: lazy(() => import("./PixelPanel")), dock: { ref: "code", dir: "within" } },
  { id: "gallery", title: "Gallery", component: lazy(() => import("./GalleryPanel")), dock: { ref: "code", dir: "within" } },
  { id: "knobs", title: "Knobs", component: KnobsPanel, dock: { ref: "code", dir: "right" }, size: { width: 0.24 } },
  { id: "ramp", title: "Color Ramp", component: RampPanel, dock: { ref: "knobs", dir: "below" }, size: { height: 0.42 } },
  // Output stage (stills/clips at print sizes) — an add-on module, see lib/lab/capture.
  { id: "capture", title: "Graphic Export", component: lazy(() => import("./CapturePanel")), dock: { ref: "code", dir: "within" } },
  // Knob automation over time (lib/lab/director) — the show that publishes alongside the pattern.
  { id: "director", title: "Director", component: lazy(() => import("./DirectorPanel")), dock: { ref: "code", dir: "within" } },
];

export function panelDef(id: string): PanelDef | undefined {
  return PANELS.find((entry) => entry.id === id);
}

/** What DockviewReact wants: component name → component. Names are panel ids. */
export const panelComponents: Record<string, FunctionComponent<IDockviewPanelProps>> = Object.fromEntries(
  PANELS.map((entry) => [entry.id, entry.component as FunctionComponent<IDockviewPanelProps>]),
);

/**
 * Lay every panel out from scratch, in an order that satisfies the references
 * so the list above can stay in menu order.
 *
 * Two rules decide the order, and the second is the one that bites: a panel
 * needs its reference placed first, and every horizontal split ("right",
 * "within") has to land before any vertical one ("below"). dockview splits
 * relative to the grid as it stands, so "layers below preview" issued while
 * preview is the only column becomes a full-width strip at root level — the
 * layout this replaced had exactly that comment above its hand-ordered calls.
 */
export function buildDefaultLayout(api: DockviewApi) {
  const placed = new Set<PanelId>();
  const pending = [...PANELS];
  const place = (def: PanelDef) => {
    api.addPanel({
      id: def.id,
      component: def.id,
      title: def.title,
      ...(def.dock ? { position: { referencePanel: def.dock.ref, direction: def.dock.dir } } : {}),
    });
    placed.add(def.id);
    pending.splice(pending.indexOf(def), 1);
  };
  const ready = (def: PanelDef) => def.dock === null || placed.has(def.dock.ref);

  // Bounded: a registry with a dangling reference would otherwise spin, so a
  // pass that places nothing ends it.
  while (pending.length > 0) {
    const columns = pending.find((def) => ready(def) && def.dock?.dir !== "below");
    const next = columns ?? pending.find((def) => ready(def));
    if (!next) break;
    place(next);
  }

  const active = PANELS.find((entry) => entry.active);
  if (active) api.getPanel(active.id)?.api.setActive();

  // Rough proportions: preview column / editor column / controls column.
  const total = api.width || 1400;
  const height = api.height || 800;
  for (const def of PANELS) {
    if (!def.size) continue;
    const panel = api.getPanel(def.id);
    if (!panel) continue;
    if (def.size.width !== undefined) panel.api.setSize({ width: Math.round(total * def.size.width) });
    if (def.size.height !== undefined) panel.api.setSize({ height: Math.round(height * def.size.height) });
  }
}
