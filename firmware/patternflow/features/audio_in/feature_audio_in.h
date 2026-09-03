// ═══════════════════════════════════════════════════════════
// PatternFlow - on-board audio input, as a feature
//
// The fifth port onto the feature seam, and the first one that was not already
// living in the core — which makes it the more interesting test. The other
// four proved the hooks could carry features that already existed. This one
// asks whether they can carry a feature nobody has written yet.
//
// Answer so far: four hooks, no core edits, no sketch edits.
//
//   setup        - build the twiddle tables, and start the analysis task
//   loop         - run a window inline, when measuring the inline cost
//   fillInput    - four bands drive the four knob lanes, exactly the way
//                  the weather feature drives them from a temperature. A
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

#include "../pf_feature.h"
#include "core_audio_fft.h"
#include "core_audio_in_http.h"
#include "core_audio_in_map.h"
#include "core_audio_pdm.h"

#ifndef PF_AUDIO_IN_CORE
#define PF_AUDIO_IN_CORE 0
#endif

// Off by default: while this is a measurement rather than a feature, it
// should cost a normal build exactly nothing.
#ifndef PF_AUDIO_IN_DRIVES_KNOBS
#define PF_AUDIO_IN_DRIVES_KNOBS 0
#endif

namespace PFFeatureAudioIn {

inline uint32_t tick = 0;
inline uint32_t heapCost = 0;

#if PF_AUDIO_IN_CORE == 0
inline void analysisTask(void*) {
  for (;;) {
    // With the microphone off there is nothing to analyse and no reason to
    // wake 60 times a second on the core Wi-Fi lives on. The task stays
    // parked; flipping the switch on /audio-in starts I2S and it resumes.
    if (!PFAudioInMap::micOn) {
      if (PFAudioPdm::live) PFAudioPdm::end();
      vTaskDelay(pdMS_TO_TICKS(250));
      continue;
    }
    if (!PFAudioPdm::live) PFAudioPdm::begin();

    PFAudioFFT::analyze(tick++);
    // Envelope tracking rides the analysis clock - once per window, here,
    // never from the mapping (which also runs from HTTP polls and would
    // double-count the release). The gate hears RAW frames (its constants
    // were measured that way); the damped copy is what the mapping and the
    // page consume.
    if (PFAudioInMap::micOn) {
      PFAudioInMap::trackEnvelopes(PFAudioFFT::bands);
      PFAudioInMap::smoothLevels(PFAudioFFT::bands);
    }
    // With a microphone the I2S read paces this loop, and without one nothing
    // blocks at all, so the synthetic path keeps the old 16 ms tick.
    //
    // Either way this ALWAYS yields for at least a tick. It used to
    // taskYIELD() on the microphone path, on the reasoning that the read was
    // the clock - which stops being true the moment the DMA ring backs up and
    // reads start returning instantly. A priority-1 task spinning on the core
    // Wi-Fi runs on is how a panel stops answering, and a yield that cannot
    // guarantee anything is not a floor. One tick is.
    vTaskDelay(PFAudioPdm::available() ? 1 : pdMS_TO_TICKS(16));
  }
}
#endif

// Registers /audio-in once Wi-Fi is up. Same edge every other feature with a
// page uses; nothing here runs before the HTTP server exists.
inline void onNetwork() { PFAudioInHttp::begin(); }

inline void setup() {
  PFAudioInMap::load();
  const uint32_t before = ESP.getFreeHeap();
  // Tables and buffers only. I2S is the analysis task's business now, so a
  // panel that boots with the mic off never installs the driver at all.
  PFAudioFFT::begin();
  heapCost = before - ESP.getFreeHeap();
#if PF_AUDIO_IN_CORE == 0
  // 4 KB stack: the transform works in static buffers, so the task itself
  // needs almost nothing. Priority 1 — below Wi-Fi, above idle.
  xTaskCreatePinnedToCore(analysisTask, "pf-audio", 4096, nullptr, 1, nullptr, 0);
#endif
}

#if PF_AUDIO_IN_CORE == 1
inline void loop(const PFFeatureFrame&) {
  PFAudioFFT::analyze(tick++);
}
#endif

#if PF_AUDIO_IN_DRIVES_KNOBS
// Same lane the weather feature and the browser audio path use. The absolute
// bus still outranks it — fillAbsolute runs after every feature has spoken —
// and a hand on an encoder releases that lane, so sound never fights a
// person for a knob.
inline void fillInput(InputFrame& input) {
  // Only drive a lane nobody else has taken. This feature is dispatched last in
  // every composition that carries it, so on a build that also has the
  // browser audio path both would write the same four lanes and the mic would
  // silently win - a person who deliberately connected the Chrome extension
  // would find the room overriding their tab.
  //
  // The rule is deliberately not "yield to the browser": that would mean
  // knowing which other features exist. Yielding to whoever already spoke is
  // the same behaviour with no coupling, and it is what dispatch order is
  // for. A hand on the encoder outranks both - the core drops any lane whose
  // knob moved this frame.
  if (!PFAudioInMap::micOn) return;
  // Belt and braces over the default-off switch: somebody who ticks the box
  // on a panel with no microphone would otherwise pin all four knobs at
  // their resting position and find that turning one does not stick.
  if (PFAudioFFT::inputIsDeadRail()) return;
  // Bands, not knobs: a band names the knob it drives, so this loop is over
  // bands and the index it writes to comes from the band.
  //
  // Two bands may name the same knob. The first one in order wins, because
  // `knobAudioActive` is already the "someone claimed this lane" flag used to
  // yield to other features - reusing it here means one rule covers both cases
  // and there is no separate precedence to learn. Deterministic either way;
  // last-wins would be just as defensible and half as consistent.
  for (int b = 0; b < 4; b++) {
    const PFAudioInMap::Band& cfg = PFAudioInMap::bands[b];
    if (cfg.muted) continue;
    const int k = constrain(cfg.knob, 0, 3);
    if (input.knobAudioActive[k]) continue;
    // Shaped and damped, not raw. A raw band never reaches the top of a knob
    // on this hardware - see the measurement in core_audio_in_map.h - and the
    // damped copy is what keeps a gate/steps curve from flickering.
    input.knobAudioValue[k] = PFAudioInMap::clamp01(
        PFAudioInMap::mapped(b, PFAudioInMap::smoothLevel[b]));
    input.knobAudioActive[k] = true;
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
  json += ",\"source\":\"";
  json += PFAudioFFT::sourceLabel();
  json += "\",\"micWindows\":";
  json += PFAudioPdm::windowsRead;
  // Hops thrown away because the analysis fell behind. Steady zero is healthy;
  // a number that climbs means the device has more to do than time to do it.
  json += ",\"micDropped\":";
  json += PFAudioPdm::dropped;
  // Peak and DC are the first things to read with a real mic in the loop:
  // the S3's PDM input is documented low-amplitude, and a spectrum computed
  // from nothing still folds into four plausible-looking band numbers.
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

inline const PFFeature descriptor = {
    "audio-in",
    "audio-in",    // cap - /audio-in exists on this build
    setup,
    onNetwork,
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
    "/audio-in",   // navPath - the console header link
    "Audio",       // navLabel
    "The panel hears the room or browser audio — a live spectrum, and four bands you "
    "shape into the knobs.",
};

}  // namespace PFFeatureAudioIn
