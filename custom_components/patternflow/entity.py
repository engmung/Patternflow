"""Shared base for every Patternflow entity."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .coordinator import PatternflowCoordinator


class PatternflowEntity(CoordinatorEntity[PatternflowCoordinator]):
    """Ties an entity to one device and one coordinator."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: PatternflowCoordinator, key: str) -> None:
        """Bind to the coordinator and claim a unique id under the device."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.unique_id}_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        """Read through, so a firmware update shows up without a reload."""
        return self.coordinator.device_info
