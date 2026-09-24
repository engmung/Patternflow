import path from "node:path";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { newId } from "./queries";
import { builds } from "./schema";

// Build queue.
//
// The web request enqueues; a separate worker process claims and compiles. All
// coordination goes through this table so the two halves share nothing but the
// database — the worker can be restarted, moved to another machine, or run
// twice without the site knowing.

export type BuildStatus = "queued" | "running" | "done" | "error";

/**
 * "bin" — a whole flashable image (legacy; still what pre-loader firmware
 * needs). "pfm" — loadable modules, zipped, installed over Wi-Fi with no
 * reflash. See moduleRunner.ts for why the difference is 14 s vs ½ s.
 */
export type BuildFormat = "bin" | "pfm";

/** A pattern header as submitted, stored inline on the job. */
export type BuildPatternInput = { label: string; code: string };

/**
 * "send" — somebody asked for this code to be built (POST /builds). "bake" —
 * the site compiling a stored header into the module cache (moduleCache.ts).
 * Only "send" jobs belong to a person's queue: bakes are excluded from every
 * per-user count, limit and supersede below, because nobody clicked anything
 * to cause one.
 */
export type BuildKind = "send" | "bake";

/** A build claimed for this long is treated as abandoned (worker died). */
const STALE_AFTER_MS = 10 * 60 * 1000;

/** Where finished images live. Beside the database, never inside the repo. */
export function artifactDir(): string {
  if (process.env.BUILD_ARTIFACT_DIR) return process.env.BUILD_ARTIFACT_DIR;
  const dbPath = process.env.COMMUNITY_DB_PATH ?? path.join(process.cwd(), "data", "community.db");
  return path.join(path.dirname(dbPath), "builds");
}

export async function enqueueBuild(
  userId: string,
  patterns: BuildPatternInput[],
  format: BuildFormat = "bin",
  bake?: { sourceSha: string },
): Promise<string> {
  const id = newId();
  await getDb().insert(builds).values({
    id,
    userId,
    status: "queued",
    format,
    patterns: JSON.stringify(patterns),
    kind: bake ? "bake" : "send",
    sourceSha: bake?.sourceSha ?? null,
    createdAt: new Date(),
  });
  return id;
}

/** How many of this user's builds are still waiting or compiling. */
export async function countActiveBuilds(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(builds)
    .where(
      and(
        eq(builds.userId, userId),
        eq(builds.kind, "send"),
        sql`${builds.status} IN ('queued', 'running')`,
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Cancel this user's builds that are still WAITING (not yet claimed by a
 * worker). Iterating on a pattern means re-submitting quickly, and the newest
 * submission is always the one the user actually wants — their own stale
 * queue entries should never block it. Running compiles are left alone.
 *
 * Bakes are not theirs to cancel: a bake is charged to the header's owner
 * but was asked for by whoever downloaded the pattern, and superseding it
 * would leave that visitor polling a compile that is never going to happen.
 */
export async function supersedeQueuedBuilds(userId: string): Promise<number> {
  const rows = await getDb()
    .update(builds)
    .set({
      status: "error",
      error: "Superseded by a newer build you started.",
      finishedAt: new Date(),
    })
    .where(
      and(eq(builds.userId, userId), eq(builds.status, "queued"), eq(builds.kind, "send")),
    )
    .returning({ id: builds.id });
  return rows.length;
}

/**
 * Take the next queued job, atomically: every waiting "send" before any
 * "bake", oldest first within each. A person watching a spinner outranks a
 * cache being warmed — including the idle warm-up, which can queue a batch of
 * bakes a moment before somebody presses Send.
 *
 * The UPDATE ... WHERE id = (SELECT ... LIMIT 1) form is what makes this safe
 * with more than one worker: SQLite serialises writers, so exactly one of them
 * can flip a given row out of "queued". Selecting first and updating after
 * would let two workers claim the same job.
 */
export async function claimNextBuild(worker: string) {
  await reapStaleBuilds();

  const rows = await getDb()
    .update(builds)
    .set({ status: "running", worker, startedAt: new Date() })
    .where(
      eq(
        builds.id,
        sql`(SELECT id FROM ${builds} WHERE status = 'queued'
             ORDER BY CASE kind WHEN 'send' THEN 0 ELSE 1 END, created_at LIMIT 1)`,
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Fail anything left "running" by a worker that went away. */
export async function reapStaleBuilds(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const rows = await getDb()
    .update(builds)
    .set({
      status: "error",
      error: "Build worker stopped responding. Try again.",
      finishedAt: new Date(),
    })
    .where(and(eq(builds.status, "running"), lt(builds.startedAt, cutoff)))
    .returning({ id: builds.id });
  return rows.length;
}

export async function completeBuild(
  id: string,
  // A bake has no artifact of its own — its product is a module_cache row.
  result: {
    artifact: string | null;
    artifactBytes: number | null;
    namespaces: string[];
    /**
     * A bake whose header does not compile still did its job — the verdict is
     * cached — so it ends "done", with the compiler's words kept here for
     * whoever reads the row. Only failures that left NO verdict end "error",
     * which is what the bake backoff counts (moduleCache.ts).
     */
    verdict?: string;
  },
): Promise<void> {
  await getDb()
    .update(builds)
    .set({
      status: "done",
      artifact: result.artifact,
      artifactBytes: result.artifactBytes,
      namespaces: JSON.stringify(result.namespaces),
      error: result.verdict
        ? result.verdict.length > 8000
          ? `…\n${result.verdict.slice(-8000)}`
          : result.verdict
        : null,
      finishedAt: new Date(),
    })
    .where(eq(builds.id, id));
}

export async function failBuild(id: string, error: string): Promise<void> {
  await getDb()
    .update(builds)
    .set({
      status: "error",
      // Compiler output can be enormous; keep the tail, which is where the
      // actual error is, and leave the row readable.
      error: error.length > 8000 ? `…\n${error.slice(-8000)}` : error,
      finishedAt: new Date(),
    })
    .where(eq(builds.id, id));
}

export async function getBuild(id: string) {
  const rows = await getDb().select().from(builds).where(eq(builds.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Position in the queue, 1-based. Null once it is no longer waiting.
 *
 * Counted the way claimNextBuild takes jobs: a waiting send is behind older
 * sends only (every bake waits for it, however old), while a bake is behind
 * every send and the older bakes.
 */
export async function queuePosition(id: string, createdAt: Date): Promise<number | null> {
  const build = await getBuild(id);
  if (!build || build.status !== "queued") return null;
  const ahead =
    build.kind === "bake"
      ? or(eq(builds.kind, "send"), lt(builds.createdAt, createdAt))
      : and(eq(builds.kind, "send"), lt(builds.createdAt, createdAt));
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(builds)
    .where(and(eq(builds.status, "queued"), ahead));
  return (rows[0]?.count ?? 0) + 1;
}

/** A person's own builds — bakes are the site's, even when charged to them. */
export async function listUserBuilds(userId: string, limit = 20) {
  return getDb()
    .select()
    .from(builds)
    .where(and(eq(builds.userId, userId), eq(builds.kind, "send")))
    .orderBy(desc(builds.createdAt))
    .limit(limit);
}

export function parseBuildPatterns(raw: string): BuildPatternInput[] {
  try {
    const parsed = JSON.parse(raw) as BuildPatternInput[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
