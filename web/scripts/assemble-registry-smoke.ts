// Smoke test for the firmware assembler's grip on pattern_registry.h: fills the
// reserved custom-slot region with zero, one and two patterns and asserts the
// result is what the compiler needs. Run: npx tsx scripts/assemble-registry-smoke.ts
//
// This exists because the assembler used to anchor on the *shape* of the C++ —
// `#include "customN.h"` lines and the `customPatterns[]` array — so removing
// the hand-edited custom slots from the firmware silently broke every community
// build with a regex that no longer matched. It now anchors on explicit
// PF_CUSTOM_SLOTS markers, and this check fails loudly if those ever go missing.

import fs from "node:fs";
import path from "node:path";
import { buildRegistry } from "../src/lib/firmware/assemble";
import { firmwareSrcDir } from "../src/lib/firmware/paths";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function slotCount(registry: string): number | null {
  const found = registry.match(/^#define PF_CUSTOM_SLOT_COUNT (\d+)$/m);
  return found ? Number(found[1]) : null;
}

function region(registry: string): string {
  const from = registry.indexOf("// PF_CUSTOM_SLOTS_BEGIN");
  const to = registry.indexOf("// PF_CUSTOM_SLOTS_END");
  return from < 0 || to < 0 ? "" : registry.slice(from, to);
}

const registryPath = path.join(firmwareSrcDir(), "pattern_registry.h");
const original = fs.readFileSync(registryPath, "utf8");

console.log(`registry: ${registryPath}`);

console.log("\nrepo state");
check("has PF_CUSTOM_SLOTS markers", region(original) !== "",
      "buildRegistry() throws without them, so every community build fails");
check("ships with zero slots", slotCount(original) === 0);

console.log("\nfill with 0 patterns");
const zero = buildRegistry(original, []);
check("slot count is 0", slotCount(zero) === 0);
check("declares no customPatterns[]", !/customPatterns\[\]/.test(zero),
      "an empty array is ill-formed C++; the count alone gates buildPatternList()");

console.log("\nfill with 2 patterns");
const two = buildRegistry(original, ["MyPatternA", "MyPatternB"]);
check("slot count is 2", slotCount(two) === 2);
check("includes custom1.h and custom2.h",
      /#include "custom1\.h"/.test(two) && /#include "custom2\.h"/.test(two));
check("emits one PATTERN_ENTRY per namespace",
      (two.match(/PATTERN_ENTRY\(MyPattern[AB]\)/g) || []).length === 2);
check("includes come before customPatterns[]",
      two.indexOf('#include "custom1.h"') < two.indexOf("PatternEntry customPatterns[]"));
check("region sits after the PATTERN_ENTRY macro is defined",
      two.indexOf("#define PATTERN_ENTRY") < two.indexOf("// PF_CUSTOM_SLOTS_BEGIN"),
      "customPatterns[] uses the macro, so it has to come later in the file");
check("presets untouched",
      (two.match(/PATTERN_ENTRY\(Origin\)/g) || []).length === 1);

console.log("\nrefill an already-filled registry");
const refilled = buildRegistry(two, ["OnlyOne"]);
check("markers are not duplicated",
      (refilled.match(/PF_CUSTOM_SLOTS_BEGIN/g) || []).length === 1,
      "the worker reuses a warm checkout, so this runs against filled registries");
check("slot count replaced, not appended", slotCount(refilled) === 1);
check("previous namespaces are gone", !/MyPatternA/.test(refilled));

console.log("\nmissing markers");
const stripped = original.replace(/\/\/ PF_CUSTOM_SLOTS_BEGIN/, "// gone");
let threw = false;
try {
  buildRegistry(stripped, ["Whatever"]);
} catch {
  threw = true;
}
check("throws a clear error rather than silently skipping", threw);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
