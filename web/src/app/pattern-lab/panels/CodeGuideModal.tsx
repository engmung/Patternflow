"use client";

// The pattern-code reference modal, unchanged from the single-pattern lab.

import styles from "../PatternLab.module.css";

export default function CodeGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Code guide"
      onClick={onClose}
    >
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Code guide — encoder buttons</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <p>
            A pattern is plain JavaScript that exports three functions. Only <code>draw</code> is
            required.
          </p>
          <pre>{`export function setup(params) {}              // runs once on load
export function update(dt, input, params) {}  // runs each frame, before draw
export function draw(display, params, time) {} // runs each frame`}</pre>
          <p>
            Store your state on the <code>params</code> object — it persists between frames.{" "}
            <code>dt</code> is the seconds elapsed since the last frame, <code>time</code> the
            seconds since load.
          </p>

          <h4>Controls — the input object</h4>
          <ul>
            <li>
              <code>input.knobValues[i]</code> — the knob&apos;s absolute value after its min/max
              range is applied. This is the primary control API.
            </li>
            <li>
              <code>{"// @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1"}</code> —
              one comment line declaring knob names and ranges. Loading code with this line renames
              the knobs and applies the ranges automatically (<code>-</code> skips a slot); read the
              values back via <code>knobValues</code>, not <code>knobNormalized</code>, so range
              edits keep working.
            </li>
            <li>
              <code>input.knobNormalized[i]</code> — the same knob remapped to <code>0.0–1.0</code>,
              handy for blends.
            </li>
            <li>
              <code>input.knobRanges[i]</code> — the <code>[min, max]</code> pair set by the range
              fields under each knob.
            </li>
            <li>
              <code>input.knobDeltas[i]</code> — per-frame change in encoder detents
              (hardware-style); keep only as a fallback.
            </li>
            <li>
              <code>input.btnPressed[i]</code> — true only on the frame button <code>i</code> is
              pressed (edge). Use for one-shot actions: reset, cycle, snapshot, trigger.
            </li>
            <li>
              <code>input.btnHeld[i]</code> — true while button <code>i</code> is held down (level).
              Use for momentary holds: freeze, boost, reveal.
            </li>
          </ul>
          <p className={styles.modalNote}>
            <code>i</code> is <code>0–3</code>, matching Knob 1–4. Press a knob&apos;s{" "}
            <code>Push</code> button in the Knobs panel to fire its button flags. Knobs and buttons
            drive the ACTIVE code layer.
          </p>

          <h4>Encoder buttons</h4>
          <pre>{`export function update(dt, input, params) {
  if (input.btnPressed[0]) params.hue = 0;     // reset on tap
  if (input.btnHeld[1]) params.frozen = true;   // act while held
}`}</pre>
          <p className={styles.modalNote}>
            Long-press is reserved for the firmware mode switcher — don&apos;t build mode-switching
            on the buttons. The Origin preset taps each knob to reset that value.
          </p>

          <h4>Drawing</h4>
          <ul>
            <li>
              <code>display.width</code> / <code>display.height</code> — loop with these, never
              hardcode 128 or 64.
            </li>
            <li>
              <code>display.setPixel(x, y, r, g, b)</code> — write one pixel; <code>r/g/b</code> are{" "}
              <code>0–255</code>.
            </li>
            <li>
              <code>display.setValue(x, y, v)</code> — value-field mode: write a <code>0–1</code>{" "}
              scalar and this layer&apos;s Color Ramp does the coloring (alpha included — a
              transparent ramp stop lets lower layers show through). Don&apos;t mix with{" "}
              <code>setPixel</code> in one pattern.
            </li>
          </ul>

          <h4>Layers</h4>
          <ul>
            <li>Each code layer runs its own pattern with its own ramp, knobs and errors.</li>
            <li>
              Pixel layers are static RGBA bitmaps drawn in the Pixel panel; transparent pixels
              reveal the layers beneath.
            </li>
            <li>
              Exports (community, firmware) flatten the visible stack into one standalone pattern —
              ramps baked as lookup tables, pixel art embedded.
            </li>
          </ul>
          <p className={styles.modalNote}>
            Use only plain JavaScript and <code>Math.*</code> — no DOM, imports, async, or per-pixel
            allocations.
          </p>
        </div>
      </div>
    </div>
  );
}
