// ═══════════════════════════════════════════════════════════
// Patternflow Audio — settings this firmware changes.
//
// The core includes this from config.h before anything has a default, so
// every `#ifndef`-guarded value in config.h and net_config.h can be set here.
// No core file is edited; build.sh copies this in beside features_local.h.
//
// Keep this list short and keep the reasons attached to it. A setting with no
// stated reason is one nobody can safely change back.
// ═══════════════════════════════════════════════════════════
#pragma once

// ── Wi-Fi transmit power ────────────────────────────────────────────────
//
// Core ships 13 dBm and that is NOT a conservative default — it is a
// conformance fix. The comment where it is set says why: the ESP32's own
// default of 19.5 dBm, plus the WROOM-1 antenna's gain, can sit at or over
// the EU's 20 dBm EIRP limit.
//
// This firmware is for performing: a venue, a booth, a room full of
// competing access points, twenty metres of it between the panel and
// whatever laptop is running Ableton. 13 dBm is chosen for a desk.
//
// 17 dBm is +4 dB, so roughly 2.5x the uplink power, and it is the step the
// core's own comment names as the first one to try. Note that only the
// device→router direction changes: the RSSI on /status is the downlink and
// will not move, so do not use it to judge whether this helped.
//
// **19.5 dBm is deliberately not used here.** It is the maximum the radio
// offers and it is the value an outside report once proposed; the
// investigation that looked at it declined, on the grounds above. Raising
// this to WIFI_POWER_19_5dBm is one word away and whoever does it owns the
// EIRP question that comes with it — including that a firmware published by
// the same person who made the hardware does not read as third-party to
// anybody checking.
#define PF_WIFI_TX_POWER WIFI_POWER_17dBm

// ── What this firmware calls itself ─────────────────────────────────────
//
// Reported at /api/status and worn as a badge in the console header on every
// page, linking to this variant's entry on the shelf. Without it a panel
// running this claims to be core, which is the one thing a variant must
// never do: somebody who did not flash it has no other way to find out what
// is on it, and the update banner would offer them a core release on top.
// This define IS the version — shelf.sh's argument only names the folder.
// v0.4.0 shipped still believing it was v0.3.1 because nothing tied the two
// together; shelf.sh now refuses an image that does not contain its version.
#define PF_VARIANT "audio"
#define PF_VARIANT_VERSION "v0.5.2"

// ── The on-board microphone drives the knobs ────────────────────────────
//
// audio_in defaults this off, because it was written as a cost measurement
// before any microphone existed and a measurement should cost a normal build
// nothing. There is a microphone now - a PDM MEMS part on GPIO43/44, the only
// two free header pins - and this is the edition it is for.
//
// It yields to the browser audio path on any lane that path has claimed, and
// both yield to a hand on the encoder.
#define PF_AUDIO_IN_DRIVES_KNOBS 1

