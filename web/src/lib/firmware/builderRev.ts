// The module cache's toolchain revision: one digest of everything, besides the
// pattern's own header, that decides what bytes a .pfm build produces — or
// whether it builds at all.
//
// WORKER ONLY. It reads firmware/ and runs the compiler, neither of which a web
// request may do (next.config.ts explains the bundle-weight rule; a request
// that ran a compiler would also be a way to spend the Pi's CPU). The worker
// publishes the result to build_meta, and the web reads it from there.
//
// What goes in, and why each:
//   abi/*.h                  the module SDK a pattern compiles against
//   src/core_color.h,        the firmware headers pf_module.h includes
//     core_math.h,             rather than copying (build_module.py's
//     core_noise.h             SHARED_HEADERS)
//   src/core_module_loader.h the device's host symbol table — build_module.py
//                            refuses a module using a name not in it, so a
//                            firmware that adds `coshf` turns an old error
//                            into a success
//   toolchain/module.ld      the linker script that shapes the image
//   toolchain/build_module.py  flags, panel size, ABI stamping, the sidecar
//   toolchain/port_preset.py   the source rewrite and the slug
//   the compiler's --version   a new GCC is new bytes
//   PF_TARGET_ABI              which descriptor version modules are stamped with
//
// Read LF-normalised, so a checkout with CRLF endings (Windows, autocrlf)
// agrees with the Pi's. Deliberately NOT included: the rest of the firmware.
// A release that changes the panel driver or the web console leaves every
// cached module exactly as valid as it was, and installed modules do not go
// stale across firmware updates either (the loader accepts every descriptor
// version since 1) — re-baking the catalogue for those would be the waste this
// cache exists to remove.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { firmwareSrcDir } from "./paths";

/** Bump when the recipe below changes, so every row is re-baked once. */
const RECIPE = "pf-builder-rev/1";

const SHARED_SOURCES = ["core_color.h", "core_math.h", "core_noise.h", "core_module_loader.h"];
const TOOLCHAIN_FILES = ["module.ld", "build_module.py", "port_preset.py"];

async function readNormalized(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function isDir(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/** Python's sorted() over Paths: case-folded on Windows, plain elsewhere. */
function pathSort(paths: string[]): string[] {
  const key = (value: string) => (process.platform === "win32" ? value.toLowerCase() : value);
  return [...paths].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

async function globBins(base: string, prefix: string | null): Promise<string[]> {
  // "<base>/<dir>/bin" for every <dir> (starting with prefix, when given).
  const dirs = (await listDirs(base)).filter(
    (dir) => prefix === null || path.basename(dir).startsWith(prefix),
  );
  const bins: string[] = [];
  for (const dir of pathSort(dirs)) {
    const bin = path.join(dir, "bin");
    if (await isDir(bin)) bins.push(bin);
  }
  return bins;
}

/**
 * The g++ build_module.py will run — the same search, in the same order, as
 * its toolchain_roots()/find_tool(): PF_XTENSA_BIN (the Pi points it at the
 * bwrap wrappers), the Arduino data directories, then PlatformIO.
 */
export async function findCompiler(): Promise<string | null> {
  const home = os.homedir();
  const roots: string[] = [];
  if (process.env.PF_XTENSA_BIN) roots.push(process.env.PF_XTENSA_BIN);

  const bases: string[] = [];
  if (process.env.ARDUINO_DIRECTORIES_DATA) bases.push(process.env.ARDUINO_DIRECTORIES_DATA);
  bases.push(
    path.join(process.env.LOCALAPPDATA ?? home, "Arduino15"),
    path.join(home, "Library", "Arduino15"),
    path.join(home, ".arduino15"),
  );
  for (const base of bases) {
    const tools = path.join(base, "packages", "esp32", "tools");
    roots.push(...(await globBins(path.join(tools, "esp-x32"), null)));
    roots.push(...(await globBins(path.join(tools, "xtensa-esp32s3-elf-gcc"), null)));
  }
  const pioHome = process.env.PLATFORMIO_CORE_DIR ?? path.join(home, ".platformio");
  roots.push(...(await globBins(path.join(pioHome, "packages"), "toolchain-xtensa-esp32s3")));

  for (const root of roots) {
    for (const suffix of ["", ".exe"]) {
      const candidate = path.join(root, `xtensa-esp32s3-elf-g++${suffix}`);
      try {
        if ((await fs.stat(candidate)).isFile()) return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

function trySpawn(exe: string, args: string[]): ReturnType<typeof spawn> | null {
  try {
    return spawn(exe, args, { windowsHide: true });
  } catch {
    // Windows throws synchronously for a file it cannot execute at all.
    return null;
  }
}

function firstLineOf(exe: string, args: string[]): Promise<string | null> {
  const child = trySpawn(exe, args);
  if (!child) return Promise.resolve(null);
  return new Promise((resolve) => {
    let output = "";
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, 20_000);
    child.stdout?.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 ? output.split(/\r?\n/)[0]?.trim() ?? null : null));
  });
}

/**
 * No revision can be named right now, because the compiler cannot be found
 * or will not say what it is. Thrown rather than hashed into a revision: a
 * digest of "compiler unknown" would be published to build_meta, the web
 * would switch to it, every cached module would turn into a miss, and the
 * whole catalogue would be re-baked under a revision the real toolchain
 * never had — and again the other way once it answered. Thrown, the job at
 * hand fails as the machine's fault (not cached, retried with backoff), the
 * warm-up skips its round, and build_meta keeps the last good revision.
 */
export class ToolchainUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolchainUnavailable";
  }
}

// `--version` costs a process; the binary it describes rarely changes. Asked
// again only when the file the search lands on is a different file — and
// only a real answer is remembered: one failed probe (a busy Pi at boot, a
// sandbox hiccup) must not stick for the life of the worker.
let versionCache: { key: string; version: string } | null = null;

export async function compilerVersion(): Promise<string> {
  const compiler = await findCompiler();
  if (!compiler) {
    throw new ToolchainUnavailable(
      "No Xtensa compiler found (PF_XTENSA_BIN, the Arduino data directories, PlatformIO).",
    );
  }
  let key = compiler;
  try {
    const stat = await fs.stat(compiler);
    key = `${compiler}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    // fall through with the path alone
  }
  if (versionCache?.key === key) return versionCache.version;
  const version = await firstLineOf(compiler, ["--version"]);
  if (!version) {
    throw new ToolchainUnavailable(`The compiler did not answer --version: ${compiler}`);
  }
  versionCache = { key, version };
  return version;
}

export type BuilderRevInputs = {
  files: { name: string; sha: string | null }[];
  compiler: string;
  targetAbi: "1" | "2";
};

export async function builderRevInputs(): Promise<BuilderRevInputs> {
  const sketch = firmwareSrcDir();
  const toolchain = path.resolve(sketch, "..", "toolchain");

  let abiHeaders: string[] = [];
  try {
    abiHeaders = (await fs.readdir(path.join(sketch, "abi")))
      .filter((name) => name.endsWith(".h"))
      .sort();
  } catch {
    // An unreadable abi/ is recorded as absent below — and would fail every
    // build anyway, which is the worker's business, not this digest's.
  }

  const named: { name: string; file: string }[] = [
    ...abiHeaders.map((name) => ({ name: `abi/${name}`, file: path.join(sketch, "abi", name) })),
    ...SHARED_SOURCES.map((name) => ({ name: `src/${name}`, file: path.join(sketch, "src", name) })),
    ...TOOLCHAIN_FILES.map((name) => ({ name: `toolchain/${name}`, file: path.join(toolchain, name) })),
  ];

  const files = await Promise.all(
    named.map(async ({ name, file }) => {
      const text = await readNormalized(file);
      return { name, sha: text === null ? null : sha256(text) };
    }),
  );

  return {
    files,
    compiler: await compilerVersion(),
    // build_module.py: `1 if PF_TARGET_ABI == "1" else 2`.
    targetAbi: process.env.PF_TARGET_ABI === "1" ? "1" : "2",
  };
}

/**
 * The revision string stored in module_cache.builder_rev. Full sha256.
 * Throws ToolchainUnavailable when there is no working compiler to name.
 */
export async function computeBuilderRev(): Promise<string> {
  const inputs = await builderRevInputs();
  const lines = [
    RECIPE,
    ...inputs.files.map((file) => `file ${file.name} ${file.sha ?? "missing"}`),
    `compiler ${inputs.compiler}`,
    `target-abi ${inputs.targetAbi}`,
  ];
  return sha256(`${lines.join("\n")}\n`);
}
