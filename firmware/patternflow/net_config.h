// ═══════════════════════════════════════════════════════════
// PatternFlow - Network configuration (core)
//
// Everything the DEVICE needs to be on a network: the shared Wi-Fi
// connection, Improv provisioning, its own name and version, OTA, the
// browser self-update page, and the scale of the absolute bus.
//
// Nothing here belongs to a feature. Each feature's tunables — OSC ports,
// the audio WebSocket port, MQTT broker settings, weather polling — live in
// features/<name>/<name>_config.h, next to the code that reads them, and are
// only compiled when a composition carries that feature. Until 2026-09 they
// sat in this file, which made a core header 40 % feature settings and gave
// every flag two places to be defaulted.
//
// Per-device secrets and toggles live in patternflow_secrets.h (gitignored).
// That file is included FIRST below, so anything it #defines wins; the
// #ifndef blocks here — and in every feature's config header — only fill in
// defaults for whatever it left unset. No #undef gymnastics required: leave a
// line out of the secrets file to accept the default.
//
// Copy patternflow_secrets.example.h to patternflow_secrets.h to start.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// Per-device overrides first. Without this file every default below applies
// (Wi-Fi placeholders, OTA on).
//
// A feature's settings TUNE it; they never decide whether it is in the build.
// That is the composition's job — see features/features.h and docs/EDITIONS.md.
#if __has_include("patternflow_secrets.h")
#include "patternflow_secrets.h"
#endif

// ── Wi-Fi ────────────────────────────────────────────────────────────
// Whether the panel has a radio at all. 0 makes a USB-only instrument:
// everything network-side (console, OTA, every feature that dials out)
// compiles out behind PF_WIFI_NEEDED in core_wifi.h.
#ifndef PF_WIFI_ENABLED
#define PF_WIFI_ENABLED 1
#endif

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
#define PF_IMPROV_FW_VERSION "3.9.4"
#endif

// ── Variant identity (RFC: docs/rfc-core-and-variants.md) ────
// Which firmware this is. "core" is the maintained ground; a variant
// overrides this with its own name ("simone-pd", "radio", "iot"), and that
// string is what /api/status reports, what the site's variant list matches,
// and what stops the console's update banner from offering a core build on
// top of somebody's chosen firmware.
//
// A variant sets it from its own header rather than editing this file, so
// its diff against the core stays additions-only:
//   -DPF_VARIANT='"simone-pd"'   or   #define PF_VARIANT "simone-pd"
#ifndef PF_VARIANT
#define PF_VARIANT "core"
#endif

// A variant's own release, separate from the core version it is built on.
// Both matter and they answer different questions: the variant version is
// what somebody downloaded, the core version is what it was built against,
// and a support conversation needs both. Empty on core, where the core
// version already is the answer.
//
// RFC §2.6 rule 3 asked for this and only the name half was ever built,
// so a variant reported its identity and then core's version number
// beside it — which reads as a claim to be core.
#ifndef PF_VARIANT_VERSION
#define PF_VARIANT_VERSION ""
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

// ── The absolute lanes (core) ────────────────────────────────
// Any feature may push a normalized 0..1 value onto one of the four lanes
// (audio bands, weather channels, a show) and the core's input layer turns
// it into virtual knob deltas (applyLaneMotion), so EVERY encoder-driven
// pattern reacts with no per-pattern code. This is how many knob clicks a
// full 0..1 swing maps to. Higher = stronger response. No per-frame clamp,
// so the value tracks without lag.
//
// The old name is honoured below because a firmware built elsewhere may
// already set it in its overrides.h, and a rename that silently ignores
// somebody's setting is worse than an untidy header.
#ifndef PF_LANE_MOTION_SCALE
#ifdef PF_AUDIO_VIRTUAL_KNOB_SCALE
#define PF_LANE_MOTION_SCALE PF_AUDIO_VIRTUAL_KNOB_SCALE
#else
#define PF_LANE_MOTION_SCALE 48.0f
#endif
#endif
