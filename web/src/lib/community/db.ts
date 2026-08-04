import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

// One SQLite file is the whole community database. Backup = copy the file.
// The path is overridable so the Raspberry Pi deployment can keep data on a
// mounted disk outside the repo checkout.
//
// NOTE: this module must only be imported from server code (route handlers,
// server components). It is lazy so that merely bundling it — e.g. on the
// Vercel deployment where the community is disabled — never opens a database.

export type CommunityDb = ReturnType<typeof createDb>;

let instance: CommunityDb | null = null;

/** Community routes are only active where this env flag is set (the Pi). */
export function communityEnabled(): boolean {
  return process.env.COMMUNITY_ENABLED === "1";
}

/** Where the disabled deployment (Vercel) points visitors instead. */
export function communityHomeUrl(): string {
  return process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "https://community.patternflow.work";
}

/** The SQLite file. Overridable so the Pi can keep data on a mounted disk. */
function dbFile(): string {
  return process.env.COMMUNITY_DB_PATH ?? path.join(process.cwd(), "data", "community.db");
}

/**
 * Where anything that is not a database row lives — currently thread
 * attachments. Beside the database on purpose: "back up the community" stays
 * one directory, and a Pi with data on a mounted disk gets both without a
 * second setting.
 */
export function communityDataDir(): string {
  return path.dirname(dbFile());
}

function createDb() {
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export function getDb(): CommunityDb {
  if (!instance) instance = createDb();
  return instance;
}
