const DEFAULT_CONFIG = {
  host: 'patternflow.local',
  smoothing: 0.35,
  sendIntervalMs: 33,
  bands: [
    { hzMin: 60, hzMax: 250, knob: 0, base: 0.50, range: 0.50, gain: 1.00 },
    { hzMin: 500, hzMax: 2000, knob: 1, base: 0.30, range: 0.70, gain: 1.00 },
    { hzMin: 2000, hzMax: 4000, knob: 2, base: 0.50, range: 0.50, gain: 1.00 },
    { hzMin: 4000, hzMax: 16000, knob: 3, base: 0.50, range: 0.50, gain: 1.00 }
  ]
};

let config = structuredClone(DEFAULT_CONFIG);
let state = null;
let saveTimer = null;
let bandEls = [];

const $ = (id) => document.getElementById(id);

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

function clampBand(band) {
  if (band.hzMin > band.hzMax) {
    const temp = band.hzMin;
    band.hzMin = band.hzMax;
    band.hzMax = temp;
  }
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

  const levels = state.levels || [0, 0, 0, 0];
  const outputs = state.outputs || [0, 0, 0, 0];
  for (let i = 0; i < bandEls.length; i++) {
    bandEls[i].level.style.width = `${Math.round(levels[i] * 100)}%`;
    bandEls[i].output.style.width = `${Math.round(outputs[i] * 100)}%`;
  }
}

function bindRange(root, selector, outputSelector, getter, setter, format) {
  const input = root.querySelector(selector);
  const output = root.querySelector(outputSelector);
  input.value = getter();
  output.textContent = format(getter());
  input.addEventListener('input', () => {
    setter(parseFloat(input.value));
    output.textContent = format(getter());
    persistConfig();
  });
}

function buildBands() {
  const root = $('bands');
  const template = $('band-template');
  root.innerHTML = '';
  bandEls = [];

  config.bands.forEach((band, index) => {
    const fragment = template.content.cloneNode(true);
    const el = fragment.querySelector('.band');
    el.querySelector('.band-title').textContent = `Band ${index + 1}`;

    const knob = el.querySelector('.knob');
    knob.value = String(band.knob);
    knob.addEventListener('change', () => {
      band.knob = parseInt(knob.value, 10);
      persistConfig();
    });

    bindRange(el, '.hzMin', '.hzMinOut', () => band.hzMin, (value) => {
      band.hzMin = value;
      clampBand(band);
    }, (value) => String(Math.round(value)));

    bindRange(el, '.hzMax', '.hzMaxOut', () => band.hzMax, (value) => {
      band.hzMax = value;
      clampBand(band);
    }, (value) => String(Math.round(value)));

    bindRange(el, '.base', '.baseOut', () => band.base, (value) => {
      band.base = value;
    }, (value) => value.toFixed(2));

    bindRange(el, '.range', '.rangeOut', () => band.range, (value) => {
      band.range = value;
    }, (value) => (value >= 0 ? '+' : '') + value.toFixed(2));

    bindRange(el, '.gain', '.gainOut', () => band.gain, (value) => {
      band.gain = value;
    }, (value) => value.toFixed(2));

    bandEls.push({
      level: el.querySelector('.level'),
      output: el.querySelector('.output')
    });

    root.appendChild(fragment);
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
  if (stored.patternflowAudioConfig) {
    config = {
      ...DEFAULT_CONFIG,
      ...stored.patternflowAudioConfig,
      bands: stored.patternflowAudioConfig.bands || DEFAULT_CONFIG.bands
    };
  }

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
  bindManualControls();

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
