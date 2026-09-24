// Builds a submitted pattern into a loadable module (.pfm) instead of a whole
// firmware image.
//
// Why this exists alongside buildRunner.ts: the .bin path recompiles the entire
// sketch — every preset lands in the same translation unit — so one pattern costs
// 14-16 s and produces ~1.1 MB that has to be flashed over the top of the
// running firmware. A module is that pattern's code alone: ~360 ms to build,
// 3-22 KB, and it installs by POSTing it to the device's /patterns with no
// reflash and no reboot.
//
// Both paths stay for now. A device on firmware older than the module loader
// cannot load a .pfm, so it still needs an image.
//
// The heavy lifting is the two Python scripts in firmware/toolchain/, which are
// also what a maintainer runs by hand — one code path for both, so a build here
// cannot quietly differ from a local one.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateCustomPattern, type CustomPatternInput } from "./assemble";
import { firmwareSrcDir } from "./paths";

export type ModuleArtifact = {
  /** Filesystem-safe name derived from the pattern's NAME; the .pfm stem. */
  slug: string;
  /** Absolute path to the built .pfm. */
  modulePath: string;
  /** Absolute path to the metadata sidecar the device reads for display names. */
  sidecarPath: string;
  bytes: number;
  namespace: string;
};

export type RunModuleBuildResult =
  | { ok: true; artifacts: ModuleArtifact[]; output: string }
  | {
      ok: false;
      error: string;
      /**
       * True when the CODE is the reason: validation refused it, the porter
       * found no namespace, the compiler or linker rejected it, or it uses a
       * symbol the device loader cannot resolve. Those fail identically every
       * time, so the module cache may remember them. False for everything
       * that is about the machine — a timeout, a missing python or compiler,
       * a full disk, a crash — which the next attempt may well not repeat,
       * and which must therefore never be cached as the pattern's verdict.
       */
      deterministic: boolean;
    };

export type ModuleBuildOptions = {
  /** Where the finished .pfm/.json are written. Created if missing. */
  artifactDir: string;
  /** Overrides `python`; set PYTHON_PATH when the runtime is python3 or a venv. */
  pythonPath?: string;
  /** Per-build scratch space. A temp directory is used when omitted. */
  workDir?: string;
  /** Seconds before a build is treated as hung. */
  timeoutSeconds?: number;
};

const DEFAULT_TIMEOUT_SECONDS = 120;

function toolchainDir(): string {
  return path.resolve(firmwareSrcDir(), "..", "toolchain");
}

// Where build_module.py drops each module's object: firmware/modules/.build/
// <slug>/pattern.o, inside the checkout (docs/SERVICES.md — bound read-write
// into the compiler sandbox). One .pfm's object is another submitter's next
// input if it is left there, so runModuleBuild wipes this directory after
// every build. A non-ASCII checkout path (the dev tree) makes build_module.py
// stage into a private temp dir instead and never touch this one, so removing
// it there is a harmless no-op.
function moduleBuildCacheDir(): string {
  return path.resolve(firmwareSrcDir(), "..", "modules", ".build");
}

function python(options: ModuleBuildOptions): string {
  return options.pythonPath ?? process.env.PYTHON_PATH ?? "python";
}

export type ScriptRun = {
  ok: boolean;
  output: string;
  /** Killed by our timeout, or never started — never the code's fault. */
  infra: boolean;
};

function runScript(
  exe: string,
  args: string[],
  timeoutSeconds: number,
): Promise<ScriptRun> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    let output = "";
    let settled = false;

    const finish = (ok: boolean, extra = "", infra = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, output: output + extra, infra });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(false, `\n[timed out after ${timeoutSeconds}s]`, true);
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", (error) => finish(false, `\n[cannot run ${exe}: ${error.message}]`, true));
    // A signal (the OOM killer, a systemd limit) closes with code null.
    child.on("close", (code) => finish(code === 0, "", code === null));
  });
}

// Whose fault is a failed build — the code's or the machine's? This decides
// whether the failure is CACHED (shown forever on the pattern's public page as
// "does not compile") or retried under backoff, so a header must not be able
// to steer it. And it can try: every word a compiler prints about a source is
// partly the author's to choose. A static_assert message, a #pragma message,
// a #error, a #pragma GCC error — all take arbitrary text, and gcc happily
// prints text with embedded newlines, so a header can emit bare lines that
// read exactly like "Killed", "Permission denied" or "bwrap: …". An older
// version of this classifier scanned the log for such infrastructure markers;
// that let a header dressed up as an outage escape caching and be recompiled
// on every retry and every send. So the rule now is deliberately one-sided:
//
//   1. Trust PROCESS STATUS for infrastructure, never text. A timeout, a kill
//      by signal, a spawn error — `ScriptRun.infra`, set from the child's exit
//      status, not from anything it wrote (runScript above). A header cannot
//      forge its own process's exit code.
//   2. Cache ONLY on positive evidence that the code is at fault (CODE_FAULT
//      below), located where a header cannot relabel it away and cannot
//      manufacture without genuinely being broken.
//
// So a broken sandbox, a driver missing its cc1plus, a linker that is not
// there, an empty log — none of which carry code-fault evidence — are never
// cached, no infrastructure marker needed. And a header that prints "Killed"
// in a static_assert message is cached anyway, because the static_assert IS
// the code's fault, whatever the message says.

// The compiler reporting that IT could not read a file the build includes —
// the single `#include "pf_module.h"` the porter inserts, or a shared header
// beside it (assemble.ts refuses the plain spellings of any other include; it
// is a filter, not a boundary — the build host's compiler sandbox is what
// limits which files exist at all). "fatal error: <file>: <io-strerror>" ending right there is the
// machine, not the code, so it is NOT counted as code-fault evidence below.
// A missing #include ends "No such file or directory" instead, which is
// rightly the code's fault; and a static_assert whose MESSAGE embeds a line
// like this cannot hide behind it — the static_assert's own "error:" line
// remains as real code-fault evidence, because a static_assert prints
// "error:", never "fatal error:", so it can never match this itself.
const SOURCE_IO_FAILURE =
  /pattern\d*\.(?:cpp|h):\d+(?::\d+)?:\s*fatal error:\s*[^\s:]+:\s*(?:Permission denied|Input\/output error|No space left on device|Read-only file system|Cannot allocate memory)\s*$/;

// Positive evidence that the CODE is why the build failed. Without one of
// these a failure is never cached as the pattern's verdict, however it reads:
// a sandbox that will not start, a compiler driver missing its cc1plus or its
// linker, an empty log — all print the same "FAIL <slug>" a real compile error
// does, and caching those would label every header the worker touched during
// an outage "does not compile" until somebody deleted the rows.
const CODE_FAULT = [
  // An error in the pattern's own source, or one inside a firmware header
  // that gcc traces back to a line of it ("required from here").
  /pattern\d*\.(?:cpp|h):\d+(?::\d+)?:\s+(?:(?:fatal |internal compiler )?error:|required from)/,
  // build_module.py's own refusal: a symbol the device loader cannot resolve.
  /device loader cannot resolve:/,
  /undefined reference to/,
];

// Does the log carry code-fault evidence — a CODE_FAULT match on a line that
// is not itself a machine I/O failure reading one of the build's own files?
// Tested per line so a genuine "fatal error: pf_module.h: Permission denied"
// (the machine) does not count, while a static_assert's "error:" line on the
// same page still does (the code).
function hasCodeFault(output: string): boolean {
  for (const line of output.split(/\r?\n/)) {
    if (SOURCE_IO_FAILURE.test(line)) continue;
    if (CODE_FAULT.some((marker) => marker.test(line))) return true;
  }
  return false;
}

/**
 * Is a failed port_preset.py run the header's fault? Its only deliberate
 * refusal is a header with no namespace; anything else (a traceback, an
 * interpreter that is not there) is about the machine.
 */
function portFailureIsDeterministic(run: ScriptRun): boolean {
  return !run.infra && /no top-level namespace found/.test(run.output) && !/Traceback/.test(run.output);
}

/**
 * Is a failed build_module.py run the header's fault? build_one() reports
 * every failed g++ run as a "FAIL  <slug>" line followed by its log — a
 * compile error, but equally a sandbox or a driver that never got as far as
 * the code. So the FAIL line only says a build ran, and process status
 * (`run.infra`: timeout, killed by signal, spawn error) is the only
 * infrastructure signal trusted, because it is the one thing the header
 * cannot write. Everything else rests on positive code-fault evidence
 * (hasCodeFault): with it, cache the verdict — a header dressing its own
 * static_assert up as "Killed" is still a broken static_assert; without it,
 * a bare sandbox/driver/empty failure is the machine's, retried with backoff
 * rather than remembered.
 *
 * Exported for the smoke test, which feeds it the outputs that matter.
 */
export function buildFailureIsDeterministic(run: ScriptRun): boolean {
  if (run.infra) return false;
  if (!/^FAIL\s+\S+/m.test(run.output)) return false;
  return hasCodeFault(run.output);
}

/**
 * Compile each submitted header into a .pfm.
 *
 * Patterns are built one at a time rather than in parallel: each is only a few
 * hundred milliseconds, and build_module.py already parallelises across the
 * directories it is given, so racing several interpreters would mostly add
 * contention on a Pi.
 */
export async function runModuleBuild(
  patterns: CustomPatternInput[],
  options: ModuleBuildOptions,
): Promise<RunModuleBuildResult> {
  if (patterns.length === 0) return { ok: false, error: "No patterns submitted.", deterministic: true };

  // Fail on a malformed header before spending a subprocess on it — the error
  // from validation names the actual problem, where the compiler would emit a
  // wall of C++ about a missing namespace.
  const namespaces: string[] = [];
  for (const pattern of patterns) {
    const verdict = validateCustomPattern(pattern.code);
    if (!verdict.ok) {
      return {
        ok: false,
        error: `${pattern.label ?? "pattern"}: ${verdict.error}`,
        deterministic: true,
      };
    }
    namespaces.push(verdict.namespace);
  }

  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const exe = python(options);
  const tools = toolchainDir();

  const ephemeral = !options.workDir;
  const workDir = options.workDir
    ? options.workDir
    : await fs.mkdtemp(path.join(os.tmpdir(), "pf-module-"));

  let log = "";
  try {
    await fs.mkdir(options.artifactDir, { recursive: true });
    const sourceDir = path.join(workDir, "src");
    const moduleDir = path.join(workDir, "modules");
    await fs.mkdir(sourceDir, { recursive: true });

    const artifacts: ModuleArtifact[] = [];

    for (let i = 0; i < patterns.length; i++) {
      const headerPath = path.join(sourceDir, `pattern${i + 1}.h`);
      await fs.writeFile(headerPath, patterns[i].code, "utf8");

      // Rewrites the firmware header into a freestanding module source and picks
      // the slug from the pattern's NAME, exactly as a local port does.
      const ported = await runScript(
        exe,
        [path.join(tools, "port_preset.py"), "--out-dir", moduleDir, headerPath],
        timeoutSeconds,
      );
      log += ported.output;
      if (!ported.ok) {
        return {
          ok: false,
          error: `Porting failed:\n${ported.output}`,
          deterministic: portFailureIsDeterministic(ported),
        };
      }

      const slug = ported.output.match(/^(\S+)\s+/m)?.[1];
      if (!slug) {
        return {
          ok: false,
          error: `Could not determine module slug:\n${ported.output}`,
          deterministic: false,
        };
      }

      const built = await runScript(
        exe,
        [
          path.join(tools, "build_module.py"),
          "--out",
          options.artifactDir,
          path.join(moduleDir, slug),
        ],
        timeoutSeconds,
      );
      log += built.output;
      if (!built.ok) {
        return {
          ok: false,
          error: `Build failed:\n${built.output}`,
          deterministic: buildFailureIsDeterministic(built),
        };
      }

      const modulePath = path.join(options.artifactDir, `${slug}.pfm`);
      const sidecarPath = path.join(options.artifactDir, `${slug}.json`);
      let bytes: number;
      try {
        bytes = (await fs.stat(modulePath)).size;
      } catch {
        return {
          ok: false,
          error: `Build reported success but produced no module at ${modulePath}`,
          deterministic: false,
        };
      }

      artifacts.push({ slug, modulePath, sidecarPath, bytes, namespace: namespaces[i] });
    }

    return { ok: true, artifacts, output: log };
  } catch (error) {
    return {
      ok: false,
      error: `${error instanceof Error ? error.message : String(error)}\n${log}`,
      deterministic: false,
    };
  } finally {
    if (ephemeral) await fs.rm(workDir, { recursive: true, force: true });
    // Leave no object behind for the next compile to read: the <slug> dirs
    // this build made under firmware/modules/.build/ come out with it, success
    // or failure. The exact <slug> is not always known (a port that failed
    // never produced one), and one worker per checkout is the documented rule,
    // so the whole directory goes rather than a guessed subdirectory.
    await fs.rm(moduleBuildCacheDir(), { recursive: true, force: true }).catch(() => {});
  }
}

/** A single compiled module, in memory — what the module cache stores. */
export type CompiledModule = {
  slug: string;
  namespace: string;
  /** The pattern's NAME, as the sidecar reports it. */
  name: string | null;
  pfm: Uint8Array;
  /** build_module.py's sidecar, raw. The worker strips its local fields. */
  sidecar: string;
};

export type CompileModuleResult =
  | { ok: true; module: CompiledModule }
  | { ok: false; error: string; deterministic: boolean };

/**
 * Compiler output without the worker's own paths in it.
 *
 * A deterministic failure is cached and shown on the pattern's public page
 * (422 `detail`), so the log must not carry a scratch directory with a job id
 * in it, or build_module.py's staging note — just the file and line that
 * matter. `pattern.cpp:12:3: error: …` reads the same wherever it compiled.
 */
export function sanitizeCompilerOutput(text: string, workDir: string): string {
  let out = text;
  for (const form of new Set([workDir, workDir.replace(/\\/g, "/")])) {
    if (form) out = out.split(form).join("");
  }
  return out
    .replace(/^Non-ASCII repo path - staging build in .*\r?\n?/gm, "")
    .replace(/(?:[A-Za-z]:)?[^\s:"'`()]*[\\/](pattern\.(?:cpp|o|h))\b/g, "$1")
    .replace(/(?:[A-Za-z]:)?[^\s:"'`()]*[\\/](pattern\d+\.h)\b/g, "$1");
}

/**
 * Compile one header into a module held in memory — the build worker's unit
 * of work for the module cache (lib/community/server/buildJobs.ts). Same two
 * scripts and the same checks as runModuleBuild, whose result it reads back
 * off disk and then deletes: the caller gets bytes, not paths.
 */
export async function compileModule(
  code: string,
  options: Omit<ModuleBuildOptions, "artifactDir"> & { workDir: string },
): Promise<CompileModuleResult> {
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "pf-module-one-"));
  try {
    const built = await runModuleBuild([{ code, label: "pattern" }], {
      ...options,
      artifactDir: staging,
    });
    if (!built.ok) {
      return {
        ok: false,
        // The label is the caller's to add: one cached verdict serves every
        // pattern that shares this header, whatever each one is called.
        error: sanitizeCompilerOutput(built.error.replace(/^pattern: /, ""), options.workDir),
        deterministic: built.deterministic,
      };
    }
    const [artifact] = built.artifacts;
    const pfm = new Uint8Array(await fs.readFile(artifact.modulePath));
    const sidecar = await fs.readFile(artifact.sidecarPath, "utf8").catch(() => "{}");
    let name: string | null = null;
    try {
      const parsed = JSON.parse(sidecar) as { name?: unknown };
      if (typeof parsed.name === "string") name = parsed.name;
    } catch {
      // A module without a readable sidecar still installs; the device falls
      // back to a name made from the slug.
    }
    return {
      ok: true,
      module: { slug: artifact.slug, namespace: artifact.namespace, name, pfm, sidecar },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      deterministic: false,
    };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

// The zip a send job answers with used to be assembled here, straight from the
// compile. It is built from module_cache rows now (lib/community/server/
// buildJobs.ts), so a header that is already compiled never reaches this file.
