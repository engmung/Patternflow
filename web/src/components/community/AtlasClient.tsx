"use client";

// The pattern atlas — a zoomable 2D map of pattern-technique space.
//
// Two kinds of things live on it:
//  · ENTRIES (lib/atlas/data.ts): technique hypotheses — verified continents,
//    open frontier, invented experiments. Click one for a generation prompt.
//  · PINS (atlas_pins table): actual published patterns, placed by their
//    authors. They render as live tiles — the map slowly becomes territory.
//
// English is the default (the community is public); Korean is a per-browser
// preference. The generation prompt itself is always English.
//
// Entry coordinates are taste hypotheses: drag in edit mode, export, bake the
// JSON back into data.ts. Pin coordinates belong to their authors and save to
// the database on drop.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  BLOBS,
  ENTRIES,
  ENTRY_BY_ID,
  FAMILIES,
  STATUSES,
  buildPrompt,
  isNewEntry,
  type AtlasEntry,
  type AtlasStatusId,
} from "@/lib/atlas/data";
import { knobSetupFromCode } from "@/lib/community/knobs";
import { describeMatrixShape, matrixFromCode } from "@/lib/patternMatrix";
import PatternCanvas from "./PatternCanvas";
import SandboxPreview from "./SandboxPreview";
import commStyles from "./Community.module.css";
import styles from "./Atlas.module.css";

// Plot geometry inside the 1000×640 viewBox — near full-bleed; the axis words
// float over the map itself.
const VB_W = 1000;
const VB_H = 640;
const MX = 10;
const MY = 10;
const W = VB_W - MX * 2;
const H = VB_H - MY * 2;

const sx = (x: number) => MX + (x / 100) * W;
const sy = (y: number) => MY + H - (y / 100) * H;

const LED = "#E8552E";
const LANG_KEY = "pf-atlas-lang";
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** Drop a pattern within this many viewBox px of an entry and it inherits
 *  that entry's lineage — placing near a prompt IS pointing at it. */
const LINK_RADIUS = 80;

type Lang = "en" | "ko";
/** Status chips, plus "all" and "new" — the latest batch, which cuts across
 *  statuses and is the only way to find an import in a map this size. */
type Filter = AtlasStatusId | "all" | "new";
type Selection = { kind: "entry"; id: string } | { kind: "pin"; id: string } | null;

export type AtlasPinData = {
  patternId: string;
  x: number;
  y: number;
  entryId: string | null;
  /** "pin" = an exemplar tile on the map. "research" = a field note filed
   *  against an entry — kept as data, revealed from the entry panel, never
   *  drawn as a tile. Failures are worth remembering where they happened. */
  kind: "pin" | "research";
  /** Whether the pattern itself is public — a research note is allowed to be
   *  private, and a private note can never be promoted to a map tile. */
  isPublic: boolean;
  title: string;
  code: string;
  userId: string;
  username: string | null;
  displayUsername: string | null;
};

const UI = {
  en: {
    tagline: "Experimental — a map for exploring more patterns.",
    edit: "Edit layout",
    editing: "Editing — drag points",
    copyLayout: "Copy layout",
    copiedLayout: "Copied (JSON)",
    allChip: "All",
    newChip: (n: number) => `New · ${n}`,
    newBadge: "new",
    pinChip: "Pinned",
    axisOrder: "ORDER →",
    axisChaos: "→ CHAOS",
    axisWire: "WIRE →",
    axisField: "→ FIELD",
    secTexture: "Texture",
    secKnob: "Critical knob · phase transition",
    secVert: "Vertical axis",
    secRisk: "Caution",
    secImpl: "Implementation",
    secPrompt: "Exploration prompt — paste into your AI",
    copyPrompt: "Copy prompt",
    copiedPrompt: "Copied — to your AI, results into Pattern Lab",
    introTitle: "A map of pattern space",
    introSub: "Feeling → Prompt",
    legendPin: "Pin — a published pattern, placed by its author",
    pinBy: "by",
    openPattern: "Open pattern ↗",
    removePin: "Remove from the map",
    moveHint: "Turn on [Edit layout] to drag this pin.",
    placeBanner: (title: string) => `Placing “${title}” — click the map where it belongs`,
    cancel: "Cancel",
    zoomHint: "wheel to zoom · drag to pan · double-click to reset",
    madeFrom: "Made from prompt",
    linkNone: "— none —",
    patternsFrom: "Patterns from this prompt",
    researchFrom: (n: number) => `Research attempts · ${n}`,
    researchBadge: "research note",
    researchHint: "Kept as data against this point — not drawn on the map.",
    fileResearch: "File as research (hide the tile)",
    promotePin: "Put on the map as a tile",
    placeBannerResearch: (title: string) =>
      `Filing “${title}” as research — drop it on the point it came from`,
    privateTag: "private → research",
    knobs: "Knobs",
    addPattern: "Add my pattern",
    pickerHead: (n: number) => `Your patterns · newest first (${n})`,
    pickerSearch: "Search by title…",
  },
  ko: {
    tagline: "실험 기능 — 더 많은 패턴 탐구를 위한 지도.",
    edit: "배치 편집",
    editing: "편집 중 — 점을 끌기",
    copyLayout: "배치 복사",
    copiedLayout: "복사됨 (JSON)",
    allChip: "전체",
    newChip: (n: number) => `새로 추가 · ${n}`,
    newBadge: "새로 추가",
    pinChip: "핀",
    axisOrder: "질서 ORDER →",
    axisChaos: "→ 혼돈 CHAOS",
    axisWire: "선 WIRE →",
    axisField: "→ 장 FIELD",
    secTexture: "질감",
    secKnob: "급소 노브 · 위상전이",
    secVert: "세로 축",
    secRisk: "주의",
    secImpl: "구현",
    secPrompt: "탐사 프롬프트 (EN) — AI에 붙여넣기",
    copyPrompt: "프롬프트 복사",
    copiedPrompt: "복사됨 — AI에게, 결과는 Pattern Lab에",
    introTitle: "패턴 생성 지도",
    introSub: "Feeling → Prompt",
    legendPin: "핀 — 작성자가 지도에 놓은 공개 패턴",
    pinBy: "by",
    openPattern: "패턴 열기 ↗",
    removePin: "지도에서 내리기",
    moveHint: "[배치 편집]을 켜면 이 핀을 끌 수 있다.",
    placeBanner: (title: string) => `“${title}” 놓는 중 — 어울리는 자리를 클릭`,
    cancel: "취소",
    zoomHint: "휠 확대 · 드래그 이동 · 더블클릭 리셋",
    madeFrom: "출신 프롬프트",
    linkNone: "— 없음 —",
    patternsFrom: "이 프롬프트에서 나온 패턴",
    researchFrom: (n: number) => `연구 기록 · ${n}`,
    researchBadge: "연구 기록",
    researchHint: "이 포인트에 데이터로만 남음 — 지도에는 그려지지 않는다.",
    fileResearch: "연구 기록으로 내리기 (타일 숨김)",
    promotePin: "지도 타일로 올리기",
    placeBannerResearch: (title: string) => `“${title}” 연구 기록 중 — 출신 포인트 위에 놓기`,
    privateTag: "비공개 → 연구 기록",
    knobs: "노브",
    addPattern: "내 패턴 올리기",
    pickerHead: (n: number) => `내 패턴 · 최신순 (${n})`,
    pickerSearch: "제목으로 검색…",
  },
} as const;

export default function AtlasClient({
  pins,
  viewerId,
  isAdmin,
  myPatterns,
}: {
  pins: AtlasPinData[];
  viewerId: string | null;
  isAdmin: boolean;
  /** The viewer's own patterns not yet on the map — the picker. Private ones
   *  can only be filed as research notes, and the placement flow routes them
   *  there. */
  myPatterns: Array<{ id: string; title: string; code: string; isPublic: boolean }>;
}) {
  const router = useRouter();
  // Reading straight from the store (rather than syncing state in an effect)
  // keeps the server's English markup and the browser's remembered choice
  // from fighting during hydration.
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en" as Lang);
  const [positions, setPositions] = useState<Record<string, [number, number]>>(
    () => Object.fromEntries(ENTRIES.map((e) => [e.id, [e.x, e.y] as [number, number]])),
  );
  // Local pin positions override the server rows while dragging.
  const [pinPositions, setPinPositions] = useState<Record<string, [number, number]>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editMode, setEditMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  // "Add my pattern": pick from the toolbar, then click the map to drop.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [placing, setPlacing] = useState<{
    id: string;
    title: string;
    code: string;
    isPublic: boolean;
  } | null>(null);
  // While placing: the entry the cursor would link to (nearest within radius).
  const [placingNear, setPlacingNear] = useState<string | null>(null);
  // The picker lists your own patterns newest first, as thumbnails — you
  // recognise your work by looking at it, not by reading titles.
  const [pickerQuery, setPickerQuery] = useState("");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingEntryRef = useRef<string | null>(null);
  const draggingPinRef = useRef<string | null>(null);
  const panRef = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const dragMovedRef = useRef(false);



  // Wheel zoom must preventDefault, which React's synthetic listener cannot —
  // attach a real non-passive listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const point = toViewBox(svg, ev.clientX, ev.clientY);
      if (!point) return;
      setView((prev) => {
        const k = clamp(prev.k * Math.exp(-ev.deltaY * 0.0016), MIN_ZOOM, MAX_ZOOM);
        // Keep the world point under the cursor fixed while the scale changes.
        const wx = (point.x - prev.tx) / prev.k;
        const wy = (point.y - prev.ty) / prev.k;
        return clampView({ k, tx: point.x - wx * k, ty: point.y - wy * k });
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const t = UI[lang];

  const toggleLang = () => writeLang(lang === "en" ? "ko" : "en");

  const entryName = (e: AtlasEntry) => (lang === "en" ? e.nmEn : e.nm);
  const entryKnob = (e: AtlasEntry) => (lang === "en" ? e.knobEn : e.knob) ?? e.knobEn ?? e.knob;
  const famLabel = (f: AtlasEntry["f"]) => (lang === "en" ? FAMILIES[f].labelEn : FAMILIES[f].label);
  const statusLabel = (s: AtlasStatusId) => (lang === "en" ? STATUSES[s].labelEn : STATUSES[s].label);
  const statusLegend = (s: AtlasStatusId) => (lang === "en" ? STATUSES[s].legendEn : STATUSES[s].legend);

  const pinPos = (pin: AtlasPinData): [number, number] => pinPositions[pin.patternId] ?? [pin.x, pin.y];
  // Fall back to the data coords: hot reloads keep old state while ENTRIES
  // grows, and a missing id must never take the whole map down.
  const entryPos = (e: AtlasEntry): [number, number] => positions[e.id] ?? [e.x, e.y];
  const canEditPin = (pin: AtlasPinData) => isAdmin || (viewerId !== null && viewerId === pin.userId);

  // Only exemplars are drawn on the map; research rows surface from the entry
  // panel. Both live in `pins`, so selecting either opens the same panel.
  const mapPins = pins.filter((pin) => pin.kind === "pin");

  const selectedEntry =
    selection?.kind === "entry" ? ENTRIES.find((e) => e.id === selection.id) ?? null : null;
  const selectedPin =
    selection?.kind === "pin" ? pins.find((p) => p.patternId === selection.id) ?? null : null;

  /* ── coordinate plumbing ── */

  const toDataCoords = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = toViewBox(svg, clientX, clientY);
    if (!point) return null;
    const wx = (point.x - view.tx) / view.k;
    const wy = (point.y - view.ty) / view.k;
    const x = Math.max(0, Math.min(100, ((wx - MX) / W) * 100));
    const y = Math.max(0, Math.min(100, ((MY + H - wy) / H) * 100));
    return [Math.round(x), Math.round(y)];
  };

  /** Nearest entry within LINK_RADIUS (perceptual/viewBox distance), else null. */
  const nearestEntry = ([x, y]: [number, number]): string | null => {
    let best: string | null = null;
    let bestDist = LINK_RADIUS;
    for (const entry of ENTRIES) {
      const [ex, ey] = entryPos(entry);
      const dist = Math.hypot(((ex - x) / 100) * W, ((ey - y) / 100) * H);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry.id;
      }
    }
    return best;
  };

  /* ── pointer choreography: pan the world, drag entries, drag pins ── */

  const onBackgroundDown = (ev: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const point = toViewBox(svg, ev.clientX, ev.clientY);
    if (!point) return;
    panRef.current = { px: point.x, py: point.y, tx: view.tx, ty: view.ty };
    dragMovedRef.current = false;
  };

  const onMapPointerMove = (ev: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;

    const entryId = draggingEntryRef.current;
    if (entryId) {
      const coords = toDataCoords(ev.clientX, ev.clientY);
      if (!coords) return;
      dragMovedRef.current = true;
      setPositions((prev) => ({ ...prev, [entryId]: coords }));
      return;
    }

    const pinId = draggingPinRef.current;
    if (pinId) {
      const coords = toDataCoords(ev.clientX, ev.clientY);
      if (!coords) return;
      dragMovedRef.current = true;
      setPinPositions((prev) => ({ ...prev, [pinId]: coords }));
      return;
    }

    // Placement mode: track which entry the cursor would inherit lineage from.
    if (placing && !panRef.current) {
      const coords = toDataCoords(ev.clientX, ev.clientY);
      if (coords) setPlacingNear(nearestEntry(coords));
    }

    const pan = panRef.current;
    if (pan) {
      const point = toViewBox(svg, ev.clientX, ev.clientY);
      if (!point) return;
      if (Math.abs(point.x - pan.px) + Math.abs(point.y - pan.py) > 2) dragMovedRef.current = true;
      setView((prev) =>
        clampView({ k: prev.k, tx: pan.tx + (point.x - pan.px), ty: pan.ty + (point.y - pan.py) }),
      );
    }
  };

  const onMapPointerUp = () => {
    const pinId = draggingPinRef.current;
    if (pinId && dragMovedRef.current) {
      const pin = pins.find((p) => p.patternId === pinId);
      if (pin) void savePin(pin, pinPos(pin));
    }
    draggingEntryRef.current = null;
    draggingPinRef.current = null;
    panRef.current = null;
    window.setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  };

  const onMapClick = () => {
    if (dragMovedRef.current) return;
    // In placement mode the background rect's pointerup does the drop
    // (the click event carries no coordinates here).
    if (placing) return;
    setSelection(null);
  };

  const onPlaceClick = (ev: React.PointerEvent) => {
    if (!placing || dragMovedRef.current) return;
    const coords = toDataCoords(ev.clientX, ev.clientY);
    if (!coords) return;
    void placePattern(placing, coords);
  };

  /* ── server writes ── */

  const savePin = async (pin: AtlasPinData, [x, y]: [number, number]) => {
    await fetch("/api/community/atlas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: pin.patternId, x, y, entryId: pin.entryId, kind: pin.kind }),
    });
    router.refresh();
  };

  const setPinLink = async (pin: AtlasPinData, entryId: string | null) => {
    const [x, y] = pinPos(pin);
    await fetch("/api/community/atlas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: pin.patternId, x, y, entryId, kind: pin.kind }),
    });
    router.refresh();
  };

  /** Demote a tile to a research note, or promote a note back to a tile. */
  const setPinKind = async (pin: AtlasPinData, kind: "pin" | "research") => {
    const [x, y] = pinPos(pin);
    await fetch("/api/community/atlas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: pin.patternId, x, y, entryId: pin.entryId, kind }),
    });
    router.refresh();
  };

  const placePattern = async (pattern: NonNullable<typeof placing>, coords: [number, number]) => {
    // Dropping NEAR a prompt point is pointing at it — the nearest entry
    // within LINK_RADIUS becomes the lineage. Dropping in open sea links to
    // nothing; the pin panel's select stays for corrections either way.
    //
    // A private pattern files as a research note, and a note without a point
    // would be invisible everywhere — so that drop must land near an entry
    // (the banner says so; a miss is a no-op, not an error).
    const entryId = nearestEntry(coords);
    const kind = pattern.isPublic ? "pin" : "research";
    if (kind === "research" && !entryId) return;
    const res = await fetch("/api/community/atlas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: pattern.id, x: coords[0], y: coords[1], entryId, kind }),
    });
    if (res.ok) {
      setPlacing(null);
      setPlacingNear(null);
      setSelection({ kind: "pin", id: pattern.id });
      router.refresh();
    }
  };

  const removePin = async (patternId: string) => {
    await fetch("/api/community/atlas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId }),
    });
    setSelection(null);
    setPinPositions((prev) => {
      const next = { ...prev };
      delete next[patternId];
      return next;
    });
    router.refresh();
  };

  /* ── clipboard ── */

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  const copyPrompt = async (entry: AtlasEntry) => {
    await copyText(buildPrompt(entry));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const exportLayout = async () => {
    await copyText(JSON.stringify(positions));
    setExported(true);
    window.setTimeout(() => setExported(false), 1800);
  };

  const query = pickerQuery.trim().toLowerCase();
  const pickerList = myPatterns.filter(
    (pattern) => query === "" || pattern.title.toLowerCase().includes(query),
  );

  const newCount = ENTRIES.filter(isNewEntry).length;
  // A chip nobody can fill is a button that empties the map — statuses with no
  // entries stay off the bar until something moves into them.
  const chipList: Array<[Filter, string]> = [
    ["all", t.allChip],
    ...(newCount > 0 ? ([["new", t.newChip(newCount)]] as Array<[Filter, string]>) : []),
    ...(Object.keys(STATUSES) as AtlasStatusId[])
      .filter((s) => ENTRIES.some((e) => e.st === s))
      .map((s) => [s, statusLabel(s)] as [Filter, string]),
  ];

  const passesFilter = (e: AtlasEntry) =>
    filter === "all" || (filter === "new" ? isNewEntry(e) : e.st === filter);

  const worldTransform = `translate(${view.tx} ${view.ty}) scale(${view.k})`;
  const inv = 1 / view.k;

  return (
    <div className={styles.atlas}>
      <div className={styles.toolbar}>
        <p className={styles.tagline}>
          {t.tagline} <span className={styles.zoomHint}>{t.zoomHint}</span>
        </p>
        <div className={styles.toolbarSpacer} />
        {myPatterns.length > 0 && (
          <span className={styles.pickerWrap}>
            <button
              type="button"
              className={styles.toolBtn}
              data-on={pickerOpen || Boolean(placing)}
              onClick={() => setPickerOpen((v) => !v)}
            >
              {t.addPattern}
            </button>
            {pickerOpen && (
              <div className={styles.picker}>
                <div className={styles.pickerHead}>{t.pickerHead(myPatterns.length)}</div>
                {myPatterns.length > 8 && (
                  <input
                    type="search"
                    className={styles.pickerSearch}
                    placeholder={t.pickerSearch}
                    value={pickerQuery}
                    onChange={(ev) => setPickerQuery(ev.target.value)}
                    autoFocus
                  />
                )}
                <div className={styles.pickerGrid}>
                  {pickerList.map((pattern) => (
                    <button
                      key={pattern.id}
                      type="button"
                      className={styles.pickerItem}
                      title={pattern.title}
                      onClick={() => {
                        setPlacing(pattern);
                        setPickerOpen(false);
                      }}
                    >
                      <span className={styles.pickerTile}>
                        <PatternCanvas
                          code={pattern.code}
                          title={pattern.title}
                          className={styles.pinWell}
                        />
                      </span>
                      <span className={styles.pickerCaption}>
                        {pattern.title}
                        {!pattern.isPublic && (
                          <span className={styles.researchTag}> {t.privateTag}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </span>
        )}
        <button type="button" className={styles.toolBtn} onClick={toggleLang}>
          {lang === "en" ? "한국어" : "English"}
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          data-on={editMode}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? t.editing : t.edit}
        </button>
        <button type="button" className={styles.toolBtn} onClick={exportLayout}>
          {exported ? t.copiedLayout : t.copyLayout}
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.mapWrap} data-placing={Boolean(placing)}>
          <div className={styles.chips}>
            {chipList.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={styles.chip}
                data-on={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {placing && (
            <div className={styles.placeBanner}>
              <span>
                {placing.isPublic ? t.placeBanner(placing.title) : t.placeBannerResearch(placing.title)}
                {placingNear && ENTRY_BY_ID.has(placingNear) && (
                  <span className={styles.bannerLink}>
                    {" "}→ {entryName(ENTRY_BY_ID.get(placingNear)!)}
                  </span>
                )}
              </span>
              <button
                type="button"
                className={styles.toolBtn}
                onClick={() => {
                  setPlacing(null);
                  setPlacingNear(null);
                }}
              >
                {t.cancel}
              </button>
            </div>
          )}

          <svg
            ref={svgRef}
            className={styles.map}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            aria-label={t.introTitle}
            onPointerMove={onMapPointerMove}
            onPointerUp={onMapPointerUp}
            onPointerLeave={onMapPointerUp}
            onClick={onMapClick}
            onDoubleClick={() => setView({ k: 1, tx: 0, ty: 0 })}
          >
            <defs>
              <filter id="atlasBlob" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
            </defs>

            {/* Background catcher: pans the world; in placement mode, drops the pattern. */}
            <rect
              x={0} y={0} width={VB_W} height={VB_H} fill="transparent"
              onPointerDown={onBackgroundDown}
              onPointerUp={onPlaceClick}
            />

            <g transform={worldTransform}>
              <rect
                x={MX} y={MY} width={W} height={H} fill="none"
                className={styles.frame} pointerEvents="none"
              />
              <g className={styles.grid} pointerEvents="none">
                {[1, 2, 3].map((i) => (
                  <g key={i}>
                    <line x1={MX + (W * i) / 4} y1={MY} x2={MX + (W * i) / 4} y2={MY + H} />
                    <line x1={MX} y1={MY + (H * i) / 4} x2={MX + W} y2={MY + (H * i) / 4} />
                  </g>
                ))}
              </g>

              {BLOBS.map(([fam, cx, cy, rx, ry, rot]) => {
                const color = FAMILIES[fam].color;
                return (
                  <g key={fam} pointerEvents="none">
                    <ellipse
                      cx={sx(cx)} cy={sy(cy)}
                      rx={(rx / 100) * W} ry={(ry / 100) * H}
                      fill={color} opacity={0.06} filter="url(#atlasBlob)"
                      transform={`rotate(${rot} ${sx(cx)} ${sy(cy)})`}
                    />
                    <g transform={`translate(${sx(cx)} ${sy(cy + ry) - 8}) scale(${inv})`}>
                      <text textAnchor="middle" fill={color} className={styles.famLabel}>
                        {famLabel(fam)}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Lineage threads: a pin hangs from the prompt that made it. */}
              <g pointerEvents="none">
                {mapPins.map((pin) => {
                  if (!pin.entryId) return null;
                  const entry = ENTRY_BY_ID.get(pin.entryId);
                  if (!entry) return null;
                  const [ex, ey] = entryPos(entry);
                  const [px, py] = pinPos(pin);
                  return (
                    <line
                      key={`thread-${pin.patternId}`}
                      x1={sx(ex)} y1={sy(ey)} x2={sx(px)} y2={sy(py)}
                      stroke={FAMILIES[entry.f].color}
                      strokeOpacity={0.3}
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>

              {ENTRIES.filter(passesFilter).map((e) => {
                const [px, py] = entryPos(e);
                const color = FAMILIES[e.f].color;
                // Abandoned ground is drawn faintest of all — it stays on the
                // chart as a record, not as an invitation.
                const dim =
                  e.st === "retired" ? 0.22
                  : e.st === "unexplored" ? 0.55
                  : e.st === "hold" ? 0.6
                  : e.st === "invented" ? 0.8
                  : 1;
                const dash =
                  e.st === "retired" ? "1 4"
                  : e.st === "unexplored" ? "2.5 2.5"
                  : e.st === "invented" ? "1 3"
                  : undefined;
                const glow = e.st === "verified" ? 7 : e.st === "invented" ? 5 : e.st === "retired" ? 0 : 3;
                const isSelected = selection?.kind === "entry" && selection.id === e.id;
                return (
                  <g
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    aria-label={entryName(e)}
                    className={styles.node}
                    data-selected={isSelected}
                    transform={`translate(${sx(px)} ${sy(py)}) scale(${inv})`}
                    onPointerDown={(ev) => {
                      if (!editMode) return;
                      ev.preventDefault();
                      ev.stopPropagation();
                      draggingEntryRef.current = e.id;
                      dragMovedRef.current = false;
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (!dragMovedRef.current) setSelection({ kind: "entry", id: e.id });
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") setSelection({ kind: "entry", id: e.id });
                    }}
                  >
                    {placingNear === e.id && (
                      <circle r={13} fill="none" stroke="#F4EFE6" strokeOpacity={0.8} strokeDasharray="3 3" />
                    )}
                    {e.st === "active" && (
                      <circle r={11} fill="none" stroke={LED} className={styles.pulseRing} />
                    )}
                    <circle
                      className={styles.core}
                      r={e.st === "retired" ? 4.5 : 6.5}
                      fill={color}
                      fillOpacity={dim}
                      stroke={e.st === "verified" ? "none" : color}
                      strokeOpacity={Math.min(1, dim + 0.2)}
                      strokeDasharray={dash}
                      strokeWidth={e.st === "verified" ? 0 : 1.4}
                      style={glow > 0 ? { filter: `drop-shadow(0 0 ${glow}px ${color})` } : undefined}
                    />
                    <text
                      x={10} y={4}
                      className={styles.nodeLabel}
                      opacity={e.st === "retired" ? 0.4 : 1}
                    >
                      {entryName(e)}
                    </text>
                  </g>
                );
              })}

              {mapPins.map((pin) => {
                const [px, py] = pinPos(pin);
                const isSelected = selection?.kind === "pin" && selection.id === pin.patternId;
                const draggable = editMode && canEditPin(pin);
                return (
                  <g
                    key={pin.patternId}
                    transform={`translate(${sx(px)} ${sy(py)}) scale(${inv})`}
                  >
                    <foreignObject x={-22} y={-44} width={44} height={102}>
                      <div
                        className={styles.pin}
                        data-selected={isSelected}
                        data-draggable={draggable}
                        title={pin.title}
                        onPointerDown={(ev) => {
                          if (!draggable) return;
                          ev.preventDefault();
                          ev.stopPropagation();
                          draggingPinRef.current = pin.patternId;
                          dragMovedRef.current = false;
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (!dragMovedRef.current) setSelection({ kind: "pin", id: pin.patternId });
                        }}
                      >
                        <div className={styles.pinTile}>
                          <PatternCanvas
                            code={pin.code}
                            title={pin.title}
                            live
                            className={styles.pinWell}
                          />
                        </div>
                        <div className={styles.pinCaption}>{pin.title}</div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>

            {/* Axis words float over the map, outside the zooming world. */}
            <g pointerEvents="none">
              <text x={MX + 10} y={MY + H - 12} className={styles.axis}>{t.axisOrder}</text>
              <text x={MX + W - 10} y={MY + H - 12} textAnchor="end" className={styles.axis}>
                {t.axisChaos}
              </text>
              <text
                x={MX + 16} y={MY + H - 34} className={styles.axis}
                transform={`rotate(-90 ${MX + 16} ${MY + H - 34})`}
              >{t.axisWire}</text>
              <text
                x={MX + 16} y={MY + 150} className={styles.axis}
                transform={`rotate(-90 ${MX + 16} ${MY + 150})`}
              >{t.axisField}</text>
            </g>
          </svg>
        </div>

        <aside className={styles.panel}>
          {selectedPin ? (
            <>
              <h2 className={styles.panelTitle}>{selectedPin.title}</h2>
              <div className={styles.panelEn}>
                {t.pinBy} {selectedPin.displayUsername ?? selectedPin.username ?? "?"}
              </div>
              {selectedPin.kind === "research" && (
                <div className={styles.badges}>
                  <span className={styles.badge} title={t.researchHint}>
                    {t.researchBadge}
                  </span>
                </div>
              )}

              <section className={styles.sec}>
                <div className={styles.secK}>{t.madeFrom}</div>
                {canEditPin(selectedPin) ? (
                  <select
                    className={styles.fromSelect}
                    value={selectedPin.entryId ?? ""}
                    onChange={(ev) => void setPinLink(selectedPin, ev.target.value || null)}
                  >
                    {/* A research note without a point would be invisible
                        everywhere, so that one option disappears for them. */}
                    {selectedPin.kind === "pin" && <option value="">{t.linkNone}</option>}
                    {ENTRIES.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entryName(entry)}
                      </option>
                    ))}
                  </select>
                ) : selectedPin.entryId && ENTRY_BY_ID.has(selectedPin.entryId) ? (
                  <button
                    type="button"
                    className={styles.fromChip}
                    style={{
                      borderColor: FAMILIES[ENTRY_BY_ID.get(selectedPin.entryId)!.f].color,
                    }}
                    onClick={() => setSelection({ kind: "entry", id: selectedPin.entryId! })}
                  >
                    {entryName(ENTRY_BY_ID.get(selectedPin.entryId)!)}
                  </button>
                ) : (
                  <div className={styles.secV}>{t.linkNone}</div>
                )}
              </section>

              {/* Keyed by pattern id: selecting another pin remounts the
                  player, so its knobs start from that pattern's own defaults
                  without an effect syncing them. */}
              <PinPlayer
                key={selectedPin.patternId}
                code={selectedPin.code}
                knobsLabel={t.knobs}
              />

              <div className={styles.badges}>
                <span className={styles.badge}>
                  x {pinPos(selectedPin)[0]} · y {pinPos(selectedPin)[1]}
                </span>
              </div>
              <Link className={styles.openLink} href={`/community/p/${selectedPin.patternId}`}>
                {t.openPattern}
              </Link>
              {canEditPin(selectedPin) && (
                <>
                  {selectedPin.kind === "pin" && <p className={styles.moveHint}>{t.moveHint}</p>}
                  {/* Demote needs a point to file against; promote needs the
                      pattern to be public (a private tile would leak). */}
                  {selectedPin.kind === "pin" && selectedPin.entryId && (
                    <button
                      type="button"
                      className={styles.toolBtn}
                      onClick={() => void setPinKind(selectedPin, "research")}
                    >
                      {t.fileResearch}
                    </button>
                  )}
                  {selectedPin.kind === "research" && selectedPin.isPublic && (
                    <button
                      type="button"
                      className={styles.toolBtn}
                      onClick={() => void setPinKind(selectedPin, "pin")}
                    >
                      {t.promotePin}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => void removePin(selectedPin.patternId)}
                  >
                    {t.removePin}
                  </button>
                </>
              )}
            </>
          ) : selectedEntry ? (
            <>
              <h2 className={styles.panelTitle}>{entryName(selectedEntry)}</h2>
              {selectedEntry.en && <div className={styles.panelEn}>{selectedEntry.en}</div>}
              <div className={styles.badges}>
                <span className={styles.badgeFam} style={{ background: FAMILIES[selectedEntry.f].color }}>
                  {famLabel(selectedEntry.f)}
                </span>
                <span className={styles.badge} data-live={selectedEntry.st === "active"}>
                  {statusLabel(selectedEntry.st)}
                </span>
                {isNewEntry(selectedEntry) && (
                  <span className={styles.badge} data-live>{t.newBadge}</span>
                )}
                <span className={styles.badge}>
                  x {entryPos(selectedEntry)[0]} · y {entryPos(selectedEntry)[1]}
                </span>
              </div>

              <section className={styles.sec}>
                <div className={styles.secK}>{t.secTexture}</div>
                <div className={styles.secV}>{lang === "en" ? selectedEntry.texEn : selectedEntry.tex}</div>
              </section>
              <section className={styles.sec}>
                <div className={styles.secK}>{t.secKnob}</div>
                <div className={styles.knobBox}>{entryKnob(selectedEntry) ?? "—"}</div>
              </section>
              {(lang === "en" ? selectedEntry.vertEn : selectedEntry.vert) && (
                <section className={styles.sec}>
                  <div className={styles.secK}>{t.secVert}</div>
                  <div className={styles.secV}>
                    {lang === "en" ? selectedEntry.vertEn : selectedEntry.vert}
                  </div>
                </section>
              )}
              {(lang === "en" ? selectedEntry.riskEn : selectedEntry.risk) && (
                <section className={styles.sec}>
                  <div className={styles.secK}>{t.secRisk}</div>
                  <div className={styles.riskBox}>
                    {lang === "en" ? selectedEntry.riskEn : selectedEntry.risk}
                  </div>
                </section>
              )}
              {(lang === "en" ? selectedEntry.implEn : selectedEntry.impl) && (
                <section className={styles.sec}>
                  <div className={styles.secK}>{t.secImpl}</div>
                  <div className={styles.implBox}>
                    {lang === "en" ? selectedEntry.implEn : selectedEntry.impl}
                  </div>
                </section>
              )}

              {mapPins.some((pin) => pin.entryId === selectedEntry.id) && (
                <section className={styles.sec}>
                  <div className={styles.secK}>{t.patternsFrom}</div>
                  <div className={styles.miniRow}>
                    {mapPins
                      .filter((pin) => pin.entryId === selectedEntry.id)
                      .map((pin) => (
                        <button
                          key={pin.patternId}
                          type="button"
                          className={styles.miniItem}
                          onClick={() => setSelection({ kind: "pin", id: pin.patternId })}
                          title={pin.title}
                        >
                          <span className={styles.miniTile}>
                            <PatternCanvas
                              code={pin.code}
                              title={pin.title}
                              className={styles.pinWell}
                            />
                          </span>
                          <span className={styles.miniCaption}>{pin.title}</span>
                        </button>
                      ))}
                  </div>
                </section>
              )}

              {/* Field notes filed against this point — the attempts that did
                  not earn a tile. Kept behind a click: the data matters when
                  you are about to walk the same ground, and only then. */}
              {pins.some((pin) => pin.kind === "research" && pin.entryId === selectedEntry.id) && (
                <details className={styles.sec}>
                  <summary className={styles.secK} style={{ cursor: "pointer" }}>
                    {t.researchFrom(
                      pins.filter(
                        (pin) => pin.kind === "research" && pin.entryId === selectedEntry.id,
                      ).length,
                    )}
                  </summary>
                  <div className={styles.secV}>{t.researchHint}</div>
                  <div className={styles.miniRow}>
                    {pins
                      .filter((pin) => pin.kind === "research" && pin.entryId === selectedEntry.id)
                      .map((pin) => (
                        <button
                          key={pin.patternId}
                          type="button"
                          className={styles.miniItem}
                          onClick={() => setSelection({ kind: "pin", id: pin.patternId })}
                          title={pin.title}
                        >
                          <span className={styles.miniTile}>
                            <PatternCanvas
                              code={pin.code}
                              title={pin.title}
                              className={styles.pinWell}
                            />
                          </span>
                          <span className={styles.miniCaption}>{pin.title}</span>
                        </button>
                      ))}
                  </div>
                </details>
              )}

              <section className={styles.sec}>
                <div className={styles.secK}>{t.secPrompt}</div>
                <pre className={styles.prompt}>{buildPrompt(selectedEntry)}</pre>
                <button
                  type="button"
                  className={styles.copyBtn}
                  data-done={copied}
                  onClick={() => void copyPrompt(selectedEntry)}
                >
                  {copied ? t.copiedPrompt : t.copyPrompt}
                </button>
              </section>
            </>
          ) : (
            <>
              <h2 className={styles.panelTitle}>{t.introTitle}</h2>
              <div className={styles.panelEn}>{t.introSub}</div>
              <div className={styles.howto}>
                {lang === "en" ? (
                  <p>
                    <b>Horizontal</b> runs order → chaos, <b>vertical</b> runs wire (trajectory) →
                    field (mist). Find the feeling you want, <b>click the point</b>, and you get a
                    complete generation prompt for that spot. Paste it into any AI, then paste the
                    returned code into Pattern Lab.
                  </p>
                ) : (
                  <p>
                    <b>가로축</b>은 질서→혼돈, <b>세로축</b>은 선(궤적)→장(안개). 원하는 느낌의
                    자리를 찾아 <b>점을 클릭</b>하면, 그 자리를 탐사하는 완성된 영어 생성
                    프롬프트가 나온다. 복사해서 아무 AI에나 붙여넣고, 결과 코드를 Pattern Lab에
                    PASTE.
                  </p>
                )}
                <hr className={styles.hr} />
                {(Object.keys(STATUSES) as AtlasStatusId[]).map((key) => (
                  <div key={key} className={styles.legendRow}>
                    <span className={styles.legendDot} data-status={key} />
                    {statusLabel(key)} — {statusLegend(key)}
                  </div>
                ))}
                <div className={styles.legendRow}>
                  <span className={styles.legendTile} />
                  {t.legendPin}
                </div>
                <hr className={styles.hr} />
                {lang === "en" ? (
                  <p>
                    Off-continent <b>lenses</b> (post-processing you can lay over any point):
                    schlieren (∇ render) · conformal warps (z², 1/z, log z) · depth weighting. One
                    extra line in the prompt.
                  </p>
                ) : (
                  <p>
                    대륙 밖 <b>렌즈</b>(어느 점에든 얹는 후처리): 슐리렌(∇ 렌더) · 등각
                    워프(z², 1/z, log z) · 깊이 가중. 프롬프트에 한 줄 추가하면 된다.
                  </p>
                )}
                <hr className={styles.hr} />
                {lang === "en" ? (
                  <p>
                    Every position is a <b>taste hypothesis</b>. Turn on [Edit layout], drag points
                    where they belong, then [Copy layout] to export — that is how the map grows.
                  </p>
                ) : (
                  <p>
                    점의 위치는 전부 <b>취향 가설</b>이다. [배치 편집]을 켜고 끌어서 고친 뒤
                    [배치 복사]로 내보내면 지도가 자란다.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ── the pin player: a pattern running with its own knobs under it ── */

function PinPlayer({ code, knobsLabel }: { code: string; knobsLabel: string }) {
  const setup = useMemo(() => knobSetupFromCode(code), [code]);
  const [values, setValues] = useState<number[]>(setup.values);
  const rotated = describeMatrixShape(matrixFromCode(code)) === "landscape";

  return (
    <>
      <div className={styles.panelCanvas}>
        <div className={styles.playerWell}>
          <div className={rotated ? commStyles.screenRotator : commStyles.screenUpright}>
            <SandboxPreview code={code} knobValues={values} knobRanges={setup.ranges} running />
          </div>
        </div>
      </div>

      <section className={styles.sec}>
        <div className={styles.secK}>{knobsLabel}</div>
        {setup.labels.map((label, index) => {
          const [min, max] = setup.ranges[index];
          const value = values[index] ?? (min + max) / 2;
          return (
            <div key={label + index} className={styles.knobRow}>
              <span className={styles.knobLabel}>{label}</span>
              <input
                type="range"
                className={styles.knobInput}
                min={min}
                max={max}
                step={(max - min) / 200 || 0.01}
                value={value}
                onChange={(ev) => {
                  const next = [...values];
                  next[index] = Number(ev.target.value);
                  setValues(next);
                }}
              />
              <span className={styles.knobVal}>{Number(value).toFixed(2)}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ── helpers ── */

/** The remembered reading language, as an external store: no effect, no
 *  hydration fight. Server always renders English. */
const langListeners = new Set<() => void>();

function subscribeLang(onChange: () => void) {
  langListeners.add(onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    langListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readLang(): Lang {
  return window.localStorage.getItem(LANG_KEY) === "ko" ? "ko" : "en";
}

function writeLang(next: Lang) {
  window.localStorage.setItem(LANG_KEY, next);
  for (const listener of langListeners) listener();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Keep the world covering the viewBox: no blank space slides into view. */
function clampView(next: { k: number; tx: number; ty: number }) {
  return {
    k: next.k,
    tx: clamp(next.tx, VB_W * (1 - next.k), 0),
    ty: clamp(next.ty, VB_H * (1 - next.k), 0),
  };
}

function toViewBox(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
}
