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
// Nothing is set here: this edition transmits at the core's power
// (net_config.h, 19.5 dBm since 3.10.5). It used to pin 17 dBm, which was a
// raise while the core shipped 13 and became a cut when the core went to full
// power; from v0.7.0 it follows the core.

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
#define PF_VARIANT_VERSION "v0.7.1"

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

