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

import { zipSync } from "fflate";

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
  | { ok: false; error: string };

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

function python(options: ModuleBuildOptions): string {
  return options.pythonPath ?? process.env.PYTHON_PATH ?? "python";
}

type ScriptRun = { ok: boolean; output: string };

function runScript(
  exe: string,
  args: string[],
  timeoutSeconds: number,
): Promise<ScriptRun> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    let output = "";
    let settled = false;

    const finish = (ok: boolean, extra = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, output: output + extra });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(false, `\n[timed out after ${timeoutSeconds}s]`);
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", (error) => finish(false, `\n[cannot run ${exe}: ${error.message}]`));
    child.on("close", (code) => finish(code === 0));
  });
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
  if (patterns.length === 0) return { ok: false, error: "No patterns submitted." };

  // Fail on a malformed header before spending a subprocess on it — the error
  // from validation names the actual problem, where the compiler would emit a
  // wall of C++ about a missing namespace.
  const namespaces: string[] = [];
  for (const pattern of patterns) {
    const verdict = validateCustomPattern(pattern.code);
    if (!verdict.ok) {
      return { ok: false, error: `${pattern.label ?? "pattern"}: ${verdict.error}` };
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
        return { ok: false, error: `Porting failed:\n${ported.output}` };
      }

      const slug = ported.output.match(/^(\S+)\s+/m)?.[1];
      if (!slug) {
        return { ok: false, error: `Could not determine module slug:\n${ported.output}` };
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
        return { ok: false, error: `Build failed:\n${built.output}` };
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
        };
      }

      artifacts.push({ slug, modulePath, sidecarPath, bytes, namespace: namespaces[i] });
    }

    return { ok: true, artifacts, output: log };
  } catch (error) {
    return {
      ok: false,
      error: `${error instanceof Error ? error.message : String(error)}\n${log}`,
    };
  } finally {
    if (ephemeral) await fs.rm(workDir, { recursive: true, force: true });
  }
}

export type RunModuleZipResult =
  | { ok: true; zipPath: string; zipBytes: number; slugs: string[]; namespaces: string[]; output: string }
  | { ok: false; error: string };

/**
 * The queue-facing shape: build every submitted pattern and bundle the
 * .pfm/.json pairs into one zip.
 *
 * One file because the builds table stores one artifact per job, and one
 * download is what a cart of patterns should be anyway — the device's
 * /patterns page accepts several files dropped at once, so the flow is
 * download, unzip, drag the lot in.
 */
export async function runModuleBuildZipped(
  patterns: CustomPatternInput[],
  zipPath: string,
  options: Omit<ModuleBuildOptions, "artifactDir">,
): Promise<RunModuleZipResult> {
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "pf-module-zip-"));
  try {
    const built = await runModuleBuild(patterns, { ...options, artifactDir: staging });
    if (!built.ok) return built;

    // Slugs come from each pattern's NAME, so two patterns that share a name
    // would silently overwrite each other inside the staging directory — the
    // second .pfm replaces the first and the zip ends up one module short.
    const seen = new Map<string, string>();
    for (const artifact of built.artifacts) {
      const previous = seen.get(artifact.slug);
      if (previous) {
        return {
          ok: false,
          error:
            `Two patterns produce the same module name "${artifact.slug}" ` +
            `(namespaces ${previous} and ${artifact.namespace}). Give them distinct NAMEs.`,
        };
      }
      seen.set(artifact.slug, artifact.namespace);
    }

    const entries: Record<string, Uint8Array> = {};
    for (const artifact of built.artifacts) {
      entries[`${artifact.slug}.pfm`] = new Uint8Array(await fs.readFile(artifact.modulePath));
      entries[`${artifact.slug}.json`] = new Uint8Array(await fs.readFile(artifact.sidecarPath));
    }

    // The running order, in the format pattern_registry.h reads. Submission
    // order IS deck order, and without this file the device falls back to
    // sorting modules alphabetically — which quietly throws away the one
    // thing the person arranging a deck was actually doing.
    const catalog =
      "# Patternflow running order — one module slug per line.\n" +
      "# Written by the deck export; the device reads it at boot.\n" +
      built.artifacts.map((artifact) => artifact.slug).join("\n") +
      "\n";
    entries["catalog.txt"] = new TextEncoder().encode(catalog);

    const zipped = zipSync(entries);
    await fs.mkdir(path.dirname(zipPath), { recursive: true });
    await fs.writeFile(zipPath, zipped);

    return {
      ok: true,
      zipPath,
      zipBytes: zipped.byteLength,
      slugs: built.artifacts.map((artifact) => artifact.slug),
      namespaces: built.artifacts.map((artifact) => artifact.namespace),
      output: built.output,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
