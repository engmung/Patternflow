// ═══════════════════════════════════════════════════════════
// PatternFlow - Audio-react browser UI (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/audio by core_audio_ws.h. The UI:
//   - audio source: file upload or mic
//   - four frequency bands, each routed to a target knob (1..4)
//   - per band: Hz min/max sliders, base value, ±range modulation
//   - live energy meters + WebSocket throttled to ~30 Hz
//
// Audio path: source → AnalyserNode (FFT 2048) → per-band bin average
// in dB → normalized 0..1 → EMA smoothing → output = base + audio×range
// (clamped 0..1) → WebSocket frame "k=N,v=F".
//
// Tab/system capture is better handled by the Patternflow Audio Chrome
// extension because the ESP32 serves this page over normal HTTP.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
// The page body below is generated from console/audio.html — edit that,
// then run: python firmware/toolchain/console_pages.py build
#pragma once
#include <pgmspace.h>

const char AUDIO_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="/pf-console.js"></script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow Audio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  /* patternflow.work design system tokens (web/docs/patternflow-styleguide.html):
     cream + ink + LED accent. --accent doubles as the alert color; healthy
     states read as ink, meters and attention states as the LED orange. */
  :root{--bg:#0C0B09;--card:#131110;--card2:#1B1914;--fg:#EDE7DB;--mut:#8A8272;--faint:#5A5546;--ln:#242118;--accent:#FF5C2E;--bad:#FF5C2E;--bar:#1B1914;--bar-on:#FF5C2E}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-font-smoothing:antialiased;padding:0}
  .wrap{max-width:680px;margin:0 auto;padding:24px 20px 64px}
  header{display:flex;align-items:center;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--ln);margin-bottom:16px}
  .dot{width:7px;height:7px;background:var(--accent);border-radius:1px}
  h1{font-size:15px;font-weight:600;letter-spacing:.01em;margin:0;flex:1}
  .sub{font-size:11px;color:var(--mut);margin-bottom:20px}
  #status{font-size:10px;padding:6px 10px;border:1px solid var(--faint);background:var(--card);letter-spacing:.15em}
  .ok{color:var(--fg);border-color:var(--fg)!important} .bad{color:var(--bad);border-color:var(--bad)!important}

  .section{margin:14px 0;padding:14px;border:1px solid var(--ln);background:var(--card)}
  .section h2{font-size:10px;letter-spacing:.25em;color:var(--mut);font-weight:normal;text-transform:uppercase;margin:0 0 12px}

  .sources{display:flex;gap:8px;flex-wrap:wrap}
  .sources button{flex:1;min-width:120px;padding:10px;background:transparent;color:var(--mut);border:1px solid var(--ln);font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:color .15s ease,border-color .15s ease}
  .sources button:hover{color:var(--fg);border-color:var(--fg)}
  .sources button.active{background:var(--fg);color:var(--card);border-color:var(--fg)}
  .source-info{margin-top:10px;font-size:11px;color:var(--mut);min-height:18px}

  audio{width:100%;margin-top:10px}

  .band{margin:12px 0;padding:12px;border:1px solid var(--ln);background:var(--bg)}
  .band-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;gap:10px;flex-wrap:wrap}
  .band-title{font-size:11px;letter-spacing:.2em;color:var(--fg);text-transform:uppercase}
  .band-target{font-size:11px;color:var(--mut)}
  .band-target select{background:var(--card);color:var(--fg);border:1px solid var(--ln);padding:4px 8px;font-family:inherit;font-size:11px}

  .row{display:grid;grid-template-columns:60px 1fr 70px;align-items:center;gap:10px;margin:6px 0;font-size:11px}
  .row .lbl{color:var(--mut);letter-spacing:.1em;text-transform:uppercase}
  .row .v{text-align:right;color:var(--fg);font-variant-numeric:tabular-nums}
  .row input[type=range]{width:100%;accent-color:var(--fg)}
  .hz-presets{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;grid-column:1 / -1}
  .hz-presets button{padding:3px 8px;background:transparent;color:var(--mut);border:1px solid var(--ln);font-family:inherit;font-size:10px;letter-spacing:.05em;cursor:pointer}
  .hz-presets button:hover{color:var(--fg);border-color:var(--fg)}

  .meter{height:6px;background:var(--bar);overflow:hidden;margin-top:8px;position:relative}
  .meter-fill{height:100%;background:var(--bar-on);transition:width 0.05s linear;width:0%}
  .meter-out{height:3px;background:var(--bar);margin-top:2px;position:relative}
  .meter-out-fill{height:100%;background:var(--accent);width:0%;transition:width 0.05s linear}

  .release{width:100%;padding:11px;background:transparent;color:var(--fg);border:1px solid var(--fg);font-family:inherit;font-size:11px;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;margin-top:16px;transition:background .15s ease,color .15s ease}
  .release:hover{background:var(--fg);color:var(--card)}

  .note{margin-top:18px;font-size:11px;color:var(--mut);line-height:1.6}
  .note code{background:var(--card2);padding:1px 5px;color:var(--fg)}
</style></head>
<body>
<div class="wrap">
<header><span class="dot"></span><h1>Audio</h1><span id="status" class="bad">DISCONNECTED</span></header>

<div class="sub">Stream music into the device. Map four FFT bands onto the four knobs.</div>

<div class="section">
  <h2>Audio source</h2>
  <div class="sources">
    <button id="src-file" class="active">File</button>
    <button id="src-tab">Tab / System</button>
    <button id="src-mic">Microphone</button>
  </div>
  <div id="file-controls" style="margin-top:10px">
    <input type="file" id="file-input" accept="audio/*" style="font-size:11px">
    <audio id="audio-elem" controls></audio>
  </div>
  <div id="source-info" class="source-info"></div>
</div>

<div id="bands"></div>

<button class="release" id="release-all">Release all knobs · return to encoder control</button>

<div class="note">
Use this built-in page for audio files, microphone input, and local experiments. For YouTube, Spotify Web, or other tab/system audio, use the <code>tools/patternflow-audio-extension</code> Chrome/Edge extension instead; browser capture APIs are usually blocked on this normal HTTP device page.<br><br>
Incoming audio is converted into virtual encoder motion in firmware, so all encoder-driven patterns can react without pattern-specific audio code.
</div>

<script>
// ═══ Bands config ═══
const PRESETS = [
  { name: 'Sub',     min: 20,   max: 60    },
  { name: 'Bass',    min: 60,   max: 250   },
  { name: 'Low Mid', min: 250,  max: 500   },
  { name: 'Mid',     min: 500,  max: 2000  },
  { name: 'Hi Mid',  min: 2000, max: 4000  },
  { name: 'High',    min: 4000, max: 16000 },
];

const bands = [
  { hzMin: 60,   hzMax: 250,   knob: 0, base: 0.5, range:  0.5 },
  { hzMin: 500,  hzMax: 2000,  knob: 1, base: 0.3, range:  0.7 },
  { hzMin: 2000, hzMax: 4000,  knob: 2, base: 0.5, range:  0.5 },
  { hzMin: 4000, hzMax: 16000, knob: 3, base: 0.5, range:  0.5 },
];

const smoothing = [0, 0, 0, 0];
// What each lane was last told, so an unchanged level costs no message.
let lastSentValues = bands.map(() => -1);
const SMOOTH_ALPHA = 0.35;       // 0..1, higher = snappier
const SEND_INTERVAL_MS = 33;     // ~30 Hz WS update
let lastSendMs = 0;

// ═══ Audio context ═══
let audioCtx = null, analyser = null, sourceNode = null, freqBuf = null;
let mediaElem = null, mediaStream = null;
let currentSource = 'file';

// createMediaElementSource() can be called ONCE per media element, ever. A
// second call on the same <audio> throws InvalidStateError, which is why
// loading a second file used to kill the page: the first track worked, every
// one after it silently did nothing. Made once, kept, reconnected.
let elemSource = null;

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;  // some smoothing already in the analyser
  freqBuf = new Float32Array(analyser.frequencyBinCount);
}

function disconnectAll() {
  // Disconnect, never discard: elemSource is not replaceable.
  try { if (sourceNode) sourceNode.disconnect(); } catch (e) {}
  try { if (analyser) analyser.disconnect(); } catch (e) {}
  sourceNode = null;
  if (mediaElem) {
    mediaElem.pause();
    if (mediaElem.src && mediaElem.src.startsWith('blob:')) URL.revokeObjectURL(mediaElem.src);
    mediaElem.removeAttribute('src');
    mediaElem.load();
    mediaElem = null;
  }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  // A dead source leaves the last levels frozen on screen and in the smoother.
  smoothing.fill(0);
}

async function setSource(kind) {
  ensureAudio();
  await audioCtx.resume();
  disconnectAll();
  currentSource = kind;
  document.querySelectorAll('.sources button').forEach(b => b.classList.remove('active'));
  document.getElementById('src-' + kind).classList.add('active');
  document.getElementById('file-controls').style.display = kind === 'file' ? 'block' : 'none';
  document.getElementById('source-info').textContent = '';
}

async function loadFile(file) {
  ensureAudio();
  await audioCtx.resume();
  const audio = document.getElementById('audio-elem');
  if (mediaElem && mediaElem.src && mediaElem.src.startsWith('blob:')) {
    URL.revokeObjectURL(mediaElem.src);
  }
  audio.src = URL.createObjectURL(file);
  audio.load();
  mediaElem = audio;
  if (!elemSource) elemSource = audioCtx.createMediaElementSource(audio);
  sourceNode = elemSource;
  sourceNode.connect(analyser);
  // Routing the element through the graph takes it off the speakers, so the
  // analyser has to hand it back.
  analyser.connect(audioCtx.destination);
  audio.play().catch(() => {});
  document.getElementById('source-info').textContent = `Loaded: ${file.name}`;
}

async function captureTab() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    document.getElementById('source-info').textContent = 'Tab/system capture is blocked on this HTTP device page. Use the Patternflow Audio Chrome/Edge extension instead.';
    return;
  }
  ensureAudio();
  await audioCtx.resume();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      document.getElementById('source-info').textContent = 'No audio in selected tab. For tab/system audio, the Patternflow Audio extension is recommended.';
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    // We don't need the video; stop it.
    stream.getVideoTracks().forEach(t => t.stop());
    const audioStream = new MediaStream([audioTracks[0]]);
    mediaStream = stream;
    sourceNode = audioCtx.createMediaStreamSource(audioStream);
    sourceNode.connect(analyser);
    // Note: tab audio already plays through the tab itself — do NOT connect
    // analyser to destination or you'll get a double + echo loop.
    document.getElementById('source-info').textContent = 'Tab audio captured. If this is unreliable, use the Patternflow Audio extension.';
  } catch (err) {
    document.getElementById('source-info').textContent = 'Tab/system capture cancelled or unavailable. Use the Patternflow Audio extension for this source.';
  }
}

async function captureMic() {
  ensureAudio();
  await audioCtx.resume();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;
    sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    // Do NOT connect analyser to destination — would cause feedback.
    document.getElementById('source-info').textContent = 'Microphone live.';
  } catch (err) {
    document.getElementById('source-info').textContent = 'Microphone denied or unavailable.';
  }
}

// ═══ FFT → band energy ═══
function hzToBin(hz) {
  return Math.round(hz * analyser.fftSize / audioCtx.sampleRate);
}

function bandEnergy(band) {
  const minBin = Math.max(0, hzToBin(band.hzMin));
  const maxBin = Math.min(freqBuf.length - 1, hzToBin(band.hzMax));
  if (maxBin < minBin) return 0;
  // getFloatFrequencyData returns -Infinity for an empty bin, and one of
  // those makes the average -Infinity, then NaN once it meets the smoother —
  // and `SMOOTH_ALPHA * raw + (1 - a) * NaN` is NaN for the rest of the
  // session. The meters stick and nothing recovers until a reload. Skip them.
  let sum = 0, n = 0;
  for (let i = minBin; i <= maxBin; i++) {
    const v = freqBuf[i];
    if (Number.isFinite(v)) { sum += v; n++; }
  }
  if (!n) return 0;
  const avgDb = sum / n;
  // Map -80..-10 dB → 0..1 (typical perceptual range)
  const x = (avgDb + 80) / 70;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ═══ WebSocket ═══
const wsUrl = `ws://${location.hostname}:81`;
let ws = null, reconnectT = null;
function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { document.getElementById('status').className = 'ok'; document.getElementById('status').textContent = 'CONNECTED'; };
  ws.onclose = () => { document.getElementById('status').className = 'bad'; document.getElementById('status').textContent = 'DISCONNECTED'; if (reconnectT) clearTimeout(reconnectT); reconnectT = setTimeout(connect, 1200); };
  ws.onerror = () => { document.getElementById('status').className = 'bad'; document.getElementById('status').textContent = 'ERROR'; };
}
connect();

function wsSend(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > 0) return false;
  ws.send(msg);
  return true;
}

function wsSendControl(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

// Absolute, not a delta.
//
// This used to send `d=lane,change`, which the firmware turned into virtual
// encoder clicks — so the level did not set anything, it nudged, and the
// parameter wandered wherever the sum of nudges took it. Two consequences,
// both of which you could feel: the same music gave a different result
// depending on what had already happened, and any message the one-connection
// server dropped was an error that never washed out.
//
// `k=lane,level` lands the band inside the parameter's own declared range and
// the next frame corrects anything the last one lost.
function sendOutputValue(knob, value) {
  const idx = Math.max(0, Math.min(3, Number(knob) || 0));
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  if (Math.abs(normalized - lastSentValues[idx]) < 0.002) return;
  if (wsSend(`k=${idx},v=${normalized.toFixed(3)}`)) lastSentValues[idx] = normalized;
}

// ═══ Band UI ═══
function buildBandUI() {
  const root = document.getElementById('bands');
  root.innerHTML = '';
  bands.forEach((band, i) => {
    const div = document.createElement('div');
    div.className = 'band';
    div.innerHTML = `
      <div class="band-head">
        <span class="band-title">Band ${i + 1}</span>
        <span class="band-target">→ Knob
          <select data-i="${i}" class="target">
            <option value="0">1</option><option value="1">2</option>
            <option value="2">3</option><option value="3">4</option>
          </select>
        </span>
      </div>
      <div class="row">
        <span class="lbl">Hz min</span>
        <input type="range" min="20" max="20000" step="10" value="${band.hzMin}" data-i="${i}" class="hzMin">
        <span class="v hz-min-v">${band.hzMin}</span>
      </div>
      <div class="row">
        <span class="lbl">Hz max</span>
        <input type="range" min="20" max="20000" step="10" value="${band.hzMax}" data-i="${i}" class="hzMax">
        <span class="v hz-max-v">${band.hzMax}</span>
      </div>
      <div class="row">
        <div></div>
        <div class="hz-presets">
          ${PRESETS.map(p => `<button data-i="${i}" data-min="${p.min}" data-max="${p.max}">${p.name} ${p.min}–${p.max}</button>`).join('')}
        </div>
      </div>
      <div class="row">
        <span class="lbl">Base</span>
        <input type="range" min="0" max="1" step="0.01" value="${band.base}" data-i="${i}" class="base">
        <span class="v base-v">${band.base.toFixed(2)}</span>
      </div>
      <div class="row">
        <span class="lbl">± Range</span>
        <input type="range" min="-1" max="1" step="0.01" value="${band.range}" data-i="${i}" class="range">
        <span class="v range-v">${band.range >= 0 ? '+' : ''}${band.range.toFixed(2)}</span>
      </div>
      <div class="meter"><div class="meter-fill" id="meter-in-${i}"></div></div>
      <div class="meter-out"><div class="meter-out-fill" id="meter-out-${i}"></div></div>
    `;
    root.appendChild(div);

    div.querySelector('.target').value = band.knob;
    div.querySelector('.target').addEventListener('change', e => { band.knob = parseInt(e.target.value, 10); });
    div.querySelector('.hzMin').addEventListener('input', e => { band.hzMin = parseInt(e.target.value, 10); div.querySelector('.hz-min-v').textContent = band.hzMin; });
    div.querySelector('.hzMax').addEventListener('input', e => { band.hzMax = parseInt(e.target.value, 10); div.querySelector('.hz-max-v').textContent = band.hzMax; });
    div.querySelector('.base').addEventListener('input', e => { band.base = parseFloat(e.target.value); div.querySelector('.base-v').textContent = band.base.toFixed(2); });
    div.querySelector('.range').addEventListener('input', e => { band.range = parseFloat(e.target.value); div.querySelector('.range-v').textContent = (band.range >= 0 ? '+' : '') + band.range.toFixed(2); });
    div.querySelectorAll('.hz-presets button').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.min, 10), mx = parseInt(btn.dataset.max, 10);
        band.hzMin = mn; band.hzMax = mx;
        div.querySelector('.hzMin').value = mn; div.querySelector('.hz-min-v').textContent = mn;
        div.querySelector('.hzMax').value = mx; div.querySelector('.hz-max-v').textContent = mx;
      });
    });
  });
}
buildBandUI();

// ═══ Source buttons ═══
document.getElementById('src-file').addEventListener('click', () => setSource('file'));
document.getElementById('src-tab').addEventListener('click', () => { setSource('tab').then(captureTab); });
document.getElementById('src-mic').addEventListener('click', () => { setSource('mic').then(captureMic); });
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
});

document.getElementById('release-all').addEventListener('click', () => {
  wsSendControl('off');
  smoothing.fill(0);
  lastSentValues = bands.map(() => -1);
});

// ═══ Tick loop ═══
function tick() {
  requestAnimationFrame(tick);
  if (!analyser || !freqBuf) return;
  analyser.getFloatFrequencyData(freqBuf);

  const now = performance.now();
  const shouldSend = (now - lastSendMs) >= SEND_INTERVAL_MS;
  if (shouldSend) lastSendMs = now;

  for (let i = 0; i < 4; i++) {
    const band = bands[i];
    const raw = bandEnergy(band);
    if (!Number.isFinite(smoothing[i])) smoothing[i] = 0;
    smoothing[i] = SMOOTH_ALPHA * raw + (1 - SMOOTH_ALPHA) * smoothing[i];
    const mapped = Math.max(0, Math.min(1, band.base + smoothing[i] * band.range));

    const m1 = document.getElementById('meter-in-' + i);
    const m2 = document.getElementById('meter-out-' + i);
    if (m1) m1.style.width = (smoothing[i] * 100).toFixed(1) + '%';
    if (m2) m2.style.width = (mapped * 100).toFixed(1) + '%';

    if (shouldSend) sendOutputValue(band.knob, mapped);
  }
}
requestAnimationFrame(tick);
</script>
</div>
</body></html>
)HTML";
