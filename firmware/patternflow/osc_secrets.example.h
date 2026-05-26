#pragma once

// Copy this file to osc_secrets.h and fill in your Wi-Fi credentials.
// osc_secrets.h is ignored by git so credentials don't get committed.
//
// Wi-Fi here powers both ArduinoOTA (default ON — wireless flashing from
// the Arduino IDE) and OSC (default OFF — control sidechannel for
// Ableton/Max). You can use just OTA, just OSC, or both.

#undef PF_WIFI_SSID
#define PF_WIFI_SSID "your-wifi-name"

#undef PF_WIFI_PASS
#define PF_WIFI_PASS "your-wifi-password"

// --- OTA (wireless flashing) ---
// On by default. Set to 0 to compile OTA out entirely.
#undef PF_OTA_ENABLED
#define PF_OTA_ENABLED 1

// Optional: change the mDNS hostname (default "patternflow"). Useful
// when you have multiple devices on the same network.
// #undef PF_OTA_HOSTNAME
// #define PF_OTA_HOSTNAME "patternflow-studio"

// Optional: change the OTA upload password. Default is "patternflow".
// Set to "" to disable auth — works with the espota.py CLI but Arduino
// IDE 2.x will refuse to upload with an empty password field.
// #undef PF_OTA_PASSWORD
// #define PF_OTA_PASSWORD "your-secret-here"

// --- OSC (Ableton/Max sidechannel) ---
// Off by default. Set to 1 if you want OSC traffic.
#undef PF_OSC_ENABLED
#define PF_OSC_ENABLED 0

#undef PF_OSC_REMOTE_HOST
#define PF_OSC_REMOTE_HOST "192.168.0.10"

#undef PF_OSC_REMOTE_PORT
#define PF_OSC_REMOTE_PORT 9000
