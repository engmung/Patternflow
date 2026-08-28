// ═══════════════════════════════════════════════════════════
// PatternFlow - on-board audio analysis: window -> spectrum -> four bands
//
// The survey put "sound on the board itself (mic / audio-reactive without a
// computer)" first by a wide margin — 6 of 7, more than every other option
// combined. The existing audio path needs a browser and a cable to a laptop,
// and 5 of 7 either did not know it existed or had not tried it. What people
// asked for is a different thing: the panel hearing the room on its own.
//
// This is the analysis half, and it is written to run BEFORE any microphone
// exists, because the question that decides whether the feature is possible
// is not "can we read a mic" — it is "is there CPU left". The panel spends
// ~10 ms of every 16.6 ms frame pushing pixels. If a spectrum does not fit
// in what remains, no microphone helps.
//
// So `feed()` takes samples from wherever. A PDM mic on I2S would be the
// real source (GPIO43/44 are the only free header pins on this board — see
// the note in analyze()); until one is wired, synth() stands in and the cost
// measures the same, because an FFT does not know where its input came from.
//
// Deliberately naive: a plain radix-2 complex transform with the signal in
// the real lane. A real-input FFT halves this and esp-dsp's assembly version
// halves it again, so whatever this costs is an upper bound on the honest
// number — the useful direction to be wrong in.
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
constexpr int N = 512;
constexpr int LOG2N = 9;
constexpr float SAMPLE_HZ = 16000.0f;

inline float re[N], im[N];
inline float twCos[N / 2], twSin[N / 2];
inline uint16_t brev[N];
inline bool ready = false;

// What a pattern would actually consume. Smoothed, because raw band energy
// flickers at 60 Hz and reads as noise on a panel.
inline float bands[4] = {0, 0, 0, 0};
constexpr float SMOOTH = 0.7f;

// Cost, reported through the addon's status hook. The point of the exercise.
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

inline void begin() {
  if (ready) return;
  for (int i = 0; i < N / 2; i++) {
    twCos[i] = cosf(-2.0f * (float)M_PI * i / N);
    twSin[i] = sinf(-2.0f * (float)M_PI * i / N);
  }
  for (int i = 0; i < N; i++) {
    int r = 0, x = i;
    for (int b = 0; b < LOG2N; b++) { r = (r << 1) | (x & 1); x >>= 1; }
    brev[i] = (uint16_t)r;
  }
  for (int i = 0; i < N; i++) { re[i] = 0.0f; im[i] = 0.0f; }
  buildSource();
  // After the tables: a mic that fails to start must still leave a
  // working analysis behind it, fed by synth.
  PFAudioPdm::begin();
  ready = true;
}

inline void transform() {
  for (int i = 0; i < N; i++) {
    int j = brev[i];
    if (j > i) {
      float t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (int len = 2; len <= N; len <<= 1) {
    const int half = len >> 1, step = N / len;
    for (int i = 0; i < N; i += len) {
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
//
// The imaginary lane is zeroed either way - this is a real-input signal in a
// complex transform, which is the deliberately naive arrangement the header
// explains.
inline void fill(uint32_t tick) {
  if (PFAudioPdm::readWindow(re)) {
    for (int i = 0; i < N; i++) im[i] = 0.0f;
    return;
  }
  const int off = (int)(tick * 37u) % (SRC - N);
  for (int i = 0; i < N; i++) { re[i] = src[off + i]; im[i] = 0.0f; }
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
inline void fold() {
  for (int b = 0; b < 4; b++) {
    const int lo = PFAudioInMap::binOf(PFAudioInMap::bands[b].hzMin);
    int hi = PFAudioInMap::binOf(PFAudioInMap::bands[b].hzMax);
    if (hi <= lo) hi = lo + 1;
    if (hi > N / 2) hi = N / 2;
    float sum = 0.0f;
    for (int k = lo; k < hi; k++)
      sum += sqrtf(re[k] * re[k] + im[k] * im[k]);
    const float v = sum / (float)(hi - lo);
    bands[b] = bands[b] * SMOOTH + v * (1.0f - SMOOTH);
  }
}

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
constexpr int SPEC_BUCKETS = 40;

inline void spectrum(float* out) {
  const float loHz = PFAudioInMap::MIN_HZ, hiHz = PFAudioInMap::MAX_HZ;
  const float lg0 = log10f(loHz), lg1 = log10f(hiHz);
  for (int i = 0; i < SPEC_BUCKETS; i++) {
    const float a = powf(10.0f, lg0 + (lg1 - lg0) * (float)i / SPEC_BUCKETS);
    const float b = powf(10.0f, lg0 + (lg1 - lg0) * (float)(i + 1) / SPEC_BUCKETS);
    int k0 = PFAudioInMap::binOf(a), k1 = PFAudioInMap::binOf(b);
    if (k1 <= k0) k1 = k0 + 1;      // the low buckets are narrower than a bin
    if (k1 > N / 2) k1 = N / 2;
    float sum = 0.0f;
    for (int k = k0; k < k1; k++)
      sum += sqrtf(re[k] * re[k] + im[k] * im[k]);
    out[i] = sum / (float)(k1 - k0);
  }
}

// One window, timed. Whoever calls this decides which core pays for it —
// and that turns out to be the whole design question, so the addon runs it
// both ways and the numbers say which is right.
inline void analyze(uint32_t tick) {
  if (!ready) return;

  const uint32_t t0 = micros();
  fill(tick);
  float pk = 0.0f, sum = 0.0f;
  for (int i = 0; i < N; i++) {
    const float a = fabsf(re[i]);
    if (a > pk) pk = a;
    sum += re[i];
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
  return sizeof(re) + sizeof(im) + sizeof(twCos) + sizeof(twSin) +
         sizeof(brev) + sizeof(src);
}

}  // namespace PFAudioFFT
