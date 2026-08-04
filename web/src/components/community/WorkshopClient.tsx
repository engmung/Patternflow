"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  PIN_NOTE_MAX,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  formatSince,
  parseQuestions,
} from "@/lib/community/workshop";
import type { TerritoryListItem } from "@/lib/community/queries";
import { useIsMobile } from "@/lib/useMediaQuery";
import AuthModal from "./AuthModal";
import NewThreadModal from "./NewThreadModal";
import styles from "./Community.module.css";

// The map, and the drawer under it.
//
// Two views of the same six-or-so facts. The constellation says "these are
// directions off one object" — everything hangs off the device in the middle,
// and the dashed spurs are questions nobody has answered. The floor plan says
// "these are rooms you can walk into" — same nodes, no romance, easier to scan
// once there are more than a handful.
//
// The selected territory is a URL parameter, not state: a link to the map
// should be able to point at one, and the server loads that territory's pins
// and threads in the same request. The view mode is state, remembered per
// browser — it is a reading preference and a shared link should not impose it.

const VIEW_KEY = "pf-map-view";

export type WorkshopPin = {
  userId: string;
  username: string | null;
  displayUsername: string | null;
  note: string | null;
  createdAt: string;
};

export type WorkshopThread = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  username: string | null;
  displayUsername: string | null;
  commentCount: number;
};

/** A thread in the cross-territory "latest" strip — carries where it lives. */
export type RecentThreadView = {
  id: string;
  title: string;
  createdAt: string;
  username: string | null;
  displayUsername: string | null;
  commentCount: number;
  territoryCode: string;
  territoryTitle: string;
};

function handleOf(pin: { displayUsername: string | null; username: string | null }): string {
  return pin.displayUsername ?? pin.username ?? "unknown";
}

/** One line of a thread body for its card. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

export default function WorkshopClient({
  territories,
  selected,
  pins,
  threads,
  viewerId,
  myPinCodes,
  recent = [],
}: {
  territories: TerritoryListItem[];
  selected: TerritoryListItem | null;
  pins: WorkshopPin[];
  threads: WorkshopThread[];
  viewerId: string | null;
  myPinCodes: string[];
  /** Newest threads anywhere — rendered as the strip under the header. */
  recent?: RecentThreadView[];
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isMobile = useIsMobile();

  // The grid is the default, not the constellation.
  //
  // The constellation is the better picture and the worse list: it says "these
  // all hang off one object", which you need to be told once, and then it
  // makes every subsequent visit a scan of scattered boxes. The grid is what
  // you want on the ninth visit, and it keeps working when there are twenty
  // directions instead of six. The stored choice is adopted a frame after
  // mount so it never fights the server-rendered markup.
  const [view, setView] = useState<"constellation" | "floor">("floor");
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(VIEW_KEY);
        if (saved === "floor" || saved === "constellation") setView(saved);
      } catch {
        // Private mode: the default is fine.
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);
  const chooseView = (next: "constellation" | "floor") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // The choice lasts for this page, which is still something.
    }
  };

  const [draft, setDraft] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  const pinnedHere = selected ? myPinCodes.includes(selected.code) : false;
  const myPin = pins.find((pin) => pin.userId === viewerId) ?? null;

  // The note field shows what is stored until the visitor types over it, and a
  // draft belongs to the territory it was typed in — switching zones drops it,
  // because it was about the other one. Derived rather than mirrored into an
  // effect: syncing props into state on every selection is a re-render loop
  // waiting to happen, and this is the same behaviour with none of that.
  const noteFor = selected?.code ?? "";
  const note = draft !== null && draftFor === noteFor ? draft : (myPin?.note ?? "");
  const editNote = (value: string) => {
    setDraft(value);
    setDraftFor(noteFor);
  };

  const select = (code: string) => {
    router.push(`/community/workshop?z=${code}`, { scroll: false });
  };

  const pin = async () => {
    if (!selected) return;
    if (!session) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/territories/${selected.code}/pin`),
        {
          method: "POST",
          ...COMMUNITY_FETCH_INIT,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not pin you there.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const unpin = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/territories/${selected.code}/pin`),
        { method: "DELETE", ...COMMUNITY_FETCH_INIT },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not unpin you.");
        return;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (territories.length === 0) {
    return (
      <div className={styles.mapPage}>
        <div className={styles.mapHead}>
          <h1 className={styles.mapTitle}>The workshop</h1>
          <span className={styles.mapLede}>What Patternflow could become, and who is working on which part of it.</span>
        </div>
        <div className={styles.emptyPanel}>
          <span className={styles.emptyKicker}>The workshop · empty</span>
          <span className={styles.emptyTitle}>No directions marked out yet.</span>
          <span className={styles.emptyBody}>
            Territories are drawn by the people running the project — a direction anyone could
            take Patternflow in, like putting it on a bigger panel or driving it over a wire.
            Once there are some, this is where you say which one you are working on.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapPage}>
      <div className={styles.mapHead}>
        <h1 className={styles.mapTitle}>The workshop</h1>
        <span className={styles.mapLede}>What Patternflow could become, and who is working on which part of it.</span>
        <span className={styles.headerSpacer} />
        <div className={styles.viewToggle} role="group" aria-label="View">
          {/* Default first, so the toggle reads in the order you meet it. */}
          <button type="button" data-active={view === "floor"} onClick={() => chooseView("floor")}>
            ▦ Grid
          </button>
          <button
            type="button"
            data-active={view === "constellation"}
            onClick={() => chooseView("constellation")}
          >
            ◇ Map
          </button>
        </div>
      </div>

      {/* Proof of life, before the geography: the newest threads anywhere.
          Without this a visitor has to click six zones to learn whether
          anything is happening. */}
      {recent.length > 0 && (
        <div className={styles.recentStrip}>
          <span className={styles.workingLabel}>Latest</span>
          {recent.map((thread) => (
            <Link
              key={thread.id}
              href={`/community/workshop/${thread.territoryCode.toLowerCase()}/t/${thread.id}`}
              className={styles.recentRow}
            >
              <span className={styles.nodeCode}>{thread.territoryCode}</span>
              <span className={styles.threadCardTitle}>{thread.title}</span>
              {thread.commentCount > 0 && (
                <span className={styles.threadCardCount}>{thread.commentCount}</span>
              )}
              <span className={styles.threadCardByline}>
                @{handleOf(thread)} · {thread.createdAt.slice(0, 10)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* A constellation needs room to be read and a pointer to be explored;
          a phone has neither, so it always gets the list. */}
      {view === "constellation" && !isMobile ? (
        <Constellation territories={territories} selected={selected} onSelect={select} />
      ) : (
        <FloorPlan territories={territories} selected={selected} onSelect={select} />
      )}

      {selected && (
        <div className={styles.mapDrawer}>
          <div className={styles.drawerHead}>
            <span className={styles.drawerCode}>{selected.code}</span>
            <span className={styles.drawerTitle}>{selected.title}</span>
            <span className={styles.drawerCounts}>
              {selected.pinCount} working · {selected.threadCount} thread
              {selected.threadCount === 1 ? "" : "s"}
            </span>
            {/* The drawer caps its list; this is where the rest live. */}
            {selected.threadCount > 0 && (
              <Link
                href={`/community/workshop/${selected.code.toLowerCase()}`}
                className={styles.drawerAll}
              >
                All {selected.threadCount} →
              </Link>
            )}
            {pinnedHere && myPin && (
              <span className={styles.pinnedChip}>
                <i aria-hidden="true" />
                You&rsquo;re pinned here · since {formatSince(myPin.createdAt)}
              </span>
            )}
            <span className={styles.headerSpacer} />
            {pinnedHere && (
              <button
                type="button"
                className={styles.mapGhostBtn}
                disabled={busy}
                onClick={() => void unpin()}
              >
                Unpin
              </button>
            )}
            <button
              type="button"
              className={styles.btn}
              onClick={() => (session ? setThreadOpen(true) : setAuthOpen(true))}
            >
              New thread
            </button>
          </div>

          <div className={styles.workingRow}>
            <span className={styles.workingLabel}>Working here</span>
            {pins.length === 0 ? (
              <span className={styles.workingEmpty}>Nobody yet — be the first.</span>
            ) : (
              pins.map((entry) => (
                <span
                  key={entry.userId}
                  className={styles.workingChip}
                  data-self={entry.userId === viewerId}
                >
                  <i aria-hidden="true" />@{handleOf(entry)}
                  {entry.userId === viewerId && " (you)"}
                  {entry.note && ` · ${entry.note}`}
                </span>
              ))
            )}
          </div>

          {threads.length > 0 && (
            <div className={styles.threadGrid}>
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/community/workshop/${selected.code.toLowerCase()}/t/${thread.id}`}
                  className={styles.threadCard}
                >
                  <span className={styles.threadCardHead}>
                    <span className={styles.threadCardTitle}>{thread.title}</span>
                    <span className={styles.headerSpacer} />
                    {thread.commentCount > 0 && (
                      <span className={styles.threadCardCount}>{thread.commentCount}</span>
                    )}
                  </span>
                  <span className={styles.threadCardPreview}>{preview(thread.body)}</span>
                  <span className={styles.threadCardByline}>
                    @{handleOf(thread)} · {thread.createdAt.slice(0, 10)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* The lowest-effort way in. Typing what you are up to and pressing
              Post is the pin — no thread required, no artifact required. */}
          <div className={styles.pinComposer}>
            <input
              value={note}
              maxLength={PIN_NOTE_MAX}
              placeholder="Say where you are with it…"
              aria-label="What you are working on here"
              onChange={(event) => editNote(event.target.value)}
            />
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void pin()}>
              {pinnedHere ? "Update" : "▣ I'm working here"}
            </button>
          </div>
          {error && <div className={styles.formError}>{error}</div>}
        </div>
      )}

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
      {threadOpen && selected && (
        <NewThreadModal
          territories={territories}
          initialCode={selected.code}
          onClose={() => setThreadOpen(false)}
        />
      )}
    </div>
  );
}

// ── Constellation ────────────────────────────────────────────────────────────
// Everything hangs off the device in the middle. Node coordinates are stored
// against the design's 1440×640 stage and laid out as percentages, so the
// arrangement survives any viewport instead of needing a second set for each.

function Constellation({
  territories,
  selected,
  onSelect,
}: {
  territories: TerritoryListItem[];
  selected: TerritoryListItem | null;
  onSelect: (code: string) => void;
}) {
  const cx = STAGE_WIDTH / 2;
  const cy = STAGE_HEIGHT / 2;

  return (
    <div className={styles.stage}>
      <svg
        className={styles.stageLines}
        viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {territories.map((territory) => (
          <line
            key={territory.id}
            x1={cx}
            y1={cy}
            x2={territory.x}
            y2={territory.y}
            stroke={selected?.id === territory.id ? "#E8552E" : "rgba(244,239,230,0.18)"}
            strokeWidth={selected?.id === territory.id ? 1.5 : 1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className={styles.stageCore} style={{ left: "50%", top: "50%" }}>
        <div className={styles.coreScreen} />
        <span>Patternflow</span>
      </div>

      {territories.map((territory) => {
        const questions = parseQuestions(territory.questions);
        const active = selected?.id === territory.id;
        return (
          <button
            key={territory.id}
            type="button"
            className={styles.stageNode}
            data-active={active}
            style={{
              left: `${(territory.x / STAGE_WIDTH) * 100}%`,
              top: `${(territory.y / STAGE_HEIGHT) * 100}%`,
            }}
            onClick={() => onSelect(territory.code)}
          >
            <span className={styles.nodeHead}>
              <span className={styles.nodeCode}>{territory.code}</span>
              <span className={styles.nodeTitle}>{territory.title}</span>
            </span>
            <span className={styles.nodeCounts}>
              {Array.from({ length: Math.min(territory.pinCount, 8) }, (_, index) => (
                <i key={index} aria-hidden="true" />
              ))}
              <span>
                {territory.pinCount} · {territory.threadCount} th
              </span>
            </span>
            {/* Open questions only hang off the node you are looking at —
                every node showing its own would be a thicket. */}
            {active && questions.length > 0 && (
              <span className={styles.nodeQuestions}>
                {questions.map((question) => (
                  <span key={question}>{question}</span>
                ))}
              </span>
            )}
          </button>
        );
      })}

      <div className={styles.stageLegend}>
        <span>
          <i className={styles.legendSquare} aria-hidden="true" />
          working
        </span>
        <span>
          <i className={styles.legendLine} aria-hidden="true" />
          selected
        </span>
        <span>
          <i className={styles.legendDashed} aria-hidden="true" />
          open question
        </span>
      </div>
    </div>
  );
}

// ── Floor plan ───────────────────────────────────────────────────────────────
// The same nodes as rooms. No romance, and it keeps working when there are
// twenty directions instead of six.

function FloorPlan({
  territories,
  selected,
  onSelect,
}: {
  territories: TerritoryListItem[];
  selected: TerritoryListItem | null;
  onSelect: (code: string) => void;
}) {
  return (
    <div className={styles.floorPlan}>
      {territories.map((territory) => (
        <button
          key={territory.id}
          type="button"
          className={styles.floorZone}
          data-active={selected?.id === territory.id}
          style={{ gridColumn: `span ${territory.span}` }}
          onClick={() => onSelect(territory.code)}
        >
          <span className={styles.nodeHead}>
            <span className={styles.nodeCode}>{territory.code}</span>
            <span className={styles.floorTitle}>{territory.title}</span>
            {territory.shippingNext && <span className={styles.nextChip}>shipping next</span>}
          </span>
          {territory.description && (
            <span className={styles.floorDesc}>{territory.description}</span>
          )}
          <span className={styles.nodeCounts}>
            {Array.from({ length: Math.min(territory.pinCount, 8) }, (_, index) => (
              <i key={index} aria-hidden="true" />
            ))}
            <span>
              {territory.pinCount} working · {territory.threadCount} thread
              {territory.threadCount === 1 ? "" : "s"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
