"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import PatternCanvas from "./PatternCanvas";
import type { PatternCardItem } from "./PatternCard";
import styles from "./Community.module.css";

// The marquee picker.
//
// Deliberately not a drag surface. The dock is dragged because it is on every
// page and you are arranging it while doing something else; this is a page you
// open on purpose, four items long, edited once a week — buttons say what they
// do and work on a phone, which a drag target here would not.
//
// Nothing saves until Save is pressed, because the marquee is the front page
// and a half-finished arrangement should not be live while somebody thinks.

/** Panels across the top of /community. Mirrors MARQUEE_MAX on the route. */
const MARQUEE_MAX = 5;

export default function FeaturedEditor({
  initial,
  initialIds,
  candidates,
}: {
  initial: PatternCardItem[];
  initialIds: string[];
  candidates: PatternCardItem[];
}) {
  const router = useRouter();

  // Keyed by id so the two lists can be rendered from one source of truth.
  const known = new Map<string, PatternCardItem>();
  for (const item of [...initial, ...candidates]) known.set(item.id, item);

  const [chosen, setChosen] = useState<string[]>(initial.map((item) => item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    chosen.length !== initialIds.length || chosen.some((id, index) => id !== initialIds[index]);

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

  return (
    <div className={styles.decksPage}>
      <div className={styles.sectionHead}>
        <h1 className={styles.sectionTitle}>The marquee</h1>
        <span className={styles.sectionLede}>
          The patterns across the top of /community, in this order. Leave it empty and the front
          page falls back to the most-liked patterns on its own.
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
                  <span className={styles.deckSlotIndex}>{index + 1}</span>
                  <span className={styles.canvasWell}>
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
          <span className={styles.sectionKicker}>Recent patterns</span>
          <span className={styles.sectionLede}>
            Newest first. Only public patterns can go up — the marquee is the front page.
          </span>
        </div>

        <div className={styles.profileGrid}>
          {candidates.map((item) => {
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
                      LIK {String(item.likeCount).padStart(2, "0")}
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
      </section>
    </div>
  );
}
