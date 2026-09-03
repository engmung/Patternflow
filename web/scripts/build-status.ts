/**
 * Show a build's state.
 *
 *   npm run build:status -- <build-id>
 *   npm run build:status              # the most recent build
 */
import { loadEnv } from "./loadEnv";

loadEnv();

async function main() {
  const { getBuild, parseBuildPatterns, artifactDir } = await import("../src/lib/community/server/builds");
  const { getDb } = await import("../src/lib/community/server/db");
  const { builds } = await import("../src/lib/community/server/schema");
  const { desc } = await import("drizzle-orm");
  const path = await import("node:path");

  const id = process.argv[2];
  const build = id
    ? await getBuild(id)
    : (await getDb().select().from(builds).orderBy(desc(builds.createdAt)).limit(1))[0];

  if (!build) {
    console.log(id ? `No build ${id}` : "No builds yet.");
    process.exit(1);
  }

  const seconds =
    build.startedAt && build.finishedAt
      ? ((build.finishedAt.getTime() - build.startedAt.getTime()) / 1000).toFixed(1)
      : null;

  console.log(`build   : ${build.id}`);
  console.log(`status  : ${build.status} (${build.format})`);
  console.log(`patterns: ${parseBuildPatterns(build.patterns).map((p) => p.label).join(", ")}`);
  if (build.namespaces) console.log(`namespac: ${build.namespaces}`);
  if (build.worker) console.log(`worker  : ${build.worker}`);
  if (seconds) console.log(`took    : ${seconds}s`);
  if (build.artifact) {
    console.log(`${build.format === "pfm" ? "modules" : "image  "} : ${path.join(artifactDir(), build.artifact)}`);
    console.log(`size    : ${((build.artifactBytes ?? 0) / 1024).toFixed(0)} KB`);
  }
  if (build.error) console.log(`\n--- error ---\n${build.error}`);
}

void main();
