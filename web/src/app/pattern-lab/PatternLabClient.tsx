"use client";

// Pattern Lab v2 — a layered, dockable pattern editing workspace.
//
// The old lab was one pattern + one fixed two-column layout. This shell hosts
// seven dockable panels (dockview) over a layer-stack project (zustand):
// Preview, Layers, Code, Pixel, Gallery, Knobs, Color Ramp. Panels rearrange
// Photoshop-style — drag tabs, split groups, float — and the arrangement
// persists to localStorage alongside the project itself.
//
// Exports (community publish, firmware build) flatten the visible stack into
// one standalone JS pattern (see lib/lab/flatten.ts), so every downstream
// consumer — sandbox, fork, C++ conversion — keeps working unchanged.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import type { DockviewTheme } from "dockview";
import "dockview/dist/styles/dockview.css";
import "./lab-dock.css";

import { withMatrixAnnotation } from "@/lib/patternMatrix";
import { codeUsesValueField, withRampAnnotation } from "@/lib/patternRamp";
import { buildsConfigured, communityConfigured } from "@/lib/community/apiBase";
import { clearLabHandoff, readLabHandoff } from "@/lib/community/handoff";
import PublishModal from "@/components/community/PublishModal";
import BuildFirmwareModal from "@/components/community/BuildFirmwareModal";
import { flattenLayers, needsFlatten } from "@/lib/lab/flatten";
import { buildCppPrompt } from "@/lib/lab/cppPrompt";
import { LAYOUT_STORAGE } from "@/lib/lab/serialize";
import { listSessions, type SessionMeta } from "@/lib/lab/sessions";
import { buildStackAnnotation, importCodeIntoLab } from "@/lib/lab/stackShare";
import { useLabStore } from "@/lib/lab/store";
import { isCodeLayer, type CodeLayer } from "@/lib/lab/types";
import FirmwareExportModal from "./FirmwareExportModal";

import PreviewPanel from "./panels/PreviewPanel";
import LayersPanel from "./panels/LayersPanel";
import KnobsPanel from "./panels/KnobsPanel";
import RampPanel from "./panels/RampPanel";
import CodePanel from "./panels/CodePanel";
import PixelPanel from "./panels/PixelPanel";
import GalleryPanel from "./panels/GalleryPanel";

import styles from "./PatternLab.module.css";
import dock from "./LabPanels.module.css";

const labTheme: DockviewTheme = {
  name: "patternflow",
  className: "dockview-theme-patternflow",
  colorScheme: "light",
  gap: 6,
  dndTabIndicator: "line",
};

const PANEL_DEFS = [
  { id: "preview", title: "Preview" },
  { id: "layers", title: "Layers" },
  { id: "code", title: "Code" },
  { id: "pixel", title: "Pixel" },
  { id: "gallery", title: "Gallery" },
  { id: "knobs", title: "Knobs" },
  { id: "ramp", title: "Color Ramp" },
] as const;

type PanelId = (typeof PANEL_DEFS)[number]["id"];

const panelComponents: Record<PanelId, React.FunctionComponent<IDockviewPanelProps>> = {
  preview: PreviewPanel,
  layers: LayersPanel,
  code: CodePanel,
  pixel: PixelPanel,
  gallery: GalleryPanel,
  knobs: KnobsPanel,
  ramp: RampPanel,
};

function Watermark() {
  return (
    <div className={dock.panelHint} style={{ height: "100%", display: "grid", placeItems: "center" }}>
      All panels are closed — reopen them from the Panels menu above.
    </div>
  );
}

function buildDefaultLayout(api: DockviewApi) {
  // Order matters: the three columns are split first, THEN the columns are
  // split vertically — otherwise a "below" split lands at root level and
  // spans the full width.
  api.addPanel({ id: "preview", component: "preview", title: "Preview" });
  api.addPanel({
    id: "code",
    component: "code",
    title: "Code",
    position: { referencePanel: "preview", direction: "right" },
  });
  api.addPanel({
    id: "pixel",
    component: "pixel",
    title: "Pixel",
    position: { referencePanel: "code", direction: "within" },
  });
  api.addPanel({
    id: "gallery",
    component: "gallery",
    title: "Gallery",
    position: { referencePanel: "code", direction: "within" },
  });
  api.addPanel({
    id: "knobs",
    component: "knobs",
    title: "Knobs",
    position: { referencePanel: "code", direction: "right" },
  });
  api.addPanel({
    id: "ramp",
    component: "ramp",
    title: "Color Ramp",
    position: { referencePanel: "knobs", direction: "below" },
  });
  api.addPanel({
    id: "layers",
    component: "layers",
    title: "Layers",
    position: { referencePanel: "preview", direction: "below" },
  });

  api.getPanel("code")?.api.setActive();

  // Rough proportions: preview column / editor column / controls column.
  const total = api.width || 1400;
  api.getPanel("preview")?.api.setSize({ width: Math.round(total * 0.3) });
  api.getPanel("knobs")?.api.setSize({ width: Math.round(total * 0.24) });
  const height = api.height || 800;
  api.getPanel("layers")?.api.setSize({ height: Math.round(height * 0.34) });
  api.getPanel("ramp")?.api.setSize({ height: Math.round(height * 0.42) });
}

// Publish/export: a single plain code layer travels as-is (with its ramp and
// frame annotations, alpha premultiplied over the black panel); anything
// layered flattens.
function premultiplyHex(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  const scale = Math.max(0, Math.min(1, alpha));
  const r = Math.round(((value >> 16) & 255) * scale);
  const g = Math.round(((value >> 8) & 255) * scale);
  const b = Math.round((value & 255) * scale);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

async function buildExportCode(): Promise<string> {
  const state = useLabStore.getState();
  if (needsFlatten(state.layers)) {
    const flat = flattenLayers(state.layers, state.matrix, {
      labels: state.knobLabels,
      ranges: state.ranges,
    });
    // Ride the full project along so "Open in Pattern Lab" restores the
    // layers. Best effort — an oversized stack still publishes, flattened.
    const stackLine = await buildStackAnnotation({
      matrix: state.matrix,
      layers: state.layers,
      activeLayerId: state.activeLayerId,
      knobs: state.knobs,
      ranges: state.ranges,
      knobLabels: state.knobLabels,
      forkOf: state.forkOf,
      gen: state.gen,
    }).catch(() => null);
    return stackLine ? `${flat}\n\n${stackLine}\n` : flat;
  }
  const layer = state.layers.find(
    (entry) => entry.visible && entry.opacity > 0 && entry.type === "code",
  ) as CodeLayer;
  let code = withMatrixAnnotation(layer.code, state.matrix);
  if (codeUsesValueField(layer.code) || layer.recolor) {
    code = withRampAnnotation(code, {
      stops: layer.ramp.stops.map((stop) => ({
        position: stop.position,
        color: premultiplyHex(stop.color, stop.alpha),
      })),
      mode: layer.ramp.mode,
      wrap: layer.ramp.wrap,
      recolor: layer.recolor,
    });
  }
  return code;
}

// Single plain code layer only — layered stacks go through the
// FirmwareExportModal wizard (deterministic scaffold + per-layer prompts).
function buildFirmwarePrompt(): string {
  const state = useLabStore.getState();
  const active = state.layers.find((entry) => entry.id === state.activeLayerId);
  const focus = isCodeLayer(active) ? active : state.layers.find(isCodeLayer);
  if (!focus) return "";
  return buildCppPrompt({
    code: focus.code,
    matrix: state.matrix,
    knobs: state.knobs,
    ranges: state.ranges,
    knobLabels: state.knobLabels,
    ramp: focus.ramp,
  });
}

export default function PatternLabClient() {
  const [mounted, setMounted] = useState(false);
  const [panelsMenuOpen, setPanelsMenuOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<SessionMeta[]>([]);
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [firmwarePrompt, setFirmwarePrompt] = useState<string | null>(null);
  const [firmwareWizardOpen, setFirmwareWizardOpen] = useState(false);
  const apiRef = useRef<DockviewApi | null>(null);
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useLabStore((state) => state.hydrate);
  const restoredAt = useLabStore((state) => state.restoredAt);
  const discardProject = useLabStore((state) => state.discardProject);
  const restoreSession = useLabStore((state) => state.restoreSession);
  const stashCurrent = useLabStore((state) => state.stashCurrent);
  const forkOf = useLabStore((state) => state.forkOf);
  const setForkOf = useLabStore((state) => state.setForkOf);

  // Boot: restore the project (or migrate the old draft), then consume a
  // community → lab handoff exactly once.
  //
  // The handoff used to land as new layers ON TOP of whatever was in
  // progress. For a plain pattern that was one stray layer; for a shared
  // composition it was somebody else's entire stack interleaved with yours,
  // blending into a mess. Opening now clears the canvas first and the
  // previous work goes into the session ring, reachable from Recent ▾.
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    hydrate();
    const handoff = readLabHandoff();
    if (handoff) {
      clearLabHandoff();
      useLabStore.getState().stashCurrent();
      // A shared composition carries its layers as a @stack line — restore
      // them; a plain pattern arrives as one layer. Either way it is now the
      // only thing on the canvas.
      void importCodeIntoLab(
        handoff.code,
        handoff.parentTitle ?? undefined,
        handoff.parentId
          ? { id: handoff.parentId, title: handoff.parentTitle ?? "a community pattern" }
          : undefined,
      );
    }
    setMounted(true);
  }, [hydrate]);

  const syncOpenPanels = useCallback((api: DockviewApi) => {
    setOpenPanels(new Set(api.panels.map((panel) => panel.id)));
  }, []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;

      let restored = false;
      try {
        const raw = window.localStorage.getItem(LAYOUT_STORAGE);
        if (raw) {
          api.fromJSON(JSON.parse(raw));
          restored = true;
        }
      } catch {
        restored = false;
      }
      if (!restored) {
        try {
          buildDefaultLayout(api);
        } catch {
          // A half-built layout is still usable; panels can be opened manually.
        }
      }
      syncOpenPanels(api);

      api.onDidLayoutChange(() => {
        syncOpenPanels(api);
        if (layoutSaveTimer.current !== null) clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = setTimeout(() => {
          layoutSaveTimer.current = null;
          try {
            window.localStorage.setItem(LAYOUT_STORAGE, JSON.stringify(api.toJSON()));
          } catch {
            // Quota/private mode — layout just won't persist.
          }
        }, 500);
      });
    },
    [syncOpenPanels],
  );

  const togglePanel = (id: PanelId, title: string) => {
    const api = apiRef.current;
    if (!api) return;
    const existing = api.getPanel(id);
    if (existing) {
      api.removePanel(existing);
    } else {
      api.addPanel({ id, component: id, title });
    }
    syncOpenPanels(api);
  };

  const resetLayout = () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      window.localStorage.removeItem(LAYOUT_STORAGE);
    } catch {
      // ignore
    }
    api.clear();
    buildDefaultLayout(api);
    syncOpenPanels(api);
  };

  return (
    <main className={dock.dockShell}>
      <header className={dock.dockHeader}>
        <div className={dock.dockHeaderGroup}>
          <Link href="/" className={styles.labBrand}>
            Patternflow
          </Link>
          <span className={styles.labTitle}>Pattern Lab</span>
          {forkOf && (
            <span
              className={styles.forkBadge}
              title="Sharing to the community will publish this as a fork of the linked pattern. Click × if this is no longer a remix of it."
            >
              forking from {forkOf.title}
              <button type="button" aria-label="Detach fork lineage" onClick={() => setForkOf(null)}>
                ×
              </button>
            </span>
          )}
          {restoredAt !== null && (
            <button
              type="button"
              className={styles.headerToggle}
              title={`Restored your last session (${new Date(restoredAt).toLocaleString()}). Click to discard it and start fresh.`}
              onClick={discardProject}
            >
              restored ×
            </button>
          )}
        </div>

        <div className={dock.dockHeaderGroup}>
          {communityConfigured() && (
            <button
              type="button"
              className={styles.headerToggle}
              title="Publish the visible stack to the community — flattened to one pattern, with the layer stack embedded so it reopens editable"
              onClick={() => {
                void buildExportCode().then(setShareCode);
              }}
            >
              Share
            </button>
          )}
          {buildsConfigured() && (
            <button
              type="button"
              className={styles.headerToggle}
              title="Turn this composition into an ESP32 firmware header and flash it"
              onClick={() => {
                if (needsFlatten(useLabStore.getState().layers)) {
                  setFirmwareWizardOpen(true);
                } else {
                  setFirmwarePrompt(buildFirmwarePrompt());
                }
              }}
            >
              Build firmware
            </button>
          )}
          {/* Recent works. The list is only read when the menu opens, so
              nothing polls localStorage while you are editing. */}
          <div className={dock.menuWrap}>
            <button
              type="button"
              className={styles.headerToggle}
              aria-expanded={recentOpen}
              title="Earlier work, parked when something replaced the canvas"
              onClick={() => {
                setRecent(listSessions());
                setRecentOpen((current) => !current);
              }}
            >
              Recent ▾
            </button>
            {recentOpen && (
              <div className={dock.menuPop} onMouseLeave={() => setRecentOpen(false)}>
                <button
                  type="button"
                  onClick={() => {
                    if (stashCurrent()) setRecent(listSessions());
                    setRecentOpen(false);
                  }}
                >
                  Park this and start fresh
                </button>
                {recent.length === 0 ? (
                  <button type="button" disabled>
                    nothing parked yet
                  </button>
                ) : (
                  recent.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      title={`${session.layerCount} layer${
                        session.layerCount === 1 ? "" : "s"
                      } · ${new Date(session.savedAt).toLocaleString()}`}
                      onClick={() => {
                        restoreSession(session.id);
                        setRecent(listSessions());
                        setRecentOpen(false);
                      }}
                    >
                      {session.title}
                      <em>{session.layerCount}L</em>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className={dock.menuWrap}>
            <button
              type="button"
              className={styles.headerToggle}
              aria-expanded={panelsMenuOpen}
              onClick={() => setPanelsMenuOpen((current) => !current)}
            >
              Panels ▾
            </button>
            {panelsMenuOpen && (
              <div className={dock.menuPop} onMouseLeave={() => setPanelsMenuOpen(false)}>
                {PANEL_DEFS.map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => togglePanel(def.id, def.title)}
                  >
                    {def.title}
                    <em>{openPanels.has(def.id) ? "●" : "○"}</em>
                  </button>
                ))}
                <button type="button" onClick={resetLayout}>
                  Reset layout
                  <em>⟲</em>
                </button>
              </div>
            )}
          </div>
          <nav className={styles.labNav}>
            <Link href="/community" title="Patternflow Community">
              Community ↗
            </Link>
          </nav>
        </div>
      </header>

      <div className={dock.dockHost}>
        {mounted && (
          <DockviewReact
            components={panelComponents}
            watermarkComponent={Watermark}
            onReady={onReady}
            theme={labTheme}
          />
        )}
      </div>

      {shareCode !== null && (
        <PublishModal
          code={shareCode}
          parentId={forkOf?.id ?? null}
          parentTitle={forkOf?.title ?? null}
          onClose={() => setShareCode(null)}
        />
      )}

      {firmwarePrompt !== null && (
        <BuildFirmwareModal
          patternLabel={forkOf?.title ?? "Pattern Lab composition"}
          cppPrompt={firmwarePrompt}
          onClose={() => setFirmwarePrompt(null)}
        />
      )}

      {firmwareWizardOpen && <FirmwareExportModal onClose={() => setFirmwareWizardOpen(false)} />}
    </main>
  );
}
