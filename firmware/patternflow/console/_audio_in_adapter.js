// /audio-in, the panel's half: window.PFAdapter. A source, not a page:
// firmware/toolchain/build_audio_in_page.py puts it in console/audio-in.html
// where the extension's editor.html loads editor-adapter.js. Edit it here,
// then run console_pages.py build. Whole-line comments and indentation do not
// travel; a template literal has to stay on one line (the build says so).
//
// Console adapter: the same surface editor-adapter.js gives the extension,
// spoken over fetch('/api/audio-in'). Two extra jobs live here:
//
//   - scale conversion. The firmware measures, gates and maps in LINEAR
//     amplitude (every constant in core_audio_in_map.h was measured on that
//     scale and stays); the editor's vertical axis is dB-normalized so boxes
//     drag like hearing works. This file converts both ways at the boundary.
//     DB_FLOOR/DB_SPAN are the calibration: quiet room should sit ~0.15 up
//     the axis, listening-volume peaks ~0.9. Tweak here, no reflash.
//
//   - the device bar. Microphone power and input gain exist only on this
//     side; they talk to the same API directly.
(function () {
  var DB_FLOOR = -45, DB_SPAN = 47;
  function clamp01(v) { v = Number(v) || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function dbn(x) { return clamp01((20 * Math.log10(Math.max(Number(x) || 0, 1e-4)) - DB_FLOOR) / DB_SPAN); }
  function lin(v) { return Math.pow(10, (clamp01(v) * DB_SPAN + DB_FLOOR) / 20); }

  var PRESET_CURVES = {
    smooth: { type: 'bezier', id: 'smooth', y0: 0, y1: 1, p1x: 0.45, p1y: 0.05, p2x: 0.55, p2y: 0.95 },
    sharp:  { type: 'bezier', id: 'sharp',  y0: 0, y1: 1, p1x: 0.10, p1y: 0.65, p2x: 0.35, p2y: 1.00 },
    fall:   { type: 'bezier', id: 'fall',   y0: 1, y1: 0, p1x: 0.45, p1y: 0.95, p2x: 0.55, p2y: 0.05 }
  };

  function encodeMeta(curve) {
    if (!curve) return '';
    if (curve.type === 'steps') return 's:' + curve.n;
    if (curve.type === 'arch') return 'a';
    if (curve.type === 'bezier') {
      if (curve.id && PRESET_CURVES[curve.id]) return 'p:' + curve.id;
      return 'b:' + [curve.y0, curve.y1, curve.p1x, curve.p1y, curve.p2x, curve.p2y]
        .map(function (v) { return Math.round(clamp01(v) * 100); }).join(',');
    }
    return '';
  }

  function decodeMeta(m) {
    if (!m) return null;
    if (m === 'a') return { type: 'arch', id: 'arch' };
    if (m.slice(0, 2) === 's:') {
      var n = Math.max(2, Math.min(8, parseInt(m.slice(2), 10) || 2));
      return { type: 'steps', id: n === 2 ? 'gate' : 'steps', n: n };
    }
    if (m.slice(0, 2) === 'p:') {
      var p = PRESET_CURVES[m.slice(2)];
      return p ? JSON.parse(JSON.stringify(p)) : null;
    }
    if (m.slice(0, 2) === 'b:') {
      var q = m.slice(2).split(',').map(function (v) { return (parseInt(v, 10) || 0) / 100; });
      if (q.length !== 6) return null;
      return { type: 'bezier', id: 'custom', y0: q[0], y1: q[1], p1x: q[2], p1y: q[3], p2x: q[4], p2y: q[5] };
    }
    return null;
  }

  var frameFn = null;
  var micOn = false;
  var phoneLive = false;
  var audOn = false;

  // The levels loop keeps its own chained 100 ms timer instead of PF.poll:
  // ten frames a second is this page's whole job, and the chrome's lane
  // would queue it behind every status poll. It starts once the config read
  // has settled (a frame before that paints on an unsized plot and races the
  // read for the panel's one connection), sleeps while the tab is hidden and
  // stops on pagehide.
  var ready = false, gone = false, busy = false, timer = 0;

  function tick() {
    clearTimeout(timer);
    timer = 0;
    if (!ready || !frameFn || gone || busy || document.hidden) return;
    busy = true;
    var wait = 100;
    fetch('/api/audio-in?levels=1').then(function (r) { return r.json(); }).then(function (j) {
      // ext frames come from the phone app, already on the editor's own
      // normalized scale - converting them again would wreck them. The
      // device's mic values are linear and get the dB treatment.
      var ext = j.ext === true;
      micOn = !ext && j.source !== 'off';
      phoneLive = ext;
      syncBar();
      window.PFAdapter.labels.live = ext ? 'live · phone' : 'live · microphone';
      var conv = ext ? function (v) { return v; } : dbn;
      if (frameFn) frameFn({
        running: ext || micOn,
        connected: ext || micOn,
        levels: (j.levels || []).map(conv),
        outputs: j.outputs || [],
        env: (j.env || []).map(function (e) { return { lo: conv(e.lo), hi: conv(e.hi) }; }),
        spectrum: (j.spectrum || []).map(conv),
        autoRange: true
      });
    }).catch(function (e) {
      // AbortError is the chrome freeing the connection for a link just
      // clicked (or pagehide); asking again in 100 ms would take it back
      // from the next page. Still here in 3 s: the navigation was cancelled.
      if (e && e.name === 'AbortError') { wait = 3000; return; }
      // Unreachable: ask once a second, not ten times (the chrome shows it).
      wait = 1000;
      if (frameFn) frameFn({ running: false, connected: false, levels: [], env: [], spectrum: [] });
    }).then(function () {
      // Chained, never setInterval: the device serves one connection at a
      // time, and a timer would stack requests behind a slow one.
      busy = false;
      if (!gone && !timer) timer = setTimeout(tick, wait);
    });
  }
  function start() { if (!ready) { ready = true; tick(); } }
  document.addEventListener('visibilitychange', function () { if (!timer) tick(); });
  window.addEventListener('pagehide', function () { gone = true; clearTimeout(timer); timer = 0; });
  window.addEventListener('pageshow', function () { if (gone) { gone = false; tick(); } });

  // Every edit autosaves; PF.dirty covers the gap until the panel has it,
  // so the chrome's version reload never drops one. A failure is said next
  // to the device bar (the editor itself has no slot for it).
  var saving = 0, gainTimer = null;
  function say(text, kind) { PF.say(text, kind, document.getElementById('barMsg')); }
  function post(body) {
    saving++;
    PF.dirty = true;
    return fetch('/api/audio-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (r) {
      if (!r.ok) throw Error('HTTP ' + r.status);
      if (document.getElementById('barMsg').textContent) say('saved', 'ok');
    }).catch(function () {
      say('not saved: the panel did not take it. Change it again to retry.', 'err');
    }).then(function () {
      if (!--saving && !gainTimer) PF.dirty = false;
    });
  }

  window.PFAdapter = {
    caps: function () { return { hzMin: 31.25, hzMax: 8000 }; },
    labels: { live: 'live · microphone' },
    captureHint: 'Turn the microphone on to hear the room.',
    loadConfig: function () {
      // Never reject: a failed read hands the editor its defaults and the
      // page still stands - the levels loop keeps trying, and the next save
      // writes the truth back. One request at a time: the config, then the
      // AUD switch, then the loop.
      return fetch('/api/audio-in').then(function (r) { return r.json(); }).then(function (j) {
        micOn = !!j.micOn;
        var gainEl = document.getElementById('micGain');
        gainEl.value = String(j.micGain || 8);
        document.getElementById('micGainVal').textContent = Number(j.micGain || 8).toFixed(1);
        fetch('/api/audio').then(function (r) { return r.json(); }).then(function (a) {
          audOn = !!a.audioRuntime;
          syncBar();
        }).catch(function () {}).then(start);
        syncBar();
        return {
          host: 'this device',
          smoothing: j.smoothing || 0.35,
          attack: j.attack || 0.65,
          autoRange: !!j.autoRange,
          bands: (j.bands || []).map(function (b) {
            return {
              hzMin: b.hzMin, hzMax: b.hzMax,
              inMin: dbn(b.inMin), inMax: dbn(b.inMax),
              gain: b.gain, outMin: b.outMin, outMax: b.outMax,
              knob: b.knob, muted: b.muted,
              curve: decodeMeta(b.meta), lut: null
            };
          })
        };
      }).catch(function () { start(); return null; });
    },
    saveConfig: function (cfg) {
      var parts = ['auto=' + (cfg.autoRange ? 1 : 0),
        'smoothing=' + cfg.smoothing.toFixed(3),
        'attack=' + cfg.attack.toFixed(3)];
      cfg.bands.forEach(function (b, i) {
        parts.push('hzMin' + i + '=' + b.hzMin.toFixed(1));
        parts.push('hzMax' + i + '=' + b.hzMax.toFixed(1));
        parts.push('inMin' + i + '=' + lin(b.inMin).toFixed(5));
        parts.push('inMax' + i + '=' + lin(b.inMax).toFixed(5));
        parts.push('gain' + i + '=' + b.gain.toFixed(3));
        parts.push('outMin' + i + '=' + b.outMin.toFixed(3));
        parts.push('outMax' + i + '=' + b.outMax.toFixed(3));
        parts.push('knob' + i + '=' + b.knob);
        parts.push('muted' + i + '=' + (b.muted ? 1 : 0));
        parts.push('meta' + i + '=' + encodeURIComponent(encodeMeta(b.curve)));
        if (Array.isArray(b.lut) && b.lut.length) {
          parts.push('lut' + i + '=' + b.lut.map(function (v) {
            return Math.round(clamp01(v) * 255);
          }).join(','));
        }
      });
      return post(parts.join('&'));
    },
    onFrame: function (fn) {
      frameFn = fn;
      tick();
    },
    requestStatus: function () {},
    stop: function () { post('mic=0'); }
  };

  // ── the device bar ────────────────────────────────────────────────────
  function syncBar() {
    var audT = document.getElementById('audToggle');
    if (audT) audT.classList.toggle('on', audOn);
    var t = document.getElementById('micToggle');
    if (t) t.classList.toggle('on', micOn);
    var note = document.getElementById('deviceNote');
    if (note) {
      note.textContent = micOn ? ''
        : phoneLive ? 'showing the phone app’s audio'
        : 'microphone is off — the panel is not listening';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var audBtn = document.getElementById('audToggle');
    if (audBtn) {
      audBtn.addEventListener('click', function () {
        var want = audOn = !audOn;
        syncBar();
        fetch('/api/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'on=' + (want ? 1 : 0)
        }).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status); }).catch(function () {
          // Nothing re-reads this switch, so a lost request would leave it lying.
          if (audOn === want) { audOn = !want; syncBar(); }
          say('AUD did not switch: the panel did not take it.', 'err');
        });
      });
    }
    document.getElementById('micToggle').addEventListener('click', function () {
      micOn = !micOn;
      syncBar();
      post('mic=' + (micOn ? 1 : 0));
    });
    document.getElementById('micGain').addEventListener('input', function () {
      var v = Number(document.getElementById('micGain').value);
      document.getElementById('micGainVal').textContent = v.toFixed(1);
      PF.dirty = true;
      clearTimeout(gainTimer);
      gainTimer = setTimeout(function () { gainTimer = null; post('micGain=' + v); }, 150);
    });
    document.getElementById('resetAll').addEventListener('click', function () {
      if (!confirm('Reset every band, curve and the input gain to defaults?')) return;
      PF.busy(this, fetch('/api/audio-in/reset', { method: 'POST' }).then(function (r) {
        if (!r.ok) throw Error('HTTP ' + r.status);
        location.reload();
      })).catch(function () { say('Reset failed: the panel did not take it.', 'err'); });
    });
    syncBar();
  });
})();
