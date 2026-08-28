// ═══════════════════════════════════════════════════════════
// Patternflow MQTT — which features this edition carries
//
// MQTT is Simone Majocchi's work: the client in every role, FlowLocal, and
// the Director that lives inside it. He offered to co-own a bundle on this
// tree rather than keep a fork, and this is it.
//
// **The composition is the owner's to set.** This is a starting point, not a
// decision made for him: MQTT, plus OSC because it is the one remote control
// that needs no infrastructure at all and costs almost nothing to carry. If
// the show player belongs in here — and his own description of a
// "Live / Performance" release put shows, MQTT and Director together — it is
// two lines below, and his call to make.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "osc/addon_osc.h"
#include "mqtt/addon_mqtt.h"

// Dispatch order, and it matters where features compete: one that CLAIMS the
// pattern should come after ones that only ASK, or the asker never gets a
// turn. Nothing here claims, so this order is simply the useful one.
#define PF_ADDON_LIST          \
  &PFAddonOsc::descriptor,     \
      &PFAddonMqtt::descriptor

// To add the show player, uncomment both lines:
//
//   #include "show/addon_show.h"
//   &PFAddonShow::descriptor,   ← into the list above, BEFORE Mqtt
//
// The show player claims the pattern while a sequence runs, so it goes last
// in the list — after anything that only asks.
