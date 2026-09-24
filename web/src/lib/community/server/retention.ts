import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, lt, isNotNull, ne, sql } from "drizzle-orm";
import { attachmentDir } from "./attachments";
import { artifactDir } from "./builds";
import { getDb } from "./db";
import { currentBuilderRev, liveHeaderShas } from "./moduleCache";
import { builds, moduleCache, notifications, postAttachments, session, verification } from "./schema";

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
 * A compiled module (module_cache) whose header is no longer on the site goes
 * after it was last served. One whose header IS still on the site stays for as
 * long as the header does: it is that header's compiled form, and deleting it
 * would only mean compiling it again. "On the site" is patterns.code_cpp or a
 * non-stale port — the same texts resolveHeader() can pick from — hashed here
 * exactly as the cache keys them.
 *
 * /terms §9 promises deletion within **30 days** of the header being removed.
 * The threshold is 29, not 30, on purpose: `used_at` moves at most once a day
 * (touchModules) and the sweep runs once a day, so the two granularities can
 * each add up to a day. At 30 the outer edge lands at ~31 days — a day past
 * the promise; at 29 it stays inside 30.
 */
export const MODULE_CACHE_MAX_IDLE_DAYS = 29;

/**
 * Modules built by a toolchain that has since moved on are never served again
 * (the web reads only the current revision), so a week without use is enough.
 * A week rather than at once because a firmware rollback returns to the old
 * revision, and its rows are then instantly valid again.
 */
export const MODULE_CACHE_OLD_TOOLCHAIN_DAYS = 7;

/** /terms §9 — notifications last 90 days, read or not. After that an unread
 *  one is not waiting, it is clutter. */
export const NOTIFICATION_MAX_AGE_DAYS = 90;

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
  oldNotifications: number;
  artifactFilesDeleted: number;
  orphanFilesDeleted: number;
  orphanAttachmentsDeleted: number;
  artifactBytesFreed: number;
  /** module_cache rows of an older toolchain, unused for a week. */
  oldToolchainModules: number;
  /** module_cache rows whose header left the site, unserved for 30 days. */
  unpublishedModules: number;
  errors: string[];
};

export function describeSweep(result: SweepResult): string {
  const mb = (result.artifactBytesFreed / 1_000_000).toFixed(1);
  return [
    `sessions: ${result.expiredSessions} expired, ${result.oldSessions} over ${SESSION_MAX_AGE_DAYS}d`,
    `verifications: ${result.expiredVerifications} expired`,
    `builds: ${result.oldBuilds} over ${BUILD_MAX_AGE_DAYS}d`,
    `notifications: ${result.oldNotifications} over ${NOTIFICATION_MAX_AGE_DAYS}d`,
    `files: ${result.artifactFilesDeleted} artifacts + ${result.orphanFilesDeleted} orphans (${mb} MB)`,
    `attachments: ${result.orphanAttachmentsDeleted} orphans`,
    `modules: ${result.oldToolchainModules} old toolchain, ${result.unpublishedModules} no longer published`,
  ].join(" · ");
}

/**
 * The module cache's two rules (see the constants above). Rows are keyed by
 * (sha, revision), so deletions go by that pair; the live-header check runs
 * in JS because the key is a hash of the header text, not a column SQLite
 * could join on.
 */
export async function sweepModuleCache(now = new Date(), dryRun = false): Promise<{
  oldToolchain: number;
  unpublished: number;
}> {
  const db = getDb();
  const result = { oldToolchain: 0, unpublished: 0 };

  // No revision published means no worker has ever run — nothing is "old".
  const rev = await currentBuilderRev();
  if (rev) {
    const cutoff = new Date(now.getTime() - MODULE_CACHE_OLD_TOOLCHAIN_DAYS * DAY_MS);
    const where = and(ne(moduleCache.builderRev, rev), lt(moduleCache.usedAt, cutoff));
    if (dryRun) {
      const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(moduleCache).where(where);
      result.oldToolchain = rows[0]?.n ?? 0;
    } else {
      const rows = await db
        .delete(moduleCache)
        .where(where)
        .returning({ sha: moduleCache.sourceSha });
      result.oldToolchain = rows.length;
    }
  }

  const idleCutoff = new Date(now.getTime() - MODULE_CACHE_MAX_IDLE_DAYS * DAY_MS);
  const idle = await db
    .select({ sha: moduleCache.sourceSha, rev: moduleCache.builderRev })
    .from(moduleCache)
    .where(lt(moduleCache.usedAt, idleCutoff));
  if (idle.length === 0) return result;

  const live = await liveHeaderShas();
  const gone = idle.filter((row) => !live.has(row.sha));
  result.unpublished = gone.length;
  if (!dryRun) {
    for (const row of gone) {
      await db
        .delete(moduleCache)
        .where(and(eq(moduleCache.sourceSha, row.sha), eq(moduleCache.builderRev, row.rev)));
    }
  }
  return result;
}

/**
 * Attachment files whose row is gone.
 *
 * Deleting a thread cascades its attachment ROWS away (foreign keys), but
 * nothing in that transaction touches the disk — so every deleted thread
 * leaves its bytes behind, invisibly, on a Pi's SD card. This walks the
 * directory against the table and removes the difference, behind the same
 * grace window the artifact sweep uses so an upload mid-flight (file written,
 * row not yet) is never mistaken for garbage.
 */
export async function sweepOrphanAttachments(now = new Date()): Promise<{
  deleted: number;
  errors: string[];
}> {
  const db = getDb();
  const dir = attachmentDir();
  const result = { deleted: 0, errors: [] as string[] };

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    // No attachments directory yet is normal until the first upload.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      result.errors.push(`attachment dir: ${String(error)}`);
    }
    return result;
  }

  const referenced = new Set(
    (await db.select({ id: postAttachments.id }).from(postAttachments)).map((row) => row.id),
  );

  for (const entry of entries) {
    if (!entry.isFile() || referenced.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(file);
      if (now.getTime() - stat.mtimeMs < ORPHAN_GRACE_MS) continue;
      await fs.unlink(file);
      result.deleted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        result.errors.push(`attachment ${entry.name}: ${String(error)}`);
      }
    }
  }

  return result;
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
    oldNotifications: 0,
    artifactFilesDeleted: 0,
    orphanFilesDeleted: 0,
    orphanAttachmentsDeleted: 0,
    artifactBytesFreed: 0,
    oldToolchainModules: 0,
    unpublishedModules: 0,
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

  // ── Notifications ──────────────────────────────────────────────────────────
  // Disposable by design (see schema.ts): read or unread, ninety days is the
  // whole shelf life. The content deletion routes already cleared anything
  // pointing at removed things; this ages out the rest.
  try {
    const cutoff = new Date(now.getTime() - NOTIFICATION_MAX_AGE_DAYS * DAY_MS);
    const rows = await db
      .delete(notifications)
      .where(lt(notifications.createdAt, cutoff))
      .returning({ id: notifications.id });
    result.oldNotifications = rows.length;
  } catch (error) {
    result.errors.push(`notifications: ${String(error)}`);
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

  // ── Orphaned thread attachments ────────────────────────────────────────────
  const attachments = await sweepOrphanAttachments(now);
  result.orphanAttachmentsDeleted = attachments.deleted;
  result.errors.push(...attachments.errors);

  // ── Compiled module cache ──────────────────────────────────────────────────
  // Bake jobs are ordinary builds rows and already went with the builds rule
  // above; this is the cache they filled.
  try {
    const modules = await sweepModuleCache(now);
    result.oldToolchainModules = modules.oldToolchain;
    result.unpublishedModules = modules.unpublished;
  } catch (error) {
    result.errors.push(`module cache: ${String(error)}`);
  }

  return result;
}

/** Rows the sweep would remove, without removing them. For `--dry-run`. */
export async function previewRetention(now = new Date()): Promise<{
  expiredSessions: number;
  oldSessions: number;
  expiredVerifications: number;
  oldBuilds: number;
  oldNotifications: number;
  oldToolchainModules: number;
  unpublishedModules: number;
}> {
  const db = getDb();
  const modules = await sweepModuleCache(now, true);
  const sessionCutoff = new Date(now.getTime() - SESSION_MAX_AGE_DAYS * DAY_MS);
  const buildCutoff = new Date(now.getTime() - BUILD_MAX_AGE_DAYS * DAY_MS);
  const notificationCutoff = new Date(now.getTime() - NOTIFICATION_MAX_AGE_DAYS * DAY_MS);

  const count = async (
    table: typeof session | typeof verification | typeof builds | typeof notifications,
    where: ReturnType<typeof lt>,
  ) => {
    const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(table).where(where);
    return rows[0]?.n ?? 0;
  };

  return {
    expiredSessions: await count(session, lt(session.expiresAt, now)),
    oldSessions: await count(session, lt(session.createdAt, sessionCutoff)),
    expiredVerifications: await count(verification, lt(verification.expiresAt, now)),
    oldBuilds: await count(builds, lt(builds.createdAt, buildCutoff)),
    oldNotifications: await count(notifications, lt(notifications.createdAt, notificationCutoff)),
    oldToolchainModules: modules.oldToolchain,
    unpublishedModules: modules.unpublished,
  };
}
