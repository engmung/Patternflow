/**
 * Module cache smoke test — `npm run check:modcache`.
 *
 * "Compile a published header once, keep the module beside the code" is a
 * promise with several quiet ways to break:
 *
 *   - the key drifts (a CRLF paste bakes twice, or two different headers
 *     share a row and one pattern installs as another);
 *   - a download queues a compile every time instead of once, or a bake
 *     lands in somebody's personal queue and gets superseded under a visitor
 *     who is polling for it;
 *   - a timeout is cached as the pattern's verdict, and a header that is
 *     fine never installs again;
 *   - a deck with one bad slot stops downloading at all;
 *   - the sidecar a board reads credits "unknown", or loses its name.
 *
 * So this drives the real code — the job processor the worker runs, the real
 * route handlers, the header write routes — against a throwaway database,
 * with a FAKE compiler injected where the Xtensa toolchain would be. CI has
 * no toolchain; the real compile path is module-build-smoke.ts and
 * module-cache-e2e.ts, both local.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off these variables, so they have to
// be set before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-modcache-"));
process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
process.env.BUILD_ARTIFACT_DIR = path.join(tmp, "builds");
process.env.COMMUNITY_ENABLED = "1";
process.env.BUILD_ENABLED = "1";
process.env.BETTER_AUTH_SECRET = "smoke-test-secret-not-a-real-one";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

/** A header in the shape every pattern has; `marker` steers the fake compiler. */
function header(ns: string, name: string, marker = ""): string {
  return [
    "#pragma once",
    `namespace ${ns} {`,
    `const char* NAME = "${name}";`,
    'const char* const KNOB_LABELS[4] = {"A", "B", "C", "D"};',
    `void setup() {} void update(float, const InputFrame&) {} void draw() {} // ${marker}`,
    "}",
    "",
  ].join("\n");
}

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { unzipSync } = await import("fflate");
  const { getDb } = await import("../src/lib/community/server/db");
  const { getAuth } = await import("../src/lib/community/server/auth");
  const schema = await import("../src/lib/community/server/schema");
  const builds = await import("../src/lib/community/server/builds");
  const cache = await import("../src/lib/community/server/moduleCache");
  const jobs = await import("../src/lib/community/server/buildJobs");
  const pack = await import("../src/lib/community/server/modulePack");
  const { sweepModuleCache } = await import("../src/lib/community/server/retention");
  const patternZipRoute = await import("../src/app/api/community/patterns/[id]/zip/route");
  const deckZipRoute = await import("../src/app/api/community/decks/[id]/zip/route");
  const headerRoute = await import("../src/app/api/community/patterns/[id]/header/route");
  const patternRoute = await import("../src/app/api/community/patterns/[id]/route");
  const runner = await import("../src/lib/firmware/moduleRunner");
  const assemble = await import("../src/lib/firmware/assemble");

  const db = getDb();
  const now = new Date();

  // ── The fake compiler ──────────────────────────────────────────────────────
  // Deterministic by construction: the bytes are a function of the code, so
  // "same header, same bytes" is checkable without a toolchain.
  const compiled: string[] = [];
  const compile: import("../src/lib/community/server/buildJobs").CompileFn = async (code, context) => {
    compiled.push(code);
    if (code.includes("BROKEN")) {
      return {
        ok: false,
        deterministic: true,
        error: "pattern.cpp:5:3: error: 'nope' was not declared in this scope",
      };
    }
    if (code.includes("FLAKY")) {
      return { ok: false, deterministic: false, error: "[timed out after 120s]" };
    }
    const name = /NAME\s*=\s*"([^"]*)"/.exec(code)?.[1] ?? "pattern";
    const slug = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "pattern";
    const namespace = /namespace\s+(\w+)/.exec(code)?.[1] ?? "X";
    const pfm = new TextEncoder().encode(`\u007fELF fake module ${cache.sourceSha(code)}`);
    const sidecar = pack.pythonJsonDumps({
      name,
      namespace,
      author: "unknown",
      license: "CC-BY-SA-4.0",
      abi: 1,
      knobs: ["A", "B", "C", "D"],
      source: `/work/.build-worker/modules/${context.jobId}-${context.index}/src/pattern1.h`,
      slug,
      absoluteReady: false,
      panel_w: 128,
      panel_h: 64,
      module: `${slug}.pfm`,
      size: pfm.byteLength,
      opt: "-Os",
    });
    return { ok: true, module: { slug, namespace, name, pfm, sidecar } };
  };

  let rev = "rev-A";
  const infraBackoff = new Map<string, number>();
  const deps: import("../src/lib/community/server/buildJobs").BuildJobDeps = {
    compile,
    builderRev: async () => rev,
    infraBackoff,
  };
  const drain = async () => {
    let jobsRun = 0;
    while (await jobs.processNextBuild("smoke", deps)) jobsRun += 1;
    return jobsRun;
  };

  // ── Seed ───────────────────────────────────────────────────────────────────
  const person = (id: string, username: string, display: string) => ({
    id,
    name: username,
    email: `${username}@patternflow.local`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    username,
    displayUsername: display,
  });
  await db.insert(schema.user).values([
    person("u-alice", "alice", "Alice"),
    person("u-bob", "bob", "bob"),
    person("u-carol", "carol", "Carol"),
  ]);

  let tick = 0;
  const pattern = async (
    id: string,
    userId: string,
    title: string,
    codeCpp: string | null,
    visibility = "public",
    license = "CC-BY-SA-4.0",
  ) => {
    tick += 1;
    const at = new Date(now.getTime() - 1000 * (100 - tick));
    await db.insert(schema.patterns).values({
      id,
      userId,
      title,
      code: "// js",
      codeCpp,
      license,
      visibility,
      createdAt: at,
      updatedAt: at,
    });
  };

  const WAVE = header("AuthorWave", "Wave");
  await pattern("p-author", "u-alice", "Wave", WAVE, "public", "CC-BY-4.0");
  await pattern("p-private", "u-alice", "Secret", header("SecretNs", "Secret"), "private");
  await pattern("p-nohdr", "u-alice", "No Header", null);
  await pattern("p-broken", "u-alice", "Broken", header("BrokenNs", "Broken", "BROKEN"));
  await pattern("p-flaky", "u-alice", "Flaky", header("FlakyNs", "Flaky", "FLAKY"));
  await pattern("p-port", "u-alice", "Ported", null);
  await db.insert(schema.patternHeaders).values([
    // Stale first: it must NOT be the one that ships.
    { id: "h-stale", patternId: "p-port", userId: "u-carol", codeCpp: header("StalePort", "Stale"), stale: true, createdAt: new Date(now.getTime() - 5000) },
    { id: "h-bob", patternId: "p-port", userId: "u-bob", codeCpp: header("BobPort", "Ported Glow"), createdAt: new Date(now.getTime() - 4000) },
  ]);

  // ── Keying ─────────────────────────────────────────────────────────────────
  console.log("\n── the cache key ──");
  check("full sha256, never truncated", /^[0-9a-f]{64}$/.test(cache.sourceSha(WAVE)), true);
  check("a CRLF paste keys the same", cache.sourceSha(WAVE.replace(/\n/g, "\r\n")), cache.sourceSha(WAVE));
  check("outer whitespace keys the same", cache.sourceSha(`\n\n  ${WAVE}\n\n`), cache.sourceSha(WAVE));
  check("a one-character edit does not", cache.sourceSha(WAVE.replace("Wave", "Wavf")) === cache.sourceSha(WAVE), false);
  check("normalising is only CRLF and trim", cache.normalizeHeader("a\r\n b \r\n"), "a\n b");
  // The route, requestBake and the worker each normalise what the one before
  // handed on; a key that moved with every pass put the row where no
  // download looked (\r\r\r\n: a 202 forever).
  for (const [label, eol] of [
    ["\\r\\r\\n", "\r\r\n"],
    ["\\r\\r\\r\\n", "\r\r\r\n"],
    ["a lone \\r", "\r"],
  ] as const) {
    const text = WAVE.replace(/\n/g, eol);
    const once = cache.normalizeHeader(text);
    check(`normalising twice changes nothing (${label})`, cache.normalizeHeader(once), once);
    check(`…so every layer keys it alike (${label})`, cache.sourceSha(once), cache.sourceSha(text));
    // A CRLF file converted to CRLF again is still that file: one line break.
    check(`…and alike with the LF original (${label})`, cache.sourceSha(text), cache.sourceSha(WAVE));
  }

  // ── Classifying a failed build ─────────────────────────────────────────────
  console.log("\n── whose fault a failed build is ──");
  // A wrong "the code's" is cached and shown on the pattern's public page as
  // "does not compile" until somebody deletes the row; a wrong "the
  // machine's" costs a retry after backoff. So the code is blamed only on
  // evidence, and the header's own text is never read as the machine talking.
  const verdict = (log: string, infra = false) =>
    runner.buildFailureIsDeterministic({
      ok: false,
      output: `FAIL  wave\n\n0/1 module(s) built\n\n=== wave ===\n${log}\n`,
      infra,
    });
  const SRC = "/w/.build-worker/modules/j-0/modules/wave/pattern.cpp";
  check("an error in the pattern's own source is the code's", verdict(`${SRC}:12:5: error: 'nope' was not declared in this scope\n   12 |     nope();\n      |     ^~~~`), true);
  check("…and so is one gcc traces back to it", verdict(`In file included from ${SRC}:2:\n/f/abi/pf_canvas.h:30:5: error: no match for 'operator+'\n${SRC}:12:5:   required from here`), true);
  check("…and a missing #include", verdict(`${SRC}:3:10: fatal error: nope.h: No such file or directory\ncompilation terminated.`), true);
  check("…and a symbol the device cannot resolve", verdict("device loader cannot resolve: coshf\n  These names are not in the firmware's host symbol table"), true);
  check("a header's #error cannot pass itself off as the machine", verdict(`${SRC}:3:2: error: #error Permission denied\n    3 | #error Permission denied\n      |  ^~~~~`), true);
  check("…nor can a static_assert quoting a Traceback", verdict(`${SRC}:4:15: error: static assertion failed: Traceback (most recent call last)`), true);
  check("a sandbox that will not start is the machine's", verdict("bwrap: Creating new namespace failed: Operation not permitted"), false);
  check("…and so is a toolchain directory that vanished", verdict("bwrap: Can't find source path /home/pi/.arduino15/packages/esp32/tools/esp-x32/2601: No such file or directory"), false);
  check("…a driver without its cc1plus", verdict("xtensa-esp32s3-elf-g++: fatal error: cannot execute 'cc1plus': execvp: No such file or directory\ncompilation terminated."), false);
  check("…a linker that is not there", verdict("collect2: fatal error: cannot find 'ld'\ncompilation terminated."), false);
  check("…a FAIL with no log at all", verdict(""), false);
  check("…the OOM killer, even beside a warning in the pattern", verdict(`${SRC}:5:3: warning: unused variable 'x'\nxtensa-esp32s3-elf-g++: fatal error: Killed signal terminated program cc1plus`), false);
  check("…a firmware header the compiler may not read", verdict(`${SRC}:1:10: fatal error: pf_module.h: Permission denied\ncompilation terminated.`), false);
  check("…and a timeout, whatever it printed first", verdict(`${SRC}:12:5: error: x\n[timed out after 120s]`, true), false);

  // A header can put arbitrary text in a diagnostic — a static_assert message,
  // a #pragma message, a #pragma GCC error, a #error — and gcc prints text
  // with the embedded newlines intact, so bare lines like "Killed" or
  // "Permission denied" or "bwrap: …" appear in the log (confirmed against the
  // real g++ 14). None of that may buy the header out of a cached verdict: its
  // own diagnostic line is still the code's fault. (These are exactly the
  // shapes the real compiler emits.)
  check(
    "a static_assert forging infra lines is still the code's fault",
    verdict(`${SRC}:8:15: error: static assertion failed: a\nKilled\nPermission denied\n    8 |   static_assert(false, "a\\nKilled\\nPermission denied");\n      |               ^~~~~`),
    true,
  );
  check(
    "…even forging a bwrap failure",
    verdict(`${SRC}: In function 'void Forge::f()':\n${SRC}:8:26: error: static assertion failed: a\nbwrap: Creating new namespace failed\nOperation not permitted\n    8 | ...`),
    true,
  );
  check(
    "a #pragma message spewing infra text beside a real error is the code's",
    verdict(`${SRC}:8:17: note: '#pragma message: hello\nKilled\nPermission denied'\n    8 | #pragma message "hello\\nKilled\\nPermission denied"\n${SRC}:9:14: error: 'nope' was not declared in this scope\n    9 | int broken = nope;\n      |              ^~~~`),
    true,
  );
  check(
    "a #pragma GCC error with embedded infra newlines is the code's",
    verdict(`${SRC}:8:19: error: a\nKilled\nPermission denied\n    8 | #pragma GCC error "a\\nKilled\\nPermission denied"\n      |                   ^~~~~`),
    true,
  );
  check(
    "…and a static_assert embedding a fake read-failure of pf_module.h",
    verdict(`${SRC}:8:15: error: static assertion failed: x\n${SRC}:1:10: fatal error: pf_module.h: Permission denied\n    8 |   static_assert(false, "x\\n...pattern.cpp:1:10: fatal error: pf_module.h: Permission denied");\n      |               ^~~~~`),
    true,
  );

  // ── Header validation: includes and inline assembly ────────────────────────
  console.log("\n── the shape check refuses file access ──");
  // Community patterns get pf_module.h and the shared math headers and nothing
  // else. The plain spellings of a directive that would reach another file (and
  // survive the porter's stripping) or drop into assembly (.incbin embeds a
  // file's bytes) are refused before the compiler runs — in POST /builds and
  // again in the worker. The refusal is deterministic: the same header fails
  // identically, so it caches. This is a filter, not a boundary: spelling
  // tricks get past a text check (see assemble.ts), and the compiler sandbox on
  // the build host is what bounds a header. These cases pin the filter; they
  // are not a proof that file access is impossible.
  const valid = (extra: string, ns = "Vv") =>
    ["#pragma once", `namespace ${ns} {`, extra, 'const char* NAME = "V";',
     'const char* const KNOB_LABELS[4] = {"A","B","C","D"};',
     "void setup() {} void update(float, const InputFrame&) {} void draw() {}", "}", ""].join("\n");
  const rejects = (code: string) => {
    const v = assemble.validateCustomPattern(code);
    return !v.ok && v.error === "Pattern headers may not include other files or use inline assembly.";
  };
  const accepts = (code: string) => assemble.validateCustomPattern(code).ok === true;
  // A normal #include is kept — the porter deletes it, so it is not an escape.
  check("a plain #include is accepted (the porter strips it)", accepts(valid('#include "../src/core_math.h"')), true);
  check("…as is #include with no space and angle brackets", accepts(valid("#include <math.h>")), true);
  check("…and #include_next, which the porter also strips", accepts(valid("#include_next <math.h>")), true);
  // The spellings the porter misses reach the compiler — refuse them.
  check("`# include` (space after #) is refused", rejects(valid('# include "/etc/passwd"')), true);
  check("`#  include` (two spaces) is refused", rejects(valid('#  include "/etc/passwd"')), true);
  check("`# include_next` is refused", rejects(valid("# include_next <x>")), true);
  check("#embed is refused", rejects(valid('#embed "/etc/passwd"')), true);
  check("#import is refused", rejects(valid('#import "/etc/passwd"')), true);
  check("inline asm() is refused", rejects(valid('void q(){ asm("nop"); }')), true);
  check("asm volatile() is refused", rejects(valid('void q(){ asm volatile ("nop"); }')), true);
  check("__asm__ is refused", rejects(valid('void q(){ __asm__("nop"); }')), true);
  check(".incbin is refused", rejects(valid('__attribute__((section(".r\\n.incbin \\"/etc/passwd\\"\\n.text"))) int z = 0;')), true);
  // No false positives: "asm" or "#include" inside a comment or a string is inert.
  check("a comment mentioning asm() is fine", accepts(valid('void q(){ /* no asm() here */ }')), true);
  check("a string containing #include is fine", accepts(valid('const char* s = "#include <x>";', "Ss")), true);
  check("a word ending in asm is fine", accepts(valid("int phasm = 0;")), true);
  // The base fixtures other checks rely on must still validate.
  check("the smoke header still validates", accepts(WAVE), true);

  // ── Bake requests ──────────────────────────────────────────────────────────
  console.log("\n── requestBake ──");
  delete process.env.BUILD_ENABLED;
  check("no worker, no bake", (await cache.requestBake(WAVE, "u-alice", "Wave")).state, "disabled");
  process.env.BUILD_ENABLED = "1";

  const first = await cache.requestBake(WAVE, "u-alice", "Wave");
  const again = await cache.requestBake(WAVE.replace(/\n/g, "\r\n"), "u-alice", "Wave");
  check("a miss queues a bake", first.state, "queued");
  check("asking again (even as CRLF) is the same bake", again.state === "queued" && first.state === "queued" && again.buildId === first.buildId, true);
  const bakeRows = await db.select().from(schema.builds).where(eq(schema.builds.kind, "bake"));
  check("exactly one bake row", bakeRows.length, 1);
  check("…keyed, charged to the author, holding the normalised header", [bakeRows[0].sourceSha, bakeRows[0].userId, JSON.parse(bakeRows[0].patterns)[0].code], [cache.sourceSha(WAVE), "u-alice", cache.normalizeHeader(WAVE)]);

  // Carol's own sends, around the bake.
  const olderSend = await builds.enqueueBuild("u-carol", [{ label: "mine", code: header("Mine", "Mine") }], "pfm");
  check("a bake is not the author's active build", await builds.countActiveBuilds("u-alice"), 0);
  check("…nor listed as theirs", (await builds.listUserBuilds("u-alice")).length, 0);
  check("superseding the author's queue leaves the bake alone", await builds.supersedeQueuedBuilds("u-alice"), 0);
  check("the bake is still queued", (await builds.getBuild(bakeRows[0].id))?.status, "queued");
  check("a send is only behind older sends", await builds.queuePosition(olderSend, (await builds.getBuild(olderSend))!.createdAt), 1);
  check("a bake waits behind every send", await builds.queuePosition(bakeRows[0].id, bakeRows[0].createdAt), 2);
  const claimed = await builds.claimNextBuild("smoke-claim");
  check("the worker takes the send first, though the bake is older", claimed?.id, olderSend);
  // Put it back for the processor section below.
  await db.update(schema.builds).set({ status: "queued", worker: null, startedAt: null }).where(eq(schema.builds.id, olderSend));

  // ── The job processor ──────────────────────────────────────────────────────
  console.log("\n── processing bakes and sends ──");
  check("the queue drains", await drain(), 2);
  check("each header compiled exactly once", compiled.length, 2);
  check("the worker published its revision", await cache.currentBuilderRev(), "rev-A");
  const waveRow = await cache.lookupModule(cache.sourceSha(WAVE), "rev-A");
  check("the bake left a done row", [waveRow?.status, waveRow?.slug, waveRow?.namespace, waveRow?.name], ["done", "wave", "AuthorWave", "Wave"]);
  check("…with the worker's temp path stripped from its sidecar", waveRow?.sidecar?.includes("build-worker"), false);
  check("…and the optimisation flag", JSON.parse(waveRow?.sidecar ?? "{}").opt, undefined);
  check("a bake has no artifact of its own", (await builds.getBuild(bakeRows[0].id))?.artifact ?? null, null);
  check("the bake job is done", (await builds.getBuild(bakeRows[0].id))?.status, "done");
  check("a bake after the fact is a hit", (await cache.requestBake(WAVE, "u-alice", "Wave")).state, "cached");

  // A second bake row for the same header (a race) costs no compile.
  await builds.enqueueBuild("u-alice", [{ label: "Wave", code: WAVE }], "pfm", { sourceSha: cache.sourceSha(WAVE) });
  const racing = await jobs.processNextBuild("smoke", deps);
  check("a duplicate bake is a hit, not a compile", [racing?.hits, racing?.compiled, compiled.length], [1, 0, 2]);

  // Sends reuse the cache and keep the submission order.
  const TWO = header("TwoNs", "Second Light");
  const sendId = await builds.enqueueBuild(
    "u-carol",
    [
      { label: "two", code: TWO },
      { label: "wave (pasted on Windows)", code: WAVE.replace(/\n/g, "\r\n") },
    ],
    "pfm",
  );
  const sendOutcome = await jobs.processNextBuild("smoke", deps);
  check("a send compiles only what the cache lacks", [sendOutcome?.compiled, sendOutcome?.hits], [1, 1]);
  const sendRow = await builds.getBuild(sendId);
  check("the send is done with a zip", [sendRow?.status, sendRow?.artifact], ["done", `${sendId}.zip`]);
  const sendZip = unzipSync(new Uint8Array(fs.readFileSync(path.join(builds.artifactDir(), `${sendId}.zip`))));
  check("the zip holds both modules and the running order", Object.keys(sendZip).sort(), ["catalog.txt", "second_light.json", "second_light.pfm", "wave.json", "wave.pfm"]);
  check(
    "catalog.txt keeps the order they were sent in",
    new TextDecoder().decode(sendZip["catalog.txt"]).split("\n").filter((l) => l && !l.startsWith("#")),
    ["second_light", "wave"],
  );
  check("the reused module is the cached bytes", Buffer.from(sendZip["wave.pfm"]).equals(Buffer.from(waveRow!.pfm!)), true);

  // Deterministic failures are remembered; infrastructure failures are not.
  const BROKEN = header("BrokenNs", "Broken", "BROKEN");
  const FLAKY = header("FlakyNs", "Flaky", "FLAKY");
  await cache.requestBake(BROKEN, "u-alice", "Broken");
  await cache.requestBake(FLAKY, "u-alice", "Flaky");
  const before = compiled.length;
  await drain();
  check("both were tried once", compiled.length - before, 2);
  const brokenRow = await cache.lookupModule(cache.sourceSha(BROKEN), "rev-A");
  check("a compile error is cached as the header's verdict", [brokenRow?.status, brokenRow?.error?.includes("'nope'")], ["error", true]);
  const brokenJob = (await db.select().from(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(BROKEN))))[0];
  check("…and that bake is done: it reached a verdict", [brokenJob?.status, brokenJob?.error?.includes("'nope'")], ["done", true]);
  check("a timeout is NOT cached", await cache.lookupModule(cache.sourceSha(FLAKY), "rev-A"), null);
  const flakyJob = (await db.select().from(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(FLAKY))))[0];
  check("…and its bake is an error: no verdict, try again later", flakyJob?.status, "error");
  check("…but its sha is kept out of warming for a while", infraBackoff.has(cache.sourceSha(FLAKY)), true);
  check("…and asking again right away backs off", (await cache.requestBake(FLAKY, "u-alice", "Flaky")).state, "backoff");
  check("the cached error answers a bake without the queue", (await cache.requestBake(BROKEN, "u-alice", "Broken")).state, "cached");

  const failingSend = await builds.enqueueBuild("u-carol", [{ label: "mine", code: BROKEN }], "pfm");
  const beforeFail = compiled.length;
  await jobs.processNextBuild("smoke", deps);
  const failedRow = await builds.getBuild(failingSend);
  check("a send of a known-broken header fails fast, no compile", [failedRow?.status, compiled.length - beforeFail], ["error", 0]);
  check("…with its label and the compiler's words", failedRow?.error?.startsWith("mine: pattern.cpp:5:3"), true);

  const dupSend = await builds.enqueueBuild("u-carol", [{ label: "a", code: WAVE }, { label: "b", code: header("OtherWave", "Wave") }], "pfm");
  await jobs.processNextBuild("smoke", deps);
  check("a send with two same-named patterns says so", (await builds.getBuild(dupSend))?.error?.includes('same module name "wave"'), true);

  // ── The pattern zip route ──────────────────────────────────────────────────
  console.log("\n── GET /patterns/[id]/zip ──");
  const patternZip = (id: string, query = "", accept = "*/*") =>
    patternZipRoute.GET(
      new Request(`http://localhost:3000/api/community/patterns/${id}/zip${query}`, { headers: { accept } }),
      { params: Promise.resolve({ id }) },
    );

  const ready = await patternZip("p-author");
  check("a baked pattern is a file", [ready.status, ready.headers.get("content-type")], [200, "application/zip"]);
  check("named after its module", ready.headers.get("content-disposition"), 'attachment; filename="patternflow-wave.zip"');
  check("public CORS", ready.headers.get("access-control-allow-origin"), "*");
  const readyBytes = new Uint8Array(await ready.arrayBuffer());
  const entries = unzipSync(readyBytes);
  check("the .pfm and its sidecar — and no catalog.txt", Object.keys(entries).sort(), ["wave.json", "wave.pfm"]);
  const sidecarText = new TextDecoder().decode(entries["wave.json"]);
  const sidecar = JSON.parse(sidecarText);
  check("the sidecar leads with the name", sidecarText.split("\n")[1], '  "name": "Wave",');
  check("…credits the author from the database", sidecar.author, "Alice");
  check("…under the pattern's licence", sidecar.license, "CC-BY-4.0");
  check("…and links the pattern", sidecar.url, "https://patternflow.work/community/p/p-author");
  const againBytes = new Uint8Array(await (await patternZip("p-author")).arrayBuffer());
  check("the same pattern downloads to the same bytes", Buffer.from(readyBytes).equals(Buffer.from(againBytes)), true);
  check("?status=1 says ready", await (await patternZip("p-author", "?status=1")).json(), { state: "ready", slug: "wave", bytes: waveRow!.bytes });
  check("?list=1 lists the members", await (await patternZip("p-author", "?list=1")).json(), { files: ["wave.json", "wave.pfm"] });
  const one = await patternZip("p-author", "?file=wave.pfm");
  check("?file= hands over one member", Buffer.from(await one.arrayBuffer()).equals(Buffer.from(waveRow!.pfm!)), true);
  check("?file= for anything else is 404", (await patternZip("p-author", "?file=../../etc/passwd")).status, 404);
  const options = patternZipRoute.OPTIONS();
  check("OPTIONS answers the preflight", [options.status, options.headers.get("access-control-allow-origin")], [204, "*"]);

  check("a private pattern is not found", (await patternZip("p-private")).status, 404);
  check("…nor is its status", (await patternZip("p-private", "?status=1")).status, 404);
  check("a missing pattern is not found", (await patternZip("p-nope")).status, 404);
  const noHeader = await patternZip("p-nohdr");
  check("no header is 409", [noHeader.status, (await noHeader.json()).state], [409, "no-header"]);
  check("…and a 200 status", (await (await patternZip("p-nohdr", "?status=1")).json()).state, "no-header");
  const broken = await patternZip("p-broken");
  const brokenBody = await broken.json();
  check("a header that does not compile is 422", [broken.status, brokenBody.state], [422, "error"]);
  check("…with the compiler's tail", brokenBody.detail.includes("'nope' was not declared"), true);
  const brokenStatus = await (await patternZip("p-broken", "?status=1")).json();
  check("…and status says error, with the detail", [brokenStatus.state, Boolean(brokenStatus.detail)], ["error", true]);
  const flaky = await patternZip("p-flaky");
  check("a header the service just failed on is 503, not 202 forever", [flaky.status, (await flaky.json()).state], [503, "unavailable"]);

  // The port: nothing cached yet.
  const building = await patternZip("p-port");
  check("an unbaked pattern answers 202", [building.status, building.headers.get("retry-after")], [202, "2"]);
  check("…as JSON for code", await building.json(), { status: "building", retryAfterMs: 2000 });
  const page = await patternZip("p-port", "", "text/html,application/xhtml+xml,*/*;q=0.8");
  const pageText = await page.text();
  check("…and as a page that refreshes itself for a person", [page.status, page.headers.get("content-type")?.startsWith("text/html"), pageText.includes('http-equiv="refresh" content="2"')], [202, true, true]);
  check("status while building", await (await patternZip("p-port", "?status=1")).json(), { state: "building" });
  // A v3.2–3.3 console takes any 2xx to ?list=1 as the listing, finds no
  // files in a 202 and gives up for good; a 503 at least says "not yet".
  const oldConsole = await patternZip("p-port", "?list=1");
  check("an old console's ?list=1 while building is a 503, not a 2xx it misreads", [oldConsole.status, oldConsole.headers.get("retry-after"), (await oldConsole.json()).state], [503, "2", "building"]);
  check("…and so is its ?file=", (await patternZip("p-port", "?file=ported_glow.pfm")).status, 503);
  const portBakes = await db.select().from(schema.builds).where(and(eq(schema.builds.kind, "bake"), eq(schema.builds.status, "queued")));
  check("three requests, one bake", portBakes.length, 1);
  check("the port's bake is charged to the porter, not the author", portBakes[0]?.userId, "u-bob");
  check("…and it is the live port, not the stale one", JSON.parse(portBakes[0].patterns)[0].code.includes("BobPort"), true);
  await drain();
  const ported = unzipSync(new Uint8Array(await (await patternZip("p-port")).arrayBuffer()));
  const portSidecar = JSON.parse(new TextDecoder().decode(ported["ported_glow.json"]));
  check("a port's sidecar credits author and porter", portSidecar.author, "Alice (firmware port by bob)");

  delete process.env.BUILD_ENABLED;
  await pattern("p-cold", "u-alice", "Cold", header("ColdNs", "Cold"));
  check("no worker and nothing cached: 503", (await patternZip("p-cold")).status, 503);
  check("…while a cached pattern still downloads", (await patternZip("p-author")).status, 200);
  check("…and nothing was queued", (await db.select().from(schema.builds).where(eq(schema.builds.status, "queued"))).length, 0);
  process.env.BUILD_ENABLED = "1";

  // ── The deck zip route ─────────────────────────────────────────────────────
  console.log("\n── GET /decks/[id]/zip ──");
  await pattern("p-dup", "u-carol", "Wave Again", header("WaveAgain", "Wave"));
  await pattern("p-fresh", "u-carol", "Fresh", header("FreshNs", "Fresh Air"));
  const performanceJson = JSON.stringify({ version: 1, id: "set-one", title: "Set One", length: 10, loop: true, timeline: [{ t: 0, pattern: "Wave" }] });
  await db.insert(schema.decks).values([
    { id: "d-one", userId: "u-carol", title: "Set One!", visibility: "public", performanceJson, createdAt: now, updatedAt: now },
    { id: "d-empty0000", userId: "u-carol", title: "노을", visibility: "public", createdAt: now, updatedAt: now },
    { id: "d-private", userId: "u-carol", title: "Mine", visibility: "private", createdAt: now, updatedAt: now },
  ]);
  const slot = (deckId: string, position: number, patternId: string, titleSnapshot: string) => ({ deckId, position, patternId, titleSnapshot });
  await db.insert(schema.deckPatterns).values([
    slot("d-one", 0, "p-author", "Wave"),
    slot("d-one", 1, "p-port", "Ported"),
    slot("d-one", 2, "p-gone", "Gone Now"),
    slot("d-one", 3, "p-private", "Secret"),
    slot("d-one", 4, "p-nohdr", "No Header"),
    slot("d-one", 5, "p-broken", "Broken"),
    slot("d-one", 6, "p-dup", "Wave Again"),
    slot("d-one", 7, "p-fresh", "Fresh"),
    slot("d-empty0000", 0, "p-nohdr", "No Header"),
    slot("d-private", 0, "p-author", "Wave"),
  ]);
  const deckZip = (id: string, query = "", accept = "*/*") =>
    deckZipRoute.GET(
      new Request(`http://localhost:3000/api/community/decks/${id}/zip${query}`, { headers: { accept } }),
      { params: Promise.resolve({ id }) },
    );

  const expectedSkips = [
    { position: 2, title: "Gone Now", reason: "missing" },
    { position: 3, title: "Secret", reason: "missing" },
    { position: 4, title: "No Header", reason: "no-header" },
    { position: 5, title: "Broken", reason: "compile-error" },
  ];
  const warming = await (await deckZip("d-one", "?status=1")).json();
  check("a deck with unbaked slots is building", [warming.state, warming.total, warming.included, warming.pending], ["building", 8, 2, 2]);
  check("…and already says what it will skip, and why", warming.skipped, expectedSkips);
  check("the pack itself answers 202", (await deckZip("d-one")).status, 202);
  check("…and an old console's ?list=1 a 503", (await deckZip("d-one", "?list=1")).status, 503);
  const deckBakes = await db.select().from(schema.builds).where(and(eq(schema.builds.kind, "bake"), eq(schema.builds.status, "queued")));
  check("one bake per unbaked slot, charged to each header's owner", deckBakes.map((b) => b.userId).sort(), ["u-carol", "u-carol"]);
  await drain();

  const settled = await (await deckZip("d-one", "?status=1")).json();
  check("then it is ready: 4 of 8 in", [settled.state, settled.total, settled.included], ["ready", 8, 4]);
  check("…with the same skips", settled.skipped, expectedSkips);
  const deckResponse = await deckZip("d-one");
  check("the pack downloads", [deckResponse.status, deckResponse.headers.get("content-disposition")], [200, 'attachment; filename="patternflow-deck-set-one.zip"']);
  const deckBytes = new Uint8Array(await deckResponse.arrayBuffer());
  const deckEntries = unzipSync(deckBytes);
  check(
    "one bad slot no longer costs the set: every good one is in",
    Object.keys(deckEntries).sort(),
    ["catalog.txt", "fresh_air.json", "fresh_air.pfm", "ported_glow.json", "ported_glow.pfm", "set_one.pfs", "wave.json", "wave.pfm", "wave_2.json", "wave_2.pfm"],
  );
  check(
    "catalog.txt is the deck's running order, duplicate renamed",
    new TextDecoder().decode(deckEntries["catalog.txt"]).split("\n").filter((l) => l && !l.startsWith("#")),
    ["wave", "ported_glow", "wave_2", "fresh_air"],
  );
  const renamed = JSON.parse(new TextDecoder().decode(deckEntries["wave_2.json"]));
  check("the renamed module's sidecar names its own file", [renamed.slug, renamed.module, renamed.name], ["wave_2", "wave_2.pfm", "Wave"]);
  check("…and credits its own author", renamed.author, "Carol");
  check("the deck pack is deterministic", Buffer.from(deckBytes).equals(Buffer.from(new Uint8Array(await (await deckZip("d-one")).arrayBuffer()))), true);
  check("?list=1 works for a deck too", (await (await deckZip("d-one", "?list=1")).json()).files.includes("catalog.txt"), true);

  const empty = await deckZip("d-empty0000");
  check("nothing installable is 409 empty", [empty.status, (await empty.json()).state], [409, "empty"]);
  check("…and a 200 status", (await (await deckZip("d-empty0000", "?status=1")).json()).state, "empty");
  check("a private deck is not found", (await deckZip("d-private")).status, 404);
  check("…nor its status", (await deckZip("d-private", "?status=1")).status, 404);
  check("a missing deck is not found", (await deckZip("d-none")).status, 404);

  // ── Idle warming ───────────────────────────────────────────────────────────
  console.log("\n── idle warming, and a toolchain change ──");
  // Clear the flaky header's DB backoff so only the in-memory one is in play.
  await db.delete(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(FLAKY)));
  rev = "rev-B";
  const warmed = await jobs.warmIdle(deps, 3);
  check("a new toolchain re-warms, a few at a time", warmed, 3);
  check("…and the web now reads the new revision", await cache.currentBuilderRev(), "rev-B");
  const queuedShas = (await db.select().from(schema.builds).where(and(eq(schema.builds.kind, "bake"), eq(schema.builds.status, "queued")))).map((b) => b.sourceSha);
  check("nothing private or header-less is warmed", queuedShas.includes(cache.sourceSha(header("SecretNs", "Secret"))), false);
  check("the header that timed out is left alone for now", queuedShas.includes(cache.sourceSha(FLAKY)), false);
  const warmedMore = await jobs.warmIdle(deps, 50);
  const expectedPublic = ["p-author", "p-broken", "p-port", "p-cold", "p-dup", "p-fresh"].length;
  check("the next pass takes the rest, skipping what is queued", warmed + warmedMore, expectedPublic);
  const beforeRebake = compiled.length;
  await drain();
  check("each public header re-baked once for the new toolchain", compiled.length - beforeRebake, expectedPublic);
  // It failed at rev-A; a new toolchain deserves a fresh verdict, not a backoff.
  check("including the one that did not compile before", Boolean(await cache.lookupModule(cache.sourceSha(BROKEN), "rev-B")), true);
  check("after which there is nothing left to warm", await jobs.warmIdle(deps, 50), 0);
  check("the old revision's rows are still there for a rollback", Boolean(await cache.lookupModule(cache.sourceSha(WAVE), "rev-A")), true);

  const swept = await sweepModuleCache(new Date(now.getTime() + 60 * 1000));
  check("a sweep right away deletes nothing that is live", swept, { oldToolchain: 0, unpublished: 0 });

  const queuedBakes = async (userId?: string) =>
    (
      await db
        .select()
        .from(schema.builds)
        .where(and(eq(schema.builds.kind, "bake"), eq(schema.builds.status, "queued")))
    ).filter((row) => !userId || row.userId === userId);

  // ── The canary ─────────────────────────────────────────────────────────────
  console.log("\n── a 'does not compile' is checked against a known-good build ──");
  let toolchainOk = false;
  let canaryCalls = 0;
  const guarded: typeof deps = {
    ...deps,
    canary: async () => {
      canaryCalls += 1;
      return toolchainOk;
    },
  };
  const SICK = header("SickNs", "Sick", "BROKEN");
  await pattern("p-sick", "u-carol", "Sick", SICK);
  await cache.requestBake(SICK, "u-carol", "Sick");
  const sick = await jobs.processNextBuild("smoke", guarded);
  check("the canary is asked before a failure is cached", canaryCalls, 1);
  check("with the toolchain broken, the failure is NOT the header's verdict", await cache.lookupModule(cache.sourceSha(SICK), "rev-B"), null);
  check("…the bake is an error — no verdict, backed off", [sick?.status, sick?.cachedError ?? false, infraBackoff.has(cache.sourceSha(SICK))], ["error", false, true]);
  check("…and the job says why", (await builds.getBuild(sick!.id))?.error?.includes("known to build failed as well"), true);
  const sickSend = await builds.enqueueBuild("u-carol", [{ label: "mine", code: header("SickSend", "Sick Send", "BROKEN") }], "pfm");
  await jobs.processNextBuild("smoke", guarded);
  check("a send under a broken toolchain fails without caching either", [(await builds.getBuild(sickSend))?.status, await cache.lookupModule(cache.sourceSha(header("SickSend", "Sick Send", "BROKEN")), "rev-B")], ["error", null]);
  toolchainOk = true;
  await db.delete(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(SICK)));
  infraBackoff.delete(cache.sourceSha(SICK));
  await cache.requestBake(SICK, "u-carol", "Sick");
  const sickAgain = await jobs.processNextBuild("smoke", guarded);
  check("with the toolchain fine, the same failure IS cached", [sickAgain?.cachedError, (await cache.lookupModule(cache.sourceSha(SICK), "rev-B"))?.status], [true, "error"]);

  // ── No compiler, no revision ───────────────────────────────────────────────
  console.log("\n── a compiler that cannot be named publishes no revision ──");
  // A digest of "compiler unknown" would move the whole site to a revision
  // with nothing cached under it, and the catalogue would be re-baked twice.
  const { ToolchainUnavailable } = await import("../src/lib/firmware/builderRev");
  const blind: typeof deps = {
    ...deps,
    builderRev: async () => {
      throw new ToolchainUnavailable("The compiler did not answer --version.");
    },
  };
  const revBefore = await cache.currentBuilderRev();
  const blindSend = await builds.enqueueBuild("u-carol", [{ label: "mine", code: header("Blind", "Blind") }], "pfm");
  await jobs.processNextBuild("smoke", blind);
  const blindRow = await builds.getBuild(blindSend);
  check("the job fails as the machine's, in words rather than a stack", [blindRow?.status, blindRow?.error?.startsWith("The build service's compiler is not available")], ["error", true]);
  check("…and the published revision stays the last good one", await cache.currentBuilderRev(), revBefore);
  check("…and the warm-up skips its round", await jobs.warmIdle(blind, 5).then(() => "ran", () => "skipped"), "skipped");

  // ── Odd line endings, end to end ───────────────────────────────────────────
  console.log("\n── a header stored with odd line endings ──");
  const CR = header("CarriageNs", "Carriage").replace(/\n/g, "\r\r\r\n");
  await pattern("p-cr", "u-bob", "Carriage", CR);
  const crFirst = (await patternZip("p-cr")).status;
  await drain();
  const crSecond = await patternZip("p-cr");
  check("one bake, then the file — not a 202 forever", [crFirst, crSecond.status], [202, 200]);
  check("…and the pattern is not warmed again and again", (await cache.findWarmCandidates("rev-B", 50)).some((c) => c.sha === cache.sourceSha(CR)), false);

  // ── A stem the board throws away ───────────────────────────────────────────
  console.log("\n── a pattern NAMEd Performance ──");
  check("a pack never hands out the stem the board discards", pack.assignPackSlugs(["performance", "Performance", "wave"]), ["performance_2", "Performance_3", "wave"]);
  await pattern("p-perf", "u-bob", "Performance", header("PerfNs", "Performance"));
  await patternZip("p-perf");
  await drain();
  const perf = await patternZip("p-perf");
  const perfEntries = unzipSync(new Uint8Array(await perf.arrayBuffer()));
  check("its single zip renames it rather than lose the sidecar", Object.keys(perfEntries).sort(), ["performance_2.json", "performance_2.pfm"]);
  check("…and its status says the name it will have", (await (await patternZip("p-perf", "?status=1")).json()).slug, "performance_2");

  // ── One owner's bakes are capped ───────────────────────────────────────────
  console.log("\n── one owner cannot flood the bake queue ──");
  // Header text is free to write; a compile is not. Without a cap, an account
  // saving a new header every few seconds queued a compile each time, and
  // every other pattern's first download waited behind the lot.
  const flood = Array.from({ length: cache.BAKE_OWNER_MAX + 2 }, (_, i) => header(`Flood${i}`, `Flood ${i}`));
  const floodAnswers = [];
  for (const code of flood) floodAnswers.push(await cache.requestBake(code, "u-carol", "flood"));
  check("an owner never has more than BAKE_OWNER_MAX bakes waiting", (await queuedBakes("u-carol")).length, cache.BAKE_OWNER_MAX);
  check(
    "…the rest are told 'queued' with nothing behind it yet",
    floodAnswers.slice(-2).map((answer) => answer.state === "queued" && answer.buildId === null),
    [true, true],
  );
  const otherOwner = await cache.requestBake(header("BobsOwn", "Bobs Own"), "u-bob", "bob");
  check("…and another owner's bake is not held back by it", otherOwner.state === "queued" && otherOwner.buildId !== null, true);

  // None of that text is on the site, so none of it is worth a compile.
  const beforeFlood = compiled.length;
  const floodOutcomes = [];
  for (let outcome = await jobs.processNextBuild("smoke", deps); outcome; outcome = await jobs.processNextBuild("smoke", deps)) {
    floodOutcomes.push(outcome);
  }
  check("bakes of text no longer on the site are skipped, not compiled", [compiled.length - beforeFlood, floodOutcomes.every((o) => o.status === "done" && o.skipped)], [0, true]);
  const refused = await cache.requestBake(flood[flood.length - 1], "u-carol", "flood");
  check("once the queue drains, the owner can queue again", refused.state === "queued" && refused.buildId !== null, true);
  await drain();

  // ── Warming does not stall on what would be refused ───────────────────────
  console.log("\n── idle warming skips what requestBake would refuse ──");
  rev = "rev-C";
  await jobs.warmIdle(deps, 0); // publish the new revision, queue nothing
  // Three of alice's, newer than the rest of the catalogue…
  for (let i = 0; i < 3; i++) await pattern(`p-alice-new-${i}`, "u-alice", `Alice New ${i}`, header(`AliceNew${i}`, `Alice New ${i}`));
  // …and five headers newer than everything, each wedged: seven failures in
  // the last day, the last half an hour ago, so the database backoff (an hour
  // and more) outlasts the worker's own 30-minute memory of them.
  const wedged: string[] = [];
  for (let i = 0; i < 5; i++) {
    const code = header(`Wedged${i}`, `Wedged ${i}`);
    await pattern(`p-wedged-${i}`, "u-alice", `Wedged ${i}`, code);
    wedged.push(cache.sourceSha(code));
    for (let k = 0; k < 7; k++) {
      const at = new Date(Date.now() - (31 + k * 20) * 60 * 1000);
      await db.insert(schema.builds).values({
        id: `wedge-${i}-${k}`,
        userId: "u-alice",
        status: "error",
        format: "pfm",
        patterns: JSON.stringify([{ label: "wedged", code }]),
        kind: "bake",
        sourceSha: cache.sourceSha(code),
        error: "[timed out after 120s]",
        createdAt: at,
        finishedAt: at,
      });
    }
  }
  check("requestBake would refuse each of them", Boolean(await cache.bakeBackoff(wedged[0])), true);
  // Three of alice's slots taken by work already queued: one more is hers.
  for (let i = 0; i < 3; i++) await cache.requestBake(header(`Filler${i}`, `Filler ${i}`), "u-alice", "filler");
  const candidates = await cache.findWarmCandidates("rev-C", 5);
  check("the newest wedged headers do not take the warm-up's slots", [candidates.length, candidates.some((c) => wedged.includes(c.sha))], [5, false]);
  check(
    "…and no owner is handed more than their cap — one of alice's three, then older work",
    candidates.map((c) => c.label),
    ["Alice New 2", "Performance", "Carriage", "Sick", "Fresh"],
  );
  const warmedPast = await jobs.warmIdle(deps, 5);
  const nowQueued = (await queuedBakes()).map((row) => row.sourceSha);
  check("warmIdle queues older headers instead of stalling on them", [warmedPast, nowQueued.some((sha) => wedged.includes(sha!))], [5, false]);
  await drain();

  // ── Header writes queue a bake ─────────────────────────────────────────────
  console.log("\n── writing a header queues its bake ──");
  const auth = getAuth();
  const enrol = async (username: string) => {
    const response = await auth.api.signUpEmail({
      body: { email: `${username}@patternflow.local`, password: "smoke-test-password", name: username, username },
      asResponse: true,
    });
    return response.headers.get("set-cookie")!.split(";")[0];
  };
  const writerCookie = await enrol("writer");
  const porterCookie = await enrol("porter");
  const writerId = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.username, "writer")))[0].id;
  const porterId = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.username, "porter")))[0].id;
  await pattern("p-write", writerId, "Written", null);

  const PORT = header("PortedHere", "Ported Here");
  const proposed = await headerRoute.POST(
    new Request("http://localhost:3000/api/community/patterns/p-write/header", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: porterCookie },
      body: JSON.stringify({ codeCpp: PORT, note: "tested" }),
    }),
    { params: Promise.resolve({ id: "p-write" }) },
  );
  check("a port is accepted", proposed.status, 201);
  const portBake = await db.select().from(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(PORT)));
  check("…and its bake is queued, charged to the porter", [portBake.length, portBake[0]?.userId, portBake[0]?.kind], [1, porterId, "bake"]);

  const OWN = header("WrittenOwn", "Written");
  const patched = await patternRoute.PATCH(
    new Request("http://localhost:3000/api/community/patterns/p-write", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: writerCookie },
      body: JSON.stringify({ codeCpp: OWN }),
    }),
    { params: Promise.resolve({ id: "p-write" }) },
  );
  check("the author attaches their own header", patched.status, 200);
  const ownBake = await db.select().from(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(OWN)));
  check("…which out-ranks the port, so it is what gets baked", [ownBake.length, ownBake[0]?.userId], [1, writerId]);

  // Saved again a few seconds later: the first text's bake is still waiting,
  // and nothing can ask for that text any more.
  await db
    .update(schema.builds)
    .set({ createdAt: new Date(Date.now() - 5000) })
    .where(eq(schema.builds.id, ownBake[0].id));
  const OWN3 = header("WrittenOwn", "Written Third");
  const resaved = await patternRoute.PATCH(
    new Request("http://localhost:3000/api/community/patterns/p-write", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: writerCookie },
      body: JSON.stringify({ codeCpp: OWN3 }),
    }),
    { params: Promise.resolve({ id: "p-write" }) },
  );
  const replaced = await builds.getBuild(ownBake[0].id);
  check("saving over a header cancels the replaced text's waiting bake", [resaved.status, replaced?.status, replaced?.error?.startsWith("Superseded")], [200, "done", true]);
  check("…without holding it against that text's backoff", await cache.bakeBackoff(cache.sourceSha(OWN)), null);
  check("…and bakes the new one", (await queuedBakes(writerId)).map((row) => row.sourceSha), [cache.sourceSha(OWN3)]);
  check("…while the port, still on the site, keeps its bake", (await queuedBakes(porterId)).length, 1);

  delete process.env.BUILD_ENABLED;
  const OWN2 = header("WrittenOwn", "Written Again");
  const patchedOff = await patternRoute.PATCH(
    new Request("http://localhost:3000/api/community/patterns/p-write", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: writerCookie },
      body: JSON.stringify({ codeCpp: OWN2 }),
    }),
    { params: Promise.resolve({ id: "p-write" }) },
  );
  check("without a worker the write still succeeds", patchedOff.status, 200);
  check("…and queues nothing", (await db.select().from(schema.builds).where(eq(schema.builds.sourceSha, cache.sourceSha(OWN2)))).length, 0);
  process.env.BUILD_ENABLED = "1";
}

main()
  .catch((error: unknown) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    // Close before deleting: Windows will not remove an open SQLite file.
    try {
      const { getDb } = await import("../src/lib/community/server/db");
      getDb().$client.close();
    } catch {
      // never opened
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failures === 0 ? "\nAll module cache checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
