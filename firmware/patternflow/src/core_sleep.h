// ═══════════════════════════════════════════════════════════
// PatternFlow - Sleep mode
//
// Turns the panel off and idles the board without unplugging it, and comes
// back to exactly the pattern that was running.
//
// ── Why it stays on the network ─────────────────────────────────────────
// Not esp_deep_sleep. Deep sleep would take the draw to microamps, but it also
// takes the radio down, and then the only way back is a button — which defeats
// the point of being able to say "lights out" from MQTT or from a phone. So
// this is a "screen off, board idle, still reachable" sleep:
//
//   panel      framebuffer blanked, brightness 0, DMA transfer stopped
//   Wi-Fi      modem sleep (associated, wakes on its DTIM beacon)
//   CPU        80 MHz, the floor at which the radio still works
//   loop()     returns early — no render, no flip, no power clamp
//
// ── What each part is worth ─────────────────────────────────────────────
// core_power.h measured a bright pattern at ~1.9 A and puts the panel-plus-
// board idle at ~0.55 A. Blanking the framebuffer collects the first figure:
// the LEDs are what draws the current. Stopping the DMA transfer collects part
// of the second — with it running the driver ICs are clocked at 15 MHz forever,
// whether or not any LED is lit. The CPU and radio steps are the smallest of
// the three and are here because they are nearly free.
//
// ── Waking ──────────────────────────────────────────────────────────────
// Any physical knob turn or button press, an MQTT command on <prefix>/sleep,
// or GET /api/display?sleep=0. Deliberately NOT an OSC/MQTT knob message: a
// show still streaming knob values to a sleeping panel should not switch the
// lights back on. The sketch checks the raw encoder counters for this, since by
// the time an InputFrame exists the remote deltas are already merged into it.
//
// ── Requests vs. transitions ────────────────────────────────────────────
// request() only sets a flag; applyPending() from loop() does the work. MQTT
// callbacks run inside client.loop() and HTTP handlers inside an open
// transaction, and neither is a place to stop a DMA engine or reclock the CPU.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <WiFi.h>

#include "../config.h"
#include "core_display.h"

// Owned by the sketch (K1 longpress UI + NVS). Sleep drives the panel to 0 and
// puts this value back on wake, so the person's own setting is never rewritten
// — the same contract the power clamp keeps in core_power.h.
extern uint8_t currentBrightness;

namespace PatternflowSleep {

// Outside the #if: the sketch reads LOOP_DELAY_MS on a line that is compiled
// (though never reached) in a PF_SLEEP_ENABLED=0 build.

// Physical input is ignored for this long after falling asleep. Sleep is
// entered BY a knob turn (K1 on the NETWORK screen), and a turn is several
// detents and several loop iterations — without a guard the second detent of
// the gesture that started the sleep would end it again. Long enough to cover
// a deliberate turn and letting go of a button, short enough that nobody
// notices it when they come back to wake the device.
constexpr uint32_t WAKE_GUARD_MS = 800;

// How long the sleeping loop yields per pass. The render loop normally keeps
// the core busy every millisecond it has; asleep there is nothing to render, so
// handing the time back to the idle task is what actually lets the part clock
// itself down. Sets the worst-case wake latency on a knob turn, which is why it
// is 20 ms and not 200.
constexpr uint32_t LOOP_DELAY_MS = 20;

#if PF_SLEEP_ENABLED

inline bool sleeping = false;
inline uint32_t enteredAtMs = 0;

// -1 nothing pending, 0 wake, 1 sleep. A tri-state rather than a bool pair so
// a request can never be half-set, mirroring core_mqtt.h's pendingPatternIdx.
inline int8_t pending = -1;

inline bool isSleeping() { return sleeping; }
inline bool isCompiledIn() { return true; }

inline uint32_t sleepingForMs() {
  return sleeping ? (millis() - enteredAtMs) : 0;
}

/** False while the gesture that started the sleep may still be in progress. */
inline bool wakeableByInput() {
  return sleeping && sleepingForMs() >= WAKE_GUARD_MS;
}

// Both buffers to black, so whichever one the DMA engine resumes on is blank.
// A stop wipes them, but a resume restarts at descriptor chain A regardless of
// where back_buffer_id was left — see src/hub75/VENDORED.md.
inline void blankBothBuffers() {
  if (!dma_display) return;
  dma_display->fillScreen(0);
  dma_display->flipDMABuffer();
  dma_display->fillScreen(0);
}

inline void enter() {
  if (sleeping) return;

  blankBothBuffers();
  if (dma_display) {
    dma_display->setBrightness8(0);
#if PF_SLEEP_STOP_DMA
    dma_display->stopDMAoutput();
#endif
  }

  // Modem sleep. core_wifi.h turns this OFF at boot for OSC/OTA latency, which
  // is the right call while patterns are running and the wrong one here.
  WiFi.setSleep(true);

#if PF_SLEEP_CPU_MHZ > 0
  setCpuFrequencyMhz(PF_SLEEP_CPU_MHZ);
#endif

  sleeping = true;
  enteredAtMs = millis();
  Serial.println(">>> SLEEP: ON");
}

inline void wake() {
  if (!sleeping) return;

  // Reverse order, so the board is back at full speed before it has to keep a
  // 15 MHz transfer fed.
#if PF_SLEEP_CPU_MHZ > 0
  setCpuFrequencyMhz(PF_AWAKE_CPU_MHZ);
#endif
  WiFi.setSleep(false);

  if (dma_display) {
    blankBothBuffers();
#if PF_SLEEP_STOP_DMA
    dma_display->resumeDMAoutput();
#endif
    dma_display->setBrightness8(currentBrightness);
  }

  sleeping = false;
  Serial.printf(">>> SLEEP: OFF (slept %lus)\n",
                (unsigned long)((millis() - enteredAtMs) / 1000));
}

/** Queue a transition. Safe from an MQTT callback or an HTTP handler. */
inline void request(bool sleep) { pending = sleep ? 1 : 0; }

/**
 * Run any queued transition. Call once per loop().
 *
 * Returns true when the state actually changed, so the caller can publish it
 * without having to track the previous value itself.
 */
inline bool applyPending() {
  if (pending < 0) return false;
  const bool wanted = pending == 1;
  pending = -1;
  if (wanted == sleeping) return false;
  if (wanted) enter();
  else wake();
  return true;
}

#else   // PF_SLEEP_ENABLED

inline bool isSleeping() { return false; }
inline bool isCompiledIn() { return false; }
inline uint32_t sleepingForMs() { return 0; }
inline bool wakeableByInput() { return false; }
inline void enter() {}
inline void wake() {}
inline void request(bool) {}
inline bool applyPending() { return false; }

#endif  // PF_SLEEP_ENABLED

}  // namespace PatternflowSleep
