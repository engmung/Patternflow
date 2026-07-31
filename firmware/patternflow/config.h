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
// MEASURED, and worth knowing before you touch anything below: the DRIVER
// already applies a CIE1931 curve of its own (lumConvTab, effective exponent
// ~2.44). Everything here lands ON TOP of that, so the two stack.
//
//   input   driver alone   driver + the values below
//     64        4.4 %              0.3 %
//    128       18.6 %              2.2 %
//    192       48.7 %             14.6 %
//    255      100.0 %             81.1 %
//
// Effective exponent 5.5, and the 0.92 WB gain caps white at 81 % — a fifth of
// the panel's brightness given away. Greys are not dim by accident; they are
// being crushed twice.
//
// Setting all three gammas and all three WB gains to 1.0 is not a hack, it is
// the standard pipeline: editor colours are sRGB, the panel is linear PWM, and
// the driver's curve is exactly that conversion. Tried on hardware — greys read
// correctly and the preset library still looks right, though everything reads
// brighter, which is a BRIGHTNESS question (DEFAULT_BRIGHTNESS, or K1 longpress)
// and not a gamma one. Left at the old values here only because nobody has
// settled on the replacement numbers yet.
//
// If you are the one to settle it: change brightness for overall level,
// saturation for highlights collapsing to white, WB for a colour cast. Gamma is
// the driver's job and almost never yours.

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

// To revert to the previous behavior, set all three gammas to 2.4,
// all three WB gains to 1.0, and saturation boost to 1.0.
#ifndef LED_GAMMA_R
#define LED_GAMMA_R 2.5f
#endif
#ifndef LED_GAMMA_G
#define LED_GAMMA_G 2.4f
#endif
#ifndef LED_GAMMA_B
#define LED_GAMMA_B 2.2f
#endif

#ifndef LED_WB_R
#define LED_WB_R 0.92f
#endif
#ifndef LED_WB_G
#define LED_WB_G 0.92f
#endif
#ifndef LED_WB_B
#define LED_WB_B 1.00f
#endif

// Saturation boost is applied before gamma in present(). Gray stays gray
// (mathematically a no-op when r==g==b), saturated colors get pulled
// further away from gray. 1.10 = +10%; 1.0 disables.
#ifndef LED_SAT_BOOST
#define LED_SAT_BOOST 1.10f
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
