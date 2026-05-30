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
#define PF_OSC_ENABLED 0
#define PF_OSC_REMOTE_HOST "192.168.0.10"
#define PF_OSC_REMOTE_PORT 9000
// #define PF_OSC_LOCAL_PORT 9001

// ── Audio-react WebSocket ──
// On by default. Uncomment to disable.
// #define PF_AUDIO_ENABLED 0
