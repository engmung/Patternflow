// Smoke test for the loadable-module build path: takes a pattern header the way
// the community site would receive one, runs it through runModuleBuild(), and
// asserts a real .pfm comes out with a plausible ELF header and a sidecar the
// device can read a display name from.
//
// Needs the Xtensa toolchain (the ESP32 Arduino core's copy is found
// automatically; PF_XTENSA_BIN overrides). Run:
//   npx tsx scripts/module-build-smoke.ts

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runModuleBuild } from "../src/lib/firmware/moduleRunner";

const PATTERN = `#pragma once
#include <Arduino.h>
#include "config.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"

namespace SmokeSweep {
const char* NAME = "Smoke Sweep";
const char* const KNOB_LABELS[4] = {"Speed", "Hue", "Scale", "Fade"};
static float phase = 0.0f;
void setup() { PFMath::buildSinLUT(); phase = 0.0f; }
void update(float dt, const InputFrame& input) { (void)input; phase += dt; }
void draw() {
  PFCanvas::clear();
  for (int y = 0; y < PANEL_RES_H; y++) {
    for (int x = 0; x < PANEL_RES_W; x++) {
      uint8_t v = (uint8_t)(127.0f + 127.0f * PFMath::fastSin(phase + x * 0.05f));
      PFCanvas::setPixel(x, y, v, 0, (uint8_t)(255 - v));
    }
  }
  PFCanvas::present();
}
}  // namespace SmokeSweep
`;

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

async function main() {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "pf-module-smoke-"));
  console.log(`artifacts: ${artifactDir}\n`);

  const started = Date.now();
  const result = await runModuleBuild([{ code: PATTERN, label: "smoke.h" }], { artifactDir });
  const elapsed = Date.now() - started;

  if (!result.ok) {
    console.error(`build failed:\n${result.error}`);
    process.exit(1);
  }

  console.log(`built in ${elapsed} ms`);
  check("one artifact", result.artifacts.length === 1);

  const [artifact] = result.artifacts;
  console.log(`  ${artifact.slug}.pfm  ${artifact.bytes} bytes  ns=${artifact.namespace}\n`);

  check("slug derived from NAME", artifact.slug === "smoke_sweep",
        `got "${artifact.slug}"`);
  check("namespace detected", artifact.namespace === "SmokeSweep");
  check("plausible module size", artifact.bytes > 512 && artifact.bytes < 200_000,
        `${artifact.bytes} bytes`);

  const image = await fs.readFile(artifact.modulePath);
  check("ELF magic", image.subarray(0, 4).toString("binary") === "\x7fELF");
  // ET_REL: the loader relocates the image at load time, so a linked executable
  // (ET_EXEC = 2) would mean module.ld or the -r flag stopped working.
  check("relocatable object (ET_REL)", image.readUInt16LE(16) === 1,
        `e_type = ${image.readUInt16LE(16)}`);
  check("Xtensa machine (94)", image.readUInt16LE(18) === 94,
        `e_machine = ${image.readUInt16LE(18)}`);

  const sidecar = JSON.parse(await fs.readFile(artifact.sidecarPath, "utf8"));
  check("sidecar carries the display name", sidecar.name === "Smoke Sweep",
        `got ${JSON.stringify(sidecar.name)}`);
  check("sidecar knob labels", Array.isArray(sidecar.knobs) && sidecar.knobs.length === 4);
  check("sidecar panel size", sidecar.panel_w === 128 && sidecar.panel_h === 64);
  // This smoke pattern integrates deltas by hand, so it neither claims to be
  // absolute-ready nor needs the newer host: it must stamp ABI 1 and stay
  // installable on pre-absolute firmware. A converted source flips both.
  check("sidecar absoluteReady flag", sidecar.absoluteReady === false);
  check("delta-only pattern stamps ABI 1", sidecar.abi === 1);

  console.log("\nrejects a malformed header");
  const bad = await runModuleBuild([{ code: "not a pattern", label: "bad.h" }], { artifactDir });
  check("fails without spawning a compile", !bad.ok);
  check("error names the problem",
        !bad.ok && /pragma once/i.test(bad.error), !bad.ok ? bad.error : "");

  await fs.rm(artifactDir, { recursive: true, force: true });
  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
