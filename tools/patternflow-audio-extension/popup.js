const MIN_HZ = 20;
const MAX_HZ = 20000;

const DEFAULT_CONFIG = {
  host: 'patternflow.local',
  smoothing: 0.35,
  sendIntervalMs: 33,
  // Four, because the panel has four knobs. Shipping one meant a first run
  // moved a single knob and looked broken; the device page has defaulted to
  // four the whole time.
  bands: [
    { hzMin: 60,   hzMax: 250,   knob: 0, outMin: 0.30, outMax: 0.85, inMin: 0, inMax: 1, gain: 1 },
    { hzMin: 250,  hzMax: 2000,  knob: 1, outMin: 0.30, outMax: 0.85, inMin: 0, inMax: 1, gain: 1 },
    { hzMin: 2000, hzMax: 5000,  knob: 2, outMin: 0.30, outMax: 0.85, inMin: 0, inMax: 1, gain: 1 },
    { hzMin: 5000, hzMax: 16000, knob: 3, outMin: 0.30, outMax: 0.85, inMin: 0, inMax: 1, gain: 1 }
  ]
};

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

let config = structuredClone(DEFAULT_CONFIG);
let state = null;
let saveTimer = null;
let bandEls = [];
// Bands are indexed 0..3; this is the fifth choice — every editor at once,
// for setting one band against the others rather than one at a time.
const ALL_BANDS = -1;
let activeBandIndex = 0;
let spectrumDrag = null;

const $ = (id) => document.getElementById(id);
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const clampHz = (value) => Math.max(MIN_HZ, Math.min(MAX_HZ, Number(value) || MIN_HZ));

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get(key, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function tabQuery(query) {
  return new Promise((resolve) => chrome.tabs.query(query, resolve));
}

function getStreamId(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(streamId);
    });
  });
}

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

function newBand(index = config.bands.length) {
  const presets = [
    [60, 250],
    [250, 2000],
    [2000, 5000],
    [5000, 16000]
  ];
  const [hzMin, hzMax] = presets[index % presets.length];
  return {
    hzMin,
    hzMax,
    knob: Math.min(index, 3),
    outMin: 0.30,
    outMax: 0.85,
    inMin: 0.00,
    inMax: 1.00,
    gain: 1.00
  };
}

function normalizeBand(raw, index) {
  const legacyBase = Number.isFinite(Number(raw.base)) ? Number(raw.base) : 0.30;
  const legacyRange = Number.isFinite(Number(raw.range)) ? Number(raw.range) : 0.55;
  let outMin = Number.isFinite(Number(raw.outMin)) ? Number(raw.outMin) : legacyBase;
  let outMax = Number.isFinite(Number(raw.outMax)) ? Number(raw.outMax) : legacyBase + legacyRange;

  outMin = clamp01(outMin);
  outMax = clamp01(outMax);
  if (outMin > outMax) [outMin, outMax] = [outMax, outMin];

  let inMin = Number.isFinite(Number(raw.inMin)) ? clamp01(raw.inMin) : 0;
  let inMax = Number.isFinite(Number(raw.inMax)) ? clamp01(raw.inMax) : 1;
  if (inMin > inMax) [inMin, inMax] = [inMax, inMin];
  if (inMax - inMin < 0.01) inMax = Math.min(1, inMin + 0.01);

  let hzMin = clampHz(raw.hzMin ?? 60);
  let hzMax = clampHz(raw.hzMax ?? 250);
  if (hzMin > hzMax) [hzMin, hzMax] = [hzMax, hzMin];
  if (hzMax - hzMin < 10) hzMax = Math.min(MAX_HZ, hzMin + 10);

  return {
    hzMin,
    hzMax,
    knob: Math.max(0, Math.min(3, Number(raw.knob ?? index) || 0)),
    muted: raw.muted === true,
    outMin,
    outMax,
    inMin,
    inMax,
    gain: Math.max(0.2, Math.min(4, Number(raw.gain) || 1))
  };
}

// Four bands, always, because the panel has four knobs. Adding and removing
// them made the count a thing to manage; a band you do not want is muted, and
// it is still there when you want it back.
function normalizeConfig(raw) {
  const stored = Array.isArray(raw?.bands) ? raw.bands : [];
  const bands = [];
  for (let i = 0; i < 4; i++) {
    bands.push(normalizeBand(stored[i] || newBand(i), i));
  }

  return {
    ...DEFAULT_CONFIG,
    ...raw,
    smoothing: Math.max(0.05, Math.min(0.9, Number(raw?.smoothing) || DEFAULT_CONFIG.smoothing)),
    bands
  };
}

function clampBandRange(band) {
  band.hzMin = clampHz(band.hzMin);
  band.hzMax = clampHz(band.hzMax);
  if (band.hzMin > band.hzMax) [band.hzMin, band.hzMax] = [band.hzMax, band.hzMin];
}

function persistConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await storageSet({ patternflowAudioConfig: config });
    await sendMessage({ type: 'config', config });
    renderSpectrumBands();
  }, 120);
}

function setStatus(text, ok) {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + (ok ? 'ok' : 'bad');
}

function renderState() {
  if (!state) {
    setStatus('Idle', false);
    drawSpectrum([]);
    return;
  }

  if (state.error) {
    setStatus('Error', false);
    $('detail').textContent = state.error;
  } else if (state.running && state.connected) {
    setStatus('Live', true);
    $('detail').textContent = state.tabTitle ? `Capturing: ${state.tabTitle}` : 'Capturing current tab.';
  } else if (state.manual && state.connected) {
    setStatus('WS Test', true);
    $('detail').textContent = `Manual test connected to ws://${config.host}:81`;
  } else if (state.running) {
    setStatus('Connecting', false);
    $('detail').textContent = `Connecting to ws://${config.host}:81`;
  } else if (state.manual) {
    setStatus('Connecting', false);
    $('detail').textContent = `Connecting manual test to ws://${config.host}:81`;
  } else {
    setStatus('Idle', false);
    $('detail').textContent = 'Open the tab you want to hear, then press Start.';
  }

  const levels = state.levels || [];
  const outputs = state.outputs || [];
  for (let i = 0; i < bandEls.length; i++) {
    const entry = bandEls[i];
    const level = levels[i] || 0;
    entry.level.style.width = `${Math.round(level * 100)}%`;
    entry.output.style.width = `${Math.round((outputs[i] || 0) * 100)}%`;
    // The dot is the point of the graph: it says where this sound lands, and
    // it is the only part that can tell you a band is doing nothing.
    if (entry.plot) entry.plot.live(level);

    // Travel: how much of its knob this band uses between silence and the
    // loudest it has been. A band can be configured perfectly and still sit
    // still because nothing in the music reaches its window — that reads as
    // broken, and this is the number that says otherwise.
    if (entry.travel) {
      const b = entry.band;
      entry.peak = Math.max(level, (entry.peak || 0) * 0.995);
      const span = Math.max(0.01, b.outMax - b.outMin);
      const travel = (mapBandOutput(b, entry.peak) - mapBandOutput(b, 0)) / span;
      entry.travel.textContent = Math.round(Math.min(1, travel) * 100) + '%';
      entry.travel.classList.toggle('weak', travel < 0.34);
      entry.travel.title = travel < 0.34
        ? 'This band is barely moving its knob — pull "Full at" left, or add boost'
        : 'How much of its knob this band is using';
    }
  }
  drawSpectrum(state.spectrum || []);
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
  ctx.fillStyle = '#fbf7ef';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d9d1c0';
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
    ctx.fillStyle = i % 2 ? '#6b655a' : '#141414';
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

async function startCapture() {
  config.host = $('host').value.trim() || 'patternflow.local';
  await storageSet({ patternflowAudioConfig: config });

  const [tab] = await tabQuery({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab to capture.');

  const streamId = await getStreamId(tab.id);
  const response = await sendMessage({
    type: 'start',
    streamId,
    tabTitle: tab.title || '',
    config
  });

  if (!response || !response.ok) throw new Error(response?.error || 'Failed to start capture.');
  state = response.state;
  renderState();
}

async function startManual() {
  config.host = $('host').value.trim() || 'patternflow.local';
  await storageSet({ patternflowAudioConfig: config });
  const response = await sendMessage({ type: 'manual-connect', config });
  if (!response || !response.ok) throw new Error(response?.error || 'Failed to connect manual test.');
  state = response.state;
  renderState();
}

function bindManualControls() {
  document.querySelectorAll('.manual').forEach((input) => {
    const output = input.parentElement.querySelector('output');
    const update = async () => {
      output.textContent = Number(input.value).toFixed(2);
      await sendMessage({
        type: 'manual-value',
        knob: parseInt(input.dataset.knob, 10),
        value: parseFloat(input.value)
      });
    };
    input.addEventListener('input', update);
    input.addEventListener('change', update);
  });
}

async function init() {
  const stored = await storageGet('patternflowAudioConfig');
  config = normalizeConfig(stored.patternflowAudioConfig);

  $('host').value = config.host;
  $('host').addEventListener('input', () => {
    config.host = $('host').value.trim() || 'patternflow.local';
    persistConfig();
  });

  $('smoothing').value = config.smoothing;
  $('smoothingValue').textContent = config.smoothing.toFixed(2);
  $('smoothing').addEventListener('input', () => {
    config.smoothing = parseFloat($('smoothing').value);
    $('smoothingValue').textContent = config.smoothing.toFixed(2);
    persistConfig();
  });

  // No Add Band: there are four, one per knob, and there always were four
  // knobs to drive.

  $('connect').addEventListener('click', async () => {
    try {
      setStatus('Starting', false);
      await startCapture();
    } catch (error) {
      state = { running: false, connected: false, error: String(error.message || error) };
      renderState();
    }
  });

  $('manualConnect').addEventListener('click', async () => {
    try {
      setStatus('Connecting', false);
      await startManual();
    } catch (error) {
      state = { running: false, connected: false, manual: false, error: String(error.message || error) };
      renderState();
    }
  });

  $('stop').addEventListener('click', async () => {
    const response = await sendMessage({ type: 'stop' });
    state = response.state;
    renderState();
  });

  $('release').addEventListener('click', () => sendMessage({ type: 'release' }));

  buildBands();
  renderBandTabs();
  bindManualControls();
  bindSpectrumDrag();
  renderSpectrumBands();
  drawSpectrum([]);

  const response = await sendMessage({ type: 'status' });
  state = response?.state || null;
  renderState();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'state') return;
  state = message.state;
  renderState();
});

window.addEventListener('resize', renderSpectrumBands);
init();
