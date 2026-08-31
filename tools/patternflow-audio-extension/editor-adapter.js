// Patternflow Audio — editor adapter, extension flavor.
//
// The editor module (editor.js) knows nothing about Chrome, the device, or
// where audio comes from: it talks to exactly this surface. Porting the
// editor to the device console means swapping THIS file for one that speaks
// fetch('/api/audio-in') — the module itself moves verbatim. That boundary is
// the whole architecture; do not let editor.js grow a chrome.* call.
//
//   caps()             -> { hzMin, hzMax } the source can actually analyze
//   loadConfig()       -> the shared config (host, autoRange, bands[4])
//   saveConfig(config) -> persist + hand to the live analysis
//   onFrame(fn)        -> fn({running, connected, levels, env, spectrum, ...})
//   requestStatus()    -> ask for one immediate state push
//   stop()             -> stop capture
//
// Without chrome.* (opened as a plain file) it runs a demo: synthesized
// music-ish spectrum, config in memory. That is a preview of the editor, not
// of the product — nothing persists and nothing is captured.

(function () {
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime;

  if (hasChrome) {
    let frameFn = null;
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'state' && frameFn) frameFn(message.state || {});
    });

    window.PFAdapter = {
      caps() {
        return { hzMin: 20, hzMax: 20000 };
      },
      loadConfig() {
        return new Promise((resolve) =>
          chrome.storage.local.get('patternflowAudioConfig', (stored) =>
            resolve(stored.patternflowAudioConfig || null)));
      },
      saveConfig(config) {
        return new Promise((resolve) =>
          chrome.storage.local.set({ patternflowAudioConfig: config }, () => {
            chrome.runtime.sendMessage({ type: 'config', config }, () => {
              void chrome.runtime.lastError;  // background may be asleep; storage holds
              resolve();
            });
          }));
      },
      onFrame(fn) {
        frameFn = fn;
      },
      requestStatus() {
        chrome.runtime.sendMessage({ type: 'status' }, (response) => {
          void chrome.runtime.lastError;
          if (response && response.state && frameFn) frameFn(response.state);
        });
      },
      stop() {
        chrome.runtime.sendMessage({ type: 'stop' }, () => void chrome.runtime.lastError);
      },
      captureHint: 'Start capture from the extension popup, on the tab that is playing.'
    };
    return;
  }

  // ── demo adapter ──────────────────────────────────────────────────────
  let demoConfig = null;
  let frameFn = null;
  let t = 0;

  function demoSpectrum() {
    t += 0.08;
    const values = [];
    for (let i = 0; i < 64; i++) {
      const frac = i / 63;
      const hz = 20 * Math.pow(1000, frac);
      const lg = Math.log10(hz);
      let v = 0.05;
      const beat = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.2));
      v += (0.45 + 0.35 * beat) * Math.exp(-Math.pow(lg - Math.log10(70), 2) / 0.05);
      v += 0.32 * (0.7 + 0.3 * Math.sin(t * 1.1 + 1)) * Math.exp(-Math.pow(lg - Math.log10(900), 2) / 0.16);
      v += 0.2 * (0.6 + 0.4 * Math.sin(t * 3.1 + 2)) * Math.exp(-Math.pow(lg - Math.log10(3500), 2) / 0.06);
      v += 0.16 * Math.max(0, Math.sin(t * 4.4)) * Math.exp(-Math.pow(lg - Math.log10(9500), 2) / 0.035);
      if (hz > 12000) v *= Math.max(0.25, 1 - (hz - 12000) / 16000);
      v += (Math.sin(i * 7.3 + t * 5) * 0.02);
      values.push(Math.max(0.02, Math.min(0.95, v)));
    }
    return values;
  }

  const envLo = [1, 1, 1, 1];
  const envHi = [0, 0, 0, 0];

  function demoFrame() {
    if (!frameFn) return;
    const spectrum = demoSpectrum();
    const bands = (demoConfig && demoConfig.bands) || [];
    const levels = bands.map((band) => {
      const lo = Math.log10(band.hzMin / 20) / 3 * 64;
      const hi = Math.log10(band.hzMax / 20) / 3 * 64;
      let sum = 0, n = 0;
      for (let i = Math.max(0, Math.floor(lo)); i <= Math.min(63, Math.ceil(hi)); i++) { sum += spectrum[i]; n++; }
      return n ? sum / n : 0;
    });
    levels.forEach((v, i) => {
      if (v > envHi[i]) envHi[i] = v; else envHi[i] += (v - envHi[i]) * 0.01;
      if (v < envLo[i]) envLo[i] = v; else envLo[i] += (v - envLo[i]) * 0.01;
      if (envHi[i] < envLo[i] + 0.06) envHi[i] = envLo[i] + 0.06;
    });
    frameFn({
      running: true, connected: false, demo: true,
      levels, outputs: [],
      spectrum,
      env: demoConfig && demoConfig.autoRange ? envLo.map((lo, i) => ({ lo, hi: envHi[i] })) : [],
      autoRange: !!(demoConfig && demoConfig.autoRange)
    });
  }

  window.PFAdapter = {
    caps() { return { hzMin: 20, hzMax: 20000 }; },
    loadConfig() { return Promise.resolve(demoConfig); },
    saveConfig(config) { demoConfig = config; return Promise.resolve(); },
    onFrame(fn) { frameFn = fn; setInterval(demoFrame, 120); },
    requestStatus() { demoFrame(); },
    stop() {},
    captureHint: 'Demo mode — open this page from the extension for live audio.',
    _setDemoConfig(config) { demoConfig = config; }
  };
})();
