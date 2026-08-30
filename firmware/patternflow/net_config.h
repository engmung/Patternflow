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
// (Wi-Fi placeholders, OTA on).
//
// These settings TUNE a feature; they do not decide whether it is in the
// build. PF_OSC_ENABLED sits inside features/osc/, so it is only read when the
// composition names the OSC descriptor — see features/features.h and
// docs/EDITIONS.md. A build with no features reads none of them.
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
#define PF_IMPROV_FW_VERSION "3.8.0"
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

// -- Show player (.pfs sequences, /show) ---------------------
// Declared here rather than inside core_show_http.h so anything can test
// it: /api/status builds its `caps` list from these flags, and a flag
// defined only inside the feature it guards is invisible to every file
// that does not include that feature.
#ifndef PF_SHOW_HTTP_ENABLED
#define PF_SHOW_HTTP_ENABLED 1
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
// deltas (applyLaneMotion), so EVERY encoder-driven pattern reacts
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
// How many knob clicks a full 0..1 swing on an absolute lane maps to. Higher
// = stronger response. No per-frame clamp, so the value tracks without lag.
//
// Not audio's, despite where it sits: the weather feature drives the same lanes
// and takes the same scale. The old name is kept below because a firmware
// built elsewhere may already set it in its overrides.h, and a rename that
// silently ignores somebody's setting is worse than an untidy header.
#ifndef PF_LANE_MOTION_SCALE
#ifdef PF_AUDIO_VIRTUAL_KNOB_SCALE
#define PF_LANE_MOTION_SCALE PF_AUDIO_VIRTUAL_KNOB_SCALE
#else
#define PF_LANE_MOTION_SCALE 48.0f
#endif
#endif

// ── MQTT (mirror one panel onto another, or into home automation) ──
// A second sidechannel next to OSC, aimed at brokers rather than DAWs:
// knob clicks and the pattern name go out as retained topics, and a panel
// set to Subscriber follows them. Two panels on one broker stay in sync;
// Home Assistant sees plain values on plain topics.
//
// The role (Off / Publisher / Subscriber) is chosen at runtime on /mqtt
// and kept in NVS — compiling this in does NOT make the device talk to
// anything. Nothing connects until a role is picked AND a broker host is
// set, so the default build is inert.
//
// Broker credentials belong in patternflow_secrets.h (gitignored), never
// here: this file ships in the repo and lands in every published .bin.
//
// This costs internal DRAM: ~600 B of statics, plus ~1.8 KB for the socket
// while a role is connected. That is worth knowing because the web console
// needs roughly 10 KB of internal heap free to send a page — below that it
// enters the truncated "starved send" state core_patterns_http.h describes.
//
// Measured on a 128x64 board, 2026-08-11 (free internal heap):
//
//     34 compiled-in presets              11,052   1 KB of margin
//       + MQTT, role off                   9,756   /patterns truncates
//       + MQTT connected                   7,972   /patterns returns nothing
//     Origin only, 47 modules on FATFS    16,648   /patterns in 0.55 s
//
// So the cost that mattered was never MQTT, it was the preset list: modules
// on FATFS take PSRAM slots and no internal heap at all (47 of them moved the
// figure by 0 bytes), while every compiled-in preset takes DRAM. With Origin
// as the only preset there is room for this and change to spare.

// ── Weather (OpenWeather current conditions / FlowLocal island) ────────
// Core fetches over HTTPS; /weather stores API key + location in NVS.
// The clock overlay and the night/wake schedule read local time from here;
// knob channels 1..4 can carry condition / temp / humidity / feels-like.
#ifndef PF_WEATHER_ENABLED
#define PF_WEATHER_ENABLED 1
#endif
#ifndef PF_WEATHER_HTTP_ENABLED
#define PF_WEATHER_HTTP_ENABLED PF_WEATHER_ENABLED
#endif
#ifndef PF_WEATHER_POLL_MS
#define PF_WEATHER_POLL_MS (30UL * 60UL * 1000UL)  // every 30 minutes
#endif
// Linear map for temp / feels-like -> knob 0..1 (metric C).
#ifndef PF_WEATHER_TEMP_MIN_C
#define PF_WEATHER_TEMP_MIN_C (-20.0f)
#endif
#ifndef PF_WEATHER_TEMP_MAX_C
#define PF_WEATHER_TEMP_MAX_C (40.0f)
#endif

#ifndef PF_MQTT_ENABLED
#define PF_MQTT_ENABLED 1
#endif
#ifndef PF_MQTT_HTTP_ENABLED
#define PF_MQTT_HTTP_ENABLED PF_MQTT_ENABLED
#endif
// Empty (the default) = no broker configured; the role picker says so and
// nothing is dialled. Set it in patternflow_secrets.h.
#ifndef PF_MQTT_HOST
#define PF_MQTT_HOST ""
#endif
#ifndef PF_MQTT_PORT
#define PF_MQTT_PORT 1883
#endif
// Empty user = connect anonymously (brokers on a trusted LAN often allow it).
#ifndef PF_MQTT_USER
#define PF_MQTT_USER ""
#endif
#ifndef PF_MQTT_PASS
#define PF_MQTT_PASS ""
#endif
// How long a banner published to <prefix>/message stays on the panel.
// Counted from each receipt, so a new message restarts it and a retained one
// shows once per connect rather than sticking forever.
#ifndef PF_MQTT_MESSAGE_DURATION_MS
#define PF_MQTT_MESSAGE_DURATION_MS 10000
#endif
// Topic root: <prefix>/knob/1..4, <prefix>/pattern, <prefix>/message and
// <prefix>/sleep (plus <prefix>/sleep/state outbound).
//
// A banner is a BROADCAST — every panel subscribed on this prefix shows it.
// That is the design, not a leak (@SimonePDA, who runs the shared broker):
// the topic list is fixed and short precisely so a broker can be locked to
// it, and a per-device topic like <prefix>/<id>/message would need a
// wildcard ACL, which is the thing that lets anyone invent topics. Broadcast
// is what a tight ACL costs, and for "tell the panels something" it is also
// what you want.
//
// <prefix>/sleep is a broadcast for the same reason and with the same reach:
// one "1" on the shared prefix puts EVERY panel on it to sleep. That is the
// right behaviour for a venue at the end of a night and the wrong one if you
// only meant your own device — which is what the per-panel prefix below is
// for. Send it non-retained unless you genuinely want panels to come back
// asleep after every reconnect.
//
// Give each panel its own prefix when several share a broker and should NOT
// mirror each other.
#ifndef PF_MQTT_PREFIX
#define PF_MQTT_PREFIX "patternflow"
#endif
