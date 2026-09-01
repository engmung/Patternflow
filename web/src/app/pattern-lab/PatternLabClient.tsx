"use client";

// Pattern Lab v2 — a layered, dockable pattern editing workspace.
//
// The old lab was one pattern + one fixed two-column layout. This shell hosts
// eight dockable panels (dockview) over a layer-stack project (zustand):
// Preview, Layers, Code, Pixel, Gallery, Knobs, Color Ramp, Graphic Export. Panels rearrange
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
import { CODE_MAX } from "@/lib/community/validate";
import { withKnobsAnnotation } from "@/lib/lab/annotations";
import { currentPerformanceJson } from "@/lib/lab/director/publish";
import { onEditorReveal } from "@/lib/lab/editorReveal";
import { flattenLayers, needsFlatten } from "@/lib/lab/flatten";
import { LAYOUT_STORAGE, layoutViewCount } from "@/lib/lab/serialize";
import { listSessions, type SessionMeta } from "@/lib/lab/sessions";
import { buildStackAnnotation, importCodeIntoLab, stripStackAnnotation } from "@/lib/lab/stackShare";
import { useLabStore } from "@/lib/lab/store";
import type { CodeLayer } from "@/lib/lab/types";
import HardwareModal from "./HardwareModal";

import PreviewPanel from "./panels/PreviewPanel";
import LayersPanel from "./panels/LayersPanel";
import KnobsPanel from "./panels/KnobsPanel";
import RampPanel from "./panels/RampPanel";
import CodePanel from "./panels/CodePanel";
import PixelPanel from "./panels/PixelPanel";
import GalleryPanel from "./panels/GalleryPanel";
import CapturePanel from "./panels/CapturePanel";
import DirectorPanel from "./panels/DirectorPanel";

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
  // Output stage (stills/clips at print sizes) — an add-on module, see
  // lib/lab/capture. Registered here and nowhere else.
  { id: "capture", title: "Graphic Export" },
  // Knob automation over time (lib/lab/director) — the show that publishes
  // alongside the pattern.
  { id: "director", title: "Director" },
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
  capture: CapturePanel,
  director: DirectorPanel,
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
    id: "capture",
    component: "capture",
    title: "Graphic Export",
    position: { referencePanel: "code", direction: "within" },
  });
  api.addPanel({
    id: "director",
    component: "director",
    title: "Director",
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
    // The guard is on the TOTAL: the annotation has its own line cap, but
    // what the community measures is flattened code plus annotation, and
    // bounding only the line let a pixel-heavy stack sail past the cap and
    // be refused outright instead of falling back to a flat publish.
    const stackLine = await buildStackAnnotation({
      name: state.name,
      matrix: state.matrix,
      layers: state.layers,
      activeLayerId: state.activeLayerId,
      knobs: state.knobs,
      ranges: state.ranges,
      knobLabels: state.knobLabels,
      forkOf: state.forkOf,
      // Never travels in the shared code: a reader opening somebody else's
      // pattern is forking it, not editing their post.
      editOf: null,
      gen: state.gen,
      director: state.director,
    }).catch(() => null);
    const withStack = stackLine ? `${flat}\n\n${stackLine}\n` : flat;
    return withStack.length <= CODE_MAX ? withStack : flat;
  }
  const layer = state.layers.find(
    (entry) => entry.visible && entry.opacity > 0 && entry.type === "code",
  ) as CodeLayer;
  // A layer that arrived from a shared composition may still carry that
  // composition's @stack line; published as-is it would reopen as the
  // original author's layers rather than this pattern.
  let code = withMatrixAnnotation(stripStackAnnotation(layer.code), state.matrix);
  // Knob ranges live in the lab, not in the layer's text, so retuning a
  // slider's min/max left the code saying whatever it was imported with. The
  // flattened path has always written this line; a single code layer — the
  // common case — published the original ranges and the retune had to be
  // redone by hand in the community editor afterwards.
  code = withKnobsAnnotation(code, state.knobLabels, state.ranges);
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

export default function PatternLabClient() {
  const [mounted, setMounted] = useState(false);
  const [panelsMenuOpen, setPanelsMenuOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<SessionMeta[]>([]);
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [sharePerfJson, setSharePerfJson] = useState<string | null>(null);
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const apiRef = useRef<DockviewApi | null>(null);
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useLabStore((state) => state.hydrate);
  const restoredAt = useLabStore((state) => state.restoredAt);
  const discardProject = useLabStore((state) => state.discardProject);
  const pieceName = useLabStore((state) => state.name);
  const setPieceName = useLabStore((state) => state.setName);
  const restoreSession = useLabStore((state) => state.restoreSession);
  const stashCurrent = useLabStore((state) => state.stashCurrent);
  const forkOf = useLabStore((state) => state.forkOf);
  const setForkOf = useLabStore((state) => state.setForkOf);
  const editOf = useLabStore((state) => state.editOf);
  const setEditOf = useLabStore((state) => state.setEditOf);

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
      //
      // Two shapes arrive here. Somebody else's pattern is a FORK source: it
      // becomes a new post when shared. The visitor's own pattern arrives as
      // an EDIT instead — the same post, reopened — and the two are mutually
      // exclusive by construction (lib/community/handoff.ts).
      // Named `editing` rather than `editOf` so it cannot be confused with
      // the store selector of that name above.
      const editing = handoff.edit ?? null;
      const forkOf =
        !editing && handoff.parentId
          ? {
              id: handoff.parentId,
              title: handoff.parentTitle ?? "a community pattern",
              license: handoff.parentLicense,
            }
          : undefined;
      const openedTitle = editing?.title ?? handoff.parentTitle ?? undefined;
      importCodeIntoLab(handoff.code, openedTitle, forkOf)
        .catch(() => {
          // The stack failed to restore after the canvas was already
          // cleared. A flat single layer beats an empty lab with no word on
          // why; the parked work is still under Recent ▾ either way.
          try {
            useLabStore.getState().addCodeLayerFromCode(
              stripStackAnnotation(handoff.code),
              openedTitle,
              forkOf,
            );
          } catch {
            // Nothing left to try.
          }
        })
        .finally(() => {
          if (!editing) return;
          const store = useLabStore.getState();
          store.setEditOf(editing);
          // Revising a post overwrites the only published copy, so the
          // version being opened goes into the session ring NOW rather than
          // at Update time — a crash, a closed tab or a change of mind all
          // land on the same "get it back from Recent ▾".
          store.parkSnapshot(`${editing.title} · published`);
        });
    }
    setMounted(true);
  }, [hydrate]);

  // A queued layout save must not outlive the dock it describes: leaving the
  // lab tears the dock down, and a save that lands afterwards writes whatever
  // the half-disposed dock happened to serialise to.
  useEffect(
    () => () => {
      if (layoutSaveTimer.current !== null) {
        clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = null;
      }
    },
    [],
  );

  const syncOpenPanels = useCallback((api: DockviewApi) => {
    setOpenPanels(new Set(api.panels.map((panel) => panel.id)));
  }, []);

  // Layer gestures front the matching editor: clicking a pixel layer brings
  // the Pixel tab forward instead of leaving Code on top with a "use the
  // Pixel panel" hint. Creating a layer may also reopen a closed editor
  // panel; plain selection only fronts what is already open, so a
  // deliberately closed panel stays closed while you dup/delete/retitle.
  useEffect(
    () =>
      onEditorReveal(({ kind, open }) => {
        const api = apiRef.current;
        if (!api) return;
        const existing = api.getPanel(kind);
        if (existing) {
          existing.api.setActive();
          return;
        }
        if (!open) return;
        const def = PANEL_DEFS.find((entry) => entry.id === kind);
        if (!def) return;
        api.addPanel({ id: def.id, component: def.id, title: def.title });
        syncOpenPanels(api);
      }),
    [syncOpenPanels],
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;

      let restored = false;
      try {
        const raw = window.localStorage.getItem(LAYOUT_STORAGE);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Restoring a layout that places nothing gives you an empty
          // workspace: every panel gone, and Reset layout the only way out.
          // dockview will happily do it, so the check has to happen here.
          if (layoutViewCount(parsed) > 0) {
            api.fromJSON(parsed);
            restored = true;
          }
        }
      } catch {
        restored = false;
      }
      if (!restored) {
        // Drop the unusable one rather than leaving it to be rejected again on
        // every future load — onDidLayoutChange is subscribed below, so
        // nothing overwrites it until the first panel is moved.
        try {
          window.localStorage.removeItem(LAYOUT_STORAGE);
        } catch {
          // Private mode — nothing was persisted anyway.
        }
        try {
          // Whatever a failed fromJSON managed to add is still in there, and
          // building the default on top of it collides on panel ids.
          api.clear();
          buildDefaultLayout(api);
        } catch {
          // A half-built layout is still usable; panels can be opened manually.
        }
      }
      // Titles belong to PANEL_DEFS, not to the saved layout: a restored dock
      // remembers the name a panel had when it was last moved, so a rename
      // (Capture → Graphic Export, 2026-09) would only reach people who reset
      // their layout otherwise.
      for (const def of PANEL_DEFS) {
        const panel = api.getPanel(def.id);
        if (panel && panel.title !== def.title) panel.api.setTitle(def.title);
      }
      syncOpenPanels(api);

      api.onDidLayoutChange(() => {
        syncOpenPanels(api);
        if (layoutSaveTimer.current !== null) clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = setTimeout(() => {
          layoutSaveTimer.current = null;
          try {
            const next = api.toJSON();
            // This is where the blank workspace got in. A dock is momentarily
            // empty while it is being cleared or torn down, and a snapshot
            // taken then is a layout that restores as nothing at all. It is
            // never a state worth remembering, so it is never written.
            if (layoutViewCount(next) === 0) return;
            window.localStorage.setItem(LAYOUT_STORAGE, JSON.stringify(next));
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
          <input
            type="text"
            className={styles.labName}
            value={pieceName}
            maxLength={60}
            placeholder="name this pattern"
            title="The piece's name — To hardware uses it as NAME (so the .pfm module matches), the Director stamps it into the show, and publishing suggests it. Layer names stay layer names."
            onChange={(event) => setPieceName(event.target.value)}
          />
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
          {editOf && (
            <span
              className={styles.forkBadge}
              title="Your own post, reopened. Sharing UPDATES it — same page, same likes, comments and forks. Click × to publish this as a separate new pattern instead; the version you started from is under Recent ▾."
            >
              editing {editOf.title}
              <button
                type="button"
                aria-label="Publish as a new pattern instead of updating this one"
                onClick={() => setEditOf(null)}
              >
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
              title={
                editOf
                  ? `Update "${editOf.title}" with what is on the canvas — same post, same likes and comments`
                  : "Publish the visible stack to the community — flattened to one pattern, with the layer stack embedded so it reopens editable"
              }
              onClick={() => {
                setSharePerfJson(currentPerformanceJson());
                void buildExportCode().then(setShareCode);
              }}
            >
              {editOf ? "Update" : "Share"}
            </button>
          )}
          {buildsConfigured() && (
            <button
              type="button"
              className={styles.headerToggle}
              title="Convert this composition to a .h header, then build it, install it on the board, or publish it hardware-ready"
              onClick={() => setHardwareOpen(true)}
            >
              To hardware
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
          parentLicense={forkOf?.license ?? null}
          editOf={editOf}
          performanceJson={sharePerfJson}
          initialTitle={pieceName.trim() || null}
          onClose={() => setShareCode(null)}
        />
      )}

      {hardwareOpen && (
        <HardwareModal exportCode={buildExportCode} onClose={() => setHardwareOpen(false)} />
      )}
    </main>
  );
}
