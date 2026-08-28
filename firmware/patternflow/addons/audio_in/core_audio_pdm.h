// ═══════════════════════════════════════════════════════════
// PatternFlow - the microphone, at last
//
// core_audio_fft.h was written before any microphone existed, because the
// question that decided whether the feature was possible was "is there CPU
// left", not "can we read a mic". That answered yes. This is the other half.
//
// A PDM MEMS mic on the only two free header pins this board has: GPIO43 and
// GPIO44, the UART0 TX/RX pads. They are free because the console runs over
// native USB CDC (USBMode=hwcdc, CDCOnBoot=cdc) and nothing drives UART0.
// Everything else is HUB75, an encoder, or claimed by the N16R8's octal
// PSRAM at 35-37.
//
//   mic 3V   -> 3V3          mic CLK -> GPIO43
//   mic GND  -> GND          mic DAT -> GPIO44
//   mic SEL  -> GND          SEL low = LEFT channel, which is the slot a mono
//                            PDM RX reads. Tie it high instead and this reads
//                            silence while looking perfectly healthy.
//
// ── Which driver ────────────────────────────────────────────────────────
//
// driver/i2s.h - the legacy one. Not a preference: platformio.ini pins
// espressif32@7.0.1, whose Arduino core is 2.0.17 on IDF 4.4, and that SDK
// ships only tools/sdk/esp32s3/include/driver/include/driver/i2s.h. The
// channel API this was first written against (driver/i2s_pdm.h,
// i2s_channel_read) belongs to IDF 5.x and is not on the include path. If
// this project ever moves to a core built on IDF 5, this file is the one to
// rewrite, and the rewrite is worth doing: the new API is not deprecated and
// its GPIO config names the PDM clock pin `clk` instead of hiding it in `ws`.
//
// Arduino's I2SClass is not used either, and would not be even where it
// exists: readBytes loops `while (total_size < size)` around a read whose
// timeout is Stream's, 1000 ms by default. A mic that is wired wrong returns
// zero bytes forever, so that loop never ends and the analysis task is gone
// for good - no error, no watchdog, just a feature that stopped. i2s_read is
// one attempt with a bounded wait, and a partial read is data, not failure.
//
// The S3 has a hardware PDM-to-PCM filter, so what lands in the DMA buffer is
// already int16 PCM. Nothing here decimates a 1-bit stream.
//
// A silent mic and an absent mic have to be distinguishable, so a run of
// empty reads falls back to the synthetic source and says so at /api/status.
// Otherwise the bands sit at zero and there is nothing to tell you whether
// the room is quiet or the wiring is wrong.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

// Set to 0 to build the analysis without ever touching I2S - the measurement
// harness the FFT was originally written for, on a board with no mic.
#ifndef PF_AUDIO_IN_PDM_ENABLED
#define PF_AUDIO_IN_PDM_ENABLED 1
#endif

#if PF_AUDIO_IN_PDM_ENABLED
#include <driver/i2s.h>
#if !SOC_I2S_SUPPORTS_PDM_RX
#error "PF_AUDIO_IN_PDM_ENABLED but this chip has no PDM RX"
#endif
#endif

// The two free pads. Overridable because a board that frees different pins is
// a wiring change, not a code change.
#ifndef PF_AUDIO_IN_PDM_CLK
#define PF_AUDIO_IN_PDM_CLK 43
#endif
#ifndef PF_AUDIO_IN_PDM_DAT
#define PF_AUDIO_IN_PDM_DAT 44
#endif

namespace PFAudioPdm {

// Matches PFAudioFFT: a 512-point window at 16 kHz. The hop is half a window,
// so consecutive windows overlap 50% and a transient lands in the frame it
// happened in rather than up to a window late.
constexpr int WINDOW = 512;
constexpr int HOP = WINDOW / 2;
constexpr uint32_t RATE = 16000;

inline bool live = false;      // I2S came up
inline bool stalled = false;   // ...and then stopped producing samples
inline uint32_t windowsRead = 0;

inline bool available() { return live && !stalled; }

inline const char* sourceName() {
  if (!live) return "synth";
  return stalled ? "synth (mic stalled)" : "pdm";
}

#if PF_AUDIO_IN_PDM_ENABLED

// One hop of audio is 16 ms. 40 ms leaves room for a late DMA buffer without
// being long enough to miss a frame when the mic has gone away.
constexpr uint32_t READ_TIMEOUT_MS = 40;
// Empty reads in a row before we stop believing there is a microphone. Three
// is ~120 ms: long enough that one scheduling hiccup does not trip it.
constexpr int STALL_LIMIT = 3;
// Port 0. The panel is HUB75 on its own peripheral and nothing else here
// wants an I2S port, so there is no allocation to negotiate.
constexpr i2s_port_t PORT = I2S_NUM_0;

inline int emptyReads = 0;
inline int16_t raw[HOP];
// The ring the window is cut from: the previous hop, then the new one.
inline float ring[WINDOW];

// Installing I2S costs about 7.9 KB of internal heap — measured by building
// the same edition with PF_AUDIO_IN_PDM_ENABLED 0 and comparing one clean
// reading each. That is not much on this board, and it is not the reason
// anybody's console is slow; it is simply rude to spend it on a panel with no
// microphone wired, which is most of them.
//
// So it starts on demand and can be handed back. `begin()` is the install,
// `end()` is the release, and both are safe to call twice.
inline void end() {
  if (!live) return;
  i2s_driver_uninstall(PORT);
  live = false;
  stalled = false;
  emptyReads = 0;
  Serial.println("[AUDIO-IN] PDM released");
}

inline void begin() {
  if (live) return;
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM);
  cfg.sample_rate = RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  // SEL tied to GND puts the mic on the left channel; asking for both would
  // interleave 16 ms of real audio with 16 ms of silence.
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  // LEVEL1 so the panel's DMA, which is what this device is actually for,
  // keeps priority over the microphone.
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  // Four buffers of a hop each: a late analysis task has a whole window of
  // slack before anything is lost.
  cfg.dma_buf_count = 4;
  cfg.dma_buf_len = HOP;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = false;
  cfg.fixed_mclk = 0;

  esp_err_t err = i2s_driver_install(PORT, &cfg, 0, nullptr);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO-IN] i2s_driver_install failed (%d) - using synth\n", (int)err);
    return;
  }

  // In PDM RX the clock the mic is driven by comes out of the WS pad, not
  // BCK. Wiring CLK to a pin named bck_io_num here is the mistake to expect:
  // it installs cleanly, produces no samples, and looks like a dead mic.
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_PIN_NO_CHANGE;
  pins.ws_io_num = PF_AUDIO_IN_PDM_CLK;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = PF_AUDIO_IN_PDM_DAT;
  err = i2s_set_pin(PORT, &pins);
  if (err != ESP_OK) {
    Serial.printf("[AUDIO-IN] i2s_set_pin failed on CLK=%d DAT=%d (%d) - using synth\n",
                  PF_AUDIO_IN_PDM_CLK, PF_AUDIO_IN_PDM_DAT, (int)err);
    i2s_driver_uninstall(PORT);
    return;
  }

  for (int i = 0; i < WINDOW; i++) ring[i] = 0.0f;
  live = true;
  Serial.printf("[AUDIO-IN] PDM up: CLK=%d DAT=%d %luHz mono left\n",
                PF_AUDIO_IN_PDM_CLK, PF_AUDIO_IN_PDM_DAT, (unsigned long)RATE);
}

// Read one hop, slide it into the ring, and hand back a whole window.
// Returns false when there was nothing to read, which is the caller's cue to
// fall back rather than analyse a window of silence it invented.
//
// Blocking here is the point: at 16 kHz a hop takes 16 ms to exist, so this
// paces the analysis task against the audio clock. That is why the task does
// not also delay - two clocks would drift against each other and the DMA
// buffer would overrun on whichever side was slower.
inline bool readWindow(float* dst) {
  if (!live) return false;

  size_t got = 0;
  const esp_err_t err = i2s_read(PORT, raw, sizeof(raw), &got,
                                 pdMS_TO_TICKS(READ_TIMEOUT_MS));
  const int samples = (int)(got / sizeof(int16_t));
  if (samples == 0) {
    if (++emptyReads >= STALL_LIMIT && !stalled) {
      stalled = true;
      Serial.printf("[AUDIO-IN] no samples from the mic (err %d) - falling back to synth\n",
                    (int)err);
    }
    return false;
  }
  if (stalled) {
    stalled = false;
    Serial.println("[AUDIO-IN] mic is back");
  }
  emptyReads = 0;
  windowsRead++;

  // Slide: the previous hop becomes the window's first half.
  for (int i = 0; i < WINDOW - HOP; i++) ring[i] = ring[i + HOP];
  // int16 full scale to roughly +/-1. Do NOT normalise or auto-gain here: the
  // S3's PDM input is documented low-amplitude (esp-idf#8660), and rawPeak at
  // /api/status is how anyone finds that out. A scaled signal would report a
  // healthy peak from nothing. Gain belongs downstream, once there is a real
  // number to size it against.
  const float k = 1.0f / 32768.0f;
  const int n = samples < HOP ? samples : HOP;
  for (int i = 0; i < n; i++) ring[WINDOW - HOP + i] = (float)raw[i] * k;
  // A short read leaves the tail of the hop holding the previous window's
  // audio. Zero it instead: repeating 16 ms of sound is a spectral artefact,
  // silence is only quieter.
  for (int i = n; i < HOP; i++) ring[WINDOW - HOP + i] = 0.0f;

  for (int i = 0; i < WINDOW; i++) dst[i] = ring[i];
  return true;
}

#else  // PF_AUDIO_IN_PDM_ENABLED

inline void begin() {}
inline bool readWindow(float*) { return false; }

#endif

}  // namespace PFAudioPdm
