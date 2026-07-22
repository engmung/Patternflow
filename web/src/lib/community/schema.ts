import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
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
    /** Complete standalone pattern source (setup/update/draw), plain JS text. */
    code: text("code").notNull(),
    /** SPDX id chosen at publish time. Same options as the Discord share flow. */
    license: text("license").notNull().default("CC-BY-SA-4.0"),
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
