"""Constants for the Patternflow integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "patternflow"

# The device answers to this out of the box. Anyone running two boards has to
# give each a distinct PF_OTA_HOSTNAME anyway — mDNS cannot resolve the same
# name to two addresses — so this is both the default and the assumption.
DEFAULT_HOST: Final = "patternflow.local"

# Seconds between polls. The device's web server takes ONE connection and its
# render loop is paused while a response is being sent, so this is not a knob to
# turn down for a livelier dashboard. See docs/rest-api.md, "Rules that will
# bite you"; a device-streamed preview at high poll rates is what got the
# /api/frame endpoint removed on the day it shipped.
DEFAULT_SCAN_INTERVAL: Final = 10
MIN_SCAN_INTERVAL: Final = 5
MAX_SCAN_INTERVAL: Final = 60

CONF_SCAN_INTERVAL: Final = "scan_interval"
CONF_ENABLE_KNOBS: Final = "enable_knobs"

# The pattern list only changes when somebody installs or deletes a module, so
# it rides along every Nth tick instead of every one. A select() also refreshes
# it out of band, which is the case that actually matters.
PATTERNS_EVERY_N_TICKS: Final = 6

# One HTTP request budget. Five seconds is generous for a LAN device answering
# from PROGMEM, and stingy enough that a wedged socket does not stall the
# coordinator for a whole poll interval.
REQUEST_TIMEOUT: Final = 5.0

# How long a locally-set value outranks what the device reports. POST /api/sleep
# only *queues* the transition — loop() performs it — so the reply and the next
# poll can still carry the old state. Without this the switch visibly snaps back
# under the cursor, which is exactly what the device's own console page works
# around by suppressing its poll for 1.5 s.
OPTIMISTIC_WINDOW: Final = 2.5

# Endpoints. Only /api/* appears here on purpose: fetching an HTML console page
# (/, /status, /patterns, /wifi, /mqtt) evicts the running pattern module to
# free internal DRAM and leaves the panel dark for 25 s. An automated client
# must never touch those.
API_STATUS: Final = "/api/status"
API_SLEEP: Final = "/api/sleep"
API_PATTERNS: Final = "/api/patterns"
API_PATTERNS_SELECT: Final = "/api/patterns/select"
API_PATTERNS_FILE: Final = "/api/patterns/file"
API_MQTT: Final = "/api/mqtt"

MANUFACTURER: Final = "Patternflow"

#: Where the dashboard card and the pattern sandbox are served from. Add
#: "<this>/patternflow-card.js" as a Lovelace resource (module).
STATIC_URL: Final = "/patternflow_static"

# ── Knobs ────────────────────────────────────────────────────────────────
#
# Reading them is HTTP (see api.py: /api/mqtt reports positions in any role).
# Writing them is MQTT only — the HTTP API has no knob endpoint, and the two
# that existed were removed as unused.

#: Absolute parameter bus, `<prefix>/param/1..4`. Wire scale is 0..1000.
PARAM_SCALE: Final = 1000

# Detents across a parameter's entire declared range.
#
# Mirrors web/src/lib/patternflowControls.ts, which is the source of truth for
# both halves of this: ENCODER_CLICKS_PER_TURN = 24 (the reference Bourns
# PEC11R encoder) and TURNS_PER_FULL_RANGE = 2. A pattern converted by the
# repo's own toolchain gets a step constant derived from exactly these numbers,
# so 48 detents crossing 0 to 100% is the same feel as two turns of the physical
# knob. A hand-written pattern with its own step will differ, which is why the
# delta path is documented as relative rather than absolute.
ENCODER_CLICKS_PER_TURN: Final = 24
TURNS_PER_FULL_RANGE: Final = 2
DETENTS_PER_RANGE: Final = ENCODER_CLICKS_PER_TURN * TURNS_PER_FULL_RANGE

#: The MQTT role in which the device obeys knob, param and pattern topics.
#: Sleep and message are obeyed in any role; these three are not.
ROLE_SUBSCRIBER: Final = "subscriber"

#: The channel whose prefix is plain `patternflow`, and the only one without a
#: retained snapshot bus. See SHOW_CHANNELS.
CHANNEL_BROADCAST: Final = "broadcast"

# Channels 1-4 and Live carry a *retained* `<prefix>/snapshot` holding
# `param:[a,b,c,d]`, which the firmware applies straight onto the knobs — and a
# Publisher on the channel re-sends one every 8 s. A knob set from Home
# Assistant is therefore overwritten by whatever that snapshot last said, which
# reads as a slider that will not stay put. Broadcast has no snapshot
# subscription at all, which is why it is the channel to be on for this.
SHOW_CHANNELS: Final = frozenset({"ch1", "ch2", "ch3", "ch4", "live"})

# How close a device-reported value has to be to the one we wrote before it
# counts as confirmation. The wire scale is 0..1000 against a 0..100 percentage,
# so anything that round-trips lands well inside this.
KNOB_CONFIRM_TOLERANCE: Final = 0.6

# Give up waiting for confirmation after this many poll intervals, and show
# what the device says instead. Only reached when a write did not land.
KNOB_CONFIRM_INTERVALS: Final = 3
