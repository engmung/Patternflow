'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import PhotoLightbox from './InsideGlobe/PhotoLightbox';
import type { BuildCase, CaseId } from './build-cases-data';
import styles from './CasePicker.module.css';

interface CasePickerProps {
  cases: BuildCase[];
  selected: BuildCase;
  onSelect: (id: CaseId, interaction: 'click' | 'key') => void;
  onLinkOpen?: (caseId: CaseId, target: string) => void;
  /** A tab is about to be picked (pointer over it, or focus on it): time to
      start loading that case's model. */
  onPrefetch?: (id: CaseId) => void;
  /** The body of content/build.md, shown above the switch. */
  lead?: string;
}

// Two photos on the card; the viewer has all of them. Two is what fits a phone
// at a height you can still read, and it keeps one of each where a case has
// both: a build, and a render or a view from behind.
const STRIP = 2;

// The case, four ways. A tablist rather than a row of toggles: the switch
// replaces the whole card below it, and arrow keys move along the four the
// way they do in any other tab set.
export default function CasePicker({
  cases,
  selected,
  onSelect,
  onLinkOpen,
  onPrefetch,
  lead,
}: CasePickerProps) {
  // The viewer belongs to the case it was opened on. A bare index would
  // outlive a switch (focus can still reach the tabs behind the viewer) and
  // point past the end of a case with fewer photos.
  const [viewer, setViewer] = useState<{ caseId: CaseId; index: number } | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, cases.findIndex((item) => item.id === selected.id));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = cases.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    // Home on the first tab or End on the last picks nothing new: no select,
    // as a click on the selected tab sends none.
    if (next !== index) onSelect(cases[next].id, 'key');
    tabRefs.current[next]?.focus();
  };

  const photos = selected.photos.slice(0, STRIP);
  const footnote = selected.readme ? selected.modelNote : selected.guide;
  const panelId = 'build-case-panel';

  return (
    <div className={`pf-block ${styles.picker}`}>
      <span className="pf-kicker">The case — four ways to make it</span>
      {lead && lead.trim().length > 0 && (
        <div className={`pf-prose ${styles.lead}`}>
          <ReactMarkdown>{lead}</ReactMarkdown>
        </div>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Case" onKeyDown={handleKeyDown}>
        {cases.map((item, tabIndex) => {
          const isSelected = item.id === selected.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[tabIndex] = node;
              }}
              type="button"
              role="tab"
              id={`build-case-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => {
                if (!isSelected) onSelect(item.id, 'click');
              }}
              // A pointer on its way to a tab, or keyboard focus on one, is
              // most of a second's notice: enough to have the model in hand
              // by the time the preview is told to show it.
              onPointerEnter={() => {
                if (!isSelected) onPrefetch?.(item.id);
              }}
              onFocus={() => {
                if (!isSelected) onPrefetch?.(item.id);
              }}
            >
              <span className={styles.tabName}>{item.tab}</span>
              <span className={styles.tabMethod}>{item.method}</span>
            </button>
          );
        })}
      </div>

      <div
        className={styles.card}
        role="tabpanel"
        id={panelId}
        aria-labelledby={`build-case-tab-${selected.id}`}
      >
        {/* Each photo grows by its own width-to-height ratio from a zero
            basis, so a portrait and a landscape shot end up the same height
            and fill the row together, whatever the card's width. */}
        <div className={styles.photos}>
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.src}
              type="button"
              className={styles.photo}
              style={{
                flexGrow: photo.width / photo.height,
                aspectRatio: `${photo.width} / ${photo.height}`,
              }}
              onClick={() => setViewer({ caseId: selected.id, index: photoIndex })}
            >
              <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 900px) 70vw, 30vw" />
            </button>
          ))}
        </div>
        <div className={styles.photoMeta}>
          <span>{selected.credit}</span>
          {selected.photos.length > photos.length && (
            <button type="button" onClick={() => setViewer({ caseId: selected.id, index: 0 })}>
              All {selected.photos.length} photos
            </button>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.head}>
            <h3 className={styles.name}>{selected.name}</h3>
            <span className={styles.kind}>{selected.kind === 'official' ? 'Official' : 'Community remix'}</span>
          </div>
          <p className={styles.summary}>{selected.summary}</p>

          {/* A remix is built from its README, so that comes first, ahead of
              the facts below — which are copied from it, not a second guide. */}
          {selected.readme && (
            <div className={styles.readme}>
              <a
                href={selected.readme}
                target="_blank"
                rel="noreferrer"
                onClick={() => onLinkOpen?.(selected.id, 'README.md')}
              >
                Read its README on GitHub ↗
              </a>
              <p>{selected.guide}</p>
            </div>
          )}

          <dl className={styles.facts}>
            <div>
              <dt>By</dt>
              <dd>
                {selected.author.href ? (
                  <a href={selected.author.href} target="_blank" rel="noreferrer">
                    {selected.author.name}
                  </a>
                ) : (
                  selected.author.name
                )}
                {selected.author.note && <span className={styles.note}>, {selected.author.note}</span>}
              </dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{selected.material}</dd>
            </div>
            <div>
              <dt>Fits</dt>
              <dd>{selected.fits}</dd>
            </div>
            <div>
              <dt>Make</dt>
              <dd>{selected.make}</dd>
            </div>
            <div>
              <dt>Also needs</dt>
              <dd>{selected.parts}</dd>
            </div>
            <div>
              <dt>Verified</dt>
              <dd>{selected.verified}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{selected.license}</dd>
            </div>
          </dl>

          <p className={styles.caution}>
            <strong>Check your panel first</strong>
            <span>
              {selected.caution}{' '}
              <a
                href={selected.cautionHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => onLinkOpen?.(selected.id, 'caution')}
              >
                How to check ↗
              </a>
            </span>
          </p>

          {/* The official case's place in the build guide; for a remix that
              is said by its README link above, and this line says instead what
              the 3D view of it is made from. */}
          {footnote && <p className={styles.guide}>{footnote}</p>}
        </div>

        <div className={styles.links}>
          {selected.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => onLinkOpen?.(selected.id, link.target)}
            >
              <strong>{link.label}</strong>
              <span>{link.target} ↗</span>
            </a>
          ))}
        </div>
      </div>

      {viewer !== null && viewer.caseId === selected.id && (
        <PhotoLightbox
          images={selected.photos.map(({ src, alt }) => ({ src, alt }))}
          index={viewer.index}
          onIndexChange={(index) => setViewer({ caseId: selected.id, index })}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
