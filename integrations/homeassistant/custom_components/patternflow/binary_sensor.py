"""Diagnostic binary sensors."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import PatternflowConfigEntry, PatternflowCoordinator
from .entity import PatternflowEntity


@dataclass(frozen=True, kw_only=True)
class PatternflowBinarySensorDescription(BinarySensorEntityDescription):
    """A flag and how to read it out of /api/status."""

    value_fn: Callable[[dict[str, Any]], bool | None]


BINARY_SENSORS: tuple[PatternflowBinarySensorDescription, ...] = (
    # On while somebody has the device's own web console open. The pattern is
    # evicted from RAM for as long as that lasts — a console page and a resident
    # module cannot both have the internal DRAM they need — so a panel showing
    # CONSOLE PAUSED is explained here rather than looking like a fault.
    PatternflowBinarySensorDescription(
        key="console_paused",
        translation_key="console_paused",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda status: status.get("consolePaused"),
    ),
    PatternflowBinarySensorDescription(
        key="mqtt_connected",
        translation_key="mqtt_connected",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda status: status.get("mqttConnected"),
    ),
    # Off means the FATFS volume did not mount, which means presets only — the
    # device still lights up (Origin is compiled in precisely so that it can)
    # but every uploaded pattern is missing and no upload will stick.
    PatternflowBinarySensorDescription(
        key="storage_mounted",
        translation_key="storage_mounted",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda status: status.get("fsMounted"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PatternflowConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the diagnostic binary sensors."""
    async_add_entities(
        PatternflowBinarySensor(entry.runtime_data, description) for description in BINARY_SENSORS
    )


class PatternflowBinarySensor(PatternflowEntity, BinarySensorEntity):
    """One flag from /api/status."""

    entity_description: PatternflowBinarySensorDescription

    def __init__(
        self,
        coordinator: PatternflowCoordinator,
        description: PatternflowBinarySensorDescription,
    ) -> None:
        """Set up one binary sensor."""
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def is_on(self) -> bool | None:
        """The current value."""
        value = self.entity_description.value_fn(self.coordinator.data.status)
        return None if value is None else bool(value)
