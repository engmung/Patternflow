// ═══════════════════════════════════════════════════════════
// PatternFlow - on-board audio analysis: window -> spectrum -> four bands
//
// The survey put "sound on the board itself (mic / audio-reactive without a
// computer)" first by a wide margin — 6 of 7, more than every other option
// combined. The existing audio path needs a browser and a cable to a laptop,
// and 5 of 7 either did not know it existed or had not tried it. What people
// asked for is a different thing: the panel hearing the room on its own.
//
// Owns: the transform and its buffers, the four raw band levels, the
// spectrum the page draws, and the verdict on what the input is (sourceLabel).
// Where the bands' edges are, and what a level becomes, is core_audio_in_map.h.
//
// This is the analysis half, and it was written BEFORE any microphone
// existed, because the question that decided whether the feature was possible
// was not "can we read a mic" — it was "is there CPU left". The panel spends
// ~10 ms of every 16.6 ms frame pushing pixels. If a spectrum had not fitted
// in what remains, no microphone would have helped.
//
// So fill() takes a window from wherever. The real source is the PDM mic in
// core_audio_pdm.h; when that has nothing to give - the driver did not
// install, or the mic stopped answering - a synthetic three-tone source
// stands in, and the cost measures the same, because an FFT does not know
// where its input came from. What the synthetic source must not do is move a
// panel's knobs; the feature's fillInput sees to that.
//
// It began deliberately naive: a plain radix-2 complex transform, 512 points,
// with the signal in the real lane, so that whatever it cost was an upper
// bound on the honest number. Since 2026-11 it is the real-input form. The
// even samples go in the real lane and the odd ones in the imaginary lane of
// one 256-point transform, and a pass afterwards takes the two apart. The
// time was never the problem: a window's transform and fold went from 500 to
// 388 us on a board. The memory was. Half the imaginary lane, half the
// bit-reversal table and the whole window table are gone, 2.3 KB of internal
// RAM net of the magnitudes it now keeps, and an Audio build has about 38 KB
// of that free. esp-dsp's assembly version would halve the time again and is
// still not needed.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <math.h>

#include "core_audio_in_map.h"
#include "core_audio_pdm.h"

namespace PFAudioFFT {

// 512 points at 16 kHz is 32 ms of audio — long enough to resolve a bass
// note, short enough that a hi-hat still lands in the frame it happened in.
// M is the transform that actually runs, half of it.
constexpr int N = 512;
constexpr int M = N / 2;
constexpr int LOG2M = 8;
constexpr float SAMPLE_HZ = 16000.0f;

// re[] takes the window as it is read, all N samples, and is then packed in
// place: the even samples stay in re[0..M-1] and the odd ones move to im[].
// mag[k] is |X[k]| of the window last analysed. fold() and spectrum() both
// read it, where each used to take its own square roots, and spectrum() reads
// it from the HTTP task while the next window is being written. The worst
// that does is a picture with some bins one window newer than the rest.
inline float re[N];
inline float im[M];
inline float mag[M];
inline float twCos[M], twSin[M];
inline uint16_t brev[M];
inline bool ready = false;

// A coarse, log-spaced view of the spectrum for /audio-in to draw. Log
// because that is how the frequencies people care about are spaced: a linear
// picture spends three quarters of its width above 2 kHz, where almost
// nothing in music lives, and squeezes every bass decision into the left
// centimetre. The extension's spectrum is log for the same reason.
//
// Buckets, not bins: 256 numbers ten times a second on a single-connection
// web server is not worth it, and nobody is reading a 31 Hz bin off a
// 600 px canvas. This is a picture to aim at, and the band edges it is used
// to set are exact regardless.
// 64, the editor's contract (one bucket count on every path - the extension
// computes the same 64 from tab audio). Was 40 when the old strip page drew
// it into a 600 px canvas.
//
// A bucket's edges never move, so begin() works them out once: specK0 is its
// first bin and specK1 the one past its last. spectrum() used to call powf
// 128 times a poll to find them again.
constexpr int SPEC_BUCKETS = 64;
inline uint16_t specK0[SPEC_BUCKETS];
inline uint16_t specK1[SPEC_BUCKETS];

// What a pattern would actually consume. Smoothed, because raw band energy
// flickers at 60 Hz and reads as noise on a panel.
inline float bands[4] = {0, 0, 0, 0};
constexpr float SMOOTH = 0.7f;

// Cost, reported through the feature's status hook. The point of the exercise.
// Raw signal, before any transform touches it. This is the first thing to
// look at with a real microphone: the S3's PDM input has a documented
// low-amplitude problem (esp-idf#8660), and a spectrum computed from
// nothing still produces four plausible-looking band numbers. peak says
// whether there is a signal at all; dc says whether it is centred.
inline float rawPeak = 0.0f, rawDc = 0.0f;

inline uint32_t lastUs = 0, maxUs = 0;
inline uint32_t runs = 0;
inline uint64_t totalUs = 0;
// Split, because "can this device do audio" and "can this device do an
// FFT" are different questions and the first attempt conflated them.
inline uint64_t fillTotal = 0, fftTotal = 0, foldTotal = 0;
// The first windows land while the OTA reboot is still settling and Wi-Fi
// is reconnecting; they are preemption, not cost. Discard them.
constexpr uint32_t WARMUP = 60;
inline uint32_t seen = 0;

// Defined below, next to the fill it feeds.
inline void buildSource();

// Hann, times 2: the window kills the rectangular-window leakage that was
// smearing strong bass into the high bands (there was no window at all
// before), and the factor 2 undoes its coherent gain of 0.5 so band
// levels keep the scale everything downstream was tuned against.
//
// The denominator is N, not N - 1. That is the PERIODIC Hann, and for a
// stream analysed one hop after another it is the correct one: its DFT is
// exactly three non-zero bins, so a constant input lands entirely in bin 0
// and its neighbours and leaks nowhere else. The symmetric window (N - 1)
// that was here does leak, and it broke inputIsDeadRail() below - see the
// measurement in that comment. Computed over the shipped band edges with a
// constant rail: symmetric gives bands 0.0666 / 1.8e-3 / 1.3e-4 / 1.3e-5,
// three of the four above the 1e-4 threshold; periodic gives ~1e-13 in all
// four. Mean window gain goes 0.998047 -> 1.000000, so band levels move by
// 0.2% and the tuning downstream does not notice.
//
// It has no table of its own. 1 - cos(2*pi*i/N) is 1 - twCos[i] over the
// first half and the same values mirrored over the second, and the table
// that held it was 2 KB.
inline float hannAt(int i) {
  if (i < M) return 1.0f - twCos[i];
  if (i == M) return 2.0f;
  return 1.0f - twCos[N - i];
}

inline void begin() {
  if (ready) return;
  for (int i = 0; i < M; i++) {
    twCos[i] = cosf(-2.0f * (float)M_PI * i / N);
    twSin[i] = sinf(-2.0f * (float)M_PI * i / N);
  }
  for (int i = 0; i < M; i++) {
    int r = 0, x = i;
    for (int b = 0; b < LOG2M; b++) { r = (r << 1) | (x & 1); x >>= 1; }
    brev[i] = (uint16_t)r;
  }
  for (int i = 0; i < N; i++) re[i] = 0.0f;
  for (int i = 0; i < M; i++) { im[i] = 0.0f; mag[i] = 0.0f; }

  const float loHz = PFAudioInMap::MIN_HZ, hiHz = PFAudioInMap::MAX_HZ;
  const float lg0 = log10f(loHz), lg1 = log10f(hiHz);
  for (int i = 0; i < SPEC_BUCKETS; i++) {
    const float a = powf(10.0f, lg0 + (lg1 - lg0) * (float)i / SPEC_BUCKETS);
    const float b = powf(10.0f, lg0 + (lg1 - lg0) * (float)(i + 1) / SPEC_BUCKETS);
    int k0 = PFAudioInMap::binOf(a), k1 = PFAudioInMap::binOf(b);
    if (k1 <= k0) k1 = k0 + 1;      // the low buckets are narrower than a bin
    if (k1 > M) k1 = M;
    specK0[i] = (uint16_t)k0;
    specK1[i] = (uint16_t)k1;
  }

  buildSource();
  // The microphone is NOT started here. It is installed and released by the
  // analysis task as the switch on /audio-in moves, so that a panel with the
  // mic off never allocates the driver.
  ready = true;
}

inline void transform() {
  // z[k] = x[2k] + i x[2k+1], M points, radix 2.
  for (int i = 0; i < M; i++) {
    int j = brev[i];
    if (j > i) {
      float t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (int len = 2; len <= M; len <<= 1) {
    const int half = len >> 1;
    // The twiddles are the N-point ones, and an M-point transform wants every
    // second: N / len is that stride.
    const int step = N / len;
    for (int i = 0; i < M; i += len) {
      int k = 0;
      for (int j = 0; j < half; j++, k += step) {
        const float c = twCos[k], s = twSin[k];
        const float ur = re[i + j], ui = im[i + j];
        const float ar = re[i + j + half], ai = im[i + j + half];
        const float vr = ar * c - ai * s;
        const float vi = ar * s + ai * c;
        re[i + j] = ur + vr;  im[i + j] = ui + vi;
        re[i + j + half] = ur - vr;  im[i + j + half] = ui - vi;
      }
    }
  }

  // Take the two halves apart. With E and O the transforms of the even and
  // the odd samples, Z[k] = E[k] + i O[k], and both are those of real input,
  // so E[k] = (Z[k] + conj Z[M-k]) / 2 and O[k] = (Z[k] - conj Z[M-k]) / 2i.
  // The N-point bin is X[k] = E[k] + W^k O[k], and bin M - k comes out of the
  // same pair with the sign turned, so each pass through the loop gives two.
  // Bins 0 and M/2 pair with themselves. Only the magnitudes are kept.
  mag[0] = fabsf(re[0] + im[0]);
  for (int k = 1; k < M / 2; k++) {
    const int mk = M - k;
    const float ar = re[k],  ai = im[k];
    const float br = re[mk], bi = im[mk];
    const float er = 0.5f * (ar + br);
    const float ei = 0.5f * (ai - bi);
    const float or_ = 0.5f * (ai + bi);
    const float oi  = 0.5f * (br - ar);
    const float c = twCos[k], s = twSin[k];
    const float wr = or_ * c - oi * s;
    const float wi = or_ * s + oi * c;
    const float xkr = er + wr, xki = ei + wi;
    const float xmr = er - wr, xmi = ei - wi;
    mag[k]  = sqrtf(xkr * xkr + xki * xki);
    mag[mk] = sqrtf(xmr * xmr + xmi * xmi);
  }
  const float hr = re[M / 2], hi = im[M / 2];
  mag[M / 2] = sqrtf(hr * hr + hi * hi);
}

// Stand-in for a microphone. Built once; each window copies a rotating
// slice, which is what reading a PDM DMA buffer costs — a memcpy, not a
// trigonometry lesson. The first version of this called sinf() 1536 times
// per window and cost more than the transform it was feeding, which made
// the whole measurement a lie. Worth remembering: a synthetic input has to
// be as cheap as the real one or it is not standing in for anything.
constexpr int SRC = N + 64;   // was N*4 — the fake mic was 8 KB of the footprint
inline float src[SRC];

inline void buildSource() {
  for (int i = 0; i < SRC; i++) {
    const float t = (float)i / SAMPLE_HZ;
    src[i] = 0.5f * sinf(2.0f * (float)M_PI * 120.0f * t)
           + 0.3f * sinf(2.0f * (float)M_PI * 900.0f * t)
           + 0.2f * sinf(2.0f * (float)M_PI * 4200.0f * t);
  }
}

// The window comes from the microphone when there is one, and from the
// synthetic source when there is not. The fallback is not politeness: this
// module's whole reason for existing was to measure the cost of the analysis
// on a board with no mic attached, and that has to keep working.
inline void fill(uint32_t tick) {
  if (PFAudioPdm::readWindow(re)) return;
  const int off = (int)(tick * 37u) % (SRC - N);
  memcpy(re, src + off, (size_t)N * sizeof(float));
}

// Four bands, each over whatever slice of the spectrum it has been given.
// The edges used to be four constants here, roughly logarithmic because
// hearing is; they are settings now, on /audio-in, because the useful split
// depends entirely on what is playing.
//
// The ranges are read without a lock. They are written from the HTTP task on
// the other core, and the worst a torn read can do is fold one frame over an
// edge that is halfway between the old value and the new one - 16 ms of a
// slightly wrong band while somebody drags a handle. A mutex on the audio
// path to avoid that would cost more than it saves.
//
// What an edge read here must never do is leave a band with no bins. A low
// edge in the last bin does (hzMin 7990: lo is N/2, and hi cannot pass it),
// whether it is stored that way or caught raw in the instant before the
// handler clamps it. The mean was then 0/0, and because each level is
// smoothed from the one before, that single NaN never left: `nan` in every
// poll and in /api/status until a reboot, and on the knob the band drives.
// A band over nothing hears nothing.
inline void fold() {
  for (int b = 0; b < 4; b++) {
    const int lo = PFAudioInMap::binOf(PFAudioInMap::bands[b].hzMin);
    int hi = PFAudioInMap::binOf(PFAudioInMap::bands[b].hzMax);
    if (hi <= lo) hi = lo + 1;
    if (hi > M) hi = M;
    if (hi <= lo) { bands[b] = 0.0f; continue; }
    float sum = 0.0f;
    for (int k = lo; k < hi; k++)
      sum += mag[k];
    const float v = sum / (float)(hi - lo);
    bands[b] = bands[b] * SMOOTH + v * (1.0f - SMOOTH);
  }
}

// Is there actually a microphone on the other end of those two pins?
//
// Measured on a board with nothing wired to GPIO44: rawPeak 0.94406 and
// rawDc -0.94406, exactly, forever, with all four bands at 0.0000. The pad
// floats to a rail, every sample comes back identical, and a constant signal
// puts all of its energy in bin 0 - which fold() skips, so the bands are
// genuinely zero rather than noisy.
//
// That measurement was taken before there was a window, and adding one broke
// this check without touching it. A symmetric Hann is not periodic, so a
// constant no longer stayed in bin 0: it leaked 0.0666 into band 0 and this
// function returned false for every dead rail there has ever been. The window
// is periodic now and the bands are back to ~1e-13. If either is changed
// again, check this function still fires - nothing else does.
//
// I2S reports none of this as an error. The driver starts, the reads succeed
// and return a full hop, and sourceName() says "pdm" because by every test
// it has, it is. Without this check a panel with no mic looks healthy and
// pins all four knobs at their resting position, which reads as knobs that
// will not hold a setting.
//
// A real microphone measured 0.004 on the same field, so 0.5 is not a close
// call. Both halves are required: a genuinely silent room also has near-zero
// bands, and it should not be reported as a wiring fault.
inline bool inputIsDeadRail() {
  if (fabsf(rawDc) < 0.5f) return false;
  for (int b = 0; b < 4; b++)
    if (bands[b] > 1e-4f) return false;
  return true;
}

// What the input actually is, for /api/status and the console page. Lives
// here rather than beside the driver because the driver cannot see the
// spectrum, and the spectrum is the only thing that tells these apart.
//
// The five strings this can return ("off", "pdm", the dead-rail one below,
// and PFAudioPdm::sourceName()'s "synth" and "synth (mic stalled)") are
// matched exactly by the page and listed in docs/rest-api.md. Add a sixth
// rather than rewording one.
inline const char* sourceLabel() {
  if (!PFAudioInMap::micOn) return "off";
  if (!PFAudioPdm::available()) return PFAudioPdm::sourceName();
  return inputIsDeadRail() ? "pdm (no mic - data pin idle)" : "pdm";
}

// The 64 buckets for /audio-in, from the edges begin() worked out and the
// magnitudes transform() left. See SPEC_BUCKETS, above.
inline void spectrum(float* out) {
  for (int i = 0; i < SPEC_BUCKETS; i++) {
    const int k0 = specK0[i], k1 = specK1[i];
    float sum = 0.0f;
    for (int k = k0; k < k1; k++)
      sum += mag[k];
    out[i] = sum / (float)(k1 - k0);
  }
}

// One window, timed. Whoever calls this decides which core pays for it —
// and that turns out to be the whole design question, so the feature runs it
// both ways and the numbers say which is right.
inline void analyze(uint32_t tick) {
  if (!ready) return;

  const uint32_t t0 = micros();
  fill(tick);
  // Peak and DC are measured BEFORE the gain, then the gain is applied in
  // the same pass. Order matters twice over: rawPeak/rawDc stay what the
  // silicon returned (the diagnostic /api/status documents them as), and the
  // dead-rail detector keeps its physical threshold - a floating pin reads
  // |dc| ~0.94 and a real mic ~0.005, and gaining both before the comparison
  // would push a healthy mic toward the trip point instead of away from it.
  // Gain is microphone-only: the synthetic source is already full-scale.
  //
  // The same pass packs the window for the transform, two samples at a time:
  // 2k stays in re[k] and 2k+1 goes to im[k]. It can be done in place because
  // re[k] is written only after re[2k] and re[2k+1] have been read.
  const float g = PFAudioPdm::available() ? PFAudioInMap::micGain : 1.0f;
  float pk = 0.0f, sum = 0.0f;
  for (int k = 0; k < M; k++) {
    const int i0 = k << 1;
    const int i1 = i0 + 1;
    const float s0 = re[i0];
    const float s1 = re[i1];
    const float a0 = fabsf(s0), a1 = fabsf(s1);
    if (a0 > pk) pk = a0;
    if (a1 > pk) pk = a1;
    sum += s0 + s1;

    float v0 = s0 * g;
    if (v0 > 1.0f) v0 = 1.0f;
    else if (v0 < -1.0f) v0 = -1.0f;
    float v1 = s1 * g;
    if (v1 > 1.0f) v1 = 1.0f;
    else if (v1 < -1.0f) v1 = -1.0f;

    // Gain saturates BEFORE the window shapes the frame - a clipped loud
    // sample still tapers at the edges, which is the point of the window.
    re[k] = v0 * hannAt(i0);
    im[k] = v1 * hannAt(i1);
  }
  rawPeak = pk;
  rawDc = sum / (float)N;
  const uint32_t t1 = micros();
  transform();
  const uint32_t t2 = micros();
  fold();
  const uint32_t t3 = micros();

  if (++seen <= WARMUP) return;

  const uint32_t dt = t3 - t0;
  lastUs = dt;
  if (dt > maxUs) maxUs = dt;
  totalUs += dt;
  fillTotal += (t1 - t0);
  fftTotal += (t2 - t1);
  foldTotal += (t3 - t2);
  runs++;
}

inline uint32_t avgFillUs() { return runs ? (uint32_t)(fillTotal / runs) : 0; }
inline uint32_t avgFftUs()  { return runs ? (uint32_t)(fftTotal / runs) : 0; }
inline uint32_t avgFoldUs() { return runs ? (uint32_t)(foldTotal / runs) : 0; }

inline uint32_t avgUs() { return runs ? (uint32_t)(totalUs / runs) : 0; }

// Bytes this holds, so the status line can say what it costs in the one
// place that is actually scarce. Internal DRAM: the HUB75 DMA buffers take
// most of it and the console starts failing below ~10 KB free.
inline constexpr uint32_t staticBytes() {
  return sizeof(re) + sizeof(im) + sizeof(mag) + sizeof(twCos) + sizeof(twSin) +
         sizeof(brev) + sizeof(src) + sizeof(specK0) + sizeof(specK1);
}

}  // namespace PFAudioFFT
