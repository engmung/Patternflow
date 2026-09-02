// ═══════════════════════════════════════════════════════════
// PatternFlow - Bluetooth LE setup, as a feature
//
// Wi-Fi provisioning from a phone over Improv-BLE (core_ble_improv.h). It
// attaches through five hooks and edits nothing:
//
//   setup        - read the runtime switch
//   loop         - the whole radio lifecycle: when to advertise, drain the
//                  GATT mailbox, drive the Improv state machine, and hand
//                  the controller's memory back when the job is done
//   onNetwork    - /api/ble
//   onUserInput  - a touch on the panel is the Improv "authorization"
//   appendStatus - what the radio is doing, for /api/status
//
// The NETWORK screen row (BLE on/off) is the one switch a person needs at the
// panel: off means the radio never starts, and the setting survives reboots.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../pf_feature.h"
#include "core_ble_http.h"
#include "core_ble_improv.h"

namespace PFFeatureBle {

inline void setup() { PatternflowBle::loadSettings(); }

inline void onNetwork() { PatternflowBleHttp::begin(); }

inline void loop(const PFFeatureFrame&) { PatternflowBle::tick(); }

inline void onUserInput() { PatternflowBle::onUserInput(); }

inline bool isRuntimeEnabled() { return PatternflowBle::runtimeEnabled; }
inline void setRuntimeEnabled(bool on) { PatternflowBle::setRuntimeEnabled(on); }

inline void appendStatus(String& json) { PatternflowBle::appendStatus(json); }

inline const PFFeature descriptor = {
    "ble",
    "ble",         // cap - the site's setup page probes for this
    setup,
    onNetwork,
    loop,
    nullptr,       // observeFrame
    nullptr,       // fillInput
    onUserInput,
    nullptr,       // claimsPattern
    nullptr,       // takePattern
    nullptr,       // onSleep
    nullptr,       // requestSleep
    "BLE",         // shortName - the NETWORK screen row
    isRuntimeEnabled,
    setRuntimeEnabled,
    appendStatus,
    nullptr,       // drawOverlay
    nullptr,       // navPath - no console page
    nullptr,       // navLabel
    nullptr,       // navDesc
};

}  // namespace PFFeatureBle
