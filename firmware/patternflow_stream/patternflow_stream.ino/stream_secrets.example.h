#pragma once

// Copy this file to stream_secrets.h for local streaming tests.
// stream_secrets.h is ignored by git so Wi-Fi credentials are not committed.

#undef PF_STREAM_WIFI_SSID
#define PF_STREAM_WIFI_SSID "your-wifi-name"

#undef PF_STREAM_WIFI_PASS
#define PF_STREAM_WIFI_PASS "your-wifi-password"

// Only used when PF_WIFI_AP is selected instead of PF_WIFI_STA.
#undef PF_STREAM_AP_SSID
#define PF_STREAM_AP_SSID "PatternFlow"

#undef PF_STREAM_AP_PASS
#define PF_STREAM_AP_PASS "patternflow"
