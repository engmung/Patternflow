import { eq } from "drizzle-orm";
import { unzipSync, zipSync } from "fflate";
import { encodePfst, normalizePerformance, pfsFilename } from "@/lib/pattern/pfst";
import { getDb } from "./db";
import {
  buildsEnabled,
  currentBuilderRev,
  loadPatternSources,
  lookupModules,
  requestBake,
  sourceSha,
  touchModules,
  type CachedModule,
  type PatternSource,
} from "./moduleCache";
import { assignPackSlugs, catalogText, composeSidecar, PACK_MTIME } from "./modulePack";
import { deckPatterns } from "./schema";

// A deck's downloadable pack.
//
// "Send to my board" builds a deck into modules behind a sign-in, and the
// result is a URL nobody else can use. A deck is a thing you hand to people —
// so it also has a stable address that serves a `.zip` of `.pfm` + `.json` +
// `catalog.txt`, the exact shape the device's /patterns page unpacks. Drop
// that link in Discord and anyone with a Patternflow is two clicks from your
// set.
//
// The pack is ASSEMBLED, not built. Each slot's module comes out of the
// module cache (moduleCache.ts), which holds every published header compiled
// once and shared by every deck and pattern page it appears in. So:
//
//   - reordering a deck costs nothing — the running order is catalog.txt,
//     written per request;
//   - a slot that cannot be included is SKIPPED and reported, never fatal.
//     This used to be one whole-deck build, and one bad header (or two
//     patterns sharing a NAME) failed the entire pack — stickily, until
//     somebody edited the deck;
//   - a slot whose header was never compiled asks for a bake, charged to the
//     header's owner (its author, or its porter) — never to the visitor, who
//     must not be able to queue work by pasting a URL — and the route answers
//     202 until the worker has it.

export type DeckSkipReason =
  | "no-header"
  | "compile-error"
  | "duplicate-name"
  | "missing"
  /** The build service could not compile it just now (not the code's fault). */
  | "unavailable";

export type DeckSkip = { position: number; title: string; reason: DeckSkipReason };

export type DeckPack =
  /** Every slot is settled and at least one made it in. */
  | { state: "ready"; total: number; included: number; skipped: DeckSkip[]; files: Record<string, Uint8Array> }
  /** Some slot is still being compiled for the first time. */
  | { state: "building"; total: number; included: number; pending: number; skipped: DeckSkip[] }
  /** Settled, and nothing could be included. */
  | { state: "empty"; total: number; included: 0; skipped: DeckSkip[] }
  /** A slot needs compiling and this deployment has no build worker. */
  | { state: "unavailable"; total: number; included: number; skipped: DeckSkip[] };

type Slot = { position: number; patternId: string; titleSnapshot: string };

/**
 * Settle every slot of the deck against the cache, asking for bakes where it
 * is missing, and — when nothing is left waiting — produce the pack's files.
 *
 * Safe to call on every request (and it is — the page polls `?status=1`): a
 * header already queued is not queued again, and a hit writes nothing but a
 * once-a-day `used_at`.
 */
export async function assembleDeckPack(
  deckId: string,
  performanceJson: string | null,
  now = new Date(),
): Promise<DeckPack> {
  const slots: Slot[] = await getDb()
    .select({
      position: deckPatterns.position,
      patternId: deckPatterns.patternId,
      titleSnapshot: deckPatterns.titleSnapshot,
    })
    .from(deckPatterns)
    .where(eq(deckPatterns.deckId, deckId))
    .orderBy(deckPatterns.position);

  const total = slots.length;
  const sources = await loadPatternSources(slots.map((slot) => slot.patternId));
  const rev = await currentBuilderRev();

  const shaOf = new Map<string, string>();
  for (const slot of slots) {
    const header = sources.get(slot.patternId)?.header;
    if (header) shaOf.set(slot.patternId, sourceSha(header.code));
  }
  const rows = rev ? await lookupModules([...shaOf.values()], rev) : new Map<string, CachedModule>();

  const skipped: DeckSkip[] = [];
  const ready: { slot: Slot; source: PatternSource; row: CachedModule }[] = [];
  let pending = 0;
  let needsWorker = false;

  for (const slot of slots) {
    const source = sources.get(slot.patternId);
    // Deleted, or gone private since the deck was published: the deck page
    // shows the gap, and the pack must not carry what its author withdrew.
    if (!source || source.visibility !== "public") {
      skipped.push({ position: slot.position, title: slot.titleSnapshot, reason: "missing" });
      continue;
    }
    if (!source.header) {
      skipped.push({ position: slot.position, title: source.title, reason: "no-header" });
      continue;
    }

    let row = rows.get(shaOf.get(slot.patternId)!);
    if (!row) {
      if (!buildsEnabled()) {
        needsWorker = true;
        continue;
      }
      const bake = await requestBake(source.header.code, source.header.ownerId, source.title, now);
      if (bake.state === "cached") {
        row = bake.row; // baked between our lookup and this request
      } else if (bake.state === "backoff") {
        skipped.push({ position: slot.position, title: source.title, reason: "unavailable" });
        continue;
      } else {
        pending += 1;
        continue;
      }
    }

    if (row.status !== "done" || !row.pfm || !row.slug) {
      skipped.push({ position: slot.position, title: source.title, reason: "compile-error" });
      continue;
    }
    ready.push({ slot, source, row });
  }

  if (needsWorker) return { state: "unavailable", total, included: ready.length, skipped };
  if (pending > 0) return { state: "building", total, included: ready.length, pending, skipped };
  if (ready.length === 0) return { state: "empty", total, included: 0, skipped };

  // Two slots can compile to the same file name — two patterns share a NAME,
  // or both have names with no ASCII in them (port_preset.py falls back to
  // "pattern" for those). Renamed, not dropped: assignPackSlugs says why that
  // is safe on the board.
  const slugs = assignPackSlugs(ready.map((entry) => entry.row.slug!));
  const files: Record<string, Uint8Array> = {};
  ready.forEach((entry, index) => {
    const slug = slugs[index];
    files[`${slug}.pfm`] = new Uint8Array(entry.row.pfm!);
    files[`${slug}.json`] = new TextEncoder().encode(
      composeSidecar(entry.row.sidecar, { name: entry.row.name, slug, source: entry.source }),
    );
  });
  files["catalog.txt"] = new TextEncoder().encode(catalogText(slugs));

  const performance = performanceEntry(performanceJson);
  if (performance) files[performance.name] = performance.bytes;

  if (rev) await touchModules(ready.map((entry) => entry.row.sourceSha), rev, now);

  return { state: "ready", total, included: ready.length, skipped, files };
}

/**
 * A deck's attached performance, as the `.pfs` table that rides its pack.
 *
 * One file, because upstream made `.pfs` the whole document: the Director
 * opens and saves it, and the panel plays it. An earlier cut also shipped a
 * `performance.json` beside it as "the editable source" — that was true when
 * the Director edited JSON and stopped being true when it did not, and a file
 * nothing opens is just weight in someone's download.
 *
 * Added at serve time, so attaching or editing a performance updates
 * downloads immediately and never queues a compile. Null when there is none,
 * or when the stored JSON will not encode: a broken attachment must not take
 * the pattern pack down with it.
 */
export function performanceEntry(
  performanceJson: string | null,
): { name: string; bytes: Uint8Array } | null {
  if (!performanceJson) return null;
  try {
    const perf = normalizePerformance(JSON.parse(performanceJson));
    return { name: pfsFilename(perf), bytes: encodePfst(perf) };
  } catch {
    return null;
  }
}

/**
 * Add a deck's attached performance to an existing pack archive.
 *
 * The deck route no longer needs this (it assembles the pack with the table
 * already in it — performanceEntry above), but it is the same rule applied to
 * an archive somebody already has, and the pack smoke pins it.
 *
 * Returns the pack untouched if there is no performance, or if the stored JSON
 * will not encode.
 */
export function decoratePackWithPerformance(
  pack: Uint8Array,
  performanceJson: string | null,
): Uint8Array {
  const performance = performanceEntry(performanceJson);
  if (!performance) return pack;
  try {
    const entries = unzipSync(pack);
    entries[performance.name] = performance.bytes;
    return zipSync(entries, { level: 6, mtime: PACK_MTIME });
  } catch {
    return pack;
  }
}

/**
 * `patternflow-deck-my-set.zip` — a filename that says what it is. A title
 * with nothing ASCII in it (a Korean title, say) would slug to nothing, and
 * "patternflow-deck-deck.zip" for every such deck says nothing; the id's
 * first eight characters at least tell two downloads apart.
 */
export function deckZipFilename(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `patternflow-deck-${slug || id.slice(0, 8)}.zip`;
}
