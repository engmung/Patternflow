import { zipSync } from "fflate";
import { communityPatternUrl } from "../license";
import type { PatternSource } from "./moduleCache";

// ─────────────────────────────────────────────────────────────────────────────
// Turning cached modules into the files a board installs.
//
// Everything here runs in the web process on every download, out of rows the
// worker baked (moduleCache.ts) — no compiler, no queue, no filesystem. It is
// also where attribution is decided: the sidecar the device reads is rebuilt
// from the DATABASE row each time, never trusted from the compile, because the
// compile only knew what a `// Author:` comment in the header said (usually
// nothing, so "unknown"), and a sidecar is what travels with the module to
// somebody else's board.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed timestamp for every archive entry, same reasoning as make_pack.py and
 * decoratePackWithPerformance: identical inputs must give identical bytes, so
 * a download is reproducible and a cache in front of it never sees a false
 * change.
 */
export const PACK_MTIME = new Date("2026-01-01T00:00:00Z");

/**
 * The longest module name a board keeps. The upload handler copies the
 * filename's stem into a MODULE_NAME_BYTES (40) buffer, NUL included —
 * `slugFromFilename` in firmware/patternflow/src/core_patterns_http.h — so a
 * longer stem is silently cut on arrival. Cutting it here instead means the
 * names in catalog.txt are the names the board ends up with.
 */
export const DEVICE_SLUG_MAX = 39;

/**
 * File stems a pack must not use, lower case. The board's /patterns page
 * drops `performance.json` by name (and `*.perf.json`, which no slug can end
 * in — port_preset.py turns every "." into "_").
 */
export const RESERVED_STEMS: readonly string[] = ["performance"];

export function deviceSlug(slug: string): string {
  // port_preset.py only ever emits [a-z0-9_]; the filter is for the fallback.
  const clean = slug.replace(/[^A-Za-z0-9_-]/g, "").slice(0, DEVICE_SLUG_MAX);
  return clean || "pattern";
}

/**
 * JSON exactly as Python's `json.dumps(value, indent=2)` writes it — which is
 * what build_module.py produces and what every sidecar on every board looks
 * like. The one real difference from JSON.stringify is ensure_ascii: Python
 * writes every character outside printable ASCII as \uXXXX (surrogate pairs
 * for astral ones, DEL included), and the device's sidecar reader is a
 * substring scan that does not decode JSON — so a name must arrive in the
 * same spelling whichever path built it.
 *
 * Only characters U+007F and up are rewritten: JSON.stringify already
 * escapes the control characters, and none of these can appear outside a
 * string, so structural whitespace is never touched.
 */
export function pythonJsonDumps(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * build_module.py's sidecar minus what only made sense on the worker:
 * "source" is a temp path with the job id in it, "opt" a compiler flag. What
 * the cache stores. Unparseable input becomes an empty object rather than an
 * exception — the sidecar is metadata, and composeSidecar rebuilds the parts
 * that matter.
 */
export function sanitizeSidecar(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const object =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  delete object.source;
  delete object.opt;
  return `${pythonJsonDumps(object)}\n`;
}

/** Who a downloaded module credits. For a port, the porter too. */
export function authorLine(source: Pick<PatternSource, "authorHandle" | "header">): string {
  const author = source.authorHandle ?? "unknown";
  if (source.header?.source === "port") {
    return source.header.porterHandle
      ? `${author} (firmware port by ${source.header.porterHandle})`
      : `${author} (community firmware port)`;
  }
  return author;
}

/**
 * The sidecar a board receives: the cached one with attribution written from
 * the database. "name" goes FIRST on purpose — the device takes the first
 * `"name"` token it finds (readSidecar in pattern_registry.h), so nothing may
 * come before it. `slug` is the file stem this module will actually have, which
 * differs from the cached one when a pack had to rename a duplicate.
 */
export function composeSidecar(
  cachedSidecar: string | null,
  options: {
    name: string | null;
    slug: string;
    source: Pick<PatternSource, "id" | "license" | "authorHandle" | "header">;
  },
): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(cachedSidecar ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value;
  } catch {
    // An unreadable cached sidecar still leaves a usable one below.
  }
  const name =
    typeof parsed.name === "string" && parsed.name.length > 0
      ? parsed.name
      : options.name ?? options.slug;

  const out: Record<string, unknown> = { name };
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "name" || key === "source" || key === "opt") continue;
    out[key] = value;
  }
  out.author = authorLine(options.source);
  out.license = options.source.license;
  out.url = communityPatternUrl(options.source.id);
  out.slug = options.slug;
  out.module = `${options.slug}.pfm`;
  return `${pythonJsonDumps(out)}\n`;
}

/**
 * Unique file stems for a pack, in slot order. The first module keeps its
 * name; a later one that would land on the same file gets `_2`, `_3`, … —
 * shortened so the suffix survives the board's 39-character cut.
 *
 * Renaming rather than dropping is safe because the board knows a module by
 * its FILE and nothing else (firmware read-only, checked 2026-09-24):
 * scanModules() lists /patterns/*.pfm by filename, readSidecar() finds the
 * sidecar by swapping the extension, applyCatalogOrder() matches catalog.txt
 * lines against the filename stem, pattern persistence stores that stem
 * (slugFromModulePath), and the loader loads a path into a single active slot,
 * so two modules with the same namespace or NAME never coexist in memory. The
 * one thing a duplicate still shares is its display name, and a lookup by
 * display name (findPatternByName — MQTT, show cues) picks the first; the
 * second is still reachable by position and by its own stem, which is more
 * than dropping it would leave. Names that differ only in case are treated as
 * the same file — FAT does.
 *
 * Some stems are never handed out at all (RESERVED_STEMS): a pattern NAMEd
 * "Performance" becomes `performance_2`, because the board's /patterns page
 * throws `performance.json` away as a show's editable source (expandFiles in
 * firmware/patternflow/console/patterns.html) — the module would arrive
 * without its sidecar, listed under its stem and read as delta-only.
 */
export function assignPackSlugs(slugs: string[]): string[] {
  const taken = new Set<string>(RESERVED_STEMS);
  const out: string[] = [];
  for (const raw of slugs) {
    const base = deviceSlug(raw);
    let chosen = base;
    for (let n = 2; taken.has(chosen.toLowerCase()); n++) {
      const suffix = `_${n}`;
      chosen = `${base.slice(0, DEVICE_SLUG_MAX - suffix.length)}${suffix}`;
    }
    taken.add(chosen.toLowerCase());
    out.push(chosen);
  }
  return out;
}

/**
 * The running order in the format pattern_registry.h reads: '#' lines are
 * comments, one module stem per line, listed modules first. Same text the
 * worker has always written for a send, so a pack from either path installs
 * identically.
 */
export function catalogText(slugs: string[]): string {
  return (
    "# Patternflow running order — one module slug per line.\n" +
    "# Written by the deck export; the device reads it at boot.\n" +
    slugs.join("\n") +
    "\n"
  );
}

/** Deterministic archive bytes (see PACK_MTIME). */
export function zipFiles(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6, mtime: PACK_MTIME });
}

// ── HTTP shapes shared by the pattern and deck zip routes ────────────────────

export const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Disposition, Retry-After",
};

export function publicOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_CORS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * A person opened the link — a browser navigation says so in Accept. The
 * device's /patterns page and our own status polls use fetch(), whose default
 * Accept is star-slash-star, so they keep getting JSON.
 */
export function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/**
 * 202 while the first compile runs. JSON for code (the device page polls it
 * forty times, two seconds apart); for a person who opened the link, a page
 * that refreshes itself — and when the file is ready the refresh turns into
 * the download, leaving this page behind.
 *
 * Except for `?list=1` and `?file=`, which only v3.2–3.3 consoles send (a
 * v3.4+ board fetches the bare /zip address and polls the 202 itself). Those
 * consoles treat any 2xx as the listing, find no `files` in a 202 and give
 * up for good; a 503 with Retry-After at least says "not yet" instead of
 * handing them an answer they misread as an empty download.
 */
export function buildingResponse(request: Request, what: "pattern" | "pack"): Response {
  const headers = {
    "Retry-After": "2",
    "Cache-Control": "no-store",
  };
  const query = new URL(request.url).searchParams;
  if (query.get("list") === "1" || query.has("file")) {
    return Response.json(
      {
        error: `The ${what} is still being compiled — try again in a few seconds.`,
        state: "building",
        retryAfterMs: 2000,
      },
      { status: 503, headers },
    );
  }
  if (wantsHtml(request)) {
    const noun = what === "pack" ? "pack" : "pattern";
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="2">
<title>Preparing the ${noun}…</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 0 16px;
         background: #0b0b0c; color: #e6e6e6; font: 15px/1.5 system-ui, -apple-system, sans-serif; }
  p { max-width: 32rem; margin: 0; } small { color: #8a8a8a; }
</style>
</head>
<body>
<p>Preparing the ${noun}… this page refreshes itself.<br>
<small>The first download compiles it, usually a few seconds. The file downloads on its own when it is ready.</small></p>
</body>
</html>
`;
    return new Response(html, {
      status: 202,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return Response.json({ status: "building", retryAfterMs: 2000 }, { status: 202, headers });
}

/**
 * The three ways a zip route hands over files: the archive, `?list=1` (names,
 * JSON) and `?file=<name>` (one member) — the last two for v3.2–3.3 consoles,
 * whose /patterns?src= fetched a listing and then each file instead of a zip.
 * Lookup is an exact match on names this code built; nothing touches a disk.
 */
export function filesResponse(
  request: Request,
  files: Record<string, Uint8Array>,
  filename: string,
): Response {
  const query = new URL(request.url).searchParams;
  const wanted = query.get("file");
  // The address is stable and the contents are not (a header gets fixed, a
  // deck gets reordered), so everything here is revalidated, never kept.
  const cache = "public, max-age=0, must-revalidate";

  if (query.get("list") === "1") {
    return Response.json({ files: Object.keys(files).sort() }, { headers: { "Cache-Control": cache } });
  }
  if (wanted !== null) {
    const entry = Object.prototype.hasOwnProperty.call(files, wanted) ? files[wanted] : undefined;
    if (!entry) return Response.json({ error: "No such file in this download." }, { status: 404 });
    return new Response(Buffer.from(entry), {
      headers: {
        "Content-Type": wanted.endsWith(".json")
          ? "application/json"
          : wanted.endsWith(".txt")
            ? "text/plain; charset=utf-8"
            : "application/octet-stream",
        "Content-Length": String(entry.byteLength),
        "Cache-Control": cache,
      },
    });
  }

  const bytes = zipFiles(files);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": cache,
    },
  });
}
