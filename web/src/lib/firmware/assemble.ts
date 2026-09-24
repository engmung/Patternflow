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

/** Strip comments (block and line) but keep string literals. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Strip comments and string literals so scans can't trip over them. */
function stripCommentsAndStrings(code: string): string {
  return stripComments(code).replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** The namespace a header declares, or null when it declares none usable. */
export function extractNamespace(code: string): string | null {
  return stripCommentsAndStrings(code).match(NAMESPACE_RE)?.[1] ?? null;
}

// port_preset.py drops a line from the ported source when, after trimming, it
// starts with "#include" (or "#pragma once"). Everything else it keeps
// verbatim — so an include-like directive it does NOT catch reaches the
// compiler and can pull in an arbitrary file. Mirror its rule exactly: a
// normal `#include "…"` is fine here because the porter deletes it, but the
// spellings it misses are not.
function portPresetStrips(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("#include") || trimmed.startsWith("#pragma once");
}

// An include-like preprocessor directive: `#include`, `#include_next`,
// `#embed`, `#import`, with any spacing between `#` and the keyword. The ones
// port_preset.py leaves in (`# include "x"`, `#embed`, `#import`, …) would
// otherwise read a file the compiler can reach; a submitted pattern never
// needs any of them (it gets pf_module.h and the shared math headers).
const INCLUDE_DIRECTIVE_RE = /^\s*#\s*(?:include|include_next|embed|import)\b/;

// Inline assembly. `.incbin` embeds a file's raw bytes into the object (the
// Xtensa toolchain honours it), and asm() can reach the same places a
// directive can; a pattern has no legitimate use for either. Tested against
// comment-stripped source — but NOT string-stripped, because the `.incbin`
// exploit hides inside a `section("… .incbin \"file\" …")` attribute STRING,
// so removing string contents would remove the payload with them. A comment
// that merely names "asm" stays inert.
const INLINE_ASM_RE = /\basm\s*(?:volatile\s*)?\(|__asm__|__asm\b|\.incbin\b/;

// These two patterns are a first filter, NOT a boundary. They read spellings,
// and the compiler reads meaning: a backslash-newline between `#` and
// `include`, a comment inside the directive, the `%:` digraph for `#`, a macro
// that expands to `asm`, or `.incbin` split across two string literals all get
// past them (each was verified against the real toolchain on 2026-09-24).
// What bounds a header is the compiler sandbox on the build host — on the Pi
// the compiler sees only the toolchain, system directories and the public
// firmware sources (docs/SERVICES.md). Do not describe this check as stopping
// file access, and do not run a worker for other people's headers without
// that sandbox.

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

  // A header may not reach other files or drop into assembly. This refuses the
  // plain spellings that would survive the porter — not every spelling (see
  // the note above INCLUDE_DIRECTIVE_RE: the sandbox is the boundary). No
  // community pattern needs any of them; a plain `#include` is fine because
  // the porter deletes it. Checked before the compiler ever runs (this
  // function guards both POST /builds and the worker), and the verdict is
  // deterministic — a header that trips it fails identically every time, so it
  // is cached, not recompiled on each retry.
  for (const line of code.split(/\r?\n/)) {
    if (INCLUDE_DIRECTIVE_RE.test(line) && !portPresetStrips(line)) {
      return { ok: false, error: "Pattern headers may not include other files or use inline assembly." };
    }
  }
  if (INLINE_ASM_RE.test(stripComments(code))) {
    return { ok: false, error: "Pattern headers may not include other files or use inline assembly." };
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
