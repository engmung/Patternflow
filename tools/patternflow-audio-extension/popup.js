// Patternflow Audio — popup: the capture console.
//
// What a popup is good at: start and stop the capture, say where the panel
// is, see that audio is flowing, and one button to the tab where mapping
// happens (editor.html). Two things are this file's and nobody else's.
//
//   The panel's address. It has a storage key of its own, so the editor,
//   which owns the mapping (PFMap.CONFIG_KEY), and the popup never write the
//   same value, and an editor tab left open cannot put an old address back.
//   It is committed on Enter, on leaving the field and on Start. Committing
//   per keystroke dropped a live socket for every character and tried
//   192.168.0.4 on the way to 192.168.0.42.
//
//   Asking for the capture. The tab's stream id needs the click that opened
//   this popup.
//
// The mapping is read at Start and handed over as it is stored; nothing here
// edits it or writes it. What is running, what it is connected to and why it
// ended belong to the offscreen document, and this file draws the state it is
// handed.

const HOST_KEY = 'patternflowAudioHost';
const DEFAULT_HOST = 'patternflow.local';

let host = DEFAULT_HOST;   // the committed address
let hostError = '';        // why the field's text is not an address
let state = null;

const $ = (id) => document.getElementById(id);

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
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

// What someone typed, as the address to store: a host name or an IP, with a
// port only if they gave one. A pasted URL loses its scheme and path. Returns
// null when what is left is not an address.
//
// The shape is checked here and not left to `new URL`: Chrome's parser turns
// "not a host" into not%20a%20host and calls it valid.
const ADDRESS = /^(\[[0-9a-f:.]+\]|[\p{L}\p{N}](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?)(?::(\d+))?$/iu;

function parseHost(text) {
  const value = String(text || '').trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/, '');
  if (!value) return DEFAULT_HOST;

  const parts = ADDRESS.exec(value);
  if (!parts) return null;
  const [, name, port] = parts;
  if (port !== undefined && !(Number(port) >= 1 && Number(port) <= 65535)) return null;
  try {
    // The parser's spelling of it: lower case, 192.168.1 written out in full.
    return new URL(`ws://${name}`).hostname + (port === undefined ? '' : `:${Number(port)}`);
  } catch (error) {
    return null;
  }
}

// Take the field's text as the address. Returns it, or null when the text is
// not one; then nothing is stored and nothing connects.
function commitHost() {
  const field = $('host');
  const next = parseHost(field.value);
  if (!next) {
    hostError = `"${field.value.trim()}" is not an address. Use a name or an IP, like patternflow.local or 192.168.0.42.`;
    field.setAttribute('aria-invalid', 'true');
    renderState();
    return null;
  }

  hostError = '';
  field.removeAttribute('aria-invalid');
  field.value = next;
  if (next !== host) {
    host = next;
    chrome.storage.local.set({ [HOST_KEY]: host });
    // A capture or a test connection that is up follows the address.
    if (state && (state.running || state.manual)) {
      sendMessage({ type: 'host', host }).then((response) => {
        if (response && response.state) state = response.state;
        renderState();
      });
    }
  }
  renderState();
  return host;
}

function setStatus(text, ok) {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + (ok ? 'ok' : 'bad');
}

function renderState() {
  const s = state || {};
  // state.host is the address as the socket uses it, port included.
  const at = `ws://${s.host}`;

  if (hostError) {
    setStatus('Error', false);
    $('detail').textContent = hostError;
  } else if (s.error) {
    setStatus('Error', false);
    $('detail').textContent = s.error;
  } else if (s.running && s.connected) {
    setStatus('Live', true);
    $('detail').textContent = s.tabTitle ? `Capturing: ${s.tabTitle}` : 'Capturing current tab.';
  } else if (s.manual && s.connected) {
    setStatus('WS Test', true);
    $('detail').textContent = `Manual test connected to ${at}`;
  } else if (s.running) {
    setStatus('Connecting', false);
    $('detail').textContent = `Connecting to ${at}`;
  } else if (s.manual) {
    setStatus('Connecting', false);
    $('detail').textContent = `Connecting manual test to ${at}`;
  } else {
    setStatus('Idle', false);
    $('detail').textContent = s.note || 'Open the tab you want to hear, then press Start.';
  }

  drawSpectrum(s.spectrum || []);
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
    const v = PFMap.clamp01(values[i]);
    const h = Math.max(1, v * (height - 12));
    ctx.fillStyle = i % 2 ? '#6b655a' : '#141414';
    ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth - 1), h);
  }
}

// The reply to a start: the state to draw, or the reason there is none.
function adopt(response, failure) {
  if (!response || !response.ok) throw new Error((response && response.error) || failure);
  state = response.state;
  renderState();
}

async function startCapture() {
  const address = commitHost();
  if (!address) return;

  const [tab] = await tabQuery({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab to capture.');

  const streamId = await getStreamId(tab.id);
  const stored = await storageGet(PFMap.CONFIG_KEY);
  adopt(await sendMessage({
    type: 'start',
    streamId,
    tabTitle: tab.title || '',
    host: address,
    config: stored[PFMap.CONFIG_KEY] || null
  }), 'Failed to start capture.');
}

async function startManual() {
  const address = commitHost();
  if (!address) return;
  adopt(await sendMessage({ type: 'manual-connect', host: address }), 'Failed to connect manual test.');
}

// A start that failed here, before the offscreen document had anything to
// report.
function showFailure(error) {
  state = { running: false, connected: false, manual: false, error: String(error.message || error) };
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
  const stored = await storageGet([HOST_KEY, PFMap.CONFIG_KEY]);
  if (typeof stored[HOST_KEY] === 'string') {
    host = parseHost(stored[HOST_KEY]) || DEFAULT_HOST;
  } else {
    // Before the address had a key of its own it rode inside the mapping.
    // Move it across once; the copy left behind is never read again.
    const legacy = stored[PFMap.CONFIG_KEY] && stored[PFMap.CONFIG_KEY].host;
    const moved = typeof legacy === 'string' ? parseHost(legacy) : null;
    if (moved) {
      host = moved;
      chrome.storage.local.set({ [HOST_KEY]: host });
    }
  }
  $('host').value = host;

  // `change` is Enter and leaving the field. The popup closing is neither (it
  // closes with the field still focused), so that is asked for by name.
  $('host').addEventListener('change', commitHost);
  window.addEventListener('pagehide', commitHost);

  // The form makes Enter in the address a submit, the same event as a click
  // on Start, and the two are not always the same wish.
  let typedEnter = false;
  $('host').addEventListener('keydown', (event) => {
    typedEnter = event.key === 'Enter';
  });

  $('device').addEventListener('submit', async (event) => {
    event.preventDefault();
    const entered = typedEnter;
    typedEnter = false;
    // Something is already connected. A running capture has nothing to start,
    // and Enter over a test connection means "this address", not "capture":
    // either way the one thing left to do is move it to the address in the
    // field.
    if (state && (state.running || (entered && state.manual))) {
      commitHost();
      return;
    }
    try {
      setStatus('Starting', false);
      await startCapture();
    } catch (error) {
      showFailure(error);
    }
  });

  $('manualConnect').addEventListener('click', async () => {
    try {
      setStatus('Connecting', false);
      await startManual();
    } catch (error) {
      showFailure(error);
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
