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
  /* The preview is the only part that swallows gestures. Making the whole card
     a dead zone would turn it into a scroll trap on a phone, which is exactly
     what the community site's wall had to solve with its own wheel handler. */
  touch-action: none;
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

.patterns {
  max-height: 13rem;
  overflow-y: auto;
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
