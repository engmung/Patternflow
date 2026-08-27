// ═══════════════════════════════════════════════════════════
// PatternFlow - on-board audio input, as an addon
//
// The fifth port onto the addon seam, and the first one that was not already
// living in the core — which makes it the more interesting test. The other
// four proved the hooks could carry features that already existed. This one
// asks whether they can carry a feature nobody has written yet.
//
// Answer so far: four hooks, no core edits, no sketch edits.
//
//   setup        - build the twiddle tables, and start the analysis task
//   loop         - run a window inline, when measuring the inline cost
//   fillInput    - four bands drive the four knob lanes, exactly the way
//                  the weather addon drives them from a temperature. A
//                  pattern animates from sound without knowing what sound is.
//   appendStatus - report what it costs, because that is the open question
//
// PF_AUDIO_IN_CORE picks who pays:
//   1  the render loop (Core 1), inline. The naive placement.
//   0  a task pinned to Core 0, where Wi-Fi lives and the panel does not.
//      This is the arrangement that would ship, if it ships.
//
// There is no microphone yet, and that is deliberate. The panel spends
// ~10 ms of every 16.6 ms frame pushing pixels; if a spectrum does not fit
// in what is left, no microphone helps. So the cost gets measured first and
// the hardware question — a PDM mic on GPIO43/44, the only free header pins
// on this board, since N16R8's octal PSRAM claims 35-37 and everything else
// is HUB75 or an encoder — gets decided after, with a number in hand.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_addon.h"
#include "core_audio_fft.h"

#ifndef PF_AUDIO_IN_CORE
#define PF_AUDIO_IN_CORE 0
#endif

// Off by default: while this is a measurement rather than a feature, it
// should cost a normal build exactly nothing.
#ifndef PF_AUDIO_IN_DRIVES_KNOBS
#define PF_AUDIO_IN_DRIVES_KNOBS 0
#endif

namespace PFAddonAudioIn {

inline uint32_t tick = 0;
inline uint32_t heapCost = 0;

#if PF_AUDIO_IN_CORE == 0
inline void analysisTask(void*) {
  for (;;) {
    PFAudioFFT::analyze(tick++);
    // 60 Hz, the panel's own cadence. A window is 32 ms of audio and these
    // overlap, which is what you want: a transient lands in the frame it
    // happened in rather than up to a window late.
    vTaskDelay(pdMS_TO_TICKS(16));
  }
}
#endif

inline void setup() {
  const uint32_t before = ESP.getFreeHeap();
  PFAudioFFT::begin();
  heapCost = before - ESP.getFreeHeap();
#if PF_AUDIO_IN_CORE == 0
  // 4 KB stack: the transform works in static buffers, so the task itself
  // needs almost nothing. Priority 1 — below Wi-Fi, above idle.
  xTaskCreatePinnedToCore(analysisTask, "pf-audio", 4096, nullptr, 1, nullptr, 0);
#endif
}

#if PF_AUDIO_IN_CORE == 1
inline void loop(const PFAddonFrame&) {
  PFAudioFFT::analyze(tick++);
}
#endif

#if PF_AUDIO_IN_DRIVES_KNOBS
// Same lane the weather addon and the browser audio path use. The absolute
// bus still outranks it — fillAbsolute runs after every addon has spoken —
// and a hand on an encoder releases that lane, so sound never fights a
// person for a knob.
inline void fillInput(InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    float v = PFAudioFFT::bands[i];
    if (v > 1.0f) v = 1.0f;
    if (v < 0.0f) v = 0.0f;
    input.knobAudioActive[i] = true;
    input.knobAudioValue[i] = v;
  }
}
#endif

inline void appendStatus(String& json) {
  json += ",\"audioIn\":{\"core\":";
  json += PF_AUDIO_IN_CORE;
  json += ",\"lastUs\":";
  json += PFAudioFFT::lastUs;
  json += ",\"avgUs\":";
  json += PFAudioFFT::avgUs();
  json += ",\"fillUs\":";
  json += PFAudioFFT::avgFillUs();
  json += ",\"fftUs\":";
  json += PFAudioFFT::avgFftUs();
  json += ",\"foldUs\":";
  json += PFAudioFFT::avgFoldUs();
  json += ",\"maxUs\":";
  json += PFAudioFFT::maxUs;
  json += ",\"runs\":";
  json += PFAudioFFT::runs;
  json += ",\"heap\":";
  json += heapCost;
  json += ",\"staticBytes\":";
  json += PFAudioFFT::staticBytes();
  json += ",\"rawPeak\":";
  json += String(PFAudioFFT::rawPeak, 5);
  json += ",\"rawDc\":";
  json += String(PFAudioFFT::rawDc, 5);
  json += ",\"bands\":[";
  for (int i = 0; i < 4; i++) {
    if (i) json += ',';
    json += String(PFAudioFFT::bands[i], 4);
  }
  json += "]}";
}

inline const PFAddon descriptor = {
    "audio-in",
    nullptr,       // cap - not a console page, nothing for the nav to gate
    setup,
    nullptr,       // onNetwork
#if PF_AUDIO_IN_CORE == 1
    loop,
#else
    nullptr,       // loop - the Core 0 task does the work
#endif
    nullptr,       // observeFrame
#if PF_AUDIO_IN_DRIVES_KNOBS
    fillInput,
#else
    nullptr,       // fillInput
#endif
    nullptr,       // onUserInput
    nullptr,       // claimsPattern
    nullptr,       // takePattern
    nullptr,       // onSleep
    nullptr,       // requestSleep
    nullptr,       // shortName - not listed in the device menu
    nullptr,       // isRuntimeEnabled
    nullptr,       // setRuntimeEnabled
    appendStatus,
    nullptr,       // drawOverlay
};

}  // namespace PFAddonAudioIn
