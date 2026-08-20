"""The Patternflow integration.

One config entry is one device. Everything reads from a single coordinator,
because the device's web server takes one connection at a time — see api.py.
"""

from __future__ import annotations

from homeassistant.const import CONF_HOST, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import PatternflowClient
from .const import CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
from .coordinator import PatternflowConfigEntry, PatternflowCoordinator

PLATFORMS: list[Platform] = [
    Platform.BINARY_SENSOR,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]


async def async_setup_entry(hass: HomeAssistant, entry: PatternflowConfigEntry) -> bool:
    """Set up one device."""
    host = entry.data[CONF_HOST]

    coordinator = PatternflowCoordinator(
        hass,
        entry,
        PatternflowClient(async_get_clientsession(hass), host),
        entry.unique_id or host,
        entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
    )
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_on_options))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PatternflowConfigEntry) -> bool:
    """Tear one device down."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload_on_options(hass: HomeAssistant, entry: PatternflowConfigEntry) -> None:
    """Reload when the poll interval changes — it is set on the coordinator."""
    await hass.config_entries.async_reload(entry.entry_id)
