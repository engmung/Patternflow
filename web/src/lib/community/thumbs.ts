"use client";

import { knobSetupFromCode } from "./knobs";
import { PATTERN_SANDBOX_URL } from "./sandboxUrl";

// Feed thumbnails: one hidden sandboxed iframe renders stills sequentially.
// Supports custom knob values so card thumbnails retain user-modified states.
//
// Both the queue and the cache are module-scoped on purpose (the iframe lives
// outside React, so it survives the feed's remounts and a back navigation
// reuses every still it already made), which is exactly why both are bounded:
// a request can be withdrawn while it is still waiting (a card scrolled away,
// a knob turned again before its still was drawn), and the cache forgets its
// oldest entries past a cap. Without either, a few seconds of wheel-scrolling
// on one card queued a hundred renders at five seconds' timeout each — every
// other card sat at "rendering…" and the backlog outlived the page.

export type StillResult = { ok: boolean; dataUrl?: string; error?: string };

type Job = {
  id: string;
  key: string;
  code: string;
  customKnobValues?: number[];
  resolve: (result: StillResult) => void;
};

const STILL_TIMEOUT_MS = 5000;
/** Stills kept: a 128×64 PNG is a few KB, so this is a few hundred KB at most. */
const CACHE_MAX = 400;

const cache = new Map<string, Promise<StillResult>>();
const queue: Job[] = [];
let activeJob: Job | null = null;
let activeTimeout = 0;
let frame: HTMLIFrameElement | null = null;
let frameReady = false;
let jobCounter = 0;

function handleMessage(event: MessageEvent) {
  if (!frame || event.source !== frame.contentWindow) return;
  const msg = event.data as { type?: string; id?: string; ok?: boolean; dataUrl?: string; error?: string };
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "pf-ready") {
    frameReady = true;
    pump();
    return;
  }
  if (msg.type === "pf-still-result" && activeJob && msg.id === activeJob.id) {
    window.clearTimeout(activeTimeout);
    const job = activeJob;
    activeJob = null;
    job.resolve(
      msg.ok
        ? { ok: true, dataUrl: msg.dataUrl }
        : { ok: false, error: msg.error ?? "Render failed." },
    );
    pump();
  }
}

function ensureFrame() {
  if (frame) return;
  frameReady = false;
  const element = document.createElement("iframe");
  element.setAttribute("sandbox", "allow-scripts");
  element.src = PATTERN_SANDBOX_URL;
  element.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";
  element.setAttribute("aria-hidden", "true");
  element.tabIndex = -1;
  document.body.appendChild(element);
  frame = element;
  window.addEventListener("message", handleMessage);
}

function destroyFrame() {
  window.removeEventListener("message", handleMessage);
  frame?.remove();
  frame = null;
  frameReady = false;
}

function pump() {
  if (activeJob || queue.length === 0) return;
  ensureFrame();
  if (!frameReady || !frame?.contentWindow) return; // pf-ready will re-pump

  const job = queue.shift();
  if (!job) return;
  activeJob = job;

  const setup = knobSetupFromCode(job.code);
  const knobValues = job.customKnobValues ?? setup.values;

  frame.contentWindow.postMessage(
    {
      type: "pf-still",
      id: job.id,
      code: job.code,
      knobValues,
      knobRanges: setup.ranges,
      // Not frame zero. A still at t=0 is the pattern before anything has
      // happened in it — particles unspawned, trails empty, most of the screen
      // dark — so the card advertised a picture the pattern never shows. This
      // is the sandbox's own default: enough frames for a pattern to become
      // itself, few enough to stay cheap (the whole feed shares one hidden
      // iframe, rendering these one at a time, and each result is cached).
      //
      // It was 0.9 until b3419cd changed it to 0.0 inside a large unrelated
      // commit that never mentions thumbnails.
      seconds: 0.9,
      fps: 15,
    },
    "*",
  );

  activeTimeout = window.setTimeout(() => {
    if (activeJob !== job) return;
    activeJob = null;
    destroyFrame();
    job.resolve({ ok: false, error: "Pattern timed out." });
    pump();
  }, STILL_TIMEOUT_MS);
}

function remember(key: string, promise: Promise<StillResult>) {
  // Re-inserting moves the key to the end, so eviction is oldest-first.
  cache.delete(key);
  cache.set(key, promise);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Render a thumbnail for pattern code (optionally with custom knob values).
 *
 * Pass an AbortSignal to withdraw the request: a job that has not reached the
 * iframe yet leaves the queue and resolves `{ ok: false }` at once (and is
 * forgotten, so asking again later renders it fresh). A job already rendering
 * finishes — the iframe is sequential, so there is nothing to reclaim.
 */
export function renderPatternThumb(
  code: string,
  customKnobValues?: number[],
  signal?: AbortSignal,
): Promise<StillResult> {
  const cacheKey = customKnobValues ? `${code}::${customKnobValues.join(",")}` : code;
  const cached = cache.get(cacheKey);
  if (cached) {
    remember(cacheKey, cached);
    return cached;
  }
  if (signal?.aborted) return Promise.resolve({ ok: false, error: "Cancelled." });

  const promise = new Promise<StillResult>((resolve) => {
    const job: Job = { id: `still-${++jobCounter}`, key: cacheKey, code, customKnobValues, resolve };
    queue.push(job);
    signal?.addEventListener(
      "abort",
      () => {
        const index = queue.indexOf(job);
        if (index < 0) return; // already rendering (or done) — let it finish
        queue.splice(index, 1);
        if (cache.get(cacheKey) === promise) cache.delete(cacheKey);
        resolve({ ok: false, error: "Cancelled." });
      },
      { once: true },
    );
    pump();
  });
  remember(cacheKey, promise);
  return promise;
}
