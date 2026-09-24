/**
 * Firmware build worker.
 *
 * Runs as its own process, beside the web server but not inside it: a compile
 * pegs a core, and doing that in a request handler would let concurrent
 * uploads starve the site of the CPU it is running on.
 *
 *   npx tsx scripts/build-worker.ts
 *
 * This file is the loop — poll, sleep, signals, the daily retention sweep,
 * the idle warm-up. What a job actually does (bakes into the module cache,
 * sends into a zip) is src/lib/community/server/buildJobs.ts, with the real
 * compiler handed in from here so the same code runs under a fake one in the
 * smoke test.
 *
 * One worker per firmware checkout, taking one job at a time. Do NOT run a
 * second one against the same checkout, whatever its BUILD_WORK_DIR:
 * build_module.py compiles every module's object into the checkout's own
 * firmware/modules/.build/<slug>/pattern.o (only a non-ASCII path gets a
 * private staging directory), and <slug> comes from the pattern's NAME — so
 * two workers compiling two headers that share a NAME can link each other's
 * object, and the module cache would then keep that module under the wrong
 * header for everyone who installs it. The queue itself is safe with several
 * workers (builds.ts claimNextBuild); the compile directory is not, until
 * build_module.py takes a per-job build directory.
 *
 * ⚠️  This compiles submitted C++ with no sandbox of its own. The community
 * host runs it inside one — docs/SERVICES.md — and nobody else should expose
 * it before reading that.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./loadEnv";

loadEnv();

import { artifactDir } from "../src/lib/community/server/builds";
import {
  processNextBuild,
  warmIdle,
  type BuildJobDeps,
} from "../src/lib/community/server/buildJobs";
import { describeSweep, sweepRetention } from "../src/lib/community/server/retention";
import { computeBuilderRev } from "../src/lib/firmware/builderRev";
import { compileModule } from "../src/lib/firmware/moduleRunner";

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;
const POLL_MS = Number(process.env.BUILD_POLL_MS ?? 2000);

// Defaults assume the worker is started from web/ in a repo checkout.
const FIRMWARE_SRC_DIR =
  process.env.FIRMWARE_SRC_DIR ?? path.resolve(process.cwd(), "../firmware/patternflow");
const WORK_DIR = process.env.BUILD_WORK_DIR ?? path.resolve(process.cwd(), "../.build-worker");

let stopping = false;

function log(message: string, extra: Record<string, unknown> = {}) {
  const detail = Object.entries(extra)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[${new Date().toISOString()}] [${WORKER_ID}] ${message}${detail ? ` ${detail}` : ""}`);
}

// Each header compiles in a scratch directory of its own under the work dir,
// removed as soon as it is done: submitted headers must not pile up where the
// next job's compiler could read them (docs/SERVICES.md).
async function compileIn(workDir: string, code: string) {
  try {
    return await compileModule(code, { workDir });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── The canary ───────────────────────────────────────────────────────────────
// Before a failure is cached as a header's verdict ("does not compile"), the
// worker makes sure the toolchain still builds a pattern that certainly does:
// the curated Origin preset, which every firmware compiles in. A sandbox that
// cannot see a shared header fails every header with the header's own line
// numbers on it, and caching that would label the whole catalogue broken
// until somebody deleted the rows. A pass is remembered for a few minutes, so
// a run of genuinely broken headers costs one extra compile, not one each.
const CANARY_HEADER = path.join(FIRMWARE_SRC_DIR, "presets", "preset_origin.h");
const CANARY_TRUST_MS = 10 * 60 * 1000;
let canaryPassedAt = 0;

async function canary(): Promise<boolean> {
  if (Date.now() - canaryPassedAt < CANARY_TRUST_MS) return true;
  let code: string;
  try {
    code = await fs.readFile(CANARY_HEADER, "utf8");
  } catch {
    log("canary: cannot read the reference header", { path: CANARY_HEADER });
    return false;
  }
  const result = await compileIn(path.join(WORK_DIR, "modules", `canary-${process.pid}`), code);
  if (result.ok) {
    canaryPassedAt = Date.now();
    return true;
  }
  log("canary FAILED — the toolchain cannot build a known-good pattern", {
    error: JSON.stringify(result.error.slice(-400)),
  });
  return false;
}

const deps: BuildJobDeps = {
  compile: (code, { jobId, index }) =>
    compileIn(path.join(WORK_DIR, "modules", `${jobId}-${index}`), code),
  builderRev: computeBuilderRev,
  log,
  infraBackoff: new Map(),
  canary,
};

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

// ── Idle warm-up ─────────────────────────────────────────────────────────────
// With the queue empty, queue a few bakes for published headers the module
// cache is missing (buildJobs.ts warmIdle). Once a minute is plenty: it only
// ever has to catch up once per header per toolchain.
const WARM_INTERVAL_MS = 60 * 1000;
let lastWarm = 0;

async function maybeWarm(): Promise<void> {
  if (process.env.BUILD_ENABLED !== "1") return;
  if (Date.now() - lastWarm < WARM_INTERVAL_MS) return;
  lastWarm = Date.now();
  try {
    const queued = await warmIdle(deps);
    if (queued > 0) log("warming the module cache", { queued });
  } catch (error) {
    log(`warm-up failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  log("starting", {
    firmware: FIRMWARE_SRC_DIR,
    work: WORK_DIR,
    artifacts: artifactDir(),
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
      const startedAt = Date.now();
      const outcome = await processNextBuild(WORKER_ID, deps);
      if (outcome) {
        worked = true;
        const verb =
          outcome.status !== "done"
            ? "failed"
            : outcome.cachedError
              ? "does not compile (cached)"
              : outcome.skipped
                ? "skipped (that header text is no longer on the site)"
                : "ok";
        log(`${outcome.kind} ${verb}`, {
          id: outcome.id,
          seconds: ((Date.now() - startedAt) / 1000).toFixed(1),
          compiled: outcome.compiled,
          cached: outcome.hits,
        });
      }
    } catch (error) {
      // Database hiccup, not a build failure — back off and keep going rather
      // than exiting, so a transient error doesn't take the queue down.
      log(`poll error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!worked && !stopping) {
      await maybeSweep();
      await maybeWarm();
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  log("stopped");
  process.exit(0);
}

void main();
