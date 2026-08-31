// Patternflow Audio — popup: the capture console.
//
// This used to also be the mapping editor — band strips, drag handles, boost
// buttons — until the real editor moved to its own tab (editor.html), where
// boxes on a spectrum have room to be dragged. What remains here is what a
// popup is good at: start/stop the capture, point at the device, see that
// audio is flowing, and one button to the place where mapping actually
// happens. The popup never edits bands anymore; it only ships the stored
// config along with start/config messages.

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

let config = structuredClone(DEFAULT_CONFIG);
let state = null;
let saveTimer = null;

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

  const band = {
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
  // The editor's fields ride through untouched. Rebuilding the band without
  // them meant every popup save quietly erased the curves — Start wiped the
  // mapping it was about to use.
  if (raw.curve && typeof raw.curve === 'object') band.curve = raw.curve;
  if (Array.isArray(raw.lut) && raw.lut.length >= 2) band.lut = raw.lut;
  return band;
}

// Four bands, always, because the panel has four knobs.
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

function persistConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await storageSet({ patternflowAudioConfig: config });
    await sendMessage({ type: 'config', config });
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

  drawSpectrum(state.spectrum || []);
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

  // The mapping editor gets a real tab: boxes dragged on a spectrum need
  // more room than a popup that closes the moment focus leaves it.
  $('openEditor').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  });

  bindManualControls();
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

init();
