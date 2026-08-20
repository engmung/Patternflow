"""Polling coordinator for one Patternflow device.

The whole integration shares one of these, because the device can only answer
one request at a time. Endpoints are polled at different rates rather than all
of them every tick: state changes constantly, the pattern list changes when
somebody installs something, and a module's metadata never changes at all.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    PatternflowClient,
    PatternflowConnectionError,
    PatternflowError,
    PatternflowNotFound,
)
from .const import (
    DOMAIN,
    MANUFACTURER,
    OPTIMISTIC_WINDOW,
    PATTERNS_EVERY_N_TICKS,
)
from .helpers import active_option, active_slug, build_pattern_options, knob_labels
from .knobs import (
    KnobWriter,
    is_writable,
    param_to_percent,
    percent_delta_to_detents,
    unavailable_reason,
)

_LOGGER = logging.getLogger(__name__)

PatternflowConfigEntry = ConfigEntry["PatternflowCoordinator"]


@dataclass(slots=True)
class PatternflowData:
    """One poll's worth of device state."""

    status: dict[str, Any]
    patterns: dict[str, Any]
    #: None on a build with MQTT compiled out. That costs the knob readings.
    mqtt: dict[str, Any] | None = None
    #: Select options and their reverse map, rebuilt whenever the list is.
    options: list[str] = field(default_factory=list)
    options_to_index: dict[str, int] = field(default_factory=dict)


class PatternflowCoordinator(DataUpdateCoordinator[PatternflowData]):
    """Polls one device and holds what everything else reads."""

    config_entry: PatternflowConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: PatternflowConfigEntry,
        client: PatternflowClient,
        unique_id: str,
        scan_interval: int,
    ) -> None:
        """Set up the coordinator for one device."""
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} {client.host}",
            update_interval=timedelta(seconds=scan_interval),
            config_entry=entry,
        )
        self.client = client
        self.unique_id = unique_id

        self._tick = 0
        self._patterns: dict[str, Any] | None = None
        # Sidecars keyed by slug. A slug's metadata cannot change without the
        # file being replaced, and replacing it renumbers the list — which
        # forces a re-read anyway. So this is cached for the life of the entry.
        self._sidecars: dict[str, dict[str, Any] | None] = {}
        # MQTT compiled out is a permanent property of the build, not a
        # transient failure. Asking again every ten seconds would be noise.
        self._mqtt_available = True

        self._sleep_override: bool | None = None
        self._sleep_override_until = 0.0

        self.knob_writer = KnobWriter(hass)
        # What we believe each knob is at, as a percentage of its range.
        #
        # For an absolute-ready pattern this is only used until the device
        # confirms the hold; after that `params[]` is the truth. For a
        # delta-driven one it is the ONLY value there is — the device's knob
        # counts are the physical encoder and never reflect an injected turn —
        # so it is a belief, not a reading. Starts at the middle, which is where
        # the firmware's own parameter bus and the web previews both start.
        self._knob_percent: list[float] = [50.0, 50.0, 50.0, 50.0]
        self._knob_override_until: list[float] = [0.0, 0.0, 0.0, 0.0]
        self._last_active_slug: str | None = None

    # ── Polling ──────────────────────────────────────────────────────────

    async def _async_update_data(self) -> PatternflowData:
        """Fetch one tick. Strictly sequential — the device allows one client."""
        try:
            status = await self.client.get_status()

            mqtt = None
            if self._mqtt_available:
                try:
                    mqtt = await self.client.get_mqtt()
                except PatternflowNotFound:
                    _LOGGER.debug(
                        "%s has no /api/mqtt — built with PF_MQTT_ENABLED 0. "
                        "Knob positions are not readable on this device",
                        self.client.host,
                    )
                    self._mqtt_available = False

            if self._patterns is None or self._tick % PATTERNS_EVERY_N_TICKS == 0:
                self._patterns = await self.client.get_patterns()

        except PatternflowConnectionError as err:
            raise UpdateFailed(str(err)) from err

        self._tick += 1
        self.knob_writer.note_connection(mqtt)

        patterns = self._patterns or {"patterns": [], "active": -1}
        entries = patterns.get("patterns")
        entries = entries if isinstance(entries, list) else []
        options, options_to_index = build_pattern_options(entries)

        active = patterns.get("active")
        slug = active_slug(entries, active if isinstance(active, int) else None)

        # A new pattern has its own parameters at its own defaults, so whatever
        # we believed about the old one's knobs is now wrong. The device's
        # absolute holds survive a pattern change; our guesses must not.
        if slug != self._last_active_slug:
            self._last_active_slug = slug
            self._knob_percent = [50.0, 50.0, 50.0, 50.0]
            self._knob_override_until = [0.0, 0.0, 0.0, 0.0]

        # One extra request, once per slug, and only for the pattern actually
        # running — this is what carries the knob labels and `absoluteReady`.
        if slug and slug not in self._sidecars:
            await self.async_fetch_sidecar(slug)

        return PatternflowData(
            status=status,
            patterns=patterns,
            mqtt=mqtt,
            options=options,
            options_to_index=options_to_index,
        )

    async def async_refresh_patterns(self) -> None:
        """Drop the cached pattern list so the next poll re-reads it."""
        self._patterns = None
        await self.async_request_refresh()

    # ── Reading ──────────────────────────────────────────────────────────

    @property
    def device_info(self) -> DeviceInfo:
        """How this device shows up in the registry."""
        status = self.data.status if self.data else {}
        return DeviceInfo(
            identifiers={(DOMAIN, self.unique_id)},
            manufacturer=MANUFACTURER,
            name="Patternflow",
            model=status.get("panel") or None,
            sw_version=status.get("version") or None,
            # The root of the console, not /status. Both pause the running
            # pattern to free DRAM — which is right when a person opens the
            # console on purpose, and is why nothing here ever polls a page.
            configuration_url=f"http://{self.client.host}/",
        )

    @property
    def is_awake(self) -> bool:
        """True when the panel is on.

        Honours a recent local change first: POST /api/sleep only queues the
        transition, so for a moment after switching, the device still reports
        the old state and the switch would visibly snap back.
        """
        if self._sleep_override is not None:
            if time.monotonic() < self._sleep_override_until:
                return not self._sleep_override
            self._sleep_override = None
        return not bool(self.data.status.get("sleep", False))

    @property
    def current_option(self) -> str | None:
        """The running pattern's option label, if a pattern is loaded."""
        entries = self.data.patterns.get("patterns")
        entries = entries if isinstance(entries, list) else []
        active = self.data.patterns.get("active")
        return active_option(
            self.data.options, entries, active if isinstance(active, int) else None
        )

    def sidecar(self, slug: str) -> dict[str, Any] | None:
        """Return a module's cached sidecar, or None if it is not fetched yet."""
        return self._sidecars.get(slug)

    async def async_fetch_sidecar(self, slug: str) -> dict[str, Any] | None:
        """Fetch and cache one module's sidecar. None when it has none."""
        if slug in self._sidecars:
            return self._sidecars[slug]
        try:
            sidecar = await self.client.get_sidecar(slug)
        except PatternflowNotFound:
            sidecar = None
        except PatternflowError as err:
            # Not cached: a transient failure should not become a permanent
            # "this pattern has no labels".
            _LOGGER.debug("Could not read the sidecar for %s: %s", slug, err)
            return None
        self._sidecars[slug] = sidecar
        return sidecar

    # ── Knobs ────────────────────────────────────────────────────────────

    @property
    def knobs_readable(self) -> bool:
        """True when the device reports knob state at all.

        False only on a build with `PF_MQTT_ENABLED 0`, where `/api/mqtt` does
        not exist. Note this has nothing to do with having a broker: the
        firmware fills that state from the input frame before it looks at its
        MQTT role, so positions are readable with MQTT switched off entirely.
        """
        return self.data.mqtt is not None

    @property
    def knobs_writable(self) -> bool:
        """True when a knob write would actually reach the device."""
        return is_writable(self.data.mqtt)

    @property
    def knob_block_reason(self) -> str | None:
        """Why knob writes would not land, or None when they would."""
        return unavailable_reason(self.data.mqtt)

    @property
    def mqtt_prefix(self) -> str:
        """The device's MQTT topic prefix, read from the device itself."""
        prefix = (self.data.mqtt or {}).get("prefix")
        return str(prefix) if prefix else "patternflow"

    @property
    def active_slug(self) -> str | None:
        """The running pattern's module slug, or None for a preset."""
        return self._last_active_slug

    @property
    def active_sidecar(self) -> dict[str, Any] | None:
        """The running pattern's sidecar, if it is a module and we have it."""
        return self._sidecars.get(self._last_active_slug) if self._last_active_slug else None

    @property
    def absolute_ready(self) -> bool:
        """Whether the running pattern can be pinned to absolute values.

        False for a preset, always — `ABSOLUTE_READY` is a C++ constant on the
        pattern entry and no endpoint exposes it. Assuming False costs a
        closed loop on one pattern; assuming True would send set-points into a
        pattern that ignores them, which looks like the integration is broken.
        """
        return bool((self.active_sidecar or {}).get("absoluteReady"))

    @property
    def knob_labels(self) -> list[str]:
        """The running pattern's four knob labels, in logical order."""
        return knob_labels(self.active_sidecar)

    def knob_percent(self, index: int) -> float | None:
        """Return what knob `index` is at, as a percentage of its range."""
        if time.monotonic() < self._knob_override_until[index]:
            return self._knob_percent[index]

        mqtt = self.data.mqtt or {}
        held = mqtt.get("paramActive")
        if isinstance(held, list) and index < len(held) and held[index]:
            params = mqtt.get("params")
            if isinstance(params, list) and index < len(params):
                confirmed = param_to_percent(params[index])
                if confirmed is not None:
                    self._knob_percent[index] = confirmed
                    return confirmed

        return self._knob_percent[index]

    def knob_clicks(self, index: int) -> int | None:
        """Return the raw physical encoder count for knob `index`.

        This is what the encoder has been turned, and only that: an injected
        remote turn is merged into the frame's deltas after this counter is
        read, so it never appears here.
        """
        knobs = (self.data.mqtt or {}).get("knobs")
        if isinstance(knobs, list) and index < len(knobs) and isinstance(knobs[index], int):
            return knobs[index]
        return None

    async def async_set_knob(self, index: int, percent: float) -> None:
        """Move knob `index` to a percentage of its range.

        Absolute where the pattern supports it, a relative nudge where it does
        not — see knobs.py for why those are genuinely different things rather
        than two spellings of the same one.
        """
        prefix = self.mqtt_prefix

        if self.absolute_ready:
            await self.knob_writer.async_set_absolute(prefix, index, percent)
        else:
            detents = percent_delta_to_detents(self._knob_percent[index], percent)
            await self.knob_writer.async_nudge(prefix, index, detents, self.knob_clicks(index) or 0)

        self._knob_percent[index] = percent
        self._knob_override_until[index] = time.monotonic() + OPTIMISTIC_WINDOW
        await self.async_request_refresh()

    async def async_set_role(self, role: str) -> None:
        """Change the device's MQTT role, then re-read what it says it is."""
        await self.client.set_mqtt_role(role)
        await self.async_request_refresh()

    # ── Writing ──────────────────────────────────────────────────────────

    async def async_set_sleep(self, sleep: bool) -> None:
        """Sleep or wake the panel, and hold that locally until it lands."""
        await self.client.set_sleep(sleep)
        self._sleep_override = sleep
        self._sleep_override_until = time.monotonic() + OPTIMISTIC_WINDOW
        await self.async_request_refresh()

    async def async_select_option(self, option: str) -> None:
        """Switch to the pattern behind this option label."""
        index = self.data.options_to_index.get(option)
        if index is None:
            raise PatternflowError(f"{option} is not on this device")
        await self.client.select_pattern(index)
        # The list itself does not change, but `active` does, and it is only
        # re-read on the staggered tick — so ask for it now.
        await self.async_refresh_patterns()
