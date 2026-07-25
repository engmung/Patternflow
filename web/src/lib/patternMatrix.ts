// ── @matrix annotation ───────────────────────────────────────────────────────
// Carries the pattern's LOGICAL frame — the pixel grid it was composed for —
// inside the code as one comment line, so it survives every code-string hop:
// generation → editor → community publish → DB → sandbox render → "Open in
// Pattern Lab" → fork → C++ export.
//
//   // @matrix 128x64
//
// Three separate facts used to be tangled into one "orientation" control, and
// AI-generated patterns came out wrong because of it. They are now layered:
//
//   logical frame   what the pattern draws into, and what a viewer sees.
//                   THIS annotation. Any W×H — 128×64, 64×128, 64×64, …
//   physical panel  the actual LED matrix (firmware PANEL_RES_W/H).
//   mounting        how the panel is turned relative to the viewer.
//
// The last one is not stored anywhere: it is *derived* from the first two. A
// 64×128 pattern on a 128×64 panel is the panel turned on its side, so the
// firmware rotates; matching dimensions draw straight through, exactly as
// before; anything else is letterboxed. That keeps every existing 128×64
// pattern pixel-identical while making other frames possible.
//
// Parsed by this module (lab, community pages) AND by
// public/pattern-sandbox.html (plain-JS port) — keep the two in sync.

export type MatrixSize = { width: number; height: number };

/** The stock Patternflow panel. Used whenever a pattern carries no @matrix. */
export const DEFAULT_MATRIX: MatrixSize = { width: 128, height: 64 };

// Small enough to stay honest about being an LED matrix, large enough for the
// panels people actually chain together.
export const MATRIX_MIN = 8;
export const MATRIX_MAX = 512;

const MATRIX_LINE_RE = /^[ \t]*\/\/[ \t]*@matrix[ \t]+(\d{1,4})[ \t]*[x×*][ \t]*(\d{1,4})[ \t]*$/m;

function clampDimension(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MATRIX_MIN || rounded > MATRIX_MAX) return null;
  return rounded;
}

/**
 * For direct entry: pull a typed number into the supported range rather than
 * rejecting it, so typing "4" settles on the minimum instead of silently doing
 * nothing. Only a non-number fails.
 */
export function clampMatrixDimension(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(MATRIX_MIN, Math.min(MATRIX_MAX, Math.round(value)));
}

/**
 * Pixels per frame beyond which the JS preview starts to struggle — four times
 * the stock panel. Not a limit, just the point worth warning about.
 */
export const MATRIX_HEAVY_PIXELS = 128 * 64 * 4;

export function isValidMatrix(size: Partial<MatrixSize> | null | undefined): boolean {
  if (!size) return false;
  return clampDimension(Number(size.width)) !== null && clampDimension(Number(size.height)) !== null;
}

export function parseMatrixAnnotation(code: string): MatrixSize | null {
  const match = code.match(MATRIX_LINE_RE);
  if (!match) return null;
  const width = clampDimension(Number(match[1]));
  const height = clampDimension(Number(match[2]));
  if (width === null || height === null) return null;
  return { width, height };
}

/** The frame a pattern declares, falling back to the legacy 128×64 default. */
export function matrixFromCode(code: string): MatrixSize {
  return parseMatrixAnnotation(code) ?? DEFAULT_MATRIX;
}

export function buildMatrixAnnotationLine(size: MatrixSize): string {
  return `// @matrix ${size.width}x${size.height}`;
}

export function stripMatrixAnnotation(code: string): string {
  return code.replace(MATRIX_LINE_RE, "").replace(/^\n/, "");
}

/** Replace any existing @matrix line with a fresh one at the top of the code. */
export function withMatrixAnnotation(code: string, size: MatrixSize): string {
  return `${buildMatrixAnnotationLine(size)}\n${stripMatrixAnnotation(code)}`;
}

/** The raw annotation line, for change detection (same trick as @knobs). */
export function matchMatrixAnnotation(code: string): string | null {
  return code.match(MATRIX_LINE_RE)?.[0] ?? null;
}

export function matrixesEqual(a: MatrixSize, b: MatrixSize): boolean {
  return a.width === b.width && a.height === b.height;
}

export function formatMatrix(size: MatrixSize): string {
  return `${size.width}×${size.height}`;
}

export function describeMatrixShape(size: MatrixSize): "landscape" | "portrait" | "square" {
  if (size.width > size.height) return "landscape";
  if (size.height > size.width) return "portrait";
  return "square";
}

/**
 * How a logical frame lands on a physical panel. The firmware does the same
 * three-way decision in core_canvas.h — keep them in sync.
 */
export type MatrixFit = "direct" | "rotate" | "letterbox";

export function matrixFit(logical: MatrixSize, panel: MatrixSize): MatrixFit {
  if (matrixesEqual(logical, panel)) return "direct";
  if (logical.width === panel.height && logical.height === panel.width) return "rotate";
  return "letterbox";
}
