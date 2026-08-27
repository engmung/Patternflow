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

inline void fill(uint32_t tick) {
  const int off = (int)(tick * 37u) % (SRC - N);
  for (int i = 0; i < N; i++) { re[i] = src[off + i]; im[i] = 0.0f; }
}

// Four bands over the usable half of the spectrum. Edges are roughly
// logarithmic because hearing is: ~60-190 Hz, ~190-750, ~750-2.5k, ~2.5k-8k.
inline void fold() {
  static const int edge[5] = {2, 12, 48, 160, N / 2};
  for (int b = 0; b < 4; b++) {
    float sum = 0.0f;
    for (int k = edge[b]; k < edge[b + 1]; k++)
      sum += sqrtf(re[k] * re[k] + im[k] * im[k]);
    const float v = sum / (float)(edge[b + 1] - edge[b]);
    bands[b] = bands[b] * SMOOTH + v * (1.0f - SMOOTH);
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
