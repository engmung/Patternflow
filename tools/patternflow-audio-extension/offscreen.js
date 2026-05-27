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

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
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

  send('off');

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
  patchState({ running: false, manual: false, connected: false, levels: smoothing, outputs: smoothing });
}

async function start(streamId, nextConfig) {
  await stop();
  config = nextConfig;
  running = true;
  manual = false;
  wsWanted = true;

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
  connectWs();
  patchState({ running: false, manual: true, error: '' });
}

function sendManualValue(knob, value) {
  const idx = Math.max(0, Math.min(3, Number(knob) || 0));
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const outputs = [0, 0, 0, 0];
  outputs[idx] = normalized;
  send(`k=${idx},v=${normalized.toFixed(3)}`);
  patchState({ outputs });
}

function hzToBin(hz) {
  return Math.round(hz * analyser.fftSize / audioCtx.sampleRate);
}

function bandEnergy(band) {
  const minBin = Math.max(0, hzToBin(band.hzMin));
  const maxBin = Math.min(freqBuf.length - 1, hzToBin(band.hzMax));
  if (maxBin < minBin) return 0;

  let sum = 0;
  for (let i = minBin; i <= maxBin; i++) sum += freqBuf[i];
  const avgDb = sum / (maxBin - minBin + 1);
  const normalized = (avgDb + 80) / 70;
  return Math.max(0, Math.min(1, normalized * (band.gain || 1)));
}

function tick() {
  if (!running || !analyser || !freqBuf || !config) return;

  analyser.getFloatFrequencyData(freqBuf);
  const outputs = [0, 0, 0, 0];
  const alpha = config.smoothing ?? 0.35;

  for (let i = 0; i < 4; i++) {
    const band = config.bands[i];
    const raw = bandEnergy(band);
    smoothing[i] = alpha * raw + (1 - alpha) * smoothing[i];
    const mapped = Math.max(0, Math.min(1, band.base + smoothing[i] * band.range));
    outputs[i] = mapped;
    send(`k=${band.knob},v=${mapped.toFixed(3)}`);
  }

  const now = performance.now();
  if (now - lastLevelReport > 120) {
    lastLevelReport = now;
    patchState({ levels: smoothing, outputs });
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
      send('off');
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => {
    patchState({ running: false, connected: false, error: String(error.message || error) });
    sendResponse({ ok: false, error: String(error.message || error) });
  });

  return true;
});
