"use client";

// Firmware export wizard for layered compositions.
//
// The lab is the assembler: it generates a finished, compiling C++ scaffold
// (buffers, knobs, LUTs, pixel art, masking, compositing — all deterministic)
// and one focused prompt per code layer. The user runs each prompt through an
// LLM and pastes the small namespace block back; the wizard validates it and
// swaps it into the marked slot. The model never sees — and can never
// corrupt — the machine-generated data.

import { useMemo, useState } from "react";
import { buildsConfigured } from "@/lib/community/apiBase";
import BuildFirmwareModal from "@/components/community/BuildFirmwareModal";
import { assembleH, buildHExport, cleanPastedUnit } from "@/lib/lab/hExport";
import { useLabStore } from "@/lib/lab/store";
import styles from "./PatternLab.module.css";

export default function FirmwareExportModal({ onClose }: { onClose: () => void }) {
  const matrix = useLabStore((state) => state.matrix);
  const layers = useLabStore((state) => state.layers);
  const knobs = useLabStore((state) => state.knobs);
  const ranges = useLabStore((state) => state.ranges);
  const knobLabels = useLabStore((state) => state.knobLabels);

  const [name, setName] = useState("Layer Stack");
  const [pastes, setPastes] = useState<Record<number, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);

  const exportData = useMemo(
    () => buildHExport({ name, matrix, layers, knobs, ranges, knobLabels }),
    [name, matrix, layers, knobs, ranges, knobLabels],
  );

  const unitStates = exportData.units.map((unit) => {
    const pasted = pastes[unit.index] ?? "";
    return {
      unit,
      pasted,
      valid: pasted.trim().length > 0 ? cleanPastedUnit(pasted, unit.index) !== null : null,
    };
  });
  const translatedCount = unitStates.filter((entry) => entry.valid === true).length;
  const allTranslated = translatedCount === exportData.units.length;

  const assembled = useMemo(
    () => assembleH(exportData.scaffold, pastes),
    [exportData.scaffold, pastes],
  );

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1200);
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    flashCopied(key);
  };

  const downloadH = () => {
    const blob = new Blob([assembled], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportData.namespaceName.replace(/^LabStack_/, "").toLowerCase() || "composition"}.h`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Firmware export"
      onClick={onClose}
    >
      <div
        className={styles.modalCard}
        style={{ maxWidth: 720 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span>Firmware .h — layer stack</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <p>
            The scaffold below is <strong>finished, deterministic C++</strong> — buffers, shared
            knobs, ramp LUTs, pixel art, masks and compositing are already correct and compile
            as-is. Only each code layer&apos;s drawing logic needs an AI translation: copy a
            layer&apos;s prompt, run it in ChatGPT / Claude / Gemini, and paste the returned{" "}
            <code>namespace L…</code> block back here.
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
            <label style={{ fontSize: 12 }} htmlFor="fw-name">
              Name
            </label>
            <input
              id="fw-name"
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              style={{
                flex: 1,
                border: "1px solid rgba(23,21,18,0.3)",
                padding: "4px 8px",
                font: "inherit",
                fontSize: 13,
                background: "#fffdf8",
              }}
            />
            <span className={styles.modalNote} style={{ margin: 0 }}>
              {exportData.stackNames.length} layers · {exportData.units.length} to translate
            </span>
          </div>

          {exportData.units.length === 0 && (
            <p className={styles.modalNote}>
              This stack has no code layers — the scaffold is already the complete pattern.
            </p>
          )}

          {unitStates.map(({ unit, pasted, valid }) => (
            <div
              key={unit.index}
              style={{
                border: "1px solid rgba(23,21,18,0.2)",
                padding: 10,
                marginBottom: 10,
                background: "#fbf7ee",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 12 }}>
                  L{unit.index} · {unit.name}
                </strong>
                <span className={styles.modalNote} style={{ margin: 0 }}>
                  {unit.usesValueField ? "value field (ramp pre-baked)" : "rgb"}
                  {unit.isMask ? " · mask" : ""}
                </span>
                <span style={{ flex: 1 }} />
                {valid === true && <span style={{ color: "#2e7d32", fontSize: 12 }}>✓ ready</span>}
                {valid === false && (
                  <span style={{ color: "#d63e2e", fontSize: 12 }}>
                    must contain namespace L{unit.index}
                  </span>
                )}
                <button
                  type="button"
                  className={styles.headerToggle}
                  onClick={() => copyText(`prompt-${unit.index}`, unit.prompt)}
                >
                  {copiedKey === `prompt-${unit.index}` ? "Copied ✓" : `Copy prompt`}
                </button>
              </div>
              <textarea
                value={pasted}
                placeholder={`Paste the AI's namespace L${unit.index} { … } block here`}
                spellCheck={false}
                onChange={(event) =>
                  setPastes((current) => ({ ...current, [unit.index]: event.target.value }))
                }
                style={{
                  width: "100%",
                  minHeight: 72,
                  marginTop: 8,
                  border: "1px solid rgba(23,21,18,0.3)",
                  background: "#fffdf8",
                  font: "12px/1.4 monospace",
                  padding: 6,
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>
          ))}

          <p className={styles.modalNote}>
            {allTranslated
              ? "All layers translated — the assembled header is complete."
              : `Untranslated layers keep their compiling stub (black layer) — you can build now and translate later. ${translatedCount}/${exportData.units.length} translated.`}
          </p>

          <div className={styles.variantActions} style={{ marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => copyText("h", assembled)}>
              {copiedKey === "h" ? "Copied ✓" : "Copy .h"}
            </button>
            <button type="button" onClick={downloadH}>
              Download .h
            </button>
            {buildsConfigured() && (
              <button
                type="button"
                className={styles.darkButton}
                title="Compile a firmware image with this header and flash it over USB / Wi-Fi"
                onClick={() => setBuildOpen(true)}
              >
                Send to build
              </button>
            )}
          </div>
        </div>
      </div>

      {buildOpen && (
        <BuildFirmwareModal
          initialHeader={assembled}
          patternLabel={name}
          onClose={() => setBuildOpen(false)}
        />
      )}
    </div>
  );
}
