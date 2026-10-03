// Patternflow Audio — offscreen document: the analysis, the socket, and the
// truth about both.
//
// Tab capture hands over a MediaStream, and a MediaStream needs a document to
// live in; a service worker has none and is put to sleep besides. So this
// page holds the capture, runs the mapping (mapping.js) 30 times a second and
// writes the four knob lanes to the panel.
//
// It is also the one place that KNOWS whether a capture is running, which
// address the socket points at, whether that socket opened and why a capture
// ended. Every state message it sends carries all of that (see status()), so
// the service worker, which Chrome restarts with empty memory whenever it
// likes, can rebuild from any single one of them, or ask.
//
// An offscreen document has chrome.runtime and nothing else. No
// chrome.storage: the mapping arrives in messages (the popup reads it at
// Start, the editor sends every save) and is normalised HERE, on receipt,
// whoever sent it. A `host` inside a mapping is ignored; the address comes
// only with start, manual-connect and host, which only the popup sends.

const WS_PORT = 81;       // where the panel's audio socket listens
const TICK_MS = 33;       // analyse and send at about 30 Hz
const REPORT_MS = 120;    // levels and spectrum to the popup and the editor

let config = null;        // the mapping: PFMap.normalizeConfig() of what arrived
let host = '';            // 'name:port' the socket is pointed at, '' when idle
let tabTitle = '';
let error = '';           // what is wrong right now
let note = '';            // why the last capture ended, when nobody pressed Stop
let running = false;      // a tab is being analysed
let manual = false;       // the test connection: a socket, no audio

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let mediaStream = null;
let freqBuf = null;
let ws = null;
let tickTimer = null;
let reconnectTimer = null;
let lastLevelReport = 0;
let wsWanted = false;
let wsSerial = 0;
let lastSentValues = [-1, -1, -1, -1];
let lastSentBody = '';

// Per band: the smoothed level, and the envelope auto range maps it through.
let levels = [0, 0, 0, 0];
let envelopes = [0, 1, 2, 3].map(PFMap.newEnvelope);

function status() {
  return {
    running,
    manual,
    connected: !!ws && ws.readyState === WebSocket.OPEN,
    host,
    tabTitle,
    error,
    note
  };
}

// Always the whole status, plus whatever is live. A patch that carried only
// `connected` left the service worker to remember the rest, and after a
// restart it remembered nothing: the popup said Idle over a running capture.
function patchState(live) {
  chrome.runtime.sendMessage({ type: 'offscreen-state', patch: { ...status(), ...live } }).catch(() => {});
}

// The popup sends a checked address, with a port only if one was typed.
function wsHost(address) {
  const value = String(address || '').trim();
  return /:\d+$/.test(value) ? value : `${value}:${WS_PORT}`;
}

function connectWs() {
  clearTimeout(reconnectTimer);

  const previous = ws;
  try {
    if (previous) {
      previous.onopen = null;
      previous.onerror = null;
      previous.onclose = null;
      previous.close();
    }
  } catch (failure) {}

  const serial = ++wsSerial;
  const socket = new WebSocket(`ws://${host}`);
  ws = socket;

  socket.onopen = () => {
    if (socket !== ws || serial !== wsSerial) return;
    error = '';
    patchState();
  };

  socket.onerror = () => {
    if (socket !== ws || serial !== wsSerial) return;
    error = 'WebSocket error';
    patchState();
  };

  socket.onclose = () => {
    if (socket !== ws || serial !== wsSerial) return;
    patchState();
    if (wsWanted) reconnectTimer = setTimeout(connectWs, 1200);
  };
}

function send(msg, options = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  if (!options.control && ws.bufferedAmount > 0) return false;
  ws.send(msg);
  return true;
}

// -1 is "nothing sent yet", so the first real level always goes out. With
// absolute values there is no baseline to match — only a cache of what the
// lane was last told.
function resetOutputBaselines() {
  lastSentValues = [-1, -1, -1, -1];
  lastSentBody = '';
}

// Absolute, not a delta.
//
// `d=lane,change` became virtual encoder clicks in firmware, so a band level
// never set anything — it nudged, and the parameter drifted wherever the sum
// of nudges went. The same music gave a different result depending on what had
// already happened, and any message the one-connection server dropped stayed
// wrong forever. `k=lane,level` lands the band inside the parameter's own
// range, and the next frame corrects whatever the last one lost.
// All four lanes, one message per frame.
//
// Sending them one at a time did not work and failed in the least visible way
// possible: `send()` refuses while `ws.bufferedAmount > 0`, which after the
// first send of a frame it always is, so lanes 1..3 were dropped every frame
// in index order. Knob 1 moved, knob 2 flickered, knob 4 never moved at all —
// and it looked like a signal problem, because the band that never worked was
// also the quietest one.
//
// A '-' leaves a lane alone, which is what a muted band sends.
function sendLanes(values) {
  const body = values
    .map((v) => (v === null ? '-' : Math.max(0, Math.min(1, v)).toFixed(3)))
    .join(',');
  if (body === lastSentBody) return;
  if (send(`a=${body}`)) lastSentBody = body;
}

function sendOutputValue(knob, value) {
  const idx = Math.max(0, Math.min(3, Number(knob) || 0));
  const normalized = PFMap.clamp01(value);
  if (Math.abs(normalized - lastSentValues[idx]) < 0.002) return;
  if (send(`k=${idx},v=${normalized.toFixed(3)}`)) {
    lastSentValues[idx] = normalized;
  }
}

// Everything off and forgotten. `why` is for a capture that ended by itself.
async function stop(why = '') {
  running = false;
  manual = false;
  wsWanted = false;
  clearInterval(tickTimer);
  clearTimeout(reconnectTimer);
  tickTimer = null;
  reconnectTimer = null;
  wsSerial++;

  send('off', { control: true });
  resetOutputBaselines();

  try {
    if (ws) {
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
  } catch (failure) {}
  ws = null;

  try {
    if (sourceNode) sourceNode.disconnect();
  } catch (failure) {}
  sourceNode = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    mediaStream = null;
  }

  if (audioCtx) {
    await audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  analyser = null;
  freqBuf = null;
  config = null;
  host = '';
  tabTitle = '';
  error = '';
  note = why;
  levels = [0, 0, 0, 0];
  envelopes = [0, 1, 2, 3].map(PFMap.newEnvelope);
  patchState({ levels: [], pos: [], outputs: [], spectrum: [], env: [] });
}

async function start(message) {
  await stop();
  try {
    config = PFMap.normalizeConfig(message.config, PFMap.SOURCE);
    host = wsHost(message.host);
    tabTitle = message.tabTitle || '';
    running = true;
    wsWanted = true;

    audioCtx = new AudioContext();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: message.streamId
        }
      },
      video: false
    });

    // The stream ends when its tab is closed. Nothing else says so: the
    // analyser keeps returning silence and the socket stays open, so the popup
    // went on reading Live over a tab that no longer existed.
    mediaStream.getAudioTracks().forEach((track) => {
      track.onended = () => stop('The captured tab was closed.');
    });

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    freqBuf = new Float32Array(analyser.frequencyBinCount);

    sourceNode = audioCtx.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    connectWs();
    tickTimer = setInterval(tick, TICK_MS);
    patchState();
  } catch (failure) {
    // Half a capture is not one: undo what was set up, then let the caller
    // say why.
    await stop();
    throw failure;
  }
}

async function manualConnect(address) {
  await stop();
  host = wsHost(address);
  manual = true;
  wsWanted = true;
  connectWs();
  patchState();
}

// The popup committed another address while something is connected: follow it.
function retarget(address) {
  const next = wsHost(address);
  if (!wsWanted || next === host) return;
  host = next;
  error = '';
  resetOutputBaselines();   // a different panel has been told nothing yet
  connectWs();
  patchState();
}

function hzToBin(hz) {
  return Math.round(Number(hz) * analyser.fftSize / audioCtx.sampleRate);
}

// Raw level only. Gain used to be folded in here, which meant it scaled the
// signal BEFORE the input window clipped it — so raising boost also slid the
// band out of its own window, and the two controls fought. It shapes the
// curve now (PFMap.curveValue), which is the curve the editor draws.
function binsLevel(minBin, maxBin) {
  minBin = Math.max(0, minBin);
  maxBin = Math.min(freqBuf.length - 1, maxBin);
  if (maxBin < minBin) return 0;

  let sum = 0;
  for (let i = minBin; i <= maxBin; i++) sum += freqBuf[i];
  return PFMap.normalizeDb(sum / (maxBin - minBin + 1));
}

function computeSpectrum() {
  const count = 64;
  const values = [];
  const logMin = Math.log10(PFMap.SOURCE.hzMin);
  const logMax = Math.log10(PFMap.SOURCE.hzMax);

  for (let i = 0; i < count; i++) {
    const hz0 = 10 ** (logMin + (logMax - logMin) * (i / count));
    const hz1 = 10 ** (logMin + (logMax - logMin) * ((i + 1) / count));
    values.push(binsLevel(hzToBin(hz0), hzToBin(hz1)));
  }

  return values;
}

function tick() {
  if (!running || !analyser || !freqBuf || !config) return;

  analyser.getFloatFrequencyData(freqBuf);
  const bands = config.bands;
  const auto = config.autoRange;

  // Levels first, for every band including muted ones — the editor shows a
  // muted band's level so you can see what it WOULD do, and the auto-range
  // envelopes keep tracking so unmuting does not open on a stale window.
  for (let i = 0; i < 4; i++) {
    const raw = binsLevel(hzToBin(bands[i].hzMin), hzToBin(bands[i].hzMax));
    // Glide ballistics: a hit ATTACKS at its own speed, the fall RELEASES at
    // the damping - two user-set alphas. Symmetric smoothing made percussive
    // music feel late; this is the VU-meter split every reactive light wants.
    const a = raw > levels[i] ? config.attack : config.smoothing;
    levels[i] = a * raw + (1 - a) * levels[i];
    if (auto) PFMap.trackEnvelope(envelopes[i], levels[i]);
  }

  // The mapping itself is PFMap's: where each level sits in its window, and
  // what the knob gets for that. Both go out with the levels, so the editor
  // can draw what was mapped instead of working it out a second time.
  //
  // A lane nothing drives stays null, and goes out as '-'.
  const pos = [];
  const outputs = [];
  const lanes = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    pos[i] = PFMap.position(levels[i], bands[i], auto ? envelopes[i] : null);
    outputs[i] = PFMap.output(bands[i], pos[i]);
    if (!bands[i].muted) lanes[bands[i].knob] = outputs[i];
  }

  // Muting a band hands its lane back once, and only if this client had it.
  for (let i = 0; i < 4; i++) {
    if (lanes[i] === null && lastSentValues[i] !== -1) {
      send(`off=${i}`, { control: true });
      lastSentValues[i] = -1;
    } else if (lanes[i] !== null) {
      lastSentValues[i] = lanes[i];
    }
  }

  sendLanes(lanes);

  const now = performance.now();
  if (now - lastLevelReport > REPORT_MS) {
    lastLevelReport = now;
    patchState({
      levels: levels.slice(),
      pos,
      outputs,
      spectrum: computeSpectrum(),
      // The editor draws these as each box's breathing top and bottom edge.
      env: auto ? envelopes.map((e) => ({ lo: e.lo, hi: e.hi })) : [],
      autoRange: auto
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  (async () => {
    switch (message.type) {
      case 'start':
        await start(message);
        break;
      case 'manual-connect':
        await manualConnect(message.host);
        break;
      case 'stop':
        await stop();
        break;
      case 'host':
        retarget(message.host);
        break;
      case 'config':
        // Only a running capture has a use for a mapping; the next Start
        // brings its own.
        if (running) {
          config = PFMap.normalizeConfig(message.config, PFMap.SOURCE);
          resetOutputBaselines();
        }
        break;
      case 'manual-value':
        sendOutputValue(message.knob, message.value);
        break;
      case 'release':
        send('off', { control: true });
        resetOutputBaselines();
        break;
      case 'status':
        break;
      default:
        sendResponse({ ok: false, error: 'Unknown message', state: status() });
        return;
    }
    sendResponse({ ok: true, state: status() });
  })().catch((failure) => {
    error = String(failure.message || failure);
    patchState();
    sendResponse({ ok: false, error, state: status() });
  });

  return true;
});
