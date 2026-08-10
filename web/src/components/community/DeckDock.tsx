"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import {
  COLLECTION_EVENT,
  DECK_DRAG_TYPE,
  DECK_MAX,
  collectPattern,
  deckClear,
  deckItems,
  deckRemove,
  deckReorder,
  openDeckPanel,
  savedItems,
  type CollectedPattern,
  type DeckDragPayload,
} from "@/lib/community/deck";
import { COMMUNITY_FETCH_INIT, buildsConfigured, communityApiUrl } from "@/lib/community/apiBase";
import { useDeviceHost } from "@/lib/community/deviceHost";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import PatternCanvas from "./PatternCanvas";
import ShareDeckModal from "./ShareDeckModal";
import styles from "./Community.module.css";

// The deck, pinned to the bottom of the window across the community.
//
// A deck is assembled WHILE browsing — that is the whole reason the wall has a
// "+" on every card — so the thing being assembled stays visible, and
// everything you do to it happens HERE. Dragging a slot reorders it; dragging
// it onto the × at the end of the row throws it out; "Send to my board" starts
// the build and reports it in place.
//
// It used to hand off to a dialog for the last of those, which meant pressing
// a button to be shown the same ten thumbnails again and a second button to
// actually build. The dialog is now only what the bar genuinely has no room
// for: the saved list, and a failed build's log.
//
// The slots draw their patterns. That took a stored field rather than a
// request: the deck keeps each pattern's firmware header (what gets built) and
// its JavaScript alongside it (what it looks like), copied in by whichever card
// the "+" was pressed on — see `js` in deck.ts. A slot collected before that
// existed has no copy and falls back to its number.

/**
 * Surfaces with no patterns on them.
 *
 * The dock exists because a deck is assembled WHILE browsing patterns — so
 * where there are none there is nothing to assemble, and a bar pinned across
 * the bottom of the window is just furniture. On the map it is worse than
 * furniture: it sits exactly where the drawer's "say where you are with it"
 * composer is.
 *
 * A denylist rather than an allowlist on purpose: a new page that shows
 * patterns should get the dock without anyone remembering to add it here, and
 * a new page that does not is the rarer case.
 */
const NO_PATTERNS_HERE = [
  "/community/workshop",
  // The thread redirect — same destination, so the same answer.
  "/community/t/",
  "/community/notifications",
  // Moderation surfaces. The marquee picker does show patterns, but they are
  // candidates for the front page rather than things to collect.
  "/community/reports",
  "/community/featured",
  "/community/territories",
  // The atlas maps techniques, not collectable patterns.
  "/community/atlas",
];

function dockBelongs(pathname: string): boolean {
  return !NO_PATTERNS_HERE.some((prefix) => pathname.startsWith(prefix));
}

/** The shortest the row is ever drawn. An empty deck needs a few places to
 *  read as something you fill; past that the single "+" says it on its own. */
const MIN_PLACES = 3;

/**
 * What a build is told to expect, and when to stop believing it.
 *
 * A module build is about two seconds in practice — each pattern compiles
 * alone and there is no firmware image to link. Ten is the number people are
 * given: it covers a cold compiler and a Pi that is also serving the site,
 * without promising something the machine cannot keep.
 *
 * Fifteen is where waiting stops being waiting. The build may well still be
 * running on the server — this is the browser giving up on hearing back, not
 * a cancellation — so the message says that rather than claiming it failed.
 */
const BUILD_EXPECTED_S = 10;
const BUILD_TIMEOUT_MS = 15_000;

/** A drag in progress: which slot is moving, how far the pointer has taken it,
 *  and how wide one step is (measured, so it cannot drift from the CSS). */
type Drag = { index: number; startX: number; dx: number; step: number; overTrash: boolean };

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

export default function DeckDock() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { patternsUrl } = useDeviceHost();

  const [deck, setDeck] = useState<CollectedPattern[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  const [drag, setDrag] = useState<Drag | null>(null);
  const slotsRef = useRef<HTMLDivElement | null>(null);
  const trashRef = useRef<HTMLButtonElement | null>(null);
  // The drag also lives in a ref, because committing it is a side effect and a
  // side effect must not sit inside a setState updater — React re-invokes
  // those in development and the move would be applied twice. The ref is also
  // what makes a second pointerup (or a pointercancel chasing it) a no-op.
  const dragRef = useRef<Drag | null>(null);
  // True for the single frame in which a finished drag is written back.
  const [settling, setSettling] = useState(false);
  const settleRef = useRef<number | null>(null);

  // A card from the wall being held over the bar.
  const [dropping, setDropping] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);

  const [build, setBuild] = useState<ModuleBuildState | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const pollRef = useRef<number | null>(null);
  // Whole seconds since the build was queued, and the instant it was. Shown
  // while waiting, and read by the rule that stops waiting.
  const [waited, setWaited] = useState(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    const sync = () => {
      setDeck(deckItems());
      setSavedCount(savedItems().length);
    };
    sync();
    window.addEventListener(COLLECTION_EVENT, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(COLLECTION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(
    () => () => {
      if (settleRef.current) cancelAnimationFrame(settleRef.current);
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  // ── Dragging ───────────────────────────────────────────────────────────────

  // Where the dragged slot would land: how many whole steps the pointer has
  // travelled, clamped to the filled part of the row.
  const landing = drag
    ? Math.max(0, Math.min(deck.length - 1, drag.index + Math.round(drag.dx / drag.step)))
    : -1;

  const endDrag = useCallback(() => {
    const current = dragRef.current;
    dragRef.current = null;
    if (!current) {
      setDrag(null);
      return;
    }

    // Landing is the one frame that must not animate.
    //
    // Two things happen at once when the drag ends: the slot moves in the DOM
    // (an instant layout change) and its translate goes back to zero. The
    // layout has already absorbed the distance, so easing the transform back
    // means the slot jumps a further step and crawls home — a flick to the
    // left. Transitions come off for the commit and back on a frame later, so
    // the next drag still eases.
    setSettling(true);
    if (current.overTrash) {
      const doomed = deckItems()[current.index];
      if (doomed) deckRemove(doomed.patternId);
    } else {
      const to = Math.max(
        0,
        Math.min(deck.length - 1, current.index + Math.round(current.dx / current.step)),
      );
      if (to !== current.index) deckReorder(current.index, to);
    }
    setDrag(null);

    if (settleRef.current) cancelAnimationFrame(settleRef.current);
    settleRef.current = requestAnimationFrame(() => {
      settleRef.current = requestAnimationFrame(() => setSettling(false));
    });
  }, [deck.length]);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const bin = trashRef.current?.getBoundingClientRect();
      const overTrash = bin
        ? event.clientX >= bin.left &&
          event.clientX <= bin.right &&
          event.clientY >= bin.top &&
          event.clientY <= bin.bottom
        : false;
      const next = { ...current, dx: event.clientX - current.startX, overTrash };
      dragRef.current = next;
      setDrag(next);
    };
    // Listened for on the window, not the slot: a fast drag outruns a 34px
    // target and the row would drop it mid-gesture.
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [drag, endDrag]);

  const startDrag = (index: number) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const row = slotsRef.current;
    if (!row) return;
    // Without this the browser starts its own drag on the <img> inside the
    // slot (and selects the order number on the way past). Native drag-and-drop
    // takes the pointer with it, so every pointermove after the first is lost
    // and the slot just sits there. Synthetic PointerEvents never trigger it,
    // which is exactly why testing this with dispatchEvent looked fine.
    event.preventDefault();
    // One step is the distance between two slots' left edges — measured off
    // the live layout so slot width and gap can change in CSS alone.
    const boxes = [...row.children].map((child) => child.getBoundingClientRect());
    const step = boxes.length > 1 ? boxes[1].left - boxes[0].left : (boxes[0]?.width ?? 34);
    const started = { index, startX: event.clientX, dx: 0, step, overTrash: false };
    dragRef.current = started;
    setDrag(started);
  };

  /** Slots between the grabbed one and where it is headed step aside. Nothing
   *  steps aside while the grabbed one is over the bin — it is not landing. */
  const shiftFor = (index: number): string => {
    if (!drag) return "";
    if (index === drag.index) return `translateX(${drag.dx}px)`;
    if (drag.overTrash) return "";
    if (drag.index < landing && index > drag.index && index <= landing) {
      return `translateX(${-drag.step}px)`;
    }
    if (drag.index > landing && index < drag.index && index >= landing) {
      return `translateX(${drag.step}px)`;
    }
    return "";
  };

  // ── Dropping a card in ─────────────────────────────────────────────────────
  // The "+" on a card is the aimed version of this; dragging is the one you
  // reach for when you already know where it is going. Same act, same code
  // path (collectPattern), same failure messages.

  /** During dragover the DATA is unreadable — only the type list is. That is
   *  what makes a custom MIME type worth having: it answers "is this one of
   *  ours?" without needing to look inside. */
  const carriesPattern = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(DECK_DRAG_TYPE);

  const onDragOver = (event: React.DragEvent) => {
    if (!carriesPattern(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dropping) setDropping(true);
  };

  const onDrop = async (event: React.DragEvent) => {
    if (!carriesPattern(event)) return;
    event.preventDefault();
    setDropping(false);
    let payload: DeckDragPayload;
    try {
      payload = JSON.parse(event.dataTransfer.getData(DECK_DRAG_TYPE)) as DeckDragPayload;
    } catch {
      return;
    }
    const added = await collectPattern(payload, async (patternId) => {
      const response = await fetch(
        communityApiUrl(`/api/community/patterns/${patternId}/header`),
        COMMUNITY_FETCH_INIT,
      );
      return (await response.json()) as { codeCpp?: string; error?: string };
    });
    if (!added.ok) {
      setDropNote(added.reason ?? "Deck is full.");
      window.setTimeout(() => setDropNote(null), 2500);
    }
  };

  // ── Building ───────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(
          communityApiUrl(`/api/community/builds/${id}`),
          COMMUNITY_FETCH_INIT,
        );
        if (!response.ok) return;
        const state = (await response.json()) as ModuleBuildState;
        setBuild(state);
        if (state.status === "done" || state.status === "error") {
          stopPolling();
          captureEvent("module_build_finished", {
            status: state.status,
            patterns: state.namespaces.length,
            bytes: state.bytes,
          });
        }
      } catch {
        // A dropped poll is not a failed build; the next tick catches up.
      }
    },
    [stopPolling],
  );

  /**
   * Straight from the press. No dialog in between: the deck is already on
   * screen and the button already says what it does, so the only thing a
   * confirmation step would add is a second press.
   */
  const startBuild = async () => {
    const items = deckItems();
    if (items.length === 0) return;
    if (!session) {
      setNeedsAuth(true);
      return;
    }
    setBuildError(null);
    setBuild({
      id: "",
      status: "queued",
      queuePosition: null,
      elapsedMs: null,
      bytes: null,
      error: null,
      namespaces: [],
      modulesUrl: null,
    });
    try {
      const response = await fetch(communityApiUrl("/api/community/builds"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "pfm",
          // Sent in deck order, which is the order they appear on the device.
          patterns: items.map((item) => ({ label: item.title, code: item.code })),
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setBuild(null);
        setBuildError(payload.error ?? "Could not queue the build.");
        return;
      }
      captureEvent("module_build_queued", { patterns: items.length });
      const buildId = payload.id;
      startedAtRef.current = Date.now();
      setWaited(0);
      void poll(buildId);
      // One timer for both jobs: ask how it is going, and keep the clock the
      // giving-up rule reads. Ticking here rather than in `poll` means a
      // request that hangs cannot also stall the timeout that exists to
      // catch it.
      pollRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setWaited(Math.floor(elapsed / 1000));
        if (elapsed > BUILD_TIMEOUT_MS) {
          stopPolling();
          setBuild(null);
          setBuildError(
            `The build server has not answered in ${Math.round(BUILD_TIMEOUT_MS / 1000)} seconds. ` +
              "This usually takes about two. The build may still be running — give it a moment " +
              "and try again, and if it keeps happening the build worker is probably down.",
          );
          captureEvent("module_build_finished", { status: "timeout", patterns: items.length });
          return;
        }
        void poll(buildId);
      }, 1000);
    } catch {
      setBuild(null);
      setBuildError("Network error — is the build server reachable?");
    }
  };

  const clearBuild = () => {
    stopPolling();
    setBuild(null);
    setBuildError(null);
    setLogOpen(false);
  };

  // Nowhere to send anything (e.g. the Vercel mirror, which has no build
  // server) — the whole dock would be furniture with no verb.
  if (!buildsConfigured()) return null;
  if (!dockBelongs(pathname)) return null;

  // The row is the deck plus ONE empty place — the "+" you would fill next —
  // and never shorter than three, so an empty deck still reads as somewhere
  // things go. Laying out all ten said "you are missing eight things", and a
  // permanent tail of three said it more quietly; one is enough of an
  // invitation once there is anything to invite onto the end of.
  const shown = Math.min(DECK_MAX, Math.max(MIN_PLACES, deck.length + 1));
  const slots = Array.from({ length: shown }, (_, index) => deck[index] ?? null);
  const running = build !== null && build.status !== "done" && build.status !== "error";
  const done = build?.status === "done" && build.modulesUrl;
  const failed = build?.status === "error" || buildError !== null;

  return (
    <>
      {/* The dock overlaps the page, so the page has to end above it. The
          spacer lives here rather than in the layout so the two cannot
          disagree about whether there is a dock to clear. */}
      <div className={styles.dockSpacer} aria-hidden="true" />

      {/* A failed build's log is the one thing this bar has no room for, so it
          opens directly above it rather than in a window somewhere else. */}
      {failed && logOpen && (
        <div className={styles.dockLog}>
          <pre>{build?.error ?? buildError}</pre>
        </div>
      )}

      <div
        className={styles.deckDock}
        data-dragging={drag !== null}
        data-settling={settling}
        data-dropping={dropping}
        onDragOver={onDragOver}
        // Fires on the way into a child too, so it only counts when the
        // pointer has actually left the bar.
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropping(false);
          }
        }}
        onDrop={(event) => void onDrop(event)}
      >
        <span className={styles.deckDockLabel}>
          Your deck
          <b>
            {deck.length} / {DECK_MAX}
          </b>
        </span>

        {/* A list switcher, not an action — so it sits with the label rather
            than among the buttons at the other end. */}
        {savedCount > 0 && !running && (
          <button
            type="button"
            className={styles.deckDockLink}
            onClick={() => openDeckPanel("saved")}
          >
            Saved {savedCount}
          </button>
        )}

        <div className={styles.deckDockSlots} ref={slotsRef}>
          {slots.map((item, index) =>
            item ? (
              <span
                key={item.patternId}
                className={styles.deckDockSlot}
                data-drag={drag?.index === index}
                data-doomed={drag?.index === index && drag.overTrash}
                style={{ transform: shiftFor(index) }}
                title={`${index + 1}. ${item.title} — drag to reorder, or onto the ✕ to remove`}
                onPointerDown={startDrag(index)}
              >
                {item.js ? (
                  <PatternCanvas
                    code={item.js}
                    title={item.title}
                    className={styles.canvasFill}
                  />
                ) : (
                  <span className={styles.deckDockSlotIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                <span className={styles.deckDockOrder}>{index + 1}</span>
              </span>
            ) : index === deck.length ? (
              // The next place is the invitation; the two behind it are just
              // the shape of the thing continuing.
              <span key={`next-${index}`} className={styles.deckDockNext} aria-hidden="true">
                +
              </span>
            ) : (
              <span key={`empty-${index}`} className={styles.deckDockEmpty} aria-hidden="true" />
            ),
          )}
        </div>

        {/* The bin, at the end of the row it empties. A target rather than a
            button on every slot: ten hover-only ✕s over ten patterns was ten
            chances to delete the wrong one, and this is the same gesture that
            already reorders them.

            One slot wide at rest, so it does not shout. While something is in
            the air it covers this whole area — its own box plus the hint
            beside it, which has nothing to say mid-drag — because aiming a
            dragged thumbnail at a 34px square is fiddly. It grows over exactly
            that, and no further: the buttons past it stay where they are.

            It also takes clicks, and then it means the whole deck. One bin
            for "throw this out" and "throw it all out" is the same idea at two
            scales; a separate "Empty" button at the far end was that idea
            written twice, a screen apart. Twice, because there is no undo. */}
        <span className={styles.deckDockBinArea}>
          <button
            type="button"
            ref={trashRef}
            className={styles.deckDockTrash}
            data-armed={drag?.overTrash === true}
            data-confirm={confirmEmpty}
            disabled={deck.length === 0}
            aria-label={
              confirmEmpty ? "Press again to empty the deck" : "Empty the deck, or drag a pattern here to remove it"
            }
            title={
              confirmEmpty
                ? "Press again to empty the deck"
                : "Drag a pattern here to remove it — or click to empty the deck"
            }
            onClick={() => {
              if (deck.length === 0) return;
              if (confirmEmpty) {
                deckClear();
                setConfirmEmpty(false);
              } else {
                setConfirmEmpty(true);
                window.setTimeout(() => setConfirmEmpty(false), 4000);
              }
            }}
          >
            ✕
          </button>

          <span className={styles.deckDockCount} data-warn={confirmEmpty}>
            {dropNote
              ? dropNote
              : confirmEmpty
                ? `press ✕ again to empty all ${deck.length}`
                : dropping
                  ? "drop it here to add it"
                  : deck.length === 0
                    ? "drag a pattern down here, or press its +"
                    : "drag to rearrange · ✕ removes"}
          </span>
        </span>

        <span className={styles.deckDockSpacer} />

        {/* Idle → the verb. Building → what it is doing. Done → what to do
            with the result. All in the same corner of the bar. */}
        {done ? (
          <>
            <span className={styles.buildDoneNote}>
              ✓ {build.namespaces.length} module{build.namespaces.length === 1 ? "" : "s"} ·{" "}
              {((build.bytes ?? 0) / 1024).toFixed(0)} KB
            </span>
            <a className={styles.deckDockLink} href={communityApiUrl(build.modulesUrl!)} download>
              ↓ .zip
            </a>
            <a
              className={styles.deckDockSend}
              href={patternsUrl(build.modulesUrl!)}
              target="_blank"
              rel="noreferrer"
            >
              Send over Wi-Fi
            </a>
            <button
              type="button"
              className={styles.deckDockLink}
              aria-label="Dismiss the finished build"
              onClick={clearBuild}
            >
              ✕
            </button>
          </>
        ) : failed ? (
          <>
            {/* A build the server rejected and a build we stopped waiting for
                are different things, and only one of them is the build's
                fault. */}
            <span className={styles.buildFailNote}>
              {build?.status === "error" ? "Build failed" : "No answer"}
            </span>
            <button
              type="button"
              className={styles.deckDockLink}
              onClick={() => setLogOpen((open) => !open)}
            >
              {logOpen ? "Hide log" : "See why"}
            </button>
            <button type="button" className={styles.deckDockSend} onClick={clearBuild}>
              Back to the deck
            </button>
          </>
        ) : (
          <>
            {/* Two verbs at this end, and only two: publish the arrangement,
                or put it on a board. Everything else about the deck is done
                by touching the deck itself. */}
            {deck.length > 0 && !running && (
              <button
                type="button"
                className={styles.deckDockLink}
                onClick={() => setShareOpen(true)}
              >
                Share deck
              </button>
            )}
            {running && (
              <span
                className={styles.buildRunningNote}
                data-slow={waited >= BUILD_EXPECTED_S}
                // The clock is the honest part; the promise is the reassuring
                // one. Both, so a build that is taking its time does not look
                // like a build that has died.
                title={`Usually about two seconds, and under ${BUILD_EXPECTED_S} on a busy server.`}
              >
                <span className={styles.buildSpinner} aria-hidden="true" />
                {build?.status === "queued" && build.queuePosition && build.queuePosition > 1
                  ? `${build.queuePosition} in the queue`
                  : build?.status === "queued"
                    ? "Waiting for a build slot"
                    : `Building ${deck.length} module${deck.length === 1 ? "" : "s"}`}
                {waited > 0 && ` · ${waited} s`}
                <em>
                  {waited >= BUILD_EXPECTED_S
                    ? "longer than usual"
                    : `usually under ${BUILD_EXPECTED_S} s`}
                </em>
              </span>
            )}
            <button
              type="button"
              className={styles.deckDockSend}
              disabled={deck.length === 0 || running}
              title={
                deck.length === 0
                  ? "Add patterns to the deck first"
                  : "Build the deck as loadable modules and install it over Wi-Fi"
              }
              onClick={() => void startBuild()}
            >
              {running ? "Building…" : "Send to my board"}
            </button>
          </>
        )}
      </div>

      {shareOpen && <ShareDeckModal deck={deck} onClose={() => setShareOpen(false)} />}
      {needsAuth && (
        <AuthModal
          onClose={() => setNeedsAuth(false)}
          onAuthed={() => {
            setNeedsAuth(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
