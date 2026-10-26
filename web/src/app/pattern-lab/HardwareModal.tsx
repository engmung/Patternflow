"use client";

import { useEffect, useMemo, useState } from "react";
import { PublishModal, SendModuleModal, buildsConfigured, communityConfigured } from "./community";
import { useBackdropClose } from "@/lib/hooks/useBackdropClose";
import { useDialog } from "@/lib/hooks/useDialog";
import { useResettingState } from "@/lib/hooks/useResettingState";
import {
  assembleH,
  buildHExport,
  cleanPastedHeader,
  cleanPastedUnit,
  enforcePatternName,
} from "@/lib/lab/hExport";
import { downloadBlob } from "@/lib/lab/capture/download";
import { buildCppPrompt } from "@/lib/lab/cppPrompt";
import { promptKey, readPastes, writePastes } from "@/lib/lab/hardwarePastes";
import { currentPerformanceJson } from "@/lib/lab/director/publish";
import { loneCodeLayer } from "@/lib/lab/flatten";
import { labPatternName, useLabStore } from "@/lib/lab/store";
import { activeTextEffect } from "@/lib/lab/textEffects";
import { isTextLayer } from "@/lib/lab/types";
import styles from "./PatternLab.module.css";
import local from "./HardwareModal.module.css";

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
  const forkOf = useLabStore((state) => state.forkOf);

  // Seeded from the lab's pattern name so the .h NAME, the .pfm slug and the
  // Director's opening pattern cue all agree without retyping.
  const [name, setName] = useState(() => labPatternName(useLabStore.getState()));
  const [copied, flashCopied] = useResettingState<{ key: string; ok: boolean } | null>(null, 1200);
  const [stage, setStage] = useState<Stage>("convert");

  const [sendOpen, setSendOpen] = useState(false);
  const [publishCode, setPublishCode] = useState<string | null>(null);
  const [publishPerfJson, setPublishPerfJson] = useState<string | null>(null);

  // One visible code layer is the simple case: a single prompt and a single
  // paste. Anything else goes through the scaffold. Same test the export path
  // uses (masks count; a lone pixel layer is a stack, not a pattern with an
  // empty prompt; so is a lone code layer under 100% or on multiply, whose
  // opacity and blend the single prompt doesn't carry), and the same layer:
  // the one showing, whichever is picked in Layers. A hidden pick used to go
  // into the prompt in its place.
  const lone = loneCodeLayer(layers);
  const stacked = lone === null;

  const exportData = useMemo(
    () => buildHExport({ name, matrix, layers, knobs, ranges, knobLabels }),
    [name, matrix, layers, knobs, ranges, knobLabels],
  );

  const singlePrompt = useMemo(() => {
    if (!lone) return "";
    return buildCppPrompt({
      code: lone.code,
      matrix,
      knobs,
      ranges,
      knobLabels,
      ramp: lone.ramp,
      recolor: lone.recolor,
      name,
    });
  }, [lone, matrix, knobs, ranges, knobLabels, name]);

  // What the model answered is kept for the tab under the prompt it answers
  // (hardwarePastes.ts), so Esc, a press outside or a reload no longer sends
  // the person back to ask again. The single key is the prompt without the
  // name, which assembly stamps on again, and without the knob positions,
  // which the key leaves out anyway.
  const singleKey = useMemo(
    () =>
      lone
        ? promptKey(
            buildCppPrompt({
              code: lone.code,
              matrix,
              knobs: [],
              ranges,
              knobLabels,
              ramp: lone.ramp,
              recolor: lone.recolor,
            }),
          )
        : "",
    [lone, matrix, ranges, knobLabels],
  );
  const unitKeys = useMemo(
    () => exportData.units.map((unit) => [unit.index, promptKey(unit.prompt)] as const),
    [exportData.units],
  );

  const [single, setSingle] = useState(() => (lone ? (readPastes()[singleKey] ?? "") : ""));
  const [pastes, setPastes] = useState<Record<number, string>>(() => {
    const kept = readPastes();
    const restored: Record<number, string> = {};
    for (const [index, key] of unitKeys) {
      if (kept[key]) restored[index] = kept[key];
    }
    return restored;
  });

  // Keeps what the boxes hold now and nothing else, so a paste whose prompt
  // the lab no longer asks goes with the next edit.
  const keep = (nextSingle: string, nextPastes: Record<number, string>) => {
    const kept: Record<string, string> = {};
    if (lone) {
      if (nextSingle.trim()) kept[singleKey] = nextSingle;
    } else {
      for (const [index, key] of unitKeys) {
        const text = nextPastes[index] ?? "";
        if (text.trim()) kept[key] = text;
      }
    }
    writePastes(kept);
  };

  // A chat answer pasted whole used to go into the .h with the model's words
  // and the ``` fence, and the header test below passed it.
  const singleHeader = useMemo(() => cleanPastedHeader(single), [single]);
  const wordsLeftOut = singleHeader !== null && singleHeader !== single.trim();

  // Single path: the model writes NAME itself, so stamp the lab's name back
  // on (the scaffold path already carries it — buildHExport bakes it in).
  const assembled = useMemo(
    () =>
      stacked
        ? assembleH(exportData.scaffold, pastes)
        : singleHeader === null
          ? ""
          : enforcePatternName(singleHeader, name),
    [stacked, exportData.scaffold, pastes, singleHeader, name],
  );

  // Text and pixel layers go into the scaffold as the pixels they show, so
  // a stack with no code layer is the whole header, no model in the loop.
  const nothingToTranslate = stacked && exportData.units.length === 0;

  /** null = nothing pasted yet, true/false = parsed or not. */
  const unitState = (index: number): boolean | null => {
    const pasted = (pastes[index] ?? "").trim();
    if (pasted.length === 0) return null;
    return cleanPastedUnit(pasted, index) !== null;
  };

  const untranslated = exportData.units.filter((unit) => unitState(unit.index) !== true);
  const translated = exportData.units.length - untranslated.length;

  const headerLooksReal = /^\s*#pragma\s+once\b/m.test(assembled);

  // The scaffold has #pragma once before anything is pasted, so in a stack
  // the header test alone let two untranslated code layers through as
  // "Header ready", and the board showed black. Each stub draws nothing.
  const waitingForTranslation = stacked && !nothingToTranslate && translated === 0;
  const canContinue = headerLooksReal && !waitingForTranslation;
  const stubNames = untranslated.map((unit) => `L${unit.index} · ${unit.name}`).join(", ");

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied({ key, ok: true });
    } catch {
      // The browser refused the write. Saying nothing left the label as it
      // was, and whatever the clipboard held before went to the model.
      flashCopied({ key, ok: false });
    }
  };

  const copyLabel = (key: string, idle: string) =>
    copied?.key === key ? (copied.ok ? "Copied ✓" : "Copy failed") : idle;

  const downloadH = () =>
    downloadBlob(
      new Blob([assembled], { type: "text/plain" }),
      `${exportData.namespaceName.replace(/^LabStack_/, "").toLowerCase() || "pattern"}.h`,
    );

  const label = lone?.name ?? name;

  // Only a press on this backdrop itself closes. Send and Publish open inside
  // it, so a press on their backdrop bubbles up here too, and closing one of
  // them would close this window under it. A drag out of the header box ends
  // here as well, and that one began in the card.
  const closeOnBackdrop = useBackdropClose(onClose);

  // Esc closes the window on top and the header stays. Send and Publish open
  // over this one and hear Esc themselves, and both listeners close the one
  // on top and nothing else.
  const cardRef = useDialog<HTMLDivElement>(() => {
    if (sendOpen) setSendOpen(false);
    else if (publishCode !== null) setPublishCode(null);
    else onClose();
  });

  // Their buttons go with them, and the focus would fall to the page behind.
  const childOpen = sendOpen || publishCode !== null;
  useEffect(() => {
    if (!childOpen && !cardRef.current?.contains(document.activeElement)) {
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [childOpen, cardRef]);

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Hardware"
      {...closeOnBackdrop}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className={styles.modalCard}
        onClick={(event) => event.stopPropagation()}
      >
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
                first.
                {nothingToTranslate
                  ? null
                  : " Translating it is a model’s job: copy the prompt, paste what comes back."}
              </p>

              {stacked ? (
                <>
                  <label className={local.hwField}>
                    <span>Name</span>
                    <input
                      type="text"
                      value={name}
                      maxLength={24}
                      onChange={(event) => setName(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  {nothingToTranslate ? (
                    <p className={styles.modalNote}>
                      Nothing here needs a model. Text and pixel layers go into the header as the
                      pixels they show, so it is finished as it is.
                      {layers.some(isTextLayer) ? " The board needs no font for the letters." : null}
                      {layers.some((layer) => isTextLayer(layer) && layer.visible && activeTextEffect(layer))
                        ? " Text that moves moves there too, on the same knob."
                        : null}
                    </p>
                  ) : (
                    <p className={styles.modalNote}>
                      {exportData.units.length} layer{exportData.units.length === 1 ? "" : "s"} to
                      translate — {translated} done. Untranslated layers keep a compiling stub, so a
                      partial port still builds.
                      {waitingForTranslation
                        ? exportData.units.length === 1
                          ? " Next opens when it is translated."
                          : " Next opens when one of them is translated."
                        : null}
                    </p>
                  )}
                  {exportData.units.map((unit) => (
                    <div key={unit.index} className={local.hwUnit}>
                      <div className={local.hwUnitHead}>
                        <span className={local.hwUnitName}>
                          L{unit.index} · {unit.name}
                          {unit.isMask ? " · mask" : ""}
                        </span>
                        {unitState(unit.index) === true && <span className={local.hwOk}>parsed ✓</span>}
                        {unitState(unit.index) === false && (
                          <span className={local.hwBad}>not a namespace L{unit.index} block</span>
                        )}
                        <button
                          type="button"
                          onClick={() => void copyText(`u${unit.index}`, unit.prompt)}
                        >
                          {copyLabel(`u${unit.index}`, "Copy prompt")}
                        </button>
                      </div>
                      <textarea
                        className={local.hwPaste}
                        value={pastes[unit.index] ?? ""}
                        onChange={(event) => {
                          const next = { ...pastes, [unit.index]: event.target.value };
                          setPastes(next);
                          keep(single, next);
                        }}
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
                      {copyLabel("single", "Copy the conversion prompt")}
                    </button>
                  </div>
                  <textarea
                    className={local.hwPaste}
                    value={single}
                    onChange={(event) => {
                      setSingle(event.target.value);
                      keep(event.target.value, pastes);
                    }}
                    placeholder="Paste the .h the model gives you — it starts with #pragma once"
                    spellCheck={false}
                    rows={12}
                  />
                  {single.trim().length > 0 && (
                    <p className={headerLooksReal ? local.hwOk : local.hwBad}>
                      {headerLooksReal
                        ? "Looks like a header ✓"
                        : "A Patternflow header starts with #pragma once"}
                      {wordsLeftOut ? " The words around it stay out of the .h." : null}
                    </p>
                  )}
                </>
              )}

              <div className={styles.variantActions} style={{ marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void copyText("h", assembled)}
                  disabled={!headerLooksReal}
                >
                  {copyLabel("h", "Copy .h")}
                </button>
                <button type="button" onClick={downloadH} disabled={!headerLooksReal}>
                  Download .h
                </button>
                <button
                  type="button"
                  className={local.darkButton}
                  disabled={!canContinue}
                  title={
                    canContinue
                      ? "Continue with this header"
                      : waitingForTranslation
                        ? "Paste the translation of one layer first"
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
                {stacked && untranslated.length > 0
                  ? `Header built (${(assembled.length / 1024).toFixed(1)} KB) with ${translated} of ${exportData.units.length} layers translated.`
                  : `Header ready (${(assembled.length / 1024).toFixed(1)} KB).`}{" "}
                Try it on the board first — publishing it afterwards carries the header along, so
                the pattern lands in the community already marked hardware-ready.
              </p>
              {stacked && untranslated.length > 0 && (
                <p className={local.hwBad}>
                  Not translated: {stubNames}.{" "}
                  {untranslated.length === 1
                    ? "On the board it draws nothing until you go back and paste its translation."
                    : "On the board they draw nothing until you go back and paste their translations."}
                </p>
              )}

              <div className={styles.variantActions} style={{ flexWrap: "wrap" }}>
                {buildsConfigured() && (
                  <button
                    type="button"
                    className={local.darkButton}
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
          initialTitle={name.trim() || null}
          onClose={() => setPublishCode(null)}
        />
      )}
    </div>
  );
}
