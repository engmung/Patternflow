/**
 * Build public/pattern-sandbox.html — `npm run build:sandbox`, and
 * `npm run check:sandbox-sync` (in check:ci) to fail when the committed file
 * is not what the sources build.
 *
 * The sandbox page used to carry a hand-ported plain-JS copy of the lab's
 * pattern runtime, with "keep the two in sync" comments on both sides. It
 * drifted anyway: the OKLab ramp modes reached it a release late, and it kept
 * turning a knob 20 detents a revolution after the lab moved to 24. Now the
 * page is src/sandbox/sandbox.ts (the canvas, the live loop, the postMessage
 * protocol) bundled by esbuild together with the runtime it imports from
 * src/lib/pattern/, dropped into src/sandbox/pattern-sandbox.template.html.
 *
 * The output is committed on purpose: next.config hashes the file at build
 * time for the iframe's cache-busting ?v=, and the smoke tests read the
 * script out of it. Minified whitespace and syntax, identifiers kept, so a
 * stack trace from a card still names things.
 */
import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";

const root = process.cwd();
const entry = path.join(root, "src", "sandbox", "sandbox.ts");
const templatePath = path.join(root, "src", "sandbox", "pattern-sandbox.template.html");
const outPath = path.join(root, "public", "pattern-sandbox.html");
const PLACEHOLDER = "/*__SANDBOX_SCRIPT__*/";
const BANNER =
  "// Built by scripts/build-sandbox.ts from src/sandbox/sandbox.ts and the lab runtime in\n" +
  "// src/lib/pattern/. Do not edit: run `npm run build:sandbox` in web/.";

const result = buildSync({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: "none",
  banner: { js: BANNER },
  logLevel: "warning",
});
const js = result.outputFiles[0].text.trimEnd();
if (js.includes("</script")) {
  console.error("the bundle contains '</script' and cannot be inlined");
  process.exit(1);
}

const template = fs.readFileSync(templatePath, "utf8").replace(/\r\n/g, "\n");
if (!template.includes(PLACEHOLDER)) {
  console.error(`${templatePath} has no ${PLACEHOLDER}`);
  process.exit(1);
}
const html = template.replace(PLACEHOLDER, () => js);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== html) {
    console.error("public/pattern-sandbox.html is not what its sources build — run `npm run build:sandbox`");
    process.exit(1);
  }
  console.log("pattern-sandbox.html is up to date");
} else {
  fs.writeFileSync(outPath, html);
  console.log(`wrote public/pattern-sandbox.html (${html.length} bytes, script ${js.length})`);
}
