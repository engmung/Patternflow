import fs from "node:fs/promises";
import path from "node:path";
import { lt, isNotNull, sql } from "drizzle-orm";
import { artifactDir } from "./builds";
import { getDb } from "./db";
import { builds, session, verification } from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// Retention sweep.
//
// The terms at /terms promise specific numbers — sessions within 90 days,
// build artifacts within 30. This is the code that makes those true. A
// retention promise nobody enforces is worse than no promise: it is a
// statement about our own behaviour that happens to be false.
//
// Every rule here should match a line in /terms §9. If one changes, change
// both.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** /terms §9 — sessions are gone when they expire, and within 90 days regardless. */
export const SESSION_MAX_AGE_DAYS = 90;

/** /terms §9 — build artifacts last 30 days. They can always be rebuilt. */
export const BUILD_MAX_AGE_DAYS = 30;

/**
 * A file on disk with no row pointing at it is only an orphan once the worker
 * has certainly finished with it. Inside this window it may simply be a build
 * that wrote its artifact a moment before the row was updated.
 */
const ORPHAN_GRACE_MS = DAY_MS;

export type SweepResult = {
  expiredSessions: number;
  oldSessions: number;
  expiredVerifications: number;
  oldBuilds: number;
  artifactFilesDeleted: number;
  orphanFilesDeleted: number;
  artifactBytesFreed: number;
  errors: string[];
};

export function describeSweep(result: SweepResult): string {
  const mb = (result.artifactBytesFreed / 1_000_000).toFixed(1);
  return [
    `sessions: ${result.expiredSessions} expired, ${result.oldSessions} over ${SESSION_MAX_AGE_DAYS}d`,
    `verifications: ${result.expiredVerifications} expired`,
    `builds: ${result.oldBuilds} over ${BUILD_MAX_AGE_DAYS}d`,
    `files: ${result.artifactFilesDeleted} artifacts + ${result.orphanFilesDeleted} orphans (${mb} MB)`,
  ].join(" · ");
}

/**
 * Delete what we said we would delete.
 *
 * Safe to run at any time and as often as you like: every rule is defined by an
 * age cutoff, so a second run in the same minute finds nothing left to do.
 * Failures are collected rather than thrown — a permissions problem on one file
 * must not stop the session cleanup, which is the part that touches personal
 * data.
 */
export async function sweepRetention(now = new Date()): Promise<SweepResult> {
  const db = getDb();
  const result: SweepResult = {
    expiredSessions: 0,
    oldSessions: 0,
    expiredVerifications: 0,
    oldBuilds: 0,
    artifactFilesDeleted: 0,
    orphanFilesDeleted: 0,
    artifactBytesFreed: 0,
    errors: [],
  };

  // ── Sessions ───────────────────────────────────────────────────────────────
  // These carry the IP address and user-agent of a sign-in, so this is the part
  // of the sweep that is actually about personal data rather than disk space.
  try {
    const expired = await db
      .delete(session)
      .where(lt(session.expiresAt, now))
      .returning({ id: session.id });
    result.expiredSessions = expired.length;

    // Backstop for anything issued with a very long expiry: 90 days from
    // creation, whatever the token itself says.
    const sessionCutoff = new Date(now.getTime() - SESSION_MAX_AGE_DAYS * DAY_MS);
    const old = await db
      .delete(session)
      .where(lt(session.createdAt, sessionCutoff))
      .returning({ id: session.id });
    result.oldSessions = old.length;
  } catch (error) {
    result.errors.push(`sessions: ${String(error)}`);
  }

  // ── Verification tokens ────────────────────────────────────────────────────
  // Better Auth's short-lived tokens. Expired ones are pure residue.
  try {
    const rows = await db
      .delete(verification)
      .where(lt(verification.expiresAt, now))
      .returning({ id: verification.id });
    result.expiredVerifications = rows.length;
  } catch (error) {
    result.errors.push(`verifications: ${String(error)}`);
  }

  // ── Builds ─────────────────────────────────────────────────────────────────
  // Keyed on createdAt, not finishedAt: a job abandoned mid-flight has no
  // finish time, and nothing should be immortal because it crashed.
  //
  // The row goes with the file. A build stores its submitted C++ inline (which
  // is the point — it stays reproducible), so keeping thirty-day-old rows would
  // keep hundreds of KB of headers nobody will look at again.
  const dir = artifactDir();
  const buildCutoff = new Date(now.getTime() - BUILD_MAX_AGE_DAYS * DAY_MS);
  let removedRows: { artifact: string | null; artifactBytes: number | null }[] = [];
  try {
    removedRows = await db
      .delete(builds)
      .where(lt(builds.createdAt, buildCutoff))
      .returning({ artifact: builds.artifact, artifactBytes: builds.artifactBytes });
    result.oldBuilds = removedRows.length;
  } catch (error) {
    result.errors.push(`builds: ${String(error)}`);
  }

  for (const row of removedRows) {
    if (!row.artifact) continue;
    try {
      await fs.unlink(path.join(dir, row.artifact));
      result.artifactFilesDeleted += 1;
      result.artifactBytesFreed += row.artifactBytes ?? 0;
    } catch (error) {
      // Already gone is the expected case on a re-run, not a problem.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        result.errors.push(`artifact ${row.artifact}: ${String(error)}`);
      }
    }
  }

  // ── Orphaned artifact files ────────────────────────────────────────────────
  // Files whose row vanished some other way: a failed sweep, a hand-deleted
  // build, a crash between writing the file and updating the row.
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const referenced = new Set(
      (
        await db
          .select({ artifact: builds.artifact })
          .from(builds)
          .where(isNotNull(builds.artifact))
      )
        .map((row) => row.artifact)
        .filter((name): name is string => Boolean(name)),
    );

    for (const entry of entries) {
      if (!entry.isFile() || referenced.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(file);
        // Young files may belong to a build that is mid-flight right now.
        if (now.getTime() - stat.mtimeMs < ORPHAN_GRACE_MS) continue;
        await fs.unlink(file);
        result.orphanFilesDeleted += 1;
        result.artifactBytesFreed += stat.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          result.errors.push(`orphan ${entry.name}: ${String(error)}`);
        }
      }
    }
  } catch (error) {
    // No artifact directory yet is normal on a fresh deployment.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      result.errors.push(`artifact dir: ${String(error)}`);
    }
  }

  return result;
}

/** Rows the sweep would remove, without removing them. For `--dry-run`. */
export async function previewRetention(now = new Date()): Promise<{
  expiredSessions: number;
  oldSessions: number;
  expiredVerifications: number;
  oldBuilds: number;
}> {
  const db = getDb();
  const sessionCutoff = new Date(now.getTime() - SESSION_MAX_AGE_DAYS * DAY_MS);
  const buildCutoff = new Date(now.getTime() - BUILD_MAX_AGE_DAYS * DAY_MS);

  const count = async (table: typeof session | typeof verification | typeof builds, where: ReturnType<typeof lt>) => {
    const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(table).where(where);
    return rows[0]?.n ?? 0;
  };

  return {
    expiredSessions: await count(session, lt(session.expiresAt, now)),
    oldSessions: await count(session, lt(session.createdAt, sessionCutoff)),
    expiredVerifications: await count(verification, lt(verification.expiresAt, now)),
    oldBuilds: await count(builds, lt(builds.createdAt, buildCutoff)),
  };
}
