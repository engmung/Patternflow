import path from "node:path";

// Where the firmware sources live, shared by the API (which validates a
// submission against the real registry before queueing it) and the worker
// (which compiles it). Read lazily so .env.local applies to both.

export function firmwareSrcDir(): string {
  return process.env.FIRMWARE_SRC_DIR ?? path.resolve(process.cwd(), "../firmware/patternflow");
}

export function registryPath(): string {
  return path.join(firmwareSrcDir(), "pattern_registry.h");
}

/**
 * Static parts of a flashable image, served from public/flash.
 *
 * The bootloader and partition table do not depend on the sketch, so every
 * build shares the ones already committed for the stock firmware and only the
 * ~1.1 MB application image differs.
 *
 * Keep this pointing at the current stock release. The three files have been
 * byte-identical across releases so far — a custom build flashed with the
 * previous version's copies would still boot — but they are version-pinned
 * paths, and pruning an old release directory would break every custom build
 * silently rather than loudly.
 */
export const STATIC_FLASH_PARTS = [
  { path: "/flash/bin/v3.2.0/patternflow.ino.bootloader.bin", offset: 0 },
  { path: "/flash/bin/v3.2.0/patternflow.ino.partitions.bin", offset: 0x8000 },
  { path: "/flash/bin/v3.2.0/boot_app0.bin", offset: 0xe000 },
] as const;

/** Offset the application image is written to (app0 in the partition table). */
export const APP_OFFSET = 0x10000;
