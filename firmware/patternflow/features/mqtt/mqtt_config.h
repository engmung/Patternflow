// ═══════════════════════════════════════════════════════════
// PatternFlow - MQTT feature: compile-time defaults
//
// Read only when a composition carries features/mqtt/. Every value is
// #ifndef-guarded: patternflow_secrets.h (per device) and a composition's
// overrides.h (per edition) are included before this through config.h, so
// whatever they define wins and the lines below fill in the rest.
//
// These lived in net_config.h until 2026-09; a feature's settings belong next
// to the feature that reads them.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "../../config.h"

// A second sidechannel next to OSC, aimed at brokers rather than DAWs:
// knob clicks and the pattern name go out as retained topics, and a panel
// set to Subscriber follows them. Two panels on one broker stay in sync;
// Home Assistant sees plain values on plain topics.
//
// The role (Off / Publisher / Subscriber) is chosen at runtime on /mqtt
// and kept in NVS — compiling this in does NOT make the device talk to
// anything. Nothing connects until a role is picked AND a broker host is
// set, so an edition that carries MQTT is inert until told otherwise.
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
