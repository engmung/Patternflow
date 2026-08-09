// ═══════════════════════════════════════════════════════════
// PatternFlow - Hardware Configuration & Constants
// License: MIT
// ═══════════════════════════════════════════════════════════

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// --- Arduino macro detox ---
// Arduino.h defines PI / TWO_PI / HALF_PI / DEG_TO_RAD / RAD_TO_DEG / EULER as
// bare object-like macros, so a pattern that declares its own constant with
// one of those names ("static constexpr float PI = ...") gets preprocessor-
// mangled into a compile error — AI-generated patterns do this all the time.
// Replace the macros with typed constants: every existing use of PI keeps
// working, and a pattern namespace may now legally shadow them with its own
// definitions. (Function-like macros such as min/max/abs/constrain are left
// alone — patterns rely on them and they only expand before a parenthesis.)
//
// float, not double: Arduino's macros are double literals, which silently
// promotes float expressions like `hash * TWO_PI` to SOFTWARE-emulated double
// math on the S3 (its FPU is single-precision only). Patterns are float math
// throughout, so float constants keep the pixel loop on the hardware FPU;
// the precision difference is in the 8th significant digit — invisible.
#ifdef PI
#undef PI
#endif
#ifdef TWO_PI
#undef TWO_PI
#endif
#ifdef HALF_PI
#undef HALF_PI
#endif
#ifdef DEG_TO_RAD
#undef DEG_TO_RAD
#endif
#ifdef RAD_TO_DEG
#undef RAD_TO_DEG
#endif
#ifdef EULER
#undef EULER
#endif
constexpr float PI         = 3.14159265358979323846f;
constexpr float TWO_PI     = 6.28318530717958647693f;
constexpr float HALF_PI    = 1.57079632679489661923f;
constexpr float DEG_TO_RAD = 0.01745329251994329577f;
constexpr float RAD_TO_DEG = 57.29577951308232087680f;
constexpr float EULER      = 2.71828182845904523536f;

// --- Display Specifications ---
// Running a panel other than the stock 128x64? Change these to match your
// hardware and reflash — that is the whole change. Nothing else in the
// firmware hardcodes a size: the HUB75 driver config, the canvas buffer, the
// radius/angle tables and the on-screen menus all derive from these three.
// (A pattern composed for a grid that ISN'T the panel — a 64x128 portrait
// pattern on this 128x64 panel, say — is a separate matter, handled per
// pattern with PFCanvas::setFrame(). See README.md.)
// Running a non-stock panel? Please report how it went, working or not:
// https://github.com/engmung/Patternflow/issues/224
#define PANEL_RES_W 128
#define PANEL_RES_H 64
#define PANEL_CHAIN 1

// --- Panel Selection ---
// This firmware runs on classic HUB75 / HUB75E panels driven directly by the
// ESP32-S3 (no external sending/receiving card). Pick your panel's driver IC
// below, then build & upload. PANEL_PROFILE is the ONLY line you change.
//
// "HUB75E" on the listing guarantees a connector, NOT compatibility — the
// driver ICs on the back of the panel decide whether it lights up at all.
// Full buyer's guide, symptom table and a copy-paste question for the seller:
// docs/panel-compatibility.md
//
// Six names, but the library only has FOUR distinct behaviours — verified in
// ESP32-HUB75-MatrixPanel-leddrivers.cpp, shiftDriver():
//
//   PANEL_STANDARD     No init sequence at all. Plain 74HC595 shift-register
//                      panels, and the right starting point for any classic
//                      chip with no dedicated value below (ICN2037, SM162xx,
//                      unlabeled indoor panels). This is what the browser
//                      flasher ships, so a working stock build is by
//                      definition running this path.
//   PANEL_HIGHREFRESH  ┐ All three run the SAME fm6124init() register
//   PANEL_FM6124       ├─ sequence — there is no per-chip branch inside it.
//   PANEL_ICN2038S     ┘ Pick whichever matches your silkscreen; switching
//                      between them changes nothing.
//   PANEL_MBI5124      Only flips clkphase to true (MBI5124 latches on the
//                      clock's rising edge). No register writes.
//   PANEL_DP3246       dp3246init() — its own register sequence, and also
//                      forces clkphase true.
//
// DON'T pick by part number alone — try PANEL_STANDARD first, always. The
// init sequence writes a brightness register and one output-enable bit; many
// panels ship with those already usable and light up with no init at all,
// others come up dark until they're written, and the part number does not
// tell you which. The Patternflow reference panel's driver is an FM6124 and
// it runs fine on PANEL_STANDARD. Only reach for another profile if the
// panel stays COMPLETELY dark.
//
// NOT SUPPORTED — no value here rescues these:
//   S-PWM / GCLK "smart" panels — ICN2053, FM6353, FM6363/FM6363C, FM6373C,
//   DP3264/DP3265, ICND2055, MBI5051/5052/5053, MBI6024. Usually sold on
//   "1920/3840Hz high refresh" or as needing a Nova/Linsn/Colorlight/Huidu
//   receiving card. Their drivers generate PWM on-chip from a separate
//   grey-scale clock and use an addressing scheme ESP32-HUB75-MatrixPanel-DMA
//   cannot produce, so the panel stays completely dark whatever you set.
//   (Upstream: issue #642, closed wontfix.)
#define PANEL_STANDARD     0
#define PANEL_HIGHREFRESH  1
#define PANEL_FM6124       2
#define PANEL_ICN2038S     3
#define PANEL_MBI5124      4
#define PANEL_DP3246       5

#define PANEL_PROFILE  PANEL_STANDARD   // ← change ONLY if the panel stays dark

#if   PANEL_PROFILE == PANEL_HIGHREFRESH
  #define HUB75_DRIVER HUB75_I2S_CFG::FM6126A
#elif PANEL_PROFILE == PANEL_FM6124
  #define HUB75_DRIVER HUB75_I2S_CFG::FM6124
#elif PANEL_PROFILE == PANEL_ICN2038S
  #define HUB75_DRIVER HUB75_I2S_CFG::ICN2038S
#elif PANEL_PROFILE == PANEL_MBI5124
  #define HUB75_DRIVER HUB75_I2S_CFG::MBI5124
#elif PANEL_PROFILE == PANEL_DP3246
  #define HUB75_DRIVER HUB75_I2S_CFG::DP3246
#else
  #define HUB75_DRIVER HUB75_I2S_CFG::SHIFTREG  // plain shift-register panel
#endif

// --- HUB75 Pin Mapping (ESP32-S3) ---
#define R1_PIN  42
#define G1_PIN  41
#define B1_PIN  40
#define R2_PIN  38
#define G2_PIN  39
#define B2_PIN  13
#define PIN_A   46
#define PIN_B   11
#define PIN_C   48
#define PIN_D   12
#define PIN_E   21
#define LAT_PIN 47
#define OE_PIN  14
#define CLK_PIN 2

// --- Encoder Pin Mapping ---
// ENCn is the encoder at the front-panel Kn position (verified on the
// board) — no cross-routing; keep LOGICAL_TO_PHYSICAL_KNOB an identity.
// Encoder 1: Hue Control
#define ENC1_A   4
#define ENC1_B   8
#define ENC1_SW  9

// Encoder 2: Speed Control
#define ENC2_A   5
#define ENC2_B   10
#define ENC2_SW  15

// Encoder 3: Mode/Preset Control
#define ENC3_A   6
#define ENC3_B   16
#define ENC3_SW  17

// Encoder 4: Frequency Control
#define ENC4_A   7
#define ENC4_B   18
#define ENC4_SW  1

// --- Hardware Settings ---
// 0 for the official Bourns PEC11R-4220F-S0024 (used on the simplified
// revision board); set to 1 if rotation reads reversed (e.g. AliExpress
// clones, or encoders mounted on the back of the PCB).
#define INVERT_ENCODER 0

// Contact-bounce filter for the encoder A/B lines, in microseconds. These are
// mechanical contacts with no hardware help: the pull-ups are the ESP32's
// internal ones (weak), and the RC filter pads that v2 carried were never
// populated and are gone on v3. So an edge arriving sooner than this after the
// last accepted one is treated as bounce and dropped.
//
// Sizing: contact bounce settles in a few hundred microseconds. A real
// sub-step is ~12 ms apart at the EC11's rated 60 RPM ceiling, and still
// ~2.5 ms at a hard 300 RPM flick — so 500 µs leaves a wide margin either way.
// Raise it if a knob still double-counts; set it to 0 to disable the filter.
#define ENC_BOUNCE_US 500

#define DEFAULT_BRIGHTNESS 204  // 80% (0-255)

// --- LED Panel Color Calibration ---
// Override these per panel; the defaults are a mild correction tuned for
// a typical HUB75 (red LED brighter than blue, slight green dominance in
// cyans). Steeper R gamma curbs red dominance; gentler B gamma keeps the
// blues from collapsing into black. WB gain trims R and G a touch so
// pure-white whites land closer to D65 instead of warm pink.
//
// These are PASSTHROUGH: the device adds nothing of its own to the colour a
// pattern asked for. That is the standard pipeline, not an absence of one —
// editor colours are sRGB, the panel is linear PWM, and the HUB75 driver
// already applies exactly that conversion (lumConvTab, a CIE1931 curve of
// effective exponent ~2.44). Anything set here stacks on top of it.
//
// It used to: gamma 2.5/2.4/2.2 with a 0.92 white-balance gain. Measured end
// to end, that put the panel here —
//
//   input   driver alone   driver + the old values
//     64        4.4 %              0.3 %
//    128       18.6 %              2.2 %
//    192       48.7 %             14.6 %
//    255      100.0 %             81.1 %
//
// — an effective exponent of 5.5, with white capped at 81 %. Greys were not
// dim by accident; they were being crushed twice, and a fifth of the panel's
// brightness was being thrown away. Those values predate Pattern Lab being
// able to set colour precisely, and were written believing the driver did no
// curve of its own.
//
// The fine tuning on top of this baseline was done 2026-08-09 on the
// maintainer's v2.x panel, by eye against a monitor showing the same test
// frames (GET /api/display tunes all of these live; the panel tuner page in
// web/public/panel-tuner.html drives it). The WB and saturation defaults
// below are that panel's converged numbers. Panels vary — if yours reads
// differently, tune live and land your own numbers here. Gamma is the
// driver's job and almost never yours: putting a curve back here is how the
// stack above happened.

// OPEN: matching panel colour to a monitor properly.
// Per-channel gain is an approximation. The real difference is that the LED
// primaries sit at different wavelengths than sRGB's, so the same RGB triplet
// is a genuinely different colour on each. The textbook fix is a pair of 3x3
// matrices (sRGB -> XYZ -> panel RGB) derived from the panel primaries' xy
// chromaticity and its white point — which needs a colorimeter to measure, and
// a gamut decision, because these panels are often WIDER than sRGB and mapping
// into it costs saturation. Nobody has done that here. If you want to:
// russellcottrell.com/photo/matrixCalculator.htm derives the matrices from xy,
// and FastLED's ColorCorrection is the usual per-channel approximation.
// Worth doing once a production panel batch is fixed, not before — measure a
// panel you will not be replacing.

// To get the pre-2026-07 look back: gammas 2.5/2.4/2.2, WB 0.92/0.92/1.0,
// saturation 1.10. It is darker and dimmer, not more correct.
#ifndef LED_GAMMA_R
#define LED_GAMMA_R 1.0f
#endif
#ifndef LED_GAMMA_G
#define LED_GAMMA_G 1.0f
#endif
#ifndef LED_GAMMA_B
#define LED_GAMMA_B 1.0f
#endif

// Tuned by eye against the Calibration preset's WHITE screen (2026-08-09,
// maintainer's v2.x panel): this panel leans warm, so red is trimmed hardest.
// Tune live via /api/display, then land the converged numbers here.
#ifndef LED_WB_R
#define LED_WB_R 0.930f
#endif
#ifndef LED_WB_G
#define LED_WB_G 1.000f
#endif
#ifndef LED_WB_B
#define LED_WB_B 0.975f
#endif

// Saturation boost is applied before gamma in present(). Gray stays gray
// (mathematically a no-op when r==g==b), saturated colors get pulled
// further away from gray. 1.0 disables.
//
// 1.62 was tuned by eye (2026-08-09) against the Calibration preset's
// side-by-side sRGB reference in the panel tuner, and held across the
// brightness range (checked at 14% and 100%). Counter to the wide-gamut
// theory that predicted a CUT: in practice the panel reads washed-out next
// to a monitor showing the same frame, so matching the design intent takes
// a strong boost. Strongly saturated colors clip a channel under it —
// acceptable; the match is judged on real patterns, not on test bars.
#ifndef LED_SAT_BOOST
#define LED_SAT_BOOST 1.62f
#endif

// --- Network features (Wi-Fi, OTA, OSC, audio-react) ---
// All connectivity config and per-device secrets live in net_config.h /
// patternflow_secrets.h, not here. config.h stays focused on hardware.
#include "net_config.h"

// --- Pattern Parameters Limits ---
#define MAX_HUE 360
#define MAX_SPEED 5.0f
#define SPEED_STEP 0.2f
#define MAX_FREQ 1000
#define FREQ_STEP 50

#endif
