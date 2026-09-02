/**
 * Licence machinery smoke test — `npm run check:license`.
 *
 * Covers the two rules a pattern community has to get right, because both are
 * silent when they break: a fork must credit what it came from, and a fork must
 * not be published under looser terms than its parent.
 */
import {
  LICENSE_OPTIONS,
  buildSharedPatternFile,
  forkLicenseAllowed,
  forkLicenseOptions,
  licenseById,
  licenseBySpdx,
  stripShareWrapping,
  type ShareLineage,
  type ShareMeta,
} from "../src/lib/pattern/share";
import { licensedJsText } from "../src/lib/community/download";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

const BODY = "const x = 1;";
const PARENT: ShareLineage = {
  title: "Origin",
  handle: "engmung",
  url: "https://patternflow.work/community/p/abc123",
};

function meta(basedOn: ShareLineage | null = null): ShareMeta {
  return {
    title: "Ripple Study",
    author: "@minsu",
    license: licenseBySpdx("CC-BY-SA-4.0"),
    date: "2026-07-29",
    source: "community",
    basedOn,
  };
}

console.log("\n── header ──");
const original = buildSharedPatternFile(BODY, meta());
const fork = buildSharedPatternFile(BODY, meta(PARENT));
console.log(fork.split("\n").slice(0, 8).join("\n"));

check("an original carries no credit line", original.includes("Based on:"), false);
check("a fork credits the upstream author", fork.includes('Based on: "Origin" by @engmung'), true);
check("a fork links the upstream pattern", fork.includes(PARENT.url!), true);

console.log("\n── re-baking is idempotent ──");
// Editing a pattern re-runs the whole build over the stored source. Doing that
// must not stack headers or leave a second credit behind.
const rebaked = buildSharedPatternFile(fork, meta(PARENT));
check("one header after re-bake", (rebaked.match(/===== Patternflow pattern =====/g) ?? []).length, 1);
check("one credit after re-bake", (rebaked.match(/Based on:/g) ?? []).length, 1);
check("wrapping strips back to the body", stripShareWrapping(fork), BODY);
// The credit is always rebuilt from the parent row, so it cannot survive as a
// stale line when the pattern is no longer a fork.
check("credit drops when lineage is gone", buildSharedPatternFile(fork, meta()).includes("Based on:"), false);

console.log("\n── fork compatibility ──");
check("BY-SA fork stays BY-SA", forkLicenseAllowed("CC-BY-SA-4.0", "CC-BY-SA-4.0"), true);
check("BY-SA cannot become BY", forkLicenseAllowed("CC-BY-SA-4.0", "CC-BY-4.0"), false);
check("BY-SA cannot become CC0", forkLicenseAllowed("CC-BY-SA-4.0", "CC0-1.0"), false);
check("BY may stay BY", forkLicenseAllowed("CC-BY-4.0", "CC-BY-4.0"), true);
check("BY may tighten to BY-SA", forkLicenseAllowed("CC-BY-4.0", "CC-BY-SA-4.0"), true);
check("retired MIT parent is permissive", forkLicenseAllowed("MIT", "CC-BY-4.0"), true);
check("BY-SA picker offers one option", forkLicenseOptions("CC-BY-SA-4.0").map((o) => o.spdx), ["CC-BY-SA-4.0"]);
check("BY picker offers both", forkLicenseOptions("CC-BY-4.0").map((o) => o.spdx), ["CC-BY-SA-4.0", "CC-BY-4.0"]);

console.log("\n── retired licences stay readable ──");
check("only two are selectable", LICENSE_OPTIONS.map((o) => o.spdx), ["CC-BY-SA-4.0", "CC-BY-4.0"]);
check("MIT still resolves", licenseBySpdx("MIT").spdx, "MIT");
check("CC0 still resolves", licenseBySpdx("CC0-1.0").spdx, "CC0-1.0");
// An unknown id must pass through, never silently become the default — that
// would be us relicensing someone else's pattern.
check("unknown SPDX passes through", licenseBySpdx("GPL-3.0-only").spdx, "GPL-3.0-only");
check("licenseById finds retired ids", licenseById("mit").spdx, "MIT");

console.log("\n── downloads carry the same credit as the stored source ──");
// The download re-derives the header from the pattern row rather than trusting
// the stored text, so this is a separate path that can drift from the one above.
check(
  "a fork's .js download credits upstream",
  licensedJsText(
    {
      title: "Ripple Study",
      license: "CC-BY-SA-4.0",
      createdAt: "2026-07-29T00:00:00.000Z",
      username: "minsu",
      displayUsername: "minsu",
      basedOn: PARENT,
    },
    BODY,
  ).includes('Based on: "Origin" by @engmung'),
  true,
);
check(
  "a non-fork .js download has no credit line",
  licensedJsText(
    {
      title: "Ripple Study",
      license: "CC-BY-SA-4.0",
      createdAt: "2026-07-29T00:00:00.000Z",
      username: "minsu",
      displayUsername: "minsu",
    },
    BODY,
  ).includes("Based on:"),
  false,
);
// A pattern published under a licence that has since been retired must keep it
// in the file — not silently download as the current default.
check(
  "a retired licence survives into the download",
  licensedJsText(
    {
      title: "Old One",
      license: "MIT",
      createdAt: "2026-05-01T00:00:00.000Z",
      username: "someone",
      displayUsername: "someone",
    },
    BODY,
  ).includes("SPDX-License-Identifier: MIT"),
  true,
);

console.log("\n── footers inside a flattened layer stack ──");
// Pattern Lab flattens a layer stack with each layer's source embedded
// mid-file, licence footers and all, and the composite draw() AFTER them. A
// footer is only the file's footer when nothing but comments follows it.
const communityFooter = [
  "// ── Made with Patternflow Community · https://community.patternflow.work ──",
  "// Shared under CC-BY-SA-4.0. Attribution is part of this licence —",
  "// please keep this notice and the author credit above when you reuse,",
  "// remix, or redistribute this pattern. Do not delete it.",
].join("\n");
const geminiFooter = [
  "// ---",
  "// Made with Patternflow Pattern Lab — https://patternflow.work/pattern-lab",
  "// Licensed CC-BY-SA-4.0. Keep this notice if you share or remix.",
].join("\n");
const stack = `(function () {\n  function draw() {}\n${communityFooter}\n})();\n(function () {\n  function draw() {}\n${geminiFooter}\n})();\nexport function draw(display) {}`;
check("embedded community footer leaves the code after it alone", stripShareWrapping(stack), stack);
check("trailing community footer still comes off", stripShareWrapping(`${BODY}\n\n${communityFooter}\n`), BODY);
check("trailing gemini footer still comes off", stripShareWrapping(`${BODY}\n\n${geminiFooter}\n`), BODY);
check(
  "a @stack line after the body survives a trailing footer",
  stripShareWrapping(`${BODY}\n\n// @stack v1 d:AAAA\n\n${communityFooter}\n`),
  `${BODY}\n\n// @stack v1 d:AAAA`,
);
check(
  "footer followed by comments only is still trailing",
  stripShareWrapping(`${BODY}\n${communityFooter}\n// trailing note\n\n`),
  BODY,
);

console.log(failures === 0 ? "\nAll licence checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
