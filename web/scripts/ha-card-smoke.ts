/**
 * Smoke test for the built Home Assistant card.
 *
 *   npx tsx scripts/ha-card-smoke.ts
 *
 * Two things, both of which have a cheap failure mode and an expensive one.
 *
 * The bundle has to *load*. It runs as a Lovelace resource, where a throw at
 * import time is a dashboard that renders nothing and a console error nobody
 * is looking at. Loading it against a minimal DOM shim catches that here.
 *
 * The card and the sandbox document have to still agree. They are two files,
 * shipped together but edited apart, and the protocol between them is a set of
 * string literals — a renamed message type produces a card that loads fine,
 * shows a black rectangle, and reports nothing at all.
 */
import fs from "node:fs/promises";
import path from "node:path";

const WEB = process.cwd();
const OUT = path.resolve(WEB, "../custom_components/patternflow/www");

/** Messages the card sends; every one has to be handled by the sandbox. */
const SENT = ["pf-load", "pf-knobs", "pf-run"];
/** Messages the sandbox sends; every one has to be handled by the card. */
const RECEIVED = ["pf-ready", "pf-status"];

const failures: string[] = [];

function check(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ok   ${description}`);
  } else {
    failures.push(description);
    console.error(`  FAIL ${description}`);
  }
}

async function loadsCleanly(): Promise<void> {
  console.log("bundle loads:");

  const defined: string[] = [];
  const shim = globalThis as Record<string, unknown>;

  shim.HTMLElement = class {};
  shim.customElements = {
    get: () => undefined,
    define: (name: string) => defined.push(name),
  };
  shim.window = shim;
  shim.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }) };

  const bundle = path.join(OUT, "patternflow-card.js");
  await import(`file://${bundle}`);

  check(defined.includes("patternflow-card"), "registers <patternflow-card>");
  check(defined.includes("patternflow-card-editor"), "registers the config editor");

  const cards = (shim.customCards ?? []) as Array<{ type?: string }>;
  check(
    cards.some((card) => card.type === "patternflow-card"),
    "adds itself to the card picker",
  );
}

async function protocolAgrees(): Promise<void> {
  console.log("card and sandbox agree:");

  const card = await fs.readFile(path.join(OUT, "patternflow-card.js"), "utf8");
  const sandbox = await fs.readFile(path.join(OUT, "pattern-sandbox.html"), "utf8");

  for (const type of SENT) {
    check(card.includes(type), `card sends ${type}`);
    check(sandbox.includes(type), `sandbox handles ${type}`);
  }
  for (const type of RECEIVED) {
    check(sandbox.includes(type), `sandbox sends ${type}`);
    check(card.includes(type), `card handles ${type}`);
  }
}

async function bundledPatterns(): Promise<void> {
  console.log("patterns:");
  const card = await fs.readFile(path.join(OUT, "patternflow-card.js"), "utf8");
  // The Basics pack's slugs are what the preview can actually draw. If the
  // generated lookup were empty the card would still work — and silently never
  // show a picture.
  check(card.includes("wave_saw"), "the Basics pack's patterns are bundled");
}

async function main(): Promise<void> {
  await loadsCleanly();
  await protocolAgrees();
  await bundledPatterns();

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nall good.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
