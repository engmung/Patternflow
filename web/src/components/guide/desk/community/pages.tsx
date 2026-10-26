"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { knobSetupFromCode } from "@/lib/community/knobs";
import cs from "@/components/community/Community.module.css";
import { deskSignal } from "../deskStore";
import { COMMUNITY_SIGNAL } from "./handle";
import { BASICS, BASICS_STRIP, DECKS, NEWEST, PUBLIC_DECKS_MAX, deckById, patternById, type PracticeDeck } from "./data";
import { DeckStrip, PLink, PatternCard, Screen } from "./parts";
import { usePractice, type Sort } from "./state";
import ps from "./Practice.module.css";

// The practice community's pages, each rebuilt from its real counterpart on
// local state, in the real UI's words:
//
//   Header        app/community/layout.tsx, CommunityNav, AuthStatus
//   Wall          CommunityFeedClient + FeedControls (/community/patterns)
//   PatternPage   app/community/p/[id]/PatternDetailClient.tsx
//   DecksPage     app/community/decks/page.tsx, ShippedPackCard, DeckCard
//   DeckPage      app/community/d/[id]/DeckDetailClient.tsx
//
// Smaller than the real pages where a window is smaller than a browser (no
// comments, no performances, no owner tools); never different in what a
// button says or does to the page. What would reach a board, a server or an
// account says so instead (words.ts).

/** The window's visible size (the scroll box), for what fits without scrolling. */
export const ViewContext = createContext<{ w: number; h: number } | null>(null);

// ── header ──────────────────────────────────────────────────────────────────

export function Header() {
  const page = usePractice((s) => s.page);
  const go = usePractice((s) => s.go);
  const say = usePractice((s) => s.say);
  const patterns = page.kind === "wall" || page.kind === "pattern";
  const decks = page.kind === "decks" || page.kind === "deck";
  return (
    <header className={`${cs.pageHeader} ${ps.header}`}>
      <div className={cs.brandBlock}>
        <span className={cs.brand}>Patternflow</span>
        <PLink className={cs.pageTitle} go={() => go({ kind: "wall" })}>
          Community
        </PLink>
      </div>
      <nav className={cs.sectionNav} aria-label="Community sections">
        <PLink go={() => go({ kind: "wall" })} active={patterns} current={patterns} pc="nav-patterns">
          Patterns
        </PLink>
        <PLink go={() => go({ kind: "decks" })} active={decks} current={decks} pc="nav-decks">
          Decks
        </PLink>
      </nav>
      <div className={cs.headerSpacer} />
      <nav className={cs.headerNav}>
        <PLink go={() => say("labHeader")} title="Open Pattern Lab editor">
          Pattern Lab ↗
        </PLink>
        <button type="button" className={cs.btn} onClick={() => say("signIn")}>
          Sign in
        </button>
      </nav>
    </header>
  );
}

// ── the wall ────────────────────────────────────────────────────────────────

const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "Newest" },
  { id: "old", label: "Oldest" },
  { id: "top", label: "Most liked" },
  { id: "forks", label: "Most forked" },
  { id: "decks", label: "In decks" },
];

/** The wall's zoom (Ctrl + scroll), as a factor on the fitted card size. */
const ZOOM_MIN = 0.6;
/** The deck bar's height (Community.module.css --slot-h) and a card's caption under its screen. */
const DOCK_H = 68;
const CAPTION_H = 46;

/** The wall's last measured card size: a wall that comes back (from a pattern's page) starts at it, not at a guess. */
let lastFit: { w: number; gap: number } | null = null;

export function Wall() {
  const q = usePractice((s) => s.q);
  const hw = usePractice((s) => s.hw);
  const sort = usePractice((s) => s.sort);
  const liked = usePractice((s) => s.liked);
  const view = useContext(ViewContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<{ w: number; gap: number } | null>(() => lastFit);

  const searched = q.replace(/^@/, "").trim() ? q.trim() : "";
  const items = useMemo(() => {
    let ids = NEWEST.slice();
    if (sort === "old") ids.reverse();
    if (sort === "top") ids = [...ids].sort((a, b) => Number(Boolean(liked[b])) - Number(Boolean(liked[a])));
    if (sort === "decks") {
      const count = (id: string) => DECKS.filter((d) => d.patterns.includes(id)).length;
      ids = [...ids].sort((a, b) => count(b) - count(a));
    }
    const needle = searched.toLowerCase();
    return ids
      .map((id) => patternById(id)!)
      .filter((p) => !hw || p.hasCpp)
      .filter((p) => {
        if (!needle) return true;
        if (needle.startsWith("@")) return p.handle.toLowerCase().includes(needle.slice(1));
        return p.title.toLowerCase().includes(needle) || p.handle.toLowerCase().includes(needle);
      });
  }, [sort, liked, hw, searched]);

  // Cards as big as fit: four across, and tall enough to stay in view above
  // the deck bar. Measured off the live layout, as the real wall measures its
  // columns — before the first paint, so the cards never show at a guessed
  // size and then jump.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const scroller = body?.closest<HTMLElement>("[data-pc-scroll]");
    if (!body || !scroller || !view) return;
    const measure = () => {
      const top = body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const gap = 16;
      const byW = (body.clientWidth - gap * 3) / 4;
      const byH = (view.h - top - DOCK_H - CAPTION_H - 12) / 2;
      const w = Math.round(Math.max(96, Math.min(260, Math.min(byW, byH))));
      lastFit = { w, gap };
      setFit((f) => (f && f.w === w ? f : { w, gap }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [view]);

  // Ctrl + scroll resizes the wall (CommunityFeedClient), and the page never zooms.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(1, Math.max(ZOOM_MIN, z * Math.exp(-e.deltaY * 0.0015))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const w = Math.round((fit?.w ?? 180) * zoom);
  const gap = w <= 140 ? 10 : (fit?.gap ?? 16);
  const total = items.length;
  const st = usePractice.getState;

  return (
    <div className={`${cs.feedWrapper} ${ps.feed}`} ref={wrapRef}>
      <form
        role="search"
        className={cs.feedSearch}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          type="search"
          className={`${cs.textInput} ${cs.feedSearchInput}`}
          placeholder="Search titles or @author"
          aria-label="Search patterns by title, or by author with @name"
          value={q}
          maxLength={80}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => st().setQ(e.target.value)}
        />
      </form>

      <div className={cs.feedControls}>
        <span className={cs.feedCount} aria-live="polite">
          {searched ? `${total} match${total === 1 ? "" : "es"} for “${searched}”` : `${total} pattern${total === 1 ? "" : "s"}`}
        </span>
        <div className={cs.sortTabs} role="group" aria-label="Sort patterns">
          {SORTS.map((o) => (
            <PLink key={o.id} go={() => st().setSort(o.id)} active={sort === o.id}>
              {o.label}
            </PLink>
          ))}
        </div>
        <span className={cs.controlRule} aria-hidden="true" />
        <PLink
          className={cs.filterChip}
          go={() => st().setHw(!hw)}
          active={hw}
          pc="filter"
          title="Only patterns that ship a verified .h firmware header — ready to flash to a board"
        >
          <span className={cs.hwChip}>.h</span> Flashable now
        </PLink>
        <span className={cs.zoomHint}>Ctrl + scroll to resize · scroll on a screen to turn its knobs · hover to play</span>
      </div>

      <div ref={bodyRef} className={cs.centeredFeedBody}>
        {total === 0 && searched ? (
          <div className={cs.emptyPanel}>
            <span className={cs.emptyKicker}>Patterns · no match</span>
            <span className={cs.emptyTitle}>Nothing matches “{searched}”.</span>
            <span className={cs.emptyBody}>
              Titles and handles are searched as typed. Start with @ to search handles only.
              {hw && " Only flashable patterns were searched — drop the filter to search all of them."}
            </span>
            <button type="button" className={cs.feedSearchClear} onClick={() => st().setQ("")}>
              Clear search
            </button>
          </div>
        ) : (
          <>
            <div
              className={cs.feedGrid}
              data-view={w <= 140 ? "small" : "large"}
              style={{ gridTemplateColumns: `repeat(${Math.max(1, total)}, ${w}px)`, gap: `${gap}px` }}
            >
              {items.map((p) => (
                <PatternCard key={p.id} p={p} />
              ))}
            </div>
            <p className={`${cs.feedEndNote} ${ps.endNote}`}>
              {searched ? `That is every match — ${total}` : `That is all of it — ${total} pattern${total === 1 ? "" : "s"}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── a pattern's page ────────────────────────────────────────────────────────

function Breadcrumb({ to, label }: { to: "wall" | "decks"; label: string }) {
  return (
    <PLink className={cs.breadcrumb} go={() => usePractice.getState().go({ kind: to })} pc="back">
      {label}
    </PLink>
  );
}

export function PatternPage({ id }: { id: string }) {
  const p = patternById(id);
  const setup = useMemo(() => knobSetupFromCode(p?.code ?? ""), [p]);
  const knobs = usePractice((s) => s.knobs[id]) ?? setup.values;
  const inDeck = usePractice((s) => s.deck.includes(id));
  const liked = usePractice((s) => Boolean(s.liked[id]));
  const [running, setRunning] = useState(true);
  const [tab, setTab] = useState<"js" | "h">("js");
  const st = usePractice.getState;
  if (!p) return null;

  return (
    <div className={`${cs.detailWrap} ${ps.detail}`}>
      <Breadcrumb to="wall" label="← Patterns" />

      <div className={cs.detailLayout}>
        <div className={cs.detailLeftCol}>
          <div className={`${cs.matrixFrame} ${ps.frame}`}>
            <Screen skey={`page-${id}`} code={p.code} knobs={knobs} playing={running} />
          </div>

          <div className={`${cs.knobs} ${ps.knobsBox}`}>
            {knobs.map((value, i) => (
              <div key={i} className={cs.knobLine}>
                <span>{setup.labels[i]}</span>
                <input
                  type="range"
                  min={setup.ranges[i][0]}
                  max={setup.ranges[i][1]}
                  step="0.001"
                  value={value}
                  aria-label={`${setup.labels[i]} value`}
                  onChange={(e) => {
                    const next = knobs.slice();
                    next[i] = Number(e.target.value);
                    st().setKnobs(id, next);
                  }}
                />
                <span className={cs.knobValue}>{value.toFixed(3)}</span>
              </div>
            ))}
          </div>

          <div className={`${cs.actionRow} ${ps.actions}`}>
            <button type="button" className={cs.btn} onClick={() => setRunning((v) => !v)}>
              {running ? "Pause" : "Run"}
            </button>
            <button
              type="button"
              className={cs.btnAccent}
              title="Open a copy in the lab. Sharing from there publishes it as your fork."
              data-pc="open-lab"
              onClick={() => st().say("lab")}
            >
              Open in Pattern Lab
            </button>
            {p.hasCpp && (
              <button
                type="button"
                className={cs.btnAccent}
                title="Install this pattern over Wi-Fi, or download it as a .zip — no sign-in needed"
                data-pc="send"
                onClick={() => st().openSend(id)}
              >
                ↗ Send to my Patternflow
              </button>
            )}
            {p.hasCpp && (
              <button
                type="button"
                className={cs.btn}
                title="Download the compiled module to drop on your board's Patterns page"
                onClick={() => st().say("zip")}
              >
                ↓ Download .zip
              </button>
            )}
            {p.hasCpp && (
              <button
                type="button"
                className={cs.btn}
                title="Put this in your deck; build the whole deck as loadable modules"
                data-pc="add-deck"
                onClick={() => {
                  if (inDeck) st().remove(id);
                  else if (st().add(id)) deskSignal(COMMUNITY_SIGNAL.added);
                }}
              >
                {inDeck ? "✓ In deck" : "▦ Add to deck"}
              </button>
            )}
          </div>
        </div>

        <div className={`${cs.editorWrap} ${ps.editorWrap}`}>
          <div className={cs.codeTabs}>
            <button type="button" data-active={tab === "js"} onClick={() => setTab("js")} title="The pattern source — edit it and the preview follows">
              pattern.js
            </button>
            {p.hasCpp && (
              <button type="button" data-active={tab === "h"} onClick={() => setTab("h")} title="Firmware header for the board (read-only)">
                firmware.h
              </button>
            )}
            <span className={cs.codeTabSpacer} />
            <button type="button" className={cs.codeTabAction} onClick={() => st().say("download")}>
              {tab === "js" ? "↓ .js" : "↓ .h"}
            </button>
          </div>
          <div className={`${cs.editorBody} ${ps.editor}`} tabIndex={0} aria-label={tab === "js" ? "pattern.js" : "firmware.h"}>
            <pre className={ps.code}>
              {tab === "js"
                ? p.code
                : "// firmware.h — this pattern's firmware header: the C++ the board runs.\n// The practice keeps no header. Pattern Lab makes one from the JS (02)."}
            </pre>
          </div>
          {tab === "h" && (
            <p className={cs.codeFootNote}>
              Use <strong>Send to my Patternflow</strong> below to compile and install this without an Arduino IDE. Provided by the
              author and not verified by us.
            </p>
          )}
        </div>
      </div>

      <div className={`${cs.metaBlock} ${ps.meta}`}>
        <div className={cs.metaTitleRow}>
          <div className={`${cs.metaTitle} ${ps.metaTitle}`}>{p.title}</div>
          <button
            type="button"
            className={`${cs.likeButton}${liked ? ` ${cs.likeButtonOn}` : ""}`}
            aria-pressed={liked}
            aria-label={liked ? "Unlike this pattern" : "Like this pattern"}
            onClick={() => st().toggleLike(id)}
          >
            <span aria-hidden="true">LIK</span>
            <span>{String(liked ? 1 : 0).padStart(2, "0")}</span>
          </button>
        </div>
        <div className={cs.metaByline}>
          <span>by @{p.handle}</span>
          <span>{p.license}</span>
          {p.hasCpp && (
            <span className={cs.hwNote} title="Ships a .h firmware header">
              <span className={cs.hwChip}>.h</span> hardware ready
            </span>
          )}
        </div>
        {!p.hasCpp && (
          <div className={cs.portsSection}>
            <div className={cs.portsHead}>
              <span className={cs.portsTitle}>Firmware ports</span>
              <button type="button" className={cs.btnSmall} onClick={() => st().say("port")}>
                Port this pattern (.h)
              </button>
            </div>
            <p className={cs.formNote}>
              No firmware header yet. If you ran this on your own board, propose the .h — it goes live immediately, credited to you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── decks ───────────────────────────────────────────────────────────────────

function stripOf(d: PracticeDeck) {
  return d.patterns.map((id, i) => ({ key: `${d.id}-${i}-${id}`, skey: id, code: patternById(id)!.code }));
}

function ShippedPack() {
  const st = usePractice.getState;
  const [host, setHost] = useState("patternflow.local");
  return (
    <div className={cs.deckCard}>
      <DeckStrip cells={BASICS_STRIP} total={BASICS.patterns} />
      <div className={cs.deckCardMeta}>
        <span className={cs.deckCardTitleRow}>
          <span className={cs.deckCardTitle}>{BASICS.name}</span>
          <span className={cs.deckCardSlots}>{BASICS.patterns} slots</span>
          <span className={cs.visChip}>shipped</span>
          <span className={cs.deckCardUser}>{BASICS.publisher}</span>
        </span>
        <span className={cs.deckCardDesc}>
          The set a board arrives with. Install it on a device with nothing on it yet, or after a wipe — no account, no build queue. Needs firmware 3.5.1 or later; update an older board first.
        </span>
        <span className={cs.deckCardStats}>
          <span>{(BASICS.bytes / 1024).toFixed(0)} KB</span>
          <span>{BASICS.licenses.join(", ")}</span>
        </span>
      </div>
      <div className={cs.packActions}>
        <button type="button" className={cs.btnPrimary} data-pc="basics-install" onClick={() => st().say("installBasics", BASICS.patterns)}>
          Install to my board
        </button>
        <button type="button" className={cs.btn} onClick={() => st().say("zip")}>
          Download .zip
        </button>
      </div>
      <span className={cs.packHint}>
        Device address:{" "}
        <input
          type="text"
          className={cs.zipHostField}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          spellCheck={false}
          aria-label="Device address"
        />{" "}
        (Android can’t resolve <code>.local</code> — use the IP from the device’s NETWORK screen, hold K2.) Or download the .zip and drop it
        on your device’s Patterns page — same result.
      </span>
    </div>
  );
}

export function DecksPage() {
  const go = usePractice((s) => s.go);
  return (
    <div className={`${cs.decksPage} ${ps.decks}`}>
      <div className={cs.sectionHead}>
        <div className={`${cs.sectionTitle} ${ps.decksTitle}`}>Sets people stood behind.</div>
        <span className={cs.sectionLede}>
          A deck is an ordered set — the order it cycles on the device. {PUBLIC_DECKS_MAX} public decks per person; publishing takes
          everything, a deck takes a decision.
        </span>
      </div>

      <section className={cs.deckSection}>
        <div className={cs.sectionHead}>
          <span className={cs.sectionKicker}>Ships with Patternflow</span>
          <span className={cs.sectionLede}>Start here if your board is empty.</span>
        </div>
        <div className={cs.deckGrid}>
          <ShippedPack />
        </div>
      </section>

      <section className={cs.deckSection}>
        <div className={cs.sectionHead}>
          <span className={cs.sectionKicker}>Community decks</span>
          <span className={cs.sectionLede}>{DECKS.length} public decks</span>
        </div>
        <div className={cs.deckGrid}>
          {DECKS.map((d) => (
            <a
              key={d.id}
              href="#practice"
              className={cs.deckCard}
              data-pc-deck={d.id}
              onClick={(e) => {
                e.preventDefault();
                go({ kind: "deck", id: d.id });
              }}
            >
              <DeckStrip cells={stripOf(d)} total={d.patterns.length} />
              <div className={cs.deckCardMeta}>
                <span className={cs.deckCardTitleRow}>
                  <span className={cs.deckCardTitle}>{d.title}</span>
                  <span className={cs.deckCardSlots}>
                    {d.patterns.length} slot{d.patterns.length === 1 ? "" : "s"}
                  </span>
                  <span className={cs.deckCardUser}>@{d.handle}</span>
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export function DeckPage({ id }: { id: string }) {
  const d = deckById(id);
  const copied = usePractice((s) => s.copied);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const st = usePractice.getState;
  if (!d) return null;
  const n = d.patterns.length;

  return (
    <div className={cs.deckPage}>
      <Breadcrumb to="decks" label="← Decks" />
      <div className={cs.metaBlock}>
        <div className={cs.deckHead}>
          <div className={cs.deckHeadTitle}>
            <div className={ps.deckTitle}>{d.title}</div>
            <span className={cs.deckByline}>
              <span>by @{d.handle}</span>
              <span>
                · {n} {n === 1 ? "slot" : "slots"}
              </span>
            </span>
          </div>
          <span className={cs.ownerBarSpacer} />
          <button
            type="button"
            className={cs.btn}
            title="Load these patterns, in this order, into your own working deck"
            data-pc="deck-copy"
            onClick={() => {
              // Both overwrite the visitor's own deck, so a full one asks twice.
              if (st().deck.length > 0 && !confirmCopy) {
                setConfirmCopy(true);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setConfirmCopy(false), 4000);
                return;
              }
              setConfirmCopy(false);
              st().copyDeck(d.id);
            }}
          >
            {confirmCopy ? "Press again — this replaces your deck" : "Copy into my deck"}
          </button>
          <button type="button" className={cs.btn} title="Get a link to this deck's pack that anyone can install from" onClick={() => st().say("sharePack")}>
            Share
          </button>
          <button
            type="button"
            className={cs.btn}
            title="Download the pack — modules and running order — to drop on your board's Patterns page"
            onClick={() => st().say("zip")}
          >
            Download .zip
          </button>
          <button
            type="button"
            className={cs.btnAccentLink}
            title="Open your board's Patterns page with this deck queued — no sign-in needed"
            data-pc="deck-install"
            onClick={() => st().say("installDeck", n)}
          >
            Install to my board
          </button>
        </div>
        <p className={cs.zipHint}>Board not reachable from this network (e.g. VPN)? Use Download .zip.</p>
        {copied && <div className={cs.formNote}>{copied}</div>}
      </div>

      <ol className={`${cs.deckSlots} ${ps.slots}`}>
        {d.patterns.map((pid, i) => (
          <li key={`${i}-${pid}`} className={cs.deckSlot}>
            <span className={cs.deckSlotIndex}>{i + 1}</span>
            <PatternCard p={patternById(pid)!} />
          </li>
        ))}
      </ol>
    </div>
  );
}
