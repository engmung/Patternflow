// ═══════════════════════════════════════════════════════════
// PatternFlow - the addon list
//
// THE one line a variant adds. Drop a directory under addons/, include its
// descriptor here, add it to the array — and nothing else in the tree
// changes, so pulling a core update stays a clean merge.
//
// Order is dispatch order.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "pf_addon.h"
#include "show/addon_show.h"
#include "weather/addon_weather.h"
#include "mqtt/addon_mqtt.h"

inline const PFAddon* const PF_ADDONS[] = {
    &PFAddonShow::descriptor,
    &PFAddonWeather::descriptor,
    &PFAddonMqtt::descriptor,
};

inline constexpr size_t PF_ADDON_COUNT = sizeof(PF_ADDONS) / sizeof(PF_ADDONS[0]);
