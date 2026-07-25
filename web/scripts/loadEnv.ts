import fs from "node:fs";
import path from "node:path";

/**
 * Load .env.local for standalone scripts.
 *
 * Next.js does this itself, but the worker is its own process and would
 * otherwise miss COMMUNITY_DB_PATH and write to a second, empty database
 * beside the real one — which fails silently and confusingly.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const target = path.resolve(process.cwd(), file);
    if (!fs.existsSync(target)) continue;
    // Node 20.12+ / 22+. Values already in the environment win.
    process.loadEnvFile(target);
  }
}
