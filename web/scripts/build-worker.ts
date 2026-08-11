/**
 * Firmware build worker.
 *
 * Runs as its own process, beside the web server but not inside it: a build
 * pegs a core for ~15 seconds, and doing that in a request handler would let
 * concurrent uploads starve the site of the CPU it is running on.
 *
 *   npx tsx scripts/build-worker.ts
 *
 * One worker owns one sketch directory and one build path, and takes one job at
 * a time. For two concurrent builds, run two workers with different
 * BUILD_WORK_DIR and WORKER_ID — never point two at the same directories, as
 * they would overwrite each other's intermediates and lose the warm cache that
 * makes a build 15 s instead of 2 min.
 *
 * ⚠️  This compiles submitted C++ with no sandbox of its own. See the warning
 * in src/lib/firmware/buildRunner.ts before letting anyone but the maintainer
 * reach it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./loadEnv";

loadEnv();

import {
  artifactDir,
  claimNextBuild,
  completeBuild,
  failBuild,
  parseBuildPatterns,
} from "../src/lib/community/builds";
import { describeSweep, sweepRetention } from "../src/lib/community/retention";
import { runModuleBuildZipped } from "../src/lib/firmware/moduleRunner";

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;
const POLL_MS = Number(process.env.BUILD_POLL_MS ?? 2000);

// Defaults assume the worker is started from web/ in a repo checkout.
const FIRMWARE_SRC_DIR =
  process.env.FIRMWARE_SRC_DIR ?? path.resolve(process.cwd(), "../firmware/patternflow");
const WORK_DIR = process.env.BUILD_WORK_DIR ?? path.resolve(process.cwd(), "../.build-worker");

const options = {
  firmwareSrcDir: FIRMWARE_SRC_DIR,
  // Keeps the source directory's name: arduino-cli requires a sketch folder to
  // contain a .ino of the same name, so renaming this to "sketch" would make
  // every build fail to find patternflow.ino.
  sketchDir: path.join(WORK_DIR, path.basename(FIRMWARE_SRC_DIR)),
  buildPath: path.join(WORK_DIR, "cache"),
  artifactDir: artifactDir(),
};

let stopping = false;

function log(message: string, extra: Record<string, unknown> = {}) {
  const detail = Object.entries(extra)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[${new Date().toISOString()}] [${WORKER_ID}] ${message}${detail ? ` ${detail}` : ""}`);
}

// ── Retention ────────────────────────────────────────────────────────────────
// The sweep lives here rather than in its own systemd timer because this
// process is already running forever on the same box with the same database,
// and a promise in /terms should not depend on someone remembering to install
// a second unit file. `npm run sweep` runs the same code by hand.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastSweep = 0;

async function maybeSweep(): Promise<void> {
  if (Date.now() - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = Date.now();
  try {
    const result = await sweepRetention();
    log(`retention swept — ${describeSweep(result)}`);
    for (const error of result.errors) log(`retention problem: ${error}`);
  } catch (error) {
    // Never fatal: the queue matters more than the sweep, and the next pass is
    // a day away regardless.
    log(`retention failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function processOne(): Promise<boolean> {
  const job = await claimNextBuild(WORKER_ID);
  if (!job) return false;

  const patterns = parseBuildPatterns(job.patterns);
  log("build started", { id: job.id, patterns: patterns.length });
  const startedAt = Date.now();

  try {
    // Every job is a module build now: each pattern compiles alone (~½ s) and
    // the artifact is a zip of .pfm/.json pairs plus catalog.txt, which the
    // device's /patterns page installs without a reflash. Whole-image builds
    // are gone — see the note in api/community/builds/route.ts.
    const zipPath = path.join(artifactDir(), `${job.id}.zip`);
    const result = await runModuleBuildZipped(patterns, zipPath, {
      workDir: path.join(WORK_DIR, "modules", job.id),
    });
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (result.ok) {
      await completeBuild(job.id, {
        artifact: `${job.id}.zip`,
        artifactBytes: result.zipBytes,
        namespaces: result.namespaces,
      });
      log("modules ok", { id: job.id, seconds, kb: Math.round(result.zipBytes / 1024) });
    } else {
      await failBuild(job.id, result.error);
      log("modules failed", { id: job.id, seconds });
    }
  } catch (error) {
    // An unexpected throw must still release the job, or it sits in "running"
    // until the stale reaper picks it up ten minutes later.
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    await failBuild(job.id, message);
    log("build crashed", { id: job.id });
  } finally {
    await fs.rm(path.join(WORK_DIR, "modules", job.id), { recursive: true, force: true })
      .catch(() => {});
  }

  return true;
}

async function main() {
  log("starting", {
    firmware: options.firmwareSrcDir,
    work: WORK_DIR,
    artifacts: options.artifactDir,
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1); // second signal: give up waiting
      stopping = true;
      log("stopping after the current build");
    });
  }

  await maybeSweep();

  while (!stopping) {
    let worked = false;
    try {
      worked = await processOne();
    } catch (error) {
      // Database hiccup, not a build failure — back off and keep going rather
      // than exiting, so a transient error doesn't take the queue down.
      log(`poll error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!worked && !stopping) {
      await maybeSweep();
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  log("stopped");
  process.exit(0);
}

void main();
