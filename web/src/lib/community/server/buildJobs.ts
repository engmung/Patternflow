import fs from "node:fs/promises";
import path from "node:path";
import type { CompileModuleResult } from "@/lib/firmware/moduleRunner";
import {
  artifactDir,
  claimNextBuild,
  completeBuild,
  failBuild,
  parseBuildPatterns,
} from "./builds";
import {
  errorTail,
  findWarmCandidates,
  liveHeaderShas,
  lookupModule,
  normalizeHeader,
  recordBuilderRev,
  requestBake,
  sourceSha,
  storeModule,
  storeModuleError,
  type CachedModule,
} from "./moduleCache";
import { catalogText, sanitizeSidecar, zipFiles } from "./modulePack";
import type { builds } from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// What the build worker does with a job — everything except the loop.
//
// scripts/build-worker.ts is the process (poll, sleep, signals, the daily
// retention sweep); this is the work, with the compiler and the toolchain
// revision passed IN, so a smoke test can drive the whole thing against a
// throwaway database with a fake compiler and no Xtensa toolchain — which is
// all CI has.
//
// Two kinds of job (builds.ts):
//
//   bake — compile ONE stored header into module_cache. If the cache already
//          has it for this toolchain, that is the whole job.
//   send — somebody's arbitrary headers → a zip artifact, as always. Each
//          header goes through the cache first: a hit is reused without
//          spawning anything, a cached compile error fails fast with the
//          same words, and only a miss compiles (and fills the cache).
//
// A failure is cached only when it is the CODE's (the compiler said no, the
// device loader could not resolve a symbol it uses) — and, before it is,
// the worker checks the toolchain still builds a pattern known to be good
// (deps.canary), because a broken sandbox or a missing shared header can make
// every header fail in a way that reads like the header's fault. A timeout, a
// missing toolchain, a crash: the job fails, the cache stays empty, and the
// next request tries again — after a backoff, so a wedged header cannot keep
// the worker busy forever (moduleCache.ts bakeBackoff, and the in-memory
// backoff for idle warming below).
// ─────────────────────────────────────────────────────────────────────────────

export type BuildRow = typeof builds.$inferSelect;

/** Compile one normalised header. The real one is moduleRunner.compileModule. */
export type CompileFn = (
  code: string,
  context: { jobId: string; index: number; label: string },
) => Promise<CompileModuleResult>;

export type BuildJobDeps = {
  compile: CompileFn;
  /** The current toolchain revision (lib/firmware/builderRev.ts). */
  builderRev: () => Promise<string>;
  log?: (message: string, extra?: Record<string, unknown>) => void;
  /**
   * Shas whose bake failed for infrastructure reasons, and until when to
   * leave them out of idle warming. Owned by the worker process; in memory on
   * purpose — a restart is a fair moment to try again.
   */
  infraBackoff?: Map<string, number>;
  /**
   * Does the toolchain still build a header known to compile? Asked only
   * when a failure is about to be cached as a header's verdict; false (or a
   * throw) turns that failure into the machine's instead. The worker's
   * compiles a curated preset and remembers a pass for a few minutes; absent,
   * the verdict is trusted as the classifier gave it.
   */
  canary?: () => Promise<boolean>;
  now?: () => Date;
};

export type JobOutcome = {
  id: string;
  kind: string;
  status: "done" | "error";
  /** Headers actually compiled for this job. */
  compiled: number;
  /** Headers served from the cache. */
  hits: number;
  /** A bake that ended with the header's compile error cached. */
  cachedError?: boolean;
  /** A bake of a header text that had left the site before its turn came. */
  skipped?: boolean;
  error?: string;
};

/** How long idle warming leaves a sha alone after an infrastructure failure. */
const WARM_INFRA_BACKOFF_MS = 30 * 60 * 1000;

function noteInfraFailure(deps: BuildJobDeps, sha: string) {
  deps.infraBackoff?.set(sha, (deps.now?.() ?? new Date()).getTime() + WARM_INFRA_BACKOFF_MS);
}

/** Said instead of the compiler's words when the canary failed as well. */
const TOOLCHAIN_BROKEN =
  "The build service cannot compile right now (a pattern known to build failed as well), " +
  "so this failure is not being held against the header. Try again later.";

/** Is the toolchain healthy enough to believe a "does not compile"? */
async function toolchainHealthy(deps: BuildJobDeps): Promise<boolean> {
  if (!deps.canary) return true;
  try {
    return await deps.canary();
  } catch {
    return false;
  }
}

/**
 * Take the next job (sends before bakes) and do it. False when the queue is
 * empty — the loop's cue to sleep, and to warm the cache.
 */
export async function processNextBuild(worker: string, deps: BuildJobDeps): Promise<JobOutcome | null> {
  const job = await claimNextBuild(worker);
  if (!job) return null;
  return processBuild(job, deps);
}

/** Do one claimed job. Always leaves the row "done" or "error". */
export async function processBuild(job: BuildRow, deps: BuildJobDeps): Promise<JobOutcome> {
  const log = deps.log ?? (() => {});
  const outcome: JobOutcome = { id: job.id, kind: job.kind, status: "done", compiled: 0, hits: 0 };
  try {
    const rev = await deps.builderRev();
    if (await recordBuilderRev(rev)) log("toolchain revision changed", { rev: rev.slice(0, 12) });

    if (job.kind === "bake") await processBake(job, rev, deps, outcome);
    else await processSend(job, rev, deps, outcome);
  } catch (error) {
    // An unexpected throw must still release the job, or it sits in "running"
    // until the stale reaper picks it up ten minutes later. A toolchain that
    // cannot be named (builderRev.ts) is expected, and its message is for the
    // person who sent the job — not a stack trace.
    const message =
      error instanceof Error
        ? error.name === "ToolchainUnavailable"
          ? `The build service's compiler is not available right now. ${error.message}`
          : error.stack ?? error.message
        : String(error);
    await failBuild(job.id, message);
    outcome.status = "error";
    outcome.error = message;
  }
  return outcome;
}

async function processBake(job: BuildRow, rev: string, deps: BuildJobDeps, outcome: JobOutcome) {
  const [pattern] = parseBuildPatterns(job.patterns);
  if (!pattern) {
    await failBuild(job.id, "Bake job has no header.");
    outcome.status = "error";
    outcome.error = "Bake job has no header.";
    return;
  }
  // The worker compiles exactly the normalised text, so the key it writes
  // names exactly the bytes it produced — whatever the job row claims.
  const code = normalizeHeader(pattern.code);
  const sha = sourceSha(code);

  if (await lookupModule(sha, rev)) {
    outcome.hits += 1;
    await completeBuild(job.id, { artifact: null, artifactBytes: null, namespaces: [] });
    return;
  }

  // A bake waits its turn, and the header it was queued for may have been
  // replaced meanwhile — an author saving over and over queues one per save.
  // Nothing can ask for that text any more (every download and every warm-up
  // starts from a live header), so it is not worth a compile. "done", not
  // "error": it reached an answer, and an error would count towards the
  // backoff of a text its author might yet go back to.
  if (!(await liveHeaderShas()).has(sha)) {
    outcome.skipped = true;
    await completeBuild(job.id, {
      artifact: null,
      artifactBytes: null,
      namespaces: [],
      verdict: "Skipped: this header text left the site before it was compiled.",
    });
    return;
  }

  const result = await deps.compile(code, { jobId: job.id, index: 0, label: pattern.label });
  outcome.compiled += 1;
  if (result.ok) {
    await storeModule(sha, rev, { ...result.module, sidecar: sanitizeSidecar(result.module.sidecar) });
    await completeBuild(job.id, {
      artifact: null,
      artifactBytes: null,
      namespaces: [result.module.namespace],
    });
    return;
  }

  outcome.error = result.error;
  if (result.deterministic && !(await toolchainHealthy(deps))) {
    noteInfraFailure(deps, sha);
    await failBuild(job.id, `${TOOLCHAIN_BROKEN}\n\n${result.error}`);
    outcome.status = "error";
    return;
  }
  if (result.deterministic) {
    // The header's verdict, cached: the bake did what it was for, so the job
    // is "done". An "error" bake row means "no verdict — try again later",
    // and the backoff counts those; counting this one would hold the header
    // back after the next toolchain change, when it deserves a fresh try.
    await storeModuleError(sha, rev, result.error);
    await completeBuild(job.id, { artifact: null, artifactBytes: null, namespaces: [], verdict: result.error });
    outcome.cachedError = true;
    return;
  }
  noteInfraFailure(deps, sha);
  await failBuild(job.id, result.error);
  outcome.status = "error";
}

async function processSend(job: BuildRow, rev: string, deps: BuildJobDeps, outcome: JobOutcome) {
  const patterns = parseBuildPatterns(job.patterns);
  if (patterns.length === 0) {
    await failBuild(job.id, "No patterns submitted.");
    outcome.status = "error";
    outcome.error = "No patterns submitted.";
    return;
  }

  const modules: CachedModule[] = [];
  for (const [index, pattern] of patterns.entries()) {
    const code = normalizeHeader(pattern.code);
    const sha = sourceSha(code);
    let row = await lookupModule(sha, rev);

    if (!row) {
      const result = await deps.compile(code, { jobId: job.id, index, label: pattern.label });
      outcome.compiled += 1;
      if (result.ok) {
        await storeModule(sha, rev, {
          ...result.module,
          sidecar: sanitizeSidecar(result.module.sidecar),
        });
      } else if (result.deterministic && (await toolchainHealthy(deps))) {
        await storeModuleError(sha, rev, result.error);
      } else {
        // Not the code's fault, so not remembered: the next send retries.
        const message = result.deterministic
          ? `${pattern.label}: ${TOOLCHAIN_BROKEN}\n\n${result.error}`
          : `${pattern.label}: ${result.error}`;
        await failBuild(job.id, message);
        outcome.status = "error";
        outcome.error = message;
        return;
      }
      row = await lookupModule(sha, rev);
      if (!row) throw new Error("module cache row vanished right after it was written");
    } else {
      outcome.hits += 1;
    }

    if (row.status !== "done" || !row.pfm || !row.slug) {
      // Cached verdict: this header does not build here, and asking the
      // compiler again would only take longer to say so.
      const message = `${pattern.label}: ${row.error ?? "does not compile"}`;
      await failBuild(job.id, errorTail(message));
      outcome.status = "error";
      outcome.error = message;
      return;
    }
    modules.push(row);
  }

  // Slugs come from each pattern's NAME, so two patterns that share a name
  // would silently overwrite each other inside the zip — the second .pfm
  // replaces the first and the pack ends up one module short. A send is
  // somebody iterating on their own set, so it is told (a published deck's
  // pack renames instead — modulePack.ts assignPackSlugs).
  const seen = new Map<string, string>();
  for (const entry of modules) {
    const previous = seen.get(entry.slug!);
    if (previous) {
      const message =
        `Two patterns produce the same module name "${entry.slug}" ` +
        `(namespaces ${previous} and ${entry.namespace}). Give them distinct NAMEs.`;
      await failBuild(job.id, message);
      outcome.status = "error";
      outcome.error = message;
      return;
    }
    seen.set(entry.slug!, entry.namespace ?? "?");
  }

  const files: Record<string, Uint8Array> = {};
  for (const entry of modules) {
    files[`${entry.slug}.pfm`] = new Uint8Array(entry.pfm!);
    files[`${entry.slug}.json`] = new TextEncoder().encode(entry.sidecar ?? "{}\n");
  }
  // The running order, in the format pattern_registry.h reads. Submission
  // order IS deck order, and without this file the device falls back to
  // sorting modules alphabetically — which quietly throws away the one
  // thing the person arranging a deck was actually doing.
  files["catalog.txt"] = new TextEncoder().encode(catalogText(modules.map((entry) => entry.slug!)));

  const zipped = zipFiles(files);
  const artifact = `${job.id}.zip`;
  await fs.mkdir(artifactDir(), { recursive: true });
  await fs.writeFile(path.join(artifactDir(), artifact), zipped);
  await completeBuild(job.id, {
    artifact,
    artifactBytes: zipped.byteLength,
    namespaces: modules.map((entry) => entry.namespace ?? ""),
  });
}

/**
 * With nothing queued, queue a few bakes for published headers the cache is
 * missing — every header that predates the cache, and the whole catalogue
 * again after a toolchain change — so the first download of each is already
 * a hit. A handful at a time: a send arriving meanwhile still goes first
 * (claimNextBuild), and this runs again when the queue drains.
 *
 * Returns how many bakes it queued.
 */
export async function warmIdle(deps: BuildJobDeps, limit = 5): Promise<number> {
  const log = deps.log ?? (() => {});
  const now = deps.now?.() ?? new Date();
  const rev = await deps.builderRev();
  if (await recordBuilderRev(rev, now)) log("toolchain revision changed", { rev: rev.slice(0, 12) });

  const backoff = deps.infraBackoff;
  if (backoff) {
    for (const [sha, until] of backoff) if (until <= now.getTime()) backoff.delete(sha);
  }
  // The candidates already leave out headers in bake backoff and owners at
  // their cap (moduleCache.ts), so each one here is a bake that can be queued.
  const candidates = await findWarmCandidates(rev, limit, (sha) => Boolean(backoff?.has(sha)), now);

  let queued = 0;
  for (const candidate of candidates) {
    const result = await requestBake(candidate.code, candidate.ownerId, candidate.label, now);
    // A null buildId is a bake that was NOT queued (the owner hit the cap
    // between the two reads); counting it would report work nobody will do.
    if (result.state === "queued" && result.buildId) queued += 1;
  }
  return queued;
}
