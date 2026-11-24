"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import PhotoLightbox from "@/components/sections/InsideGlobe/PhotoLightbox";
import {
  formatBuildDate,
  orderedBuilds,
  type Build,
} from "@/components/sections/InsideGlobe/builds";
import styles from "./SdfPage.module.css";

const Globe = dynamic(() => import("@/components/sections/InsideGlobe/Globe"), {
  ssr: false,
  loading: () => <div className={styles.globeFallback} aria-hidden="true" />,
});

export default function SdfGlobe() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const selected: Build | null = useMemo(
    () => orderedBuilds.find((b) => b.id === selectedId) ?? null,
    [selectedId],
  );

  const selectedIndex = useMemo(
    () => (selected ? orderedBuilds.findIndex((b) => b.id === selected.id) : -1),
    [selected],
  );

  const step = (delta: number) => {
    if (selectedIndex === -1) return;
    const next = (selectedIndex + delta + orderedBuilds.length) % orderedBuilds.length;
    setSelectedId(orderedBuilds[next].id);
    setLightboxIdx(null);
  };

  return (
    <div className={styles.globeWrap}>
      <div className={styles.globeStage}>
        <Globe
          entries={orderedBuilds}
          selectedBuildId={selectedId}
          onSelectBuild={(id) => {
            setSelectedId(id);
            setLightboxIdx(null);
          }}
        />
      </div>

      {selected ? (
        <div className={styles.pinDetail}>
          <div className={styles.pinHead}>
            <div>
              <div className={styles.pinLocation}>
                {selected.location.label} · {formatBuildDate(selected.date)}
              </div>
              <h3 className={styles.pinTitle}>{selected.title}</h3>
              <div className={styles.pinMaker}>{selected.maker}</div>
            </div>
            <div className={styles.pinNav}>
              <button
                type="button"
                onClick={() => step(-1)}
                className={styles.pinNavBtn}
                aria-label="Previous"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className={styles.pinNavBtn}
                aria-label="Next"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className={styles.pinNavBtn}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <p className={styles.pinDesc}>{selected.description}</p>

          {selected.images && selected.images.length > 0 && (
            <div className={styles.pinThumbs}>
              {selected.images.slice(0, 3).map((img, i) => (
                <button
                  key={img.src}
                  type="button"
                  className={styles.pinThumbBtn}
                  onClick={() => setLightboxIdx(i)}
                  aria-label={img.alt}
                >
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes="(max-width: 820px) 30vw, 180px"
                    className={styles.figureImg}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className={styles.globeHint}>핀을 눌러 사례 보기</p>
      )}

      {selected?.images && lightboxIdx !== null && (
        <PhotoLightbox
          images={selected.images}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onIndexChange={(next) => setLightboxIdx(next)}
        />
      )}
    </div>
  );
}
