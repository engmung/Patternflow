import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { resolveHeader, type PortRow } from "../ports";
import { newId } from "./queries";
import { getDb } from "./db";
import { buildMeta, builds, moduleCache, patternHeaders, patterns, user } from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// The compiled module, kept beside the code.
//
// A pattern's `.h` is verified once by the person who ported it and then
// installed by everybody else. Compiling it again for every install was pure
// repetition: same text in, same bytes out, a queue to wait in each time. So
// the first request for a header asks the build worker to BAKE it — compile it
// once into `module_cache` — and every install after that is a database read
// and a zip assembled in the web process, with no queue at all.
//
// Who does what, strictly:
//   - the WORKER is the only thing that compiles and the only writer of a
//     module's content — the .pfm, its sidecar, its status and error
//     (storeModule / storeModuleError, called from buildJobs.ts only);
//   - the WEB reads rows and ENQUEUES bakes (requestBake below). The one
//     column it writes is `used_at`, at most once a day per row and never
//     anything a request supplies (touchModules) — retention's clock. It
//     never computes the toolchain revision either — that needs firmware/ on
//     disk, which a request must not touch (next.config.ts on bundle weight) —
//     it reads the revision the worker last published in build_meta.
//
// The key is (sha256 of the normalised header, toolchain revision). Full
// sha256, never truncated: a collision here would install one person's
// pattern under another's name.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The exact text the worker compiles, and the text the cache key is taken
 * from. Deliberately minimal — line endings folded (a header pasted on
 * Windows must not bake twice) and outer whitespace trimmed — so that the
 * worker can compile THIS string and the key names precisely those bytes.
 *
 * Idempotent on purpose, and it has to be: the route hashes the stored text,
 * requestBake hashes it and enqueues the normalised text, and the worker
 * normalises THAT again before it keys the row. Folding only `\r\n` left a
 * `\r\r\n` header (an API upload keeps its bytes) keyed three different ways,
 * so its row landed where no download ever looked. Every CR goes: a run of
 * them before a line feed is ONE line break (a CRLF file converted to CRLF a
 * second time — the same text as the file it came from), and a lone one is a
 * line break to the compiler as well.
 */
export function normalizeHeader(code: string): string {
  return code.replace(/\r*\n|\r/g, "\n").trim();
}

/** Full sha256 hex of the normalised header — the cache key's first half. */
export function sourceSha(code: string): string {
  return createHash("sha256").update(normalizeHeader(code), "utf8").digest("hex");
}

/** Bakes need a worker; without BUILD_ENABLED nothing will ever take one. */
export function buildsEnabled(): boolean {
  return process.env.BUILD_ENABLED === "1";
}

// ── Toolchain revision ───────────────────────────────────────────────────────

const BUILDER_REV_KEY = "builder_rev";

/**
 * The toolchain revision the worker last compiled with, or null when no
 * worker has ever run — in which case nothing counts as cached, and the first
 * bake publishes one.
 */
export async function currentBuilderRev(): Promise<string | null> {
  const rows = await getDb()
    .select({ value: buildMeta.value })
    .from(buildMeta)
    .where(eq(buildMeta.key, BUILDER_REV_KEY))
    .limit(1);
  return rows[0]?.value ?? null;
}

/** Worker only: publish the revision it is compiling with. True if it moved. */
export async function recordBuilderRev(rev: string, now = new Date()): Promise<boolean> {
  const current = await currentBuilderRev();
  if (current === rev) return false;
  await getDb()
    .insert(buildMeta)
    .values({ key: BUILDER_REV_KEY, value: rev, updatedAt: now })
    .onConflictDoUpdate({ target: buildMeta.key, set: { value: rev, updatedAt: now } });
  return true;
}

// ── Cache rows ───────────────────────────────────────────────────────────────

export type CachedModule = typeof moduleCache.$inferSelect;

export async function lookupModule(sha: string, rev: string): Promise<CachedModule | null> {
  const rows = await getDb()
    .select()
    .from(moduleCache)
    .where(and(eq(moduleCache.sourceSha, sha), eq(moduleCache.builderRev, rev)))
    .limit(1);
  return rows[0] ?? null;
}

/** Several at once, for a deck. Keyed by sha. */
export async function lookupModules(
  shas: string[],
  rev: string,
): Promise<Map<string, CachedModule>> {
  const unique = [...new Set(shas)];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(moduleCache)
    .where(and(inArray(moduleCache.sourceSha, unique), eq(moduleCache.builderRev, rev)));
  return new Map(rows.map((row) => [row.sourceSha, row]));
}

/** The fields a successful compile hands the cache (the worker's side). */
export type ModuleRowInput = {
  slug: string;
  namespace: string;
  name: string | null;
  pfm: Uint8Array;
  sidecar: string;
};

/**
 * Worker only. Insert-or-replace: two bakes of the same header racing each
 * other (two workers, or a send job and a bake) produce the same bytes, so the
 * second write is a no-op in content.
 */
export async function storeModule(
  sha: string,
  rev: string,
  module: ModuleRowInput,
  now = new Date(),
): Promise<void> {
  const values = {
    sourceSha: sha,
    builderRev: rev,
    status: "done",
    slug: module.slug,
    namespace: module.namespace,
    name: module.name,
    pfm: Buffer.from(module.pfm),
    sidecar: module.sidecar,
    bytes: module.pfm.byteLength,
    error: null,
    createdAt: now,
    usedAt: now,
  };
  await getDb()
    .insert(moduleCache)
    .values(values)
    .onConflictDoUpdate({
      target: [moduleCache.sourceSha, moduleCache.builderRev],
      set: { ...values, createdAt: undefined },
    });
}

/** Keep the tail: compiler output can be enormous, the error is at the end. */
export function errorTail(error: string, max = 8000): string {
  return error.length > max ? `…\n${error.slice(-max)}` : error;
}

/**
 * Worker only: this header will not compile on this toolchain, and asking
 * again would fail identically. Deterministic failures ONLY — a timeout or a
 * missing compiler must never be written here (buildJobs.ts decides).
 */
export async function storeModuleError(
  sha: string,
  rev: string,
  error: string,
  now = new Date(),
): Promise<void> {
  const values = {
    sourceSha: sha,
    builderRev: rev,
    status: "error",
    slug: null,
    namespace: null,
    name: null,
    pfm: null,
    sidecar: null,
    bytes: null,
    error: errorTail(error),
    createdAt: now,
    usedAt: now,
  };
  await getDb()
    .insert(moduleCache)
    .values(values)
    .onConflictDoUpdate({
      target: [moduleCache.sourceSha, moduleCache.builderRev],
      set: { ...values, createdAt: undefined },
    });
}

/**
 * Mark rows as served. Retention's "no longer published" rule counts from
 * here, so it has to move — but a popular pattern must not turn every
 * download into a write, so a row is only touched once a day.
 */
export async function touchModules(shas: string[], rev: string, now = new Date()): Promise<void> {
  const unique = [...new Set(shas)];
  if (unique.length === 0) return;
  await getDb()
    .update(moduleCache)
    .set({ usedAt: now })
    .where(
      and(
        inArray(moduleCache.sourceSha, unique),
        eq(moduleCache.builderRev, rev),
        lt(moduleCache.usedAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
}

// ── Bakes ────────────────────────────────────────────────────────────────────

/** The first retry after an infrastructure failure; doubles per failure. */
const BAKE_BACKOFF_MS = 60 * 1000;
const BAKE_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * How many bakes one owner may have waiting or compiling at once.
 *
 * Bakes are outside every per-person limit (builds.ts) because nobody clicked
 * anything to cause one — but header WRITES do cause them, and a header is
 * text: an account saving a different one twenty times a minute would queue
 * twenty compiles a minute, each of which every other pattern's first
 * download then waits behind. A send is held to two slots; this holds an
 * owner's bakes to a handful. A bake refused here is not lost: the download
 * that wanted it keeps polling and asks again as the owner's queue drains,
 * and idle warming picks up whatever is still missing.
 */
export const BAKE_OWNER_MAX = 4;

export type BakeRequest =
  | { state: "disabled" }
  | { state: "cached"; row: CachedModule }
  /**
   * Being compiled, or about to be. `buildId` is null when the owner already
   * has BAKE_OWNER_MAX bakes in flight: nothing was queued yet, and asking
   * again in a moment (as a polling download does) will.
   */
  | { state: "queued"; buildId: string | null }
  | { state: "backoff"; retryAt: Date };

/** When a header that failed `failures` times, last at `last`, may be tried again. */
function backoffRetryAt(failures: number, last: Date): Date {
  const wait = Math.min(BAKE_BACKOFF_MS * 2 ** (failures - 1), BAKE_BACKOFF_MAX_MS);
  return new Date(last.getTime() + wait);
}

/**
 * Has baking this header been failing? A bake that reached a verdict — even
 * "does not compile" — ends "done" (buildJobs.ts), so the "error" bakes
 * counted here are the ones that reached none: timeouts, a missing
 * toolchain, a worker that died mid-job. Retrying those on every download
 * poll would let one wedged header keep the worker busy for good, so the
 * wait doubles with each such failure in the last day.
 */
export async function bakeBackoff(sha: string, now = new Date()): Promise<Date | null> {
  const since = new Date(now.getTime() - DAY_MS);
  const failures = await getDb()
    .select({ finishedAt: builds.finishedAt })
    .from(builds)
    .where(
      and(
        eq(builds.kind, "bake"),
        eq(builds.sourceSha, sha),
        eq(builds.status, "error"),
        gt(builds.finishedAt, since),
      ),
    )
    .orderBy(desc(builds.finishedAt));
  if (failures.length === 0 || !failures[0].finishedAt) return null;
  const retryAt = backoffRetryAt(failures.length, failures[0].finishedAt);
  return retryAt > now ? retryAt : null;
}

/**
 * Every sha bakeBackoff would refuse right now, in one query — so idle
 * warming can leave them out BEFORE it cuts its list to size, instead of
 * spending its whole batch on headers that were always going to answer
 * "backoff" while older ones wait for hours.
 */
async function shasInBackoff(now: Date): Promise<Set<string>> {
  const rows = await getDb()
    .select({ sha: builds.sourceSha, finishedAt: builds.finishedAt })
    .from(builds)
    .where(
      and(
        eq(builds.kind, "bake"),
        eq(builds.status, "error"),
        gt(builds.finishedAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  const failures = new Map<string, { count: number; last: Date }>();
  for (const row of rows) {
    if (!row.sha || !row.finishedAt) continue;
    const seen = failures.get(row.sha);
    if (!seen) failures.set(row.sha, { count: 1, last: row.finishedAt });
    else {
      seen.count += 1;
      if (row.finishedAt > seen.last) seen.last = row.finishedAt;
    }
  }
  const out = new Set<string>();
  for (const [sha, { count, last }] of failures) {
    if (backoffRetryAt(count, last) > now) out.add(sha);
  }
  return out;
}

/** Bakes waiting or compiling, per owner — what BAKE_OWNER_MAX counts. */
async function activeBakesByOwner(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ userId: builds.userId, count: sql<number>`COUNT(*)` })
    .from(builds)
    .where(and(eq(builds.kind, "bake"), sql`${builds.status} IN ('queued', 'running')`))
    .groupBy(builds.userId);
  return new Map(rows.map((row) => [row.userId, row.count]));
}

/**
 * Ask for a header to be compiled into the cache, unless it already is or
 * already will be. Safe to call on every download request and every header
 * write: at most one bake per header is ever waiting, and at most
 * BAKE_OWNER_MAX per owner.
 *
 * `ownerUserId` is who the job is charged to — the pattern's author for their
 * own header, the porter for a port. It must be a real user (the builds row
 * has a foreign key), and it is never the visitor: a download must not be a
 * way to spend somebody else's build allowance, and bakes are outside those
 * allowances anyway (builds.ts).
 */
export async function requestBake(
  code: string,
  ownerUserId: string,
  label: string,
  now = new Date(),
): Promise<BakeRequest> {
  if (!buildsEnabled()) return { state: "disabled" };

  const normalized = normalizeHeader(code);
  const sha = sourceSha(code);
  const rev = await currentBuilderRev();
  if (rev) {
    const row = await lookupModule(sha, rev);
    if (row) return { state: "cached", row };
  }

  const pending = await pendingBake(sha);
  if (pending) return { state: "queued", buildId: pending };

  const retryAt = await bakeBackoff(sha, now);
  if (retryAt) return { state: "backoff", retryAt };

  // One statement, so two requests arriving together cannot both enqueue, nor
  // one owner slip past the cap: the checks and the INSERT are the same
  // write, which SQLite serialises.
  const id = newId();
  const patternsJson = JSON.stringify([{ label: label.slice(0, 80) || "pattern", code: normalized }]);
  const created = Math.floor(now.getTime() / 1000);
  const result = getDb().run(sql`
    INSERT INTO ${builds} (id, user_id, status, format, patterns, kind, source_sha, created_at)
    SELECT ${id}, ${ownerUserId}, 'queued', 'pfm', ${patternsJson}, 'bake', ${sha}, ${created}
    WHERE NOT EXISTS (
      SELECT 1 FROM ${builds} AS b
      WHERE b.kind = 'bake' AND b.source_sha = ${sha} AND b.status IN ('queued', 'running')
    )
    AND (
      SELECT COUNT(*) FROM ${builds} AS o
      WHERE o.kind = 'bake' AND o.user_id = ${ownerUserId} AND o.status IN ('queued', 'running')
    ) < ${BAKE_OWNER_MAX}`);
  // Not inserted: either the same header was queued a moment ago (its id is
  // the answer), or the owner is at the cap (null — see BakeRequest).
  return { state: "queued", buildId: result.changes > 0 ? id : await pendingBake(sha) };
}

/**
 * Cancel waiting bakes for header texts that are no longer on the site.
 *
 * Every save of a header queues a bake of the new text; the one it replaced
 * is still waiting, and compiling it would be pure waste — nothing links to
 * that text any more, and the owner's cap slot it holds is the one the NEW
 * text needs. Only "queued" bakes are touched (a running compile finishes),
 * and only those created before the live set was read, so a bake queued by a
 * write that landed meanwhile is never mistaken for a stale one. A visitor
 * can only be polling a live header, so no download is ever cancelled here.
 *
 * They end "done", with the reason kept: an "error" bake would count towards
 * that text's backoff (bakeBackoff), and a header reverted to it later
 * deserves a prompt bake.
 */
export async function supersedeStaleBakes(now = new Date()): Promise<number> {
  const db = getDb();
  // Whole seconds, as created_at is stored: strictly older than this second.
  const before = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const queued = await db
    .select({ id: builds.id, sha: builds.sourceSha })
    .from(builds)
    .where(and(eq(builds.kind, "bake"), eq(builds.status, "queued"), lt(builds.createdAt, before)));
  if (queued.length === 0) return 0;

  const live = await liveHeaderShas();
  const stale = queued.filter((row) => !row.sha || !live.has(row.sha)).map((row) => row.id);
  if (stale.length === 0) return 0;
  const cancelled = await db
    .update(builds)
    .set({
      status: "done",
      error: "Superseded: this header text is no longer on the site.",
      finishedAt: now,
    })
    .where(and(inArray(builds.id, stale), eq(builds.status, "queued")))
    .returning({ id: builds.id });
  return cancelled.length;
}

async function pendingBake(sha: string): Promise<string | null> {
  const rows = await getDb()
    .select({ id: builds.id })
    .from(builds)
    .where(
      and(
        eq(builds.kind, "bake"),
        eq(builds.sourceSha, sha),
        sql`${builds.status} IN ('queued', 'running')`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// ── Which header a pattern ships ─────────────────────────────────────────────

export type HeaderSource =
  | { code: string; source: "author"; ownerId: string }
  | {
      code: string;
      source: "port";
      ownerId: string;
      portId: string;
      porterHandle: string | null;
    };

/** A pattern as a download needs it: its effective header and its credits. */
export type PatternSource = {
  id: string;
  title: string;
  license: string;
  visibility: string;
  authorId: string;
  authorHandle: string | null;
  header: HeaderSource | null;
};

/**
 * Patterns by id with their EFFECTIVE header resolved — the author's own, the
 * pinned live port, or the oldest live port (lib/community/ports.ts), the
 * same resolution the pattern page and the header route use, so a download
 * can never ship a different .h than the page shows.
 */
export async function loadPatternSources(ids: string[]): Promise<Map<string, PatternSource>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const db = getDb();

  const rows = await db
    .select({
      id: patterns.id,
      title: patterns.title,
      license: patterns.license,
      visibility: patterns.visibility,
      userId: patterns.userId,
      codeCpp: patterns.codeCpp,
      pinnedHeaderId: patterns.pinnedHeaderId,
      username: user.username,
      displayUsername: user.displayUsername,
    })
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(inArray(patterns.id, unique));

  const portRows = await db
    .select({
      id: patternHeaders.id,
      patternId: patternHeaders.patternId,
      userId: patternHeaders.userId,
      codeCpp: patternHeaders.codeCpp,
      note: patternHeaders.note,
      stale: sql<number>`${patternHeaders.stale}`,
      createdAt: patternHeaders.createdAt,
      username: user.username,
      displayUsername: user.displayUsername,
    })
    .from(patternHeaders)
    .innerJoin(user, eq(patternHeaders.userId, user.id))
    .where(inArray(patternHeaders.patternId, unique))
    .orderBy(patternHeaders.createdAt);

  const portsByPattern = new Map<string, PortRow[]>();
  for (const port of portRows) {
    const list = portsByPattern.get(port.patternId) ?? [];
    list.push({ ...port, stale: Boolean(port.stale) });
    portsByPattern.set(port.patternId, list);
  }

  const out = new Map<string, PatternSource>();
  for (const row of rows) {
    const ports = portsByPattern.get(row.id) ?? [];
    const effective = resolveHeader(row, ports);
    let header: HeaderSource | null = null;
    if (effective?.source === "author") {
      header = { code: effective.codeCpp, source: "author", ownerId: row.userId };
    } else if (effective?.source === "port") {
      const port = ports.find((candidate) => candidate.id === effective.portId);
      if (port) {
        header = {
          code: effective.codeCpp,
          source: "port",
          ownerId: port.userId,
          portId: port.id,
          porterHandle: effective.handle,
        };
      }
    }
    out.set(row.id, {
      id: row.id,
      title: row.title,
      license: row.license,
      visibility: row.visibility,
      authorId: row.userId,
      authorHandle: row.displayUsername ?? row.username ?? null,
      header,
    });
  }
  return out;
}

/**
 * Warm the cache for one pattern right after its header changed — the eager
 * half of "compile once": the next person to press Download finds it built.
 *
 * Called from the header write sites (publish, author/moderator edit, port
 * proposed or repaired or withdrawn). Never throws and never delays a write:
 * a pattern whose bake could not be queued is simply baked on its first
 * download instead. Private patterns are skipped — nobody but their author
 * can download them, and the author's own sends still go through /builds.
 *
 * Whatever text this write replaced may still have a bake waiting; that one
 * is cancelled first (supersedeStaleBakes), so an author saving a header over
 * and over compiles the last save, not every one of them in turn.
 */
export async function bakePatternHeader(patternId: string): Promise<void> {
  try {
    if (!buildsEnabled()) return;
    await supersedeStaleBakes();
    const source = (await loadPatternSources([patternId])).get(patternId);
    if (!source || source.visibility !== "public" || !source.header) return;
    await requestBake(source.header.code, source.header.ownerId, source.title);
  } catch (error) {
    console.error(
      `[module-cache] could not queue a bake for ${patternId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// ── Idle warming (the worker's) ──────────────────────────────────────────────

export type WarmCandidate = { sha: string; code: string; ownerId: string; label: string };

/**
 * Published headers the cache does not have for this toolchain revision and
 * no bake is already chasing. Newest patterns first — they are the likeliest
 * to be downloaded next. This is what backfills every header that existed
 * before the cache did, and what re-bakes the catalogue after a firmware
 * update moves the revision, with nobody having to remember to run anything.
 *
 * `skip` lets the worker leave out shas it has recently seen fail for
 * reasons that were not the code's (see buildJobs.ts). Two more are left out
 * here, before the list is cut to `limit` — otherwise the newest few would
 * take every slot each minute and answer nothing, and everything older would
 * wait behind them: a header requestBake would refuse for its backoff, and
 * one whose owner already has BAKE_OWNER_MAX bakes in flight (counting the
 * ones chosen in this very list).
 */
export async function findWarmCandidates(
  rev: string,
  limit: number,
  skip: (sha: string) => boolean = () => false,
  now = new Date(),
): Promise<WarmCandidate[]> {
  const db = getDb();
  const candidates = await db
    .select({ id: patterns.id })
    .from(patterns)
    .where(
      and(
        eq(patterns.visibility, "public"),
        sql`(${patterns.codeCpp} IS NOT NULL OR EXISTS (
          SELECT 1 FROM ${patternHeaders} AS ph
          WHERE ph.pattern_id = ${patterns}.id AND ph.stale = 0
        ))`,
      ),
    )
    .orderBy(desc(patterns.createdAt));
  if (candidates.length === 0) return [];

  const cached = new Set(
    (
      await db
        .select({ sha: moduleCache.sourceSha })
        .from(moduleCache)
        .where(eq(moduleCache.builderRev, rev))
    ).map((row) => row.sha),
  );
  const pending = new Set(
    (
      await db
        .select({ sha: builds.sourceSha })
        .from(builds)
        .where(and(eq(builds.kind, "bake"), sql`${builds.status} IN ('queued', 'running')`))
    )
      .map((row) => row.sha)
      .filter((sha): sha is string => Boolean(sha)),
  );
  const backedOff = await shasInBackoff(now);
  const active = await activeBakesByOwner();

  const out: WarmCandidate[] = [];
  const chosen = new Set<string>();
  // Resolved in chunks so a large catalogue is not one enormous IN (...).
  const ids = candidates.map((row) => row.id);
  for (let start = 0; start < ids.length && out.length < limit; start += 200) {
    const chunk = ids.slice(start, start + 200);
    const sources = await loadPatternSources(chunk);
    for (const id of chunk) {
      const header = sources.get(id)?.header;
      if (!header) continue;
      const sha = sourceSha(header.code);
      if (cached.has(sha) || pending.has(sha) || chosen.has(sha) || skip(sha)) continue;
      if (backedOff.has(sha)) continue;
      const inFlight = active.get(header.ownerId) ?? 0;
      if (inFlight >= BAKE_OWNER_MAX) continue;
      active.set(header.ownerId, inFlight + 1);
      chosen.add(sha);
      out.push({ sha, code: header.code, ownerId: header.ownerId, label: sources.get(id)!.title });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Every header text currently live on the site, hashed — retention's input. */
export async function liveHeaderShas(): Promise<Set<string>> {
  const db = getDb();
  const own = await db
    .select({ code: patterns.codeCpp })
    .from(patterns)
    .where(sql`${patterns.codeCpp} IS NOT NULL`);
  const ports = await db
    .select({ code: patternHeaders.codeCpp })
    .from(patternHeaders)
    .where(eq(patternHeaders.stale, false));
  const out = new Set<string>();
  for (const row of [...own, ...ports]) {
    if (row.code) out.add(sourceSha(row.code));
  }
  return out;
}
