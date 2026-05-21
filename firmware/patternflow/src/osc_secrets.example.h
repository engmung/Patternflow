#pragma once

// Copy this file to osc_secrets.h for local OSC testing.
// osc_secrets.h is ignored by git so Wi-Fi credentials do not get committed.

#undef PF_OSC_ENABLED
#define PF_OSC_ENABLED 1

#undef PF_WIFI_SSID
#define PF_WIFI_SSID "your-wifi-name"

#undef PF_WIFI_PASS
#define PF_WIFI_PASS "your-wifi-password"

#undef PF_OSC_REMOTE_HOST
#define PF_OSC_REMOTE_HOST "192.168.0.10"

#undef PF_OSC_REMOTE_PORT
#define PF_OSC_REMOTE_PORT 9000
