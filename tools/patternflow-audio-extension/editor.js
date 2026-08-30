// Patternflow Audio — the mapping editor.
//
// One module, no chrome.* and no fetch: everything outside this file arrives
// through window.PFAdapter (editor-adapter.js). The console port copies this
// file verbatim and swaps the adapter.
//
// The model, in one sentence: a band is a BOX drawn on the live spectrum
// (width = the frequencies it listens to, height = the level window it maps),
// and a RESPONSE CURVE that turns position-in-window into position-in-output-
// range. Curves bake to a 33-point table on save; the analysis side — and
// later the firmware — only interpolates, and never learns what a bezier is.

'use strict';

const A = window.PFAdapter;

// ── config ──────────────────────────────────────────────────────────────

const HZ_DEFAULTS = [[60, 250], [250, 2000], [2000, 5000], [5000, 16000]];
const LUT_POINTS = 33;

const PRESETS = {
  smooth: { label: 'Smooth', curve: { type: 'bezier', id: 'smooth', y0: 0, y1: 1, p1x: 0.45, p1y: 0.05, p2x: 0.55, p2y: 0.95 } },
  sharp:  { label: 'Sharp',  curve: { type: 'bezier', id: 'sharp',  y0: 0, y1: 1, p1x: 0.10, p1y: 0.65, p2x: 0.35, p2y: 1.00 } },
  fall:   { label: 'Fall',   curve: { type: 'bezier', id: 'fall',   y0: 1, y1: 0, p1x: 0.45, p1y: 0.95, p2x: 0.55, p2y: 0.05 } },
  gate:   { label: 'Gate',   curve: { type: 'steps',  id: 'gate',  n: 2 } },
  steps:  { label: 'Steps',  curve: { type: 'steps',  id: 'steps', n: 3 } },
  arch:   { label: 'Arch',   curve: { type: 'arch',   id: 'arch' } }
};

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const clampHz = (v) => Math.max(CAPS.hzMin, Math.min(CAPS.hzMax, Number(v) || CAPS.hzMin));

const CAPS = A.caps();

function defaultBand(index) {
  const [hzMin, hzMax] = HZ_DEFAULTS[index % HZ_DEFAULTS.length];
  return {
    hzMin, hzMax,
    knob: Math.min(index, 3), muted: false,
    inMin: 0, inMax: 1, gain: 1,
    outMin: 0.30, outMax: 0.85,
    curve: null, lut: null
  };
}

function normalizeBand(raw, index) {
  const band = { ...defaultBand(index), ...(raw || {}) };
  band.hzMin = clampHz(band.hzMin); band.hzMax = clampHz(band.hzMax);
  if (band.hzMin > band.hzMax) [band.hzMin, band.hzMax] = [band.hzMax, band.hzMin];
  if (band.hzMax - band.hzMin < 10) band.hzMax = Math.min(CAPS.hzMax, band.hzMin + 10);
  band.inMin = clamp01(band.inMin); band.inMax = clamp01(band.inMax);
  if (band.inMax - band.inMin < 0.02) band.inMax = Math.min(1, band.inMin + 0.02);
  band.outMin = clamp01(band.outMin); band.outMax = clamp01(band.outMax);
  if (band.outMax - band.outMin < 0.05) band.outMax = Math.min(1, band.outMin + 0.05);
  band.knob = Math.max(0, Math.min(3, Number(band.knob) || 0));
  band.muted = band.muted === true;
  band.gain = Math.max(0.2, Math.min(4, Number(band.gain) || 1));
  if (band.curve && typeof band.curve !== 'object') band.curve = null;
  if (band.lut && (!Array.isArray(band.lut) || band.lut.length < 2)) band.lut = null;
  return band;
}

function normalizeConfig(raw) {
  const stored = Array.isArray(raw && raw.bands) ? raw.bands : [];
  const bands = [];
  for (let i = 0; i < 4; i++) bands.push(normalizeBand(stored[i], i));
  return {
    host: (raw && raw.host) || 'patternflow.local',
    smoothing: (raw && raw.smoothing) || 0.35,
    sendIntervalMs: (raw && raw.sendIntervalMs) || 33,
    autoRange: !!(raw && raw.autoRange),
    bands,
    ...(raw && raw.manualExtra ? { manualExtra: raw.manualExtra } : {})
  };
}

// ── curve engine ────────────────────────────────────────────────────────

function evalCurve(curve, u) {
  u = clamp01(u);
  if (!curve) return u;
  if (curve.type === 'steps') {
    const n = Math.max(2, Math.min(8, Math.round(curve.n) || 2));
    const k = Math.min(n - 1, Math.floor(u * n));
    return k / (n - 1);
  }
  if (curve.type === 'arch') return Math.sin(Math.PI * u);
  if (curve.type === 'bezier') {
    // Cubic from (0, y0) to (1, y1); x(t) is monotone while both control xs
    // stay in [0,1], so a short bisection recovers t for any u.
    const { y0 = 0, y1 = 1, p1x, p1y, p2x, p2y } = curve;
    const bx = (t) => 3 * (1 - t) * (1 - t) * t * p1x + 3 * (1 - t) * t * t * p2x + t * t * t;
    const by = (t) => (1 - t) * (1 - t) * (1 - t) * y0 + 3 * (1 - t) * (1 - t) * t * p1y + 3 * (1 - t) * t * t * p2y + t * t * t * y1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < u) lo = mid; else hi = mid;
    }
    return clamp01(by((lo + hi) / 2));
  }
  return u;
}

function legacyCurve(band, u) {
  return Math.pow(clamp01(u), 1 / band.gain);
}

function bandCurveValue(band, u) {
  return band.curve ? evalCurve(band.curve, u) : legacyCurve(band, u);
}

function bakeLut(curve) {
  const lut = [];
  for (let i = 0; i < LUT_POINTS; i++) {
    lut.push(Number(evalCurve(curve, i / (LUT_POINTS - 1)).toFixed(4)));
  }
  return lut;
}

// ── state ───────────────────────────────────────────────────────────────

let cfg = normalizeConfig(null);
let sel = 0;
let frame = { levels: [], env: [], spectrum: [], running: false, connected: false };
let lastEnv = null;   // most recent non-empty env, for the auto→manual handoff
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => A.saveConfig(cfg), 150);
}

function touchCurve(band, curve) {
  band.curve = curve;
  band.lut = bakeLut(curve);
}

// ── main plot geometry ──────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const plotCanvas = $('plot');
const pctx = plotCanvas.getContext('2d');
const M = { l: 48, r: 6, t: 22, b: 40 };
let PW = 0, PH = 0;   // plot area, css px

function sizePlot() {
  const wrap = $('plotWrap');
  const cssW = wrap.clientWidth;
  const cssH = 400;
  const dpr = window.devicePixelRatio || 1;
  plotCanvas.width = Math.round(cssW * dpr);
  plotCanvas.height = Math.round(cssH * dpr);
  plotCanvas.style.width = cssW + 'px';
  plotCanvas.style.height = cssH + 'px';
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  PW = cssW - M.l - M.r;
  PH = cssH - M.t - M.b;
}

const DECADES = Math.log10(CAPS.hzMax / CAPS.hzMin);
const xOf = (hz) => M.l + PW * (Math.log10(clampHz(hz) / CAPS.hzMin) / DECADES);
const hzOf = (x) => clampHz(CAPS.hzMin * Math.pow(10, DECADES * ((x - M.l) / PW)));
const yOf = (v) => M.t + (1 - clamp01(v)) * PH;
const vOf = (y) => clamp01(1 - (y - M.t) / PH);

const TICKS = [[20, '20'], [50, '50'], [100, '100'], [200, '200'], [500, '500'],
  [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k']];
const DB_LINES = [[1, '0'], [0.75, '-18'], [0.5, '-35'], [0.25, '-53'], [0, '-70']];

// The window a band maps right now: its own handles, or the breathing
// envelope while auto range runs.
function bandWindow(index) {
  const band = cfg.bands[index];
  if (cfg.autoRange) {
    const env = (frame.env && frame.env[index]) || (lastEnv && lastEnv[index]);
    if (env) return { lo: clamp01(env.lo), hi: clamp01(env.hi) };
    return { lo: 0.1, hi: 0.7 };
  }
  return { lo: band.inMin, hi: band.inMax };
}

function formatHz(hz) {
  return hz >= 1000 ? (hz / 1000).toFixed(hz >= 9950 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(hz));
}

// ── main plot drawing ───────────────────────────────────────────────────

const MONO = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function drawPlot() {
  const W = M.l + PW + M.r, H = M.t + PH + M.b;
  pctx.clearRect(0, 0, W, H);
  pctx.fillStyle = '#fbf7ef';
  pctx.fillRect(0, 0, W, H);

  // grid
  pctx.font = MONO;
  pctx.strokeStyle = 'rgba(217, 209, 192, 0.55)';
  pctx.fillStyle = '#a69f90';
  pctx.lineWidth = 1;
  for (const [v, label] of DB_LINES) {
    const y = Math.round(yOf(v)) + 0.5;
    if (v > 0 && v < 1) {
      pctx.beginPath(); pctx.moveTo(M.l, y); pctx.lineTo(M.l + PW, y); pctx.stroke();
    }
    pctx.textAlign = 'right';
    pctx.fillText(label, M.l - 8, y + 3);
  }
  pctx.textAlign = 'center';
  for (const [hz, label] of TICKS) {
    const x = Math.round(xOf(hz)) + 0.5;
    if (hz > CAPS.hzMin && hz < CAPS.hzMax) {
      pctx.beginPath(); pctx.moveTo(x, M.t); pctx.lineTo(x, M.t + PH); pctx.stroke();
    }
    pctx.fillText(label, x, M.t + PH + 16);
  }
  pctx.strokeStyle = '#d9d1c0';
  pctx.beginPath(); pctx.moveTo(M.l, M.t + PH + 0.5); pctx.lineTo(M.l + PW, M.t + PH + 0.5); pctx.stroke();

  // spectrum staircase
  const spec = frame.spectrum || [];
  if (spec.length > 1) {
    pctx.fillStyle = 'rgba(20, 20, 20, 0.14)';
    pctx.beginPath();
    pctx.moveTo(M.l, yOf(spec[0]));
    const bw = PW / spec.length;
    for (let i = 0; i < spec.length; i++) {
      const y = yOf(spec[i]);
      pctx.lineTo(M.l + i * bw, y);
      pctx.lineTo(M.l + (i + 1) * bw, y);
    }
    pctx.lineTo(M.l + PW, M.t + PH);
    pctx.lineTo(M.l, M.t + PH);
    pctx.closePath();
    pctx.fill();
  }

  // boxes
  cfg.bands.forEach((band, i) => {
    const win = bandWindow(i);
    const x0 = xOf(band.hzMin), x1 = xOf(band.hzMax);
    const yTop = yOf(win.hi), yBot = yOf(win.lo);
    const isSel = i === sel;
    const stroke = isSel ? '#e8552e' : (band.muted ? '#a69f90' : '#141414');
    const alpha = band.muted ? 0.04 : (isSel ? 0.12 : 0.07);

    pctx.fillStyle = 'rgba(232, 85, 46, ' + alpha + ')';
    pctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);

    pctx.strokeStyle = stroke;
    pctx.lineWidth = isSel ? 1.5 : 1;
    pctx.beginPath(); pctx.moveTo(x0, yTop); pctx.lineTo(x0, yBot); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(x1, yTop); pctx.lineTo(x1, yBot); pctx.stroke();
    if (cfg.autoRange) pctx.setLineDash([5, 4]);
    pctx.beginPath(); pctx.moveTo(x0, yTop); pctx.lineTo(x1, yTop); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(x0, yBot); pctx.lineTo(x1, yBot); pctx.stroke();
    pctx.setLineDash([]);

    // live level as a horizontal line across the box — the band's average,
    // read the same way as the spectrum behind it
    const level = (frame.levels && frame.levels[i]) || 0;
    const ly = yOf(level);
    pctx.strokeStyle = '#e8552e';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x0 + 1, ly);
    pctx.lineTo(x1 - 1, ly);
    pctx.stroke();

    if (isSel) {
      pctx.fillStyle = '#fbf7ef';
      pctx.strokeStyle = '#141414';
      pctx.lineWidth = 1;
      for (const [cx, cy] of [[x0, yTop], [x1, yTop], [x0, yBot], [x1, yBot]]) {
        pctx.fillRect(cx - 3.5, cy - 3.5, 7, 7);
        pctx.strokeRect(cx - 3.5, cy - 3.5, 7, 7);
      }
    }
  });

  placeTags();
}

function placeTags() {
  cfg.bands.forEach((band, i) => {
    const tag = $('tag' + i);
    const win = bandWindow(i);
    tag.style.left = Math.round(xOf(band.hzMin)) + 'px';
    tag.style.top = Math.round(yOf(win.hi) - 11) + 'px';
    tag.classList.toggle('sel', i === sel);
    tag.classList.toggle('mutedTag', band.muted);
    tag.querySelector('.tagText').textContent = 'B' + (i + 1) + '·K' + (band.knob + 1) + (band.muted ? '·M' : '');
    drawGlyph(tag.querySelector('canvas'), band, 18, 12);
  });
}

// tiny curve glyph, used by tags and footer chips
function drawGlyph(canvas, band, w, h) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#141414';
  g.lineWidth = 1.4;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const v = bandCurveValue(band, u);
    const x = 2 + u * (w - 4);
    const y = h - 2 - v * (h - 4);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

// ── main plot interaction ───────────────────────────────────────────────

const EDGE = 7;
let drag = null;

function hitTest(x, y) {
  // Selected band's edges win first — reaching for a handle should not
  // reselect the neighbour underneath it.
  const order = [sel, ...cfg.bands.map((_, i) => i).filter((i) => i !== sel)];
  for (const i of order) {
    const band = cfg.bands[i];
    const win = bandWindow(i);
    const x0 = xOf(band.hzMin), x1 = xOf(band.hzMax);
    const yTop = yOf(win.hi), yBot = yOf(win.lo);
    const insideX = x > x0 - EDGE && x < x1 + EDGE;
    const insideY = y > yTop - EDGE && y < yBot + EDGE;
    if (!insideX || !insideY) continue;
    const nearL = Math.abs(x - x0) <= EDGE, nearR = Math.abs(x - x1) <= EDGE;
    const nearT = Math.abs(y - yTop) <= EDGE, nearB = Math.abs(y - yBot) <= EDGE;
    // Corners first — a grab there resizes both axes at once.
    if (nearL && nearT) return { band: i, mode: 'tl' };
    if (nearR && nearT) return { band: i, mode: 'tr' };
    if (nearL && nearB) return { band: i, mode: 'bl' };
    if (nearR && nearB) return { band: i, mode: 'br' };
    if (nearL) return { band: i, mode: 'l' };
    if (nearR) return { band: i, mode: 'r' };
    if (nearT) return { band: i, mode: 't' };
    if (nearB) return { band: i, mode: 'b' };
    if (x > x0 && x < x1 && y > yTop && y < yBot) return { band: i, mode: 'move' };
  }
  return null;
}

// Grabbing a breathing edge is the gesture that says "I'll take it from
// here": auto range switches off, and every band's window is seeded from the
// envelope it was just breathing at, so nothing jumps.
function freezeAutoWindows() {
  const env = (frame.env && frame.env.length ? frame.env : lastEnv) || [];
  cfg.bands.forEach((band, i) => {
    const e = env[i];
    if (!e) return;
    band.inMin = clamp01(e.lo);
    band.inMax = Math.max(band.inMin + 0.02, clamp01(e.hi));
  });
  cfg.autoRange = false;
  syncAutoToggle();
}

function plotPointer(event) {
  const rect = plotCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

plotCanvas.addEventListener('pointerdown', (event) => {
  const { x, y } = plotPointer(event);
  const hit = hitTest(x, y);
  if (!hit) return;
  if (hit.band !== sel) selectBand(hit.band);
  if (cfg.autoRange && hit.mode !== 'move' && hit.mode !== 'l' && hit.mode !== 'r') {
    freezeAutoWindows();  // any grab that touches a breathing edge takes over
  }
  const band = cfg.bands[hit.band];
  const win = bandWindow(hit.band);
  drag = {
    ...hit,
    startX: x, startY: y,
    hzMin: band.hzMin, hzMax: band.hzMax,
    lo: win.lo, hi: win.hi
  };
  plotCanvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

plotCanvas.addEventListener('pointermove', (event) => {
  const { x, y } = plotPointer(event);
  if (!drag) {
    const hit = hitTest(x, y);
    plotCanvas.style.cursor = !hit ? 'default'
      : hit.mode === 'move' ? 'move'
      : (hit.mode === 'tl' || hit.mode === 'br') ? 'nwse-resize'
      : (hit.mode === 'tr' || hit.mode === 'bl') ? 'nesw-resize'
      : (hit.mode === 'l' || hit.mode === 'r') ? 'ew-resize' : 'ns-resize';
    return;
  }
  const band = cfg.bands[drag.band];
  const MINR = 1.12;   // narrowest box, as a frequency ratio

  if (drag.mode === 'move') {
    // Translate in log-frequency: the box keeps its RATIO width, which is
    // what a log axis means by "same size somewhere else".
    const shift = (x - drag.startX) / PW * DECADES;
    let ratio = Math.pow(10, shift);
    ratio = Math.max(CAPS.hzMin / drag.hzMin, Math.min(CAPS.hzMax / drag.hzMax, ratio));
    band.hzMin = drag.hzMin * ratio;
    band.hzMax = drag.hzMax * ratio;
    if (!cfg.autoRange) {
      const dv = vOf(y) - vOf(drag.startY);
      const span = drag.hi - drag.lo;
      const lo = Math.max(0, Math.min(1 - span, drag.lo + dv));
      band.inMin = lo;
      band.inMax = lo + span;
    }
  } else {
    // Edges and corners share the same four moves; a corner just does two.
    if (drag.mode.includes('l')) band.hzMin = Math.min(hzOf(x), band.hzMax / MINR);
    if (drag.mode.includes('r')) band.hzMax = Math.max(hzOf(x), band.hzMin * MINR);
    if (drag.mode.includes('t')) band.inMax = Math.max(vOf(y), band.inMin + 0.02);
    if (drag.mode.includes('b')) band.inMin = Math.min(vOf(y), band.inMax - 0.02);
  }
  drawPlot();
  renderChips();
  renderSettings();
});

const releasePlot = () => {
  if (!drag) return;
  drag = null;
  persist();
};
plotCanvas.addEventListener('pointerup', releasePlot);
plotCanvas.addEventListener('pointercancel', releasePlot);

// ── curve panel ─────────────────────────────────────────────────────────

const curveCanvas = $('curve');
const cctx = curveCanvas.getContext('2d');
const CM = { l: 30, r: 10, t: 12, b: 26 };
let CW = 0, CH = 0;
let curveDrag = null;

function sizeCurve() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = 356, cssH = 218;
  curveCanvas.width = cssW * dpr; curveCanvas.height = cssH * dpr;
  curveCanvas.style.width = cssW + 'px'; curveCanvas.style.height = cssH + 'px';
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CW = cssW - CM.l - CM.r; CH = cssH - CM.t - CM.b;
}

const cxOf = (u) => CM.l + clamp01(u) * CW;
const cyOf = (v) => CM.t + (1 - clamp01(v)) * CH;

function drawCurve() {
  const band = cfg.bands[sel];
  const W = CM.l + CW + CM.r, H = CM.t + CH + CM.b;
  cctx.clearRect(0, 0, W, H);

  cctx.fillStyle = '#f4efe6';
  cctx.fillRect(CM.l, CM.t, CW, CH);
  cctx.strokeStyle = '#d9d1c0';
  cctx.lineWidth = 1;
  cctx.strokeRect(CM.l + 0.5, CM.t + 0.5, CW - 1, CH - 1);
  cctx.strokeStyle = 'rgba(217, 209, 192, 0.5)';
  cctx.beginPath(); cctx.moveTo(cxOf(0.5), CM.t); cctx.lineTo(cxOf(0.5), CM.t + CH); cctx.stroke();
  cctx.beginPath(); cctx.moveTo(CM.l, cyOf(0.5)); cctx.lineTo(CM.l + CW, cyOf(0.5)); cctx.stroke();

  // curve
  cctx.strokeStyle = '#141414';
  cctx.lineWidth = 2;
  cctx.lineCap = 'round';
  cctx.beginPath();
  const steps = band.curve && band.curve.type === 'steps';
  const N = steps ? 200 : 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const v = bandCurveValue(band, u);
    const x = cxOf(u), y = cyOf(v);
    if (i === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y);
  }
  cctx.stroke();

  // bezier handles
  if (band.curve && band.curve.type === 'bezier') {
    const c = band.curve;
    cctx.strokeStyle = '#a69f90';
    cctx.setLineDash([2, 3]);
    cctx.beginPath(); cctx.moveTo(cxOf(0), cyOf(c.y0)); cctx.lineTo(cxOf(c.p1x), cyOf(c.p1y)); cctx.stroke();
    cctx.beginPath(); cctx.moveTo(cxOf(1), cyOf(c.y1)); cctx.lineTo(cxOf(c.p2x), cyOf(c.p2y)); cctx.stroke();
    cctx.setLineDash([]);
    cctx.fillStyle = '#e8552e';
    cctx.strokeStyle = '#141414';
    cctx.lineWidth = 1;
    for (const [hx, hy] of [[c.p1x, c.p1y], [c.p2x, c.p2y]]) {
      cctx.fillRect(cxOf(hx) - 3.5, cyOf(hy) - 3.5, 7, 7);
      cctx.strokeRect(cxOf(hx) - 3.5, cyOf(hy) - 3.5, 7, 7);
    }
  }

  // live cursor: where the music is on this curve right now
  const win = bandWindow(sel);
  const level = (frame.levels && frame.levels[sel]) || 0;
  const u = clamp01((level - win.lo) / Math.max(0.001, win.hi - win.lo));
  const v = bandCurveValue(band, u);
  cctx.strokeStyle = '#e8552e';
  cctx.setLineDash([3, 3]);
  cctx.lineWidth = 1;
  cctx.beginPath(); cctx.moveTo(cxOf(u), CM.t + CH); cctx.lineTo(cxOf(u), cyOf(v)); cctx.stroke();
  cctx.setLineDash([]);
  cctx.fillStyle = '#e8552e';
  cctx.beginPath(); cctx.arc(cxOf(u), cyOf(v), 4.5, 0, Math.PI * 2); cctx.fill();

  // labels
  cctx.font = MONO;
  cctx.fillStyle = '#a69f90';
  cctx.textAlign = 'left';
  cctx.fillText(cfg.autoRange ? 'in auto' : 'in ' + win.lo.toFixed(2), CM.l, CM.t + CH + 16);
  cctx.textAlign = 'right';
  cctx.fillText(cfg.autoRange ? '' : win.hi.toFixed(2), CM.l + CW, CM.t + CH + 16);
  cctx.fillText(cfg.bands[sel].outMax.toFixed(2), CM.l - 6, CM.t + 8);
  cctx.fillText(cfg.bands[sel].outMin.toFixed(2), CM.l - 6, CM.t + CH);
  cctx.textAlign = 'left';
  cctx.fillText(u.toFixed(2) + ' → ' + (cfg.bands[sel].outMin + v * (cfg.bands[sel].outMax - cfg.bands[sel].outMin)).toFixed(2), CM.l + 6, CM.t + 12);
}

curveCanvas.addEventListener('pointerdown', (event) => {
  const band = cfg.bands[sel];
  if (!band.curve || band.curve.type !== 'bezier') return;
  const rect = curveCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const c = band.curve;
  const near = (hx, hy) => Math.hypot(x - cxOf(hx), y - cyOf(hy)) < 12;
  if (near(c.p1x, c.p1y)) curveDrag = 'p1';
  else if (near(c.p2x, c.p2y)) curveDrag = 'p2';
  else return;
  curveCanvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

curveCanvas.addEventListener('pointermove', (event) => {
  if (!curveDrag) return;
  const rect = curveCanvas.getBoundingClientRect();
  const u = clamp01((event.clientX - rect.left - CM.l) / CW);
  const v = clamp01(1 - (event.clientY - rect.top - CM.t) / CH);
  const band = cfg.bands[sel];
  const c = band.curve;
  if (curveDrag === 'p1') { c.p1x = u; c.p1y = v; }
  else { c.p2x = u; c.p2y = v; }
  c.id = 'custom';
  band.lut = bakeLut(c);
  drawCurve();
  renderPresetChips();
  placeTags();
});

const releaseCurve = () => {
  if (!curveDrag) return;
  curveDrag = null;
  persist();
  renderChips();
};
curveCanvas.addEventListener('pointerup', releaseCurve);
curveCanvas.addEventListener('pointercancel', releaseCurve);

// ── presets, steps, settings column ─────────────────────────────────────

function renderPresetChips() {
  const band = cfg.bands[sel];
  const id = band.curve ? (band.curve.id || 'custom') : null;
  document.querySelectorAll('.preset').forEach((el) => {
    el.classList.toggle('on', el.dataset.p === id);
  });
  $('legacyHint').hidden = !!band.curve;
  $('stepsRow').hidden = !(band.curve && band.curve.type === 'steps');
  if (band.curve && band.curve.type === 'steps') $('stepsN').textContent = String(band.curve.n);
  document.querySelectorAll('.preset canvas').forEach((canvas) => {
    const preset = PRESETS[canvas.parentElement.dataset.p];
    drawGlyph(canvas, { curve: preset.curve, gain: 1 }, 40, 24);
  });
}

document.querySelectorAll('.preset').forEach((el) => {
  el.addEventListener('click', () => {
    const preset = PRESETS[el.dataset.p];
    if (!preset) return;
    touchCurve(cfg.bands[sel], structuredClone(preset.curve));
    drawCurve();
    renderPresetChips();
    placeTags();
    renderChips();
    persist();
  });
});

$('stepsMinus').addEventListener('click', () => stepsAdjust(-1));
$('stepsPlus').addEventListener('click', () => stepsAdjust(1));
function stepsAdjust(delta) {
  const band = cfg.bands[sel];
  if (!band.curve || band.curve.type !== 'steps') return;
  band.curve.n = Math.max(2, Math.min(8, band.curve.n + delta));
  band.curve.id = band.curve.n === 2 ? 'gate' : 'steps';
  band.lut = bakeLut(band.curve);
  drawCurve();
  renderPresetChips();
  placeTags();
  renderChips();
  persist();
}

function renderSettings() {
  const band = cfg.bands[sel];
  $('bandName').textContent = 'Band ' + (sel + 1);
  $('bandMeta').textContent = formatHz(band.hzMin) + ' – ' + formatHz(band.hzMax) + ' Hz'
    + (cfg.autoRange ? ' · in auto' : ' · in ' + band.inMin.toFixed(2) + '–' + band.inMax.toFixed(2));
  document.querySelectorAll('.knobBtn').forEach((el, i) => {
    el.classList.toggle('on', i === band.knob);
  });
  $('outLabel').textContent = band.outMin.toFixed(2) + ' – ' + band.outMax.toFixed(2);
  const track = $('outTrack');
  const w = track.clientWidth - 10;
  $('outLo').style.left = (5 + band.outMin * w - 5) + 'px';
  $('outHi').style.left = (5 + band.outMax * w - 5) + 'px';
  $('outFill').style.left = (5 + band.outMin * w) + 'px';
  $('outFill').style.width = Math.max(0, (band.outMax - band.outMin) * w) + 'px';
  $('muteToggle').classList.toggle('on', band.muted);
}

document.querySelectorAll('.knobBtn').forEach((el, i) => {
  el.addEventListener('click', () => {
    cfg.bands[sel].knob = i;
    renderSettings(); renderChips(); placeTags(); persist();
  });
});

let outDrag = null;
$('outTrack').addEventListener('pointerdown', (event) => {
  const band = cfg.bands[sel];
  const rect = $('outTrack').getBoundingClientRect();
  const v = clamp01((event.clientX - rect.left - 5) / (rect.width - 10));
  outDrag = Math.abs(v - band.outMin) < Math.abs(v - band.outMax) ? 'lo' : 'hi';
  $('outTrack').setPointerCapture(event.pointerId);
  event.preventDefault();
});
$('outTrack').addEventListener('pointermove', (event) => {
  if (!outDrag) return;
  const band = cfg.bands[sel];
  const rect = $('outTrack').getBoundingClientRect();
  const v = clamp01((event.clientX - rect.left - 5) / (rect.width - 10));
  if (outDrag === 'lo') band.outMin = Math.min(v, band.outMax - 0.05);
  else band.outMax = Math.max(v, band.outMin + 0.05);
  renderSettings(); drawCurve();
});
const releaseOut = () => { if (outDrag) { outDrag = null; persist(); } };
$('outTrack').addEventListener('pointerup', releaseOut);
$('outTrack').addEventListener('pointercancel', releaseOut);

$('muteToggle').addEventListener('click', () => {
  const band = cfg.bands[sel];
  band.muted = !band.muted;
  renderSettings(); renderChips(); drawPlot(); persist();
});

$('resetBand').addEventListener('click', () => {
  cfg.bands[sel] = defaultBand(sel);
  touchCurve(cfg.bands[sel], structuredClone(PRESETS.smooth.curve));
  selectBand(sel);
  persist();
});

// ── footer chips ────────────────────────────────────────────────────────

function renderChips() {
  cfg.bands.forEach((band, i) => {
    const chip = $('chip' + i);
    chip.classList.toggle('sel', i === sel);
    chip.classList.toggle('mutedChip', band.muted);
    chip.querySelector('.chipName').textContent = 'B' + (i + 1);
    chip.querySelector('.chipHz').textContent = formatHz(band.hzMin) + '–' + formatHz(band.hzMax);
    chip.querySelector('.chipKnob').textContent = 'K' + (band.knob + 1);
    drawGlyph(chip.querySelector('canvas'), band, 18, 12);
  });
}

for (let i = 0; i < 4; i++) {
  $('chip' + i).addEventListener('click', () => selectBand(i));
}

function selectBand(index) {
  sel = Math.max(0, Math.min(3, index));
  drawPlot();
  drawCurve();
  renderPresetChips();
  renderSettings();
  renderChips();
}

// ── auto toggle, status, wiring ─────────────────────────────────────────

function syncAutoToggle() {
  $('autoToggle').classList.toggle('on', cfg.autoRange);
  $('autoHint').textContent = cfg.autoRange
    ? 'boxes breathe with the room — drag a top or bottom edge to take manual control'
    : 'manual windows — the box edges are exactly what maps';
}

$('autoToggle').addEventListener('click', () => {
  if (cfg.autoRange) freezeAutoWindows();
  else cfg.autoRange = true;
  syncAutoToggle();
  drawPlot(); drawCurve(); renderSettings();
  persist();
});

$('stopBtn').addEventListener('click', () => A.stop());

function renderStatus() {
  const el = $('sourceChip');
  if (frame.demo) { el.textContent = 'demo source'; el.className = 'chip'; }
  else if (frame.running && frame.connected) { el.textContent = 'live · tab audio'; el.className = 'chip okChip'; }
  else if (frame.running) { el.textContent = 'capturing · connecting'; el.className = 'chip'; }
  else { el.textContent = 'idle'; el.className = 'chip'; }
  $('hostChip').textContent = cfg.host + ':81';
  $('captureHint').textContent = frame.running || frame.demo ? '' : A.captureHint;
  $('stopBtn').disabled = !frame.running;
}

A.onFrame((state) => {
  frame = state || {};
  if (frame.env && frame.env.length) lastEnv = frame.env;
  drawPlot();
  drawCurve();
  renderStatus();
});

window.addEventListener('resize', () => {
  sizePlot();
  drawPlot();
  renderSettings();
});

(async function init() {
  const stored = await A.loadConfig();
  cfg = normalizeConfig(stored);
  if (A._setDemoConfig) A._setDemoConfig(cfg);
  sizePlot();
  sizeCurve();
  syncAutoToggle();
  selectBand(0);
  renderStatus();
  A.requestStatus();
})();
