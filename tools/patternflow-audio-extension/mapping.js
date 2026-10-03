// Patternflow Audio — the mapping model.
//
// What a mapping is, written once. Four bands, one per knob. A band listens
// to a range of frequencies and takes the level it hears there through
//
//   level -> window -> response curve -> [rests at .. peaks at]
//
// where the window is the band's own (manual) or the envelope the band has
// recently moved in (auto range). offscreen.js runs that chain for the knobs;
// the editor draws it and previews it; both ask this file, so a box on the
// screen and a knob on the panel cannot be told two different things.
//
// It is ONE object on purpose. These are classic scripts sharing a global
// scope, where a second top-level `clamp01` in any file is a SyntaxError that
// kills the page at load and that `node --check` on each file cannot see.
// Everything here is reached as PFMap.something; nothing else is declared.
//
// Two halves. Down to the line that says so, this is the model: no chrome.*,
// no DOM, none of the extension's own numbers. That half also travels to the
// panel, inside its /audio-in page (firmware/toolchain/build_audio_in_page.py
// stops reading at the line), so every byte of it is sent over the panel's
// Wi-Fi: keep it to what the editor needs on both sides. Below the line is
// what only the extension's audio source knows.

var PFMap = (function () {
  'use strict';

  const within = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const clamp01 = (v) => within(v, 0, 1);

  // ── response curves ─────────────────────────────────────────────────────
  //
  // A curve is authored as one of these shapes and BAKED to a 33-point table.
  // Whatever maps for real - offscreen.js here, the firmware on the panel -
  // only interpolates the table, and never learns what a bezier is.

  const PRESETS = {
    smooth: { type: 'bezier', id: 'smooth', y0: 0, y1: 1, p1x: 0.45, p1y: 0.05, p2x: 0.55, p2y: 0.95 },
    sharp:  { type: 'bezier', id: 'sharp',  y0: 0, y1: 1, p1x: 0.10, p1y: 0.65, p2x: 0.35, p2y: 1.00 },
    fall:   { type: 'bezier', id: 'fall',   y0: 1, y1: 0, p1x: 0.45, p1y: 0.95, p2x: 0.55, p2y: 0.05 },
    gate:   { type: 'steps',  id: 'gate',  n: 2 },
    steps:  { type: 'steps',  id: 'steps', n: 3 },
    arch:   { type: 'arch',   id: 'arch' }
  };

  function evalCurve(curve, u) {
    u = clamp01(u);
    if (!curve) return u;
    if (curve.type === 'steps') {
      const n = within(Math.round(curve.n) || 2, 2, 8);
      return Math.min(n - 1, Math.floor(u * n)) / (n - 1);
    }
    if (curve.type === 'arch') return Math.sin(Math.PI * u);
    if (curve.type === 'bezier') {
      // Cubic from (0, y0) to (1, y1); x(t) is monotone while both control xs
      // stay in [0,1], so a short bisection recovers t for any u.
      const { y0 = 0, y1 = 1, p1x, p1y, p2x, p2y } = curve;
      const bx = (t) => 3 * (1 - t) * (1 - t) * t * p1x + 3 * (1 - t) * t * t * p2x + t * t * t;
      const by = (t) => (1 - t) * (1 - t) * (1 - t) * y0 + 3 * (1 - t) * (1 - t) * t * p1y + 3 * (1 - t) * t * t * p2y + t * t * t * y1;
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (bx(mid) < u) lo = mid; else hi = mid;
      }
      return clamp01(by((lo + hi) / 2));
    }
    return u;
  }

  function bakeLut(curve) {
    const lut = [];
    for (let i = 0; i <= 32; i++) lut.push(Number(evalCurve(curve, i / 32).toFixed(4)));
    return lut;
  }

  // ── level to knob ───────────────────────────────────────────────────────

  // The narrowest window and the shortest stretch of knob a band may have.
  const MIN_WINDOW = 0.02;
  const MIN_OUT = 0.05;

  const api = {
    clamp01, PRESETS, evalCurve, bakeLut, MIN_WINDOW, MIN_OUT,

    // The response at a position in the window: the band's curve, or, for a
    // band saved before there were curves, its boost exponent (above 1x a
    // quiet band reaches its top early, below 1x a loud one holds back).
    curveValue(band, u) {
      return band.curve ? evalCurve(band.curve, u)
        : Math.pow(clamp01(u), 1 / within(Number(band.gain) || 1, 0.2, 4));
    },

    // Where a level sits in the band's window, 0..1: the input of the curve.
    // `env` is the band's { lo, hi } envelope while auto range runs, null for
    // the band's own inMin..inMax. Auto range maps a fixed slice of the
    // envelope: under 0.10 of it is squelched, so the resting noise at the
    // floor does not dance, and 0.95 of it is already full scale.
    position(level, band, env) {
      if (env) {
        return clamp01((clamp01((level - env.lo) / Math.max(0.001, env.hi - env.lo)) - 0.10) / (0.95 - 0.10));
      }
      const lo = clamp01(band.inMin);
      return clamp01((level - lo) / Math.max(MIN_WINDOW, clamp01(band.inMax) - lo));
    },

    // The knob value for a position in the window, through the curve.
    output(band, u) {
      const lo = clamp01(band.outMin);
      return lo + api.curveValue(band, u) * (clamp01(band.outMax) - lo);
    },

    // The default band: what Reset gives, and what a first run starts with.
    defaultBand(index, caps) {
      return normalizeBand(null, index, caps);
    },

    // The whole mapping, made whole: { autoRange, smoothing, attack, bands[4] }.
    // `caps` is the source's { hzMin, hzMax }. smoothing and attack are the
    // two alphas of the level glide: how fast a level falls, how fast it rises.
    //
    // Nothing stored is a first run, and starts the way the panel does: auto
    // range on, four default bands. Something stored is somebody's mapping
    // and is not improved behind their back; in particular one saved before
    // auto range existed has no `autoRange` and stays manual.
    normalizeConfig(raw, caps) {
      const stored = raw && Array.isArray(raw.bands) ? raw : { autoRange: true, bands: [] };
      return {
        autoRange: stored.autoRange === true,
        smoothing: within(Number(stored.smoothing) || 0.35, 0.05, 0.9),
        attack: within(Number(stored.attack) || 0.65, 0.05, 0.9),
        bands: [0, 1, 2, 3].map((i) => normalizeBand(stored.bands[i], i, caps))
      };
    }
  };

  const HZ = [[60, 250], [250, 2000], [2000, 5000], [5000, 16000]];

  // lo and hi inside floor..ceiling, in that order, at least `gap` apart.
  function pair(lo, hi, floor, ceiling, gap) {
    lo = within(lo, floor, ceiling);
    hi = within(hi, floor, ceiling);
    if (lo > hi) [lo, hi] = [hi, lo];
    if (hi - lo < gap) {
      hi = Math.min(ceiling, lo + gap);
      lo = Math.min(lo, hi - gap);
    }
    return [lo, hi];
  }

  // One band, made whole. No band at all is the default: its slice of the
  // spectrum, the full window, the Smooth curve already baked. A band that IS
  // stored keeps what it has and gains nothing: saved before curves existed
  // it has no curve and keeps its boost exponent, and saved when the output
  // range was `base` + `range` it is read as that.
  function normalizeBand(raw, index, caps) {
    const b = raw && typeof raw === 'object' ? raw
      : { outMin: 0.30, outMax: 0.85, curve: { ...PRESETS.smooth }, lut: bakeLut(PRESETS.smooth) };
    const base = b.base ?? 0.30;
    const [hzMin, hzMax] = pair(b.hzMin ?? HZ[index][0], b.hzMax ?? HZ[index][1], caps.hzMin, caps.hzMax, 10);
    const [inMin, inMax] = pair(b.inMin ?? 0, b.inMax ?? 1, 0, 1, MIN_WINDOW);
    const [outMin, outMax] = pair(b.outMin ?? base, b.outMax ?? base + (b.range ?? 0.55), 0, 1, MIN_OUT);
    return {
      hzMin, hzMax,
      // Four bands, four knobs, one line between them: band i drives knob i.
      knob: index,
      muted: b.muted === true,
      inMin, inMax,
      gain: within(Number(b.gain) || 1, 0.2, 4),
      outMin, outMax,
      curve: b.curve && typeof b.curve === 'object' ? b.curve : null,
      lut: Array.isArray(b.lut) && b.lut.length > 1 ? b.lut : null
    };
  }

  return api;
})();

// ── EXTENSION ONLY ────────────────────────────────────────────────────────
//
// What the extension's audio source knows and the panel's does not.

(function (M) {
  'use strict';

  // Where the mapping is stored. The panel's address is not in it: that is the
  // popup's, under a key of its own, so the editor and the popup never write
  // the same value and neither can put the other's old one back.
  M.CONFIG_KEY = 'patternflowAudioConfig';

  // Tab audio through an AnalyserNode: the frequencies worth drawing, and the
  // dB the level axis runs between, bottom then top. Levels everywhere in the
  // extension are 0..1 along that axis.
  M.SOURCE = { hzMin: 20, hzMax: 20000, db: [-80, -10] };

  M.normalizeDb = function (db) {
    return M.clamp01((db - M.SOURCE.db[0]) / (M.SOURCE.db[1] - M.SOURCE.db[0]));
  };

  // The knob gets the band's TABLE where it has one, interpolated the way the
  // firmware interpolates it, and not the curve the table was baked from: a
  // table rounds a step's corner, and what is sent should be what a panel
  // running the same mapping would do. Whatever in the extension asks for a
  // knob value gets this: PFMap.output() reaches it, so offscreen.js and the
  // editor's Preview do.
  const drawn = M.curveValue;
  M.curveValue = function (band, u) {
    const lut = band.lut;
    if (!lut || lut.length < 2) return drawn(band, u);
    const at = M.clamp01(u) * (lut.length - 1);
    const i = Math.floor(at);
    const j = Math.min(lut.length - 1, i + 1);
    return M.clamp01(lut[i]) * (1 - (at - i)) + M.clamp01(lut[j]) * (at - i);
  };

  // Auto-range envelope, one per band: the floor and peak the band has
  // recently seen, in the same units as its level. Both edges jump to a new
  // extreme at once and drift back slowly (ENV_RELEASE per 33 ms tick is about
  // 8 s, the panel's own time constant). ENV_MIN_SPAN stops silence from
  // collapsing the window into a noise amplifier. There is no microphone gate
  // here, unlike the panel: tab audio is digital, and silent means zero.
  M.ENV_RELEASE = 0.004;
  M.ENV_MIN_SPAN = 0.06;

  M.newEnvelope = function () {
    return { lo: 1, hi: 0 };
  };

  M.trackEnvelope = function (env, level, release) {
    const v = M.clamp01(level);
    const r = release || M.ENV_RELEASE;
    if (v > env.hi) env.hi = v; else env.hi += (v - env.hi) * r;
    if (v < env.lo) env.lo = v; else env.lo += (v - env.lo) * r;
    if (env.hi < env.lo + M.ENV_MIN_SPAN) env.hi = env.lo + M.ENV_MIN_SPAN;
    return env;
  };
})(PFMap);
