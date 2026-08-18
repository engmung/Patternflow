"""The On / Sleep switch."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import PatternflowConfigEntry
from .entity import PatternflowEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PatternflowConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the panel switch."""
    async_add_entities([PatternflowPanelSwitch(entry.runtime_data)])


class PatternflowPanelSwitch(PatternflowEntity, SwitchEntity):
    """Panel on, or asleep.

    "On" is the panel being lit, which is the inverse of the device's `sleep`
    field. Worth stating because it is the one place this integration does not
    mirror the firmware's vocabulary: a switch that is "on" when the lights are
    off would be wrong in every dashboard and every automation.

    Sleep here is not deep sleep — the board stays associated to Wi-Fi the whole
    time, which is the entire point. A panel that could only be woken by walking
    over and pressing a button would make this switch a one-way trip.
    """

    _attr_name = None
    _attr_icon = "mdi:television-ambient-light"

    def __init__(self, coordinator: Any) -> None:
        """Set up the switch."""
        super().__init__(coordinator, "panel")

    @property
    def is_on(self) -> bool:
        """True while the panel is lit."""
        return self.coordinator.is_awake

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Wake the panel."""
        await self.coordinator.async_set_sleep(False)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Put the panel to sleep."""
        await self.coordinator.async_set_sleep(True)
