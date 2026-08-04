"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  SPAN_MAX,
  SPAN_MIN,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  TERRITORY_DESC_MAX,
  TERRITORY_TITLE_MAX,
} from "@/lib/community/workshop";
import styles from "./Community.module.css";

// The map's editor.
//
// One row per direction, expanded in place — a modal per territory would mean
// losing sight of the map while editing the map. Positions are set by CLICKING
// the stage rather than typing two numbers: the constellation is a picture, and
// "put it there" is the actual intent behind (1090, 128).
//
// Saving is per territory and explicit. The map is the workshop's front door,
// and a keystroke that goes live is a keystroke you cannot take back.

export type TerritoryRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  span: number;
  position: number;
  x: number;
  y: number;
  shippingNext: boolean;
  questions: string | null;
  pinCount: number;
  threadCount: number;
  archived: boolean;
};

/** The editable half of a row — what a draft holds while being typed. */
type Draft = {
  title: string;
  description: string;
  questions: string;
  span: number;
  x: number;
  y: number;
  shippingNext: boolean;
};

const draftOf = (row: TerritoryRow): Draft => ({
  title: row.title,
  description: row.description ?? "",
  questions: row.questions ?? "",
  span: row.span,
  x: row.x,
  y: row.y,
  shippingNext: row.shippingNext,
});

export default function TerritoryEditor({ territories }: { territories: TerritoryRow[] }) {
  const router = useRouter();

  const [openCode, setOpenCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // The add form, closed until asked for.
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const live = territories.filter((row) => !row.archived);
  const archived = territories.filter((row) => row.archived);

  const open = (row: TerritoryRow) => {
    setOpenCode(row.code);
    setDraft(draftOf(row));
    setError(null);
  };

  const patch = async (code: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/territories/${code}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!openCode || !draft) return;
    if (await patch(openCode, draft)) setOpenCode(null);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/territories"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), title: newTitle.trim() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not add it.");
        return;
      }
      setNewCode("");
      setNewTitle("");
      setAdding(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/territories/${code}`), {
        method: "DELETE",
        ...COMMUNITY_FETCH_INIT,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        // The route refuses when threads or pins hang off it, and says why.
        setError(payload.error ?? "Could not remove it.");
        return;
      }
      setConfirmDelete(null);
      setOpenCode(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  /** Swap two rows' stored positions — the map's reading order. */
  const move = async (row: TerritoryRow, direction: -1 | 1) => {
    const index = live.findIndex((entry) => entry.code === row.code);
    const other = live[index + direction];
    if (!other) return;
    setBusy(true);
    await patch(row.code, { position: other.position });
    await patch(other.code, { position: row.position });
    setBusy(false);
  };

  return (
    <div className={styles.decksPage}>
      <div className={styles.sectionHead}>
        <h1 className={styles.sectionTitle}>The map</h1>
        <span className={styles.sectionLede}>
          Directions somebody could take Patternflow. People pin themselves to these and start
          threads inside them — so a territory should be a thing you could actually go and do,
          not a category.
        </span>
        <span className={styles.headerSpacer} />
        <Link href="/community/workshop" className={styles.deckDockLink}>
          See the workshop →
        </Link>
      </div>

      {error && <div className={styles.formError}>{error}</div>}

      {/* Where the constellation puts things. Clicking sets the open
          territory's position; with nothing open it is just the picture. */}
      <section className={styles.deckSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionKicker}>Positions</span>
          <span className={styles.sectionLede}>
            {openCode
              ? `Click anywhere to move ${openCode}. This is the constellation view — the grid ignores it.`
              : "Open a territory below to move it. Only the constellation view uses these."}
          </span>
        </div>

        <div
          className={styles.adminStage}
          data-armed={openCode !== null}
          onClick={(event) => {
            if (!openCode || !draft) return;
            const box = event.currentTarget.getBoundingClientRect();
            setDraft({
              ...draft,
              x: Math.round(((event.clientX - box.left) / box.width) * STAGE_WIDTH),
              y: Math.round(((event.clientY - box.top) / box.height) * STAGE_HEIGHT),
            });
          }}
        >
          <span className={styles.adminStageCore} />
          {live.map((row) => {
            const editing = openCode === row.code && draft;
            const x = editing ? draft.x : row.x;
            const y = editing ? draft.y : row.y;
            return (
              <span
                key={row.code}
                className={styles.adminStageNode}
                data-active={openCode === row.code}
                style={{ left: `${(x / STAGE_WIDTH) * 100}%`, top: `${(y / STAGE_HEIGHT) * 100}%` }}
              >
                {row.code}
              </span>
            );
          })}
        </div>
      </section>

      <section className={styles.deckSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionKicker}>
            {live.length} director{live.length === 1 ? "y" : "ies"}
          </span>
          <span className={styles.headerSpacer} />
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setAdding((was) => !was);
              setError(null);
            }}
          >
            {adding ? "Cancel" : "Add a direction"}
          </button>
        </div>

        {adding && (
          <div className={styles.postComposer}>
            <div className={styles.composerRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Code</span>
                <input
                  className={styles.textInput}
                  value={newCode}
                  placeholder="A1"
                  maxLength={3}
                  autoFocus
                  onChange={(event) => setNewCode(event.target.value.toUpperCase())}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Title</span>
                <input
                  className={styles.textInput}
                  value={newTitle}
                  maxLength={TERRITORY_TITLE_MAX}
                  placeholder="Wired control — OSC"
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              </label>
            </div>
            <span className={styles.fieldHint}>
              A letter and a number, like A1 or B3. The code goes in every thread URL under this
              direction, so it cannot be changed later — the rest can.
            </span>
            <div className={styles.composerActions}>
              <span className={styles.headerSpacer} />
              <button
                type="button"
                className={styles.btnAccent}
                disabled={busy || newCode.trim().length === 0 || newTitle.trim().length === 0}
                onClick={() => void create()}
              >
                {busy ? "Adding…" : "Add it"}
              </button>
            </div>
          </div>
        )}

        <ul className={styles.adminList}>
          {live.map((row, index) => (
            <li key={row.code} className={styles.adminRow} data-open={openCode === row.code}>
              <div className={styles.adminRowHead}>
                <span className={styles.nodeCode}>{row.code}</span>
                <span className={styles.drawerTitle}>{row.title}</span>
                {row.shippingNext && <span className={styles.nextChip}>shipping next</span>}
                <span className={styles.drawerCounts}>
                  {row.pinCount} working · {row.threadCount} thread
                  {row.threadCount === 1 ? "" : "s"}
                </span>
                <span className={styles.headerSpacer} />
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={busy || index === 0}
                  title="Earlier on the map"
                  onClick={() => void move(row, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={busy || index === live.length - 1}
                  title="Later on the map"
                  onClick={() => void move(row, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.btnSmall}
                  onClick={() => (openCode === row.code ? setOpenCode(null) : open(row))}
                >
                  {openCode === row.code ? "Close" : "Edit"}
                </button>
              </div>

              {openCode === row.code && draft && (
                <div className={styles.adminRowBody}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Title</span>
                    <input
                      className={styles.textInput}
                      value={draft.title}
                      maxLength={TERRITORY_TITLE_MAX}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Description</span>
                    <textarea
                      className={styles.textInput}
                      rows={2}
                      value={draft.description}
                      maxLength={TERRITORY_DESC_MAX}
                      placeholder="What this direction is, in a sentence somebody could act on."
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Open questions</span>
                    <textarea
                      className={styles.textInput}
                      rows={3}
                      value={draft.questions}
                      placeholder={"128×128?\nsteel front"}
                      onChange={(event) => setDraft({ ...draft, questions: event.target.value })}
                    />
                    <span className={styles.fieldHint}>
                      One per line, four at most — they hang off the node as dashed chips when it
                      is selected.
                    </span>
                  </label>

                  <div className={styles.composerRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Grid width</span>
                      <select
                        value={draft.span}
                        onChange={(event) =>
                          setDraft({ ...draft, span: Number(event.target.value) })
                        }
                      >
                        {Array.from({ length: SPAN_MAX - SPAN_MIN + 1 }, (_, i) => SPAN_MIN + i).map(
                          (span) => (
                            <option key={span} value={span}>
                              {span} of 6 columns
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className={styles.pinCheck}>
                      <input
                        type="checkbox"
                        checked={draft.shippingNext}
                        onChange={(event) =>
                          setDraft({ ...draft, shippingNext: event.target.checked })
                        }
                      />
                      <span aria-hidden="true">{draft.shippingNext ? "✓" : ""}</span>
                      shipping next
                    </label>

                    <span className={styles.fieldHint}>
                      map position {draft.x}, {draft.y} — click the stage above to move it
                    </span>
                  </div>

                  <div className={styles.composerActions}>
                    <button
                      type="button"
                      className={styles.btnSmall}
                      disabled={busy}
                      title="Retire it: threads stay readable, it leaves the map"
                      onClick={() => void patch(row.code, { archived: true })}
                    >
                      Archive
                    </button>
                    {confirmDelete === row.code ? (
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        disabled={busy}
                        onClick={() => void remove(row.code)}
                      >
                        Really delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.btnSmall}
                        disabled={busy || row.threadCount > 0 || row.pinCount > 0}
                        title={
                          row.threadCount > 0 || row.pinCount > 0
                            ? "Something is written here — archive it instead"
                            : "Remove it entirely"
                        }
                        onClick={() => setConfirmDelete(row.code)}
                      >
                        Delete
                      </button>
                    )}
                    <span className={styles.headerSpacer} />
                    <button
                      type="button"
                      className={styles.btnAccent}
                      disabled={busy || draft.title.trim().length === 0}
                      onClick={() => void save()}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {live.length === 0 && (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyKicker}>The map · empty</span>
            <span className={styles.emptyTitle}>Nothing drawn yet.</span>
            <span className={styles.emptyBody}>
              Add a direction above, or run <code>npm run seed:map</code> once for the starter
              set. Until there is at least one, the workshop has nowhere to put a thread.
            </span>
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section className={styles.deckSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>Archived</span>
            <span className={styles.sectionLede}>
              Off the map, still readable. A direction nobody took is a thing that was considered.
            </span>
          </div>
          <ul className={styles.adminList}>
            {archived.map((row) => (
              <li key={row.code} className={styles.adminRow}>
                <div className={styles.adminRowHead}>
                  <span className={styles.nodeCode}>{row.code}</span>
                  <span className={styles.drawerTitle}>{row.title}</span>
                  <span className={styles.drawerCounts}>
                    {row.threadCount} thread{row.threadCount === 1 ? "" : "s"}
                  </span>
                  <span className={styles.headerSpacer} />
                  <button
                    type="button"
                    className={styles.btnSmall}
                    disabled={busy}
                    onClick={() => void patch(row.code, { archived: false })}
                  >
                    Put it back
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
