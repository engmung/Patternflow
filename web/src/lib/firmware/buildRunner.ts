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

/**
 * Board options this firmware requires, mirroring firmware/README.md.
 *
 * A bare `esp32:esp32:esp32s3` is not a neutral choice — it silently selects
 * the board package's defaults, which are wrong here in ways nothing reports:
 *
 *  · PSRAM defaults to OFF. PFMem::allocFloats then has no PSRAM to allocate
 *    from and falls back to internal DRAM, so patterns with framebuffer-sized
 *    buffers fail on web-built firmware while working when built locally.
 *  · FlashSize defaults to 4MB against a 16MB partition table.
 *  · CDCOnBoot decides whether Serial — and so Improv Wi-Fi provisioning —
 *    answers on the native USB port or the UART bridge, i.e. which of the two
 *    USB-C sockets offers Wi-Fi setup after flashing.
 *
 * Getting an option NAME wrong makes arduino-cli fail loudly; leaving an option
 * out fails silently. So the default here is the full string rather than
 * something minimal, and BUILD_FQBN is checked rather than trusted.
 */
export const DEFAULT_FQBN =
  "esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,CDCOnBoot=cdc,USBMode=hwcdc";

/** Options that must be pinned, whatever FQBN is in use. */
const REQUIRED_FQBN_OPTIONS = ["PSRAM", "FlashSize", "PartitionScheme", "CDCOnBoot"];

/**
 * Read when a build runs, not when this module loads.
 *
 * The worker calls loadEnv() in its own body, which under ES module semantics
 * happens *after* every import has been evaluated — so anything reading
 * process.env at module scope would capture the value from before .env.local
 * was loaded and silently ignore it. Keeping every env read lazy removes the
 * ordering question entirely.
 */
export function fqbn(): string {
  return process.env.BUILD_FQBN ?? DEFAULT_FQBN;
}

/** Complaint about the configured FQBN, or null when it is usable. */
export function checkFqbn(value = fqbn()): string | null {
  const [vendor, arch, board, options] = value.split(":");
  if (!vendor || !arch || !board) {
    return `BUILD_FQBN "${value}" is not a valid FQBN (expected vendor:arch:board:options).`;
  }

  const present = new Set(
    (options ?? "")
      .split(",")
      .map((entry) => entry.split("=")[0].trim())
      .filter(Boolean),
  );
  const missing = REQUIRED_FQBN_OPTIONS.filter((option) => !present.has(option));
  if (missing.length > 0) {
    return (
      `BUILD_FQBN is missing required board options: ${missing.join(", ")}. ` +
      `Leaving these out compiles against the board defaults, which produces firmware that ` +
      `boots but differs from the released build (see firmware/README.md). ` +
      `Either unset BUILD_FQBN to use the pinned default, or add them.`
    );
  }
  return null;
}

/** Files the assembler overwrites; everything else is copied once and left. */
const GENERATED = /^(custom\d+\.h|pattern_registry\.h|patternflow_secrets\.h)$/;

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Directories under the sketch that must never reach the worker's copy. */
const SYNC_SKIP = new Set(["build", "data"]);

async function syncTree(sourceDir: string, destinationDir: string): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    if (SYNC_SKIP.has(entry.name)) continue;
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await syncTree(source, destination);
      continue;
    }
    if (!entry.isFile()) continue;

    // Copy only what is new or changed, preserving everything else's mtime —
    // arduino-cli rebuilds exactly the translation units the change touches
    // and the warm cache stays warm.
    const sourceStat = await fs.stat(source);
    let same = false;
    try {
      const destinationStat = await fs.stat(destination);
      same =
        destinationStat.size === sourceStat.size &&
        destinationStat.mtimeMs === sourceStat.mtimeMs;
    } catch {
      same = false;
    }
    if (!same) {
      await fs.copyFile(source, destination);
      await fs.utimes(destination, sourceStat.atime, sourceStat.mtime);
    }
  }
}

/**
 * Bring the runner's working copy of the firmware up to date with the repo.
 *
 * This used to full-copy once and then refresh only the generated files
 * (custom slots, registry, secrets) — which meant a firmware source ADDED
 * later never reached a long-lived worker: after the loadable-modules change,
 * every deployed worker got the new pattern_registry.h (generated) but not
 * the new src/core_module_loader.h it includes, and every "Flash to my board"
 * died with a fatal include error. Now the whole tree is synced incrementally
 * by size+mtime, so new and edited sources propagate while untouched files
 * keep their timestamps (and the build cache its warmth).
 */
export async function syncSketchDir(firmwareSrcDir: string, sketchDir: string): Promise<void> {
  await syncTree(firmwareSrcDir, sketchDir);

  // Restore the generated files to their pristine state so a previous build's
  // custom slots cannot leak into this one. (syncTree above only fixes them
  // when the REPO side changed; this guards against the WORKER side having
  // been rewritten by the previous job.)
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
      ["compile", "--fqbn", fqbn(), "--build-path", buildPath, sketchDir],
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

  // Refuse before spending fifteen seconds producing the wrong firmware. Only
  // checked for real compiles: an injected compiler is a test double and has no
  // toolchain to configure.
  if (!options.compile) {
    const complaint = checkFqbn();
    if (complaint) return { ok: false, error: complaint };
  }

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
