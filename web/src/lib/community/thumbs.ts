"use client";

import { knobSetupFromCode } from "./knobs";
import { PATTERN_SANDBOX_URL } from "./sandboxUrl";

// Feed thumbnails: one hidden sandboxed iframe renders stills sequentially.
// Supports custom knob values so card thumbnails retain user-modified states.

export type StillResult = { ok: boolean; dataUrl?: string; error?: string };

type Job = {
  id: string;
  code: string;
  customKnobValues?: number[];
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
      seconds: 0.0,
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

/** Render a thumbnail for pattern code (optionally with custom knob values). */
export function renderPatternThumb(code: string, customKnobValues?: number[]): Promise<StillResult> {
  const cacheKey = customKnobValues ? `${code}::${customKnobValues.join(",")}` : code;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = new Promise<StillResult>((resolve) => {
    queue.push({ id: `still-${++jobCounter}`, code, customKnobValues, resolve });
    pump();
  });
  cache.set(cacheKey, promise);
  return promise;
}
