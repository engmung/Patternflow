"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import PatternCanvas from "./PatternCanvas";
import type { PatternCardItem } from "./PatternCard";
import styles from "./Community.module.css";
import local from "./FeaturedEditor.module.css";

// The marquee picker.
//
// Deliberately not a drag surface. The dock is dragged because it is on every
// page and you are arranging it while doing something else; this is a page you
// open on purpose, five items long, edited once a week — buttons say what they
// do and work on a phone, which a drag target here would not.
//
// Nothing saves until Save is pressed, because the marquee is the front page
// and a half-finished arrangement should not be live while somebody thinks.
//
// The candidate list used to be the 60 newest patterns and nothing else, so
// anything older could not be put up at all. It now searches and pages through
// the whole public set (GET /api/community/patterns with q and sort), and the
// arrangement above it is independent of whatever the list is showing: search,
// re-sort and page as much as you like, the unsaved order stays put.

/** Panels across the top of /community. Mirrors MARQUEE_MAX on the route. */
const MARQUEE_MAX = 5;

/** One page of candidates — the first paint and every "Load more". */
const PAGE = 24;

/** How long typing has to pause before the search runs. */
const SEARCH_DEBOUNCE_MS = 250;

// "Liked" is deliberately absent: it lists the moderator's own likes, which is
// not a question this page asks.
const SORTS = [
  { id: "new", label: "Newest" },
  { id: "old", label: "Oldest" },
  { id: "top", label: "Most liked" },
  { id: "decks", label: "In decks" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

/** What the list below is currently showing — its items belong to this. */
type View = { q: string; sort: SortId };

function feedQuery(view: View, offset: number): string {
  const params = new URLSearchParams({ offset: String(offset), size: String(PAGE) });
  // The same sort values as the wall's tabs, "old" included (FEED_SORTS).
  if (view.sort !== "new") params.set("sort", view.sort);
  if (view.q) params.set("q", view.q);
  return `/api/community/patterns?${params.toString()}`;
}

function remember(known: Map<string, PatternCardItem>, items: PatternCardItem[]) {
  const next = new Map(known);
  for (const item of items) next.set(item.id, item);
  return next;
}

export default function FeaturedEditor({
  initial,
  initialIds,
  candidates,
  candidatesTotal,
}: {
  initial: PatternCardItem[];
  initialIds: string[];
  /** The newest public patterns, first page. */
  candidates: PatternCardItem[];
  /** How many public patterns there are in all. */
  candidatesTotal: number;
}) {
  const router = useRouter();

  // Every pattern this page has ever shown, by id. The chosen row is drawn
  // from here rather than from the current list, so a slot keeps its canvas
  // and title after a search has moved its pattern off the list below.
  const [known, setKnown] = useState(
    () => new Map([...initial, ...candidates].map((item) => [item.id, item])),
  );

  const [chosen, setChosen] = useState<string[]>(initial.map((item) => item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The list. `query` and `sort` are what the controls say — they answer a
  // click at once; `view` is what the items currently on screen are for.
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("new");
  const [view, setView] = useState<View>({ q: "", sort: "new" });
  const [items, setItems] = useState(candidates);
  const [total, setTotal] = useState(candidatesTotal);
  // Where the next page starts on the SERVER, which is not items.length: a
  // repeat dropped from a page still used up an offset. Paging by the
  // de-duplicated length asked for the same tail again and again once a
  // publish (or a like, under Most liked) shifted the list between pages, and
  // "Load more (1 left)" then fetched nothing forever.
  const [nextOffset, setNextOffset] = useState(candidates.length);
  // A short page means the server has nothing past it, whatever `total` says.
  const [exhausted, setExhausted] = useState(candidates.length >= candidatesTotal);
  // "list" while a new search or sort is out, "more" while a page appends.
  const [loading, setLoading] = useState<"list" | "more" | null>(null);
  const [listError, setListError] = useState(false);

  // Only the newest request may write the list. Each new search bumps the
  // counter and aborts whatever was in flight, so a slow answer to "ab" can
  // never land on top of the answer to "abc".
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const dirty =
    chosen.length !== initialIds.length || chosen.some((id, index) => id !== initialIds[index]);

  /** Fetch one page for `next`: offset 0 replaces the list, anything else appends. */
  const load = async (next: View, offset: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (offset === 0) requestRef.current += 1;
    const request = requestRef.current;

    setLoading(offset === 0 ? "list" : "more");
    setListError(false);
    try {
      const response = await fetch(communityApiUrl(feedQuery(next, offset)), {
        ...COMMUNITY_FETCH_INIT,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as { items: PatternCardItem[]; total: number };
      if (request !== requestRef.current) return;

      setKnown((current) => remember(current, payload.items));
      setView(next);
      setTotal(payload.total);
      setNextOffset(offset + payload.items.length);
      setExhausted(payload.items.length < PAGE || offset + payload.items.length >= payload.total);
      setItems((current) => {
        if (offset === 0) return payload.items;
        // A pattern published between two pages shifts every offset by one;
        // drop the repeat rather than show a card twice.
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...payload.items.filter((item) => !seen.has(item.id))];
      });
    } catch {
      // Superseded requests are aborted on purpose — not an error to show.
      if (controller.signal.aborted || request !== requestRef.current) return;
      setListError(true);
    } finally {
      if (request === requestRef.current && abortRef.current === controller) setLoading(null);
    }
  };

  const search = (text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void load({ q: text.trim(), sort }, 0);
    }, SEARCH_DEBOUNCE_MS);
  };

  const resort = (next: SortId) => {
    // A pending keystroke is folded into this request instead of firing
    // after it with the old sort.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setSort(next);
    void load({ q: query.trim(), sort: next }, 0);
  };

  const add = (id: string) => {
    setSaved(false);
    setChosen((current) =>
      current.includes(id) || current.length >= MARQUEE_MAX ? current : [...current, id],
    );
  };

  const remove = (id: string) => {
    setSaved(false);
    setChosen((current) => current.filter((entry) => entry !== id));
  };

  const move = (index: number, direction: -1 | 1) => {
    setSaved(false);
    setChosen((current) => {
      const to = index + direction;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/featured"), {
        method: "PUT",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternIds: chosen }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save the marquee.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const left = exhausted ? 0 : Math.max(0, total - nextOffset);

  return (
    <div className={styles.decksPage}>
      <div className={styles.sectionHead}>
        <h1 className={styles.sectionTitle}>The marquee</h1>
        <span className={styles.sectionLede}>
          The patterns across the top of /community, in this order. The first plays dimmed behind
          the intro text; the rest are the panels. Leave it empty and the front page falls back to
          the most-liked patterns on its own.
        </span>
      </div>

      <section className={styles.deckSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionKicker}>
            Showing {chosen.length} of {MARQUEE_MAX}
          </span>
          <span className={styles.headerSpacer} />
          {error && <span className={styles.confirmError}>{error}</span>}
          {saved && !dirty && <span className={styles.fieldHint}>Saved.</span>}
          <button
            type="button"
            className={styles.btnAccent}
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save the marquee"}
          </button>
        </div>

        {chosen.length === 0 ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyKicker}>Marquee · empty</span>
            <span className={styles.emptyTitle}>Falling back to most-liked.</span>
            <span className={styles.emptyBody}>
              Nothing is chosen, so the front page shows whatever has the most likes. Pick some
              below to say something more deliberate than that.
            </span>
          </div>
        ) : (
          <ol className={styles.featuredRow}>
            {chosen.map((id, index) => {
              const item = known.get(id);
              return (
                <li key={id} className={styles.featuredSlot}>
                  <span className={styles.deckSlotIndex}>
                    {index + 1}
                    {/* Marquee.tsx spends items[0] on the intro panel's
                        backdrop, not on a panel of its own — say so, or the
                        first pick looks like it went missing. */}
                    {index === 0 && (
                      <span className={local.slotRole} title="Plays dimmed behind the intro text">
                        {" "}
                        · backdrop
                      </span>
                    )}
                  </span>
                  <span
                    className={`${styles.canvasWell} ${index === 0 ? local.backdropWell : ""}`}
                  >
                    {item && (
                      <PatternCanvas
                        code={item.code}
                        title={item.title}
                        className={styles.canvasFill}
                      />
                    )}
                  </span>
                  <span className={styles.cardTitle}>
                    <span className={styles.cardTitleText}>{item?.title ?? id}</span>
                  </span>
                  <span className={styles.featuredControls}>
                    <button
                      type="button"
                      className={styles.btnSmall}
                      disabled={index === 0}
                      title="Move left"
                      onClick={() => move(index, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className={styles.btnSmall}
                      disabled={index === chosen.length - 1}
                      title="Move right"
                      onClick={() => move(index, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className={styles.btnSmallDanger}
                      title="Take it off the marquee"
                      onClick={() => remove(id)}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.deckSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionKicker}>Public patterns</span>
          <span className={styles.sectionLede}>
            Only public patterns can go up — the marquee is the front page.
          </span>
        </div>

        <div className={`${styles.feedControls} ${local.controls}`}>
          <input
            type="search"
            className={`${styles.textInput} ${local.search}`}
            placeholder="Title or @author"
            aria-label="Search public patterns by title, or by author with @name"
            value={query}
            maxLength={80}
            spellCheck={false}
            onChange={(event) => search(event.target.value)}
          />

          <div className={`${styles.sortTabs} ${local.tabs}`} role="group" aria-label="Sort">
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                data-active={sort === option.id}
                aria-pressed={sort === option.id}
                onClick={() => resort(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <span className={styles.feedCount} aria-live="polite">
            {loading === "list"
              ? "Looking…"
              : view.q
                ? `${total} match${total === 1 ? "" : "es"}`
                : `${total} pattern${total === 1 ? "" : "s"}`}
          </span>
        </div>

        {listError && (
          <p className={styles.confirmError}>
            Could not load patterns.{" "}
            <button
              type="button"
              className={styles.btnSmall}
              onClick={() => resort(sort)}
            >
              Try again
            </button>
          </p>
        )}

        {items.length === 0 && loading !== "list" ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyKicker}>Patterns · none</span>
            <span className={styles.emptyTitle}>
              {view.q ? "No public pattern matches." : "No public patterns yet."}
            </span>
            {view.q && (
              <span className={styles.emptyBody}>
                Titles and handles are searched as typed. Start with @ to search handles only.
              </span>
            )}
          </div>
        ) : (
          <div className={`${styles.profileGrid} ${loading === "list" ? local.stale : ""}`}>
            {items.map((item) => {
              const already = chosen.includes(item.id);
              return (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardThumb}>
                    <PatternCanvas
                      code={item.code}
                      title={item.title}
                      className={styles.canvasFill}
                    />
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardTitle}>
                      <span className={styles.cardTitleText}>{item.title}</span>
                    </span>
                    <span className={styles.cardByline}>
                      <span className={styles.userLink}>
                        @{item.displayUsername ?? item.username ?? "unknown"}
                      </span>
                      <span className={styles.cardStats}>
                        {item.createdAt.slice(0, 10)} · LIK{" "}
                        {String(item.likeCount).padStart(2, "0")}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.btnSmall}
                      disabled={already || chosen.length >= MARQUEE_MAX}
                      title={
                        already
                          ? "Already on the marquee"
                          : chosen.length >= MARQUEE_MAX
                            ? `The marquee holds ${MARQUEE_MAX}`
                            : "Put it on the marquee"
                      }
                      onClick={() => add(item.id)}
                    >
                      {already ? "On the marquee" : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* An explicit button rather than infinite scroll: this list is
            scanned on purpose, and every card is a live canvas. */}
        {left > 0 && (
          <div className={local.more}>
            <button
              type="button"
              className={styles.btn}
              disabled={loading !== null}
              onClick={() => void load(view, nextOffset)}
            >
              {loading === "more" ? "Loading…" : `Load more (${left} left)`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
