import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { assembleFirmwareSource, type CustomPatternInput } from "./assemble";

// ─────────────────────────────────────────────────────────────────────────────
// Running one firmware build.
//
// ⚠️  SANDBOXING — compiling a submitted header is arbitrary code execution at
// COMPILE time, even though nothing "runs": the preprocessor reaches the
// filesystem (`#include "/etc/passwd"` leaks through error messages) and
// template recursion burns CPU without limit. This module does NOT sandbox
// anything; it assumes the caller has already put it inside a container with no
// network, a read-only root, an unprivileged user and resource limits.
// Do not expose it to submissions from anyone but the maintainer until that
// exists — see issue #230.
//
// WARMTH — the sketch directory and the build path are both persistent and
// reused between builds. That is where the 8× speedup lives: a fresh build
// directory recompiles the ESP32 core and every library (~2 min) instead of
// just the sketch (~15 s). One runner owns one pair of directories, so two
// concurrent builds mean two runners, never two jobs sharing these paths.
// ─────────────────────────────────────────────────────────────────────────────

export type CompileOutcome =
  | { ok: true; appBinPath: string; output: string }
  | { ok: false; output: string };

/** Swappable so the surrounding logic is testable without a toolchain. */
export type Compiler = (context: {
  sketchDir: string;
  buildPath: string;
}) => Promise<CompileOutcome>;

export type BuildRunnerOptions = {
  /** Pristine firmware sources, copied in on first use (the repo checkout). */
  firmwareSrcDir: string;
  /** Persistent working copy this runner compiles from. */
  sketchDir: string;
  /** Persistent arduino-cli --build-path. Never delete this between builds. */
  buildPath: string;
  /** Where finished images are written. */
  artifactDir: string;
  compile?: Compiler;
};

export const FQBN = process.env.BUILD_FQBN ?? "esp32:esp32:esp32s3";

/** Files the assembler overwrites; everything else is copied once and left. */
const GENERATED = /^(custom\d+\.h|pattern_registry\.h)$/;

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy the firmware sources into the runner's working directory, once.
 *
 * Re-copied on every build only for the files a build can change, so the
 * remaining sources keep their timestamps and arduino-cli does not decide the
 * world has moved and rebuild the lot.
 */
export async function syncSketchDir(firmwareSrcDir: string, sketchDir: string): Promise<void> {
  if (!(await pathExists(sketchDir))) {
    await fs.mkdir(path.dirname(sketchDir), { recursive: true });
    await fs.cp(firmwareSrcDir, sketchDir, {
      recursive: true,
      // The repo's own build output would be copied as a stale cache.
      filter: (source) => !source.split(path.sep).includes("build"),
    });
    return;
  }

  // Restore the generated files to their pristine state so a previous build's
  // custom slots cannot leak into this one.
  for (const entry of await fs.readdir(firmwareSrcDir)) {
    if (!GENERATED.test(entry)) continue;
    await fs.copyFile(path.join(firmwareSrcDir, entry), path.join(sketchDir, entry));
  }
}

/**
 * Delete any image left in the build path by an earlier build.
 *
 * The build path is deliberately persistent — that is where the warm cache
 * lives — which means the previous job's linked image is still sitting there
 * when this one starts. Without clearing it, a compile that reports success
 * without producing an image (a toolchain that exits 0 on a subtle failure,
 * output written under another name) would be served the PREVIOUS user's
 * firmware. Removing it first makes "the file exists afterwards" mean "this
 * build produced it".
 *
 * Safe for the cache: this is the final linked output, not an intermediate
 * object, so nothing that makes a warm build fast is thrown away.
 */
async function clearStaleImages(buildPath: string): Promise<void> {
  if (!(await pathExists(buildPath))) return;
  for (const entry of await fs.readdir(buildPath)) {
    if (entry.endsWith(".ino.bin")) {
      await fs.rm(path.join(buildPath, entry), { force: true });
    }
  }
}

/** Remove custom slots the current build does not use. */
async function clearUnusedSlots(sketchDir: string, used: number): Promise<void> {
  for (const entry of await fs.readdir(sketchDir)) {
    const match = entry.match(/^custom(\d+)\.h$/);
    if (match && Number(match[1]) > used) {
      await fs.rm(path.join(sketchDir, entry), { force: true });
    }
  }
}

/**
 * arduino-cli names its output after the sketch, and a sketch is a directory
 * containing a `.ino` of the same name — so the working copy must keep the
 * firmware directory's name (`patternflow/`), not be renamed to `sketch/`.
 */
export function sketchName(sketchDir: string): string {
  return path.basename(sketchDir);
}

/** The real compiler: arduino-cli against the persistent build path. */
export const arduinoCliCompiler: Compiler = ({ sketchDir, buildPath }) =>
  new Promise((resolve) => {
    const bin = process.env.ARDUINO_CLI_PATH ?? "arduino-cli";
    const child = spawn(
      bin,
      ["compile", "--fqbn", FQBN, "--build-path", buildPath, sketchDir],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      // A runaway build can emit output without end; keep the tail only.
      if (output.length > 200_000) output = output.slice(-100_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    child.on("error", (error) => {
      resolve({ ok: false, output: `${output}\nFailed to start ${bin}: ${error.message}` });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, output: output || `arduino-cli exited with code ${code}` });
        return;
      }
      resolve({
        ok: true,
        appBinPath: path.join(buildPath, `${sketchName(sketchDir)}.ino.bin`),
        output,
      });
    });
  });

export type RunBuildResult =
  | { ok: true; artifact: string; artifactBytes: number; namespaces: string[]; output: string }
  | { ok: false; error: string };

/**
 * Assemble sources, compile, and file the resulting image under `buildId`.
 *
 * Only the application image is kept. The bootloader, partition table and
 * boot_app0 are identical for every build, so they are served as static files
 * and the per-build artifact stays ~1.1 MB instead of the 16 MB merged image.
 */
export async function runBuild(
  buildId: string,
  patterns: CustomPatternInput[],
  options: BuildRunnerOptions,
): Promise<RunBuildResult> {
  const compile = options.compile ?? arduinoCliCompiler;

  const registryPath = path.join(options.firmwareSrcDir, "pattern_registry.h");
  let originalRegistry: string;
  try {
    originalRegistry = await fs.readFile(registryPath, "utf8");
  } catch {
    return { ok: false, error: `Firmware sources not found at ${options.firmwareSrcDir}` };
  }

  const assembled = assembleFirmwareSource(patterns, originalRegistry);
  if (!assembled.ok) return { ok: false, error: assembled.error };

  await syncSketchDir(options.firmwareSrcDir, options.sketchDir);
  for (const file of assembled.files) {
    await fs.writeFile(path.join(options.sketchDir, file.path), file.content, "utf8");
  }
  await clearUnusedSlots(options.sketchDir, patterns.length);
  await clearStaleImages(options.buildPath);

  const result = await compile({ sketchDir: options.sketchDir, buildPath: options.buildPath });
  if (!result.ok) return { ok: false, error: result.output };

  let image: Buffer;
  try {
    image = await fs.readFile(result.appBinPath);
  } catch {
    return { ok: false, error: `Build reported success but produced no image at ${result.appBinPath}` };
  }

  await fs.mkdir(options.artifactDir, { recursive: true });
  const artifact = `${buildId}.bin`;
  await fs.writeFile(path.join(options.artifactDir, artifact), image);

  return {
    ok: true,
    artifact,
    artifactBytes: image.byteLength,
    namespaces: assembled.namespaces,
    output: result.output,
  };
}
