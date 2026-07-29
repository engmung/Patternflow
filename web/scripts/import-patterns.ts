/**
 * Load patterns from a community database snapshot into the local dev database.
 *
 *   npx tsx scripts/import-patterns.ts <snapshot.db>
 *   npx tsx scripts/import-patterns.ts <snapshot.db> --keep   # add, don't replace
 *
 * For testing against realistic content — a handful of hand-made local patterns
 * exercises very little of the cart, the module builder, or the feed.
 *
 * What it copies: patterns, and the likes/comments attached to them.
 *
 * What it deliberately does NOT copy: credentials. No `account` rows (password
 * hashes), no `session` rows, no real email addresses. Authors are recreated as
 * placeholder users that carry only the username — which the site already shows
 * publicly on every pattern card — so attribution renders while nobody's login
 * comes along for the ride. Those placeholders cannot be signed into.
 *
 * Local accounts are left completely alone, so whatever you use to sign in on
 * the dev site keeps working.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadEnv } from "./loadEnv";

loadEnv();

type Row = Record<string, unknown>;

function localDbPath(): string {
  return process.env.COMMUNITY_DB_PATH ?? path.resolve(process.cwd(), "data", "community.db");
}

function columnsOf(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info('${table}')`) as Row[]).map((c) => String(c.name));
}

function copyRows(
  source: Database.Database,
  target: Database.Database,
  table: string,
  where = "",
): number {
  const columns = columnsOf(target, table).filter((c) => columnsOf(source, table).includes(c));
  const rows = source.prepare(`SELECT ${columns.map((c) => `"${c}"`).join(",")} FROM "${table}" ${where}`).all() as Row[];
  if (rows.length === 0) return 0;

  const insert = target.prepare(
    `INSERT OR IGNORE INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) ` +
      `VALUES (${columns.map((c) => `@${c}`).join(",")})`,
  );
  const run = target.transaction((all: Row[]) => {
    for (const row of all) insert.run(row);
  });
  run(rows);
  return rows.length;
}

function main() {
  const args = process.argv.slice(2);
  const keep = args.includes("--keep");
  const snapshotArg = args.find((a) => !a.startsWith("--"));
  if (!snapshotArg) {
    console.error("Usage: tsx scripts/import-patterns.ts <snapshot.db> [--keep]");
    process.exit(1);
  }

  const snapshotPath = path.resolve(process.cwd(), snapshotArg);
  const targetPath = localDbPath();
  if (!fs.existsSync(snapshotPath)) {
    console.error(`No snapshot at ${snapshotPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(targetPath)) {
    console.error(`No local database at ${targetPath} — run the site once first.`);
    process.exit(1);
  }

  // The local database holds the account you sign in with; never proceed
  // without a copy of it sitting next door.
  const backup = `${targetPath}.bak-${Date.now()}`;
  fs.copyFileSync(targetPath, backup);
  console.log(`backup     ${backup}`);

  const source = new Database(snapshotPath, { readonly: true });
  const target = new Database(targetPath);
  target.pragma("foreign_keys = OFF"); // rows arrive before the users they point at

  if (!keep) {
    const before = target.prepare("SELECT COUNT(*) c FROM patterns").get() as { c: number };
    target.exec("DELETE FROM likes; DELETE FROM comments; DELETE FROM patterns;");
    console.log(`cleared    ${before.c} local pattern(s) and their likes/comments`);
  }

  // Placeholder authors: username only, no credentials, unusable for sign-in.
  const authors = source
    .prepare(
      `SELECT DISTINCT u.id, u.username, u.display_username, u.name, u.created_at, u.updated_at
       FROM user u JOIN patterns p ON p.user_id = u.id`,
    )
    .all() as Row[];

  const insertUser = target.prepare(
    `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, image, created_at, updated_at, username, display_username)
     VALUES (@id, @name, @email, 0, NULL, @created_at, @updated_at, @username, @display_username)`,
  );
  let added = 0;
  for (const author of authors) {
    const existing = target.prepare("SELECT 1 FROM user WHERE id = ?").get(author.id);
    if (existing) continue;
    insertUser.run({
      id: author.id,
      name: author.name ?? author.username,
      // Not the real address. Nothing can be sent here and no account row
      // exists, so this identity has no way in.
      email: `${String(author.username)}@imported.invalid`,
      created_at: author.created_at,
      updated_at: author.updated_at,
      username: author.username,
      display_username: author.display_username ?? author.username,
    });
    added++;
  }
  console.log(`authors    ${added} placeholder(s) created (no credentials copied)`);

  const patterns = copyRows(source, target, "patterns");
  const likes = copyRows(source, target, "likes");
  const comments = copyRows(source, target, "comments");
  console.log(`imported   ${patterns} patterns, ${likes} likes, ${comments} comments`);

  // Anything pointing at a user that did not come across would 404 in the UI.
  const orphans = target
    .prepare("SELECT COUNT(*) c FROM patterns WHERE user_id NOT IN (SELECT id FROM user)")
    .get() as { c: number };
  const hardware = target
    .prepare("SELECT COUNT(*) c FROM patterns WHERE code_cpp IS NOT NULL AND code_cpp != ''")
    .get() as { c: number };
  const total = target.prepare("SELECT COUNT(*) c FROM patterns").get() as { c: number };

  target.pragma("foreign_keys = ON");
  source.close();
  target.close();

  console.log(`\nnow        ${total.c} patterns, ${hardware.c} hardware-ready (.h, cart-eligible)`);
  if (orphans.c > 0) console.log(`WARNING    ${orphans.c} pattern(s) reference a missing author`);
  console.log(`restore    copy ${path.basename(backup)} back over community.db`);
}

main();
