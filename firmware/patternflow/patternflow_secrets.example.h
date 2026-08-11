#pragma once
// ═══════════════════════════════════════════════════════════
// PatternFlow - per-device secrets & feature toggles (TEMPLATE)
//
// Copy this file to patternflow_secrets.h and fill in your values.
// patternflow_secrets.h is gitignored so credentials never get committed.
//
// net_config.h includes the real file BEFORE applying its own defaults,
// so you only need to #define what you want to change — leave a line out
// to accept the default shown in net_config.h.
// ═══════════════════════════════════════════════════════════

// ── Wi-Fi (shared by OTA, OSC, and audio-react) ──
// Required for any network feature. ESP32 is 2.4 GHz only.
#define PF_WIFI_SSID "your-wifi-name"
#define PF_WIFI_PASS "your-wifi-password"

// ── OTA (wireless flashing) ──
// On by default. Set to 0 to compile OTA out entirely.
#define PF_OTA_ENABLED 1
// Optional: change the mDNS hostname (default "patternflow"). Useful with
// more than one device on the same network.
// #define PF_OTA_HOSTNAME "patternflow-studio"
// Optional: set an upload password. Default is "" (no authentication), so
// espota.py / arduino-cli upload with no prompt. Set a value here to lock
// down a device on a shared network.
// #define PF_OTA_PASSWORD "your-secret"

// ── OSC (Ableton/Max sidechannel) ──
// Off by default. Set to 1 to send/receive OSC.
#define PF_OSC_ENABLED 1
// Remote host is normally LEARNED automatically: leave this line commented
// out and let the M4L bridge (or any host) send /patternflow/ping — the
// device replies to wherever the ping came from. Only set a static IP for
// send-only setups where the host never sends anything back.
// #define PF_OSC_REMOTE_HOST "192.168.0.10"
// #define PF_OSC_REMOTE_PORT 9000
// #define PF_OSC_LOCAL_PORT 9001

// ── Audio-react WebSocket ──
// On by default. Uncomment to disable.
// #define PF_AUDIO_ENABLED 0

// ── MQTT (panel-to-panel sync / home automation) ──
// Compiled in by default but inert: the role (Off / Publisher / Subscriber)
// is chosen at http://<device-ip>/mqtt, and nothing is dialled until a broker
// host is set here. It does cost internal heap while connected — see the
// measurements in net_config.h if you also compile presets back in.
// #define PF_MQTT_HOST "broker.example.lan"
// #define PF_MQTT_PORT 1883
// #define PF_MQTT_USER "patternflow"
// #define PF_MQTT_PASS "your-broker-password"
// Topic root — <prefix>/knob/1..4 and <prefix>/pattern. Give each panel its
// own prefix when several share a broker and should not mirror each other.
// #define PF_MQTT_PREFIX "patternflow"
