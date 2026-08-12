import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
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
    /**
     * "public" | "private" — shared, or the author alone.
     *
     * Public is on the wall and openable by anyone. Private is the author
     * alone, and cannot go into a shared deck — somebody else's running order
     * is not a place a private thing belongs. Moderators keep sight of
     * everything either way: visibility is not a shield from a report.
     */
    visibility: text("visibility").notNull().default("public"),
    /**
     * The community port the author chose, when they chose one. No foreign
     * key (the delete path clears it): resolution falls back gracefully when
     * the row it names is gone or stale. See lib/community/ports.ts for the
     * order — the author's own header always outranks it.
     */
    pinnedHeaderId: text("pinned_header_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("patterns_created_at_idx").on(table.createdAt),
    index("patterns_user_id_idx").on(table.userId),
    // The feed's exact shape: visible rows, newest first.
    index("patterns_visibility_created_idx").on(table.visibility, table.createdAt),
  ],
);

// ── Community firmware ports ─────────────────────────────────────────────────
// Some people make patterns without owning a board; some people own boards.
// A port is the second group finishing the first group's work: a hand-verified
// .h for somebody else's pattern, live the moment it is submitted — an
// acceptance queue would rot on authors who moved on. Several can coexist
// (the first may be wrong); arrival order breaks ties and the author's pick
// overrides it (patterns.pinnedHeaderId). The author's own header, when they
// attach one, outranks everything.
//
// A port is a derivative of the pattern, so it lives under the pattern's
// licence with the porter credited — same rule as forks, applied to C++.

export const patternHeaders = sqliteTable(
  "pattern_headers",
  {
    id: text("id").primaryKey(),
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    /** The porter — the person whose board vouched for it. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeCpp: text("code_cpp").notNull(),
    /** Porter's word on how it was verified — "tested on v2.1" etc. */
    note: text("note"),
    /**
     * Set when the pattern's JS changes after this port was made: the port is
     * of a SPECIFIC version, and once the source moves the guarantee is gone.
     * Stale rows stay listed ("for an older version") but stop resolving —
     * the same rule that detaches the author's own header, kept visible.
     */
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    // Resolution reads "oldest live port for this pattern".
    index("pattern_headers_pattern_created_idx").on(table.patternId, table.createdAt),
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

// ── Shared decks ─────────────────────────────────────────────────────────────
// A deck is an ordered set of patterns — a setlist, because the device cycles
// them in sequence. The working deck stays in the browser's localStorage
// (lib/community/deck.ts); a row here is the explicit act of sharing one.
//
// Publishing is deliberately scarce: two PUBLIC decks per account (see
// PUBLIC_DECKS_MAX). That is a curation policy, not a technical limit — a
// shelf you must ration is a shelf you curate. Private decks are
// not rationed.

export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** "public" | "private" — same two states as patterns. */
    visibility: text("visibility").notNull().default("private"),
    /**
     * The deck's downloadable pack, cached.
     *
     * A deck's whole point is being handed to someone else, and the honest
     * form of that is a `.zip` of `.pfm` + `.json` + `catalog.txt` you drop
     * on a device's /patterns page. Building one costs a compile, so it is
     * built once and reused: `zipBuildId` points at the builds row holding
     * the artifact, and `zipFingerprint` records WHICH running order it was
     * built from. Reorder or swap a pattern and the fingerprint stops
     * matching, which is the invalidation — no cache-busting, no TTL.
     */
    zipBuildId: text("zip_build_id"),
    zipFingerprint: text("zip_fingerprint"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("decks_user_id_idx").on(table.userId),
    index("decks_visibility_created_idx").on(table.visibility, table.createdAt),
  ],
);

export const deckPatterns = sqliteTable(
  "deck_patterns",
  {
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    /**
     * NO foreign key on purpose (same reasoning as reports): deleting a pattern
     * must leave a visible gap in the running order, not silently shorten
     * somebody's arranged set. The title below is what the gap shows.
     */
    patternId: text("pattern_id").notNull(),
    /** 0-based running order — the order the device cycles them. */
    position: integer("position").notNull(),
    /** What the pattern was called when the deck was published. */
    titleSnapshot: text("title_snapshot").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deckId, table.patternId] }),
    // The feed's "in decks" ranking signal counts through this.
    index("deck_patterns_pattern_id_idx").on(table.patternId),
  ],
);

// ── Discussions ────────────────────────────────────────────────────────────────────
// The free board, separate from patterns. A post is a title and a body;
// that's the whole feature. No attachments — bodies are stored as typed and
// escaped by React on output, same rule as comments. (Rendering grants one
// nicety, the ``` code fence; storage stays exactly what was typed.)

/**
 * The marquee: the handful of patterns across the top of /community.
 *
 * Moderator-chosen, because it is the first thing anyone sees and "most liked"
 * is not the same question as "what should this place look like to someone who
 * has never been here". Empty by default, and the home page falls back to
 * most-liked when it is — so nothing breaks if nobody ever curates it.
 *
 * Position is the running order left to right. No foreign key on purpose is
 * NOT the case here: a featured pattern that gets deleted should leave the
 * marquee rather than leave a hole, so it cascades.
 */
export const featuredPatterns = sqliteTable(
  "featured_patterns",
  {
    patternId: text("pattern_id")
      .primaryKey()
      .references(() => patterns.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** Who put it there, for the record. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("featured_patterns_position_idx").on(table.position)],
);

// ── The map ──────────────────────────────────────────────────────────────────
// Where Patternflow could go, and who is working where.
//
// A territory is a DIRECTION, not a milestone: "OSC over a wire", "a laser-cut
// version", "port it to a bigger panel". That is a different axis from
// /roadmap, which is what the project ships and when — a direction can sit
// open for a year with two people poking at it and still be worth a place on
// the map. So the two are deliberately separate lists; do not try to derive
// one from the other.
//
// Territories are authored by moderators. Everything else here — who is
// working on what, and the threads — is written by whoever shows up.
export const territories = sqliteTable(
  "territories",
  {
    id: text("id").primaryKey(),
    /** The short code on the node — "A1", "B3". Uppercase, unique, and part
     *  of the URL, so it is also how a territory is linked to. */
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    /** Floor plan: how many of the six columns this zone spans, and where it
     *  falls in reading order. */
    span: integer("span").notNull().default(2),
    position: integer("position").notNull().default(0),
    /** Constellation: where the node sits on the stage, in the design's
     *  1440×640 coordinates. Scaled to whatever the viewport actually is. */
    x: integer("x").notNull().default(720),
    y: integer("y").notNull().default(320),
    /** The one direction that is next off the bench, if any. */
    shippingNext: integer("shipping_next", { mode: "boolean" }).notNull().default(false),
    /** Open questions, one per line — they hang off the node as dashed spurs.
     *  Labels, not records: "128×128?", "steel front". */
    questions: text("questions"),
    /** Retired rather than deleted: a direction nobody took is still a thing
     *  that was considered, and its threads are still worth reading. */
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("territories_position_idx").on(table.position)],
);

/**
 * "I'm working here."
 *
 * The cheapest possible contribution — one click, no artifact — and the whole
 * point of the map: a direction with three names on it reads differently from
 * the same direction with none. One pin per person per territory; the row's
 * own createdAt is the "since" the UI shows.
 */
export const territoryPins = sqliteTable(
  "territory_pins",
  {
    id: text("id").primaryKey(),
    territoryId: text("territory_id")
      .notNull()
      .references(() => territories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** What they are doing there, in a few words — "steel front", "128×128". */
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("territory_pins_unique").on(table.territoryId, table.userId),
    index("territory_pins_user_idx").on(table.userId),
  ],
);

/**
 * Where somebody is STANDING on the constellation — one square per person,
 * walked around with WASD like a tiny game.
 *
 * Deliberately not a pin and never merged with one. A pin is a subscription
 * with notification side effects, scoped to a territory, and you can hold
 * several; you have exactly one body, it can stand anywhere (including between
 * territories, which is half the fun), and walking it somewhere must never
 * quietly change what you get notified about.
 *
 * No row yet = the account stands at the core with everyone else who has not
 * moved — which doubles as the visible count of people who signed up.
 */
export const presence = sqliteTable("presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Stage coordinates, same 1440×640 space as territories. */
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  /** What they felt like saying — "soldering", "lurking". Not a pin note. */
  status: text("status"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * A pattern placed on the atlas — the map of pattern-technique space
 * (/community/atlas). One pin per pattern, placed and moved by the pattern's
 * author (or a moderator). Coordinates are the atlas's own 0..100 data space:
 * x = order → chaos, y = wire → field.
 *
 * This is deliberately NOT presence and NOT a territory pin: it says "this
 * work lives at this spot of pattern space", nothing about people or threads.
 */
export const atlasPins = sqliteTable("atlas_pins", {
  patternId: text("pattern_id")
    .primaryKey()
    .references(() => patterns.id, { onDelete: "cascade" }),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  /**
   * The atlas entry (technique point in lib/atlas/data.ts) whose prompt this
   * pattern was explored from — its lineage on the map, drawn as a thread.
   * Set by the author: dropping a pattern near a point adopts it, and the pin
   * panel can retarget it. Null = placed in open water, tied to nothing.
   */
  entryId: text("entry_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * A thread. Lives in a territory — the board no longer has an "everything"
 * list, because a question about a direction belongs next to that direction.
 *
 * Still the `posts` table: a thread IS a post that knows where it is, and
 * keeping the name means comments, reports, notifications and the moderation
 * queue all carry over untouched.
 */
export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    territoryId: text("territory_id")
      .notNull()
      .references(() => territories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /**
     * Set on THE notice — the one post moderators keep at the top of the
     * list. One slot, not a flag: pinning a post un-pins the previous one,
     * because two notices are a noticeboard and this is a welcome mat.
     */
    pinnedAt: integer("pinned_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt),
    index("posts_user_id_idx").on(table.userId),
    index("posts_territory_idx").on(table.territoryId, table.createdAt),
  ],
);

/**
 * Files hung on a thread or one of its replies — the DXF, the tolerance notes.
 * This is what makes a territory somewhere work actually happens rather than
 * somewhere it is described.
 *
 * The uploaded name is kept for display only; on disk the file is named by an
 * opaque id, and it is always served as an attachment with a generic type, so
 * nothing here can ever be rendered by the browser as a document.
 */
export const postAttachments = sqliteTable(
  "post_attachments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** Set when the file belongs to a reply rather than the thread's body. */
    commentId: text("comment_id").references((): AnySQLiteColumn => postComments.id, {
      onDelete: "cascade",
    }),
    /** The file outlives its uploader's account — the thread still needs it. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Display name, sanitised on upload. Never used as a path. */
    filename: text("filename").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("post_attachments_post_idx").on(table.postId)],
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
    /** Set when the author rewrites it. A comment that changes with no trace
     *  makes the replies under it read as answers to something never said. */
    editedAt: integer("edited_at", { mode: "timestamp" }),
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

// ── Notifications ────────────────────────────────────────────────────────────
// In-app only, by policy: no email is ever sent (most accounts have none), and
// nothing here is real-time — the badge is read on the next page load, which
// is what a server-rendered site can promise honestly.
//
// A notification is DISPOSABLE — the deliberate opposite of a report. Reports
// must outlive what they point at; a notification pointing at something gone
// is pure noise, so content deletion routes clear these explicitly, and the
// retention sweep ages the rest out (NOTIFICATION_MAX_AGE_DAYS).

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    /** Recipient. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * What happened:
     *   "comment"   — on something the recipient made
     *   "thread"    — on something the recipient commented on earlier
     *   "fork"      — their pattern was forked
     *   "deck"      — their pattern entered someone's public deck
     *   "port"      — a firmware port landed on their pattern
     *   "pin"       — the author pinned the recipient's port
     *   "territory" — a thread started where the recipient is pinned
     */
    type: text("type").notNull(),
    /** Who did it. Cascades: a deleted account takes its acts with it. */
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Where clicking goes: "pattern" | "post" | "deck". No foreign key — the
     * types share one column — so the delete routes clear matching rows
     * themselves, and the read path drops anything that slipped through.
     */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** Title at event time — the row reads without a join. */
    targetTitle: text("target_title").notNull(),
    /**
     * The specific thing that triggered the row — a comment's id, or for
     * "deck" the pattern that was included. The precise cleanup key: when
     * that thing is deleted, rows carrying its id here go with it.
     */
    sourceId: text("source_id"),
    /** Display extra: a comment's first line, or the pattern a deck took. */
    snippet: text("snippet"),
    readAt: integer("read_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    // The badge (unread count) and the list both start from the recipient.
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    // Cleanup paths: by deleted content, and by deleted source.
    index("notifications_target_idx").on(table.targetType, table.targetId),
    index("notifications_source_idx").on(table.sourceId),
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
    /** Set when the author rewrites it — see postComments.editedAt. */
    editedAt: integer("edited_at", { mode: "timestamp" }),
  },
  (table) => [index("comments_pattern_id_idx").on(table.patternId)],
);
