/**
 * Retention sweep — `npm run sweep` (add `-- --dry-run` to look first).
 *
 * Deletes what /terms §9 says we delete: expired sessions, sessions over 90
 * days, expired verification tokens, and build artifacts over 30 days.
 *
 * The build worker runs this daily on its own (see build-worker.ts), so this
 * script exists for two other cases: checking what is about to go before it
 * goes, and cleaning up on a box where the worker is not running.
 */
import { loadEnv } from "./loadEnv";

loadEnv();

import {
  BUILD_MAX_AGE_DAYS,
  SESSION_MAX_AGE_DAYS,
  describeSweep,
  previewRetention,
  sweepRetention,
} from "../src/lib/community/retention";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(
    `Retention: sessions ${SESSION_MAX_AGE_DAYS}d · build artifacts ${BUILD_MAX_AGE_DAYS}d`,
  );

  if (dryRun) {
    const preview = await previewRetention();
    console.log("\nDry run — nothing deleted. Would remove:");
    console.log(`  expired sessions       ${preview.expiredSessions}`);
    console.log(`  sessions over ${SESSION_MAX_AGE_DAYS}d      ${preview.oldSessions}`);
    console.log(`  expired verifications  ${preview.expiredVerifications}`);
    console.log(`  builds over ${BUILD_MAX_AGE_DAYS}d         ${preview.oldBuilds}`);
    console.log("\nOrphaned artifact files are only counted during a real run.");
    return;
  }

  const started = Date.now();
  const result = await sweepRetention();
  console.log(`\n${describeSweep(result)}`);
  console.log(`took ${Date.now() - started} ms`);

  if (result.errors.length > 0) {
    console.error(`\n${result.errors.length} problem(s):`);
    for (const error of result.errors) console.error(`  ${error}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
