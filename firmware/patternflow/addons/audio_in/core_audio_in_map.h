// ═══════════════════════════════════════════════════════════
// PatternFlow - shaping a band into a knob
//
// The FFT hands back four raw band levels. Nothing about them is ready to be
// a knob: the highs carry far less energy than the bass, so band 4 sits near
// zero while band 1 saturates, and a room's noise floor is never at zero.
//
// Four numbers per band fix that, and they are deliberately the SAME four the
// Chrome extension uses, computed the same way:
//
//   inMin   ignore below this        the room's noise floor
//   inMax   full by this             what counts as loud, for this band
//   gain    curve between them       >1 lifts a quiet band
//   outMin  where the knob rests     what the pattern does in silence
//   outMax  where the knob peaks
//
// mapBandOutput() in tools/patternflow-audio-extension/popup.js is the
// reference implementation. If one of them changes, the other has to: a
// person who has learned the response graph on one path must not find the
// same handles doing something else on the other. That is the entire reason
// this file repeats the extension's arithmetic instead of inventing its own.
//
// ── On the S3's quiet PDM input ─────────────────────────────────────────
//
// Measured on hardware with a 1 kHz tone loud enough to be uncomfortable in
// the room: rawPeak reached 0.03 of full scale, and the band it lands in went
// from ~0.015 to ~0.13. That is the documented low-amplitude PDM behaviour
// (esp-idf#8660), not a wiring fault. So the defaults here have inMax well
// below 1.0 and gain above 1.0 - a band that never exceeds 0.15 mapped
// against a 0..1 input would use a seventh of its knob and read as broken.
//
// The raw numbers are still reported unscaled at /api/audio-in. Anyone
// diagnosing a dead mic needs to see what the silicon actually returned, not
// what this file made of it.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <math.h>

namespace PFAudioInMap {

struct Band {
  // Which part of the spectrum this band listens to. Settable, because the
  // interesting range is different for every kind of music and every room:
  // a set with no bass above 200 Hz wants four bands crowded into the top,
  // and fixed edges make that impossible. The extension has had this from
  // the start; the device had four hard-coded edges in fold() until now.
  //
  // Bands are independent: they may overlap, and they may leave gaps. That
  // is deliberate and matches the extension - two bands over the same range
  // with different shaping is a real thing people do.
  float hzMin;
  float hzMax;

  float inMin;
  float inMax;
  float gain;
  float outMin;
  float outMax;
};

// Defaults sized from the measurement above, not from taste. inMax descends
// across the bands because the energy does: a hi-hat at the same loudness as
// a kick puts a fraction of the level into band 4.
inline Band bands[4] = {
    {   62.0f,  375.0f, 0.010f, 0.150f, 1.0f, 0.30f, 0.85f},
    {  375.0f, 1500.0f, 0.008f, 0.120f, 1.2f, 0.30f, 0.85f},
    { 1500.0f, 5000.0f, 0.004f, 0.050f, 1.6f, 0.30f, 0.85f},
    { 5000.0f, 8000.0f, 0.003f, 0.030f, 1.8f, 0.30f, 0.85f},
};

// The analysis is 512 points at 16 kHz, so a bin is 31.25 Hz and the last
// usable one is 8 kHz. Bin 0 is DC and never counted: a PDM mic has a
// standing offset, and letting it into band 1 would peg the bass knob at
// whatever the offset happened to be.
constexpr float BIN_HZ = 16000.0f / 512.0f;
constexpr int MAX_BIN = 512 / 2;
constexpr float MIN_HZ = BIN_HZ;          // one bin up from DC
constexpr float MAX_HZ = MAX_BIN * BIN_HZ;

inline int binOf(float hz) {
  int b = (int)(hz / BIN_HZ + 0.5f);
  if (b < 1) b = 1;
  if (b > MAX_BIN) b = MAX_BIN;
  return b;
}

// Ordered, inside the analysable range, and at least one bin wide - a band
// whose edges met would divide by zero in fold().
inline void clampRange(Band& b) {
  b.hzMin = constrain(b.hzMin, MIN_HZ, MAX_HZ);
  b.hzMax = constrain(b.hzMax, MIN_HZ, MAX_HZ);
  if (b.hzMin > b.hzMax) {
    const float t = b.hzMin;
    b.hzMin = b.hzMax;
    b.hzMax = t;
  }
  if (b.hzMax - b.hzMin < BIN_HZ) b.hzMax = min(MAX_HZ, b.hzMin + BIN_HZ);
}

// Whether the mic drives the knobs at all. Separate from whether the analysis
// runs: someone tuning the response graph wants to watch the meters move
// without the panel reacting to every word they say.
inline bool driving = true;

inline float clamp01(float v) {
  if (v < 0.0f) return 0.0f;
  if (v > 1.0f) return 1.0f;
  return v;
}

// The extension's mapBandOutput, in C++. Same clamps, same order, same edge
// cases - including inMax being forced at least 0.01 above inMin, which is
// what stops a dragged handle pair from dividing by zero.
inline float mapped(int b, float level) {
  const Band& x = bands[b];
  const float inMin = clamp01(x.inMin);
  const float inMax = max(inMin + 0.01f, clamp01(x.inMax));
  const float gain = constrain(x.gain, 0.2f, 4.0f);
  float u = clamp01((level - inMin) / (inMax - inMin));
  u = powf(u, 1.0f / gain);
  return x.outMin + u * (x.outMax - x.outMin);
}

// How much of its knob a band actually uses between silence and its own
// recent peak. The extension calls this "travel" and shows it as a bar,
// because "this band is not doing anything" is the question people actually
// have, and it is not answerable from four raw numbers.
inline float travel(int b, float peakLevel) {
  const Band& x = bands[b];
  const float span = fabsf(x.outMax - x.outMin);
  if (span < 0.001f) return 0.0f;
  return clamp01(fabsf(mapped(b, peakLevel) - mapped(b, 0.0f)) / span);
}

// ── Persistence ─────────────────────────────────────────────────────────
//
// One blob rather than 21 keys: NVS entries are the scarce thing here, and
// the whole struct is written and read together anyway. A blob whose size
// does not match the current struct is discarded rather than reinterpreted,
// so adding a field to Band cannot resurrect somebody's old settings as
// garbage - they get the defaults and retune, which is the safe direction.
constexpr const char* NVS_NS = "pf-audioin";
constexpr const char* NVS_KEY = "bands";
constexpr const char* NVS_DRIVE = "drive";

inline void save() {
  Preferences p;
  if (!p.begin(NVS_NS, false)) return;
  p.putBytes(NVS_KEY, bands, sizeof(bands));
  p.putBool(NVS_DRIVE, driving);
  p.end();
}

inline void load() {
  Preferences p;
  if (!p.begin(NVS_NS, true)) return;
  if (p.getBytesLength(NVS_KEY) == sizeof(bands)) {
    p.getBytes(NVS_KEY, bands, sizeof(bands));
    // Saved settings are trusted to be the right shape, not to be sane: a
    // blob written by a build with a different sample rate would put edges
    // past Nyquist, and fold() would read off the end of the spectrum.
    for (int i = 0; i < 4; i++) clampRange(bands[i]);
  }
  driving = p.getBool(NVS_DRIVE, true);
  p.end();
}

}  // namespace PFAudioInMap
