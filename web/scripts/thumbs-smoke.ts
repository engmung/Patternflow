// Smoke test for the feed's thumbnail queue (src/lib/community/thumbs.ts):
// one hidden sandbox iframe, jobs rendered one at a time, results cached.
// Fakes the iframe with a stub that answers every `pf-still` after a tick, so
// the queue discipline can be checked without a browser: jobs run in order,
// a withdrawn (aborted) job never reaches the iframe and is forgotten so it
// can be asked for again, a job already rendering finishes, and the cache
// forgets its oldest entries past the cap. Run: npx tsx scripts/thumbs-smoke.ts

export {};

type Listener = (event: { source: unknown; data: unknown }) => void;

const listeners: Listener[] = [];
const rendered: string[] = [];
let frameWindow: { postMessage: (msg: Record<string, unknown>) => void } | null = null;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ── minimal browser stubs the module touches ──
const fakeWindow = {
  addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
  removeEventListener: (_type: string, listener: Listener) => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  },
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
};
const fakeDocument = {
  createElement: () => {
    const element = {
      style: { cssText: "" },
      tabIndex: 0,
      src: "",
      setAttribute() {},
      remove() {},
      contentWindow: {
        postMessage: (msg: Record<string, unknown>) => {
          // The "sandbox" renders: answer on the next tick, like a real frame.
          rendered.push(String(msg.id));
          setTimeout(() => {
            for (const listener of [...listeners]) {
              listener({ source: element.contentWindow, data: { type: "pf-still-result", id: msg.id, ok: true, dataUrl: `data:${msg.id}` } });
            }
          }, 5);
        },
      },
    };
    frameWindow = element.contentWindow;
    return element;
  },
  body: {
    appendChild: () => {
      // The real frame announces itself once its document has booted.
      setTimeout(() => {
        for (const listener of [...listeners]) listener({ source: frameWindow, data: { type: "pf-ready" } });
      }, 5);
    },
  },
};
Object.assign(globalThis, { window: fakeWindow, document: fakeDocument });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { renderPatternThumb } = await import("../src/lib/community/thumbs");

  // 1. Three jobs, in order, each answered.
  const a = renderPatternThumb("code-a");
  const b = renderPatternThumb("code-b");
  const c = renderPatternThumb("code-c", [0.1, 0.2, 0.3, 0.4]);
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  if (!ra.ok || !rb.ok || !rc.ok) fail("all three stills should render");
  if (rendered.join(",") !== "still-1,still-2,still-3") fail(`render order: ${rendered.join(",")}`);
  if ((await renderPatternThumb("code-a")) !== ra) fail("a repeat request is served from the cache");
  console.log("  ok  sequential rendering + cache hit");

  // 2. A withdrawn job never reaches the iframe, resolves at once, and is not cached.
  rendered.length = 0;
  const controller = new AbortController();
  const slow = renderPatternThumb("code-slow");
  const withdrawn = renderPatternThumb("code-withdrawn", undefined, controller.signal);
  controller.abort();
  const rw = await withdrawn;
  if (rw.ok || rw.error !== "Cancelled.") fail(`withdrawn job should resolve cancelled, got ${JSON.stringify(rw)}`);
  await slow;
  await wait(20);
  if (rendered.includes("still-5")) fail("a withdrawn job must not reach the iframe");
  const again = await renderPatternThumb("code-withdrawn");
  if (!again.ok) fail("asking again after a withdrawal renders fresh");
  console.log("  ok  withdrawal leaves the queue, re-request renders");

  // 3. Aborting the job that is already rendering lets it finish (and stay cached).
  rendered.length = 0;
  const active = new AbortController();
  const running = renderPatternThumb("code-running", undefined, active.signal);
  await wait(1); // past pump(): it is the active job now
  active.abort();
  const rr = await running;
  if (!rr.ok) fail("an in-flight job finishes despite a late abort");
  if ((await renderPatternThumb("code-running")) !== rr) fail("its result stays cached");
  console.log("  ok  late abort does not disturb the active job");

  // 4. The cache forgets its oldest entries past the cap.
  const first = renderPatternThumb("evict-0");
  for (let index = 1; index <= 420; index++) renderPatternThumb(`evict-${index}`);
  await wait(420 * 6 + 200);
  if ((await renderPatternThumb("evict-0")) === (await first)) fail("the oldest entry should have been evicted");
  if ((await renderPatternThumb("evict-420")) !== (await renderPatternThumb("evict-420"))) fail("a recent entry is still cached");
  console.log("  ok  cache bounded");

  console.log("thumbs-smoke: OK");
}

void main();
