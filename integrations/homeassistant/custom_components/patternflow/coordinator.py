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
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    PatternflowClient,
    PatternflowConnectionError,
    PatternflowError,
    PatternflowNotFound,
)
from .const import (
    DETENTS_PER_RANGE,
    DOMAIN,
    KNOB_CONFIRM_INTERVALS,
    KNOB_CONFIRM_TOLERANCE,
    MANUFACTURER,
    OPTIMISTIC_WINDOW,
    PATTERNS_EVERY_N_TICKS,
    RETAINED_ISSUE,
    SELECT_CONFIRM_INTERVALS,
)
from .helpers import active_option, active_slug, build_pattern_options, knob_labels
from .knobs import (
    KnobWriter,
    detents_with_residual,
    fights_snapshot,
    is_writable,
    param_to_percent,
    unavailable_reason,
)
from .retained import RetainedWatcher
from .retained import issue_id as retained_issue_id

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
        self._mqtt: dict[str, Any] | None = None
        # True while somebody has the device's own web console open. Polling is
        # cut back to /api/status then — see _async_update_data.
        self._console_paused = False
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
        # The value last written on the absolute path, held until the device
        # reports it back. None once settled.
        self._knob_target: list[float | None] = [None, None, None, None]
        self._knob_deadline: list[float] = [0.0, 0.0, 0.0, 0.0]
        # Sub-detent remainder on the delta path, so small moves accumulate
        # instead of rounding to nothing. See knobs.detents_with_residual.
        self._knob_residual: list[float] = [0.0, 0.0, 0.0, 0.0]
        # Last seen physical encoder counts, for following a hand on the knobs.
        # See _apply_physical_turns.
        self._knob_clicks: list[int | None] = [None, None, None, None]
        self._last_active_slug: str | None = None
        self._scan_interval = scan_interval

        # The pattern index last asked for, held until the device reports it as
        # active. See async_select_option.
        self._pending_select: int | None = None
        self._pending_select_until = 0.0

        # Watches the panel's own command topics for retained messages, which
        # are standing orders it re-obeys on every reconnect. See retained.py.
        self.retained = RetainedWatcher(hass)

    # ── Polling ──────────────────────────────────────────────────────────

    async def _async_update_data(self) -> PatternflowData:
        """Fetch one tick. Strictly sequential — the device allows one client."""
        try:
            status = await self.client.get_status()

            # Back off to this one endpoint while the device's own console has
            # the pattern paused.
            #
            # Opening a console page evicts the running module to free internal
            # DRAM, and the firmware gives the pattern back after 25 s of
            # console idle. "Idle" is the catch: `noteConsoleApiCall()` refreshes
            # that timer, and /api/mqtt, /api/patterns and /api/patterns/file all
            # call it. Polling those every ten seconds through a console session
            # keeps the timer alive forever, and the panel never comes back —
            # the pause outlives the browser tab that caused it, which looks
            # exactly like a hung device.
            #
            # /api/status is the only endpoint that does not touch the timer, so
            # while a console is open it is the only one we ask. Nothing is lost:
            # the pattern is not running, so its knobs are not moving either.
            if status.get("consolePaused"):
                if not self._console_paused:
                    self._console_paused = True
                    _LOGGER.debug(
                        "%s has a console open — polling status only until it closes",
                        self.client.host,
                    )
            else:
                self._console_paused = False

                if self._mqtt_available:
                    try:
                        self._mqtt = await self.client.get_mqtt()
                    except PatternflowNotFound:
                        _LOGGER.debug(
                            "%s has no /api/mqtt — built with PF_MQTT_ENABLED 0. "
                            "Knob positions are not readable on this device",
                            self.client.host,
                        )
                        self._mqtt_available = False
                        self._mqtt = None

                if (
                    self._patterns is None
                    or self._pending_select is not None
                    or self._tick % PATTERNS_EVERY_N_TICKS == 0
                ):
                    self._patterns = await self.client.get_patterns()

        except PatternflowConnectionError as err:
            raise UpdateFailed(str(err)) from err

        self._tick += 1
        # Last known values while paused, rather than None: the entities should
        # keep showing what the panel was doing, not go unavailable because
        # somebody opened its web page.
        mqtt = self._mqtt
        self.knob_writer.note_connection(mqtt)
        self._apply_physical_turns(mqtt)

        patterns = self._patterns or {"patterns": [], "active": -1}
        entries = patterns.get("patterns")
        entries = entries if isinstance(entries, list) else []
        options, options_to_index = build_pattern_options(entries)

        active = patterns.get("active")
        if self._pending_select is not None and (
            active == self._pending_select or time.monotonic() >= self._pending_select_until
        ):
            self._pending_select = None

        slug = active_slug(entries, active if isinstance(active, int) else None)

        # A new pattern has its own parameters at its own defaults, so whatever
        # we believed about the old one's knobs is now wrong. The device's
        # absolute holds survive a pattern change; our guesses must not.
        if slug != self._last_active_slug:
            self._last_active_slug = slug
            self._knob_percent = [50.0, 50.0, 50.0, 50.0]
            self._knob_target = [None, None, None, None]
            self._knob_residual = [0.0, 0.0, 0.0, 0.0]

        # One extra request, once per slug, and only for the pattern actually
        # running — this is what carries the knob labels and `absoluteReady`.
        # /api/patterns/file refreshes the console idle timer too, so it waits
        # along with everything else while a console is open.
        if slug and slug not in self._sidecars and not self._console_paused:
            await self.async_fetch_sidecar(slug)

        await self._async_check_retained(mqtt)

        return PatternflowData(
            status=status,
            patterns=patterns,
            mqtt=mqtt,
            options=options,
            options_to_index=options_to_index,
        )

    def _apply_physical_turns(self, mqtt: dict[str, Any] | None) -> None:
        """Follow the encoders when somebody turns them by hand.

        The device never reports what a pattern's parameters actually are —
        there is no endpoint for "Hue is 0.42". What it does report is the raw
        encoder counter, and that moves *only* under a hand: the firmware
        computes `knobDeltas` from it and adds remote deltas on top afterwards,
        so an injected turn never appears in it.

        A change there is therefore a physical turn, and a detent is a known
        fraction of a parameter's range — 48 of them cross it. Carrying that
        onto the value keeps Home Assistant, and the card's preview, following
        the panel instead of drifting away from it the moment anyone touches
        the real thing.

        Dead reckoning, and honest about it: the *starting* point is still
        unknown, so this tracks changes rather than establishing truth. It
        assumes the conventional step, which is what the repo's own conversion
        toolchain emits. And it clamps rather than wrapping — a value that
        jumped from 0 to 100 because somebody kept turning would be a worse lie
        than one that sits at the end.
        """
        counts = (mqtt or {}).get("knobs")
        held = (mqtt or {}).get("paramActive")
        if not isinstance(counts, list):
            return

        for index in range(min(4, len(counts))):
            count = counts[index]
            if not isinstance(count, int):
                continue

            previous = self._knob_clicks[index]
            self._knob_clicks[index] = count
            if previous is None or count == previous:
                continue

            # A held channel reports its own value, which outranks anything
            # inferred. The firmware releases that hold on physical motion, so
            # this only skips the poll the turn lands on.
            if isinstance(held, list) and index < len(held) and held[index]:
                continue

            moved = (count - previous) * 100 / DETENTS_PER_RANGE
            self._knob_percent[index] = max(0.0, min(100.0, self._knob_percent[index] + moved))
            # Whatever we were waiting to have confirmed is now history: a hand
            # on the encoder wins, and the firmware agrees — it drops the hold.
            self._knob_target[index] = None
            self._knob_residual[index] = 0.0

    async def _async_check_retained(self, mqtt: dict[str, Any] | None) -> None:
        """Keep the retained-message watch pointed at the right prefix, and warn.

        The prefix is read off the device, so it follows a channel change
        without anyone having to tell us. The warning only goes up when the
        panel is in the role that obeys these topics — a retained command on a
        Publisher's prefix is real and inert, and raising it would be noise.
        """
        prefix = str((mqtt or {}).get("prefix") or "")
        if prefix:
            await self.retained.async_watch(prefix)

        issue = retained_issue_id(self.unique_id)
        if self.retained.bites(mqtt):
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                issue,
                is_fixable=True,
                severity=ir.IssueSeverity.WARNING,
                translation_key=RETAINED_ISSUE,
                translation_placeholders={
                    "count": str(len(self.retained.found)),
                    "topics": ", ".join(sorted(self.retained.found)),
                },
                data={"entry_id": self.config_entry.entry_id},
            )
        else:
            ir.async_delete_issue(self.hass, DOMAIN, issue)

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
        """The running pattern's option label, if a pattern is loaded.

        Shows the pattern just asked for while the device is still getting to
        it. Without that the dropdown snaps back to the old pattern for as long
        as the switch takes, which reads as the click not having worked.
        """
        entries = self.data.patterns.get("patterns")
        entries = entries if isinstance(entries, list) else []

        active = self.data.patterns.get("active")
        if self._pending_select is not None:
            active = self._pending_select

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
    def knobs_fight_snapshot(self) -> bool:
        """True when the channel's retained snapshot will undo what we set."""
        return fights_snapshot(self.data.mqtt)

    @property
    def mqtt_channel(self) -> str:
        """The device's MQTT channel preset — broadcast, ch1-4, live, custom."""
        return str((self.data.mqtt or {}).get("channel", ""))

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

    def _device_percent(self, index: int) -> float | None:
        """Return what the device says this knob is held at, if it holds one."""
        mqtt = self.data.mqtt or {}
        held = mqtt.get("paramActive")
        if not (isinstance(held, list) and index < len(held) and held[index]):
            return None
        params = mqtt.get("params")
        if not (isinstance(params, list) and index < len(params)):
            return None
        return param_to_percent(params[index])

    def knob_percent(self, index: int) -> float | None:
        """Return what knob `index` is at, as a percentage of its range.

        A written value is held until the device *reports it back*, not for a
        fixed moment. The difference matters: a poll landing between the write
        and the device applying it carries the previous value, and trusting it
        made the slider snap back to where it had been and then jump forward
        again on the following poll. Waiting for the value to match is the only
        thing that distinguishes "not applied yet" from "somebody turned the
        physical knob".
        """
        target = self._knob_target[index]
        device = self._device_percent(index)

        if target is not None:
            if device is not None and abs(device - target) <= KNOB_CONFIRM_TOLERANCE:
                self._knob_target[index] = None
                self._knob_percent[index] = device
                return device
            if time.monotonic() < self._knob_deadline[index]:
                return target
            # Never confirmed. The write did not land — stop insisting and show
            # whatever the device actually reports.
            self._knob_target[index] = None

        if device is not None:
            self._knob_percent[index] = device
            return device

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
            self._knob_target[index] = percent
            self._knob_deadline[index] = time.monotonic() + (
                self._scan_interval * KNOB_CONFIRM_INTERVALS
            )
        else:
            # Relative, and nothing ever reads back, so there is no target to
            # confirm — only a remainder to carry, or small moves vanish.
            detents, self._knob_residual[index] = detents_with_residual(
                self._knob_percent[index], percent, self._knob_residual[index]
            )
            await self.knob_writer.async_nudge(prefix, index, detents, self.knob_clicks(index) or 0)

        self._knob_percent[index] = percent
        # Deliberately no refresh here. It would read the device back before it
        # has applied the write — exactly the stale value the confirmation logic
        # in knob_percent() exists to ignore — and would spend one of this
        # single-connection server's requests in the middle of a drag.
        self.async_update_listeners()

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
        """Switch to the pattern behind this option label.

        Like sleep, the device only queues this — activating a module reads
        FATFS and runs the relocator, so `loop()` does it. Asking for the list
        again straight away therefore reads back the pattern that is still
        running, and caching *that* was the bug: the answer looked settled, and
        the truth did not arrive until the staggered re-read a minute later.

        So the target is held and the list is re-read every tick until the
        device agrees, the same shape as the knob confirmation.
        """
        index = self.data.options_to_index.get(option)
        if index is None:
            raise PatternflowError(f"{option} is not on this device")

        await self.client.select_pattern(index)
        self._pending_select = index
        self._pending_select_until = time.monotonic() + (
            self._scan_interval * SELECT_CONFIRM_INTERVALS
        )
        self.async_update_listeners()
        await self.async_request_refresh()
