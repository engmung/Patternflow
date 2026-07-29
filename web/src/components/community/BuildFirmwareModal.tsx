"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { useDeviceHost } from "@/lib/community/deviceHost";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Build a firmware image containing a pattern, then flash it — the step that
// otherwise means installing the Arduino IDE.
//
// The server compiles (~15 s) and the browser flashes over USB, so nothing here
// needs a toolchain. The image is fetched by esp-web-tools directly from its
// URL, which is why the build id doubles as the capability to read it.

const EspWebInstallButton = "esp-web-install-button" as unknown as React.ElementType<{
  manifest: string;
  children: React.ReactNode;
}>;

type BuildState = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  queuePosition: number | null;
  elapsedMs: number | null;
  bytes: number | null;
  error: string | null;
  namespaces: string[];
  manifestUrl: string | null;
};

export default function BuildFirmwareModal({
  initialHeader,
  patternLabel,
  cppPrompt,
  onClose,
}: {
  /** Pre-filled header, when the caller already has one (a hardware-ready pattern). */
  initialHeader?: string | null;
  patternLabel: string;
  /** JS→C++ prompt to offer when there is no header yet. */
  cppPrompt?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [header, setHeader] = useState(initialHeader ?? "");
  const [build, setBuild] = useState<BuildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const { deviceHost, changeDeviceHost, updateUrl } = useDeviceHost();

  // Polling is stopped from inside its own callback, so it needs a handle that
  // survives re-renders.
  const pollRef = useRef<number | null>(null);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const poll = useCallback(async (id: string) => {
    try {
      const response = await fetch(communityApiUrl(`/api/community/builds/${id}`), COMMUNITY_FETCH_INIT);
      if (!response.ok) return;
      const state = (await response.json()) as BuildState;
      setBuild(state);
      if (state.status === "done" || state.status === "error") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        captureEvent("firmware_build_finished", {
          status: state.status,
          ms: state.elapsedMs,
          bytes: state.bytes,
        });
      }
    } catch {
      // A dropped poll is not a failed build; the next tick will catch up.
    }
  }, []);

  const startBuild = async () => {
    if (!session) return;
    const code = header.trim();
    if (code.length === 0) {
      setError("Paste the pattern's C++ header first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/builds"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patterns: [{ label: patternLabel, code }] }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Could not queue the build.");
        return;
      }

      // Bind the id locally: narrowing on payload.id does not survive into the
      // interval callback, since TypeScript cannot prove the property is stable.
      const buildId = payload.id;

      captureEvent("firmware_build_queued", { pattern: patternLabel });
      setBuild({
        id: buildId,
        status: "queued",
        queuePosition: null,
        elapsedMs: null,
        bytes: null,
        error: null,
        namespaces: [],
        manifestUrl: null,
      });
      void poll(buildId);
      pollRef.current = window.setInterval(() => void poll(buildId), 1500);
    } catch {
      setError("Network error — is the build server reachable?");
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!cppPrompt) return;
    try {
      await navigator.clipboard.writeText(cppPrompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1500);
    } catch {
      // clipboard may be blocked
    }
  };

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setBuild(null);
    setError(null);
  };

  const seconds = build?.elapsedMs != null ? (build.elapsedMs / 1000).toFixed(0) : null;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <Script
        type="module"
        src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"
        strategy="lazyOnload"
      />
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span>Build firmware</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {isPending ? (
          <div className={styles.modalBody}>
            <span className={styles.formNote}>Checking session…</span>
          </div>
        ) : !session ? (
          // Building costs a machine ~15 seconds of CPU, so it asks who you are
          // at the moment you ask for one — the same rule as publishing.
          <AuthModal embedded onClose={() => undefined} onAuthed={() => router.refresh()} />
        ) : build ? (
          <div className={styles.modalBody}>
            {build.status !== "done" && build.status !== "error" && (
              <>
                <p className={styles.buildStatusLine}>
                  <span className={styles.buildSpinner} aria-hidden="true" />
                  {build.status === "queued"
                    ? build.queuePosition && build.queuePosition > 1
                      ? `Waiting — ${build.queuePosition} in the queue…`
                      : "Waiting for a build slot…"
                    : `Compiling${seconds ? ` — ${seconds}s` : "…"}`}
                </p>
                <p className={styles.formNote}>
                  A build takes 30 seconds to a minute. The whole preset library is
                  compiled alongside your pattern, so this produces a complete firmware
                  image.
                </p>
              </>
            )}

            {build.status === "error" && (
              <>
                <div className={styles.formError}>The build failed.</div>
                <pre className={styles.buildLog}>{build.error}</pre>
                <p className={styles.formNote}>
                  This is the compiler&apos;s own output. Common causes: a helper that the
                  firmware already provides being redefined, or a type that differs from the
                  JavaScript original.
                </p>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.btn} onClick={reset}>
                    Edit the header and retry
                  </button>
                </div>
              </>
            )}

            {build.status === "done" && build.manifestUrl && (
              <>
                <p className={styles.buildStatusLine}>
                  ✓ Built in {seconds}s · {((build.bytes ?? 0) / 1024).toFixed(0)} KB
                  {build.namespaces.length > 0 && ` · ${build.namespaces.join(", ")}`}
                </p>
                <p className={styles.formNote}>
                  Connect the board over USB and flash it. Desktop Chrome or Edge only —
                  browser flashing needs Web Serial.
                </p>
                <div className={styles.actionRow}>
                  <EspWebInstallButton manifest={communityApiUrl(build.manifestUrl)}>
                    <button slot="activate" type="button" className={styles.btnAccent}>
                      Flash to my Patternflow
                    </button>
                    <span slot="unsupported" className={styles.formNote}>
                      This browser cannot flash — use desktop Chrome or Edge, or download below.
                    </span>
                    <span slot="not-allowed" className={styles.formNote}>
                      Flashing needs a secure (https) page.
                    </span>
                  </EspWebInstallButton>
                  <a
                    className={styles.btn}
                    href={communityApiUrl(`/api/community/builds/${build.id}/firmware`)}
                    download
                  >
                    Download .bin
                  </a>
                  <a
                    className={styles.btn}
                    href={updateUrl(build.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Send over Wi-Fi
                  </a>
                  <span className={styles.headerSpacer} />
                  <button type="button" className={styles.btn} onClick={reset}>
                    Build another
                  </button>
                </div>
                <p className={styles.formNote}>
                  Send over Wi-Fi opens the device&rsquo;s own update page with this build
                  linked — no USB, works from a phone on the same network. Device address:{" "}
                  <input
                    type="text"
                    value={deviceHost}
                    onChange={(event) => changeDeviceHost(event.target.value)}
                    spellCheck={false}
                    style={{
                      font: "inherit",
                      width: "16ch",
                      padding: "1px 6px",
                      border: "1px solid var(--pf-rule, #D9D1C0)",
                      background: "transparent",
                      color: "inherit",
                    }}
                  />{" "}
                  (Android can&rsquo;t resolve <code>.local</code> — use the IP shown on the
                  device&rsquo;s NETWORK screen, hold K2).
                </p>
              </>
            )}
          </div>
        ) : (
          <div className={styles.modalBody}>
            <p className={styles.formNote}>
              The board runs C++, so a pattern needs a <code>.h</code> port before it can be
              flashed. Paste one below and the server compiles a complete firmware image —
              no Arduino IDE, no toolchain.
            </p>

            {cppPrompt && (
              <div className={styles.actionRow}>
                <button type="button" className={styles.btn} onClick={() => void copyPrompt()}>
                  {promptCopied ? "Copied ✓" : "Copy C++ conversion prompt"}
                </button>
                <span className={styles.fieldHint}>
                  Paste it into any AI assistant, then bring the header back here.
                </span>
              </div>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Header source</span>
              <textarea
                className={`${styles.textInput} ${styles.cppInput}`}
                placeholder="#pragma once&#10;…"
                spellCheck={false}
                value={header}
                onChange={(event) => setHeader(event.target.value)}
              />
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy || header.trim().length === 0}
              onClick={() => void startBuild()}
            >
              {busy ? "Queueing…" : "Build firmware"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
