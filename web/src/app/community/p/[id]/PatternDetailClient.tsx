"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import SandboxPreview from "@/components/community/SandboxPreview";
import CommentSection, { type CommentView } from "@/components/community/CommentSection";
import LinkedText from "@/components/community/LinkedText";
import { formatDate } from "@/components/community/PatternCard";
import LikeButton from "@/components/community/LikeButton";
import AddHeaderModal from "@/components/community/AddHeaderModal";
import EditDetailsModal from "@/components/community/EditDetailsModal";
import ReportModal from "@/components/community/ReportModal";
import DeletePatternButton from "@/components/community/DeletePatternButton";
import BuildFirmwareModal from "@/components/community/BuildFirmwareModal";
import SendModuleModal from "@/components/community/SendModuleModal";
import { buildsConfigured } from "@/lib/community/apiBase";
import {
  COLLECTION_EVENT,
  deckAdd,
  deckHas,
  deckRemove,
  savedAdd,
  savedHas,
  savedRemove,
} from "@/lib/community/deck";
import { knobSetupFromCode } from "@/lib/community/knobs";
import { describeMatrixShape, matrixFromCode } from "@/lib/patternMatrix";
import { writeLabHandoff } from "@/lib/community/handoff";
import { downloadPatternHeader, downloadPatternJs } from "@/lib/community/download";
import { communityPatternUrl } from "@/lib/community/license";
import type { Provenance } from "@/lib/community/provenance";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "@/components/community/Community.module.css";

// Anyone can edit and run the code right here — the sandbox iframe is the
// boundary that makes that safe. Saving (fork-publishing) happens in Pattern
// Lab via the sessionStorage handoff.

export type PortView = {
  id: string;
  handle: string | null;
  note: string | null;
  stale: boolean;
  createdAt: string; // ISO
  mine: boolean;
  pinned: boolean;
  effective: boolean;
};

export type PatternView = {
  id: string;
  title: string;
  description: string | null;
  code: string;
  /** The EFFECTIVE header — the author's own, or the winning community port.
   *  Everything that builds, downloads or collects reads this one. */
  codeCpp: string | null;
  /** The author's own header only — what their Update/Remove modal edits. */
  ownCpp: string | null;
  /** Porter handle when the effective header is a community port. */
  portedBy: string | null;
  /** Every port on this pattern, oldest first. */
  ports: PortView[];
  license: string;
  /** Author-stated creation date (YYYY-MM-DD), when it differs from the upload. */
  madeOn: string | null;
  /** Author's declaration of how it was made, when they gave one. */
  madeHow: string | null;
  /** "public" | "private" — the page is already gated server-side. */
  visibility: string;
  provenance: Provenance;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  parent: {
    id: string;
    title: string;
    handle: string | null;
    license: string;
    visibility: string;
  } | null;
  likeCount: number;
  forkCount: number;
};

export default function PatternDetailClient({
  pattern,
  comments,
  inDecks = [],
  initialKnobs,
  liked = false,
  isOwner = false,
}: {
  pattern: PatternView;
  comments: CommentView[];
  /** Public decks that picked this pattern up. */
  inDecks?: { id: string; title: string }[];
  initialKnobs?: number[];
  liked?: boolean;
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(pattern.code);
  const [running, setRunning] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<"js" | "h">("js");
  const [headerModalOpen, setHeaderModalOpen] = useState(false);
  const [portModalOpen, setPortModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  // Deck and saved membership are shared state (header chip, other tabs), so read
  // from the store and refreshed on the change event rather than mirrored.
  const [inDeck, setInDeck] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [collectNote, setCollectNote] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      setInDeck(deckHas(pattern.id));
      setIsSaved(savedHas(pattern.id));
    };
    sync();
    window.addEventListener(COLLECTION_EVENT, sync);
    return () => window.removeEventListener(COLLECTION_EVENT, sync);
  }, [pattern.id]);
  const toggleDeck = () => {
    if (!pattern.codeCpp) return;
    if (inDeck) {
      deckRemove(pattern.id);
      setCollectNote(null);
      return;
    }
    // The published source, not the in-page edit: the deck holds the pattern
    // as it exists, and the slot should look like what everyone else sees.
    const added = deckAdd({
      patternId: pattern.id,
      title: pattern.title,
      code: pattern.codeCpp,
      js: pattern.code,
    });
    setCollectNote(added.ok ? null : (added.reason ?? null));
  };

  // Saving works with or without a firmware header: it is a bookmark, not a
  // build slot. The stored `code` is only used when a saved pattern is later
  // promoted into the deck, which the deck itself re-checks.
  const toggleSaved = () => {
    if (isSaved) {
      savedRemove(pattern.id);
      return;
    }
    savedAdd({
      patternId: pattern.id,
      title: pattern.title,
      code: pattern.codeCpp ?? "",
      js: pattern.code,
    });
    setCollectNote(null);
  };
  const [saveError, setSaveError] = useState<string | null>(null);

  const knobSetup = useMemo(() => knobSetupFromCode(pattern.code), [pattern.code]);

  // The frame is shown as it looks on an upright device, so landscape patterns
  // get a quarter-turn and portrait ones are left alone. Keyed off the edited
  // code, so changing the @matrix line in the editor flips the preview at once.
  const rotatePreview = useMemo(
    () => describeMatrixShape(matrixFromCode(code)) === "landscape",
    [code],
  );

  // Use custom initial knobs passed from feed card if present, otherwise default setup
  const [knobValues, setKnobValues] = useState<number[]>(() => {
    if (initialKnobs && initialKnobs.length === knobSetup.values.length) {
      return initialKnobs;
    }
    return knobSetup.values;
  });

  const edited = code !== pattern.code;

  const openInLab = () => {
    writeLabHandoff({
      code,
      parentId: pattern.id,
      parentTitle: pattern.title,
      parentLicense: pattern.license,
    });
    captureEvent("community_open_in_lab", { pattern_id: pattern.id, edited });
    router.push("/pattern-lab?from=community");
  };

  // Downloads always carry the PUBLISHED source, never in-page edits: the
  // licence header credits this pattern's author, which is only true of what
  // they actually published. Edits belong in a fork, via Open in Pattern Lab.
  //
  // A fork's file also carries its upstream credit, matching the stored source.
  const downloadable = {
    ...pattern,
    basedOn: pattern.parent
      ? {
          title: pattern.parent.title,
          handle: pattern.parent.handle,
          url: communityPatternUrl(pattern.parent.id),
        }
      : null,
  };

  const downloadJs = () => {
    downloadPatternJs(downloadable, pattern.code);
    captureEvent("community_download", { pattern_id: pattern.id, kind: "js" });
  };

  const downloadHeader = () => {
    if (!pattern.codeCpp) return;
    downloadPatternHeader(downloadable, pattern.codeCpp);
    captureEvent("community_download", { pattern_id: pattern.id, kind: "h" });
  };

  // Owner editing their own pattern in place. Everyone else's edits stay local
  // until they publish a fork from Pattern Lab.
  const saveCode = async () => {
    setSavingCode(true);
    setSaveError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/patterns/${pattern.id}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSaveError(payload.error ?? "Could not save the code.");
        return;
      }
      captureEvent("community_edit_code", { pattern_id: pattern.id });
      router.refresh();
    } catch {
      setSaveError("Network error.");
    } finally {
      setSavingCode(false);
    }
  };

  return (
    <div className={styles.detailWrap}>
      <Link href="/community/patterns" className={styles.breadcrumb}>
        ← Patterns
      </Link>

      <div className={styles.detailLayout}>
        <div className={styles.detailLeftCol}>
          <div className={styles.matrixFrame}>
            <div className={rotatePreview ? styles.screenRotator : styles.screenUpright}>
              <SandboxPreview
                code={code}
                knobValues={knobValues}
                knobRanges={knobSetup.ranges}
                running={running}
                onStatus={(ok, error) => setRuntimeError(ok ? null : error ?? "Runtime error.")}
              />
            </div>
          </div>

          {runtimeError && <div className={styles.errorBox}>{runtimeError}</div>}

          <div className={styles.knobs}>
            {knobValues.map((value, index) => (
              <div key={index} className={styles.knobLine}>
                <span>{knobSetup.labels[index]}</span>
                <input
                  type="range"
                  min={knobSetup.ranges[index][0]}
                  max={knobSetup.ranges[index][1]}
                  step="0.001"
                  value={value}
                  aria-label={`${knobSetup.labels[index]} value`}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setKnobValues((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    );
                  }}
                />
                <span className={styles.knobValue}>{value.toFixed(3)}</span>
              </div>
            ))}
          </div>

          <div className={styles.actionRow}>
            <button type="button" className={styles.btn} onClick={() => setRunning((v) => !v)}>
              {running ? "Pause" : "Run"}
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={!edited}
              onClick={() => setCode(pattern.code)}
            >
              Reset code
            </button>
            <button type="button" className={styles.btnAccent} onClick={openInLab}>
              Open in Pattern Lab
            </button>
            {/* Only for patterns that ship a verified header — this is the
                zero-friction path: nothing to convert, nothing to install. */}
            {buildsConfigured() && pattern.codeCpp && (
              <button
                type="button"
                className={styles.btnPrimary}
                title="Compile a firmware image with this pattern and flash it over USB"
                onClick={() => setBuildOpen(true)}
              >
                ⚡ Flash to my board
              </button>
            )}
            {/* The common case: one pattern, onto the board, no USB. Builds a
                single .pfm and hands it to the device over Wi-Fi. */}
            {buildsConfigured() && pattern.codeCpp && (
              <button
                type="button"
                className={styles.btnAccent}
                title="Build this pattern as a loadable module and install it over Wi-Fi"
                onClick={() => setSendOpen(true)}
              >
                ↗ Send to my Patternflow
              </button>
            )}
            {/* Two different gestures. Saving is "I might want this", and has
                no limit. The deck is the short ordered list that becomes one
                build, so it is capped at what a build holds. */}
            <button
              type="button"
              className={styles.btn}
              title={isSaved ? "Remove from your saved patterns" : "Save for later — no limit"}
              onClick={toggleSaved}
            >
              {isSaved ? "★ Saved" : "☆ Save"}
            </button>
            {buildsConfigured() && pattern.codeCpp && (
              <button
                type="button"
                className={styles.btn}
                title="Put this in your deck; build the whole deck as loadable modules"
                onClick={toggleDeck}
              >
                {inDeck ? "✓ In deck" : "▦ Add to deck"}
              </button>
            )}
            {collectNote && <span className={styles.fieldHint}>{collectNote}</span>}
            {isOwner && edited && (
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={savingCode}
                onClick={() => void saveCode()}
              >
                {savingCode ? "Saving…" : "Save code"}
              </button>
            )}
          </div>

          {isOwner && edited && pattern.codeCpp && (
            <p className={styles.warnNote}>
              Saving detaches the firmware header — it was verified against the current code.
              Re-attach a fresh <code>.h</code> afterwards.
            </p>
          )}
          {saveError && <div className={styles.errorBox}>{saveError}</div>}
        </div>

        <div className={styles.editorWrap}>
          <div className={styles.codeTabs}>
            <button
              type="button"
              data-active={codeTab === "js"}
              onClick={() => setCodeTab("js")}
              title="The pattern source — edit it and the preview follows"
            >
              pattern.js
            </button>
            {pattern.codeCpp && (
              <button
                type="button"
                data-active={codeTab === "h"}
                onClick={() => setCodeTab("h")}
                title="Firmware header for the board (read-only)"
              >
                firmware.h
              </button>
            )}

            <span className={styles.codeTabSpacer} />

            {codeTab === "js" ? (
              <button
                type="button"
                className={styles.codeTabAction}
                onClick={downloadJs}
                title="Download the published .js with its licence header and credit baked in"
              >
                ↓ {edited ? "original .js" : ".js"}
              </button>
            ) : (
              <button
                type="button"
                className={styles.codeTabAction}
                onClick={downloadHeader}
                title="Download the .h with its licence header and credit baked in"
              >
                ↓ .h
              </button>
            )}
          </div>

          {/*
            Two editors, two React keys — deliberately NOT one editor swapping
            its content. Without distinct keys both branches occupy the same
            position in the tree, so React reuses a single Monaco instance and
            the header's text arrives through the JavaScript editor's onChange:
            `#pragma once` then gets handed to the sandbox as a pattern and the
            live preview dies. Separate instances mean the read-only header
            editor has no onChange at all and simply cannot reach `code`.
            The pattern keeps running untouched while the header is open.
          */}
          <div className={styles.editorBody}>
            {codeTab === "js" ? (
              <Editor
                key="editor-js"
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 20,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  overviewRulerLanes: 0,
                }}
              />
            ) : (
              <Editor
                key="editor-h"
                height="100%"
                defaultLanguage="cpp"
                theme="vs-dark"
                value={pattern.codeCpp ?? ""}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 20,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  overviewRulerLanes: 0,
                }}
              />
            )}
          </div>

          {codeTab === "h" && (
            <p className={styles.codeFootNote}>
              {buildsConfigured() ? (
                <>
                  Use <strong>Flash to my board</strong> below to compile and install this without
                  an Arduino IDE. Provided by the author and not verified by us.
                </>
              ) : (
                <>
                  To flash it: drop the file into <code>firmware/patternflow/</code> and add it to{" "}
                  <code>pattern_registry.h</code>. Provided by the author and not verified by us.
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className={styles.metaBlock}>
        <div className={styles.metaTitleRow}>
          <h1 className={styles.metaTitle}>{pattern.title}</h1>
          <LikeButton
            patternId={pattern.id}
            initialCount={pattern.likeCount}
            initialLiked={liked}
          />
        </div>

        <div className={styles.metaByline}>
          <span>
            by{" "}
            <Link href={`/community/u/${pattern.username ?? ""}`}>
              @{pattern.displayUsername ?? pattern.username ?? "unknown"}
            </Link>
          </span>
          {pattern.madeOn ? (
            // Both dates only when they actually differ — otherwise it's noise.
            <span title="Made on / shared on">
              made {pattern.madeOn}
              {pattern.madeOn !== formatDate(pattern.createdAt) && (
                <> · shared {formatDate(pattern.createdAt)}</>
              )}
            </span>
          ) : (
            <span>{formatDate(pattern.createdAt)}</span>
          )}
          <span>{pattern.license}</span>
          {pattern.forkCount > 0 && (
            <span>
              FRK — forked {pattern.forkCount} {pattern.forkCount === 1 ? "time" : "times"}
            </span>
          )}
          {pattern.codeCpp && (
            <span
              className={styles.hwNote}
              title={
                pattern.portedBy
                  ? `Ships a .h firmware header, ported by @${pattern.portedBy}`
                  : "Ships a .h firmware header"
              }
            >
              <span className={styles.hwChip}>.h</span> hardware ready
              {pattern.portedBy && <> · port by @{pattern.portedBy}</>}
            </span>
          )}
          {pattern.visibility !== "public" && (
            <span
              className={styles.visChip}
              title={
                pattern.visibility === "private"
                  ? "Private — only you can open this page"
                  : "Unlisted — off the feed, anyone with this link can open it"
              }
            >
              {pattern.visibility}
            </span>
          )}
          {pattern.parent && (
            <span className={styles.forkNote}>
              forked from{" "}
              {pattern.parent.visibility === "private" ? (
                // The parent went private after this fork: the credit stands
                // (it is baked into the source) but the link would 404.
                <span title="The original is now private">{pattern.parent.title}</span>
              ) : (
                <Link href={`/community/p/${pattern.parent.id}`}>{pattern.parent.title}</Link>
              )}
            </span>
          )}
          {/* Last in the row on purpose: available, never the thing you notice. */}
          {!isOwner && (
            <button type="button" className={styles.reportLink} onClick={() => setReportOpen(true)}>
              Report
            </button>
          )}
        </div>

        {/* Being picked into somebody's running order costs one of their two
            public slots, so it is worth naming rather than counting. */}
        {inDecks.length > 0 && (
          <div className={styles.inDecks}>
            <span className={styles.inDecksLabel}>
              In {inDecks.length} deck{inDecks.length === 1 ? "" : "s"}
            </span>
            {inDecks.map((deck) => (
              <Link key={deck.id} href={`/community/d/${deck.id}`} className={styles.inDecksChip}>
                {deck.title}
              </Link>
            ))}
          </div>
        )}

        {(pattern.provenance.madeHowLabel || pattern.provenance.signals.length > 0) && (
          <div className={styles.provenance}>
            {pattern.provenance.madeHowLabel && (
              <span className={styles.provenanceMade} title={pattern.provenance.madeHowBlurb ?? undefined}>
                {pattern.provenance.madeHowLabel}
              </span>
            )}
            {/* Not a score and not a badge to earn — just the human decisions
                that left a trace in the source. */}
            {pattern.provenance.signals.map((signal) => (
              <span key={signal.id} className={styles.provenanceSignal} title={signal.detail}>
                {signal.label}
              </span>
            ))}
          </div>
        )}

        {pattern.description && (
          <p className={styles.metaDescription}>
            <LinkedText text={pattern.description} />
          </p>
        )}

        {isOwner && (
          <div className={styles.ownerBar}>
            <span className={styles.formNote}>
              {pattern.ownCpp
                ? "Your pattern ships your own firmware header."
                : pattern.portedBy
                  ? `Running on @${pattern.portedBy}'s port — pin your pick below, or attach your own to out-rank it.`
                  : "Ported this to the board? Attach the .h so others can flash it."}
            </span>
            <button type="button" className={styles.btn} onClick={() => setDetailsModalOpen(true)}>
              Edit details
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setHeaderModalOpen(true)}
            >
              {pattern.ownCpp ? "Update .h" : "Add firmware header"}
            </button>
            <span className={styles.ownerBarSpacer} />
            <DeletePatternButton patternId={pattern.id} forkCount={pattern.forkCount} />
          </div>
        )}

        <PortsSection pattern={pattern} isOwner={isOwner} onPropose={() => setPortModalOpen(true)} />
      </div>

      <CommentSection target={{ kind: "pattern", id: pattern.id }} comments={comments} />

      {headerModalOpen && (
        <AddHeaderModal
          patternId={pattern.id}
          initialCpp={pattern.ownCpp}
          onClose={() => setHeaderModalOpen(false)}
        />
      )}

      {portModalOpen && (
        <AddHeaderModal
          patternId={pattern.id}
          initialCpp={null}
          mode="port"
          onClose={() => setPortModalOpen(false)}
        />
      )}

      {sendOpen && pattern.codeCpp && (
        <SendModuleModal
          patternTitle={pattern.title}
          code={pattern.codeCpp}
          onClose={() => setSendOpen(false)}
        />
      )}

      {buildOpen && pattern.codeCpp && (
        <BuildFirmwareModal
          initialHeader={pattern.codeCpp}
          patternLabel={pattern.title}
          onClose={() => setBuildOpen(false)}
        />
      )}

      {detailsModalOpen && (
        <EditDetailsModal
          patternId={pattern.id}
          initialTitle={pattern.title}
          initialDescription={pattern.description}
          initialLicense={pattern.license}
          initialMadeOn={pattern.madeOn}
          initialMadeHow={pattern.madeHow}
          initialVisibility={pattern.visibility}
          parentLicense={pattern.parent?.license ?? null}
          onClose={() => setDetailsModalOpen(false)}
        />
      )}

      {reportOpen && (
        <ReportModal
          targetType="pattern"
          targetId={pattern.id}
          targetLabel={pattern.title}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

// Community ports: who finished the hardware half, in arrival order. Visible
// to everyone — a porter's credit is the whole payment. The author's pick
// (pin) decides which one ships when they have no header of their own.
function PortsSection({
  pattern,
  isOwner,
  onPropose,
}: {
  pattern: PatternView;
  isOwner: boolean;
  onPropose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPropose = !isOwner && !pattern.ownCpp;
  if (pattern.ports.length === 0 && !canPropose) return null;

  const pin = async (portId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/patterns/${pattern.id}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinnedHeaderId: portId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (portId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/ports/${portId}`), {
        method: "DELETE",
        ...COMMUNITY_FETCH_INIT,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not remove the port.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.portsSection}>
      <div className={styles.portsHead}>
        <span className={styles.portsTitle}>
          Firmware ports{pattern.ports.length > 0 ? ` (${pattern.ports.length})` : ""}
        </span>
        {canPropose && (
          <button type="button" className={styles.btnSmall} onClick={onPropose}>
            {pattern.ports.length === 0 ? "Port this pattern (.h)" : "Propose another"}
          </button>
        )}
      </div>

      {pattern.ports.length === 0 ? (
        <p className={styles.formNote}>
          No firmware header yet. If you ran this on your own board, propose the .h — it goes
          live immediately, credited to you.
        </p>
      ) : (
        <ul className={styles.portsList}>
          {pattern.ports.map((port) => (
            <li key={port.id} className={styles.portRow} data-stale={port.stale}>
              <span className={styles.portHandle}>@{port.handle ?? "unknown"}</span>
              <span className={styles.portDate}>{port.createdAt.slice(0, 10)}</span>
              {port.effective && <span className={styles.portChip}>in use</span>}
              {port.pinned && <span className={styles.portChip}>pinned</span>}
              {port.stale && (
                <span className={styles.portStale} title="The pattern's code changed after this port was made">
                  for an older version
                </span>
              )}
              {port.note && <span className={styles.portNote}>{port.note}</span>}
              <span className={styles.ownerBarSpacer} />
              {isOwner && !port.stale && !pattern.ownCpp && (
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={busy}
                  title={
                    port.pinned
                      ? "Stop pinning this port (arrival order decides again)"
                      : "Make this the port your pattern ships"
                  }
                  onClick={() => void pin(port.pinned ? null : port.id)}
                >
                  {port.pinned ? "Unpin" : "Pin"}
                </button>
              )}
              {port.mine && (
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={busy}
                  onClick={() => void remove(port.id)}
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}
