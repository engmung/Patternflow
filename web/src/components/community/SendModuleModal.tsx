"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { useDeviceHost } from "@/lib/community/deviceHost";
import { captureEvent } from "@/lib/posthogEvents";
import { useZipDownload } from "@/lib/community/zipDownload";
import AuthModal from "./AuthModal";
import { ZipInstallNote, ZipProgress } from "./ZipDownload";
import styles from "./Community.module.css";

// One pattern, straight onto the device as a loadable module.
//
// The deck already does this for several patterns at once, and "Flash to my
// board" does the whole-firmware version. Neither fits the common case people
// asked for: I like this one pattern, put it on my board. The deck makes you
// collect before you can install, and a firmware build costs a minute and a
// USB cable to deliver one ~6 KB module.
//
// Two modes, because there are two kinds of code to send:
//
// - A published community pattern (`patternId`). Its header is stored on the
//   server, so its module is compiled once and kept, and the pattern's own
//   zip address serves it to anyone — no sign-in, no build queue. The board
//   is handed that address and fetches the file itself; a download of the
//   same file is the way in when the board is out of reach (a VPN).
// - Arbitrary code (`code`) — Pattern Lab's assembled header, which exists
//   nowhere but this browser. That still goes through POST /builds, signed
//   in, with a single-item list, so there is one server path for it.

type ModuleBuild = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  queuePosition: number | null;
  elapsedMs: number | null;
  bytes: number | null;
  error: string | null;
  namespaces: string[];
  modulesUrl: string | null;
};

export default function SendModuleModal(
  props: {
    patternTitle: string;
    onClose: () => void;
  } & (
    | {
        /** A published community pattern — installed from its own zip address. */
        patternId: string;
        code?: undefined;
      }
    | {
        /** Arbitrary header code (Pattern Lab) — built through POST /builds. */
        code: string;
        patternId?: undefined;
      }
  ),
) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={props.onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span>Send to my Patternflow</span>
          <button type="button" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </div>
        {props.patternId !== undefined ? (
          <PatternZipBody patternId={props.patternId} patternTitle={props.patternTitle} />
        ) : (
          <CodeBuildBody code={props.code} patternTitle={props.patternTitle} />
        )}
      </div>
    </div>
  );
}

// A published pattern: nothing to sign in for and nothing to queue. Opening
// the modal asks the zip route for its status, which also starts the compile
// if this header has never been compiled — so by the time somebody has read
// the two buttons it is usually ready.
function PatternZipBody({ patternId, patternTitle }: { patternId: string; patternTitle: string }) {
  const { patternsUrl } = useDeviceHost();
  const zipPath = `/api/community/patterns/${patternId}/zip`;
  const zip = useZipDownload(communityApiUrl(zipPath), "pattern");
  const { check } = zip;

  // No once-only latch: under Strict Mode the first run is abandoned by the
  // hook's cleanup, and a latch would leave the modal saying "Checking…"
  // forever. The hook's own in-flight guard keeps this to one chain.
  useEffect(() => {
    void check();
  }, [check]);

  // Handed to the board only once the module exists. A v3.4+ board would
  // wait out a 202 by itself, but the modal promises v3.2.0 and up, and a
  // v3.2–3.3 console fetches `?list=1`, reads a still-compiling answer as "no
  // files" and gives up without retrying. The check that opened with the
  // modal is already polling, so the wait is the compile and nothing more.
  const unsendable = zip.phase !== "ready";
  const cannotBuild = zip.status?.state === "error" || zip.status?.state === "no-header";

  const download = async () => {
    if (await zip.download()) {
      captureEvent("community_download", { pattern_id: patternId, kind: "zip" });
    }
  };

  return (
    <div className={styles.modalBody}>
      {zip.phase === "ready" && (
        <p className={styles.buildStatusLine}>
          ✓ {patternTitle} is ready
          {typeof zip.status?.bytes === "number"
            ? ` · ${Math.max(1, Math.round(zip.status.bytes / 1024))} KB`
            : ""}
        </p>
      )}
      <ZipProgress
        kind="pattern"
        phase={zip.phase}
        status={zip.status}
        error={zip.error}
        detail={zip.detail}
      />

      <p className={styles.formNote}>
        Send over Wi-Fi opens your board&rsquo;s Patterns page with this pattern linked — it
        fetches and installs the file itself, and the pattern appears in the list immediately. No
        sign-in, no reflash, no USB. (Needs firmware with loadable-module support — v3.2.0 or
        newer.)
      </p>
      <div className={styles.actionRow}>
        <a
          className={styles.btnAccentLink}
          href={unsendable ? undefined : patternsUrl(zipPath)}
          aria-disabled={unsendable}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            if (!unsendable) captureEvent("community_send_wifi", { pattern_id: patternId });
          }}
        >
          Send over Wi-Fi
        </a>
        <button
          type="button"
          className={styles.btn}
          disabled={zip.busy || cannotBuild}
          onClick={() => void download()}
        >
          {zip.busy ? "Preparing…" : "Download .zip"}
        </button>
      </div>
      <p className={styles.formNote}>
        Board not reachable from this network (e.g. VPN)? Use Download .zip.
      </p>
      <ZipInstallNote kind="pattern" />
    </div>
  );
}

function CodeBuildBody({ patternTitle, code }: { patternTitle: string; code: string }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { deviceHost, changeDeviceHost, patternsUrl } = useDeviceHost();

  const [build, setBuild] = useState<ModuleBuild | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pollRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const poll = useCallback(async (id: string) => {
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/builds/${id}`),
        COMMUNITY_FETCH_INIT,
      );
      if (!response.ok) return;
      const state = (await response.json()) as ModuleBuild;
      setBuild(state);
      if (state.status === "done" || state.status === "error") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        captureEvent("module_build_finished", {
          status: state.status,
          patterns: 1,
          bytes: state.bytes,
        });
      }
    } catch {
      // A dropped poll is not a failed build; the next tick catches up.
    }
  }, []);

  const startBuild = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/builds"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "pfm",
          patterns: [{ label: patternTitle, code }],
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Could not queue the build.");
        return;
      }
      const buildId = payload.id;
      captureEvent("module_build_queued", { patterns: 1 });
      setBuild({
        id: buildId,
        status: "queued",
        queuePosition: null,
        elapsedMs: null,
        bytes: null,
        error: null,
        namespaces: [],
        modulesUrl: null,
      });
      void poll(buildId);
      pollRef.current = window.setInterval(() => void poll(buildId), 1000);
    } catch {
      setError("Network error — is the build server reachable?");
    } finally {
      setBusy(false);
    }
  }, [session, patternTitle, code, poll]);

  // Building one module takes about half a second, so asking the visitor to
  // press a second button after opening the modal would only be a wait with
  // extra steps. Signed-in visitors go straight to the result.
  const kicked = useRef(false);
  useEffect(() => {
    if (session && !kicked.current) {
      kicked.current = true;
      void startBuild();
    }
  }, [session, startBuild]);

  const retry = () => {
    setBuild(null);
    setError(null);
    void startBuild();
  };

  return (
    <>
    {isPending ? (
      <div className={styles.modalBody}>
        <span className={styles.formNote}>Checking session…</span>
      </div>
    ) : !session ? (
      <AuthModal embedded onClose={() => undefined} onAuthed={() => router.refresh()} />
    ) : (
      <div className={styles.modalBody}>
        {error && <div className={styles.formError}>{error}</div>}

        {(busy || (build && build.status !== "done" && build.status !== "error")) && (
          <p className={styles.buildStatusLine}>
            <span className={styles.buildSpinner} aria-hidden="true" />
            {build && build.status === "queued" && build.queuePosition && build.queuePosition > 1
              ? `Waiting — ${build.queuePosition} in the queue…`
              : "Building the module… (usually a second or two)"}
          </p>
        )}

        {build?.status === "error" && (
          <>
            <div className={styles.formError}>The build failed.</div>
            <pre className={styles.buildLog}>{build.error}</pre>
            <div className={styles.actionRow}>
              <button type="button" className={styles.btn} onClick={retry}>
                Try again
              </button>
            </div>
          </>
        )}

        {build?.status === "done" && build.modulesUrl && (
          <>
            <p className={styles.buildStatusLine}>
              ✓ {patternTitle} built · {((build.bytes ?? 0) / 1024).toFixed(0)} KB
            </p>
            <p className={styles.formNote}>
              Send over Wi-Fi opens your device&rsquo;s pattern manager with this module
              linked — it fetches and installs the file itself, and the pattern appears in
              the list immediately. No reflash, no reboot, no USB. (Needs firmware with
              loadable-module support — v3.2.0 or newer.)
            </p>
            <div className={styles.actionRow}>
              <a
                className={styles.btnAccent}
                href={patternsUrl(build.modulesUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Send over Wi-Fi
              </a>
              <a className={styles.btn} href={communityApiUrl(build.modulesUrl)} download>
                Download .zip instead
              </a>
            </div>
            <p className={styles.formNote}>
              Device address:{" "}
              <input
                type="text"
                value={deviceHost}
                onChange={(event) => changeDeviceHost(event.target.value)}
                spellCheck={false}
                style={{
                  font: "inherit",
                  width: "16ch",
                  padding: "1px 6px",
                }}
              />{" "}
              — Android cannot resolve <code>.local</code>; use the IP from the
              device&rsquo;s NETWORK screen (hold K2).
            </p>
          </>
        )}
      </div>
    )}
    </>
  );
}
