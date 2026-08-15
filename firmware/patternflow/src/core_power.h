// ═══════════════════════════════════════════════════════════
// PatternFlow - total power clamp
//
// A near-white frame at full brightness draws about 4.8 A at 5 V on this
// panel. That is above what a USB-A port is rated for, it warms the
// connector, and on a bank that cannot deliver it the device browns out —
// so the pattern that asks for it gets dimmed instead of being allowed to.
//
// ── How the estimate works ──────────────────────────────────────────────
// The blit already sums every pixel's post-CIE value (see
// blitRGB888/lastFrameOnTime), which is the LED on-time the frame asks for.
// Divided by an all-white frame's total, that is the fraction of full-white
// current the frame wants:
//
//     amps ≈ IDLE + FULL_WHITE_SPAN × demand × (brightness / 255)
//
// Brightness scales it because it is applied afterwards as OE duty; the
// driver ICs' own draw does not, which is why IDLE sits outside the product.
//
// ── Where the numbers come from ─────────────────────────────────────────
// Measured on a 40,000 mAh bank (README "Power & runtime"):
//   full white, max brightness   26.6 W  →  4.8 A   (9% in 30 min)
//   bright generative pattern    ~9.6 W  →  ~1.9 A  (13% in 2 h, ~15 h total)
// The white figure anchors the top of the curve, which is the only end that
// matters for a clamp. IDLE is not measured — 0.55 A is a deliberate
// over-estimate of the panel drivers plus the ESP32 with Wi-Fi up, so the
// model errs toward clamping early rather than late.
//
// ── The budget ──────────────────────────────────────────────────────────
// 2.4 A by default: the high-power USB-A rating, and comfortably above the
// ~1.9 A a normal bright pattern actually draws, so ordinary use never
// notices this file exists. A white-out frame lands at roughly half
// brightness instead of pulling 4.8 A.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <Preferences.h>

#include "core_display.h"

namespace PatternflowPower {

// Milliamps drawn with every LED off but the panel and board awake.
constexpr uint32_t IDLE_MA = 550;
// Additional milliamps at full white, full brightness (4800 measured − idle).
constexpr uint32_t FULL_WHITE_SPAN_MA = 4250;

constexpr uint16_t BUDGET_DEFAULT_MA = 2400;
// Below the idle draw a budget cannot be met at any brightness, and above
// the panel's own maximum the clamp would never do anything — outside this
// range the setting is not a setting.
constexpr uint16_t BUDGET_MIN_MA = 800;
constexpr uint16_t BUDGET_MAX_MA = 5000;

inline uint16_t budgetMa = BUDGET_DEFAULT_MA;
inline bool enabled = true;

// Last frame's demand as a Q16 fraction of an all-white frame, and what the
// clamp did about it.
inline uint32_t demandQ16 = 0;
inline uint16_t estimateMa = 0;
inline uint8_t allowedBrightness = 255;
inline bool limiting = false;

inline void load() {
  Preferences prefs;
  if (!prefs.begin("patternflow", true)) return;
  budgetMa = prefs.getUShort("pwr_budget", BUDGET_DEFAULT_MA);
  enabled = prefs.getBool("pwr_on", true);
  prefs.end();
  if (budgetMa < BUDGET_MIN_MA) budgetMa = BUDGET_MIN_MA;
  if (budgetMa > BUDGET_MAX_MA) budgetMa = BUDGET_MAX_MA;
}

inline void save() {
  Preferences prefs;
  if (!prefs.begin("patternflow", false)) return;
  prefs.putUShort("pwr_budget", budgetMa);
  prefs.putBool("pwr_on", enabled);
  prefs.end();
}

inline bool setBudgetMa(int ma) {
  if (ma < BUDGET_MIN_MA || ma > BUDGET_MAX_MA) return false;
  budgetMa = (uint16_t)ma;
  save();
  return true;
}

inline void setEnabled(bool on) {
  enabled = on;
  if (!on) {
    limiting = false;
    allowedBrightness = 255;
  }
  save();
}

/** Estimated draw at a given brightness, for the frame just blitted. */
inline uint16_t estimateAtMa(uint8_t brightness) {
  uint64_t span = (uint64_t)FULL_WHITE_SPAN_MA * demandQ16 >> 16;
  span = span * brightness / 255;
  uint32_t total = IDLE_MA + (uint32_t)span;
  return total > 65535 ? 65535 : (uint16_t)total;
}

/**
 * Read the frame the panel just drew and return the brightness it may keep.
 *
 * Call once per frame, after present(). The answer applies to the NEXT frame
 * — measuring frame N and acting on N+1 — which is invisible at 40-plus fps
 * and avoids a second pass over the pixels.
 *
 * `requested` is whatever the user set; the return is never above it, so the
 * clamp can only ever take brightness away, and the brightness control keeps
 * working normally whenever there is headroom.
 */
inline uint8_t allow(uint8_t requested) {
  if (!dma_display) return requested;

  const uint64_t maxOnTime = dma_display->maxFrameOnTime();
  if (maxOnTime == 0) return requested;
  demandQ16 = (uint32_t)((dma_display->lastFrameOnTime() << 16) / maxOnTime);

  estimateMa = estimateAtMa(requested);
  if (!enabled || estimateMa <= budgetMa) {
    limiting = false;
    allowedBrightness = requested;
    return requested;
  }

  // Solve the model for the brightness that lands on the budget. A frame
  // whose idle draw alone exceeds the budget cannot be helped by dimming —
  // floor it rather than divide toward zero, since a dark panel is not what
  // the person asked for and the LEDs are not what is drawing the current.
  const uint32_t headroom = budgetMa > IDLE_MA ? budgetMa - IDLE_MA : 0;
  const uint64_t span = (uint64_t)FULL_WHITE_SPAN_MA * demandQ16 >> 16;
  uint32_t scaled = span ? (uint32_t)((uint64_t)headroom * 255 / span) : 255;
  if (scaled > requested) scaled = requested;
  if (scaled < 5) scaled = 5;

  limiting = true;
  allowedBrightness = (uint8_t)scaled;
  estimateMa = estimateAtMa(allowedBrightness);
  return allowedBrightness;
}

inline uint16_t demandPercent() { return (uint16_t)((demandQ16 * 100) >> 16); }

}  // namespace PatternflowPower
