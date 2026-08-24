"""Diagnostic sensors."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import (
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    EntityCategory,
    UnitOfInformation,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .coordinator import PatternflowConfigEntry, PatternflowCoordinator
from .entity import PatternflowEntity
from .helpers import fps_from_frame_us


@dataclass(frozen=True, kw_only=True)
class PatternflowSensorDescription(SensorEntityDescription):
    """A sensor and how to pull its value out of /api/status."""

    value_fn: Callable[[dict[str, Any]], Any]


SENSORS: tuple[PatternflowSensorDescription, ...] = (
    PatternflowSensorDescription(
        key="rssi",
        translation_key="rssi",
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda status: status.get("rssi") if status.get("wifi") else None,
    ),
    # The scarce one. HUB75's DMA buffers live in internal RAM too, and below
    # roughly 10 KB free the device starts serving pages with headers and no
    # body while everything else still looks healthy — so this is the number
    # that explains an unwell device, and worth graphing before it is needed.
    PatternflowSensorDescription(
        key="heap_internal",
        translation_key="heap_internal",
        device_class=SensorDeviceClass.DATA_SIZE,
        native_unit_of_measurement=UnitOfInformation.BYTES,
        suggested_unit_of_measurement=UnitOfInformation.KIBIBYTES,
        suggested_display_precision=1,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda status: status.get("heapInternal"),
    ),
    PatternflowSensorDescription(
        key="storage_free",
        translation_key="storage_free",
        device_class=SensorDeviceClass.DATA_SIZE,
        native_unit_of_measurement=UnitOfInformation.BYTES,
        suggested_unit_of_measurement=UnitOfInformation.MEBIBYTES,
        suggested_display_precision=1,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda status: (
            status["fsTotal"] - status["fsUsed"]
            if status.get("fsMounted")
            and isinstance(status.get("fsTotal"), int)
            and isinstance(status.get("fsUsed"), int)
            else None
        ),
    ),
    # None while asleep, and that is correct rather than missing: the loop
    # returns early without rendering, so there is no frame rate to report.
    PatternflowSensorDescription(
        key="fps",
        translation_key="fps",
        native_unit_of_measurement="fps",
        suggested_display_precision=0,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda status: (
            None if status.get("sleep") else fps_from_frame_us(status.get("frameUs"))
        ),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PatternflowConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the diagnostic sensors."""
    coordinator = entry.runtime_data
    entities: list[SensorEntity] = [
        PatternflowSensor(coordinator, description) for description in SENSORS
    ]
    entities.append(PatternflowUptimeSensor(coordinator))
    async_add_entities(entities)


class PatternflowSensor(PatternflowEntity, SensorEntity):
    """One value read straight out of /api/status."""

    entity_description: PatternflowSensorDescription

    def __init__(
        self,
        coordinator: PatternflowCoordinator,
        description: PatternflowSensorDescription,
    ) -> None:
        """Set up one sensor."""
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        """The current value, or None when the device cannot answer for it."""
        return self.entity_description.value_fn(self.coordinator.data.status)


class PatternflowUptimeSensor(PatternflowEntity, SensorEntity):
    """When the device last booted.

    Reported as the boot timestamp rather than a rising seconds count, so the
    state only changes when the device actually restarts instead of on every
    poll. The device sends whole seconds and Home Assistant's clock is its own,
    so the computed instant wanders by a second or two between polls — small
    drift is absorbed rather than written, or this would be a database row every
    ten seconds forever.
    """

    _attr_translation_key = "last_boot"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default = False

    #: Recompute only when the boot instant has moved more than this. A real
    #: reboot moves it by the whole previous uptime, so nothing is missed.
    _TOLERANCE = timedelta(seconds=60)

    def __init__(self, coordinator: PatternflowCoordinator) -> None:
        """Set up the uptime sensor."""
        super().__init__(coordinator, "last_boot")
        self._boot: datetime | None = None

    @property
    def native_value(self) -> datetime | None:
        """The boot instant."""
        uptime = self.coordinator.data.status.get("uptime")
        if not isinstance(uptime, (int, float)):
            return self._boot

        computed = dt_util.utcnow() - timedelta(seconds=uptime)
        if self._boot is None or abs(computed - self._boot) > self._TOLERANCE:
            self._boot = computed
        return self._boot

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """The raw uptime, for anyone who wants the number rather than the date."""
        return {"uptime_seconds": self.coordinator.data.status.get("uptime")}
