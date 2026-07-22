"use client";

import { knobSetupFromCode } from "./knobs";
import { PATTERN_SANDBOX_URL } from "./sandboxUrl";

// Feed thumbnails: one hidden sandboxed iframe renders stills sequentially.
// One iframe per card would be far too heavy, and running untrusted code in
// the page is forbidden — so every card funnels through this queue and gets
// back a data-URL PNG. A pattern that hangs (while(true)) only stalls the
// queue until its timeout, after which the iframe is rebuilt and the queue
// moves on.

export type StillResult = { ok: boolean; dataUrl?: string; error?: string };

type Job = {
  id: string;
  code: string;
  resolve: (result: StillResult) => void;
};

const STILL_TIMEOUT_MS = 5000;

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
  // The sandbox attribute is the security boundary — allow-scripts ONLY.
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
  frame.contentWindow.postMessage(
    {
      type: "pf-still",
      id: job.id,
      code: job.code,
      knobValues: setup.values,
      knobRanges: setup.ranges,
      seconds: 0.9,
      fps: 15,
    },
    "*",
  );

  // A runaway pattern blocks the sandbox's message loop entirely — the only
  // recovery is to tear the iframe down and start a fresh one.
  activeTimeout = window.setTimeout(() => {
    if (activeJob !== job) return;
    activeJob = null;
    destroyFrame();
    job.resolve({ ok: false, error: "Pattern timed out." });
    pump();
  }, STILL_TIMEOUT_MS);
}

/** Render a thumbnail for pattern code. Cached per code string for the session. */
export function renderPatternThumb(code: string): Promise<StillResult> {
  const cached = cache.get(code);
  if (cached) return cached;

  const promise = new Promise<StillResult>((resolve) => {
    queue.push({ id: `still-${++jobCounter}`, code, resolve });
    pump();
  });
  cache.set(code, promise);
  return promise;
}
