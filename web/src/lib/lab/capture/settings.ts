// ── Capture settings ─────────────────────────────────────────────────────────
// Output presets plus localStorage persistence, under the capture module's
// own key — the project format (serialize.ts) is untouched.

import type { MatrixSize } from "@/lib/patternMatrix";
import { clampScale, clampSide } from "./core";
import {
  CAPTURE_FPS,
  CAPTURE_ROTATIONS,
  CAPTURE_SCALES,
  CAPTURE_SECONDS_MAX,
  DEFAULT_CAPTURE_SETTINGS,
  type CaptureSettings,
} from "./types";

export const CAPTURE_SETTINGS_STORAGE = "patternflow_lab_capture_v1";

export type SizePreset = { id: string; label: string; width: number; height: number };

/**
 * Sizes worth a one-click pick. The matrix multiples keep the pattern's own
 * aspect; the rest are the places a pattern tends to end up.
 */
export function sizePresets(matrix: MatrixSize): SizePreset[] {
  const multiples = [4, 8, 16]
    .map((factor) => ({
      id: `x${factor}`,
      label: `Frame × ${factor} (${matrix.width * factor} × ${matrix.height * factor})`,
      width: matrix.width * factor,
      height: matrix.height * factor,
    }))
    .filter((preset) => clampScale(Number(preset.id.slice(1)), matrix) === Number(preset.id.slice(1)));
  return [
    ...multiples,
    { id: "card-us", label: "Business card 3.5 × 2 in @ 300 dpi (1050 × 600)", width: 1050, height: 600 },
    { id: "card-90x50", label: "Name card 90 × 50 mm @ 300 dpi (1063 × 591)", width: 1063, height: 591 },
    { id: "fhd", label: "Full HD (1920 × 1080)", width: 1920, height: 1080 },
    { id: "uhd", label: "4K UHD (3840 × 2160)", width: 3840, height: 2160 },
    { id: "square", label: "Square (1080 × 1080)", width: 1080, height: 1080 },
    { id: "story", label: "Vertical (1080 × 1920)", width: 1080, height: 1920 },
  ];
}

export function presetFor(settings: CaptureSettings, matrix: MatrixSize): SizePreset | null {
  return (
    sizePresets(matrix).find(
      (preset) => preset.width === settings.width && preset.height === settings.height,
    ) ?? null
  );
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function unit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

/** Coerce anything (stored JSON, a partial patch) into valid settings. */
export function normalizeCaptureSettings(input: unknown): CaptureSettings {
  const base = DEFAULT_CAPTURE_SETTINGS;
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const video = (raw.video && typeof raw.video === "object" ? raw.video : {}) as Record<string, unknown>;
  const seconds =
    typeof video.seconds === "number" && Number.isFinite(video.seconds)
      ? Math.max(1, Math.min(CAPTURE_SECONDS_MAX, Math.round(video.seconds * 10) / 10))
      : base.video.seconds;
  return {
    // "smooth" was a look until 2026-08; stored settings carrying it fall
    // back to auto here.
    style: pick(raw.style, ["auto", "native", "pixel", "led"] as const, base.style),
    width: clampSide(typeof raw.width === "number" ? raw.width : base.width),
    height: clampSide(typeof raw.height === "number" ? raw.height : base.height),
    scale: pick(raw.scale, CAPTURE_SCALES, base.scale),
    rotation: pick(raw.rotation, CAPTURE_ROTATIONS, base.rotation),
    backdrop: pick(raw.backdrop, ["black", "transparent", "color"] as const, base.backdrop),
    cutout: pick(raw.cutout, ["unpainted", "dark"] as const, base.cutout),
    backdropColor: hexColor(raw.backdropColor, base.backdropColor),
    ledDot: unit(raw.ledDot, base.ledDot),
    ledGlow: unit(raw.ledGlow, base.ledGlow),
    video: {
      fps: pick(video.fps, CAPTURE_FPS, base.video.fps),
      seconds,
      format: pick(video.format, ["mp4", "webm"] as const, base.video.format),
    },
  };
}

export function loadCaptureSettings(): CaptureSettings {
  if (typeof window === "undefined") return DEFAULT_CAPTURE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CAPTURE_SETTINGS_STORAGE);
    return raw ? normalizeCaptureSettings(JSON.parse(raw)) : DEFAULT_CAPTURE_SETTINGS;
  } catch {
    return DEFAULT_CAPTURE_SETTINGS;
  }
}

export function saveCaptureSettings(settings: CaptureSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAPTURE_SETTINGS_STORAGE, JSON.stringify(settings));
  } catch {
    // Quota / private mode — the stage still works, it just forgets.
  }
}
