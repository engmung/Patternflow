// ═══════════════════════════════════════════════════════════
// PatternFlow - Network feature configuration
//
// One place for everything Wi-Fi touches: the shared Wi-Fi connection
// and the three features that ride on it — OTA (wireless flashing),
// OSC (Ableton/Max sidechannel), and the audio-react WebSocket server.
//
// Per-device secrets and toggles live in patternflow_secrets.h (gitignored).
// That file is included FIRST below, so anything it #defines wins; the
// #ifndef blocks here only fill in defaults for whatever it left unset.
// No #undef gymnastics required — just leave a line out of the secrets
// file to accept the default.
//
// Copy patternflow_secrets.example.h to patternflow_secrets.h to start.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// Per-device overrides first. Without this file every default below applies
// (Wi-Fi placeholders, OSC off, OTA on, audio on).
#if __has_include("patternflow_secrets.h")
#include "patternflow_secrets.h"
#endif

// ── Wi-Fi (shared by OTA, OSC, and audio-react) ──────────────
// Credentials normally come from patternflow_secrets.h. The placeholders
// here only keep a secret-less checkout compiling.
#ifndef PF_WIFI_SSID
#define PF_WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef PF_WIFI_PASS
#define PF_WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif
// Wi-Fi is non-blocking (see core_wifi.h): boot never waits for the join.
// While disconnected, core_wifi.h re-issues WiFi.begin() at this interval
// until it links up.
#ifndef PF_WIFI_RETRY_INTERVAL_MS
#define PF_WIFI_RETRY_INTERVAL_MS 5000
#endif

// ── Improv-Serial Wi-Fi provisioning ─────────────────────────
// Lets the browser flasher (ESP Web Tools, behind the website's "Flash"
// button) set Wi-Fi over USB serial right after flashing, instead of baking
// credentials into the binary. The SSID/password are stored in NVS and used
// in preference to the placeholders above on the next boot. See
// src/core_improv.h. On by default; only compiled in when Wi-Fi is actually
// used (i.e. at least one of OTA/OSC/audio is enabled).
#ifndef PF_IMPROV_ENABLED
#define PF_IMPROV_ENABLED 1
#endif
// Firmware version string reported to the flasher (Improv device-info RPC).
// Keep in sync with web/public/flash/manifest.json.
#ifndef PF_IMPROV_FW_VERSION
#define PF_IMPROV_FW_VERSION "2.0.0"
#endif

// ── OTA (wireless flashing from Arduino IDE / espota.py) ─────
// On by default. Loop cost is one UDP poll per frame when idle.
#ifndef PF_OTA_ENABLED
#define PF_OTA_ENABLED 1
#endif
// mDNS hostname → reachable as "<hostname>.local". Change when running
// more than one device on the same network.
#ifndef PF_OTA_HOSTNAME
#define PF_OTA_HOSTNAME "patternflow"
#endif
// Upload password. Default "" = no authentication: the device never asks
// for a password, so espota.py / arduino-cli upload with zero friction.
//
// Arduino IDE 2.x is the exception — its network-upload dialog always
// prompts and refuses an empty field. With no-auth firmware the value is
// ignored by the device, so type any dummy character to get past it, or
// upload from the command line instead (see firmware/README.md).
#ifndef PF_OTA_PASSWORD
#define PF_OTA_PASSWORD ""
#endif

// ── OSC (Ableton/Max sidechannel) ────────────────────────────
// Off by default — opt in from patternflow_secrets.h. Sends knob/button/
// state out and accepts knob/pattern/content commands back.
#ifndef PF_OSC_ENABLED
#define PF_OSC_ENABLED 0
#endif
#ifndef PF_OSC_REMOTE_HOST
#define PF_OSC_REMOTE_HOST "192.168.0.10"
#endif
#ifndef PF_OSC_REMOTE_PORT
#define PF_OSC_REMOTE_PORT 9000
#endif
#ifndef PF_OSC_LOCAL_PORT
#define PF_OSC_LOCAL_PORT 9001
#endif

// ── Audio-react WebSocket server ─────────────────────────────
// Hosts a tiny UI on the device. A browser captures audio (file / tab /
// mic), runs an FFT, and pushes each band's energy as a normalized 0..1
// value over WebSocket. The input layer turns that into virtual knob
// deltas (applyAudioVirtualKnobs), so EVERY encoder-driven pattern reacts
// to audio with no per-pattern code.
#ifndef PF_AUDIO_ENABLED
#define PF_AUDIO_ENABLED 1
#endif
#ifndef PF_AUDIO_HTTP_PORT
#define PF_AUDIO_HTTP_PORT 80
#endif
#ifndef PF_AUDIO_WS_PORT
#define PF_AUDIO_WS_PORT 81
#endif
// How many knob clicks a full 0..1 audio swing maps to. Higher = stronger
// audio response. No per-frame clamp, so the value tracks without lag.
#ifndef PF_AUDIO_VIRTUAL_KNOB_SCALE
#define PF_AUDIO_VIRTUAL_KNOB_SCALE 48.0f
#endif
