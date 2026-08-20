// Styles for the card, as a string injected into its shadow root.
//
// Shadow DOM so nothing here leaks into a dashboard and nothing in a dashboard
// leaks in. Colours come from Home Assistant's own theme variables wherever one
// exists, with Patternflow's palette as the fallback — a card that ignores the
// user's theme looks like a bug, and one with no fallback looks broken on a
// theme that omits a variable.

export const CARD_STYLES = `
:host {
  display: block;
}

/* The hidden attribute works by setting display:none in the UA stylesheet,
   which ANY author display rule outranks. Several elements here are grids and
   flex rows, so without this they ignore being hidden — which is how the
   preview's "loading…" placeholder sat on top of a perfectly good picture. */
[hidden] {
  display: none !important;
}

ha-card {
  overflow: hidden;
}

.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 2;
  max-height: 420px;
  margin: 0 auto;
  background: #000;
  /* pan-y, not none. A finger dragging up the preview has to scroll the
     dashboard — the preview is the tallest thing on the card, and making it
     swallow vertical touches turned it into a scroll trap you could not get
     past on a phone. Touch control lives on the knob strip below instead.
     touch-action does not apply to a mouse, so dragging with one still
     turns knobs here, which is the gesture the community wall taught. */
  touch-action: pan-y;
  cursor: ns-resize;
  user-select: none;
}

.stage.landscape {
  aspect-ratio: 2 / 1;
  cursor: ns-resize;
}

.stage.asleep .frame,
.stage.asleep .still {
  opacity: 0.12;
  filter: grayscale(1);
}

.frame,
.still {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition: opacity 150ms ease-out;
}

.still {
  display: grid;
  place-items: center;
  color: var(--secondary-text-color, #8a8272);
  font-size: 0.8rem;
  text-align: center;
  padding: 1rem;
  line-height: 1.5;
}

/* Four vertical bands over the preview, one per encoder. Shown only while a
   pointer is on the stage, so the pattern is unobstructed the rest of the
   time — the card is a picture first. */
.zones {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  opacity: 0;
  transition: opacity 120ms ease-out;
  pointer-events: none;
}

.stage.touched .zones {
  opacity: 1;
}

.zone {
  border-right: 1px solid rgba(237, 231, 219, 0.12);
}

.zone:last-child {
  border-right: 0;
}

.zone.active {
  background: linear-gradient(
    to top,
    rgba(237, 231, 219, 0.16),
    rgba(237, 231, 219, 0.02)
  );
}

/* The readout dodges to whichever half the pointer is not in. */
.readout {
  position: absolute;
  left: 0;
  right: 0;
  padding: 0.5rem 0.7rem;
  background: rgba(12, 11, 9, 0.82);
  backdrop-filter: blur(6px);
  color: #ede7db;
  opacity: 0;
  transition: opacity 120ms ease-out;
  pointer-events: none;
  font-size: 0.75rem;
}

.stage.touched .readout {
  opacity: 1;
}

.readout.top {
  top: 0;
}

.readout.bottom {
  bottom: 0;
}

.readout-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.readout-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readout-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.track {
  height: 3px;
  background: rgba(237, 231, 219, 0.18);
  border-radius: 2px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: #ede7db;
  transition: width 80ms linear;
}

.badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(12, 11, 9, 0.72);
  color: #8a8272;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  pointer-events: none;
}

/* The four knobs as a strip of their own, under the preview.
   This is the touch control surface — small and deliberate, so giving it the
   whole vertical gesture costs nothing, unlike the preview above it. With a
   mouse it doubles as a readout of all four at once, which the hover overlay
   cannot do because it only ever shows the one under the cursor. */
.knobs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--divider-color, rgba(0, 0, 0, 0.12));
  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  touch-action: none;
  user-select: none;
}

.knob {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0.4rem 0.55rem;
  border: 0;
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color);
  font: inherit;
  text-align: left;
  cursor: ns-resize;
  touch-action: none;
}

.knob:disabled {
  cursor: default;
  opacity: 0.45;
}

.knob.active {
  background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
}

.knob-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.3rem;
}

.knob-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  color: var(--secondary-text-color);
}

.knob-value {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.knob-track {
  height: 3px;
  border-radius: 2px;
  background: var(--divider-color, rgba(0, 0, 0, 0.12));
  overflow: hidden;
}

.knob-fill {
  height: 100%;
  background: var(--primary-color, #ede7db);
  transition: width 80ms linear;
}

.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--primary-text-color);
}

.subtitle {
  color: var(--secondary-text-color);
  font-size: 0.75rem;
  font-weight: 400;
}

/* No inner scrolling, deliberately. A scroll container inside a dashboard is a
   trap on touch: a swipe over it scrolls the list instead of the page, and on a
   long list there is no way past the card. A tall card is the honest trade —
   show_patterns: false is there for anyone who does not want it. */
.patterns {
  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
}

.pattern {
  display: block;
  width: 100%;
  padding: 0.55rem 1rem;
  border: 0;
  background: none;
  color: var(--primary-text-color);
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.pattern:hover {
  background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
}

.pattern.current {
  color: var(--primary-color);
  font-weight: 600;
}

.notice {
  padding: 0.7rem 1rem;
  color: var(--error-color, #b3261e);
  font-size: 0.8rem;
}
`;
