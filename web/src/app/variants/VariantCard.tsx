"use client";

import { useEffect, useState } from "react";
import { useDeviceHost } from "@/lib/community/deviceHost";
import styles from "./Variants.module.css";
import type { Variant } from "./variants-data";

// One shelf entry.
//
// Two things here need the browser, which is why this is a client component:
//
// 1. **The latest release.** A copy hosted here is current until its
//    maintainer cuts a release, and then it is quietly a month old. So the
//    page asks GitHub what the newest tag is and says when the two differ.
//    Read in the visitor's browser rather than at build time — a static page
//    would freeze the answer at deploy — and unauthenticated, so the rate
//    limit is per visitor rather than shared.
//
// 2. **The install link.** The device cannot fetch over the internet: TLS
//    needs tens of KB of heap and the board has single digits spare. So the
//    panel's OWN /update page takes a `?src=` URL and the browser, which can
//    reach both, does the download and the POST. That makes this a plain
//    link to the panel, not a request from here — mixed content would block
//    that anyway, https page to http board.

type Props = { variant: Variant };

const STATUS_LABEL: Record<Variant["status"], string> = {
  available: "available",
  building: "in progress",
  proposed: "unclaimed",
};

function Person({ name, href }: { name?: string; href?: string }) {
  if (!name) return <>someone</>;
  return href ? (
    <a href={href} target="_blank" rel="noopener">
      {name}
    </a>
  ) : (
    <>{name}</>
  );
}

export default function VariantCard({ variant: v }: Props) {
  const { deviceHost, changeDeviceHost } = useDeviceHost();
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!v.github) return;
    let live = true;
    fetch(`https://api.github.com/repos/${v.github}/releases/latest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Silence is the right failure: rate limit, no releases yet, or no
        // network. None of those should become an error on a page whose job
        // is to describe firmwares.
        if (live && d?.tag_name) setLatest(String(d.tag_name));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [v.github]);

  const host = deviceHost.trim() || "patternflow.local";
  const installUrl = v.hosted
    ? `http://${host}/update?src=${encodeURIComponent(v.hosted.url)}`
    : null;

  const stale = Boolean(v.hosted && latest && latest !== v.hosted.version);

  return (
    <li id={v.id} className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.name}>{v.name}</h3>
        <span className={styles.status} data-s={v.status}>
          {STATUS_LABEL[v.status]}
        </span>
      </div>

      {/* On an unclaimed entry this must never read as a credit. Naming
          somebody as maintainer of firmware they have not agreed to build is
          the one way this page could do real harm to a person. */}
      <p className={styles.by}>
        {v.status === "proposed" ? (
          v.maintainer ? (
            <>
              suggested to <Person name={v.maintainer} href={v.maintainerHref} />{" "}
              &mdash; not yet agreed
            </>
          ) : (
            <>nobody has taken this on</>
          )
        ) : (
          <>
            by <Person name={v.maintainer} href={v.maintainerHref} />
          </>
        )}
      </p>

      <p className={styles.summary}>{v.summary}</p>

      <div className={styles.diff}>
        <ul className={styles.adds}>
          {v.adds.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      {(v.hosted || latest) && (
        <p className={styles.versions}>
          {v.hosted && (
            <span>
              <span className={styles.vLabel}>here</span> {v.hosted.version}
            </span>
          )}
          {latest && (
            <span>
              <span className={styles.vLabel}>latest</span> {latest}
            </span>
          )}
          {stale && (
            <span className={styles.vStale}>
              newer release &mdash; install from the maintainer
            </span>
          )}
        </p>
      )}

      <div className={styles.actions}>
        {installUrl && !stale && (
          <a className={styles.install} href={installUrl}>
            Install to my panel
          </a>
        )}
        {v.releases && (
          <a
            className={styles.secondary}
            href={v.releases}
            target="_blank"
            rel="noopener"
          >
            {stale || !v.hosted ? "Download" : "Releases"}
          </a>
        )}
        {v.source && (
          <a
            className={styles.secondary}
            href={v.source}
            target="_blank"
            rel="noopener"
          >
            Source
          </a>
        )}
      </div>

      {installUrl && (
        <label className={styles.hostRow}>
          <span>your panel</span>
          <input
            type="text"
            value={deviceHost}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => changeDeviceHost(e.target.value)}
            placeholder="patternflow.local"
          />
        </label>
      )}

      <p className={styles.note}>{v.note}</p>
    </li>
  );
}
