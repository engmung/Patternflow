"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, buildsConfigured, communityApiUrl } from "@/lib/community/apiBase";
import {
  CART_EVENT,
  cartClear,
  cartItems,
  cartRemove,
  type CartItem,
} from "@/lib/community/cart";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// The cart's other half: turn the collected patterns into loadable modules.
//
// One request builds every pattern in the cart as a .pfm (~½ s each, a few KB
// each) and the download is one zip. Installing is drag-and-drop onto the
// device's own /patterns page — no reflash, no reboot, and adding five
// patterns costs five files in one drop, which is the whole point of a cart.

type ModuleBuildState = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  queuePosition: number | null;
  elapsedMs: number | null;
  bytes: number | null;
  error: string | null;
  namespaces: string[];
  modulesUrl: string | null;
};

export default function ModuleCart() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [build, setBuild] = useState<ModuleBuildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same remembered device address the firmware modal uses, so someone who has
  // already told us their board's IP is not asked twice. Lazy init: the value
  // is only ever rendered inside the opened modal, so the server-render default
  // never reaches the DOM and cannot mismatch on hydration.
  const [deviceHost, setDeviceHost] = useState(() => {
    if (typeof window === "undefined") return "patternflow.local";
    try {
      return window.localStorage.getItem("pf-device-host") ?? "patternflow.local";
    } catch {
      return "patternflow.local"; /* private mode */
    }
  });
  const changeDeviceHost = (value: string) => {
    setDeviceHost(value);
    try {
      window.localStorage.setItem("pf-device-host", value);
    } catch {
      /* private mode */
    }
  };

  // The device page fetches this URL itself, so it must be absolute even when
  // the community API is same-origin. Mirrors the firmware modal's wifiSendUrl.
  const wifiInstallUrl = (modulesUrl: string) => {
    if (typeof window === "undefined") return "#";
    const absolute = new URL(communityApiUrl(modulesUrl), window.location.origin).toString();
    return `http://${deviceHost.trim()}/patterns?src=${encodeURIComponent(absolute)}`;
  };

  useEffect(() => {
    const sync = () => setItems(cartItems());
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

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
      const state = (await response.json()) as ModuleBuildState;
      setBuild(state);
      if (state.status === "done" || state.status === "error") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        captureEvent("module_build_finished", {
          status: state.status,
          patterns: state.namespaces.length,
          bytes: state.bytes,
        });
      }
    } catch {
      // A dropped poll is not a failed build; the next tick catches up.
    }
  }, []);

  const startBuild = async () => {
    if (!session || items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/builds"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "pfm",
          patterns: items.map((item) => ({ label: item.title, code: item.code })),
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Could not queue the build.");
        return;
      }
      const buildId = payload.id;
      captureEvent("module_build_queued", { patterns: items.length });
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
  };

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setBuild(null);
    setError(null);
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  // No builds configured (e.g. the Vercel mirror) → no cart at all.
  if (!buildsConfigured()) return null;
  if (items.length === 0 && !open) return null;

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        title="Patterns collected for a module build"
        onClick={() => setOpen(true)}
      >
        ▦ Cart ({items.length})
      </button>

      {open && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={close}>
          <div
            className={`${styles.modalCard} ${styles.modalCardWide}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <span>Module cart</span>
              <button type="button" onClick={close} aria-label="Close">
                ×
              </button>
            </div>

            {!session && items.length > 0 ? (
              <AuthModal embedded onClose={() => undefined} onAuthed={() => router.refresh()} />
            ) : build ? (
              <div className={styles.modalBody}>
                {build.status !== "done" && build.status !== "error" && (
                  <p className={styles.buildStatusLine}>
                    <span className={styles.buildSpinner} aria-hidden="true" />
                    {build.status === "queued"
                      ? build.queuePosition && build.queuePosition > 1
                        ? `Waiting — ${build.queuePosition} in the queue…`
                        : "Waiting for a build slot…"
                      : "Building modules… (usually a second or two)"}
                  </p>
                )}

                {build.status === "error" && (
                  <>
                    <div className={styles.formError}>The build failed.</div>
                    <pre className={styles.buildLog}>{build.error}</pre>
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.btn} onClick={reset}>
                        Back to the cart
                      </button>
                    </div>
                  </>
                )}

                {build.status === "done" && build.modulesUrl && (
                  <>
                    <p className={styles.buildStatusLine}>
                      ✓ {build.namespaces.length} module{build.namespaces.length === 1 ? "" : "s"}{" "}
                      built · {((build.bytes ?? 0) / 1024).toFixed(0)} KB zip
                    </p>
                    <p className={styles.formNote}>
                      Send over Wi-Fi opens the device&rsquo;s pattern manager with this build
                      linked — it fetches and installs every module itself. Patterns appear in
                      the list immediately: no reflash, no reboot, nothing to unzip. (Needs
                      firmware with loadable-module support.)
                    </p>
                    <div className={styles.actionRow}>
                      <a
                        className={styles.btnAccent}
                        href={wifiInstallUrl(build.modulesUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Send over Wi-Fi
                      </a>
                      <a
                        className={styles.btn}
                        href={communityApiUrl(build.modulesUrl)}
                        download
                      >
                        Download .zip instead
                      </a>
                      <span className={styles.headerSpacer} />
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() => {
                          cartClear();
                          close();
                        }}
                      >
                        Done — clear cart
                      </button>
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
                          border: "1px solid var(--pf-rule, #D9D1C0)",
                          background: "transparent",
                          color: "inherit",
                        }}
                      />{" "}
                      (Android can&rsquo;t resolve <code>.local</code> — use the IP from the
                      device&rsquo;s NETWORK screen, hold K2).
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.modalBody}>
                {items.length === 0 ? (
                  <p className={styles.formNote}>
                    The cart is empty. On any pattern that ships a firmware header, use
                    &ldquo;Add to cart&rdquo; to collect it, then build them all as loadable
                    modules in one go.
                  </p>
                ) : (
                  <>
                    <ul className={styles.cartList}>
                      {items.map((item) => (
                        <li key={item.patternId} className={styles.cartRow}>
                          <Link href={`/community/p/${item.patternId}`} onClick={close}>
                            {item.title}
                          </Link>
                          <button
                            type="button"
                            className={styles.btn}
                            onClick={() => cartRemove(item.patternId)}
                          >
                            remove
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className={styles.formNote}>
                      Builds as loadable modules (.pfm): each pattern compiles alone in
                      about half a second, and the result installs over Wi-Fi from the
                      device&rsquo;s pattern manager — no reflash. The classic full-image
                      build stays available on each pattern&rsquo;s page.
                    </p>
                    {error && <div className={styles.formError}>{error}</div>}
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.btnAccent}
                        disabled={busy}
                        onClick={() => void startBuild()}
                      >
                        {busy
                          ? "Queueing…"
                          : `Build ${items.length} module${items.length === 1 ? "" : "s"}`}
                      </button>
                      <span className={styles.headerSpacer} />
                      <button type="button" className={styles.btn} onClick={() => cartClear()}>
                        Clear
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
