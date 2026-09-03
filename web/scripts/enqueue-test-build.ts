/**
 * Put one build on the queue, for testing the worker without the web UI.
 *
 *   npm run build:enqueue                    # whole image from the template
 *   npm run build:enqueue -- path/to.h       # or a header of your choosing
 *   npm run build:enqueue -- --pfm path/to.h # loadable modules instead
 *
 * Prints the build id, then poll it with:  npm run build:status -- <id>
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./loadEnv";

loadEnv();

async function main() {
  const { enqueueBuild } = await import("../src/lib/community/server/builds");
  const { getDb } = await import("../src/lib/community/server/db");
  const { user } = await import("../src/lib/community/server/schema");

  const args = process.argv.slice(2);
  const pfm = args.includes("--pfm");
  const headerArg = args.find((a) => a !== "--pfm");
  const headerPath = headerArg
    ? path.resolve(process.cwd(), headerArg)
    : path.resolve(process.cwd(), "../firmware/patternflow/_TEMPLATE.h");

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
  const id = await enqueueBuild(
    accounts[0].id,
    [{ label: path.basename(headerPath), code }],
    pfm ? "pfm" : "bin",
  );

  console.log(`queued ${pfm ? "module" : "image"} build ${id}`);
  console.log(`  header : ${headerPath} (${(code.length / 1024).toFixed(1)} KB)`);
  console.log(`  as     : ${accounts[0].name}`);
  console.log(`\nnpm run build:status -- ${id}`);
}

void main();
