// ─────────────────────────────────────────────────────────────────────────────
// Shape checks on a submitted pattern header.
//
// Deliberately pure text in / verdict out — no filesystem, no compiler. The
// API runs this before queueing and the worker runs it again before compiling,
// so the mistakes that would otherwise surface as an unreadable wall of C++
// are caught in milliseconds and named in English.
//
// This file used to assemble whole firmware sources as well: write submitted
// headers into the registry's custom slots, hand the result to arduino-cli,
// get a flashable image back. That path is gone. Its one advantage over a
// module was that the rebuild came off the latest sources, so it doubled as a
// firmware update — and updating is its own flow now
// (patternflow.work/update), which leaves a 14-second whole-image build as a
// slow way to do what a 6 KB .pfm does in half a second.
// ─────────────────────────────────────────────────────────────────────────────

/** A pattern's C++ header, exactly as the author supplied it. */
export type CustomPatternInput = {
  /** Complete `.h` source. */
  code: string;
  /** Only used to make error messages nameable; not written to disk. */
  label?: string;
};

// A header's namespace is the handle everything else refers to it by, so it
// has to be found the same way the compiler would. Anonymous namespaces are
// rejected because there would be nothing to name.
const NAMESPACE_RE = /^[ \t]*namespace[ \t]+([A-Za-z_]\w*)[ \t]*\{/m;

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

  // The five symbols a pattern entry expands to. Missing any of them is a link
  // error at the very end of a build, which is the slowest possible way to
  // find out about it.
  const required = ["NAME", "KNOB_LABELS", "setup", "update", "draw"];
  const missing = required.filter((symbol) => !new RegExp(`\\b${symbol}\\b`).test(source));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Namespace \`${namespace}\` is missing: ${missing.join(", ")}. All five are required.`,
    };
  }

  return { ok: true, namespace };
}
