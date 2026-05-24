// ═══════════════════════════════════════════════════════════
// PatternFlow - Hardware Configuration & Constants
// License: MIT
// ═══════════════════════════════════════════════════════════

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// --- Display Specifications ---
#define PANEL_RES_W 128
#define PANEL_RES_H 64
#define PANEL_CHAIN 1

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
#define INVERT_ENCODER 1
#define DEFAULT_BRIGHTNESS 204  // 80% (0-255)

// --- LED Panel Color Calibration ---
// Override these per panel; the defaults are a mild correction tuned for
// a typical HUB75 (red LED brighter than blue, slight green dominance in
// cyans). Steeper R gamma curbs red dominance; gentler B gamma keeps the
// blues from collapsing into black. WB gain trims R and G a touch so
// pure-white whites land closer to D65 instead of warm pink.
//
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

// --- Experimental OSC over Wi-Fi ---
// Enable this only for local performance/control experiments. Keep credentials
// out of commits if you change these values for a real network.
#define PF_OSC_ENABLED 0
#define PF_WIFI_SSID "YOUR_WIFI_SSID"
#define PF_WIFI_PASS "YOUR_WIFI_PASSWORD"
#define PF_OSC_REMOTE_HOST "192.168.0.10"
#define PF_OSC_REMOTE_PORT 9000
#define PF_OSC_LOCAL_PORT 9001
#define PF_WIFI_CONNECT_TIMEOUT_MS 8000

#if __has_include("src/osc_secrets.h")
#include "src/osc_secrets.h"
#endif

// --- Pattern Parameters Limits ---
#define MAX_HUE 360
#define MAX_SPEED 5.0f
#define SPEED_STEP 0.2f
#define MAX_FREQ 1000
#define FREQ_STEP 50

#endif
