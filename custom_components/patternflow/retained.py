"""Watching for retained messages that quietly fight the panel.

A retained MQTT message is redelivered every time somebody subscribes. The
panel resubscribes on every reconnect and on every role change — so a retained
message on one of its own command topics is not a one-off, it is a command
re-issued forever.

What that looks like from the sofa:

`<prefix>/pattern` — the panel reloads the module and the pattern restarts
from its first frame. There is no "already running" check in the firmware, so
even a message naming the pattern that is *already* playing costs a full
filesystem read and relocation. A pattern that has been running for minutes
stutters and starts over, at whatever interval the broker connection happens to
drop and come back.

`<prefix>/param/N` and `<prefix>/knob/N` — the knobs snap back to whatever the
retained value says.

None of it produces an error anywhere. The panel is doing exactly what it was
told, by something nobody remembers sending.

Today's firmware publishes these non-retained (`retainLeafTopic()` returns
false), so it does not create the problem. Earlier firmware did — the retention
policy changed — and a retained message outlives the firmware that wrote it,
sitting on the broker until somebody explicitly clears it. Which is why this
watches rather than assumes.

Deliberately not watched: `<prefix>/snapshot`. That one is retained *by design*
on channels 1-4 and Live, and flagging it would mean crying wolf at a correctly
configured show setup. The channel itself is warned about separately — see
`knobs.fights_snapshot`.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from .const import RETAINED_ISSUE, ROLE_SUBSCRIBER

if TYPE_CHECKING:
    from collections.abc import Callable

    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def issue_id(unique_id: str) -> str:
    """Return the repair issue id for one device, so two panels differ."""
    return f"{RETAINED_ISSUE}_{unique_id}"


def watched_topics(prefix: str) -> list[str]:
    """Return the device's own command topics, as subscription patterns.

    Wildcards on this side only — the panel subscribes to the four exact knob
    and param topics, but for spotting a retained one a single `+` is the same
    thing with less bookkeeping.
    """
    return [f"{prefix}/pattern", f"{prefix}/knob/+", f"{prefix}/param/+"]


class RetainedWatcher:
    """Records retained messages found on one device's command topics."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Start with nothing subscribed and nothing found."""
        self._hass = hass
        self._unsubscribes: list[Callable[[], None]] = []
        self._prefix: str | None = None
        #: topic → the retained payload sitting on the broker.
        self.found: dict[str, str] = {}

    @property
    def prefix(self) -> str | None:
        """The prefix currently being watched, if any."""
        return self._prefix

    async def async_watch(self, prefix: str) -> None:
        """Subscribe to one prefix's command topics. Re-subscribes on a change.

        The subscription itself is what surfaces anything: the broker delivers
        every retained message the moment it is made, which is the same instant
        the panel would have received it.
        """
        if prefix == self._prefix:
            return
        await self.async_stop()

        if not self._hass.config_entries.async_entries("mqtt"):
            return

        try:
            from homeassistant.components import mqtt
        except ImportError:  # pragma: no cover - MQTT ships with HA
            return

        for topic in watched_topics(prefix):
            try:
                self._unsubscribes.append(
                    await mqtt.async_subscribe(self._hass, topic, self._on_message, qos=0)
                )
            except Exception as err:
                _LOGGER.debug("Could not watch %s: %s", topic, err)

        self._prefix = prefix if self._unsubscribes else None

    async def async_stop(self) -> None:
        """Drop every subscription and forget what was found."""
        for unsubscribe in self._unsubscribes:
            unsubscribe()
        self._unsubscribes = []
        self._prefix = None
        self.found = {}

    def _on_message(self, message: Any) -> None:
        """Record a retained message; ignore live traffic entirely.

        Live messages on these topics are ordinary operation — another panel
        publishing, a script, or this integration's own knob writes, all of
        which are non-retained. Only the retained ones come back by themselves.
        """
        if not getattr(message, "retain", False):
            # A retained message that has since been cleared arrives as an
            # empty, non-retained one on some brokers; either way, anything
            # non-retained means this topic is no longer a standing order.
            self.found.pop(getattr(message, "topic", ""), None)
            return

        payload = getattr(message, "payload", "")
        topic = getattr(message, "topic", "")
        if not topic:
            return

        # An empty retained payload IS the cleared state — that is how one is
        # deleted — so it is not a finding.
        if payload in (None, "", b""):
            self.found.pop(topic, None)
            return

        if self.found.get(topic) != payload:
            _LOGGER.debug("Retained message on %s: %r", topic, payload)
        self.found[topic] = str(payload)

    def bites(self, mqtt_state: dict[str, Any] | None) -> bool:
        """Return True when what was found will actually reach the panel.

        Only a Subscriber obeys these topics. A retained message on a Publisher
        panel's prefix is inert — real, and worth nothing to shout about, since
        the panel ignores it.
        """
        if not self.found:
            return False
        return bool(mqtt_state) and mqtt_state.get("role") == ROLE_SUBSCRIBER

    async def async_clear(self) -> list[str]:
        """Clear every retained message found, and return the topics cleared.

        An empty payload published with `retain` is how a retained message is
        deleted; there is no other way to remove one.
        """
        try:
            from homeassistant.components import mqtt
        except ImportError:  # pragma: no cover - MQTT ships with HA
            return []

        cleared = sorted(self.found)
        for topic in cleared:
            await mqtt.async_publish(self._hass, topic, "", qos=0, retain=True)
            _LOGGER.info("Cleared the retained message on %s", topic)
        self.found = {}
        return cleared
