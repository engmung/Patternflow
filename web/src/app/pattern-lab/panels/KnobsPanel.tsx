"use client";

// The four knobs — ONE shared set for the whole composition, like the four
// physical encoders on the device: every code layer reads the same input.
// Sliders + Blender-style digit dragging on the range bounds, and the encoder
// Push buttons routed to the engine (buttons hit the ACTIVE code layer).

import { useCallback, useEffect, useRef, useState } from "react";
import { labEngine } from "@/lib/lab/engine";
import { useLabStore } from "@/lib/lab/store";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";

const pixelsPerDigitStep = 10;

type RangeDragState = {
  index: number;
  edge: "min" | "max";
  startValue: number;
  startX: number;
  startY: number;
  step: number;
};

type RangeEditState = {
  index: number;
  edge: "min" | "max";
  value: string;
};

function formatKnob(value: number) {
  return value.toFixed(3);
}

function formatRangeControlValue(value: number) {
  return value.toFixed(3);
}

function roundRangeValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

function getDigitStep(text: string, index: number) {
  const char = text[index];
  if (!char || char === "-" || char === ".") return null;

  const decimalIndex = text.indexOf(".");
  if (decimalIndex < 0 || index < decimalIndex) {
    const placesLeft = (decimalIndex < 0 ? text.length : decimalIndex) - index - 1;
    return 10 ** placesLeft;
  }

  return 10 ** -(index - decimalIndex);
}

export default function KnobsPanel() {
  const knobs = useLabStore((state) => state.knobs);
  const ranges = useLabStore((state) => state.ranges);
  const knobLabels = useLabStore((state) => state.knobLabels);
  const setKnob = useLabStore((state) => state.setKnob);
  const setRange = useLabStore((state) => state.setRange);

  const [activeRangeId, setActiveRangeId] = useState<string | null>(null);
  const [editingRange, setEditingRange] = useState<RangeEditState | null>(null);
  const rangeDragRef = useRef<RangeDragState | null>(null);

  const updateRange = useCallback(
    (index: number, edge: "min" | "max", value: number) => {
      setRange(index, edge, value);
    },
    [setRange],
  );

  const commitRangeEdit = useCallback(() => {
    setEditingRange((current) => {
      if (current) {
        const nextValue = Number(current.value);
        if (Number.isFinite(nextValue)) {
          updateRange(current.index, current.edge, roundRangeValue(nextValue));
        }
      }
      return null;
    });
  }, [updateRange]);

  const finishRangeDrag = useCallback(() => {
    if (!rangeDragRef.current) return;
    rangeDragRef.current = null;
    setActiveRangeId(null);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = rangeDragRef.current;
      if (!drag) return;
      event.preventDefault();
      const dragAmount = event.clientX - drag.startX - (event.clientY - drag.startY);
      const stepCount = Math.round(dragAmount / pixelsPerDigitStep);
      updateRange(drag.index, drag.edge, roundRangeValue(drag.startValue + stepCount * drag.step));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishRangeDrag);
    window.addEventListener("pointercancel", finishRangeDrag);
    window.addEventListener("blur", finishRangeDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishRangeDrag);
      window.removeEventListener("pointercancel", finishRangeDrag);
      window.removeEventListener("blur", finishRangeDrag);
    };
  }, [finishRangeDrag, updateRange]);

  // Encoder buttons release on any global pointer-up, mirroring hardware.
  useEffect(() => {
    const releaseAll = () => labEngine.releaseAllButtons();
    window.addEventListener("pointerup", releaseAll);
    window.addEventListener("pointercancel", releaseAll);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("pointerup", releaseAll);
      window.removeEventListener("pointercancel", releaseAll);
      window.removeEventListener("blur", releaseAll);
    };
  }, []);

  const startRangeDrag = (
    event: React.PointerEvent<HTMLElement>,
    index: number,
    edge: "min" | "max",
    step: number,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setEditingRange(null);
    rangeDragRef.current = {
      index,
      edge,
      startValue: ranges[index][edge === "min" ? 0 : 1],
      startX: event.clientX,
      startY: event.clientY,
      step,
    };
    setActiveRangeId(`${index}-${edge}`);
  };

  const renderRangeValue = (index: number, edge: "min" | "max") => {
    const value = ranges[index][edge === "min" ? 0 : 1];
    const text = formatRangeControlValue(value);
    const decimalIndex = text.indexOf(".");
    const rangeId = `${index}-${edge}`;

    if (editingRange?.index === index && editingRange.edge === edge) {
      return (
        <input
          className={styles.rangeInput}
          value={editingRange.value}
          autoFocus
          inputMode="decimal"
          onChange={(event) =>
            setEditingRange((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onBlur={commitRangeEdit}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setEditingRange(null);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      );
    }

    return (
      <div
        className={`${styles.rangeValue}${activeRangeId ? ` ${styles.anyRangeDragging}` : ""}${activeRangeId === rangeId ? ` ${styles.rangeDragging}` : ""}`}
        role="spinbutton"
        aria-label={`${knobLabels[index]} ${edge}`}
        aria-valuenow={value}
        onDoubleClick={(event) => {
          event.preventDefault();
          finishRangeDrag();
          setEditingRange({ index, edge, value: formatRangeControlValue(value) });
        }}
      >
        {[...text].map((char, charIndex) => {
          const step = getDigitStep(text, charIndex);
          const isExtraPrecision = decimalIndex >= 0 && charIndex > decimalIndex + 1;
          if (step === null) {
            return (
              <span
                key={`${char}-${charIndex}`}
                className={`${styles.rangeStatic}${isExtraPrecision ? ` ${styles.rangeExtra}` : ""}`}
              >
                {char}
              </span>
            );
          }
          return (
            <span
              key={`${char}-${charIndex}`}
              className={`${styles.rangeDigit}${isExtraPrecision ? ` ${styles.rangeExtra}` : ""}`}
              title={`${step}`}
              onPointerDown={(event) => startRangeDrag(event, index, edge, step)}
            >
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        <label title="One physical knob set — every code layer reads the same four values, like on the device">
          shared · all layers
        </label>
      </div>
      <div className={dock.panelBody}>
        <div className={`${styles.controls} ${dock.knobsDock}`}>
          {knobs.map((value, index) => (
            <div key={index} className={styles.knobLine}>
              <div className={styles.knobHead}>
                <span className={styles.knobName}>{knobLabels[index]}</span>
                <strong className={styles.knobValue}>{formatKnob(value)}</strong>
                <button
                  type="button"
                  className={styles.knobButton}
                  aria-label={`${knobLabels[index]} button`}
                  title="Encoder button (short press) — hits the active code layer"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    labEngine.pressButton(index);
                  }}
                  onPointerUp={() => labEngine.releaseButton(index)}
                  onPointerLeave={() => labEngine.releaseButton(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      labEngine.pressButton(index);
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      labEngine.releaseButton(index);
                    }
                  }}
                >
                  Push
                </button>
              </div>
              <div className={styles.knobSlider}>
                {renderRangeValue(index, "min")}
                <input
                  type="range"
                  min={ranges[index][0]}
                  max={ranges[index][1]}
                  step="0.001"
                  value={value}
                  aria-label={`${knobLabels[index]} value`}
                  onChange={(event) => setKnob(index, Number(event.target.value))}
                />
                {renderRangeValue(index, "max")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
