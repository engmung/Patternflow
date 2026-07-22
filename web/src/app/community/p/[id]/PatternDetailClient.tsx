"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import SandboxPreview from "@/components/community/SandboxPreview";
import CommentSection, { type CommentView } from "@/components/community/CommentSection";
import { formatDate } from "@/components/community/PatternCard";
import { knobSetupFromCode } from "@/lib/community/knobs";
import { writeLabHandoff } from "@/lib/community/handoff";
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
  license: string;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  parent: { id: string; title: string } | null;
};

export default function PatternDetailClient({
  pattern,
  comments,
  initialKnobs,
}: {
  pattern: PatternView;
  comments: CommentView[];
  initialKnobs?: number[];
}) {
  const router = useRouter();
  const [code, setCode] = useState(pattern.code);
  const [running, setRunning] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const knobSetup = useMemo(() => knobSetupFromCode(pattern.code), [pattern.code]);

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

  return (
    <>
      <div className={styles.detailLayout}>
        <div>
          <div className={styles.matrixFrame}>
            <SandboxPreview
              code={code}
              knobValues={knobValues}
              knobRanges={knobSetup.ranges}
              running={running}
              onStatus={(ok, error) => setRuntimeError(ok ? null : error ?? "Runtime error.")}
            />
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
          </div>
        </div>

        <div className={styles.editorWrap}>
          <Editor
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
        </div>
      </div>

      <div className={styles.metaBlock}>
        <h1 className={styles.metaTitle}>{pattern.title}</h1>
        <div className={styles.metaByline}>
          <span>
            by{" "}
            <Link href={`/community/u/${pattern.username ?? ""}`}>
              @{pattern.displayUsername ?? pattern.username ?? "unknown"}
            </Link>
          </span>
          <span>{formatDate(pattern.createdAt)}</span>
          <span>{pattern.license}</span>
          {pattern.parent && (
            <span className={styles.forkNote}>
              forked from{" "}
              <Link href={`/community/p/${pattern.parent.id}`}>{pattern.parent.title}</Link>
            </span>
          )}
        </div>
        {pattern.description && (
          <p className={styles.metaDescription}>{pattern.description}</p>
        )}
      </div>

      <CommentSection patternId={pattern.id} comments={comments} />
    </>
  );
}
