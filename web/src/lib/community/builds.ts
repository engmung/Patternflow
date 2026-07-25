import path from "node:path";
import { and, desc, eq, lt, sql } from "drizzle-orm";
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

/** A pattern header as submitted, stored inline on the job. */
export type BuildPatternInput = { label: string; code: string };

/** A build claimed for this long is treated as abandoned (worker died). */
const STALE_AFTER_MS = 10 * 60 * 1000;

/** Where finished images live. Beside the database, never inside the repo. */
export function artifactDir(): string {
  if (process.env.BUILD_ARTIFACT_DIR) return process.env.BUILD_ARTIFACT_DIR;
  const dbPath = process.env.COMMUNITY_DB_PATH ?? path.join(process.cwd(), "data", "community.db");
  return path.join(path.dirname(dbPath), "builds");
}

export async function enqueueBuild(userId: string, patterns: BuildPatternInput[]): Promise<string> {
  const id = newId();
  await getDb().insert(builds).values({
    id,
    userId,
    status: "queued",
    patterns: JSON.stringify(patterns),
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
        sql`${builds.status} IN ('queued', 'running')`,
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Take the oldest queued job, atomically.
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
        sql`(SELECT id FROM ${builds} WHERE status = 'queued' ORDER BY created_at LIMIT 1)`,
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
  result: { artifact: string; artifactBytes: number; namespaces: string[] },
): Promise<void> {
  await getDb()
    .update(builds)
    .set({
      status: "done",
      artifact: result.artifact,
      artifactBytes: result.artifactBytes,
      namespaces: JSON.stringify(result.namespaces),
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

/** Position in the queue, 1-based. Null once it is no longer waiting. */
export async function queuePosition(id: string, createdAt: Date): Promise<number | null> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(builds)
    .where(and(eq(builds.status, "queued"), lt(builds.createdAt, createdAt)));
  const build = await getBuild(id);
  if (!build || build.status !== "queued") return null;
  return (rows[0]?.count ?? 0) + 1;
}

export async function listUserBuilds(userId: string, limit = 20) {
  return getDb()
    .select()
    .from(builds)
    .where(eq(builds.userId, userId))
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
