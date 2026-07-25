/**
 * Put one build on the queue, for testing the worker without the web UI.
 *
 *   npm run build:enqueue                 # uses firmware/patternflow/custom1.h
 *   npm run build:enqueue -- path/to.h    # or a header of your choosing
 *
 * Prints the build id, then poll it with:  npm run build:status -- <id>
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./loadEnv";

loadEnv();

async function main() {
  const { enqueueBuild } = await import("../src/lib/community/builds");
  const { getDb } = await import("../src/lib/community/db");
  const { user } = await import("../src/lib/community/schema");

  const headerArg = process.argv[2];
  const headerPath = headerArg
    ? path.resolve(process.cwd(), headerArg)
    : path.resolve(process.cwd(), "../firmware/patternflow/custom1.h");

  if (!fs.existsSync(headerPath)) {
    console.error(`No header at ${headerPath}`);
    process.exit(1);
  }

  // Builds belong to a user, so borrow the first account in the database.
  const accounts = await getDb().select({ id: user.id, name: user.username }).from(user).limit(1);
  if (accounts.length === 0) {
    console.error("No accounts exist yet — sign up on the site first, then rerun.");
    process.exit(1);
  }

  const code = fs.readFileSync(headerPath, "utf8");
  const id = await enqueueBuild(accounts[0].id, [{ label: path.basename(headerPath), code }]);

  console.log(`queued build ${id}`);
  console.log(`  header : ${headerPath} (${(code.length / 1024).toFixed(1)} KB)`);
  console.log(`  as     : ${accounts[0].name}`);
  console.log(`\nnpm run build:status -- ${id}`);
}

void main();
