let config = null;
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let mediaStream = null;
let freqBuf = null;
let ws = null;
let tickTimer = null;
let reconnectTimer = null;
let lastLevelReport = 0;
let smoothing = [0, 0, 0, 0];
let running = false;
let manual = false;
let wsWanted = false;
let wsSerial = 0;
let lastSentValues = [-1, -1, -1, -1];

const MIN_HZ = 20;
const MAX_HZ = 20000;

function patchState(patch) {
  chrome.runtime.sendMessage({ type: 'offscreen-state', patch }).catch(() => {});
}

function normalizeHost(host) {
  let value = (host || 'patternflow.local').trim();
  value = value.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
  if (!value.includes(':')) value += ':81';
  return value;
}

function wsUrl() {
  return `ws://${normalizeHost(config.host)}`;
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
  } catch (error) {}

  const serial = ++wsSerial;
  const socket = new WebSocket(wsUrl());
  ws = socket;

  socket.onopen = () => {
    if (socket !== ws || serial !== wsSerial) return;
    patchState({ connected: true, error: '' });
  };

  socket.onerror = () => {
    if (socket !== ws || serial !== wsSerial) return;
    patchState({ connected: false, error: 'WebSocket error' });
  };

  socket.onclose = () => {
    if (socket !== ws || serial !== wsSerial) return;
    patchState({ connected: false });
    if (wsWanted && config) reconnectTimer = setTimeout(connectWs, 1200);
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
}

// Absolute, not a delta.
//
// `d=lane,change` became virtual encoder clicks in firmware, so a band level
// never set anything — it nudged, and the parameter drifted wherever the sum
// of nudges went. The same music gave a different result depending on what had
// already happened, and any message the one-connection server dropped stayed
// wrong forever. `k=lane,level` lands the band inside the parameter's own
// range, and the next frame corrects whatever the last one lost.
function sendOutputValue(knob, value) {
  const idx = Math.max(0, Math.min(3, Number(knob) || 0));
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  if (Math.abs(normalized - lastSentValues[idx]) < 0.002) return;
  if (send(`k=${idx},v=${normalized.toFixed(3)}`)) {
    lastSentValues[idx] = normalized;
  }
}

async function stop() {
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
  } catch (error) {}
  ws = null;

  try {
    if (sourceNode) sourceNode.disconnect();
  } catch (error) {}
  sourceNode = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioCtx) {
    await audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  analyser = null;
  freqBuf = null;
  smoothing = [0, 0, 0, 0];
  patchState({ running: false, manual: false, connected: false, levels: [], outputs: [], spectrum: [] });
}

async function start(streamId, nextConfig) {
  await stop();
  config = nextConfig;
  running = true;
  manual = false;
  wsWanted = true;
  resetOutputBaselines();

  audioCtx = new AudioContext();
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;
  freqBuf = new Float32Array(analyser.frequencyBinCount);

  sourceNode = audioCtx.createMediaStreamSource(mediaStream);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  connectWs();
  tickTimer = setInterval(tick, config.sendIntervalMs || 33);
  patchState({ running: true, manual: false, error: '' });
}

async function manualConnect(nextConfig) {
  await stop();
  config = nextConfig;
  manual = true;
  wsWanted = true;
  resetOutputBaselines();
  connectWs();
  patchState({ running: false, manual: true, error: '' });
}

function sendManualValue(knob, value) {
  const idx = Math.max(0, Math.min(3, Number(knob) || 0));
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const outputs = [0, 0, 0, 0];
  outputs[idx] = normalized;
  sendOutputValue(idx, normalized);
  patchState({ outputs });
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function hzToBin(hz) {
  return Math.round(Number(hz) * analyser.fftSize / audioCtx.sampleRate);
}

function normalizeDb(db, gain = 1) {
  return clamp01(((db + 80) / 70) * (Number(gain) || 1));
}

function bandEnergy(band) {
  const minBin = Math.max(0, hzToBin(band.hzMin));
  const maxBin = Math.min(freqBuf.length - 1, hzToBin(band.hzMax));
  if (maxBin < minBin) return 0;

  let sum = 0;
  for (let i = minBin; i <= maxBin; i++) sum += freqBuf[i];
  const avgDb = sum / (maxBin - minBin + 1);
  return normalizeDb(avgDb, band.gain);
}

function mapBandOutput(energy, band) {
  const inMin = clamp01(band.inMin ?? 0);
  const inMax = Math.max(inMin + 0.01, clamp01(band.inMax ?? 1));
  const outMin = clamp01(band.outMin ?? 0);
  const outMax = clamp01(band.outMax ?? 1);
  const normalized = clamp01((energy - inMin) / (inMax - inMin));
  return outMin + normalized * (outMax - outMin);
}

function computeSpectrum() {
  const count = 64;
  const values = [];
  const logMin = Math.log10(MIN_HZ);
  const logMax = Math.log10(MAX_HZ);

  for (let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const hz0 = 10 ** (logMin + (logMax - logMin) * t0);
    const hz1 = 10 ** (logMin + (logMax - logMin) * t1);
    const minBin = Math.max(0, hzToBin(hz0));
    const maxBin = Math.min(freqBuf.length - 1, hzToBin(hz1));
    if (maxBin < minBin) {
      values.push(0);
      continue;
    }
    let sum = 0;
    for (let bin = minBin; bin <= maxBin; bin++) sum += freqBuf[bin];
    values.push(normalizeDb(sum / (maxBin - minBin + 1)));
  }

  return values;
}

function tick() {
  if (!running || !analyser || !freqBuf || !config) return;

  analyser.getFloatFrequencyData(freqBuf);
  const bands = config.bands || [];
  const outputs = [];
  const levels = [];
  const alpha = config.smoothing ?? 0.35;

  while (smoothing.length < bands.length) smoothing.push(0);
  if (smoothing.length > bands.length) smoothing.length = bands.length;

  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    if (band.muted) {
      // Release the lane once, then leave it alone: the encoder owns it again
      // and nothing here should keep writing to it.
      const idx = Math.max(0, Math.min(3, Number(band.knob) || 0));
      if (lastSentValues[idx] !== -1) {
        send(`off=${idx}`, { control: true });
        lastSentValues[idx] = -1;
      }
      smoothing[i] = 0;
      levels[i] = 0;
      outputs[i] = 0;
      continue;
    }
    const raw = bandEnergy(band);
    smoothing[i] = alpha * raw + (1 - alpha) * smoothing[i];
    const mapped = mapBandOutput(smoothing[i], band);
    levels[i] = smoothing[i];
    outputs[i] = mapped;
    sendOutputValue(band.knob, mapped);
  }

  const now = performance.now();
  if (now - lastLevelReport > 120) {
    lastLevelReport = now;
    patchState({ levels, outputs, spectrum: computeSpectrum() });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  (async () => {
    if (message.type === 'start') {
      await start(message.streamId, message.config);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'stop') {
      await stop();
      config = null;
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'config') {
      const oldUrl = config ? wsUrl() : '';
      config = message.config;
      if (running) resetOutputBaselines();
      if (ws && oldUrl !== wsUrl()) connectWs();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'manual-connect') {
      await manualConnect(message.config);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'manual-value') {
      sendManualValue(message.knob, message.value);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'release') {
      send('off', { control: true });
      resetOutputBaselines();
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => {
    patchState({ running: false, connected: false, error: String(error.message || error) });
    sendResponse({ ok: false, error: String(error.message || error) });
  });

  return true;
});
