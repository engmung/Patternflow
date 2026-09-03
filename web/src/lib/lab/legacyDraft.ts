// ── Pattern Lab draft autosave ───────────────────────────────────────────────
// The lab is a long-session tool: people tune a pattern for an hour, edit the
// ramp, generate a gallery. Closing the tab (or a crash) used to throw all of
// that away, because only the ramp and the Experiment patch were persisted.
//
// This module stores the rest of the working state in localStorage so reopening
// the page lands back where the user left off. Two keys on purpose:
//
//   DRAFT_STORAGE    small, always worth keeping (code, knobs, ranges, ...)
//   GALLERY_STORAGE  potentially hundreds of KB of generated patterns
//
// A quota failure while writing the (large) gallery must never take the (small)
// draft down with it, hence the split. Every read is defensive: a draft written
// by an older build, or hand-edited, must degrade to "no draft" rather than
// crash the lab on boot.

import { COLOR_MODES, THINKING_LEVELS } from "@/lib/ai/settings";
import type { ColorMode, PatternVariant, ThinkingLevelKey } from "@/lib/ai/settings";
import { isValidMatrix, type MatrixSize } from "@/lib/pattern/matrix";

import { LAB_STORAGE, readJson, removeStorage as remove, writeJson } from "./persist";

export const DRAFT_STORAGE = LAB_STORAGE.legacyDraft;
export const GALLERY_STORAGE = LAB_STORAGE.legacyGallery;

// Guard rails so one runaway value can't blow the whole quota.
const MAX_CODE_CHARS = 200_000;
const MAX_GALLERY_ITEMS = 48;

export type DraftGenSettings = {
  count: number;
  thinking: ThinkingLevelKey;
  refs: number;
  colorMode: ColorMode;
};

export type LabDraft = {
  savedAt: number;
  code: string;
  knobs: number[];
  ranges: [number, number][];
  knobLabels: string[];
  /** Not part of the ramp payload, but the user's ramp decision all the same. */
  recolor: boolean;
  /**
   * Fallback only. The code's own `// @matrix` line is authoritative — this
   * covers drafts whose code predates the annotation.
   */
  matrix: MatrixSize;
  editorView: "code" | "gallery";
  forkOf: { id: string; title: string } | null;
  gen: DraftGenSettings;
};

export type DraftGalleryItem = PatternVariant & { id: string; pinned?: boolean };

function numberArray(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const result = value.map(Number);
  return result.every(Number.isFinite) ? result : null;
}

function rangeArray(value: unknown, length: number): [number, number][] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const result: [number, number][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const min = Number(entry[0]);
    const max = Number(entry[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    result.push([min, max]);
  }
  return result;
}

function stringArray(value: unknown, length: number): string[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  if (!value.every((entry) => typeof entry === "string")) return null;
  return (value as string[]).map((entry) => entry.slice(0, 40));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// Accepts the current `{width, height}` shape and the older `resPreset: "128x64"`
// string, so a draft written before the frame rework still restores.
function readMatrix(raw: Record<string, unknown>): MatrixSize | undefined {
  const candidate = raw.matrix as Partial<MatrixSize> | undefined;
  if (isValidMatrix(candidate)) {
    return { width: Number(candidate!.width), height: Number(candidate!.height) };
  }
  if (typeof raw.resPreset === "string") {
    const [w, h] = raw.resPreset.split("x");
    const legacy = { width: Number(w), height: Number(h) };
    if (isValidMatrix(legacy)) return legacy;
  }
  return undefined;
}

export function loadDraft(knobCount: number): Partial<LabDraft> | null {
  const parsed = readJson(DRAFT_STORAGE);
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;

  const code = typeof raw.code === "string" ? raw.code : null;
  if (code === null || code.length > MAX_CODE_CHARS) return null;

  const forkOf =
    raw.forkOf && typeof raw.forkOf === "object"
      ? (() => {
          const entry = raw.forkOf as Record<string, unknown>;
          return typeof entry.id === "string" && typeof entry.title === "string"
            ? { id: entry.id, title: entry.title.slice(0, 120) }
            : null;
        })()
      : null;

  const gen = (raw.gen ?? {}) as Record<string, unknown>;
  const genCount = Number(gen.count);
  const genRefs = Number(gen.refs);

  // Each field falls back independently: a draft missing (or corrupting) one
  // value still restores everything else.
  return {
    savedAt: Number(raw.savedAt) || 0,
    code,
    knobs: numberArray(raw.knobs, knobCount) ?? undefined,
    ranges: rangeArray(raw.ranges, knobCount) ?? undefined,
    knobLabels: stringArray(raw.knobLabels, knobCount) ?? undefined,
    recolor: typeof raw.recolor === "boolean" ? raw.recolor : undefined,
    matrix: readMatrix(raw),
    editorView: oneOf(raw.editorView, ["code", "gallery"] as const, "code"),
    forkOf,
    gen: {
      count: Number.isFinite(genCount) ? genCount : 5,
      thinking: oneOf<ThinkingLevelKey>(gen.thinking, THINKING_LEVELS, "LOW"),
      refs: Number.isFinite(genRefs) ? genRefs : 6,
      colorMode: oneOf<ColorMode>(gen.colorMode, COLOR_MODES, "vfield"),
    },
  };
}

export function saveDraft(draft: Omit<LabDraft, "savedAt">): boolean {
  if (draft.code.length > MAX_CODE_CHARS) return false;
  return writeJson(DRAFT_STORAGE, { ...draft, savedAt: Date.now() });
}

export function clearDraft() {
  remove(DRAFT_STORAGE);
  remove(GALLERY_STORAGE);
}

export function loadGallery(): DraftGalleryItem[] {
  const parsed = readJson(GALLERY_STORAGE);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is DraftGalleryItem =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as DraftGalleryItem).id === "string" &&
        typeof (item as DraftGalleryItem).code === "string" &&
        typeof (item as DraftGalleryItem).name === "string",
    )
    .slice(0, MAX_GALLERY_ITEMS)
    .map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      knobNotes: typeof item.knobNotes === "string" ? item.knobNotes : undefined,
      pinned: Boolean(item.pinned),
    }));
}

/**
 * Best-effort gallery persist. Generated patterns can add up to hundreds of KB,
 * so on a quota failure we retry with the pinned items only (the ones the user
 * explicitly kept) before giving up — a partial save beats none.
 */
export function saveGallery(items: DraftGalleryItem[]): boolean {
  const trimmed = items.slice(0, MAX_GALLERY_ITEMS);
  if (writeJson(GALLERY_STORAGE, trimmed)) return true;
  const pinned = trimmed.filter((item) => item.pinned);
  if (pinned.length > 0 && writeJson(GALLERY_STORAGE, pinned)) return true;
  remove(GALLERY_STORAGE);
  return false;
}
