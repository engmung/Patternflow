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
import DeletePatternButton from "@/components/community/DeletePatternButton";
import BuildFirmwareModal from "@/components/community/BuildFirmwareModal";
import { buildsConfigured } from "@/lib/community/apiBase";
import { CART_EVENT, cartAdd, cartHas, cartRemove } from "@/lib/community/cart";
import { knobSetupFromCode } from "@/lib/community/knobs";
import { describeMatrixShape, matrixFromCode } from "@/lib/patternMatrix";
import { writeLabHandoff } from "@/lib/community/handoff";
import { downloadPatternHeader, downloadPatternJs } from "@/lib/community/download";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "@/components/community/Community.module.css";

// Anyone can edit and run the code right here — the sandbox iframe is the
// boundary that makes that safe. Saving (fork-publishing) happens in Pattern
// Lab via the sessionStorage handoff.

export type PatternView = {
  id: string;
  title: string;
  description: string | null;
  code: string;
  /** Author-attached firmware port, if any. Read-only here. */
  codeCpp: string | null;
  license: string;
  /** Author-stated creation date (YYYY-MM-DD), when it differs from the upload. */
  madeOn: string | null;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  parent: { id: string; title: string } | null;
  likeCount: number;
  forkCount: number;
};

export default function PatternDetailClient({
  pattern,
  comments,
  initialKnobs,
  liked = false,
  isOwner = false,
}: {
  pattern: PatternView;
  comments: CommentView[];
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
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  // Cart membership is shared state (header chip, other tabs), so it is read
  // from the store and refreshed on its change event rather than mirrored.
  const [inCart, setInCart] = useState(false);
  const [cartNote, setCartNote] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInCart(cartHas(pattern.id));
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, [pattern.id]);
  const toggleCart = () => {
    if (!pattern.codeCpp) return;
    if (inCart) {
      cartRemove(pattern.id);
      setCartNote(null);
      return;
    }
    const added = cartAdd({ patternId: pattern.id, title: pattern.title, code: pattern.codeCpp });
    setCartNote(added.ok ? null : added.reason ?? null);
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
    });
    captureEvent("community_open_in_lab", { pattern_id: pattern.id, edited });
    router.push("/pattern-lab?from=community");
  };

  // Downloads always carry the PUBLISHED source, never in-page edits: the
  // licence header credits this pattern's author, which is only true of what
  // they actually published. Edits belong in a fork, via Open in Pattern Lab.
  const downloadJs = () => {
    downloadPatternJs(pattern, pattern.code);
    captureEvent("community_download", { pattern_id: pattern.id, kind: "js" });
  };

  const downloadHeader = () => {
    if (!pattern.codeCpp) return;
    downloadPatternHeader(pattern, pattern.codeCpp);
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
            {/* Cart = the module path: collect several patterns, build them all
                as .pfm in one go, install from the device's /patterns page. */}
            {buildsConfigured() && pattern.codeCpp && (
              <button
                type="button"
                className={styles.btn}
                title="Collect this pattern; build the whole cart as loadable modules"
                onClick={toggleCart}
              >
                {inCart ? "✓ In cart" : "▦ Add to cart"}
              </button>
            )}
            {cartNote && <span className={styles.fieldHint}>{cartNote}</span>}
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
              ⑂ forked {pattern.forkCount} {pattern.forkCount === 1 ? "time" : "times"}
            </span>
          )}
          {pattern.codeCpp && (
            <span className={styles.hwNote} title="Ships a .h firmware header">
              <span className={styles.hwChip}>.h</span> hardware ready
            </span>
          )}
          {pattern.parent && (
            <span className={styles.forkNote}>
              forked from{" "}
              <Link href={`/community/p/${pattern.parent.id}`}>{pattern.parent.title}</Link>
            </span>
          )}
        </div>

        {pattern.description && (
          <p className={styles.metaDescription}>
            <LinkedText text={pattern.description} />
          </p>
        )}

        {isOwner && (
          <div className={styles.ownerBar}>
            <span className={styles.formNote}>
              {pattern.codeCpp
                ? "Your pattern ships a firmware header."
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
              {pattern.codeCpp ? "Update .h" : "Add firmware header"}
            </button>
            <span className={styles.ownerBarSpacer} />
            <DeletePatternButton patternId={pattern.id} forkCount={pattern.forkCount} />
          </div>
        )}
      </div>

      <CommentSection target={{ kind: "pattern", id: pattern.id }} comments={comments} />

      {headerModalOpen && (
        <AddHeaderModal
          patternId={pattern.id}
          initialCpp={pattern.codeCpp}
          onClose={() => setHeaderModalOpen(false)}
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
          onClose={() => setDetailsModalOpen(false)}
        />
      )}
    </div>
  );
}
