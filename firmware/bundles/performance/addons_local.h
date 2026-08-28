// ═══════════════════════════════════════════════════════════
// Patternflow Performance — which features this edition carries
//
// Simone Majocchi's side of the project: the show player and its night/wake
// scheduler, the MQTT client in every role, FlowLocal and the Director inside
// it, and weather. He offered in #349 to co-own a bundle on this tree rather
// than keep a fork, and named this shape himself — a "Live / Performance"
// release with shows, MQTT and the Director together.
//
// **The composition is his to set.** This is the shape he described; nothing
// here is fixed by anyone else.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "weather/addon_weather.h"
#include "mqtt/addon_mqtt.h"
#include "show/addon_show.h"

// Dispatch order matters where features compete. The show player CLAIMS the
// pattern while a sequence runs, so it goes last - anything that only ASKS
// must get its turn first, or a remote picker never gets one at all.
#define PF_ADDON_LIST              \
  &PFAddonWeather::descriptor,     \
      &PFAddonMqtt::descriptor,    \
      &PFAddonShow::descriptor
