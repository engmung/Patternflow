/**
 * Module cache, end to end with the REAL toolchain — `npm run check:modcache-e2e`.
 *
 * check:modcache proves the logic with a fake compiler, because CI has no
 * Xtensa toolchain. This is the other half, run locally where one exists
 * (the same machines module-build-smoke.ts runs on): a real preset header goes
 * through the worker's job processor with the real compileModule() and the
 * real toolchain revision, into a throwaway database, and back out of the
 * real zip route. Then the same header is baked again, and sent, and neither
 * may start a single process — that is the whole point of the cache.
 *
 * Every child process is counted by wrapping child_process.spawn before the
 * build code is loaded.
 *
 *   npx tsx scripts/module-cache-e2e.ts
 */
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-modcache-e2e-"));
process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
process.env.BUILD_ARTIFACT_DIR = path.join(tmp, "builds");
process.env.COMMUNITY_ENABLED = "1";
process.env.BUILD_ENABLED = "1";

// ── Count every process the build code starts ─────────────────────────────
const spawned: string[] = [];
const realSpawn = childProcess.spawn;
(childProcess as { spawn: typeof realSpawn }).spawn = ((command: string, args?: readonly string[], options?: object) => {
  const script = (args ?? []).find((arg) => arg.endsWith(".py"));
  spawned.push(script ? `${path.basename(command)} ${path.basename(script)}` : `${path.basename(command)} ${(args ?? []).join(" ")}`);
  return realSpawn(command, args ?? [], options ?? {});
}) as typeof realSpawn;
syncBuiltinESMExports();

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok || !detail ? "" : `\n        ${detail}`}`);
}
const pythonSpawns = () => spawned.filter((line) => line.includes(".py")).length;

async function main() {
  const { unzipSync } = await import("fflate");
  const { getDb } = await import("../src/lib/community/server/db");
  const schema = await import("../src/lib/community/server/schema");
  const builds = await import("../src/lib/community/server/builds");
  const cache = await import("../src/lib/community/server/moduleCache");
  const jobs = await import("../src/lib/community/server/buildJobs");
  const { computeBuilderRev } = await import("../src/lib/firmware/builderRev");
  const { compileModule } = await import("../src/lib/firmware/moduleRunner");
  const patternZipRoute = await import("../src/app/api/community/patterns/[id]/zip/route");
  const { firmwareSrcDir } = await import("../src/lib/firmware/paths");

  const db = getDb();
  const now = new Date();
  const WORK = path.join(tmp, "work");
  const compileIn = async (workDir: string, code: string) => {
    try {
      return await compileModule(code, { workDir });
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  };
  // The worker's canary, as build-worker.ts runs it: the curated Origin
  // preset through the real toolchain, before any failure is cached.
  let canaryRuns = 0;
  let canaryPassed = false;
  const deps: import("../src/lib/community/server/buildJobs").BuildJobDeps = {
    compile: (code, { jobId, index }) => compileIn(path.join(WORK, `${jobId}-${index}`), code),
    builderRev: computeBuilderRev,
    infraBackoff: new Map(),
    canary: async () => {
      canaryRuns += 1;
      const origin = fs.readFileSync(path.join(firmwareSrcDir(), "presets", "preset_origin.h"), "utf8");
      const result = await compileIn(path.join(WORK, "canary"), origin);
      if (!result.ok) console.log(`  canary failed: ${result.error.slice(-400)}`);
      canaryPassed = result.ok;
      return result.ok;
    },
  };

  const header = fs.readFileSync(path.join(firmwareSrcDir(), "presets", "preset_wave_saw.h"), "utf8");
  await db.insert(schema.user).values({
    id: "u-author", name: "seunghun", email: "seunghun@patternflow.local", emailVerified: false,
    createdAt: now, updatedAt: now, username: "seunghun", displayUsername: "Seunghun",
  });
  await db.insert(schema.patterns).values({
    id: "p-wave", userId: "u-author", title: "Wave Saw", code: "// js", codeCpp: header,
    license: "CC-BY-SA-4.0", visibility: "public", createdAt: now, updatedAt: now,
  });
  const zip = (query = "") =>
    patternZipRoute.GET(new Request(`http://localhost:3000/api/community/patterns/p-wave/zip${query}`), {
      params: Promise.resolve({ id: "p-wave" }),
    });

  // ── Toolchain revision ──────────────────────────────────────────────────
  let t = Date.now();
  const rev = await computeBuilderRev();
  const revMs = Date.now() - t;
  t = Date.now();
  const revAgain = await computeBuilderRev();
  const revAgainMs = Date.now() - t;
  console.log(`\nbuilder rev ${rev.slice(0, 16)}…  first ${revMs} ms, again ${revAgainMs} ms`);
  check("the revision is stable across calls", rev === revAgain);
  check("…and a full sha256", /^[0-9a-f]{64}$/.test(rev));
  check("the compiler's --version is asked once, then remembered", spawned.filter((s) => s.includes("--version")).length === 1, spawned.join(" | "));

  // ── First request: a miss, a bake, a real compile ───────────────────────
  console.log("\nfirst download — nothing cached");
  const first = await zip();
  check("the route answers 202 and queues a bake", first.status === 202, `status ${first.status}`);

  // A stale object from an earlier submitter left under firmware/modules/.build
  // would be readable to this compile. Plant one and prove the worker wipes the
  // directory when it builds (moduleRunner.ts finally). On a non-ASCII checkout
  // build_module.py stages elsewhere and never fills .build itself, so the
  // planted object is the only thing that makes "gone afterwards" meaningful.
  const buildCacheDir = path.resolve(firmwareSrcDir(), "..", "modules", ".build");
  fs.mkdirSync(path.join(buildCacheDir, "someone_else"), { recursive: true });
  fs.writeFileSync(path.join(buildCacheDir, "someone_else", "pattern.o"), "another submitter's object");
  check("a stale object sits in firmware/modules/.build before the bake", fs.existsSync(path.join(buildCacheDir, "someone_else", "pattern.o")));

  const spawnsBefore = pythonSpawns();
  t = Date.now();
  const baked = await jobs.processNextBuild("e2e", deps);
  const bakeMs = Date.now() - t;
  console.log(`  bake #1: ${bakeMs} ms, ${pythonSpawns() - spawnsBefore} python process(es), outcome ${JSON.stringify(baked)}`);
  check("the bake compiled the header", baked?.status === "done" && baked.compiled === 1, JSON.stringify(baked));
  check("…with the two toolchain scripts", pythonSpawns() - spawnsBefore === 2, spawned.join(" | "));
  check("…and firmware/modules/.build is gone afterwards — no object left for the next compile", !fs.existsSync(buildCacheDir));

  const row = await cache.lookupModule(cache.sourceSha(header), rev);
  check("a done row under the real revision", row?.status === "done" && row.slug === "wave_saw", JSON.stringify({ status: row?.status, slug: row?.slug, error: row?.error?.slice(0, 400) }));

  t = Date.now();
  const served = await zip();
  const serveMs = Date.now() - t;
  const entries = unzipSync(new Uint8Array(await served.arrayBuffer()));
  console.log(`  served from the cache in ${serveMs} ms: ${Object.keys(entries).join(", ")}`);
  check("then the route serves the zip", served.status === 200);
  const pfm = Buffer.from(entries["wave_saw.pfm"] ?? []);
  check("a real module: ELF, relocatable, Xtensa", pfm.subarray(0, 4).toString("binary") === "\x7fELF" && pfm.readUInt16LE(16) === 1 && pfm.readUInt16LE(18) === 94);
  check("byte-identical to what the worker compiled", pfm.equals(Buffer.from(row!.pfm!)));
  const sidecar = JSON.parse(new TextDecoder().decode(entries["wave_saw.json"]));
  check("sidecar: name first and right", Object.keys(sidecar)[0] === "name" && sidecar.name === "Wave Saw");
  check("sidecar: the author is the community account, not the // Author: comment", sidecar.author === "Seunghun", sidecar.author);
  check("sidecar: absoluteReady carried through", sidecar.absoluteReady === true);
  check("sidecar: no worker path", !("source" in sidecar) && !("opt" in sidecar));

  // ── The same header again: a bake and a send, zero processes ────────────
  console.log("\nthe same header again");
  await builds.enqueueBuild("u-author", [{ label: "Wave Saw", code: header }], "pfm", {
    sourceSha: cache.sourceSha(header),
  });
  const spawnsBeforeHit = spawned.length;
  t = Date.now();
  const hit = await jobs.processNextBuild("e2e", deps);
  const hitMs = Date.now() - t;
  console.log(`  bake #2: ${hitMs} ms, ${spawned.length - spawnsBeforeHit} process(es), outcome ${JSON.stringify(hit)}`);
  check("the second bake is a cache hit", hit?.status === "done" && hit.hits === 1 && hit.compiled === 0);
  check("…that started no process at all", spawned.length === spawnsBeforeHit, spawned.slice(spawnsBeforeHit).join(" | "));

  const sendId = await builds.enqueueBuild("u-author", [{ label: "Wave Saw", code: header.replace(/\n/g, "\r\n") }], "pfm");
  const spawnsBeforeSend = spawned.length;
  t = Date.now();
  const send = await jobs.processNextBuild("e2e", deps);
  const sendMs = Date.now() - t;
  console.log(`  send (CRLF copy): ${sendMs} ms, ${spawned.length - spawnsBeforeSend} process(es)`);
  check("a send of the same header reuses it, no process", send?.hits === 1 && send.compiled === 0 && spawned.length === spawnsBeforeSend);
  const sendZip = unzipSync(new Uint8Array(fs.readFileSync(path.join(builds.artifactDir(), `${sendId}.zip`))));
  check("…and still writes its zip with catalog.txt", Buffer.from(sendZip["wave_saw.pfm"]).equals(pfm) && "catalog.txt" in sendZip);

  // ── A real compile error: cached, and readable ───────────────────────────
  console.log("\na header that does not compile");
  const broken = header.replace("namespace WaveSaw {", "namespace WaveSawBroken {\n  int broken() { return undefined_symbol_here; }");
  // Published, like every header a bake is for — the worker skips a bake
  // whose text is no longer on the site.
  await db.insert(schema.patterns).values({
    id: "p-broken", userId: "u-author", title: "Broken Saw", code: "// js", codeCpp: broken,
    license: "CC-BY-SA-4.0", visibility: "public", createdAt: now, updatedAt: now,
  });
  await builds.enqueueBuild("u-author", [{ label: "broken", code: broken }], "pfm", { sourceSha: cache.sourceSha(broken) });
  t = Date.now();
  const failed = await jobs.processNextBuild("e2e", deps);
  console.log(`  bake: ${Date.now() - t} ms (canary included), outcome ${JSON.stringify({ ...failed, error: failed?.error?.slice(0, 120) })}`);
  check("the canary compiled the Origin preset before the verdict was kept", canaryRuns === 1 && canaryPassed);
  const errorRow = await cache.lookupModule(cache.sourceSha(broken), rev);
  check("the real compiler's error is classed deterministic and cached", errorRow?.status === "error" && failed?.cachedError === true);
  check("…naming the problem", Boolean(errorRow?.error?.includes("undefined_symbol_here")), errorRow?.error ?? "");
  check("…without the worker's paths", !errorRow?.error?.includes(WORK) && !errorRow?.error?.includes(tmp), errorRow?.error ?? "");
  console.log(`  cached error (first line): ${errorRow?.error?.split("\n").find((line) => line.includes("error"))}`);

  console.log(`\nprocesses started in total: ${spawned.length}`);
  for (const line of spawned) console.log(`  ${line}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    try {
      const { getDb } = await import("../src/lib/community/server/db");
      getDb().$client.close();
    } catch {
      // never opened
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failures === 0 ? "\nEnd-to-end module cache checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
