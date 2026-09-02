"use client";

// Monaco editor bound to the ACTIVE code layer. The toolbar keeps the
// single-pattern workflow: preset stepper, paste/clear, the AI variation
// prompt, and the code guide.

import Editor from "@monaco-editor/react";
import { useState } from "react";
import { livePresets } from "@/lib/presets";
import { buildVariantCopyPrompt } from "@/lib/ai/gemini";
import { hasStackAnnotation, importCodeIntoLab } from "@/lib/lab/stackShare";
import { useActiveLayer, useLabStore } from "@/lib/lab/store";
import { isCodeLayer } from "@/lib/lab/types";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";
import CodeGuideModal from "./CodeGuideModal";

const labPresets = livePresets.filter((preset) => preset.labOnly);

export default function CodePanel() {
  const layer = useActiveLayer();
  const matrix = useLabStore((state) => state.matrix);
  const knobs = useLabStore((state) => state.knobs);
  const ranges = useLabStore((state) => state.ranges);
  const gen = useLabStore((state) => state.gen);
  const updateLayerCode = useLabStore((state) => state.updateLayerCode);
  const applyCodeToActive = useLabStore((state) => state.applyCodeToActive);
  const addCodeLayer = useLabStore((state) => state.addCodeLayer);
  const error = useLabStore((state) =>
    layer ? (state.layerErrors[layer.id] ?? null) : null,
  );

  const [promptCopied, setPromptCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  if (!isCodeLayer(layer)) {
    return (
      <div className={dock.panel}>
        <div className={dock.panelHint}>
          {layer
            ? "The selected layer is pixel art — use the Pixel panel to edit it, or select a code layer."
            : "Select a layer to edit."}
          <button type="button" onClick={addCodeLayer}>
            + Add code layer
          </button>
        </div>
      </div>
    );
  }

  const activeLabIndex = labPresets.findIndex((preset) => preset.code === layer.code);

  const stepLabPreset = (dir: number) => {
    if (labPresets.length === 0) return;
    const base = activeLabIndex >= 0 ? activeLabIndex : dir > 0 ? -1 : 0;
    const next = (base + dir + labPresets.length) % labPresets.length;
    applyCodeToActive(labPresets[next].code);
  };

  const copyVariantPrompt = async () => {
    await navigator.clipboard.writeText(
      buildVariantCopyPrompt(layer.code, knobs, ranges, gen.colorMode, matrix),
    );
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1200);
  };

  // Pasted code carrying a @stack line is a whole shared composition —
  // restore its layers instead of overwriting the active layer's code.
  const applyPastedCode = (text: string) => {
    if (hasStackAnnotation(text)) {
      void importCodeIntoLab(text);
    } else {
      applyCodeToActive(text);
    }
    setPasted(true);
    window.setTimeout(() => setPasted(false), 1200);
  };

  const pasteFromClipboard = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          applyPastedCode(text);
          return;
        }
      }
    } catch {
      // Permission blocked or unsupported in WebView — fall back to window.prompt
    }
    const fallbackText = window.prompt("붙여넣을 패턴 코드를 아래 상자에 입력하거나 붙여넣어 주세요:");
    if (fallbackText !== null) {
      applyPastedCode(fallbackText);
    }
  };

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        <label title="Editing this layer's code">{layer.name}</label>
        <div
          className={styles.presetStep}
          title={activeLabIndex >= 0 ? labPresets[activeLabIndex].name : "Lab presets"}
        >
          <button type="button" onClick={() => stepLabPreset(-1)} aria-label="Previous lab preset">
            ‹
          </button>
          <span>
            {activeLabIndex >= 0 ? activeLabIndex + 1 : "–"}/{labPresets.length}
          </span>
          <button type="button" onClick={() => stepLabPreset(1)} aria-label="Next lab preset">
            ›
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={pasteFromClipboard}
          title="Replace this layer's code from the clipboard"
        >
          {pasted ? "Pasted ✓" : "Paste"}
        </button>
        <button
          type="button"
          onClick={() => {
            updateLayerCode(layer.id, "");
            setCleared(true);
            window.setTimeout(() => setCleared(false), 1200);
          }}
          title="Clear this layer's code"
        >
          {cleared ? "Cleared ✓" : "Clear"}
        </button>
        <button
          type="button"
          onClick={copyVariantPrompt}
          title="Copy the AI variation prompt for this layer (ChatGPT / Claude / Gemini)"
        >
          {promptCopied ? "Copied" : "Copy prompt"}
        </button>
        <button type="button" onClick={() => setGuideOpen(true)}>
          Code guide
        </button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={dock.panelBody}>
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          path={`layer-${layer.id}.js`}
          value={layer.code}
          onChange={(value) => updateLayerCode(layer.id, value ?? "")}
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

      {guideOpen && <CodeGuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
