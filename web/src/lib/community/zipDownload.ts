"use client";

// "Download .zip" for a community pattern or deck, shared by both pages.
//
// The zip routes answer 202 while a module is compiled for the first time,
// and a person clicking a button should never be the one who sees that. So
// this asks the route's `?status=1` form — always JSON, never a file, and a
// miss there already queues the compile — every two seconds until the answer
// settles, and only then navigates to the file, ONCE. Fetching the zip and
// then navigating to it as well used to download it twice over; a blob we
// saved ourselves would lose the filename the route sets.
//
// The status fetch goes out cookie-less. These routes are public and answer
// `Access-Control-Allow-Origin: *`, which a browser refuses to combine with
// credentials — the community's usual `credentials: "include"` would turn a
// cross-origin page's status check into a CORS failure for no gain.
//
// A dropped poll is not a failed download (a phone changing networks drops
// one now and then), so a few in a row are tolerated before giving up.

import { useCallback, useEffect, useRef, useState } from "react";

// "duplicate-name" is kept for older servers; the current deck route renames a
// colliding file instead of leaving it out. "unavailable" is a slot the build
// service failed on just now for a reason that was not the code's.
export type ZipSkipReason = "no-header" | "compile-error" | "duplicate-name" | "missing" | "unavailable";

export type ZipSkip = { position: number; title: string; reason: ZipSkipReason };

/** What `?status=1` answers — contract B (pattern) and C (deck) in one shape. */
export type ZipStatus = {
  state: "ready" | "building" | "error" | "no-header" | "empty";
  slug?: string;
  bytes?: number;
  error?: string;
  /** Compiler tail, when a pattern's header does not build. */
  detail?: string;
  total?: number;
  included?: number;
  skipped?: ZipSkip[];
};

export type ZipKind = "pattern" | "deck";

export type ZipPhase = "idle" | "checking" | "building" | "ready" | "error";

const POLL_MS = 2000;
// A deck nobody has downloaded compiles one header after another; a long one
// on a cold toolchain is a minute or two. Past this the worker is more likely
// stuck than slow, and saying so beats a spinner that never ends.
const DEADLINE_MS = 180_000;
const MAX_DROPPED_POLLS = 3;

const STATUS_INIT: RequestInit = { credentials: "omit", cache: "no-store" };

function defaultNavigate(url: string) {
  window.location.assign(url);
}

/** The same address with `?status=1` (or `&status=1`) on it. */
export function zipStatusUrl(zipUrl: string): string {
  return `${zipUrl}${zipUrl.includes("?") ? "&" : "?"}status=1`;
}

const SKIP_REASONS: Record<ZipSkipReason, string> = {
  "no-header": "no firmware header",
  "compile-error": "its header does not compile",
  "duplicate-name": "same module name as an earlier slot",
  missing: "removed or made private",
  unavailable: "the build service could not compile it just now — try again later",
};

export function skipReasonLabel(reason: string): string {
  return SKIP_REASONS[reason as ZipSkipReason] ?? reason;
}

/** "12 of 14 patterns included." — null for a single pattern or a full deck. */
export function includedSummary(status: ZipStatus | null): string | null {
  if (!status || typeof status.total !== "number" || typeof status.included !== "number") {
    return null;
  }
  if (status.included === status.total) return null;
  return `${status.included} of ${status.total} pattern${status.total === 1 ? "" : "s"} included.`;
}

/** The sentence for a state that will never become a file. */
function settledError(kind: ZipKind, status: ZipStatus): string | null {
  switch (status.state) {
    case "no-header":
      return status.error ?? "This pattern has no firmware header right now, so there is nothing to install.";
    case "empty":
      return (
        status.error ??
        "Nothing in this deck can be installed right now — none of its patterns has a header that builds."
      );
    case "error":
      // For a pattern the route's own words may be the compiler's tail, which
      // belongs in the log box under this sentence (see settledDetail), not in
      // the sentence itself.
      return kind === "pattern"
        ? "This pattern's header does not compile on the current firmware toolchain."
        : (status.error ?? "The pack could not be prepared.");
    default:
      return null;
  }
}

/** Compiler output to show under a failed pattern, if the route sent any. */
function settledDetail(kind: ZipKind, status: ZipStatus): string | null {
  if (status.state !== "error" || kind !== "pattern") return null;
  return status.detail ?? status.error ?? null;
}

export function buildingNote(kind: ZipKind): string {
  // A deck's order costs nothing (catalog.txt is written per request); what
  // waits is a pattern whose header nobody has downloaded since it changed.
  return kind === "deck"
    ? "Preparing the pack — patterns nobody has downloaded yet compile on first use, a few seconds each."
    : "Preparing the module — the first download compiles it, usually a few seconds.";
}

/**
 * Poll a zip route's status and, when asked, hand the file to the browser.
 *
 * `download()` polls until ready and then navigates once; `check()` polls the
 * same way without navigating (a modal opening warms the compile with it).
 * Both share one in-flight guard, so a double click is one request chain.
 */
export function useZipDownload(
  zipUrl: string,
  kind: ZipKind,
  /** How the file is handed over. Only tests replace it — jsdom's location
   *  cannot be spied on. */
  navigateTo: (url: string) => void = defaultNavigate,
) {
  const [phase, setPhase] = useState<ZipPhase>("idle");
  const [status, setStatus] = useState<ZipStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  // One run at a time; bumping the token abandons whatever was polling (the
  // component unmounted, or the address changed underneath it).
  const token = useRef(0);
  const running = useRef(false);
  useEffect(
    () => () => {
      token.current += 1;
      running.current = false;
    },
    [zipUrl],
  );

  const run = useCallback(
    async (navigate: boolean): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      const mine = ++token.current;
      const alive = () => token.current === mine;
      setError(null);
      setDetail(null);
      // The last run's answer is not this one's: a "12 of 14 included" left
      // over from it would sit under whatever this run ends in.
      setStatus(null);
      setPhase("checking");
      const deadline = Date.now() + DEADLINE_MS;
      let dropped = 0;
      try {
        for (;;) {
          let next: ZipStatus | null = null;
          try {
            const response = await fetch(zipStatusUrl(zipUrl), STATUS_INIT);
            const body = (await response.json().catch(() => null)) as
              | (ZipStatus & { error?: string })
              | null;
            if (!alive()) return false;
            if (!response.ok || !body || typeof body.state !== "string") {
              setPhase("error");
              setError(body?.error ?? "Could not prepare the download.");
              return false;
            }
            next = body;
            dropped = 0;
          } catch {
            if (!alive()) return false;
            dropped += 1;
            if (dropped > MAX_DROPPED_POLLS) {
              setPhase("error");
              setError("Network error — could not reach the community.");
              return false;
            }
          }

          if (next) {
            setStatus(next);
            if (next.state === "ready") {
              setPhase("ready");
              // A navigation, not a blob: the file lands in Downloads under
              // the name the route sets, and if the pack changed between the
              // check and this request the route answers a person's browser
              // with a page that refreshes itself rather than an error.
              if (navigate) navigateTo(zipUrl);
              return true;
            }
            const failed = settledError(kind, next);
            if (failed) {
              setPhase("error");
              setError(failed);
              setDetail(settledDetail(kind, next));
              return false;
            }
            setPhase("building");
          }

          if (Date.now() > deadline) {
            setPhase("error");
            setError("This is taking unusually long to compile. Try again in a moment.");
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (!alive()) return false;
        }
      } finally {
        if (alive()) running.current = false;
      }
    },
    [zipUrl, kind, navigateTo],
  );

  const download = useCallback(() => run(true), [run]);
  const check = useCallback(() => run(false), [run]);

  return { phase, status, error, detail, download, check, busy: phase === "checking" || phase === "building" };
}
