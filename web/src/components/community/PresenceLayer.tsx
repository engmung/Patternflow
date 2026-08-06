"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  STATUS_MAX,
  formatSince,
} from "@/lib/community/workshop";
import styles from "./Community.module.css";

// People, standing on the constellation.
//
// Your square walks with WASD and says something with Enter — a tiny game,
// because a map with bodies on it reads as a place and a map without them
// reads as a diagram. Everyone who has never walked stands at the core in a
// loose ring: the pile of squares IS the member count, visible before a single
// one of them has done anything.
//
// This is presence, not pins. A pin is a commitment to a direction and a
// subscription to its threads; your square is just where you are standing,
// including nowhere in particular, which is half the point. Walking around
// must never change what you get notified about, so the two never share a
// table.
//
// Honesty about liveness: there is no socket under this. Your own square moves
// at frame rate; everyone else's moves when the next poll lands (~25s) and
// glides there by CSS. "Live enough to feel inhabited" is the bar, and a Pi
// serving SQLite clears it at one small SELECT per open tab per half-minute.

export type PresenceView = {
  userId: string;
  username: string | null;
  displayUsername: string | null;
  x: number;
  y: number;
  status: string | null;
  updatedAt: string; // ISO
};

/** Stage px per second while a key is held. Crossing the whole map takes ~5s. */
const WALK_SPEED = 300;
/** Keep the square's centre this far inside the edges. */
const MARGIN = 10;
/** How long after the last step before the position is saved. */
const SAVE_AFTER_MS = 600;
/** How often everyone else's positions are re-fetched. */
const POLL_MS = 25_000;
/** The ring of not-yet-moved squares: cap what gets DRAWN (the count is exact). */
const RING_MAX = 28;

const clamp = (value: number, max: number) => Math.max(MARGIN, Math.min(max - MARGIN, value));

/** Is the key event aimed at something that takes text? Then it is not ours. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const handleOf = (person: { displayUsername: string | null; username: string | null }) =>
  person.displayUsername ?? person.username ?? "unknown";

export default function PresenceLayer({
  initialPeople,
  initialUnmoved,
  viewerId,
  viewerHandle,
  didPan,
  onWalk,
}: {
  initialPeople: PresenceView[];
  initialUnmoved: number;
  viewerId: string | null;
  viewerHandle: string;
  /** From useDragPan — a click that ends a map-drag must not follow a link. */
  didPan: () => boolean;
  /** Called each movement frame with the pan offset that would centre my
   *  square — the camera. The pan clamps and damps it; walking near the middle
   *  asks for ~0 and nothing visibly moves, which is the right feel. */
  onWalk?: (offsetX: number, offsetY: number) => void;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [unmoved, setUnmoved] = useState(initialUnmoved);

  const mine = initialPeople.find((person) => person.userId === viewerId) ?? null;
  // On the map at all, and where my square STARTED — movement after that is
  // painted straight to the element, never through state.
  const [spawned, setSpawned] = useState(mine !== null);
  const [spawnPoint] = useState(() => ({
    x: mine?.x ?? Math.round(STAGE_WIDTH / 2),
    y: mine?.y ?? Math.round(STAGE_HEIGHT / 2),
  }));
  const [myStatus, setMyStatus] = useState(mine?.status ?? null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAt, setEditorAt] = useState(spawnPoint);
  const [draft, setDraft] = useState("");

  const meRef = useRef<HTMLDivElement | null>(null);
  const pos = useRef({ ...spawnPoint });
  const saved = useRef({ ...spawnPoint });
  const keys = useRef(new Set<string>());
  const frame = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const spawnedRef = useRef(spawned);

  // The stage's box, for turning my stage position into a camera offset.
  // Measured when a walk starts rather than per frame — the walk loop already
  // dirties layout by writing left/top, and a synchronous rect read on top of
  // that would force a reflow every frame for a number that only changes on
  // window resize.
  const stageBox = useRef<{ width: number; height: number } | null>(null);
  const onWalkRef = useRef(onWalk);
  useEffect(() => {
    onWalkRef.current = onWalk;
  }, [onWalk]);

  const paint = useCallback(() => {
    const el = meRef.current;
    if (!el) return;
    // World pixels: the layer lives on the fixed 1440x640 world and the
    // world itself is what scales, so a position is just its coordinate.
    el.style.left = `${pos.current.x}px`;
    el.style.top = `${pos.current.y}px`;
  }, []);

  const persist = useCallback(
    (body: Record<string, unknown>) => {
      void fetch(communityApiUrl("/api/community/presence"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // Survives the tab closing mid-save — the last step still lands.
        keepalive: true,
      }).catch(() => undefined);
      saved.current = { ...pos.current };
    },
    [],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const dx = pos.current.x - saved.current.x;
      const dy = pos.current.y - saved.current.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      persist({ x: Math.round(pos.current.x), y: Math.round(pos.current.y) });
    }, SAVE_AFTER_MS);
  }, [persist]);

  // ── Walking ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewerId) return; // signed out: the layer only watches
    // The Set itself never repoints; captured so the cleanup satisfies lint.
    const pressed = keys.current;

    const step = (now: number, previous: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      let dx = 0;
      let dy = 0;
      if (keys.current.has("a")) dx -= 1;
      if (keys.current.has("d")) dx += 1;
      if (keys.current.has("w")) dy -= 1;
      if (keys.current.has("s")) dy += 1;
      if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy);
        pos.current.x = clamp(pos.current.x + (dx / length) * WALK_SPEED * dt, STAGE_WIDTH);
        pos.current.y = clamp(pos.current.y + (dy / length) * WALK_SPEED * dt, STAGE_HEIGHT);
        paint();

        // Point the camera at where I am now.
        const box = stageBox.current;
        if (box && onWalkRef.current) {
          onWalkRef.current(
            box.width / 2 - (pos.current.x / STAGE_WIDTH) * box.width,
            box.height / 2 - (pos.current.y / STAGE_HEIGHT) * box.height,
          );
        }
      }
      if (keys.current.size > 0) {
        frame.current = requestAnimationFrame((next) => step(next, now));
      } else {
        frame.current = null;
        scheduleSave();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "w" || key === "a" || key === "s" || key === "d") {
        // First step births the square at the core, mid-keypress.
        if (!spawnedRef.current) {
          spawnedRef.current = true;
          setSpawned(true);
        }
        keys.current.add(key);
        if (frame.current === null) {
          // Fresh walk: re-measure the stage (the layer spans it exactly).
          // meRef can be null for one frame on first spawn; the next keydown
          // or the spawn effect below fills it in.
          const surface = meRef.current?.parentElement;
          if (surface) {
            const rect = surface.getBoundingClientRect();
            if (rect.width > 0) stageBox.current = { width: rect.width, height: rect.height };
          }
          frame.current = requestAnimationFrame((now) => step(now, now));
        }
      } else if (key === "enter") {
        if (!spawnedRef.current) {
          spawnedRef.current = true;
          setSpawned(true);
        }
        setEditorAt({ x: pos.current.x, y: pos.current.y });
        setDraft(myStatus ?? "");
        setEditorOpen(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
    };
    const onBlur = () => keys.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pressed.clear();
    };
  }, [viewerId, paint, scheduleSave, myStatus]);

  // The square exists the moment React mounts it — put it where the walk
  // already is, since keys may have been held through the state flip. Also the
  // first chance to measure the stage for the camera.
  useEffect(() => {
    if (!spawned) return;
    paint();
    const surface = meRef.current?.parentElement;
    if (surface) {
      const rect = surface.getBoundingClientRect();
      if (rect.width > 0) stageBox.current = { width: rect.width, height: rect.height };
    }
  }, [spawned, paint]);

  // A final flush when the tab goes — keepalive lets it outlive the page.
  useEffect(() => {
    if (!viewerId) return;
    const flush = () => {
      const dx = pos.current.x - saved.current.x;
      const dy = pos.current.y - saved.current.y;
      if (!spawnedRef.current || Math.abs(dx) + Math.abs(dy) < 1) return;
      persist({ x: Math.round(pos.current.x), y: Math.round(pos.current.y) });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [viewerId, persist]);

  // ── Everyone else, every so often ─────────────────────────────────────────
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(communityApiUrl("/api/community/presence"), {
          ...COMMUNITY_FETCH_INIT,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          people?: PresenceView[];
          unmoved?: number;
        };
        if (Array.isArray(payload.people)) setPeople(payload.people);
        if (typeof payload.unmoved === "number") setUnmoved(payload.unmoved);
      } catch {
        // A missed poll is nothing; the next one is 25s away.
      }
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const saveStatus = () => {
    const next = draft.trim().replace(/\s+/g, " ").slice(0, STATUS_MAX);
    setMyStatus(next.length > 0 ? next : null);
    setEditorOpen(false);
    persist({
      x: Math.round(pos.current.x),
      y: Math.round(pos.current.y),
      status: next,
    });
  };

  const others = people.filter((person) => person.userId !== viewerId);
  const total = people.length + unmoved + (spawned && !mine ? 1 : 0);

  // The not-yet-moved, ringed loosely around the core. Deterministic — a
  // cluster that reshuffles on every poll would read as people moving.
  const ring = Math.min(unmoved, RING_MAX);
  const cx = STAGE_WIDTH / 2;
  const cy = STAGE_HEIGHT / 2;

  return (
    <div className={styles.presenceLayer} aria-hidden={others.length === 0 && !spawned && unmoved === 0}>
      {/* The ring of accounts that have never walked. */}
      {Array.from({ length: ring }, (_, index) => {
        const angle = index * 2.399963; // golden angle — even without being a grid
        const rx = 150 + 34 * (index % 3);
        const ry = 190 + 30 * ((index * 7) % 3);
        return (
          <span
            key={`seed-${index}`}
            className={styles.presenceSeed}
            style={{
              left: `${cx + Math.cos(angle) * rx}px`,
              top: `${cy + Math.sin(angle) * ry}px`,
            }}
          />
        );
      })}
      {unmoved > 0 && (
        <span
          className={styles.presenceCount}
          style={{ left: `${cx}px`, top: `${cy + 150}px` }}
        >
          {unmoved} at the core · {total} member{total === 1 ? "" : "s"}
        </span>
      )}

      {/* Everyone who has walked somewhere. Position changes glide by CSS, so
          a poll landing reads as people strolling rather than teleporting. */}
      {others.map((person) => {
        const handle = handleOf(person);
        const dot = (
          <>
            <span className={styles.presenceSquare} />
            <span className={styles.presenceName}>{handle}</span>
            {person.status && <span className={styles.presenceStatus}>{person.status}</span>}
          </>
        );
        const style = { left: `${person.x}px`, top: `${person.y}px` };
        const title = `${handle}${person.status ? ` — ${person.status}` : ""} · ${formatSince(person.updatedAt)}`;
        return person.username ? (
          <Link
            key={person.userId}
            href={`/community/u/${person.username}`}
            className={styles.presencePerson}
            style={style}
            title={title}
            // An anchor is natively draggable, and a native drag starting on a
            // dot would steal the map pan mid-gesture (the deck dock's <img>
            // taught this lesson once already).
            draggable={false}
            onClick={(event) => {
              if (didPan()) event.preventDefault();
            }}
          >
            {dot}
          </Link>
        ) : (
          <span key={person.userId} className={styles.presencePerson} style={style} title={title}>
            {dot}
          </span>
        );
      })}

      {/* Me. Painted imperatively while walking; React only mounts it. */}
      {spawned && viewerId && (
        <div
          ref={meRef}
          className={styles.presencePerson}
          data-me="true"
          style={{ left: `${spawnPoint.x}px`, top: `${spawnPoint.y}px` }}
          title="wasd to walk · enter to say something"
          onClick={() => {
            if (didPan()) return;
            setEditorAt({ x: pos.current.x, y: pos.current.y });
            setDraft(myStatus ?? "");
            setEditorOpen(true);
          }}
        >
          <span className={styles.presenceSquare} />
          <span className={styles.presenceName}>{viewerHandle}</span>
          {myStatus && <span className={styles.presenceStatus}>{myStatus}</span>}
        </div>
      )}

      {/* The status editor, floating at the square that asked for it. */}
      {editorOpen && (
        <div
          className={styles.statusEditor}
          style={{ left: `${editorAt.x}px`, top: `${editorAt.y}px` }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={STATUS_MAX}
            placeholder="say something…"
            aria-label="Your status"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveStatus();
              if (event.key === "Escape") setEditorOpen(false);
            }}
            onBlur={() => setEditorOpen(false)}
          />
          <span>↵ save · esc</span>
        </div>
      )}
    </div>
  );
}
