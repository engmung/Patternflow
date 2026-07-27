// ─────────────────────────────────────────────────────────────────────────────
// Firmware source assembly.
//
// Turns "here are 1–3 pattern headers" into "here are the files a build needs",
// which is the step people currently do by hand in the Arduino IDE: drop a .h
// into a custom slot, then add a matching PATTERN_ENTRY line to the registry.
//
// Deliberately pure text in / text out — no filesystem, no compiler. The build
// worker writes what this returns into a scratch checkout and runs arduino-cli
// against it, so all of the logic that can be got wrong is testable without a
// toolchain.
// ─────────────────────────────────────────────────────────────────────────────

/** Firmware slots reserved for user patterns (custom1.h … custom3.h). */
export const MAX_CUSTOM_SLOTS = 3;

/** A pattern's C++ header, exactly as the author supplied it. */
export type CustomPatternInput = {
  /** Complete `.h` source. */
  code: string;
  /** Only used to make error messages nameable; not written to disk. */
  label?: string;
};

export type AssembledFile = { path: string; content: string };

export type AssembleResult =
  | { ok: true; files: AssembledFile[]; namespaces: string[] }
  | { ok: false; error: string };

// A header's namespace is the handle the registry refers to it by, so it has to
// be found the same way the compiler would. Anonymous namespaces are rejected
// because there would be nothing to name in PATTERN_ENTRY.
const NAMESPACE_RE = /^[ \t]*namespace[ \t]+([A-Za-z_]\w*)[ \t]*\{/m;

// The one region of pattern_registry.h this module owns, delimited by explicit
// markers. Everything else in that file — presets, the PatternEntry struct,
// buildPatternList, the loadable-module half — is left exactly as it is, so the
// generated registry stays diffable against the repo's.
//
// Anchoring on markers rather than on the shape of the C++ is deliberate: this
// used to match `#include "customN.h"` lines and the `customPatterns[]` array
// directly, which meant any edit to those declarations silently broke builds.
// The region is empty in the repo (patterns ship as loadable .pfm modules now),
// so there is no longer C++ there to match against at all.
const CUSTOM_SLOTS_RE =
  /^[ \t]*\/\/[ \t]*PF_CUSTOM_SLOTS_BEGIN[ \t]*\r?\n[\s\S]*?^[ \t]*\/\/[ \t]*PF_CUSTOM_SLOTS_END[ \t]*$/m;

/** Strip comments and string literals so scans can't trip over them. */
function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** The namespace a header declares, or null when it declares none usable. */
export function extractNamespace(code: string): string | null {
  return stripCommentsAndStrings(code).match(NAMESPACE_RE)?.[1] ?? null;
}

/**
 * Namespaces the registry already uses for presets. A custom pattern reusing
 * one of these compiles into a redefinition of NAME/setup/draw rather than a
 * missing-symbol error, so it is worth catching before the toolchain does.
 */
export function listRegistryNamespaces(registry: string): string[] {
  const found = new Set<string>();
  const source = stripCommentsAndStrings(registry);
  for (const match of source.matchAll(/PATTERN_ENTRY\(\s*([A-Za-z_]\w*)\s*\)/g)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Shape check on a submitted header. This cannot tell whether the pattern
 * compiles — only the compiler knows that — but it catches the mistakes that
 * would otherwise surface as an unreadable wall of C++ errors ten seconds
 * later: a JavaScript file pasted by accident, a missing namespace, a
 * half-copied snippet.
 */
export function validateCustomPattern(code: string): { ok: true; namespace: string } | { ok: false; error: string } {
  const source = stripCommentsAndStrings(code);

  if (!/^\s*#pragma\s+once\b/m.test(source)) {
    return { ok: false, error: "Header must start with `#pragma once`." };
  }

  const namespace = extractNamespace(code);
  if (!namespace) {
    return {
      ok: false,
      error: "No named namespace found — a pattern needs `namespace YourPattern { … }`.",
    };
  }

  // The five symbols PATTERN_ENTRY expands to. Missing any of them is a link
  // error at the very end of a build, which is the slowest possible way to find
  // out about it.
  const required = ["NAME", "KNOB_LABELS", "setup", "update", "draw"];
  const missing = required.filter((symbol) => !new RegExp(`\\b${symbol}\\b`).test(source));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Namespace \`${namespace}\` is missing: ${missing.join(", ")}. PATTERN_ENTRY needs all five.`,
    };
  }

  return { ok: true, namespace };
}

/** Fill the registry's reserved custom-slot region for `namespaces`. */
export function buildRegistry(originalRegistry: string, namespaces: string[]): string {
  if (!CUSTOM_SLOTS_RE.test(originalRegistry)) {
    throw new Error(
      "pattern_registry.h has no PF_CUSTOM_SLOTS_BEGIN/END markers to fill. " +
        "The build service writes submitted patterns into that region; see the " +
        "CUSTOM SLOTS note in pattern_registry.h.",
    );
  }

  const includes = namespaces.map((_, index) => `#include "custom${index + 1}.h"`);
  const entries = namespaces.map((ns) => `  PATTERN_ENTRY(${ns}),`);

  // PF_CUSTOM_SLOT_COUNT gates the loop in buildPatternList(), so it has to be
  // defined whether or not there are any patterns to add.
  const region = [
    "// PF_CUSTOM_SLOTS_BEGIN",
    ...includes,
    `#define PF_CUSTOM_SLOT_COUNT ${namespaces.length}`,
    ...(namespaces.length > 0
      ? [`PatternEntry customPatterns[] = {`, ...entries, `};`]
      : []),
    "// PF_CUSTOM_SLOTS_END",
  ].join("\n");

  return originalRegistry.replace(CUSTOM_SLOTS_RE, region);
}

/**
 * Full assembly: validate every header, then return the files a build needs.
 *
 * `originalRegistry` is the repo's own pattern_registry.h, so the preset half
 * of the firmware is carried through untouched and only the custom slots differ
 * from a stock build.
 */
export function assembleFirmwareSource(
  patterns: CustomPatternInput[],
  originalRegistry: string,
): AssembleResult {
  if (patterns.length === 0) {
    return { ok: false, error: "Select at least one pattern to build." };
  }
  if (patterns.length > MAX_CUSTOM_SLOTS) {
    return {
      ok: false,
      error: `The firmware has ${MAX_CUSTOM_SLOTS} custom slots; ${patterns.length} patterns were given.`,
    };
  }

  const reserved = new Set(listRegistryNamespaces(originalRegistry));
  // Preset namespaces come from the registry, but anything in the custom-slot
  // region is about to be overwritten — it must not count as taken. The region
  // is empty in the repo; it is not empty in the worker's warm checkout, which
  // still holds whatever the previous build put there.
  const replaced = originalRegistry.match(CUSTOM_SLOTS_RE)?.[0] ?? "";
  for (const ns of listRegistryNamespaces(replaced)) reserved.delete(ns);

  const namespaces: string[] = [];
  const files: AssembledFile[] = [];

  for (const [index, pattern] of patterns.entries()) {
    const name = pattern.label ?? `pattern ${index + 1}`;
    const result = validateCustomPattern(pattern.code);
    if (!result.ok) {
      return { ok: false, error: `${name}: ${result.error}` };
    }

    if (reserved.has(result.namespace)) {
      return {
        ok: false,
        error: `${name}: namespace \`${result.namespace}\` is already used by a bundled pattern — rename it.`,
      };
    }
    if (namespaces.includes(result.namespace)) {
      return {
        ok: false,
        error: `${name}: two selected patterns both use namespace \`${result.namespace}\` — rename one.`,
      };
    }

    reserved.add(result.namespace);
    namespaces.push(result.namespace);
    files.push({ path: `custom${index + 1}.h`, content: pattern.code });
  }

  files.push({ path: "pattern_registry.h", content: buildRegistry(originalRegistry, namespaces) });
  return { ok: true, files, namespaces };
}
