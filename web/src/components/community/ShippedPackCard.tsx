"use client";

import { useSyncExternalStore } from "react";
import { livePresets } from "@/lib/presets";
import { packInstallUrl, packZipPath, type PatternPack } from "@/lib/packs";
import { useDeviceHost } from "@/lib/community/deviceHost";
import PatternCanvas from "./PatternCanvas";
import styles from "./Community.module.css";

// The pack that ships with Patternflow, on the shelf beside the decks people
// made.
//
// It looks like a deck card because it is the same kind of object to a
// visitor — an ordered set you put on a board — but it is not one: no owner,
// no detail page, no database row. So it carries its own actions instead of
// being a link to somewhere that does not exist, and it is labelled as
// shipped rather than published so it never reads as someone's deck.
//
// Previews come from the JS presets, not the pack. The pack holds compiled
// modules a browser cannot run; each one records the pattern number it was
// built from (see make_pack.py) and that is what these look up. A number with
// no matching preset renders nothing rather than a wrong pattern.

/** Same five-cell strip as DeckCard, so the two line up on the shelf. */
const STRIP_CELLS = 5;

export default function ShippedPackCard({ pack }: { pack: PatternPack }) {
  // The board has to be told an absolute address to fetch the pack from, and
  // the right one is wherever this page is being served from — the site and
  // the community are separate deployments that both carry /public.
  //
  // The origin is a browser value with no server equivalent, which is what
  // the third argument is for: the server (and the first client render) get
  // undefined and fall back to the production origin, so the two agree and
  // nothing re-renders. The subscribe callback is a no-op because an origin
  // cannot change without a navigation.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => undefined,
  );

  // Same remembered address every other handoff uses. This card used to hard-
  // code patternflow.local, which is the one name a phone on Android cannot
  // resolve — and this is the card a new owner reaches first, with no account
  // and nothing on the board yet. Telling us the IP once, anywhere, should be
  // enough for all of them.
  const { deviceHost, changeDeviceHost } = useDeviceHost();

  const shown = pack.order
    .slice(0, STRIP_CELLS - 1)
    .map((slug) => {
      const num = pack.presets[slug];
      const preset = num === undefined ? undefined : livePresets.find((p) => p.num === num);
      return preset ? { slug, code: preset.code, title: preset.name } : null;
    })
    .filter((entry): entry is { slug: string; code: string; title: string } => entry !== null);

  const more = pack.patterns - shown.length;
  const blanks = Math.max(0, STRIP_CELLS - shown.length - (more > 0 ? 1 : 0));

  return (
    <div className={styles.deckCard}>
      <div className={styles.deckStrip}>
        {shown.map((entry) => (
          <PatternCanvas
            key={entry.slug}
            code={entry.code}
            title={entry.title}
            className={styles.deckStripSlot}
          />
        ))}
        {more > 0 && <span className={styles.deckStripMore}>+{more}</span>}
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${index}`} className={styles.deckStripBlank} aria-hidden="true" />
        ))}
      </div>

      <div className={styles.deckCardMeta}>
        <span className={styles.deckCardTitleRow}>
          <span className={styles.deckCardTitle}>{pack.name}</span>
          <span className={styles.deckCardSlots}>{pack.patterns} slots</span>
          <span className={styles.visChip}>shipped</span>
          <span className={styles.deckCardUser}>{pack.publisher}</span>
        </span>

        <span className={styles.deckCardDesc}>
          The set a board arrives with. Install it on a device with nothing on it yet, or after
          a wipe — no account, no build queue.
        </span>

        <span className={styles.deckCardStats}>
          <span>{(pack.bytes / 1024).toFixed(0)} KB</span>
          <span>{pack.licenses.join(", ")}</span>
        </span>
      </div>

      <div className={styles.packActions}>
        {/* Top-level navigation to http from an https page is allowed (the
            firmware update flow relies on the same thing); it is only
            SUBRESOURCE loads that get blocked. The board's page then fetches
            the pack back over https and posts it to the device itself. */}
        <a
          className={styles.btnPrimary}
          href={packInstallUrl(pack, deviceHost.trim() || "patternflow.local", origin)}
        >
          Install to my board
        </a>
        <a className={styles.btn} href={packZipPath(pack)} download>
          Download .zip
        </a>
      </div>

      <span className={styles.packHint}>
        Device address:{" "}
        <input
          type="text"
          value={deviceHost}
          onChange={(event) => changeDeviceHost(event.target.value)}
          spellCheck={false}
          aria-label="Device address"
          style={{
            font: "inherit",
            width: "16ch",
            padding: "1px 6px",
            border: "1px solid var(--pf-rule, #D9D1C0)",
            background: "transparent",
            color: "inherit",
          }}
        />{" "}
        (Android can’t resolve <code>.local</code> — use the IP from the device’s NETWORK
        screen, hold K2.) Or download the .zip and drop it on your device’s Patterns page —
        same result.
      </span>
    </div>
  );
}
