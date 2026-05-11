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

// --- Pattern Parameters Limits ---
#define MAX_HUE 360
#define MAX_SPEED 5.0f
#define SPEED_STEP 0.2f
#define MAX_FREQ 1000
#define FREQ_STEP 50

#endif