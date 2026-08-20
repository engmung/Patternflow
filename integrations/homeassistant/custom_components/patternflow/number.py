"""The four knobs."""

from __future__ import annotations

from typing import Any

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import PERCENTAGE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import PatternflowConfigEntry, PatternflowCoordinator
from .entity import PatternflowEntity
from .knobs import KnobWriteUnavailable

KNOB_COUNT = 4


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PatternflowConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the knobs, if this build reports them at all."""
    coordinator = entry.runtime_data

    # A device built with PF_MQTT_ENABLED 0 has no /api/mqtt, and then there is
    # no knob state to read and no way to write one either. Creating four
    # permanently-unknown entities would be worse than not creating them.
    if not coordinator.knobs_readable:
        return

    async_add_entities(PatternflowKnob(coordinator, index) for index in range(KNOB_COUNT))


class PatternflowKnob(PatternflowEntity, NumberEntity):
    """One encoder, as a percentage of whatever the pattern maps it to.

    A percentage rather than the parameter's own units because the units are
    the pattern's business and change with every pattern — hue in degrees,
    speed as a multiplier, mode as an index. The device's absolute parameter
    bus is itself a 0..1000 fraction of a declared range, so a percentage is
    the native thing here, not a simplification.

    Two behaviours hide behind the one slider, and the `absolute` attribute
    says which is in effect:

    `absolute: true` — the pattern was built against the absolute parameter
    helpers. The value is a set-point the device holds and reports back, and a
    physical turn of the encoder takes it back.

    `absolute: false` — a pattern from before that bus existed, or any preset.
    The slider is then a *relative* control: moving it sends detents, the
    pattern integrates them through its own step constant, and nothing reads
    back. The number shown is what Home Assistant believes, not what the device
    confirms.
    """

    _attr_native_min_value = 0
    _attr_native_max_value = 100
    _attr_native_step = 1
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_mode = NumberMode.SLIDER

    def __init__(self, coordinator: PatternflowCoordinator, index: int) -> None:
        """Set up one knob."""
        super().__init__(coordinator, f"knob_{index + 1}")
        self._index = index

    @property
    def name(self) -> str:
        """The knob's number and, when the pattern says so, what it does.

        Labels come from the running pattern's sidecar and change with it — the
        same knob is Hue in one pattern and Glitter in the next, which is the
        whole idea of the instrument. The number stays so the entity is still
        findable when the label is missing (presets keep theirs in C++, where
        no endpoint can reach them).
        """
        label = self.coordinator.knob_labels[self._index]
        return f"K{self._index + 1} {label}" if label != f"K{self._index + 1}" else label

    @property
    def native_value(self) -> float | None:
        """Where this knob is, as far as anything can tell."""
        return self.coordinator.knob_percent(self._index)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """What kind of control this currently is, and the raw encoder count.

        `knob` is the encoder number, 1 to 4. It is here because a dashboard
        card has to put the four in the right order and an entity id is not
        dependable for that — anyone can rename one.
        """
        return {
            "knob": self._index + 1,
            "absolute": self.coordinator.absolute_ready,
            "held": self._is_held,
            "encoder_clicks": self.coordinator.knob_clicks(self._index),
        }

    @property
    def _is_held(self) -> bool:
        """Whether the device is currently pinning this knob to a value."""
        held = (self.coordinator.data.mqtt or {}).get("paramActive")
        return bool(isinstance(held, list) and self._index < len(held) and held[self._index])

    async def async_set_native_value(self, value: float) -> None:
        """Turn the knob."""
        if not self.coordinator.knobs_writable:
            raise ServiceValidationError(
                translation_domain=self.coordinator.config_entry.domain,
                translation_key=self.coordinator.knob_block_reason or "knob_write_failed",
            )

        try:
            await self.coordinator.async_set_knob(self._index, value)
        except KnobWriteUnavailable as err:
            raise ServiceValidationError(
                translation_domain=self.coordinator.config_entry.domain,
                translation_key=str(err),
            ) from err
