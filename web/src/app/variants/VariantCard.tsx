"use client";

import { useEffect, useState } from "react";
import { useDeviceHost } from "@/lib/community/deviceHost";
import styles from "./Variants.module.css";
import type { Variant } from "./variants-data";

// One shelf entry.
//
// Three things on the face of it — name, who made it, install — because that
// is the whole decision for most people. Everything else sits behind Details,
// available and out of the way.
//
// Two things need the browser, which is why this is a client component:
//
// 1. **Which version is current.** A pinned copy is current until its
//    maintainer cuts a release, and then it is quietly a month old. So the
//    card reads the latest tag from GitHub, and reads a flasher manifest for
//    a firmware that publishes one. In the visitor's browser rather than at
//    build time, because a static page would freeze the answer at deploy.
//
// 2. **The install link.** The device cannot fetch over the internet: TLS
//    needs tens of KB of heap and the board has single digits spare. So the
//    panel's OWN /update page takes a `?src=` URL and the browser, which can
//    reach both, does the download and the POST. That makes this a plain link
//    to the panel, not a request from here — mixed content would block that
//    anyway, https page to http board.
//
// Core is the cheapest entry on the shelf: its images already sit under
// /flash/bin with CORS headers, so its install button needs nothing new.

type Props = { variant: Variant };

type Manifest = {
  version?: string;
  builds?: { parts?: { path?: string; offset?: number }[] }[];
};

// The app image is the part at 0x10000; the other three are bootloader,
// partitions and boot_app0, which /update does not rewrite.
function appImagePath(m: Manifest): string | null {
  return m.builds?.[0]?.parts?.find((p) => p.offset === 65536)?.path ?? null;
}

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
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);
  const [fromManifest, setFromManifest] = useState<{
    version: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!v.github) return;
    let live = true;
    fetch(`https://api.github.com/repos/${v.github}/releases/latest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Silence is the right failure: rate limit, no releases yet, or no
        // network. None should become an error on a page describing firmwares.
        if (live && d?.tag_name) setLatest(String(d.tag_name));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [v.github]);

  useEffect(() => {
    if (!v.manifest) return;
    let live = true;
    fetch(v.manifest, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Manifest | null) => {
        const path = m ? appImagePath(m) : null;
        if (!live || !m?.version || !path) return;
        setFromManifest({
          version: m.version,
          // Absolute: the panel's own page is what fetches this, and a
          // relative path there would mean the panel itself.
          url: new URL(`/flash/${path}`, window.location.origin).toString(),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [v.manifest]);

  const image = fromManifest ?? v.hosted ?? null;
  const host = deviceHost.trim() || "patternflow.local";
  const installUrl = image
    ? `http://${host}/update?src=${encodeURIComponent(image.url)}`
    : null;

  // Only a pinned copy can fall behind. A manifest is always the current answer.
  const stale = Boolean(
    v.hosted && !fromManifest && latest && latest !== v.hosted.version,
  );

  return (
    <li id={v.id} className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.name}>{v.name}</h3>
        {v.status !== "available" && (
          <span className={styles.status} data-s={v.status}>
            {v.status === "building" ? "in progress" : "unclaimed"}
          </span>
        )}
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

      <div className={styles.actions}>
        {installUrl && !stale ? (
          <a className={styles.install} href={installUrl}>
            Install to my panel
          </a>
        ) : v.releases ? (
          <a
            className={styles.install}
            href={v.releases}
            target="_blank"
            rel="noopener"
          >
            Download
          </a>
        ) : null}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Less" : "Details"}
        </button>
      </div>

      {open && (
        <div className={styles.details}>
          <p className={styles.summary}>{v.summary}</p>

          <ul className={styles.adds}>
            {v.adds.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>

          {(image || latest) && (
            <p className={styles.versions}>
              {image && (
                <span>
                  <span className={styles.vLabel}>here</span> {image.version}
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

          <div className={styles.detailLinks}>
            {v.releases && (
              <a href={v.releases} target="_blank" rel="noopener">
                Releases
              </a>
            )}
            {v.source && (
              <a href={v.source} target="_blank" rel="noopener">
                Source
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
