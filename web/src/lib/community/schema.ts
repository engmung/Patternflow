import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

// ─────────────────────────────────────────────────────────────────────────────
// Community database schema (SQLite via Drizzle).
//
// The first four tables (user/session/account/verification) are the shape
// Better Auth expects, plus the username-plugin columns on `user`. Do not
// rename fields without checking Better Auth's drizzle adapter docs.
//
// Email is a *recovery-only optional* input in our sign-up UI. Better Auth
// requires an email column, so users who skip it get an invisible dummy
// (`<username>@patternflow.local`) — see AuthModal.
// ─────────────────────────────────────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // username plugin: `username` is the normalized (lowercased) unique handle,
  // `displayUsername` preserves the casing the user typed.
  username: text("username").unique(),
  displayUsername: text("display_username"),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ── Community content ────────────────────────────────────────────────────────

export const patterns = sqliteTable(
  "patterns",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /**
     * Complete standalone pattern source (setup/update/draw), plain JS text.
     * Stored CLEAN — the licence header and attribution footer are injected at
     * download time from the row's own metadata (same rule as the Discord share
     * flow), so attribution can never go stale or belong to the wrong person.
     */
    code: text("code").notNull(),
    /**
     * Optional firmware header (C++). The JS is the source of truth; this is
     * the author's hand-verified port, attached after the fact — a pattern with
     * one is "hardware ready". Never auto-generated, never carried across forks
     * (the JS may have changed, which would make the port a lie).
     */
    codeCpp: text("code_cpp"),
    /** SPDX id chosen at publish time. Same options as the Discord share flow. */
    license: text("license").notNull().default("CC-BY-SA-4.0"),
    /**
     * Optional "made on" date (YYYY-MM-DD), set by the author. A pattern is
     * often finished long before it gets shared, and it is the creation date
     * that belongs in the licence header — `created_at` only records when it
     * was uploaded here.
     */
    madeOn: text("made_on"),
    /**
     * How the pattern was made: "hand" | "ai-assisted" | "ai-generated".
     * Author-declared and optional — older rows have none.
     *
     * This exists because of what happens later, not what happens now. Standard
     * licensing practice has the creator *warrant* they hold the rights, and a
     * buyer's legal review asks how the work was made. A declaration recorded at
     * publication is worth more than one reconstructed from memory two years on,
     * and it is only ever collectable going forward — which is why it is here
     * before anything charges money.
     */
    madeHow: text("made_how"),
    /** Fork lineage: the community pattern this one was remixed from. */
    parentId: text("parent_id").references((): AnySQLiteColumn => patterns.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("patterns_created_at_idx").on(table.createdAt),
    index("patterns_user_id_idx").on(table.userId),
  ],
);

// One row per (user, pattern). The composite primary key makes a double like
// impossible at the storage layer, so no application-side de-duplication.
export const likes = sqliteTable(
  "likes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.patternId] }),
    index("likes_pattern_id_idx").on(table.patternId),
  ],
);

// ── Discussions ────────────────────────────────────────────────────────────────────
// Plain-text discussion, separate from patterns. A post is a title and a body;
// that's the whole feature. No attachments, no markup — bodies are stored as
// typed and escaped by React on output, same rule as comments.

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt),
    index("posts_user_id_idx").on(table.userId),
  ],
);

/**
 * Discussion comments get their own table rather than a nullable `pattern_id` on
 * `comments`. Relaxing that column would mean rebuilding a populated table in
 * SQLite, and a single table addressing two parents needs a constraint saying
 * exactly one is set — more moving parts than the small amount of duplication
 * this costs.
 */
export const postComments = sqliteTable(
  "post_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("post_comments_post_id_idx").on(table.postId)],
);

// ── Firmware builds ──────────────────────────────────────────────────────────
// A build is slow (~15 s) and CPU-bound, so the web request only enqueues one
// and a separate worker process picks it up. Without that split, concurrent
// requests would compile in-process and starve the site of the cores it is
// running on.
//
// The submitted headers are stored inline rather than referenced: a build is
// then self-contained and stays reproducible even if the pattern it came from
// is later edited or deleted.
export const builds = sqliteTable(
  "builds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** queued → running → done | error */
    status: text("status").notNull().default("queued"),
    /**
     * What the worker produces. "bin" is a whole flashable image — the legacy
     * path, and still what a device running firmware older than the module
     * loader needs. "pfm" is loadable modules: one .pfm per pattern, zipped,
     * built in ~½ s and installed over Wi-Fi at the device's /patterns page
     * with no reflash.
     */
    format: text("format").notNull().default("bin"),
    /** JSON: [{ label, code }] — the C++ headers to build. */
    patterns: text("patterns").notNull(),
    /** Namespaces resolved at assembly time, for display. */
    namespaces: text("namespaces"),
    /** Filename of the finished image, relative to the artifact directory. */
    artifact: text("artifact"),
    artifactBytes: integer("artifact_bytes"),
    /** Compiler output when status is "error" — shown to the author. */
    error: text("error"),
    /** Which worker claimed it; helps when more than one is running. */
    worker: text("worker"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
  },
  (table) => [
    // The worker's claim query orders queued jobs by age.
    index("builds_status_created_idx").on(table.status, table.createdAt),
    index("builds_user_id_idx").on(table.userId),
  ],
);

// ── Moderation ───────────────────────────────────────────────────────────────
// A report is a record, not a pointer. `targetId` and `targetUserId` carry NO
// foreign key on purpose: the whole reason to keep reports is to see that the
// same account has been reported before, and a cascade would erase exactly that
// history the moment the offending pattern is removed. The title is snapshotted
// for the same reason — so a resolved report still reads as something.
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    /** "pattern" | "post" | "comment" */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** What it was called when it was reported. */
    targetTitle: text("target_title"),
    /** Who authored the reported content — the repeat-infringer signal. */
    targetUserId: text("target_user_id"),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "copyright" | "inappropriate" | "spam" | "malicious" | "other" */
    reason: text("reason").notNull(),
    detail: text("detail"),
    /** "open" | "actioned" | "dismissed" */
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (table) => [
    index("reports_status_created_idx").on(table.status, table.createdAt),
    index("reports_target_user_idx").on(table.targetUserId),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("comments_pattern_id_idx").on(table.patternId)],
);
