# -*- coding: utf-8 -*-
"""Assemble console/audio-in.html from the extension's mapping editor.

    python firmware/toolchain/build_audio_in_page.py
    python firmware/toolchain/console_pages.py build   # then bake the header

The editor module (tools/patternflow-audio-extension/editor.js) is the single
source of truth for the mapping UI - the port philosophy is COPY, not
re-extract (port_audio_ui.py's function-lifting era ended with it; that script
is retired). This assembler:

  - reads editor.html, editor.css and editor.js from the extension,
  - swaps the cream instrument tokens for the console's dark ones (editor.js
    reads its canvas colors from CSS variables, so the theme travels free),
  - injects a device bar (microphone switch, input gain, reset) above the
    editor - the two controls that exist only on this side,
  - replaces the chrome adapter with a fetch('/api/audio-in') adapter that
    also converts levels between the device's linear scale and the editor's
    dB-normalized display axis (calibration constants live HERE, in JS,
    tweakable without a reflash).

Run it after editing the editor, then console_pages.py build. CI's page sync
check keeps the generated header honest; nothing checks that YOU reran this -
the marker comment carries the source hash so drift is at least visible.

License: MIT
"""
from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'tools' / 'patternflow-audio-extension'
OUT = ROOT / 'firmware' / 'patternflow' / 'console' / 'audio-in.html'

editor_html = (EXT / 'editor.html').read_text(encoding='utf-8')
editor_css = (EXT / 'editor.css').read_text(encoding='utf-8')
editor_js = (EXT / 'editor.js').read_text(encoding='utf-8')

src_hash = hashlib.sha1((editor_html + editor_css + editor_js).encode()).hexdigest()[:10]

body = re.search(r'<div class="page">.*</div>\s*(?=<script)', editor_html, re.S)
assert body, 'editor.html: .page block not found'
body = body.group(0)

DEVICE_BAR = '''
  <div class="deviceBar">
    <button id="micToggle" class="toggleWrap" type="button">
      <span class="toggle"><span class="dotK"></span></span>
      <span class="toggleLabel">Microphone</span>
    </button>
    <div class="damping">
      <span class="fieldLabel">Input gain</span>
      <input id="micGain" type="range" min="1" max="16" step="0.5">
      <span id="micGainVal" class="mono dimText">8.0</span>
    </div>
    <span id="deviceNote" class="hint"></span>
    <span class="spacer"></span>
    <button id="resetAll" class="ghostBtn" type="button">Reset mapping</button>
  </div>
'''

assert '</header>' in body
body = body.replace('</header>', '</header>\n' + DEVICE_BAR, 1)

ADAPTER = r'''
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
  var polling = false;
  var micOn = false;
  var phoneLive = false;

  function poll() {
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
    }).catch(function () {
      if (frameFn) frameFn({ running: false, connected: false, levels: [], env: [], spectrum: [] });
    }).finally(function () {
      // Chained, never setInterval: the device serves one connection at a
      // time, and a timer would stack requests behind a slow one.
      if (polling) setTimeout(poll, 100);
    });
  }

  function post(body) {
    return fetch('/api/audio-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).catch(function () {});
  }

  window.PFAdapter = {
    caps: function () { return { hzMin: 31.25, hzMax: 8000 }; },
    labels: { live: 'live · microphone' },
    captureHint: 'Turn the microphone on to hear the room.',
    loadConfig: function () {
      // Never reject: a failed read hands the editor its defaults and the
      // page still stands - the poll loop keeps trying, and the next save
      // writes the truth back.
      return fetch('/api/audio-in').then(function (r) { return r.json(); }).then(function (j) {
        micOn = !!j.micOn;
        var gainEl = document.getElementById('micGain');
        gainEl.value = String(j.micGain || 8);
        document.getElementById('micGainVal').textContent = Number(j.micGain || 8).toFixed(1);
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
      }).catch(function () { return null; });
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
      if (!polling) { polling = true; poll(); }
    },
    requestStatus: function () {},
    stop: function () { post('mic=0'); }
  };

  // ── the device bar ────────────────────────────────────────────────────
  function syncBar() {
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
    document.getElementById('micToggle').addEventListener('click', function () {
      micOn = !micOn;
      syncBar();
      post('mic=' + (micOn ? 1 : 0));
    });
    var gainTimer = null;
    document.getElementById('micGain').addEventListener('input', function () {
      var v = Number(document.getElementById('micGain').value);
      document.getElementById('micGainVal').textContent = v.toFixed(1);
      clearTimeout(gainTimer);
      gainTimer = setTimeout(function () { post('micGain=' + v); }, 150);
    });
    document.getElementById('resetAll').addEventListener('click', function () {
      if (!confirm('Reset every band, curve and the input gain to defaults?')) return;
      fetch('/api/audio-in/reset', { method: 'POST' }).then(function () { location.reload(); });
    });
    syncBar();
  });
})();
'''

OVERRIDES = '''
/* ── console skin over the editor's cream tokens ── */
:root {
  --cream: #0C0B09;
  --cream-2: #1B1914;
  --ink: #EDE7DB;
  --muted: #8A8272;
  --faint: #5A5546;
  --rule: #242118;
  --led: #FF5C2E;
  --ok: #57B87F;
  --bad: #FF6B5A;
  --field: #131110;
}
/* The console's Light toggle stamps html[data-theme=light] and overrides the
   CONSOLE-named variables (theme_index.h). The editor's two names of its own
   need light values here or the plot field and tags stay dark in a light
   page - which read as "the toggle does nothing". Canvas colors follow free:
   editor.js reads these variables fresh on every paint. */
html[data-theme=light] {
  --cream-2: #E8E2D6;
  --field: #FFFCFA;
}
/* device host chip is meaningless when the page IS the device */
#hostChip { display: none; }
.deviceBar {
  display: flex; align-items: center; gap: 14px;
  background: var(--field); border: 1px solid var(--rule);
  border-radius: 2px; padding: 10px 14px;
}
.toggleWrap.on .toggle { background: var(--ok); }
'''

page = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<script src="/pf-console.js"></script>\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    '<title>Patternflow - Mic mapping</title>\n'
    '<!-- GENERATED by firmware/toolchain/build_audio_in_page.py from\n'
    '     tools/patternflow-audio-extension (editor ' + src_hash + ').\n'
    '     Edit the editor there, rerun the builder, then console_pages.py build. -->\n'
    '<style>\n' + editor_css + '\n' + OVERRIDES + '\n</style>\n'
    '</head>\n<body>\n'
    + body +
    '\n<script>\n' + ADAPTER + '\n</script>\n'
    '<script>\n' + editor_js + '\n</script>\n'
    '</body>\n</html>\n'
)

import sys

if '--check' in sys.argv:
    # CI: the page on disk must be what this script would write now — so an
    # edit to the extension's editor, or to the adapter/overrides above, that
    # was not baked into console/audio-in.html fails the build instead of
    # shipping a stale page under a fresh-looking header.
    current = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    if current == page:
        print('console/audio-in.html is up to date (editor %s)' % src_hash)
        sys.exit(0)
    print('console/audio-in.html is stale: rerun firmware/toolchain/build_audio_in_page.py, '
          'then firmware/toolchain/console_pages.py build', file=sys.stderr)
    sys.exit(1)

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(page)
print('wrote', OUT.relative_to(ROOT).as_posix(), len(page), 'bytes (editor %s)' % src_hash)
