"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, buildsConfigured, communityApiUrl } from "@/lib/community/apiBase";
import {
  COLLECTION_EVENT,
  DECK_MAX,
  DECK_PANEL_EVENT,
  deckClear,
  deckItems,
  deckMove,
  deckRemove,
  type CollectedPattern,
} from "@/lib/community/deck";
import { useDeviceHost } from "@/lib/community/deviceHost";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import ShareDeckModal from "./ShareDeckModal";
import styles from "./Community.module.css";

// The deck, in one panel.
//
// A deck is what goes on the board: capped at what one build holds, and
// ORDERED, because the device cycles patterns in sequence — arranging one is
// the same decision as ordering a setlist.
//
// A second list used to live here — Saved, uncapped, everything you might
// want later. The like already was that gesture and kept it per-account
// rather than per-browser, so this panel is one list now.
//
// Building turns the deck into loadable .pfm modules: ~½ s per pattern, one
// zip, installed from the device's own /patterns page with no reflash.

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

export default function DeckPanel() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [deck, setDeck] = useState<CollectedPattern[]>([]);
  const [open, setOpen] = useState(false);
  const [build, setBuild] = useState<ModuleBuildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Sharing gets its own modal, opened with the panel closed — two stacked
  // dialogs would fight over the overlay click.
  const [shareOpen, setShareOpen] = useState(false);
  // Sign-in is asked for at the moment it is needed — building — and never for
  // looking at your own deck, which is local to this browser and none of the
  // server's business until something is built from it.
  const [needsAuth, setNeedsAuth] = useState(false);

  const { deviceHost, changeDeviceHost, patternsUrl } = useDeviceHost();

  useEffect(() => {
    const sync = () => {
      setDeck(deckItems());
    };
    sync();
    window.addEventListener(COLLECTION_EVENT, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(COLLECTION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // The dock along the bottom of the page owns arranging the deck; this panel
  // owns the one thing it cannot do inline — building — so the dock asks for
  // it by name. See DECK_PANEL_EVENT in lib/community/deck.ts.
  useEffect(() => {
    const open = () => {
      setOpen(true);
    };
    window.addEventListener(DECK_PANEL_EVENT, open);
    return () => window.removeEventListener(DECK_PANEL_EVENT, open);
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
    if (deck.length === 0) return;
    if (!session) {
      setNeedsAuth(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/builds"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "pfm",
          // Sent in deck order, which is the order they appear on the device.
          patterns: deck.map((item) => ({ label: item.title, code: item.code })),
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Could not queue the build.");
        return;
      }
      const buildId = payload.id;
      captureEvent("module_build_queued", { patterns: deck.length });
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
    setNote(null);
    setNeedsAuth(false);
    setOpen(false);
  };

  // No builds configured (e.g. the Vercel mirror) → nothing here works.
  if (!buildsConfigured()) return null;

  return (
    <>
      {/* The deck's handle in the header. It stays even at 0/10 because on a
          phone — where the dock is hidden behind the tab bar — this chip is
          the deck's only way in. */}
      <button
        type="button"
        className={styles.deckChip}
        title={`Your deck (${deck.length}/${DECK_MAX})`}
        onClick={() => setOpen(true)}
      >
        ▦ {deck.length}/{DECK_MAX}
      </button>

      {open && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={close}>
          <div
            className={`${styles.modalCard} ${styles.modalCardWide}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <span>Deck</span>
              <button type="button" onClick={close} aria-label="Close">
                ×
              </button>
            </div>

            {needsAuth ? (
              <AuthModal
                embedded
                onClose={() => undefined}
                onAuthed={() => {
                  setNeedsAuth(false);
                  router.refresh();
                }}
              />
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
                        Back to the deck
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
                      linked — it fetches and installs every module itself. Patterns appear in the
                      list immediately: no reflash, no reboot, nothing to unzip. (Needs firmware
                      with loadable-module support.)
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
                      <span className={styles.headerSpacer} />
                      <button type="button" className={styles.btn} onClick={close}>
                        Done
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
                {/* One list now, so the tab strip is a label. Saved lived in
                    the other tab; the like replaced it. */}
                <nav className={styles.deckTabs}>
                  <button type="button" data-active disabled>
                    Deck ({deck.length}/{DECK_MAX})
                  </button>
                </nav>

                {note && <div className={styles.formError}>{note}</div>}

                {deck.length === 0 ? (
                    <p className={styles.formNote}>
                      Your deck is empty. On any pattern that ships a firmware header, use
                      &ldquo;Add to deck&rdquo; — then build them all as loadable modules in one
                      go. The order here is the order they cycle on the device.
                    </p>
                  ) : (
                    <>
                      <ol className={styles.deckList}>
                        {deck.map((item, index) => (
                          <li key={item.patternId} className={styles.deckRow}>
                            <span className={styles.deckIndex}>{index + 1}</span>
                            <Link href={`/community/p/${item.patternId}`} onClick={close}>
                              {item.title}
                            </Link>
                            <span className={styles.headerSpacer} />
                            {/* Buttons rather than drag: this list is at most ten
                                rows and has to work on a phone. */}
                            <button
                              type="button"
                              className={styles.btnSmall}
                              disabled={index === 0}
                              title="Move up"
                              onClick={() => deckMove(item.patternId, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className={styles.btnSmall}
                              disabled={index === deck.length - 1}
                              title="Move down"
                              onClick={() => deckMove(item.patternId, 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className={styles.btnSmall}
                              onClick={() => deckRemove(item.patternId)}
                            >
                              remove
                            </button>
                          </li>
                        ))}
                      </ol>
                      <p className={styles.formNote}>
                        Builds as loadable modules (.pfm): each pattern compiles alone in about
                        half a second, and the result installs over Wi-Fi from the device&rsquo;s
                        pattern manager — no reflash. The classic full-image build stays available
                        on each pattern&rsquo;s page.
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
                            : `Build ${deck.length} module${deck.length === 1 ? "" : "s"}`}
                        </button>
                        <button
                          type="button"
                          className={styles.btn}
                          title="Publish this deck — its patterns and their order — as a page others can open and copy"
                          onClick={() => {
                            setOpen(false);
                            setShareOpen(true);
                          }}
                        >
                          Share deck
                        </button>
                        <span className={styles.headerSpacer} />
                        {/* Two presses: a deck is cheap to rebuild but an
                            arranged one is not, and this sits next to the button
                            people actually mean to press. */}
                        <button
                          type="button"
                          className={styles.btn}
                          title="Remove every pattern from the deck"
                          onClick={() => {
                            if (confirmEmpty) {
                              deckClear();
                              setConfirmEmpty(false);
                            } else {
                              setConfirmEmpty(true);
                              window.setTimeout(() => setConfirmEmpty(false), 4000);
                            }
                          }}
                        >
                          {confirmEmpty ? "Press again to empty" : `Empty deck (${deck.length})`}
                        </button>
                      </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {shareOpen && <ShareDeckModal deck={deck} onClose={() => setShareOpen(false)} />}
    </>
  );
}
