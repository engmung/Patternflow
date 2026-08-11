// ═══════════════════════════════════════════════════════════
// PatternFlow - Network feature configuration
//
// One place for everything Wi-Fi touches: the shared Wi-Fi connection
// and the features that ride on it — OTA (wireless flashing), OSC
// (Ableton/Max sidechannel), the audio-react WebSocket server, and the
// browser self-update page.
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
// Maximum Wi-Fi transmit power, applied in core_wifi.h right after the join.
// The ESP32 default is WIFI_POWER_19_5dBm — the maximum — which with the
// WROOM-1 antenna's gain can sit at or over the EU 20 dBm EIRP limit, so a
// conformance failure on output power / EIRP is fixed here.
//
// ⚠️ Take the number from the test report, not from a guess. 13 dBm is a
// 6.5 dB cut from the default: uplink power drops ~4.5x and indoor range to
// very roughly 60%. Only the device→router direction is affected, so the
// RSSI reported by /status will NOT move — that is the downlink. If range
// regresses, WIFI_POWER_17dBm is the smaller first step.
//
// Valid values (WiFiGeneric.h): WIFI_POWER_19_5dBm, _19dBm, _18_5dBm,
// _17dBm, _15dBm, _13dBm, _11dBm, _8_5dBm, _7dBm, _5dBm, _2dBm.
//
// (This is the RADIO test — for EMC, see the note in core_display.h; Wi-Fi
// power is almost irrelevant there.)
#ifndef PF_WIFI_TX_POWER
#define PF_WIFI_TX_POWER WIFI_POWER_13dBm
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
#define PF_IMPROV_FW_VERSION "3.3.0"
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

// ── Browser self-update (drop a .bin onto patternflow.local/update) ──
// The device serves an update page over plain LAN HTTP; dropping a firmware
// .bin there flashes it via Update.h and reboots (issue #232). No TLS, no
// certificates — the browser fetches the build over HTTPS, the device only
// sees a same-origin LAN upload. The POST endpoint only accepts firmware
// while the UPDATE screen is open on the device (hold K2 → NETWORK, turn
// K4), so nobody on the Wi-Fi can reflash a device that is just sitting
// there. Shares the audio-react HTTP server (port 80) when that is enabled;
// otherwise runs its own. Uses PF_OTA_HOSTNAME for the .local name.
#ifndef PF_WEBUPDATE_ENABLED
#define PF_WEBUPDATE_ENABLED 1
#endif
// With 1 (the default) /update accepts firmware at any time — drop a .bin
// whenever, no trip to the device. The tradeoff, stated plainly: anyone on
// the same Wi-Fi can flash the device from a phone browser. That is the
// same exposure ArduinoOTA's no-password default already has, and on a
// home/studio network it is the right UX call. Set 0 on shared, office, or
// exhibition Wi-Fi: uploads are then refused unless the UPDATE screen is
// open on the device (hold K2 → NETWORK, turn K4) — a physical arming
// switch only someone at the device can flip.
#ifndef PF_WEBUPDATE_ALWAYS_ARMED
#define PF_WEBUPDATE_ALWAYS_ARMED 1
#endif

// ── OSC (Ableton/Max sidechannel) ────────────────────────────
// Sends knob/button/state out and accepts knob/pattern/content commands back.
//
// On by default so that a build from a clean checkout matches the firmware we
// release. It used to be opt-in from patternflow_secrets.h, but that file is
// gitignored — so anyone building without one (a fresh clone, CI, the web
// build service) silently got firmware with OSC missing, showing "OSC n/a" on
// the knob-2 status screen while everything else looked right.
//
// Costs nothing when unused: with no remote configured it only listens, and
// sends nothing until something talks to it first. Set to 0 in
// patternflow_secrets.h to compile it out.
#ifndef PF_OSC_ENABLED
#define PF_OSC_ENABLED 1
#endif
// Where outgoing OSC goes. Leave EMPTY (the default) to auto-learn: the
// device locks onto whoever sends it the first valid OSC packet — the M4L
// bridge's Connect button (/patternflow/ping) does exactly that. Set a
// static IP here only if the host side can't send ("send-only" setups).
#ifndef PF_OSC_REMOTE_HOST
#define PF_OSC_REMOTE_HOST ""
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
