"use client";

import { useMemo, useState } from "react";
import { buildsConfigured, communityConfigured } from "@/lib/community/apiBase";
import SendModuleModal from "@/components/community/SendModuleModal";
import PublishModal from "@/components/community/PublishModal";
import { assembleH, buildHExport, cleanPastedUnit } from "@/lib/lab/hExport";
import { buildCppPrompt } from "@/lib/lab/cppPrompt";
import { currentPerformanceJson } from "@/lib/lab/director/publish";
import { needsFlatten } from "@/lib/lab/flatten";
import { labPatternName, useLabStore } from "@/lib/lab/store";
import { isCodeLayer } from "@/lib/lab/types";
import styles from "./PatternLab.module.css";

// Getting a composition onto hardware, in the order the work actually happens.
//
// Conversion is step one for everything, and used to be the step people
// discovered they needed. Nothing can happen until the JavaScript is a C++
// header: a .pfm is compiled C++, and the community's "hardware ready" badge
// means a header exists. So conversion comes first, and what you can do with
// a header is offered once you have one.
//
// The conversion itself is unavoidably manual — translating a pattern is a
// model's job, not a regex's. One layer gets one prompt; a stack gets the
// deterministic scaffold with a prompt per layer, and untranslated layers keep
// a compiling stub so a partial port still builds.

type Stage = "convert" | "ready";

export default function HardwareModal({
  onClose,
  exportCode,
}: {
  onClose: () => void;
  /** The lab's publishable JS, for the community hand-off. */
  exportCode: () => Promise<string>;
}) {
  const matrix = useLabStore((state) => state.matrix);
  const layers = useLabStore((state) => state.layers);
  const knobs = useLabStore((state) => state.knobs);
  const ranges = useLabStore((state) => state.ranges);
  const knobLabels = useLabStore((state) => state.knobLabels);
  const activeLayerId = useLabStore((state) => state.activeLayerId);
  const forkOf = useLabStore((state) => state.forkOf);

  // Seeded from the lab's pattern name so the .h NAME, the .pfm slug and the
  // Director's opening pattern cue all agree without retyping.
  const [name, setName] = useState(() => labPatternName(useLabStore.getState()));
  const [pastes, setPastes] = useState<Record<number, string>>({});
  const [single, setSingle] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("convert");

  const [sendOpen, setSendOpen] = useState(false);
  const [publishCode, setPublishCode] = useState<string | null>(null);
  const [publishPerfJson, setPublishPerfJson] = useState<string | null>(null);

  // One visible code layer is the simple case: a single prompt and a single
  // paste. Anything else goes through the scaffold.
  const codeLayers = layers.filter(isCodeLayer);
  // Same test the export path uses (masks count; a lone pixel layer is a
  // stack, not a pattern with an empty prompt).
  const stacked = needsFlatten(layers);

  const exportData = useMemo(
    () => buildHExport({ name, matrix, layers, knobs, ranges, knobLabels }),
    [name, matrix, layers, knobs, ranges, knobLabels],
  );

  const singlePrompt = useMemo(() => {
    const active = layers.find((layer) => layer.id === activeLayerId);
    const focus = isCodeLayer(active) ? active : codeLayers[0];
    if (!focus) return "";
    return buildCppPrompt({
      code: focus.code,
      matrix,
      knobs,
      ranges,
      knobLabels,
      ramp: focus.ramp,
      recolor: focus.recolor,
    });
  }, [layers, activeLayerId, codeLayers, matrix, knobs, ranges, knobLabels]);

  const assembled = useMemo(
    () => (stacked ? assembleH(exportData.scaffold, pastes) : single.trim()),
    [stacked, exportData.scaffold, pastes, single],
  );

  const translated = exportData.units.filter(
    (unit) => (pastes[unit.index] ?? "").trim().length > 0 && cleanPastedUnit(pastes[unit.index] ?? "", unit.index) !== null,
  ).length;

  const headerLooksReal = /^\s*#pragma\s+once\b/m.test(assembled);

  /** null = nothing pasted yet, true/false = parsed or not. */
  const unitState = (index: number): boolean | null => {
    const pasted = (pastes[index] ?? "").trim();
    if (pasted.length === 0) return null;
    return cleanPastedUnit(pasted, index) !== null;
  };

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1200);
  };
  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(key);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const downloadH = () => {
    const blob = new Blob([assembled], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${
      exportData.namespaceName.replace(/^LabStack_/, "").toLowerCase() || "pattern"
    }.h`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const label = stacked ? name : codeLayers[0]?.name ?? "Pattern";

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Hardware"
      onClick={onClose}
    >
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <strong>{stage === "convert" ? "Convert to a firmware header" : "On to hardware"}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {stage === "convert" ? (
            <>
              <p className={styles.modalNote}>
                The board runs C++, so everything below — building an image, installing a module,
                publishing as hardware-ready — needs this pattern as a <code>.h</code> header
                first. Translating it is a model&rsquo;s job: copy the prompt, paste what comes
                back.
              </p>

              {stacked ? (
                <>
                  <label className={styles.hwField}>
                    <span>Name</span>
                    <input
                      type="text"
                      value={name}
                      maxLength={24}
                      onChange={(event) => setName(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <p className={styles.modalNote}>
                    {exportData.units.length} layer{exportData.units.length === 1 ? "" : "s"} to
                    translate — {translated} done. Untranslated layers keep a compiling stub, so a
                    partial port still builds.
                  </p>
                  {exportData.units.map((unit) => (
                    <div key={unit.index} className={styles.hwUnit}>
                      <div className={styles.hwUnitHead}>
                        <span className={styles.hwUnitName}>
                          L{unit.index} · {unit.name}
                          {unit.isMask ? " · mask" : ""}
                        </span>
                        {unitState(unit.index) === true && <span className={styles.hwOk}>parsed ✓</span>}
                        {unitState(unit.index) === false && (
                          <span className={styles.hwBad}>not a namespace L{unit.index} block</span>
                        )}
                        <button
                          type="button"
                          onClick={() => void copyText(`u${unit.index}`, unit.prompt)}
                        >
                          {copiedKey === `u${unit.index}` ? "Copied ✓" : "Copy prompt"}
                        </button>
                      </div>
                      <textarea
                        className={styles.hwPaste}
                        value={pastes[unit.index] ?? ""}
                        onChange={(event) =>
                          setPastes((current) => ({ ...current, [unit.index]: event.target.value }))
                        }
                        placeholder={`Paste the namespace L${unit.index} { … } block here`}
                        spellCheck={false}
                        rows={5}
                      />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className={styles.variantActions}>
                    <button type="button" onClick={() => void copyText("single", singlePrompt)}>
                      {copiedKey === "single" ? "Copied ✓" : "Copy the conversion prompt"}
                    </button>
                  </div>
                  <textarea
                    className={styles.hwPaste}
                    value={single}
                    onChange={(event) => setSingle(event.target.value)}
                    placeholder="Paste the .h the model gives you — it starts with #pragma once"
                    spellCheck={false}
                    rows={12}
                  />
                  {single.trim().length > 0 && (
                    <p className={headerLooksReal ? styles.hwOk : styles.hwBad}>
                      {headerLooksReal
                        ? "Looks like a header ✓"
                        : "A Patternflow header starts with #pragma once"}
                    </p>
                  )}
                </>
              )}

              <div className={styles.variantActions} style={{ marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => void copyText("h", assembled)}>
                  {copiedKey === "h" ? "Copied ✓" : "Copy .h"}
                </button>
                <button type="button" onClick={downloadH} disabled={!headerLooksReal}>
                  Download .h
                </button>
                <button
                  type="button"
                  className={styles.darkButton}
                  disabled={!headerLooksReal}
                  title={
                    headerLooksReal
                      ? "Continue with this header"
                      : "Paste a header starting with #pragma once first"
                  }
                  onClick={() => setStage("ready")}
                >
                  Next →
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.modalNote}>
                Header ready ({(assembled.length / 1024).toFixed(1)} KB). Try it on the board
                first — publishing it afterwards carries the header along, so the pattern lands
                in the community already marked hardware-ready.
              </p>

              <div className={styles.variantActions} style={{ flexWrap: "wrap" }}>
                {buildsConfigured() && (
                  <button
                    type="button"
                    className={styles.darkButton}
                    title="Install it as a loadable module over Wi-Fi — no reflash, no USB"
                    onClick={() => setSendOpen(true)}
                  >
                    ↗ Apply to my Patternflow
                  </button>
                )}
              </div>

              {communityConfigured() && (
                <>
                  <p className={styles.modalNote} style={{ marginTop: 14 }}>
                    Happy with it? Publish the pattern and its header together — you only have to
                    write a title and a description.
                  </p>
                  <div className={styles.variantActions}>
                    <button
                      type="button"
                      onClick={() => {
                        setPublishPerfJson(currentPerformanceJson());
                        void exportCode().then(setPublishCode);
                      }}
                    >
                      Upload to the community
                    </button>
                  </div>
                </>
              )}

              <div className={styles.variantActions} style={{ marginTop: 14 }}>
                <button type="button" onClick={() => setStage("convert")}>
                  ← Back to the header
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {sendOpen && (
        <SendModuleModal
          patternTitle={label}
          code={assembled}
          onClose={() => setSendOpen(false)}
        />
      )}

      {publishCode !== null && (
        <PublishModal
          code={publishCode}
          codeCpp={assembled}
          parentId={forkOf?.id ?? null}
          parentTitle={forkOf?.title ?? null}
          parentLicense={forkOf?.license ?? null}
          performanceJson={publishPerfJson}
          onClose={() => setPublishCode(null)}
        />
      )}
    </div>
  );
}
