"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PatternCard, { PatternCardItem } from "./PatternCard";
import FeedControls from "./FeedControls";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  FEED_SLOT_KEY,
  MAX_FEED_PAGE_SIZE,
  MOBILE_FEED_VIEW,
  SLOT_COMPACT,
  SLOT_DEFAULT,
  SLOT_MAX,
  SLOT_MIN,
  batchRowsForSlot,
  gapForSlot,
} from "@/lib/community/feedView";
import { useIsMobile } from "@/lib/hooks/useMediaQuery";
import styles from "./Community.module.css";

// Infinite scroll, one scrollbar: the page itself. The grid grows downward as
// the sentinel under it comes into view — no pager, no inner scroll region to
// fight the document over the wheel.
//
// Card size is a continuous zoom (Ctrl + scroll, or trackpad pinch),
// Pinterest-style, remembered per browser. Plain scrolling feeds the page;
// Ctrl distinguishes "resize the wall" from "walk along it" — and from the
// knob overlay, whose wheel only acts without Ctrl.
//
// Batches stay small because every card ships its full source. Appends are
// de-duplicated by id: the feed is newest-first, so anything published while
// you scroll shifts the offsets and would otherwise repeat a card.

// ── Coming back ──
// The feed is grown by the client, so a back navigation gets the first batch
// again: the document is suddenly short, whatever scroll position the browser
// remembered is clamped to its new bottom, and you land near the top. So the
// feed remembers how far it had grown and where you were reading, rebuilds
// that much, and puts you back.
//
// The moment it records is opening a pattern — not scrolling. That is what
// makes it a RETURN rather than a visit: tapping "Patterns" in the tab bar
// still gives a feed at the top, because nothing was recorded on the way in.
// (popstate looks like the obvious signal and is not: it fired correctly in
// testing and the restore still never ran, so the flag it set was not the one
// the remounted component read. A click is unambiguous and needs no ordering
// to be true.) The note is consumed on arrival, so it restores exactly once.
const PLACE_KEY_PREFIX = "pf-feed-place";

/** Don't rebuild an unbounded feed to restore a position in it. */
const MAX_RESTORED_ITEMS = 300;

type FeedPlace = { count: number; y: number };

// ── Search ──
// A wall of two hundred patterns, newest first, is a wall whose bottom
// nobody reaches. The box searches titles and handles ("@name" for handles
// only) through the same listFeed as everything else, so it can only narrow
// the public set.
//
// The query lives in the URL (?q=) like sort and the filter, so a search is
// a link and survives opening a pattern and coming back. Typing replaces the
// URL rather than pushing it — one history entry per keystroke would make
// Back walk through "w", "wa", "wav" — and waits for a pause first, because
// every change is a server render of the first batch.
//
// The box sits OUTSIDE the keyed list below it. A new search has to restart
// the list (it is keyed on q, like on sort), but remounting the input with it
// would drop focus mid-word and throw away whatever was typed while the
// server answered.

/** How long typing has to pause before the search runs. */
const SEARCH_DEBOUNCE_MS = 300;

/** Mirrors FEED_QUERY_MAX in queries/patterns.ts — longer is cut there anyway. */
const SEARCH_MAX = 80;

export default function CommunityFeedClient({
  q = "",
  ...wall
}: {
  items: PatternCardItem[];
  sort?: string;
  hardwareOnly?: boolean;
  total?: number;
  /** Whether to offer the "Liked" tab — it lists the viewer's own likes. */
  signedIn?: boolean;
  /** The search the first batch answers (?q=), already trimmed. */
  q?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState(q);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // The URL can move without this box: the Patterns tab in the nav, a
  // "clear" elsewhere. When it does, the box follows. But the answers to its
  // own searches arrive the same way, possibly late and out of order, and
  // adopting one of those would overwrite what was typed after it — so every
  // query this box sent is remembered until the newest one comes back.
  const [asked, setAsked] = useState<string[]>([q]);
  const [seenQ, setSeenQ] = useState(q);
  // Bumped each time the box adopts a search it did not send (below).
  const [adopted, setAdopted] = useState(0);
  if (q !== seenQ) {
    setSeenQ(q);
    if (!asked.includes(q)) {
      setText(q);
      setAsked([q]);
      setAdopted((count) => count + 1);
    } else if (q === asked[asked.length - 1]) {
      setAsked([q]);
    }
  }

  // A keystroke still waiting out its pause was typed into the search the URL
  // just left behind. Firing it now would replace the address the person
  // navigated to — the Patterns tab, say — with the one they walked away from.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, [adopted]);

  const commit = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const next = value.trim();
    // While a search is out, asking for it again is a repeat (a second Enter,
    // the pause running out after one). Once nothing is out, the URL is the
    // only truth: a replace that another navigation discarded left `asked`
    // naming a search that never landed, and comparing against that made
    // Enter do nothing until the text was edited.
    if (next === (pending ? asked[asked.length - 1] ?? q : q)) return;
    const query = new URLSearchParams(params.toString());
    // The same scrub as FeedControls: parameters from the paginated era.
    query.delete("page");
    query.delete("size");
    query.delete("view");
    if (next) query.set("q", next);
    else query.delete("q");
    const qs = query.toString();
    setAsked((current) => [...current, next]);
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const onType = (value: string) => {
    setText(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS);
  };

  const clearSearch = () => {
    setText("");
    commit("");
  };

  return (
    <div className={styles.feedWrapper} id="wall">
      <form
        role="search"
        className={styles.feedSearch}
        onSubmit={(event) => {
          // Enter runs it now instead of after the pause.
          event.preventDefault();
          commit(text);
        }}
      >
        <input
          type="search"
          className={`${styles.textInput} ${styles.feedSearchInput}`}
          placeholder="Search titles or @author"
          aria-label="Search patterns by title, or by author with @name"
          value={text}
          maxLength={SEARCH_MAX}
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => onType(event.target.value)}
        />
        {pending && (
          <span className={styles.feedSearchBusy} aria-live="polite">
            Searching…
          </span>
        )}
      </form>

      <FeedWall
        // Remount on a new search, sort or filter so the accumulated list
        // restarts from the batch the server just rendered for it.
        key={`${wall.sort ?? "new"}-${wall.hardwareOnly ? "hw" : "all"}-${q}`}
        {...wall}
        q={q}
        stale={pending}
        onClearSearch={clearSearch}
      />
    </div>
  );
}

function useResponsiveCardsPerRow(
  containerRef: React.RefObject<HTMLDivElement | null>,
  slot: number,
  gap: number,
) {
  const [cardsPerRow, setCardsPerRow] = useState(6);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // n cards need n*slot + (n-1)*gap, i.e. (width + gap) / (slot + gap).
    const update = () => {
      setCardsPerRow(Math.max(1, Math.floor((el.clientWidth + gap) / (slot + gap))));
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, slot, gap]);

  return cardsPerRow;
}

function FeedWall({
  items: initialItems,
  sort = "new",
  hardwareOnly = false,
  total: initialTotal = 0,
  signedIn = false,
  q,
  stale,
  onClearSearch,
}: {
  items: PatternCardItem[];
  sort?: string;
  hardwareOnly?: boolean;
  total?: number;
  signedIn?: boolean;
  q: string;
  /** A new search is out; these cards are about to be replaced. */
  stale: boolean;
  onClearSearch: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const isMobile = useIsMobile();

  // The zoom. Starts at the default for a hydration-stable first paint, then
  // adopts whatever this browser chose last time — a frame later, so the
  // stored value never fights the server-rendered markup.
  const [slot, setSlot] = useState<number>(SLOT_DEFAULT);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      try {
        const saved = Number(window.localStorage.getItem(FEED_SLOT_KEY));
        if (Number.isFinite(saved) && saved >= SLOT_MIN && saved <= SLOT_MAX) setSlot(saved);
      } catch {
        // Private mode: the default is fine.
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(FEED_SLOT_KEY, String(slot));
    } catch {
      // Private mode: the size lasts for this page, which is still something.
    }
  }, [slot]);

  // Ctrl+wheel (and pinch, which reports as ctrlKey wheel) resizes the wall.
  // A native non-passive listener, because preventDefault here is the whole
  // point — without it the browser zooms the page instead.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || isMobile) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setSlot((prev) =>
        Math.round(
          Math.min(SLOT_MAX, Math.max(SLOT_MIN, prev * Math.exp(-event.deltaY * 0.0015))),
        ),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isMobile]);

  const gap = isMobile ? MOBILE_FEED_VIEW.gap : gapForSlot(slot);
  const effectiveSlot = isMobile ? MOBILE_FEED_VIEW.slot : slot;
  const compact = isMobile || slot <= SLOT_COMPACT;
  const cardsPerRow = useResponsiveCardsPerRow(containerRef, effectiveSlot, gap);

  // A lone "@" is a search being typed, not one the server runs (feedSearch
  // drops it), so the wall must not call the whole feed its matches.
  const searched = q.replace(/^@/, "").trim() ? q : "";

  const [items, setItems] = useState<PatternCardItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [failed, setFailed] = useState(false);
  // Everything the loader itself needs lives in refs: loads are triggered by
  // an IntersectionObserver, and stale closures over state would double-fetch.
  const itemsRef = useRef(initialItems);
  const busyRef = useRef(false);
  const doneRef = useRef(initialItems.length >= initialTotal);
  const [done, setDone] = useState(initialItems.length >= initialTotal);

  const batchRows = isMobile ? MOBILE_FEED_VIEW.batchRows : batchRowsForSlot(slot);

  // `sizeHint` lets a caller ask for a bigger batch than the viewport needs
  // — the restore below rebuilds a known length and wants few, full pages.
  const loadMore = useCallback(async (sizeHint?: number) => {
    if (busyRef.current || doneRef.current) return;
    busyRef.current = true;
    setFailed(false);
    try {
      const have = itemsRef.current.length;
      const wanted = Math.max(sizeHint ?? 0, cardsPerRow * batchRows, cardsPerRow);
      const size = Math.min(MAX_FEED_PAGE_SIZE, wanted);
      const params = new URLSearchParams({ offset: String(have), size: String(size) });
      if (sort !== "new") params.set("sort", sort);
      if (hardwareOnly) params.set("hw", "1");
      if (q) params.set("q", q);
      const response = await fetch(
        communityApiUrl(`/api/community/patterns?${params.toString()}`),
        COMMUNITY_FETCH_INIT,
      );
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as { items: PatternCardItem[]; total: number };

      const seen = new Set(itemsRef.current.map((item) => item.id));
      const fresh = payload.items.filter((item) => !seen.has(item.id));
      const next = [...itemsRef.current, ...fresh];
      itemsRef.current = next;
      setItems(next);
      setTotal(payload.total);
      if (payload.items.length < size || next.length >= payload.total) {
        doneRef.current = true;
        setDone(true);
      }
    } catch {
      // Note it and stand down until the next intersection — a flaky network
      // must not become a fetch loop.
      setFailed(true);
    } finally {
      busyRef.current = false;
    }
  }, [cardsPerRow, batchRows, sort, hardwareOnly, q]);

  // Where you were, per view: sort, filter and search each make a different
  // feed, and a position in one means nothing in another.
  const placeKey = `${PLACE_KEY_PREFIX}:${sort}:${hardwareOnly ? "hw" : "all"}:${q}`;

  // Opening a pattern is the only thing that writes a place. Captured on the
  // way down so it runs before the router leaves, and read off the event
  // rather than bound per card — the grid is rebuilt on every append.
  const rememberPlace = (event: React.MouseEvent) => {
    const link = (event.target as HTMLElement).closest?.("a[href]");
    if (!link?.getAttribute("href")?.startsWith("/community/p/")) return;
    const place: FeedPlace = { count: itemsRef.current.length, y: window.scrollY };
    try {
      if (place.y > 0) sessionStorage.setItem(placeKey, JSON.stringify(place));
      else sessionStorage.removeItem(placeKey);
    } catch {
      // Private mode, quota, whatever — losing your place is not an error
      // worth showing anybody.
    }
  };

  // …and put it back, once.
  //
  // Held in a ref because loadMore's identity changes the moment the grid
  // measures itself (cardsPerRow 6 -> 3 on a phone). Depending on it here
  // re-ran this effect mid-restore, whose cleanup cancelled the rebuild it
  // had just started — the feed stopped a batch or two short and the scroll
  // landed clamped, which looked exactly like "restore doesn't work".
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    let place: FeedPlace | null = null;
    try {
      const raw = sessionStorage.getItem(placeKey);
      // Consumed on arrival: coming back restores, and everything after that
      // — a reload, a later visit — starts at the top like any other feed.
      sessionStorage.removeItem(placeKey);
      place = raw ? (JSON.parse(raw) as FeedPlace) : null;
    } catch {
      place = null;
    }
    if (!place || !(place.y > 0)) return;
    const want = Math.min(place.count, MAX_RESTORED_ITEMS);

    // No cleanup flag, deliberately. React runs an effect, tears it down and
    // runs it again on every mount in development — so a rebuild that aborts
    // in its own cleanup aborts every single time, while the note it had
    // already consumed is gone. That is what "restore does nothing" was. The
    // ref guard is enough: this runs once per mount either way, and the only
    // thing it touches after a real unmount is a scroll position, so it
    // checks the feed is still on screen instead.
    void (async () => {
      // Rebuild to the length the feed had — in full pages, not viewport
      // batches. Every page is a real query on the community server (four
      // correlated counts per row, the whole source of each pattern in the
      // payload), and a rebuild to 300 cards at viewport size was sixteen of
      // them fired back-to-back; at the page cap it is seven. On the Pi that
      // difference is a stutter versus a freeze.
      //
      // The sentinel is loading at the same time, and loadMore refuses to run
      // while a batch is in flight — so a call that returns with nothing added
      // usually means "somebody else is fetching", not "there is no more".
      // Reading that as a dead end stopped the feed a batch or two short and
      // left the scroll clamped. Wait it out; give up only on a real stall.
      const deadline = Date.now() + 6000;
      let stalls = 0;
      while (!doneRef.current && itemsRef.current.length < want) {
        if (Date.now() > deadline) break;
        const before = itemsRef.current.length;
        if (busyRef.current) await new Promise((resolve) => setTimeout(resolve, 60));
        else await loadMoreRef.current(MAX_FEED_PAGE_SIZE);
        if (itemsRef.current.length === before) {
          stalls += 1;
          if (stalls > 40) break;
        } else {
          stalls = 0;
        }
      }
      // Two frames: one for React to commit the appended cards, one for the
      // grid to lay them out. Scrolling before that lands short. And the
      // browser has its own idea about this history entry — it restores a
      // position clamped to the short document it arrived at — so this has to
      // come after that, and then once more in case the last batch was still
      // committing.
      const settle = () => {
        if (wrapperRef.current?.isConnected) window.scrollTo(0, place.y);
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          settle();
          window.setTimeout(settle, 120);
          window.setTimeout(settle, 400);
        });
      });
    })();
  }, [placeKey]);

  // The sentinel drives loading. One subtlety: after an append the sentinel
  // can STILL be inside the viewport (short feed, tall screen), and an
  // observer only fires on crossings — so keep loading while it shows.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let cancelled = false;
    const fillViewport = async () => {
      while (!cancelled && !doneRef.current && !busyRef.current) {
        const rect = sentinel.getBoundingClientRect();
        if (rect.top > window.innerHeight + 600) break;
        await loadMore();
        if (busyRef.current) break;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fillViewport();
      },
      // Start fetching a comfortable distance before the gap becomes visible.
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    void fillViewport();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [loadMore]);

  return (
    <div ref={wrapperRef} onClickCapture={rememberPlace}>
      <FeedControls
        sort={sort}
        hardwareOnly={hardwareOnly}
        total={total}
        signedIn={signedIn}
        q={searched}
      />

      {total === 0 && searched ? (
        <div className={styles.emptyPanel} data-stale={stale || undefined}>
          <span className={styles.emptyKicker}>Patterns · no match</span>
          <span className={styles.emptyTitle}>Nothing matches “{searched}”.</span>
          <span className={styles.emptyBody}>
            Titles and handles are searched as typed. Start with @ to search handles only.
            {hardwareOnly && " Only flashable patterns were searched — drop the filter to search all of them."}
          </span>
          <button type="button" className={styles.feedSearchClear} onClick={onClearSearch}>
            Clear search
          </button>
        </div>
      ) : total === 0 ? (
        <div className={styles.emptyPanel}>
          <span className={styles.emptyKicker}>Patterns · empty</span>
          <span className={styles.emptyTitle}>
            {hardwareOnly ? "Nothing flashable yet." : "Nobody has hung anything here yet."}
          </span>
          <span className={styles.emptyBody}>
            {hardwareOnly
              ? "These are the patterns shipping a verified .h you can flash straight to a board. Drop the filter to see everything."
              : "Open Pattern Lab, make something, publish it here — it takes one button from there."}
          </span>
          <a className={styles.emptyCta} href="/pattern-lab">
            Make &amp; publish — Pattern Lab ↗
          </a>
        </div>
      ) : (
        <div ref={containerRef} className={styles.centeredFeedBody} data-stale={stale || undefined}>
          <div
            className={styles.feedGrid}
            // Compact cards borrow the small view's furniture.
            data-view={compact ? "small" : "large"}
            style={{
              gridTemplateColumns: `repeat(${cardsPerRow}, minmax(0, 1fr))`,
              gap: `${gap}px`,
            }}
          >
            {items.map((item) => (
              // Static thumbnails on mobile: no hover means the live sandbox
              // iframes and knob overlay are pure cost there.
              <PatternCard key={item.id} item={item} interactive={!isMobile} />
            ))}
          </div>

          {/* The loader's target. Kept in the tree even when done, so a feed
              that grows while you read can resume. */}
          <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden="true" />

          {failed && (
            <button type="button" className={styles.btn} onClick={() => void loadMore()}>
              Loading failed — try again
            </button>
          )}

          {/* The wall never pages, so this line is the only place it says how
              far down you are — and, at the bottom, that there is no further. */}
          <p className={styles.feedEndNote}>
            {done
              ? searched
                ? `That is every match — ${total}`
                : `That is all of it — ${total} pattern${total === 1 ? "" : "s"}`
              : `Loading more · ${items.length} of ${total}`}
          </p>
        </div>
      )}
    </div>
  );
}
