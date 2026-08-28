# -*- coding: utf-8 -*-
"""Assemble the device's /audio-in page from the Chrome extension's UI.

The extension's popup is the interface people have actually used and liked.
Rewriting it for the device produced something worse, so this ports it
instead: the CSS verbatim with the palette flipped, the markup verbatim, and
the pure UI functions lifted out of popup.js by name.

Re-runnable. If the extension's UI changes, run this again.
"""
import io, os, re, sys

EXT = "tools/patternflow-audio-extension"
OUT = "firmware/patternflow/console/audio-in.html"


def read(p):
    f = io.open(p, encoding="utf-8", newline="")
    t = f.read().replace("\r\n", "\n")
    f.close()
    return t


def lift(js, names):
    """Pull whole top-level functions/consts out of popup.js by name.

    A `function` and a `const` end in different places, and conflating them is
    how this went wrong twice: a shared bracket counter cut every function at
    the closing paren of its parameter list, and before that a brace-only
    counter ran a multi-line `const X = [...]` into whatever came next.

    So: a function ends at the `}` that closes its body; anything else ends at
    the first `;` outside brackets.
    """
    out = []
    for n in names:
        NL = chr(92) + "n"
        pat = ("^((?://[^" + NL + "]*" + NL + ")*)"
               "((function|const|let)" + chr(92) + "s+%s" + chr(92) + "b)")
        m = re.search(pat % re.escape(n), js, re.M)
        assert m, "not found: %s" % n
        lead, start, kind = m.group(1), m.start(2), m.group(3)

        if kind == "function":
            body = js.index("{", start)          # past the parameter list
            depth, j = 0, body
            while j < len(js):
                if js[j] == "{":
                    depth += 1
                elif js[j] == "}":
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
        else:
            depth, j = 0, start
            while j < len(js):
                c = js[j]
                if c in "([{":
                    depth += 1
                elif c in ")]}":
                    depth -= 1
                elif c == ";" and depth == 0:
                    j += 1
                    break
                j += 1
        out.append(lead + js[start:j])
    return (chr(10) + chr(10)).join(out)

css = read(os.path.join(EXT, "popup.css"))
html = read(os.path.join(EXT, "popup.html"))
js = read(os.path.join(EXT, "popup.js"))

# ── the parts of the markup the device needs ────────────────────────────
spectrum = html[html.index('<section class="spectrum-section">'):
                html.index("</section>", html.index('<div id="bandTabs"')) + len("</section>")]
template = html[html.index('<template id="band-template">'):
                html.index("</template>") + len("</template>")]

# ── UI logic, verbatim ──────────────────────────────────────────────────
lifted = lift(js, [
    "clamp01", "clampHz", "hzToX", "xToHz", "formatHz",
    "clampBandRange", "BOOST_STEPS", "mapBandOutput", "boostHint",
    "buildPlot", "renderBandTabs", "selectBand", "buildBands",
    "drawSpectrum", "renderSpectrumBands", "bindSpectrumDrag",
    "HZ_PRESETS", "ALL_BANDS",
])

# ── The one place the port cannot be verbatim ───────────────────────────
#
# drawSpectrum paints the canvas with three literal colours. In the extension
# that is fine — the popup is always light — but a canvas cannot inherit a CSS
# variable, so on a console page it ignored the theme completely and drew a
# cream panel with dark bars whichever way the Light switch was set.
#
# Substituted here rather than in the extension: the extension is not wrong,
# it simply has one theme. themeColor() is defined in the device half below
# and re-reads on a theme change.
for literal, name, why in [
    ("'#fbf7ef'", "--field", "the panel behind the bars"),
    ("'#d9d1c0'", "--rule", "the quarter lines"),
    ("'#6b655a'", "--muted", "alternating bar"),
    ("'#141414'", "--ink", "alternating bar"),
]:
    assert literal in lifted, "drawSpectrum no longer uses %s" % literal
    lifted = lifted.replace(literal, "themeColor('%s')" % name)

PAGE_TMPL = u'''<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<script src="/pf-console.js"></script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Mic</title>
<style>
/* ── Ported from tools/patternflow-audio-extension/popup.css ────────────
   Verbatim, because the extension's popup is the interface people have used
   and liked, and a second one written from scratch was worse. Only the nine
   palette variables below it are changed: the extension is a light popup and
   this is a page inside the device's dark console.

   Regenerate with firmware/toolchain/port_audio_ui.py after changing the
   extension, rather than editing here. */
@@CSS@@

/* ── The console's palette, over the extension's ──────────────────────
   The dark values, which is what a console page is by default. Light mode
   arrives from /pf-console.js: it stamps html[data-theme=light] and injects
   its own variable block, and that selector outranks :root, so these are
   simply replaced when somebody ticks Light.

   That only works for names BOTH sides know. popup.css uses two the console
   has never heard of — `--cream-2` (the console spells it --cream2) and
   `--field` (the console calls it --panel) — so in light mode those two kept
   their dark values and a few surfaces stayed black on a white page. They are
   aliases now: the value is resolved where it is used, so it follows whichever
   theme is in effect instead of being frozen here. */
:root{
  --cream:#0C0B09; --cream2:#131110; --ink:#EDE7DB; --muted:#8A8272;
  --faint:#5A5546; --rule:#242118; --led:#FF5C2E; --ok:#57B87F;
  --bad:#D9534F; --panel:#131110;
}
:root{ --cream-2: var(--cream2); --field: var(--panel); }
body{max-width:760px;margin:0 auto;padding:28px 20px 64px}
/* The console injects its own header, so the popup's brand row goes. */
.wrap-note{font-size:12px;color:var(--faint);line-height:1.45;margin:10px 0 0}
.srcline{display:flex;align-items:baseline;gap:10px;padding:9px 11px;margin-bottom:18px;
border:1px solid var(--rule);background:var(--field);border-radius:2px}
.srcline b{font-size:12px}
.srcline.warn{border-color:var(--bad)} .srcline.warn b{color:var(--bad)}
.srcline span{font-family:var(--mono,ui-monospace,monospace);font-size:11px;
color:var(--faint);margin-left:auto}
.drive{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);
padding:6px 0;margin-bottom:12px}
.drive input{accent-color:var(--led)}
</style>
</head>
<body>

<div class="srcline" id="srcline"><b id="srcName">connecting</b><span id="srcRaw"></span></div>
<p class="wrap-note" id="heapline"></p>

<label class="drive"><input type="checkbox" id="mic"> <b>Microphone</b></label>
<p class="wrap-note">The panel listens, and the four bands below turn the four knobs, so patterns
react to the room with no computer in it.
<br><br>
Off until you turn it on, and off is right for most panels: the mic is four wires to a breakout
rather than a part on the board, and an analysis over a floating pin is worth nobody's memory.
Turning it off releases the I2S driver and parks the analysis. The setting is remembered.
<br><br>
A hand on an encoder always wins and keeps that knob for five seconds. A browser tab sending
audio through the Chrome extension outranks the microphone on any knob it has already claimed.</p>

@@SPECTRUM@@

@@TEMPLATE@@

<main id="bands"></main>

<p class="wrap-note"><b>Travel</b> is how much of its knob a band uses between silence and its
own loudest moment. Under a third and the band is there without doing anything &mdash; pull its
<em>Full at</em> handle in, or raise the boost. If a quiet room already moves the knobs, that is
the noise floor: drag <em>Ignores below</em> up until the dot sits still.</p>

<script>
var $ = function(id){ return document.getElementById(id); };

// ── Ported from the extension, verbatim ─────────────────────────────────
// These are the functions that draw and drag. They are lifted rather than
// rewritten so the two surfaces behave identically — a person who learned
// one has learned the other — and so a fix to either lands in both.
var MIN_HZ = 31.25, MAX_HZ = 8000;   // the device's analysable range, not 20..20k

// A canvas cannot inherit a CSS variable, so the spectrum has to look one up.
// Cached, because this is called four times per repaint at ten repaints a
// second, and invalidated when the console's Light switch changes the theme
// attribute on <html>.
var themeCache = {};
function themeColor(name){
  if (themeCache[name]) return themeCache[name];
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  themeCache[name] = v || '#888';
  return themeCache[name];
}
new MutationObserver(function(){ themeCache = {}; })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

@@LIFTED@@

// ── The device half ─────────────────────────────────────────────────────
//
// Everything above came from a popup whose settings live in chrome.storage
// and whose levels arrive over a port. Here the settings live on the panel
// and the levels are polled, and the difference matters in exactly one way:
//
//   THE PAGE OWNS THE CONFIG. It is read once, at load. After that the page
//   is the truth and writes to the device; the poll brings back levels and
//   nothing else.
//
// The first version of this page re-read the whole config every 100 ms and
// tried to decide, per tick, whether the user was mid-gesture. Any POST that
// had not landed yet lost, so a dragged handle sprang back and the controls
// felt stuck. There is no clever version of that. One owner, one direction.
var config = { bands: [] };
var state = null;              // last levels payload
var bandEls = [];
var activeBandIndex = 0;
var spectrumDrag = null;
var saveTimer = null;
var pending = {};

// Debounced, and coalesced per band: dragging emits pointer-rate changes and
// this panel answers one connection at a time.
function persistConfig() {
  config.bands.forEach(function(b, i){ pending[i] = b; });
  if (saveTimer) return;
  saveTimer = setTimeout(function(){
    saveTimer = null;
    var jobs = Object.keys(pending);
    pending = {};
    jobs.forEach(function(i){
      var b = config.bands[i];
      var body = 'band=' + i +
        '&hzMin=' + b.hzMin.toFixed(1) + '&hzMax=' + b.hzMax.toFixed(1) +
        '&inMin=' + b.inMin.toFixed(4) + '&inMax=' + b.inMax.toFixed(4) +
        '&gain=' + b.gain.toFixed(3) +
        '&outMin=' + b.outMin.toFixed(3) + '&outMax=' + b.outMax.toFixed(3) +
        '&knob=' + b.knob + '&muted=' + (b.muted ? '1' : '0');
      var x = new XMLHttpRequest();
      x.open('POST', '/api/audio-in');
      x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      x.send(body);
    });
  }, 200);
}

// Levels only. One request in flight at a time, chained rather than on an
// interval: this web server takes one connection, and a timer that fires
// while the last request is still open queues them up until every reading is
// stale and the page feels like it is dragging behind the sound.
var polling = false;
function poll() {
  if (polling) return;
  polling = true;
  var x = new XMLHttpRequest();
  x.open('GET', '/api/audio-in?levels=1');
  x.onloadend = function(){
    polling = false;
    var d = null;
    try { d = JSON.parse(x.responseText); } catch (e) {}
    if (d) { state = d; paintLive(); }
    setTimeout(poll, 90);
  };
  x.send();
}

// The tail of the extension's renderState(), which is the part that is not
// about capture status. Kept in the extension's own terms — levels, outputs,
// spectrum, entry.plot.live, the 0.995 peak decay — so it stays comparable to
// the file it came from.
function paintLive() {
  if (!state) return;

  var live = state.source === 'pdm';
  $('srcline').className = 'srcline' + (live ? '' : ' warn');
  $('srcName').textContent = live ? 'Microphone' : state.source;
  $('srcRaw').textContent = 'peak ' + Number(state.rawPeak).toFixed(5) +
                            '  dc ' + Number(state.rawDc).toFixed(5);

  var levels = state.levels || [];
  var outputs = state.outputs || [];
  for (var i = 0; i < bandEls.length; i++) {
    var entry = bandEls[i];
    var level = levels[i] || 0;
    entry.level.style.width = Math.round(level * 100) + '%';
    entry.output.style.width = Math.round((outputs[i] || 0) * 100) + '%';
    // The dot is the point of the graph: it says where this sound lands, and
    // it is the only part that can tell you a band is doing nothing.
    if (entry.plot) entry.plot.live(level);

    if (entry.travel) {
      var b = entry.band;
      entry.peak = Math.max(level, (entry.peak || 0) * 0.995);
      var span = Math.max(0.01, b.outMax - b.outMin);
      var travel = (mapBandOutput(b, entry.peak) - mapBandOutput(b, 0)) / span;
      entry.travel.textContent = Math.round(Math.min(1, travel) * 100) + '%';
      entry.travel.classList.toggle('weak', travel < 0.34);
      entry.travel.title = travel < 0.34
        ? 'This band is barely moving its knob - pull "Full at" left, or add boost'
        : 'How much of its knob this band is using';
    }
  }
  drawSpectrum(state.spectrum || []);
}

// Read the config once, build the UI from it, then start the level poll.
(function start(){
  var x = new XMLHttpRequest();
  x.open('GET', '/api/audio-in');
  x.onload = function(){
    var d = JSON.parse(x.responseText);
    if (d.hzRange && d.hzRange.length === 2) { MIN_HZ = d.hzRange[0]; MAX_HZ = d.hzRange[1]; }
    config.bands = d.bands.map(function(b, i){
      return { hzMin: b.hzMin, hzMax: b.hzMax, inMin: b.inMin, inMax: b.inMax,
               gain: b.gain, outMin: b.outMin, outMax: b.outMax,
               knob: b.knob, muted: b.muted === true };
    });
    $('mic').checked = !!d.micOn;
    paintHeap();
    buildBands();
    renderBandTabs();
    renderSpectrumBands();
    bindSpectrumDrag();
    selectBand(0);
    poll();
  };
  x.send();
})();

// Free heap, next to the switch that changes it. Not decoration: the claim
// that the microphone costs about 8 KB of internal heap should be checkable by
// the person who cares, in the two seconds it takes to tick a box, rather than
// taken from a commit message.
function paintHeap(){
  var x = new XMLHttpRequest();
  x.open('GET', '/api/status');
  x.onload = function(){
    try {
      var d = JSON.parse(x.responseText);
      $('heapline').textContent =
        'free internal ' + d.heapInternal.toLocaleString() +
        ' B, largest block ' + d.heapLargest.toLocaleString() + ' B';
    } catch (e) {}
  };
  x.send();
}

$('mic').addEventListener('change', function(){
  var on = $('mic').checked;
  var x = new XMLHttpRequest();
  x.open('POST', '/api/audio-in');
  x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  // The driver takes a moment to install or release, and the heap reading is
  // only interesting once it has.
  x.onloadend = function(){ setTimeout(paintHeap, 700); };
  x.send('mic=' + (on ? '1' : '0'));
});

</script>
</body></html>
'''

PAGE = (PAGE_TMPL.replace("@@CSS@@", css)
                 .replace("@@SPECTRUM@@", spectrum)
                 .replace("@@TEMPLATE@@", template)
                 .replace("@@LIFTED@@", lifted))
io.open(OUT, "w", encoding="utf-8", newline="").write(PAGE)
print("  wrote %s  (%d bytes)" % (OUT, len(PAGE)))
print("  lifted: %d functions from popup.js" % len(lifted.split("\n\n")))
