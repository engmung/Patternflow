"""Diagnostics dump for a Patternflow config entry."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from .coordinator import PatternflowConfigEntry

# The device never returns a password — /api/mqtt reports only whether one is
# set. The broker host, username and the Wi-Fi SSID are still somebody's
# network, and a diagnostics dump ends up attached to a public issue.
TO_REDACT = {"host", "normalHost", "directorHost", "user", "normalUser", "ssid", "ip"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: PatternflowConfigEntry
) -> dict[str, Any]:
    """Return what the device last told us, minus the network details."""
    coordinator = entry.runtime_data
    data = asdict(coordinator.data) if coordinator.data else {}

    return {
        "entry": async_redact_data(dict(entry.data), TO_REDACT),
        "options": dict(entry.options),
        "data": async_redact_data(data, TO_REDACT),
    }
