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

  // Which knob this band drives, 0-3. Not the band's own index: a set whose
  // interest is all in the low end wants three bands across the bass and one
  // knob left for something else, and that needs the assignment to be free.
  // Two bands may name the same knob; see fillInput for who wins.
  int knob;

  // A band that is measured but does not drive anything. Muting rather than
  // deleting is the extension's choice and it is the right one: the settings
  // you spent time on are still there when you want the band back, and the
  // meter keeps moving so you can see what you turned off.
  bool muted;
};

// Input gain, applied to microphone samples before the FFT. The S3's PDM
// path is documented-quiet (esp-idf#8660: a tone that is uncomfortable in
// the room peaks at 0.03 of full scale) and Espressif's own answer in that
// thread is "apply the gain to the data that I2S read" - the IDF 5 driver
// later grew a hardware amplify_num (1..15) that its header admits is the
// same digital multiply. So: a runtime gain, WLED-style, user-tunable on
// /audio-in. Applied only to the microphone - the synthetic source is
// already full-scale and would clip.
inline float micGain = 8.0f;
constexpr float MIC_GAIN_MIN = 1.0f;
constexpr float MIC_GAIN_MAX = 16.0f;

inline Band bands[4];  // filled by resetBands() or load(); see below

// Defaults sized from MUSIC, measured 2026-08-30: thirty seconds of a real
// track at listening volume, per-band p10/p90 quantiles, at micGain 8.
//
//     band      p10..p90 measured     defaults below
//     62-375    0.24 .. 0.66          0.20 .. 0.90
//     375-1.5k  0.16 .. 0.49          0.12 .. 0.65
//     1.5k-5k   0.05 .. 0.12          0.045 .. 0.16
//     5k-8k     0.011 .. 0.019        0.012 .. 0.030
//
// The top band's numbers are microscopic and that is CONTENT, not silicon:
// a white-noise sweep the same day measured the mic + PDM decimator flat to
// within about 6 dB up to 7.5 kHz, so there is no hardware roll-off to
// boost away. Music itself carries a fraction of its energy above 5 kHz
// (the 1/f tilt), and the previous defaults - sized from a synthetic tone -
// left inMax 8..10x above where music actually reaches, which read as "the
// top band does not respond". Ranges sized to the content are the fix; a
// hardware-response EQ would have been correcting a curve that is not there.
//
// inMin also clears the measured quiet-room floor per band (0.135/0.088/
// 0.024/0.010) so silence does not wobble the knobs.
//
// One function rather than two literal tables: the HTTP reset handler and
// the fresh-boot path both call this, and the two copies they used to keep
// in sync are exactly the kind of pair that drifts.
inline void resetBands() {
  const Band d[4] = {
      {   62.0f,  375.0f, 0.200f, 0.900f, 1.0f, 0.30f, 0.85f, 0, false},
      {  375.0f, 1500.0f, 0.120f, 0.650f, 1.2f, 0.30f, 0.85f, 1, false},
      { 1500.0f, 5000.0f, 0.045f, 0.160f, 1.6f, 0.30f, 0.85f, 2, false},
      { 5000.0f, 8000.0f, 0.012f, 0.030f, 1.8f, 0.30f, 0.85f, 3, false},
  };
  for (int i = 0; i < 4; i++) bands[i] = d[i];
}

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

// Whether the microphone runs at all: the I2S driver, the DMA buffers and the
// analysis. Off means the feature costs a panel nothing but the code size.
//
// Default off, and this is the switch people will actually use. The mic is
// four wires to a breakout rather than a part on the board, so a panel that
// installs the Audio edition for OSC and the Chrome extension should not be
// running an analysis over a floating pin. Turning it on is one tick on
// /audio-in and it persists.
inline bool micOn = false;

// There was a second flag here, `driving`, for whether the bands moved the
// knobs — separate from whether the analysis ran, so that somebody shaping the
// response could watch the meters without the panel jumping at every word.
//
// It came first and micOn was added on top of it, which left two switches for
// one question and a page nobody could read. The tuning case it existed for is
// not worth a second control: micOn is the switch, and it means the panel
// listens and reacts.

inline float clamp01(float v) {
  if (v < 0.0f) return 0.0f;
  if (v > 1.0f) return 1.0f;
  return v;
}

// ── Auto range ──────────────────────────────────────────────────────────
//
// Static in-ranges cannot fit music. Two 30-second windows of the same
// listening session, half an hour apart, measured band 2's level 4x apart -
// verse against chorus, one track against the next - so ranges sized to any
// one window leave bands dead in the next. This is the problem WLED's AGC
// exists for, and this is the same idea per band: track a slow envelope of
// each band's own floor and peak, normalize the level inside it, and let
// the passage define the range instead of a constant.
//
// Attack is instant on both edges (a peak claims the top immediately, a
// dropout claims the floor); release is a slow exponential, about eight
// seconds to cross most of a gap at 60 analyses/second, so the range
// breathes with the song without pumping on every bar. The span never
// shrinks below MIN_SPAN: in silence both envelopes converge and the
// division would otherwise amplify noise into a full-scale flutter.
//
// In auto mode the band's own inMin/inMax are NOT used - the normalized
// level runs through a fixed relative window (squelch AUTO_LO, full at
// AUTO_HI) and then the band's boost curve and knob range as always. Manual
// mode is untouched and remains the extension-style absolute shaping.
inline bool autoRange = true;

// ── How the gate learned what it knows ──────────────────────────────────
//
// Three designs died on this hardware before this one, all measured:
//
//   v1  normalized against min/max envelopes. In silence the envelopes hug
//       the noise floor and division turns its flutter into full-scale knob
//       motion - all four knobs swinging 0.30..0.85 in a room with the
//       keyboard untouched.
//   v2  gated on envelope span. Better, but the span statistic is recent
//       max minus recent min, and this board supplies spikes on schedule:
//       every HTTP poll is a Wi-Fi burst, every burst makes the regulator
//       whine audibly, and the mic hears it. One-frame spikes latched the
//       instant-attack envelope for the whole release.
//   v3  per-band span thresholds. Uncomparable 20-second runs - the noise
//       is non-stationary, so constants tuned against one snapshot lost to
//       the next.
//
// So the noise itself was finally measured (100 samples, silent room, the
// worst case of a page polling at 10 Hz):
//
//   band    median   p95      max     music median (listening volume)
//   62-375   0.146   0.204    0.271   0.37
//   375-1.5k 0.040   0.085    0.228   0.30
//   1.5k-5k  0.020   0.048    0.082   0.074
//   5k-8k    0.017   0.021    0.042   0.015  <- at or below its own noise
//
// Which says: the spikes are rare and one sample long (p95 to max is a
// cliff), music stands 2..7x above the noise MEDIAN in the three lower
// bands, and band 4 at listening volume has no level story at all - it
// only rises above its floor on genuinely strong treble, and pretending
// otherwise is how v1 danced to hiss. Hence:
//
//   - a slow noise reference that learns only from quiet-zone samples,
//   - a gate on sustained exceedance of that reference (three consecutive
//     frames to open - a one-frame RF spike cannot vote three times),
//   - a slow close (25 quiet frames) so musical gaps do not chatter it,
//   - normalization from the reference to a peak envelope, never from a
//     tracked minimum.
inline float noiseRef[4] = {-1.0f, -1.0f, -1.0f, -1.0f};  // <0 = unlearned
inline float envHi[4] = {0.0f, 0.0f, 0.0f, 0.0f};
inline bool gateOpen[4] = {false, false, false, false};
inline int gateVotes[4] = {0, 0, 0, 0};

constexpr float NOISE_LEARN = 0.005f;  // reference EMA, ~3 s to settle
// 1.5, not wider: the bass band's music floor sits only ~1.6x above its
// noise reference, so a wider zone let quiet musical frames TEACH the
// reference, which climbed toward the music and dragged the open threshold
// with it - measured as the bass gate never opening while mids danced.
constexpr float LEARN_ZONE = 1.5f;     // learn only when level < ref * this
constexpr int WARMUP_FRAMES = 120;     // ~2 s of min-tracking at boot
constexpr float OPEN_K = 1.8f;         // active when level > ref*K + ABS
// Per band, one number, for one reason: the board's own Wi-Fi whine lives
// in 375-1500 Hz, and its bursts turned out to be an HTTP transaction long
// - several analysis frames, not one - so the mid band alone gets an
// absolute floor its spikes cannot reach (they top out ~0.23; music sits
// at 0.30+ there). Measured, like every other constant in this block.
constexpr float OPEN_ABS[4] = {0.012f, 0.050f, 0.015f, 0.012f};
constexpr int OPEN_VOTES = 8;          // ~130 ms sustained - outlasts a burst
constexpr float CLOSE_K = 1.4f;        // below this counts as quiet
constexpr int CLOSE_VOTES = 25;        // ~0.4 s of quiet to close
constexpr float NORM_LO_K = 1.5f;      // normalization floor = ref * this
constexpr float NORM_MIN_SPAN = 0.02f;
constexpr float ENV_ATTACK = 0.3f;
constexpr float ENV_RELEASE = 0.002f;
// The relative response window the normalized level runs through (the
// page shows the same 0.10..0.95 as the fixed in-handles in auto mode).
constexpr float AUTO_LO = 0.10f;
constexpr float AUTO_HI = 0.95f;

inline int warmup = WARMUP_FRAMES;

inline void trackEnvelopes(const float* level) {
  const bool warming = warmup > 0;
  if (warming) warmup--;
  for (int i = 0; i < 4; i++) {
    const float v = clamp01(level[i]);

    // The reference learns the FLOOR, three rules deep: during warmup it
    // takes the running minimum (so booting mid-song does not seed it with
    // a bass hit); after that it moves only while the gate is CLOSED (an
    // open gate means signal, and signal never teaches the floor); and only
    // from samples inside the learn zone (a spike during silence is not the
    // floor either).
    if (noiseRef[i] < 0.0f) noiseRef[i] = v;
    else if (warming) noiseRef[i] = min(noiseRef[i], v);
    else if (!gateOpen[i] && v < noiseRef[i] * LEARN_ZONE + 0.005f)
      noiseRef[i] += (v - noiseRef[i]) * NOISE_LEARN;

    if (v > envHi[i]) envHi[i] += (v - envHi[i]) * ENV_ATTACK;
    else envHi[i] += (v - envHi[i]) * ENV_RELEASE;
    const float lo = noiseRef[i] * NORM_LO_K;
    if (envHi[i] < lo + NORM_MIN_SPAN) envHi[i] = lo + NORM_MIN_SPAN;

    const bool loud = v > noiseRef[i] * OPEN_K + OPEN_ABS[i];
    const bool quiet = v < noiseRef[i] * CLOSE_K + OPEN_ABS[i];
    if (!gateOpen[i]) {
      // Opening stays strict-consecutive: an RF spike is one frame long and
      // cannot vote three times in a row.
      gateVotes[i] = loud ? gateVotes[i] + 1 : 0;
      if (gateVotes[i] >= OPEN_VOTES) { gateOpen[i] = true; gateVotes[i] = 0; }
    } else {
      // Closing counts down by MAJORITY, not by consecutive quiet. The whine
      // band's bursts kept resetting a consecutive counter in the tail right
      // after music stopped, holding the gate open for noise to ride through
      // (measured: one 0.85 knob jump in that window). A burst now costs
      // three votes instead of all of them, so ~10% burst duty still closes
      // the gate in about a second, while real music - mostly loud frames -
      // drives the count straight back to zero.
      if (quiet) gateVotes[i]++;
      else gateVotes[i] = max(0, gateVotes[i] - 3);
      if (gateVotes[i] >= CLOSE_VOTES) { gateOpen[i] = false; gateVotes[i] = 0; }
    }
  }
}

// The band's level as a position between its noise reference and its peak
// envelope, 0..1. Zero while the gate is closed: the page paints its dot
// from this, and a dot dancing to amplified hiss while the knob rests would
// read as a bug in whichever half you looked at second.
inline float normalized(int b, float level) {
  if (!gateOpen[b]) return 0.0f;
  const float lo = noiseRef[b] * NORM_LO_K;
  return clamp01((level - lo) / max(envHi[b] - lo, NORM_MIN_SPAN));
}

// The extension's mapBandOutput, in C++. Same clamps, same order, same edge
// cases - including inMax being forced at least 0.01 above inMin, which is
// what stops a dragged handle pair from dividing by zero.
inline float mappedWindow(int b, float level, float inMinRaw, float inMaxRaw) {
  const Band& x = bands[b];
  const float inMin = clamp01(inMinRaw);
  const float inMax = max(inMin + 0.01f, clamp01(inMaxRaw));
  const float gain = constrain(x.gain, 0.2f, 4.0f);
  float u = clamp01((level - inMin) / (inMax - inMin));
  u = powf(u, 1.0f / gain);
  return x.outMin + u * (x.outMax - x.outMin);
}

inline float mapped(int b, float level) {
  if (autoRange)
    return mappedWindow(b, normalized(b, level), AUTO_LO, AUTO_HI);
  const Band& x = bands[b];
  return mappedWindow(b, level, x.inMin, x.inMax);
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
// (mapped() already routes through the auto window when autoRange is on, so
// travel and the page's readouts follow whichever mode is live.)

// ── Persistence ─────────────────────────────────────────────────────────
//
// One blob rather than 21 keys: NVS entries are the scarce thing here, and
// the whole struct is written and read together anyway. A blob whose size
// does not match the current struct is discarded rather than reinterpreted,
// so adding a field to Band cannot resurrect somebody's old settings as
// garbage - they get the defaults and retune, which is the safe direction.
constexpr const char* NVS_NS = "pf-audioin";
// "bands8", not "bands": the shaping numbers only mean anything at a given
// input gain, and gain landed after people had already tuned against the
// ungained scale. Reading those old values under 8x gain would saturate
// every band, so the key changed and the old blob is simply orphaned -
// defaults and a retune, the same safe direction as a size mismatch.
// bands9: the defaults' meaning changed again (music-sized ranges), and a
// saved set tuned against the tone-sized scale would leave the top bands
// dead in exactly the way this change fixes.
constexpr const char* NVS_KEY = "bands9";
constexpr const char* NVS_MIC = "mic";
constexpr const char* NVS_GAIN = "igain";
constexpr const char* NVS_AUTO = "auto";

inline void save() {
  Preferences p;
  if (!p.begin(NVS_NS, false)) return;
  p.putBytes(NVS_KEY, bands, sizeof(bands));
  p.putBool(NVS_MIC, micOn);
  p.putFloat(NVS_GAIN, micGain);
  p.putBool(NVS_AUTO, autoRange);
  p.end();
}

inline void load() {
  resetBands();  // the baseline; NVS overwrites it when a saved set exists
  Preferences p;
  if (!p.begin(NVS_NS, true)) return;
  if (p.getBytesLength(NVS_KEY) == sizeof(bands)) {
    p.getBytes(NVS_KEY, bands, sizeof(bands));
    // Saved settings are trusted to be the right shape, not to be sane: a
    // blob written by a build with a different sample rate would put edges
    // past Nyquist, and fold() would read off the end of the spectrum.
    for (int i = 0; i < 4; i++) {
      clampRange(bands[i]);
      bands[i].knob = constrain(bands[i].knob, 0, 3);
    }
  }
  micOn = p.getBool(NVS_MIC, false);
  micGain = constrain(p.getFloat(NVS_GAIN, micGain), MIC_GAIN_MIN, MIC_GAIN_MAX);
  autoRange = p.getBool(NVS_AUTO, autoRange);
  p.end();
}

}  // namespace PFAudioInMap
