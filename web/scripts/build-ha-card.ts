/**
 * Builds the Home Assistant dashboard card.
 *
 *   npx tsx scripts/build-ha-card.ts [--check]
 *
 * Output goes into the integration, which ships it as a static file because
 * HACS and a manual copy both hand Home Assistant a directory, not a build:
 *
 *   integrations/homeassistant/custom_components/patternflow/www/
 *     patternflow-card.js     the bundle
 *     pattern-sandbox.html    the pattern runtime, copied verbatim
 *
 * The card is built HERE rather than beside the integration for one reason: it
 * imports `knobSetupFromCode`, the knob scale constants and the matrix helpers
 * from web/src/lib, and a copy of those would go quietly wrong the next time a
 * knob range is refactored. One source, one set of numbers.
 *
 * `--check` builds into a temporary directory and fails if the result differs
 * from what is committed. That is what CI runs — the committed bundle is what
 * people actually install, so it rotting is the failure that matters.
 *
 * ── The pattern JavaScript ────────────────────────────────────────────────
 *
 * A device stores compiled `.pfm` modules and a metadata sidecar. Neither
 * carries source, so the card cannot get a pattern's code from the panel it is
 * showing. What it can do is recognise the modules from the Basics pack: the
 * pack manifest maps each module slug to the pattern number of the JS preset it
 * was built from, and that preset is in this repo. So this script bakes that
 * lookup — slug to source — into the bundle.
 *
 * Anything else (a community pattern, a hand-built module) simply has no
 * preview, and the card says so instead of pretending.
 */
import { build } from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import basicsManifest from "../public/packs/basics.json";
import { livePresets } from "../src/lib/presets";

// Run from `web/`, like every other script here (`npm run build:ha-card`).
// Resolved from the working directory rather than from import.meta, which tsx
// shims differently depending on how it loads this file and which Node is
// underneath.
const WEB = process.cwd();
const REPO = path.resolve(WEB, "..");
const OUT_DIR = path.join(
  REPO,
  "integrations/homeassistant/custom_components/patternflow/www",
);
const SANDBOX = path.join(WEB, "public/pattern-sandbox.html");

const check = process.argv.includes("--check");

/** slug → the JS source of the preset that module was built from. */
function presetCodeBySlug(): Record<string, string> {
  const byNumber = new Map(livePresets.map((preset) => [preset.num, preset.code]));
  const presets = (basicsManifest as { presets?: Record<string, number> }).presets ?? {};

  const found: Record<string, string> = {};
  const missing: string[] = [];

  for (const [slug, num] of Object.entries(presets)) {
    const code = byNumber.get(num);
    if (code) found[slug] = code;
    else missing.push(`${slug} (pattern ${num})`);
  }

  if (missing.length) {
    // Not fatal: a pack can name a preset this checkout does not have, and the
    // card degrades to "no preview" for exactly those. Worth saying out loud
    // though, because the usual cause is a manifest built from a newer tree.
    console.warn(`[ha-card] no JS twin for ${missing.length}: ${missing.join(", ")}`);
  }
  return found;
}

async function bundleInto(outDir: string): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });

  const codes = presetCodeBySlug();
  console.log(`[ha-card] ${Object.keys(codes).length} patterns bundled`);

  await build({
    // Substituted into src/ha-card/presetCode.ts. Deliberately not a generated
    // file: nothing to commit, nothing to keep in step by hand, and a fresh
    // clone still typechecks and builds without running this script first.
    define: { __PF_PRESET_CODE__: JSON.stringify(codes) },
    entryPoints: [path.join(WEB, "src/ha-card/index.ts")],
    outfile: path.join(outDir, "patternflow-card.js"),
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    // Home Assistant serves this as a plain file; a sourcemap comment pointing
    // at something that is not there is just a console error for every viewer.
    sourcemap: false,
    legalComments: "none",
    // The card is vanilla — no React, no Next. That is the whole reason it can
    // be 30 KB instead of 200. Anything that drags one of those in is a
    // mistake, and a bare-bones resolver is how it gets caught here rather
    // than in somebody's dashboard.
    external: [],
    alias: { "@": path.join(WEB, "src") },
  });

  await fs.copyFile(SANDBOX, path.join(outDir, "pattern-sandbox.html"));
}

async function digest(dir: string): Promise<string> {
  const names = (await fs.readdir(dir)).sort();
  const hash = crypto.createHash("sha256");
  for (const name of names) {
    hash.update(name);
    hash.update(await fs.readFile(path.join(dir, name)));
  }
  return hash.digest("hex");
}

async function main(): Promise<void> {
  if (!check) {
    await bundleInto(OUT_DIR);
    const bytes = (await fs.stat(path.join(OUT_DIR, "patternflow-card.js"))).size;
    console.log(`[ha-card] ${(bytes / 1024).toFixed(1)} KB → ${path.relative(REPO, OUT_DIR)}`);
    return;
  }

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "pf-ha-card-"));
  try {
    await bundleInto(temporary);
    const [fresh, committed] = await Promise.all([digest(temporary), digest(OUT_DIR)]);
    if (fresh !== committed) {
      console.error(
        "[ha-card] the committed bundle does not match the source.\n" +
          "          Run `npm run build:ha-card` and commit the result.",
      );
      process.exit(1);
    }
    console.log("[ha-card] committed bundle is up to date");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
