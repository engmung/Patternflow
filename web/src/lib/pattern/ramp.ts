// ── @ramp annotation ─────────────────────────────────────────────────────────
// Carries a color ramp (and the recolor flag) inside pattern code as one
// comment line, so ramps survive every code-string hop: community publish →
// DB → sandbox render → "Open in Pattern Lab" → fork re-publish.
//
//   // @ramp linear wrap recolor 0:#081840 0.55:#ff4d00 1:#ffe89a
//
// Format: `@ramp <mode> [wrap] [recolor] <pos>:<#rrggbb> ...` — mode is one of
// the harness RampModes; stops are position:hex pairs sorted or not (parser
// tolerates any order). Parsed by this module (lab, community pages) AND by
// public/pattern-sandbox.html (plain-JS port) — keep the two in sync.

import { RAMP_MODES, type RampMode } from "@/lib/pattern/harness";

export { RAMP_MODES };
export type RampAnnotationMode = RampMode;

export type RampAnnotation = {
  stops: { position: number; color: string }[];
  mode: RampAnnotationMode;
  wrap: boolean;
  recolor: boolean;
};

export const MAX_ANNOTATION_STOPS = 8;

const RAMP_LINE_RE = /^[ \t]*\/\/[ \t]*@ramp[ \t]+(.+)$/m;
const STOP_RE = /^(\d*\.?\d+):(#[0-9a-fA-F]{6})$/;

export function parseRampAnnotation(code: string): RampAnnotation | null {
  const match = code.match(RAMP_LINE_RE);
  if (!match) return null;

  const tokens = match[1].trim().split(/\s+/);
  if (tokens.length === 0) return null;

  const mode = RAMP_MODES.includes(tokens[0] as RampAnnotationMode)
    ? (tokens[0] as RampAnnotationMode)
    : null;
  if (!mode) return null;

  let wrap = false;
  let recolor = false;
  const stops: RampAnnotation["stops"] = [];
  for (const token of tokens.slice(1)) {
    if (token === "wrap") {
      wrap = true;
      continue;
    }
    if (token === "recolor") {
      recolor = true;
      continue;
    }
    const stop = token.match(STOP_RE);
    if (!stop || stops.length >= MAX_ANNOTATION_STOPS) continue;
    const position = Number(stop[1]);
    if (!Number.isFinite(position)) continue;
    stops.push({
      position: Math.max(0, Math.min(1, position)),
      color: stop[2].toLowerCase(),
    });
  }

  if (stops.length === 0) return null;
  return { stops, mode, wrap, recolor };
}

export function buildRampAnnotationLine(annotation: RampAnnotation): string {
  const flags = [annotation.wrap ? "wrap" : null, annotation.recolor ? "recolor" : null]
    .filter(Boolean)
    .join(" ");
  const stops = annotation.stops
    .slice(0, MAX_ANNOTATION_STOPS)
    .map((stop) => `${Math.round(stop.position * 1000) / 1000}:${stop.color.toLowerCase()}`)
    .join(" ");
  return `// @ramp ${annotation.mode}${flags ? ` ${flags}` : ""} ${stops}`;
}

export function stripRampAnnotation(code: string): string {
  return code.replace(RAMP_LINE_RE, "").replace(/^\n/, "");
}

/** Replace any existing @ramp line with a fresh one at the top of the code. */
export function withRampAnnotation(code: string, annotation: RampAnnotation): string {
  return `${buildRampAnnotationLine(annotation)}\n${stripRampAnnotation(code)}`;
}

/**
 * Blank the contents of comments and string literals, keeping length and
 * line structure. Detection-grade lexing only: regex literals aren't
 * tracked (an escaped-dot regex can't match the detector anyway), and a
 * template's ${…} is blanked along with the rest of it.
 */
function blankCommentsAndStrings(code: string): string {
  const out = code.split("");
  type Mode = "code" | "line" | "block" | "single" | "double" | "template";
  let mode: Mode = "code";
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    if (mode === "code") {
      if (ch === "/" && next === "/") mode = "line";
      else if (ch === "/" && next === "*") mode = "block";
      else if (ch === "'") mode = "single";
      else if (ch === '"') mode = "double";
      else if (ch === "`") mode = "template";
      continue;
    }
    if (mode === "line") {
      if (ch === "\n") mode = "code";
      else out[i] = " ";
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i++;
      } else if (ch !== "\n") {
        out[i] = " ";
      }
      continue;
    }
    // Inside a string or template: honour escapes, blank everything else.
    if (ch === "\\") {
      out[i] = " ";
      if (i + 1 < code.length && code[i + 1] !== "\n") out[i + 1] = " ";
      i++;
      continue;
    }
    if (
      (mode === "single" && (ch === "'" || ch === "\n")) ||
      (mode === "double" && (ch === '"' || ch === "\n")) ||
      (mode === "template" && ch === "`")
    ) {
      mode = "code";
      continue;
    }
    if (ch !== "\n") out[i] = " ";
  }
  return out.join("");
}

/**
 * Value-field patterns have no color of their own — the ramp IS their color.
 * Comments and strings are ignored: AI-returned code loves to quote the API
 * ("// display.setValue(x, y, v) …"), and matching that used to classify a
 * plain setPixel pattern as a value field, which made the C++ conversion
 * prompt force its colors through the ramp LUT — baked pixel-art colors
 * came out repainted.
 */
export function codeUsesValueField(code: string): boolean {
  return /display\s*\.\s*setValue\s*\(/.test(blankCommentsAndStrings(code));
}
