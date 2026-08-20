"""The Patternflow integration.

One config entry is one device. Everything reads from a single coordinator,
because the device's web server takes one connection at a time — see api.py.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.const import CONF_HOST, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import PatternflowClient
from .const import CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN, STATIC_URL
from .coordinator import PatternflowConfigEntry, PatternflowCoordinator

_LOGGER = logging.getLogger(__name__)

#: Guards the one-time static path registration, keyed in hass.data.
_STATIC_REGISTERED = f"{DOMAIN}_static"

PLATFORMS: list[Platform] = [
    Platform.BINARY_SENSOR,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]


async def _async_register_static_files(hass: HomeAssistant) -> None:
    """Serve the dashboard card and the pattern runtime from this integration.

    Both files are shipped in `www/` rather than fetched from anywhere: the
    card is the built bundle, and `pattern-sandbox.html` is the runtime that
    draws the pattern preview. Serving them here means a dashboard needs no
    internet, no CDN and no external origin — and the sandbox iframe is loaded
    with `allow-scripts` but not `allow-same-origin`, so community pattern code
    runs in an opaque origin that cannot reach Home Assistant.

    Registered once per Home Assistant run, not once per device.
    """
    if hass.data.get(_STATIC_REGISTERED):
        return
    hass.data[_STATIC_REGISTERED] = True

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                STATIC_URL,
                str(Path(__file__).parent / "www"),
                # No long-lived cache headers, deliberately.
                #
                # The URL never changes, so a browser told to cache this for a
                # year has no way to find out the integration was updated —
                # which turned "install the new version" into "and now go and
                # clear your browser's cache", on every device, including a
                # phone app where that is genuinely awkward.
                #
                # Off, aiohttp still sends Last-Modified and ETag, so an
                # unchanged file costs a conditional request answered with 304.
                # Over a LAN that is nothing, and an updated card simply
                # appears on the next reload.
                cache_headers=False,
            )
        ]
    )
    _LOGGER.debug("Serving the Patternflow card from %s", STATIC_URL)


async def async_setup_entry(hass: HomeAssistant, entry: PatternflowConfigEntry) -> bool:
    """Set up one device."""
    await _async_register_static_files(hass)

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
