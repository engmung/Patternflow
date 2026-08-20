"""Turning the knobs, which is the one thing HTTP cannot do.

Reading knob state is HTTP and always works. Writing is MQTT, needs the device
in Subscriber role, and comes in two flavours that behave very differently.

**Absolute** — `<prefix>/param/1..4`, 0..1000. A pattern built against
`PFParams` pins the mapped parameter to that fraction of its declared range and
*holds* it there until a physical encoder turn releases it. Idempotent, closed
loop: `/api/mqtt` reports the held value back, so what Home Assistant shows is
what the device is doing. This is the good path.

**Delta** — `<prefix>/knob/1..4`, an absolute click count the device diffs
against the last value it received, injecting the difference as detents. Every
pattern built before the absolute bus existed needs this, and so does every
preset, because a preset's `ABSOLUTE_READY` flag lives in C++ where no endpoint
exposes it.

The delta path is **open loop, and it cannot be made otherwise**. The count in
`/api/mqtt` is the physical encoder counter: the firmware computes
`knobDeltas` from it, and only *then* adds remote deltas on top, so an injected
turn never appears there. Nothing reads back. Worse, the device clears its
"last value received" state on every MQTT reconnect and role change, after
which the next publish is diffed against the physical counter again — so this
module tracks what it has sent and reseeds from the physical count whenever the
device's connection returns, or one reconnect would land as a single enormous
jump.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from .const import DETENTS_PER_RANGE, PARAM_SCALE, ROLE_SUBSCRIBER, SHOW_CHANNELS

if TYPE_CHECKING:
    # Type-only, so the arithmetic in this module — the part most worth
    # testing and easiest to get wrong — runs on a bare interpreter.
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


class KnobWriteUnavailable(Exception):
    """The MQTT path is not usable, with a reason worth showing a person."""


def percent_to_param(percent: float) -> int:
    """Convert a 0 to 100 percentage to the 0..1000 absolute wire scale."""
    return max(0, min(PARAM_SCALE, round(percent * PARAM_SCALE / 100)))


def param_to_percent(value: Any) -> float | None:
    """Convert a 0..1000 absolute value back to a percentage."""
    if not isinstance(value, (int, float)):
        return None
    return round(max(0, min(PARAM_SCALE, value)) * 100 / PARAM_SCALE, 1)


def percent_delta_to_detents(from_percent: float, to_percent: float) -> int:
    """Detents that move a parameter from one percentage of its range to another.

    48 detents cross the whole range, so one percent is a little under half a
    detent. Prefer `detents_with_residual` for anything a person drives: this
    one throws the remainder away.
    """
    return round((to_percent - from_percent) * DETENTS_PER_RANGE / 100)


def detents_with_residual(
    from_percent: float, to_percent: float, residual: float
) -> tuple[int, float]:
    """Detents to send, and the sub-detent remainder to carry into the next call.

    There is no such thing as half a click, and 48 detents cross a whole range —
    so a one-percent nudge is 0.48 of a detent and rounds to nothing. Without
    carrying the remainder, every small movement is silently discarded and the
    slider feels dead until it is dragged hard. Two one-percent steps now add up
    to a click instead of vanishing twice.

    The firmware carries a residual through its own audio path for exactly this
    reason; this is the same idea on the other side of the wire.
    """
    wanted = (to_percent - from_percent) + residual
    detents = round(wanted * DETENTS_PER_RANGE / 100)
    remainder = wanted - detents * 100 / DETENTS_PER_RANGE
    return detents, remainder


def is_writable(mqtt_state: dict[str, Any] | None) -> bool:
    """Return True when the device would obey a knob or param topic now."""
    if not mqtt_state:
        return False
    return bool(mqtt_state.get("connected")) and mqtt_state.get("role") == ROLE_SUBSCRIBER


def unavailable_reason(mqtt_state: dict[str, Any] | None) -> str | None:
    """Why a knob write would not land, or None when it would.

    Separate from `is_writable` because "no broker" and "wrong role" need
    different things done about them, and a message that says which is the
    difference between a two-minute fix and an evening.
    """
    if mqtt_state is None:
        return "mqtt_compiled_out"
    if not mqtt_state.get("configured"):
        return "no_broker"
    if mqtt_state.get("role") != ROLE_SUBSCRIBER:
        return "not_subscriber"
    if not mqtt_state.get("connected"):
        return "broker_unreachable"
    return None


def fights_snapshot(mqtt_state: dict[str, Any] | None) -> bool:
    """Return True when the channel will overwrite what Home Assistant sets.

    Channels 1-4 and Live subscribe to a **retained** `<prefix>/snapshot` that
    carries `param:[a,b,c,d]`, and the firmware applies those straight onto the
    knobs. A Publisher on the same channel re-sends one every 8 seconds. So a
    knob set from here is quietly reverted to whatever that snapshot last said,
    which reads as a slider that will not stay where it is put — a write that
    succeeds and then undoes itself, with nothing anywhere reporting an error.

    Broadcast (`patternflow`) has no snapshot subscription at all. It is the
    channel to be on for this, and saying so is cheaper than letting somebody
    find it the hard way.
    """
    if not mqtt_state:
        return False
    return str(mqtt_state.get("channel", "")) in SHOW_CHANNELS


class KnobWriter:
    """Publishes knob changes for one device.

    Owns the running remote count per knob that the delta path needs, and the
    reseed logic that keeps a device reconnect from landing as a jump.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        """Start with nothing sent and no connection seen."""
        self._hass = hass
        #: Our own running value for `<prefix>/knob/N`. None until first use or
        #: after a reseed; the device diffs against its physical counter then.
        self._sent: list[int | None] = [None, None, None, None]
        self._was_connected = False

    def note_connection(self, mqtt_state: dict[str, Any] | None) -> None:
        """Watch the device's broker connection and reseed on a reconnect.

        The firmware's `resetSessionState()` clears its per-knob "last value
        received" on every connect and on every role change. Our running count
        is meaningless across that boundary: the next publish would be diffed
        against the physical encoder counter instead, and the difference — the
        whole history of what we have sent — would arrive as one turn.
        """
        connected = bool(mqtt_state and mqtt_state.get("connected"))
        if connected and not self._was_connected:
            self._sent = [None, None, None, None]
            _LOGGER.debug("Device MQTT reconnected; reseeding knob counts")
        self._was_connected = connected

    async def async_set_absolute(self, prefix: str, index: int, percent: float) -> None:
        """Pin knob `index` (0-based) to a percentage of its range."""
        await self._publish(f"{prefix}/param/{index + 1}", str(percent_to_param(percent)))

    async def async_release_absolute(self, prefix: str, index: int) -> None:
        """Let go of an absolute hold, handing the knob back to the encoder.

        An empty payload is the release; the firmware treats it as "stop
        holding" rather than as zero.
        """
        await self._publish(f"{prefix}/param/{index + 1}", "")

    async def async_nudge(self, prefix: str, index: int, detents: int, physical_count: int) -> None:
        """Turn knob `index` by `detents`, relative to wherever it is.

        `physical_count` is the device's current encoder counter from
        `/api/mqtt`. It seeds the running value on the first publish after a
        connect, because that is exactly what the firmware will diff against.
        """
        if detents == 0:
            return

        base = self._sent[index]
        if base is None:
            base = physical_count
        target = base + detents

        await self._publish(f"{prefix}/knob/{index + 1}", str(target))
        self._sent[index] = target

    async def _publish(self, topic: str, payload: str) -> None:
        """Publish one non-retained message, or explain why we cannot.

        Never retained. A retained knob value would be replayed at every
        reconnect, so a panel would come back to whatever Home Assistant last
        said instead of to what it was doing — the same reason the firmware
        publishes its own knob topics non-retained.
        """
        try:
            from homeassistant.components import mqtt
        except ImportError as err:  # pragma: no cover - MQTT ships with HA
            raise KnobWriteUnavailable("mqtt_not_set_up") from err

        if not self._hass.config_entries.async_entries("mqtt"):
            raise KnobWriteUnavailable("mqtt_not_set_up")

        try:
            await mqtt.async_publish(self._hass, topic, payload, qos=0, retain=False)
        except Exception as err:
            raise KnobWriteUnavailable("mqtt_publish_failed") from err

        _LOGGER.debug("Published %s to %s", payload or "<release>", topic)
