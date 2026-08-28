// ═══════════════════════════════════════════════════════════
// PatternFlow - /audio-in console page (PROGMEM HTML)
// License: MIT
// ═══════════════════════════════════════════════════════════
// The page body below is generated from console/audio-in.html — edit that,
// then run: python firmware/toolchain/console_pages.py build
#pragma once

#include <Arduino.h>

static const char AUDIO_IN_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<script src="/pf-console.js"></script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Mic</title>
<style>
/* ── Ported from tools/patternflow-audio-extension/popup.css ────────────
   Verbatim, because the extension's popup is the interface people have used
   and liked, and a second one written from scratch was worse. Only the nine
   palette variables below it are changed: the extension is a light popup and
   this is a page inside the device's dark console.

   Regenerate with firmware/toolchain/port_audio_ui.py after changing the
   extension, rather than editing here. */
:root {
  --cream: #f4efe6;
  --cream-2: #ede7db;
  --ink: #141414;
  --muted: #6b655a;
  --faint: #a69f90;
  --rule: #d9d1c0;
  --led: #e8552e;
  --ok: #267a43;
  --bad: #b43b2d;
  --field: #fbf7ef;
}

* {
  box-sizing: border-box;
}

body {
  width: 460px;
  max-height: 620px;
  margin: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--cream);
  color: var(--ink);
  font: 12px/1.45 Inter, ui-sans-serif, system-ui, sans-serif;
}

header,
.section-head,
.band-head,
.band-actions {
  display: flex;
  align-items: center;
}

header {
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ink);
  margin-bottom: 10px;
}

.brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.brand img {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

h1 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
}

section {
  margin: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
}

.status {
  min-width: 82px;
  padding: 5px 8px 4px;
  border: 1px solid var(--ink);
  background: var(--field);
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .12em;
  text-align: center;
  text-transform: uppercase;
}

.ok { color: var(--ok); }
.bad { color: var(--bad); }

.label {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.device {
  display: grid;
  grid-template-columns: 1fr 74px;
  gap: 7px;
}

input,
select,
button {
  font: inherit;
}

input[type="text"],
select {
  width: 100%;
  border: 1px solid var(--rule);
  background: var(--field);
  color: var(--ink);
}

input[type="text"] {
  padding: 8px 9px;
}

select {
  padding: 3px 6px;
}

button {
  min-height: 32px;
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--cream);
  cursor: pointer;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .1em;
  text-transform: uppercase;
}

button:hover {
  background: var(--cream);
  color: var(--ink);
}

.small-button,
.remove-band {
  min-height: 26px;
  padding: 5px 8px;
}

.remove-band {
  border-color: var(--rule);
  background: transparent;
  color: var(--muted);
}

.actions {
  display: grid;
  /* Two, since WS Test moved into the diagnostics fold. */
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-top: 8px;
}

.actions button {
  padding: 8px;
}

.detail {
  min-height: 18px;
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
}

.section-head {
  justify-content: space-between;
  gap: 8px;
}

.spectrum-wrap {
  position: relative;
  height: 132px;
  border: 1px solid var(--ink);
  background: var(--field);
}

#spectrum {
  display: block;
  width: 100%;
  height: 100%;
}

.spectrum-bands {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.spectrum-band {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--led);
  border-right: 1px solid var(--led);
  background: rgba(232, 85, 46, .16);
}

.spectrum-band span {
  position: absolute;
  left: 5px;
  top: 5px;
  color: var(--ink);
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.spectrum-scale {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-top: 5px;
  color: var(--muted);
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.spectrum-scale span:last-child {
  text-align: right;
}

.global {
  display: grid;
  grid-template-columns: 1fr 42px;
  align-items: center;
  gap: 8px;
}

.global label,
.manual-grid label {
  display: grid;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}

.global label {
  grid-template-columns: 74px 1fr;
}

.manual-grid {
  display: grid;
  gap: 8px;
}

.manual-grid label {
  grid-template-columns: 28px 1fr 40px;
}

.value,
output {
  color: var(--ink);
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.band {
  margin: 0;
  padding-top: 12px;
}

.band-head {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.band-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.band-actions {
  gap: 7px;
}

.target {
  display: grid;
  grid-template-columns: auto 48px;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
}

.band-strip,
.map-row {
  display: grid;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}

.band-strip {
  grid-template-columns: 1fr 1fr 92px;
}

.map-row {
  grid-template-columns: 48px 1fr 92px;
}

.map-row > span,
.row span {
  color: var(--muted);
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-transform: uppercase;
}

.band-readout {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 4px;
  align-items: center;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
}

.map-sliders {
  display: grid;
  gap: 4px;
}

.row {
  display: grid;
  grid-template-columns: 54px 1fr 48px;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}

details.advanced {
  margin-top: 8px;
}

details.advanced summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .08em;
  text-transform: uppercase;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--ink);
}

.meter {
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  background: var(--cream-2);
  border: 1px solid var(--rule);
}

.meter.out {
  height: 3px;
  margin-top: 3px;
}

.meter div {
  width: 0;
  height: 100%;
  background: var(--led);
  transition: width .08s linear;
}

.meter.out div {
  background: var(--ink);
}

/* ── Named frequency ranges, per band ────────────────────────────────────
   The sliders are log-scaled now, so a range is reachable by hand — but
   nobody should have to drag for "bass" when the name is the thing they
   mean. Same six ranges the device's own audio page offers. */
.hz-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.hz-presets button {
  min-height: 0;
  padding: 3px 7px;
  font-size: 10px;
  letter-spacing: 0.04em;
  border-color: var(--rule);
  background: transparent;
  color: var(--muted);
}

.hz-presets button:hover {
  color: var(--ink);
  border-color: var(--ink);
}

/* ── Diagnostics, folded ─────────────────────────────────────────────────
   Connecting with no audio and pushing the knobs by hand is how you tell a
   dead panel from a dead capture. Worth having, not worth the space. */
.diagnostics > summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 4px 0;
}

.diagnostics > summary:hover {
  color: var(--ink);
}

.diagnostics #manualConnect {
  margin: 6px 0 10px;
  width: 100%;
}

/* ── Band selector ───────────────────────────────────────────────────────
   Four bands, one editor on screen. These say which one you are on, which
   knob it drives, and whether it is muted — the three things worth knowing
   before you switch. */
.band-tabs {
  display: grid;
  /* Four bands and All. */
  grid-template-columns: repeat(4, 1fr) 1.2fr;
  gap: 6px;
  margin-top: 10px;
}

.band-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 0 5px;
  min-height: 0;
  border-color: var(--rule);
  background: transparent;
  color: var(--muted);
}

.band-tab strong { font-size: 13px; font-weight: 600; }
.band-tab span { font-size: 9px; letter-spacing: 0.08em; }

.band-tab:hover { color: var(--ink); border-color: var(--ink); }

.band-tab.active {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--cream);
}

/* A muted band stays in place and stays reachable — it just is not driving
   anything, and should not look like it is. */
.band-tab.muted { opacity: 0.45; }
.band-tab.muted strong { text-decoration: line-through; }

.spectrum-band { cursor: pointer; }
.spectrum-band.muted { opacity: 0.35; }

.mute-band {
  min-height: 26px;
  padding: 5px 8px;
  border-color: var(--rule);
  background: transparent;
  color: var(--muted);
}

.mute-band.on {
  border-color: var(--led);
  color: var(--led);
}

.hint {
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--faint);
}

/* `hidden` loses to any explicit display, and .band sets one. Say it again. */
.band[hidden] { display: none; }

.band-tab.all strong { font-size: 11px; letter-spacing: 0.06em; }

/* ── The response graph ──────────────────────────────────────────────────
   Six sliders became one picture. Left to right is how loud the band is,
   bottom to top is where the knob lands, and the line between them is every
   number at once — which is the thing the sliders could not show. */
.band-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.band-key {
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
}

.band-note { color: var(--faint); font-size: 10px; }

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.plot-wrap { display: flex; gap: 10px; }

.plot-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  width: 26px;
  height: 180px;
  padding: 2px 0;
  color: var(--faint);
  font-size: 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.plot-col { flex: 1; min-width: 0; }

.plot {
  position: relative;
  height: 180px;
  border: 1px solid var(--ink);
  background: var(--field);
  overflow: hidden;
  cursor: grab;
  /* The handles are dragged; the popup must not pan or select instead. */
  touch-action: none;
  user-select: none;
  color: var(--ink);
}

.plot:active { cursor: grabbing; }

/* the stretch of knob the music is allowed to use */
.plot-out { position: absolute; left: 0; right: 0; background: #f0e6d6; }
/* the levels this band responds to at all */
.plot-in {
  position: absolute; top: 0; bottom: 0;
  border-left: 1px dashed var(--faint);
  border-right: 1px dashed var(--faint);
}

.plot-curve { position: absolute; inset: 0; width: 100%; height: 100%; }

.plot-vline { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--led); opacity: .55; }
.plot-hline { position: absolute; left: 0; right: 0; height: 1px; background: var(--led); opacity: .55; }

.plot-dot {
  position: absolute;
  width: 9px; height: 9px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: var(--led);
  box-shadow: 0 0 0 2px var(--field);
}

/* Handles: triangles pointing at the edge they move. Input on the floor,
   output on the right wall — so which axis a handle belongs to is visible
   before it is dragged. */
.h { position: absolute; width: 14px; height: 14px; background: var(--ink); }
.h-in-min, .h-in-max { bottom: 0; margin-left: -7px; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.h-out-min, .h-out-max { right: 0; margin-top: -7px; clip-path: polygon(0 50%, 100% 0, 100% 100%); }
.h.on { background: var(--led); }

.plot-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  color: var(--faint);
  font-size: 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* The same four numbers as words, for anyone who wants to read rather than
   aim — and so a value can be checked without hovering a handle. */
.readout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 14px;
  margin-top: 12px;
  padding: 10px 11px;
  background: var(--field);
  border: 1px solid var(--rule);
}

.readout > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.readout span { color: var(--muted); font-size: 11px; }
.readout output { font-size: 11px; }

/* Boost bends the line rather than moving its ends, so it is not something
   to drag on the plot. Seven steps, and the hint says what the shape means. */
.boost-row { display: flex; align-items: center; gap: 12px; margin-top: 13px; }
.boost-steps { flex: 1; display: flex; gap: 3px; }

.boost-steps button {
  flex: 1;
  min-height: 0;
  height: 22px;
  padding: 0;
  border-color: var(--rule);
  background: var(--field);
}

.boost-steps button.soft { background: var(--cream-2); }
.boost-steps button.on { background: var(--ink); border-color: var(--ink); }
.boost-steps button:hover { border-color: var(--ink); }

.boost-row .gainOut { width: 34px; text-align: right; font-size: 11px; }
.boost-hint { margin-top: 6px; color: var(--muted); font-size: 11px; }

/* The meters said nothing about which was which. */
.meter-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.meter-row .meter { flex: 1; margin-top: 0; }

.meter-key {
  width: 26px;
  color: var(--faint);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* How much of its knob this band actually uses. The number that names a
   band which is technically working and doing nothing. */
.travelOut { width: 42px; text-align: right; font-size: 10px; color: var(--muted); }
.travelOut.weak { color: var(--led); }


/* ── The console's palette, over the extension's ──────────────────────
   The dark values, which is what a console page is by default. Light mode
   arrives from /pf-console.js: it stamps html[data-theme=light] and injects
   its own variable block, and that selector outranks :root, so these are
   simply replaced when somebody ticks Light.

   That only works for names BOTH sides know. popup.css uses two the console
   has never heard of — `--cream-2` (the console spells it --cream2) and
   `--field` (the console calls it --panel) — so in light mode those two kept
   their dark values and a few surfaces stayed black on a white page. They are
   aliases now: the value is resolved where it is used, so it follows whichever
   theme is in effect instead of being frozen here. */
:root{
  --cream:#0C0B09; --cream2:#131110; --ink:#EDE7DB; --muted:#8A8272;
  --faint:#5A5546; --rule:#242118; --led:#FF5C2E; --ok:#57B87F;
  --bad:#D9534F; --panel:#131110;
}
:root{ --cream-2: var(--cream2); --field: var(--panel); }
body{max-width:760px;margin:0 auto;padding:28px 20px 64px}
/* The console injects its own header, so the popup's brand row goes. */
.wrap-note{font-size:12px;color:var(--faint);line-height:1.45;margin:10px 0 0}
.srcline{display:flex;align-items:baseline;gap:10px;padding:9px 11px;margin-bottom:18px;
border:1px solid var(--rule);background:var(--field);border-radius:2px}
.srcline b{font-size:12px}
.srcline.warn{border-color:var(--bad)} .srcline.warn b{color:var(--bad)}
.srcline span{font-family:var(--mono,ui-monospace,monospace);font-size:11px;
color:var(--faint);margin-left:auto}
.drive{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);
padding:6px 0;margin-bottom:12px}
.drive input{accent-color:var(--led)}
</style>
</head>
<body>

<div class="srcline" id="srcline"><b id="srcName">connecting</b><span id="srcRaw"></span></div>

<label class="drive"><input type="checkbox" id="drive"> Let the room drive the knobs</label>
<p class="wrap-note" id="driveNote">Off until you turn it on: the microphone is four wires to a
breakout rather than a part on the board, and a panel without one has a floating data pin. The
meters run either way, which is also how you shape the response without the panel reacting to
every word you say.</p>

<section class="spectrum-section">
  <div class="section-head">
    <span class="label">Spectrum</span>
    <span class="hint">click a band to edit it</span>
  </div>
  <div class="spectrum-wrap">
    <canvas id="spectrum" width="760" height="220"></canvas>
    <div id="spectrumBands" class="spectrum-bands"></div>
  </div>
  <div class="spectrum-scale">
    <span>20</span>
    <span>100</span>
    <span>1k</span>
    <span>10k</span>
    <span>20k</span>
  </div>
  <!-- Four, one per knob. The spectrum above selects too; this row is here so
       switching does not depend on hitting a narrow band with the pointer. -->
  <div id="bandTabs" class="band-tabs"></div>
</section>

<template id="band-template">
  <section class="band">
    <div class="band-head">
      <strong class="band-title"></strong>
      <div class="band-actions">
        <label class="target">K
          <select class="knob">
            <option value="0">1</option>
            <option value="1">2</option>
            <option value="2">3</option>
            <option value="3">4</option>
          </select>
        </label>
        <button type="button" class="mute-band">Mute</button>
      </div>
    </div>

    <div class="band-row">
      <span class="band-key">Listens to</span>
      <output class="hzOut mono"></output>
    </div>
    <div class="hz-presets"></div>

    <div class="band-row" style="margin-top:14px">
      <span class="band-key">Response</span>
      <span class="band-note">drag the handles</span>
    </div>

    <div class="plot-wrap">
      <div class="plot-axis">
        <span>1.0</span><span>0.5</span><span>0.0</span>
      </div>
      <div class="plot-col">
        <div class="plot">
          <div class="plot-out"></div>
          <div class="plot-in"></div>
          <svg class="plot-curve" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points="" fill="none" stroke="currentColor" stroke-width="1"
                      vector-effect="non-scaling-stroke"></polyline>
          </svg>
          <div class="plot-vline"></div>
          <div class="plot-hline"></div>
          <div class="plot-dot"></div>
          <div class="h h-in-min" data-h="inMin"></div>
          <div class="h h-in-max" data-h="inMax"></div>
          <div class="h h-out-max" data-h="outMax"></div>
          <div class="h h-out-min" data-h="outMin"></div>
        </div>
        <div class="plot-scale">
          <span>quiet</span><span>how loud this band is</span><span>loud</span>
        </div>
      </div>
    </div>

    <div class="readout">
      <div><span>Ignores below</span><output class="r-in-min mono"></output></div>
      <div><span>Full at</span><output class="r-in-max mono"></output></div>
      <div><span>Knob rests at</span><output class="r-out-min mono"></output></div>
      <div><span>Knob peaks at</span><output class="r-out-max mono"></output></div>
    </div>

    <div class="boost-row">
      <span class="band-key">Boost</span>
      <div class="boost-steps"></div>
      <output class="gainOut mono"></output>
    </div>
    <div class="boost-hint"></div>

    <div class="meter-row">
      <span class="meter-key">in</span>
      <div class="meter"><div class="level"></div></div>
    </div>
    <div class="meter-row">
      <span class="meter-key">knob</span>
      <div class="meter out"><div class="output"></div></div>
      <output class="travelOut mono"></output>
    </div>
  </section>
</template>

<main id="bands"></main>

<p class="wrap-note"><b>Travel</b> is how much of its knob a band uses between silence and its
own loudest moment. Under a third and the band is there without doing anything &mdash; pull its
<em>Full at</em> handle in, or raise the boost. If a quiet room already moves the knobs, that is
the noise floor: drag <em>Ignores below</em> up until the dot sits still.</p>

<script>
var $ = function(id){ return document.getElementById(id); };

// ── Ported from the extension, verbatim ─────────────────────────────────
// These are the functions that draw and drag. They are lifted rather than
// rewritten so the two surfaces behave identically — a person who learned
// one has learned the other — and so a fix to either lands in both.
var MIN_HZ = 31.25, MAX_HZ = 8000;   // the device's analysable range, not 20..20k

// A canvas cannot inherit a CSS variable, so the spectrum has to look one up.
// Cached, because this is called four times per repaint at ten repaints a
// second, and invalidated when the console's Light switch changes the theme
// attribute on <html>.
var themeCache = {};
function themeColor(name){
  if (themeCache[name]) return themeCache[name];
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  themeCache[name] = v || '#888';
  return themeCache[name];
}
new MutationObserver(function(){ themeCache = {}; })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const clampHz = (value) => Math.max(MIN_HZ, Math.min(MAX_HZ, Number(value) || MIN_HZ));

function hzToX(hz, width) {
  const min = Math.log10(MIN_HZ);
  const max = Math.log10(MAX_HZ);
  return ((Math.log10(clampHz(hz)) - min) / (max - min)) * width;
}

function xToHz(x, width) {
  const t = Math.max(0, Math.min(1, x / Math.max(1, width)));
  const min = Math.log10(MIN_HZ);
  const max = Math.log10(MAX_HZ);
  return Math.round(10 ** (min + t * (max - min)));
}

function formatHz(value) {
  const hz = Math.round(value);
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k`;
  return String(hz);
}

function clampBandRange(band) {
  band.hzMin = clampHz(band.hzMin);
  band.hzMax = clampHz(band.hzMax);
  if (band.hzMin > band.hzMax) [band.hzMin, band.hzMax] = [band.hzMax, band.hzMin];
}

const BOOST_STEPS = [0.5, 0.8, 1.0, 1.4, 1.8, 2.2, 2.6];

// level -> knob, the same arithmetic offscreen.js runs. Kept in step by hand,
// and it has to be: the plot IS the explanation of what the audio does, so a
// curve that disagrees with the mapping is worse than no curve.
function mapBandOutput(band, level) {
  const inMin = clamp01(band.inMin);
  const inMax = Math.max(inMin + 0.01, clamp01(band.inMax));
  const gain = Math.max(0.2, Math.min(4, Number(band.gain) || 1));
  let u = clamp01((level - inMin) / (inMax - inMin));
  u = Math.pow(u, 1 / gain);
  return band.outMin + u * (band.outMax - band.outMin);
}

function boostHint(gain) {
  if (gain > 1.2) return 'Quiet bands need this — the highs carry far less energy than the bass.';
  if (gain < 0.9) return 'Softens a band that is drowning out the others.';
  return 'Straight through — what comes in is what goes out.';
}

// One graph, four handles, a live dot. Returns a repaint function the tick
// loop calls with the current level.
function buildPlot(el, band) {
  const plot = el.querySelector('.plot');
  const curve = el.querySelector('.plot-curve polyline');
  const outBand = el.querySelector('.plot-out');
  const inBand = el.querySelector('.plot-in');
  const vline = el.querySelector('.plot-vline');
  const hline = el.querySelector('.plot-hline');
  const dot = el.querySelector('.plot-dot');
  const handles = {
    inMin: el.querySelector('.h-in-min'),
    inMax: el.querySelector('.h-in-max'),
    outMin: el.querySelector('.h-out-min'),
    outMax: el.querySelector('.h-out-max')
  };
  const readout = {
    inMin: el.querySelector('.r-in-min'),
    inMax: el.querySelector('.r-in-max'),
    outMin: el.querySelector('.r-out-min'),
    outMax: el.querySelector('.r-out-max')
  };
  const hzOut = el.querySelector('.hzOut');
  const gainOut = el.querySelector('.gainOut');
  const hint = el.querySelector('.boost-hint');
  const steps = el.querySelector('.boost-steps');
  const pct = (v) => (v * 100).toFixed(1) + '%';
  // A handle sitting at 0.00 or 1.00 is half outside a clipped box, and the
  // two most reachable values are exactly those. Keep the marker inside the
  // frame while the value it reports stays honest.
  const edge = (v) => `clamp(7px, ${pct(v)}, calc(100% - 7px))`;

  steps.innerHTML = BOOST_STEPS.map(
    (g) => `<button type="button" data-g="${g}" title="${g.toFixed(1)}x"></button>`
  ).join('');

  function paintShape() {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = i / 40;
      pts.push((x * 100).toFixed(1) + ',' + ((1 - mapBandOutput(band, x)) * 100).toFixed(1));
    }
    curve.setAttribute('points', pts.join(' '));

    outBand.style.top = pct(1 - band.outMax);
    outBand.style.height = pct(Math.max(0.01, band.outMax - band.outMin));
    inBand.style.left = pct(band.inMin);
    inBand.style.width = pct(Math.max(0.01, band.inMax - band.inMin));

    handles.inMin.style.left = edge(band.inMin);
    handles.inMax.style.left = edge(band.inMax);
    handles.outMin.style.top = edge(1 - band.outMin);
    handles.outMax.style.top = edge(1 - band.outMax);

    readout.inMin.textContent = band.inMin.toFixed(2);
    readout.inMax.textContent = band.inMax.toFixed(2);
    readout.outMin.textContent = band.outMin.toFixed(2);
    readout.outMax.textContent = band.outMax.toFixed(2);

    hzOut.textContent = formatHz(band.hzMin) + ' - ' + formatHz(band.hzMax) + ' Hz';
    gainOut.textContent = band.gain.toFixed(1) + 'x';
    hint.textContent = boostHint(band.gain);

    steps.querySelectorAll('button').forEach((b) => {
      const g = Number(b.dataset.g);
      b.classList.toggle('on', Math.abs(band.gain - g) < 0.01);
      b.classList.toggle('soft', g < 1);
    });
  }

  steps.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-g]');
    if (!btn) return;
    band.gain = Number(btn.dataset.g);
    paintShape();
    persistConfig();
  });

  // Grab whichever handle the pointer landed nearest. The output pair carries
  // a small penalty so a press near a corner takes the input handle — that is
  // the one people reach for, and the frequency of the mistake is not even.
  let dragging = null;
  const at = (event) => {
    const r = plot.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - r.left) / r.width),
      y: clamp01(1 - (event.clientY - r.top) / r.height)
    };
  };

  plot.addEventListener('pointerdown', (event) => {
    const { x, y } = at(event);
    dragging = [
      ['inMin', Math.abs(x - band.inMin)],
      ['inMax', Math.abs(x - band.inMax)],
      ['outMin', Math.abs(y - band.outMin) + 0.04],
      ['outMax', Math.abs(y - band.outMax) + 0.04]
    ].sort((a, b) => a[1] - b[1])[0][0];
    handles[dragging].classList.add('on');
    plot.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  plot.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const { x, y } = at(event);
    if (dragging === 'inMin') band.inMin = Math.min(x, band.inMax - 0.05);
    if (dragging === 'inMax') band.inMax = Math.max(x, band.inMin + 0.05);
    if (dragging === 'outMin') band.outMin = Math.min(y, band.outMax - 0.05);
    if (dragging === 'outMax') band.outMax = Math.max(y, band.outMin + 0.05);
    paintShape();
  });

  const release = () => {
    if (!dragging) return;
    handles[dragging].classList.remove('on');
    dragging = null;
    renderSpectrumBands();
    persistConfig();
  };
  plot.addEventListener('pointerup', release);
  plot.addEventListener('pointercancel', release);

  paintShape();
  return { paintShape, live(level) {
    const out = mapBandOutput(band, level);
    vline.style.left = pct(level);
    hline.style.top = pct(1 - out);
    dot.style.left = pct(level);
    dot.style.top = pct(1 - out);
  } };
}

// Which band you are editing, in one move, without leaving the spectrum in
// view. The tabs carry the knob each band drives and whether it is muted,
// because that is what you want to know before switching.
function renderBandTabs() {
  const root = $('bandTabs');
  if (!root) return;
  root.innerHTML = '';
  config.bands.forEach((band, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'band-tab';
    if (index === activeBandIndex) tab.classList.add('active');
    if (band.muted) tab.classList.add('muted');
    tab.innerHTML = `<strong>${index + 1}</strong><span>K${band.knob + 1}</span>`;
    tab.title = band.muted ? `Band ${index + 1} - muted` : `Band ${index + 1} -> knob ${band.knob + 1}`;
    tab.addEventListener('click', () => selectBand(index));
    root.appendChild(tab);
  });

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'band-tab all';
  if (activeBandIndex === ALL_BANDS) all.classList.add('active');
  all.innerHTML = '<strong>All</strong><span>compare</span>';
  all.title = 'Show every band at once';
  all.addEventListener('click', () => selectBand(ALL_BANDS));
  root.appendChild(all);
}

function selectBand(index) {
  activeBandIndex = index === ALL_BANDS
    ? ALL_BANDS
    : Math.max(0, Math.min(config.bands.length - 1, index));
  bandEls.forEach((entry, i) => {
    entry.panel.hidden = activeBandIndex !== ALL_BANDS && i !== activeBandIndex;
  });
  renderBandTabs();
  renderSpectrumBands();
}

function buildBands() {
  const root = $('bands');
  const template = $('band-template');
  root.innerHTML = '';
  bandEls = [];

  config.bands.forEach((band, index) => {
    const fragment = template.content.cloneNode(true);
    const el = fragment.querySelector('.band');
    el.dataset.index = String(index);
    el.querySelector('.band-title').textContent = `Band ${index + 1}`;

    // One editor at a time unless you ask for all of them. Four stacked
    // panels meant scrolling down to change a band and back up to watch the
    // spectrum answer, over and over.
    el.hidden = activeBandIndex !== ALL_BANDS && index !== activeBandIndex;

    const knob = el.querySelector('.knob');
    knob.value = String(band.knob);
    knob.addEventListener('change', () => {
      band.knob = Math.max(0, Math.min(3, parseInt(knob.value, 10) || 0));
      renderBandTabs();
      persistConfig();
    });

    const presetRow = el.querySelector('.hz-presets');
    if (presetRow) {
      presetRow.innerHTML = HZ_PRESETS.map(
        ([name, lo, hi]) =>
          `<button type="button" class="hz-preset" data-min="${lo}" data-max="${hi}">${name}</button>`
      ).join('');
    }

    const mute = el.querySelector('.mute-band');
    const paintMute = () => {
      mute.textContent = band.muted ? 'Muted' : 'Mute';
      mute.classList.toggle('on', band.muted === true);
      mute.title = band.muted
        ? 'This band is not driving its knob'
        : 'Stop this band driving its knob';
    };
    paintMute();
    mute.addEventListener('click', (event) => {
      event.stopPropagation();
      band.muted = !band.muted;
      paintMute();
      renderBandTabs();
      renderSpectrumBands();
      persistConfig();
    });

    el.querySelectorAll('.hz-preset').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        band.hzMin = Number(btn.dataset.min);
        band.hzMax = Number(btn.dataset.max);
        clampBandRange(band);
        buildBands();
        renderSpectrumBands();
        persistConfig();
      });
    });

    const plot = buildPlot(el, band);

    bandEls.push({
      // The panel itself, not only its meters — selectBand shows and hides
      // these, and it had nothing to hold on to.
      panel: el,
      band,
      plot,
      level: el.querySelector('.level'),
      output: el.querySelector('.output'),
      travel: el.querySelector('.travelOut')
    });

    root.appendChild(fragment);
  });
}

function drawSpectrum(values) {
  const canvas = $('spectrum');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = themeColor('--field');
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = themeColor('--rule');
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = Math.round((height / 4) * i) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const barCount = Math.max(1, values.length);
  const barWidth = width / barCount;
  for (let i = 0; i < barCount; i++) {
    const v = clamp01(values[i] || 0);
    const h = Math.max(1, v * (height - 12));
    ctx.fillStyle = i % 2 ? themeColor('--muted') : themeColor('--ink');
    ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth - 1), h);
  }
}

function renderSpectrumBands() {
  const root = $('spectrumBands');
  const width = root.clientWidth || $('spectrum').clientWidth;
  root.innerHTML = '';
  config.bands.forEach((band, index) => {
    const left = hzToX(band.hzMin, width);
    const right = hzToX(band.hzMax, width);
    const el = document.createElement('div');
    el.className = 'spectrum-band';
    if (index === activeBandIndex) el.style.background = 'rgba(232, 85, 46, .26)';
    else if (activeBandIndex === ALL_BANDS) el.style.background = 'rgba(232, 85, 46, .14)';
    el.style.left = `${Math.min(left, right)}px`;
    el.style.width = `${Math.max(2, Math.abs(right - left))}px`;
    el.innerHTML = `<span>B${index + 1}</span>`;
    if (band.muted) el.classList.add('muted');
    // Select on click, and swallow the pointer so it does not also begin a
    // drag that would rewrite the band you just reached for.
    el.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      selectBand(index);
    });
    root.appendChild(el);
  });
}

function bindSpectrumDrag() {
  const wrap = document.querySelector('.spectrum-wrap');
  wrap.addEventListener('pointerdown', (event) => {
    const rect = wrap.getBoundingClientRect();
    const startHz = xToHz(event.clientX - rect.left, rect.width);
    spectrumDrag = { startHz };
    wrap.setPointerCapture(event.pointerId);
  });
  wrap.addEventListener('pointermove', (event) => {
    if (!spectrumDrag) return;
    const rect = wrap.getBoundingClientRect();
    const currentHz = xToHz(event.clientX - rect.left, rect.width);
    // Dragging rewrites one band's range, so in All view there is nothing to
    // drag — pick a band first.
    const band = config.bands[activeBandIndex];
    if (!band) return;
    band.hzMin = Math.min(spectrumDrag.startHz, currentHz);
    band.hzMax = Math.max(spectrumDrag.startHz, currentHz);
    clampBandRange(band);
    buildBands();
    renderSpectrumBands();
  });
  wrap.addEventListener('pointerup', (event) => {
    if (!spectrumDrag) return;
    spectrumDrag = null;
    wrap.releasePointerCapture(event.pointerId);
    persistConfig();
  });
}

// Named ranges, offered per band. The device console has had these since it
// shipped; dragging a slider to find "bass" is not a thing anyone should do.
const HZ_PRESETS = [
  ['Sub',     20,   60],
  ['Bass',    60,   250],
  ['Low mid', 250,  500],
  ['Mid',     500,  2000],
  ['Hi mid',  2000, 4000],
  ['High',    4000, 16000]
];

// Bands are indexed 0..3; this is the fifth choice — every editor at once,
// for setting one band against the others rather than one at a time.
const ALL_BANDS = -1;

// ── The device half ─────────────────────────────────────────────────────
//
// Everything above came from a popup whose settings live in chrome.storage
// and whose levels arrive over a port. Here the settings live on the panel
// and the levels are polled, and the difference matters in exactly one way:
//
//   THE PAGE OWNS THE CONFIG. It is read once, at load. After that the page
//   is the truth and writes to the device; the poll brings back levels and
//   nothing else.
//
// The first version of this page re-read the whole config every 100 ms and
// tried to decide, per tick, whether the user was mid-gesture. Any POST that
// had not landed yet lost, so a dragged handle sprang back and the controls
// felt stuck. There is no clever version of that. One owner, one direction.
var config = { bands: [] };
var state = null;              // last levels payload
var bandEls = [];
var activeBandIndex = 0;
var spectrumDrag = null;
var saveTimer = null;
var pending = {};

// Debounced, and coalesced per band: dragging emits pointer-rate changes and
// this panel answers one connection at a time.
function persistConfig() {
  config.bands.forEach(function(b, i){ pending[i] = b; });
  if (saveTimer) return;
  saveTimer = setTimeout(function(){
    saveTimer = null;
    var jobs = Object.keys(pending);
    pending = {};
    jobs.forEach(function(i){
      var b = config.bands[i];
      var body = 'band=' + i +
        '&hzMin=' + b.hzMin.toFixed(1) + '&hzMax=' + b.hzMax.toFixed(1) +
        '&inMin=' + b.inMin.toFixed(4) + '&inMax=' + b.inMax.toFixed(4) +
        '&gain=' + b.gain.toFixed(3) +
        '&outMin=' + b.outMin.toFixed(3) + '&outMax=' + b.outMax.toFixed(3) +
        '&knob=' + b.knob + '&muted=' + (b.muted ? '1' : '0');
      var x = new XMLHttpRequest();
      x.open('POST', '/api/audio-in');
      x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      x.send(body);
    });
  }, 200);
}

// Levels only. One request in flight at a time, chained rather than on an
// interval: this web server takes one connection, and a timer that fires
// while the last request is still open queues them up until every reading is
// stale and the page feels like it is dragging behind the sound.
var polling = false;
function poll() {
  if (polling) return;
  polling = true;
  var x = new XMLHttpRequest();
  x.open('GET', '/api/audio-in?levels=1');
  x.onloadend = function(){
    polling = false;
    var d = null;
    try { d = JSON.parse(x.responseText); } catch (e) {}
    if (d) { state = d; paintLive(); }
    setTimeout(poll, 90);
  };
  x.send();
}

// The tail of the extension's renderState(), which is the part that is not
// about capture status. Kept in the extension's own terms — levels, outputs,
// spectrum, entry.plot.live, the 0.995 peak decay — so it stays comparable to
// the file it came from.
function paintLive() {
  if (!state) return;

  var live = state.source === 'pdm';
  $('srcline').className = 'srcline' + (live ? '' : ' warn');
  $('srcName').textContent = live ? 'Microphone' : state.source;
  $('srcRaw').textContent = 'peak ' + Number(state.rawPeak).toFixed(5) +
                            '  dc ' + Number(state.rawDc).toFixed(5);

  var levels = state.levels || [];
  var outputs = state.outputs || [];
  for (var i = 0; i < bandEls.length; i++) {
    var entry = bandEls[i];
    var level = levels[i] || 0;
    entry.level.style.width = Math.round(level * 100) + '%';
    entry.output.style.width = Math.round((outputs[i] || 0) * 100) + '%';
    // The dot is the point of the graph: it says where this sound lands, and
    // it is the only part that can tell you a band is doing nothing.
    if (entry.plot) entry.plot.live(level);

    if (entry.travel) {
      var b = entry.band;
      entry.peak = Math.max(level, (entry.peak || 0) * 0.995);
      var span = Math.max(0.01, b.outMax - b.outMin);
      var travel = (mapBandOutput(b, entry.peak) - mapBandOutput(b, 0)) / span;
      entry.travel.textContent = Math.round(Math.min(1, travel) * 100) + '%';
      entry.travel.classList.toggle('weak', travel < 0.34);
      entry.travel.title = travel < 0.34
        ? 'This band is barely moving its knob - pull "Full at" left, or add boost'
        : 'How much of its knob this band is using';
    }
  }
  drawSpectrum(state.spectrum || []);
}

// Read the config once, build the UI from it, then start the level poll.
(function start(){
  var x = new XMLHttpRequest();
  x.open('GET', '/api/audio-in');
  x.onload = function(){
    var d = JSON.parse(x.responseText);
    if (d.hzRange && d.hzRange.length === 2) { MIN_HZ = d.hzRange[0]; MAX_HZ = d.hzRange[1]; }
    config.bands = d.bands.map(function(b, i){
      return { hzMin: b.hzMin, hzMax: b.hzMax, inMin: b.inMin, inMax: b.inMax,
               gain: b.gain, outMin: b.outMin, outMax: b.outMax,
               knob: b.knob, muted: b.muted === true };
    });
    $('drive').checked = !!d.driving;
    buildBands();
    renderBandTabs();
    renderSpectrumBands();
    bindSpectrumDrag();
    selectBand(0);
    poll();
  };
  x.send();
})();

$('drive').addEventListener('change', function(){
  var x = new XMLHttpRequest();
  x.open('POST', '/api/audio-in');
  x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  x.send('driving=' + ($('drive').checked ? '1' : '0'));
});
</script>
</body></html>
)HTML";
