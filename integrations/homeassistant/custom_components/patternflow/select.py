"""Pattern selection."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import PatternflowError
from .coordinator import PatternflowConfigEntry, PatternflowCoordinator
from .entity import PatternflowEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PatternflowConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the pattern select."""
    async_add_entities([PatternflowPatternSelect(entry.runtime_data)])


class PatternflowPatternSelect(PatternflowEntity, SelectEntity):
    """The installed patterns, and which one is running.

    Options are display names, not slugs or indices — that is what is written on
    the device's own screen and on the community site. Indices are not stable
    (installing one `.pfm` renumbers the list) and slugs are not what anyone
    calls a pattern, so the label is the name and the mapping is rebuilt from
    every poll of the list.
    """

    _attr_translation_key = "pattern"
    _attr_icon = "mdi:animation-play"

    def __init__(self, coordinator: PatternflowCoordinator) -> None:
        """Set up the select."""
        super().__init__(coordinator, "pattern")

    @property
    def options(self) -> list[str]:
        """Every installed pattern, presets first."""
        return self.coordinator.data.options

    @property
    def current_option(self) -> str | None:
        """The running pattern, or None while nothing is loaded.

        None is a real state, not a gap: `active` is -1 while a module is being
        reloaded and after a load that failed.
        """
        return self.coordinator.current_option

    async def async_select_option(self, option: str) -> None:
        """Switch the device to this pattern."""
        try:
            await self.coordinator.async_select_option(option)
        except PatternflowError as err:
            raise ServiceValidationError(str(err)) from err
